import { randomUUID } from 'node:crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { PoolClient } from 'pg';
import { query, withTransaction } from '../../db.js';
import { consumeRateLimit } from '../../rate-limit.js';
import {
  createSessionToken,
  hashPassword,
  hashSessionToken,
  normalizePhone,
  normalizeUsername,
  usernameReservationKey,
  validatePassword,
  validatePhone,
  validateUsername,
  verifyPassword
} from './security.js';

type Gender = 'boy' | 'girl';

type UserRow = {
  id: string;
  username: string;
  display_name: string;
  phone_e164: string;
  gender: Gender;
  status: 'active' | 'banned' | 'deleted';
  created_at: Date;
};

type UserWithPasswordRow = UserRow & { password_hash: string };

type RegisterBody = {
  username?: string;
  displayName?: string;
  phone?: string;
  gender?: Gender;
  password?: string;
  deviceId?: string;
  platform?: string;
};

type LoginBody = {
  login?: string;
  password?: string;
  deviceId?: string;
  platform?: string;
};

function userDto(user: UserRow) {
  return {
    id: user.id,
    username: user.username,
    displayName: user.display_name,
    phone: user.phone_e164,
    gender: user.gender,
    status: user.status,
    createdAt: user.created_at
  };
}

function bearerToken(request: FastifyRequest): string | null {
  const authorization = request.headers.authorization;
  if (!authorization) return null;
  const [scheme, token] = authorization.split(' ');
  return scheme?.toLowerCase() === 'bearer' && token ? token.trim() : null;
}

function rateLimited(reply: FastifyReply, retryAfterSeconds: number) {
  reply.header('Retry-After', String(retryAfterSeconds));
  return reply.code(429).send({ error: 'RATE_LIMITED', retryAfterSeconds });
}

async function installationIsBlocked(installationId?: string): Promise<boolean> {
  if (!installationId) return false;
  const result = await query<{ installation_id: string }>(
    'SELECT installation_id FROM blocked_installations WHERE installation_id = $1 LIMIT 1',
    [installationId]
  );
  return result.rowCount === 1;
}

async function attachDevice(
  client: PoolClient,
  userId: string,
  installationId?: string,
  platform?: string
) {
  if (!installationId) return;
  await client.query(
    `INSERT INTO user_devices (id, user_id, installation_id, platform)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (user_id, installation_id)
     DO UPDATE SET platform = EXCLUDED.platform, last_seen_at = now()`,
    [randomUUID(), userId, installationId, platform?.slice(0, 24) ?? null]
  );
}

async function createSession(client: PoolClient, userId: string, deviceId?: string) {
  const session = createSessionToken();
  await client.query(
    `INSERT INTO auth_sessions (id, user_id, token_hash, device_id, expires_at)
     VALUES ($1, $2, $3, $4, $5)`,
    [randomUUID(), userId, session.tokenHash, deviceId ?? null, session.expiresAt]
  );
  return session;
}

export async function registerAuthRoutes(app: FastifyInstance, options: { basePath: string }) {
  const prefix = `${options.basePath}/auth`;

  app.post<{ Body: RegisterBody }>(`${prefix}/register`, async (request, reply) => {
    const username = request.body.username?.trim() ?? '';
    const displayName = request.body.displayName?.trim() ?? '';
    const phone = normalizePhone(request.body.phone ?? '');
    const gender = request.body.gender;
    const password = request.body.password ?? '';
    const deviceId = request.body.deviceId?.trim().slice(0, 128) || undefined;
    const platform = request.body.platform?.trim().slice(0, 24) || undefined;

    if (!validateUsername(username)) {
      return reply.code(400).send({ error: 'INVALID_USERNAME' });
    }
    if (displayName.length < 2 || displayName.length > 80) {
      return reply.code(400).send({ error: 'INVALID_DISPLAY_NAME' });
    }
    if (!validatePhone(phone)) {
      return reply.code(400).send({ error: 'INVALID_PHONE' });
    }
    if (gender !== 'boy' && gender !== 'girl') {
      return reply.code(400).send({ error: 'INVALID_GENDER' });
    }
    if (!validatePassword(password)) {
      return reply.code(400).send({ error: 'WEAK_PASSWORD' });
    }

    const registrationLimit = await consumeRateLimit(
      'auth-register',
      deviceId ? `device:${deviceId}` : `ip:${request.ip}`,
      3,
      60 * 60
    );
    if (!registrationLimit.allowed) return rateLimited(reply, registrationLimit.retryAfterSeconds);

    if (await installationIsBlocked(deviceId)) {
      return reply.code(403).send({ error: 'DEVICE_BLOCKED' });
    }

    const usernameNormalized = normalizeUsername(username);
    const reservationKey = usernameReservationKey(username);
    const reserved = await query<{ username_key: string }>(
      'SELECT username_key FROM reserved_usernames WHERE username_key = $1 LIMIT 1',
      [reservationKey]
    );
    if (reserved.rowCount === 1) {
      return reply.code(409).send({ error: 'USERNAME_RESERVED' });
    }

    const passwordHash = await hashPassword(password);

    try {
      const result = await withTransaction(async (client) => {
        const duplicate = await client.query<{ username_normalized: string; phone_e164: string }>(
          `SELECT username_normalized, phone_e164
           FROM users
           WHERE username_normalized = $1 OR phone_e164 = $2
           LIMIT 1`,
          [usernameNormalized, phone]
        );
        if ((duplicate.rowCount ?? 0) > 0) {
          const row = duplicate.rows[0];
          if (row?.username_normalized === usernameNormalized) throw new Error('USERNAME_TAKEN');
          throw new Error('PHONE_TAKEN');
        }

        const userId = randomUUID();
        const inserted = await client.query<UserRow>(
          `INSERT INTO users (id, username, username_normalized, display_name, phone_e164, gender, password_hash)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           RETURNING id, username, display_name, phone_e164, gender, status, created_at`,
          [userId, username, usernameNormalized, displayName, phone, gender, passwordHash]
        );

        await attachDevice(client, userId, deviceId, platform);
        const session = await createSession(client, userId, deviceId);
        return { user: inserted.rows[0]!, session };
      });

      return reply.code(201).send({
        user: userDto(result.user),
        accessToken: result.session.token,
        expiresAt: result.session.expiresAt
      });
    } catch (error) {
      if (error instanceof Error && error.message === 'USERNAME_TAKEN') {
        return reply.code(409).send({ error: 'USERNAME_TAKEN' });
      }
      if (error instanceof Error && error.message === 'PHONE_TAKEN') {
        return reply.code(409).send({ error: 'PHONE_TAKEN' });
      }
      request.log.error({ err: error }, 'registration failed');
      return reply.code(500).send({ error: 'REGISTRATION_FAILED' });
    }
  });

  app.post<{ Body: LoginBody }>(`${prefix}/login`, async (request, reply) => {
    const loginRaw = request.body.login?.trim() ?? '';
    const password = request.body.password ?? '';
    const deviceId = request.body.deviceId?.trim().slice(0, 128) || undefined;
    const platform = request.body.platform?.trim().slice(0, 24) || undefined;

    if (!loginRaw || !password) return reply.code(400).send({ error: 'INVALID_CREDENTIALS' });

    const normalizedUsername = normalizeUsername(loginRaw);
    const normalizedPhone = normalizePhone(loginRaw);
    const loginLimit = await consumeRateLimit(
      'auth-login',
      `${request.ip}:${normalizedUsername || normalizedPhone}`,
      10,
      5 * 60
    );
    if (!loginLimit.allowed) return rateLimited(reply, loginLimit.retryAfterSeconds);

    if (await installationIsBlocked(deviceId)) return reply.code(403).send({ error: 'DEVICE_BLOCKED' });

    const lookup = await query<UserWithPasswordRow>(
      `SELECT id, username, display_name, phone_e164, gender, status, created_at, password_hash
       FROM users
       WHERE username_normalized = $1 OR phone_e164 = $2
       LIMIT 1`,
      [normalizedUsername, normalizedPhone]
    );

    const user = lookup.rows[0];
    if (!user || !(await verifyPassword(password, user.password_hash))) {
      return reply.code(401).send({ error: 'INVALID_CREDENTIALS' });
    }
    if (user.status !== 'active') {
      return reply.code(403).send({ error: 'ACCOUNT_UNAVAILABLE' });
    }

    const session = await withTransaction(async (client) => {
      await attachDevice(client, user.id, deviceId, platform);
      return createSession(client, user.id, deviceId);
    });

    return reply.send({ user: userDto(user), accessToken: session.token, expiresAt: session.expiresAt });
  });

  app.get(`${prefix}/me`, async (request, reply) => {
    const token = bearerToken(request);
    if (!token) return unauthorized(reply);

    const result = await query<UserRow>(
      `SELECT u.id, u.username, u.display_name, u.phone_e164, u.gender, u.status, u.created_at
       FROM auth_sessions s
       JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = $1
         AND s.revoked_at IS NULL
         AND s.expires_at > now()
         AND u.status = 'active'
       LIMIT 1`,
      [hashSessionToken(token)]
    );

    const user = result.rows[0];
    if (!user) return unauthorized(reply);

    void query(
      'UPDATE auth_sessions SET last_seen_at = now() WHERE token_hash = $1',
      [hashSessionToken(token)]
    ).catch((error) => request.log.warn({ err: error }, 'failed to update session last_seen_at'));

    return reply.send({ user: userDto(user) });
  });

  app.post(`${prefix}/logout`, async (request, reply) => {
    const token = bearerToken(request);
    if (!token) return unauthorized(reply);
    await query(
      'UPDATE auth_sessions SET revoked_at = COALESCE(revoked_at, now()) WHERE token_hash = $1',
      [hashSessionToken(token)]
    );
    return reply.code(204).send();
  });
}

function unauthorized(reply: FastifyReply) {
  return reply.code(401).send({ error: 'UNAUTHORIZED' });
}

import { randomUUID } from 'node:crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { PoolClient } from 'pg';
import { query, withTransaction } from '../../db.js';
import { authenticateRequest, type AuthenticatedUser } from '../auth/session.js';
import { normalizeUsername } from '../auth/security.js';
import { createNotification } from '../notifications/service.js';

type SocialUserRow = {
  id: string;
  username: string;
  display_name: string;
  gender: 'boy' | 'girl';
  bio: string | null;
  nearby_enabled: boolean;
  mutual_suggestions_enabled: boolean;
};

type FriendRequestRow = {
  id: string;
  sender_id: string;
  receiver_id: string;
  status: 'pending' | 'accepted' | 'rejected' | 'cancelled';
  created_at: Date;
};

type FriendRequestListRow = FriendRequestRow & {
  sender_username: string;
  sender_display_name: string;
  receiver_username: string;
  receiver_display_name: string;
};

type ProfilePatchBody = {
  displayName?: string;
  bio?: string | null;
  nearbyEnabled?: boolean;
  mutualSuggestionsEnabled?: boolean;
};

type UsernameBody = { username?: string };
type ReportBody = UsernameBody & {
  reason?: 'spam' | 'harassment' | 'impersonation' | 'inappropriate' | 'other';
  details?: string;
};

function unauthorized(reply: FastifyReply) {
  return reply.code(401).send({ error: 'UNAUTHORIZED' });
}

async function requireUser(request: FastifyRequest, reply: FastifyReply) {
  const user = await authenticateRequest(request);
  if (!user) unauthorized(reply);
  return user;
}

function publicProfileDto(user: SocialUserRow) {
  return {
    id: user.id,
    username: user.username,
    displayName: user.display_name,
    gender: user.gender,
    bio: user.bio
  };
}

async function lookupActiveUser(username: string): Promise<SocialUserRow | null> {
  const result = await query<SocialUserRow>(
    `SELECT id, username, display_name, gender, bio, nearby_enabled, mutual_suggestions_enabled
     FROM users
     WHERE username_normalized = $1 AND status = 'active'
     LIMIT 1`,
    [normalizeUsername(username)]
  );
  return result.rows[0] ?? null;
}

async function blockedEitherDirection(userA: string, userB: string): Promise<boolean> {
  const result = await query<{ blocker_id: string }>(
    `SELECT blocker_id
     FROM user_blocks
     WHERE (blocker_id = $1 AND blocked_id = $2)
        OR (blocker_id = $2 AND blocked_id = $1)
     LIMIT 1`,
    [userA, userB]
  );
  return result.rowCount === 1;
}

function orderedFriendIds(userA: string, userB: string): [string, string] {
  return userA < userB ? [userA, userB] : [userB, userA];
}

async function cancelRelationship(client: PoolClient, userA: string, userB: string, usernameA: string, usernameB: string) {
  await client.query(
    `UPDATE friend_requests
     SET status = 'cancelled', updated_at = now()
     WHERE status = 'pending'
       AND ((sender_id = $1 AND receiver_id = $2) OR (sender_id = $2 AND receiver_id = $1))`,
    [userA, userB]
  );
  const [low, high] = orderedFriendIds(userA, userB);
  await client.query('DELETE FROM friendships WHERE user_low_id = $1 AND user_high_id = $2', [low, high]);
  await client.query(
    `DELETE FROM notifications
     WHERE (user_id = $1 AND data->>'username' = $4)
        OR (user_id = $2 AND data->>'username' = $3)`,
    [userA, userB, usernameA, usernameB]
  );
}

function requestDto(row: FriendRequestListRow, viewerId: string) {
  const incoming = row.receiver_id === viewerId;
  return {
    id: row.id,
    direction: incoming ? 'incoming' : 'outgoing',
    status: row.status,
    createdAt: row.created_at,
    user: incoming
      ? { username: row.sender_username, displayName: row.sender_display_name }
      : { username: row.receiver_username, displayName: row.receiver_display_name }
  };
}

export async function registerSocialRoutes(app: FastifyInstance, options: { basePath: string }) {
  const prefix = options.basePath;

  app.get(`${prefix}/profile/me`, async (request, reply) => {
    const auth = await requireUser(request, reply);
    if (!auth) return;

    const result = await query<SocialUserRow & { phone_e164: string }>(
      `SELECT id, username, display_name, phone_e164, gender, bio, nearby_enabled, mutual_suggestions_enabled
       FROM users WHERE id = $1 LIMIT 1`,
      [auth.id]
    );
    const user = result.rows[0]!;
    return reply.send({
      profile: {
        ...publicProfileDto(user),
        phone: user.phone_e164,
        nearbyEnabled: user.nearby_enabled,
        mutualSuggestionsEnabled: user.mutual_suggestions_enabled
      }
    });
  });

  app.patch<{ Body: ProfilePatchBody }>(`${prefix}/profile/me`, async (request, reply) => {
    const auth = await requireUser(request, reply);
    if (!auth) return;

    const displayName = request.body.displayName?.trim();
    const bio = request.body.bio === null ? null : request.body.bio?.trim();
    const nearbyEnabled = request.body.nearbyEnabled;
    const mutualSuggestionsEnabled = request.body.mutualSuggestionsEnabled;

    if (displayName !== undefined && (displayName.length < 2 || displayName.length > 80)) {
      return reply.code(400).send({ error: 'INVALID_DISPLAY_NAME' });
    }
    if (bio !== undefined && bio !== null && bio.length > 240) {
      return reply.code(400).send({ error: 'INVALID_BIO' });
    }
    if (
      nearbyEnabled === undefined &&
      mutualSuggestionsEnabled === undefined &&
      displayName === undefined &&
      bio === undefined
    ) {
      return reply.code(400).send({ error: 'NO_PROFILE_CHANGES' });
    }

    const result = await query<SocialUserRow>(
      `UPDATE users
       SET display_name = COALESCE($2, display_name),
           bio = CASE WHEN $3::boolean THEN $4::varchar ELSE bio END,
           nearby_enabled = COALESCE($5, nearby_enabled),
           mutual_suggestions_enabled = COALESCE($6, mutual_suggestions_enabled),
           updated_at = now()
       WHERE id = $1
       RETURNING id, username, display_name, gender, bio, nearby_enabled, mutual_suggestions_enabled`,
      [
        auth.id,
        displayName ?? null,
        request.body.bio !== undefined,
        bio ?? null,
        nearbyEnabled ?? null,
        mutualSuggestionsEnabled ?? null
      ]
    );
    const user = result.rows[0]!;
    return reply.send({
      profile: {
        ...publicProfileDto(user),
        nearbyEnabled: user.nearby_enabled,
        mutualSuggestionsEnabled: user.mutual_suggestions_enabled
      }
    });
  });

  app.get<{ Params: { username: string } }>(`${prefix}/profiles/:username`, async (request, reply) => {
    const auth = await requireUser(request, reply);
    if (!auth) return;
    const target = await lookupActiveUser(request.params.username);
    if (!target) return reply.code(404).send({ error: 'PROFILE_NOT_FOUND' });
    if (target.id !== auth.id && (await blockedEitherDirection(auth.id, target.id))) {
      return reply.code(404).send({ error: 'PROFILE_NOT_FOUND' });
    }
    return reply.send({ profile: publicProfileDto(target) });
  });

  app.post<{ Body: UsernameBody }>(`${prefix}/friends/requests`, async (request, reply) => {
    const auth = await requireUser(request, reply);
    if (!auth) return;
    const username = request.body.username?.trim() ?? '';
    const target = await lookupActiveUser(username);
    if (!target) return reply.code(404).send({ error: 'USER_NOT_FOUND' });
    if (target.id === auth.id) return reply.code(400).send({ error: 'CANNOT_FRIEND_SELF' });
    if (await blockedEitherDirection(auth.id, target.id)) {
      return reply.code(409).send({ error: 'RELATIONSHIP_BLOCKED' });
    }

    const [low, high] = orderedFriendIds(auth.id, target.id);
    const existingFriendship = await query<{ user_low_id: string }>(
      'SELECT user_low_id FROM friendships WHERE user_low_id = $1 AND user_high_id = $2 LIMIT 1',
      [low, high]
    );
    if (existingFriendship.rowCount === 1) return reply.code(409).send({ error: 'ALREADY_FRIENDS' });

    const existingRequest = await query<FriendRequestRow>(
      `SELECT id, sender_id, receiver_id, status, created_at
       FROM friend_requests
       WHERE status = 'pending'
         AND ((sender_id = $1 AND receiver_id = $2) OR (sender_id = $2 AND receiver_id = $1))
       LIMIT 1`,
      [auth.id, target.id]
    );
    if (existingRequest.rowCount === 1) {
      return reply.code(409).send({ error: 'FRIEND_REQUEST_EXISTS' });
    }

    const result = await query<FriendRequestRow>(
      `INSERT INTO friend_requests (id, sender_id, receiver_id)
       VALUES ($1, $2, $3)
       RETURNING id, sender_id, receiver_id, status, created_at`,
      [randomUUID(), auth.id, target.id]
    );
    await createNotification({
      userId: target.id,
      type: 'friend_request',
      title: 'طلب صداقة جديد',
      body: `${auth.display_name} يبي يضيفك`,
      data: { requestId: result.rows[0]!.id, username: auth.username },
      soundKey: 'friend_request'
    });
    return reply.code(201).send({ request: result.rows[0] });
  });

  app.get(`${prefix}/friends/requests`, async (request, reply) => {
    const auth = await requireUser(request, reply);
    if (!auth) return;
    const result = await query<FriendRequestListRow>(
      `SELECT fr.id, fr.sender_id, fr.receiver_id, fr.status, fr.created_at,
              su.username AS sender_username, su.display_name AS sender_display_name,
              ru.username AS receiver_username, ru.display_name AS receiver_display_name
       FROM friend_requests fr
       JOIN users su ON su.id = fr.sender_id
       JOIN users ru ON ru.id = fr.receiver_id
       WHERE fr.status = 'pending' AND (fr.sender_id = $1 OR fr.receiver_id = $1)
       ORDER BY fr.created_at DESC`,
      [auth.id]
    );
    return reply.send({ requests: result.rows.map((row) => requestDto(row, auth.id)) });
  });

  app.post<{ Params: { requestId: string } }>(`${prefix}/friends/requests/:requestId/accept`, async (request, reply) => {
    const auth = await requireUser(request, reply);
    if (!auth) return;
    try {
      const accepted = await withTransaction(async (client) => {
        const found = await client.query<FriendRequestRow>(
          `SELECT id, sender_id, receiver_id, status, created_at
           FROM friend_requests
           WHERE id = $1 AND receiver_id = $2 AND status = 'pending'
           FOR UPDATE`,
          [request.params.requestId, auth.id]
        );
        const friendRequest = found.rows[0];
        if (!friendRequest) throw new Error('REQUEST_NOT_FOUND');

        const block = await client.query(
          `SELECT 1 FROM user_blocks
           WHERE (blocker_id = $1 AND blocked_id = $2) OR (blocker_id = $2 AND blocked_id = $1)
           LIMIT 1`,
          [friendRequest.sender_id, friendRequest.receiver_id]
        );
        if ((block.rowCount ?? 0) > 0) throw new Error('RELATIONSHIP_BLOCKED');

        const [low, high] = orderedFriendIds(friendRequest.sender_id, friendRequest.receiver_id);
        await client.query(
          `INSERT INTO friendships (user_low_id, user_high_id) VALUES ($1, $2)
           ON CONFLICT DO NOTHING`,
          [low, high]
        );
        await client.query(
          `UPDATE friend_requests SET status = 'accepted', updated_at = now() WHERE id = $1`,
          [friendRequest.id]
        );
        return { senderId: friendRequest.sender_id };
      });
      await createNotification({
        userId: accepted.senderId,
        type: 'friend_accepted',
        title: 'تم قبول الصداقة',
        body: `${auth.display_name} قبل طلب الصداقة`,
        data: { username: auth.username },
        soundKey: 'friend_accepted'
      });
      return reply.send({ ok: true });
    } catch (error) {
      if (error instanceof Error && error.message === 'REQUEST_NOT_FOUND') {
        return reply.code(404).send({ error: 'FRIEND_REQUEST_NOT_FOUND' });
      }
      if (error instanceof Error && error.message === 'RELATIONSHIP_BLOCKED') {
        return reply.code(409).send({ error: 'RELATIONSHIP_BLOCKED' });
      }
      throw error;
    }
  });

  app.post<{ Params: { requestId: string } }>(`${prefix}/friends/requests/:requestId/reject`, async (request, reply) => {
    const auth = await requireUser(request, reply);
    if (!auth) return;
    const result = await query(
      `UPDATE friend_requests SET status = 'rejected', updated_at = now()
       WHERE id = $1 AND receiver_id = $2 AND status = 'pending'`,
      [request.params.requestId, auth.id]
    );
    if ((result.rowCount ?? 0) === 0) return reply.code(404).send({ error: 'FRIEND_REQUEST_NOT_FOUND' });
    return reply.send({ ok: true });
  });

  app.delete<{ Params: { requestId: string } }>(`${prefix}/friends/requests/:requestId`, async (request, reply) => {
    const auth = await requireUser(request, reply);
    if (!auth) return;
    const result = await query(
      `UPDATE friend_requests SET status = 'cancelled', updated_at = now()
       WHERE id = $1 AND sender_id = $2 AND status = 'pending'`,
      [request.params.requestId, auth.id]
    );
    if ((result.rowCount ?? 0) === 0) return reply.code(404).send({ error: 'FRIEND_REQUEST_NOT_FOUND' });
    return reply.code(204).send();
  });

  app.get(`${prefix}/friends`, async (request, reply) => {
    const auth = await requireUser(request, reply);
    if (!auth) return;
    const result = await query<SocialUserRow>(
      `SELECT u.id, u.username, u.display_name, u.gender, u.bio, u.nearby_enabled, u.mutual_suggestions_enabled
       FROM friendships f
       JOIN users u ON u.id = CASE WHEN f.user_low_id = $1 THEN f.user_high_id ELSE f.user_low_id END
       WHERE (f.user_low_id = $1 OR f.user_high_id = $1)
         AND u.status = 'active'
         AND NOT EXISTS (
           SELECT 1 FROM user_blocks b
           WHERE (b.blocker_id = $1 AND b.blocked_id = u.id)
              OR (b.blocker_id = u.id AND b.blocked_id = $1)
         )
       ORDER BY u.display_name, u.username`,
      [auth.id]
    );
    return reply.send({ friends: result.rows.map(publicProfileDto) });
  });

  app.delete<{ Params: { username: string } }>(`${prefix}/friends/:username`, async (request, reply) => {
    const auth = await requireUser(request, reply);
    if (!auth) return;
    const target = await lookupActiveUser(request.params.username);
    if (!target) return reply.code(404).send({ error: 'USER_NOT_FOUND' });
    const [low, high] = orderedFriendIds(auth.id, target.id);
    const result = await query('DELETE FROM friendships WHERE user_low_id = $1 AND user_high_id = $2', [low, high]);
    if ((result.rowCount ?? 0) === 0) return reply.code(404).send({ error: 'FRIENDSHIP_NOT_FOUND' });
    return reply.code(204).send();
  });

  app.post<{ Body: UsernameBody }>(`${prefix}/blocks`, async (request, reply) => {
    const auth = await requireUser(request, reply);
    if (!auth) return;
    const target = await lookupActiveUser(request.body.username?.trim() ?? '');
    if (!target) return reply.code(404).send({ error: 'USER_NOT_FOUND' });
    if (target.id === auth.id) return reply.code(400).send({ error: 'CANNOT_BLOCK_SELF' });

    await withTransaction(async (client) => {
      await client.query(
        `INSERT INTO user_blocks (blocker_id, blocked_id) VALUES ($1, $2)
         ON CONFLICT DO NOTHING`,
        [auth.id, target.id]
      );
      await cancelRelationship(client, auth.id, target.id, auth.username, target.username);
    });
    return reply.code(201).send({ ok: true });
  });

  app.get(`${prefix}/blocks`, async (request, reply) => {
    const auth = await requireUser(request, reply);
    if (!auth) return;
    const result = await query<SocialUserRow>(
      `SELECT u.id, u.username, u.display_name, u.gender, u.bio, u.nearby_enabled, u.mutual_suggestions_enabled
       FROM user_blocks b JOIN users u ON u.id = b.blocked_id
       WHERE b.blocker_id = $1
       ORDER BY b.created_at DESC`,
      [auth.id]
    );
    return reply.send({ blocked: result.rows.map(publicProfileDto) });
  });

  app.delete<{ Params: { username: string } }>(`${prefix}/blocks/:username`, async (request, reply) => {
    const auth = await requireUser(request, reply);
    if (!auth) return;
    const target = await lookupActiveUser(request.params.username);
    if (!target) return reply.code(404).send({ error: 'USER_NOT_FOUND' });
    const result = await query('DELETE FROM user_blocks WHERE blocker_id = $1 AND blocked_id = $2', [auth.id, target.id]);
    if ((result.rowCount ?? 0) === 0) return reply.code(404).send({ error: 'BLOCK_NOT_FOUND' });
    return reply.code(204).send();
  });

  app.post<{ Body: ReportBody }>(`${prefix}/reports`, async (request, reply) => {
    const auth = await requireUser(request, reply);
    if (!auth) return;
    const target = await lookupActiveUser(request.body.username?.trim() ?? '');
    if (!target) return reply.code(404).send({ error: 'USER_NOT_FOUND' });
    if (target.id === auth.id) return reply.code(400).send({ error: 'CANNOT_REPORT_SELF' });

    const allowedReasons = new Set(['spam', 'harassment', 'impersonation', 'inappropriate', 'other']);
    const reason = request.body.reason;
    const details = request.body.details?.trim() || null;
    if (!reason || !allowedReasons.has(reason)) return reply.code(400).send({ error: 'INVALID_REPORT_REASON' });
    if (details && details.length > 500) return reply.code(400).send({ error: 'REPORT_DETAILS_TOO_LONG' });

    const result = await query<{ id: string; created_at: Date }>(
      `INSERT INTO user_reports (id, reporter_id, target_user_id, reason, details)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, created_at`,
      [randomUUID(), auth.id, target.id, reason, details]
    );
    return reply.code(201).send({ report: { id: result.rows[0]!.id, createdAt: result.rows[0]!.created_at } });
  });
}

import type { FastifyRequest } from 'fastify';
import { query } from '../../db.js';
import { hashSessionToken } from './security.js';

export type AuthenticatedUser = {
  id: string;
  username: string;
  display_name: string;
  gender: 'boy' | 'girl';
  status: 'active' | 'banned' | 'deleted';
};

export function bearerToken(request: FastifyRequest): string | null {
  const authorization = request.headers.authorization;
  if (!authorization) return null;
  const [scheme, token] = authorization.split(' ');
  return scheme?.toLowerCase() === 'bearer' && token ? token.trim() : null;
}

export async function authenticateRequest(request: FastifyRequest): Promise<AuthenticatedUser | null> {
  const token = bearerToken(request);
  if (!token) return null;

  const tokenHash = hashSessionToken(token);
  const result = await query<AuthenticatedUser>(
    `SELECT u.id, u.username, u.display_name, u.gender, u.status
     FROM auth_sessions s
     JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = $1
       AND s.revoked_at IS NULL
       AND s.expires_at > now()
       AND u.status = 'active'
     LIMIT 1`,
    [tokenHash]
  );

  const user = result.rows[0] ?? null;
  if (user) {
    void query('UPDATE auth_sessions SET last_seen_at = now() WHERE token_hash = $1', [tokenHash]).catch(
      (error) => request.log.warn({ err: error }, 'failed to update session last_seen_at')
    );
  }

  return user;
}

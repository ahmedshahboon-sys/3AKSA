import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { query } from '../../db.js';
import { authenticateRequest } from '../auth/session.js';

type SuggestionQuery = { limit?: string };

type SuggestionRow = {
  id: string;
  username: string;
  display_name: string;
  gender: 'boy' | 'girl';
  bio: string | null;
  frame_code: string | null;
  badge_code: string | null;
  badge_name: string | null;
  mutual_count: number;
};

async function requireUser(request: FastifyRequest, reply: FastifyReply) {
  const user = await authenticateRequest(request);
  if (!user) reply.code(401).send({ error: 'UNAUTHORIZED' });
  return user;
}

export async function registerSuggestionRoutes(app: FastifyInstance, options: { basePath: string }) {
  app.get<{ Querystring: SuggestionQuery }>(`${options.basePath}/friends/suggestions`, async (request, reply) => {
    const user = await requireUser(request, reply);
    if (!user) return;

    const enabled = await query<{ mutual_suggestions_enabled: boolean }>(
      'SELECT mutual_suggestions_enabled FROM users WHERE id = $1 LIMIT 1',
      [user.id]
    );
    if (!enabled.rows[0]?.mutual_suggestions_enabled) {
      return reply.send({ suggestions: [] });
    }

    const rawLimit = Number(request.query.limit ?? 20);
    const limit = Number.isInteger(rawLimit) ? Math.min(Math.max(rawLimit, 1), 30) : 20;

    const result = await query<SuggestionRow>(
      `WITH viewer_friends AS (
         SELECT CASE WHEN f.user_low_id = $1 THEN f.user_high_id ELSE f.user_low_id END AS friend_id
         FROM friendships f
         WHERE f.user_low_id = $1 OR f.user_high_id = $1
       ),
       friendship_edges AS (
         SELECT f.user_low_id AS candidate_id, f.user_high_id AS friend_id FROM friendships f
         UNION ALL
         SELECT f.user_high_id AS candidate_id, f.user_low_id AS friend_id FROM friendships f
       )
       SELECT u.id,u.username,u.display_name,u.gender,u.bio,
              cosmetics.frame_code,cosmetics.badge_code,cosmetics.badge_name,
              count(DISTINCT vf.friend_id)::int AS mutual_count
       FROM viewer_friends vf
       JOIN friendship_edges edge ON edge.friend_id = vf.friend_id
       JOIN users u ON u.id = edge.candidate_id
       LEFT JOIN user_public_cosmetics cosmetics ON cosmetics.user_id=u.id
       WHERE u.id <> $1
         AND u.status = 'active'
         AND u.mutual_suggestions_enabled = true
         AND NOT EXISTS (
           SELECT 1 FROM friendships existing
           WHERE (existing.user_low_id = LEAST($1::uuid, u.id) AND existing.user_high_id = GREATEST($1::uuid, u.id))
         )
         AND NOT EXISTS (
           SELECT 1 FROM friend_requests fr
           WHERE fr.status = 'pending'
             AND ((fr.sender_id = $1 AND fr.receiver_id = u.id) OR (fr.sender_id = u.id AND fr.receiver_id = $1))
         )
         AND NOT EXISTS (
           SELECT 1 FROM user_blocks b
           WHERE (b.blocker_id = $1 AND b.blocked_id = u.id)
              OR (b.blocker_id = u.id AND b.blocked_id = $1)
         )
       GROUP BY u.id,u.username,u.display_name,u.gender,u.bio,cosmetics.frame_code,cosmetics.badge_code,cosmetics.badge_name
       HAVING count(DISTINCT vf.friend_id) > 0
       ORDER BY mutual_count DESC, u.display_name ASC, u.username ASC
       LIMIT $2`,
      [user.id, limit]
    );

    return reply.send({
      suggestions: result.rows.map((row) => ({
        id: row.id,
        username: row.username,
        displayName: row.display_name,
        gender: row.gender,
        bio: row.bio,
        cosmetics:{frameCode:row.frame_code,badgeCode:row.badge_code,badgeName:row.badge_name},
        mutualCount: row.mutual_count
      }))
    });
  });
}

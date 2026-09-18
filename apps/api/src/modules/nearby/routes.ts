import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { query } from '../../db.js';
import { authenticateRequest } from '../auth/session.js';

type LocationBody = {
  latitude?: number;
  longitude?: number;
  accuracyM?: number | null;
};

type NearbyQuery = {
  gender?: string;
  limit?: string;
  maxDistanceKm?: string;
};

type OwnNearbyRow = {
  nearby_enabled: boolean;
  latitude: number | null;
  longitude: number | null;
  updated_at: Date | null;
};

type NearbyRow = {
  id: string;
  username: string;
  display_name: string;
  gender: 'boy' | 'girl';
  bio: string | null;
  distance_km: number;
};

const LOCATION_FRESH_MS = 30 * 60 * 1000;

async function requireUser(request: FastifyRequest, reply: FastifyReply) {
  const user = await authenticateRequest(request);
  if (!user) reply.code(401).send({ error: 'UNAUTHORIZED' });
  return user;
}

function approximateDistance(distanceKm: number) {
  if (distanceKm < 1) {
    return { distanceKmApprox: 0.5, distanceLabel: 'أقل من 1 كم' };
  }
  if (distanceKm < 5) {
    const rounded = Math.max(1, Math.round(distanceKm));
    return { distanceKmApprox: rounded, distanceLabel: `حوالي ${rounded} كم` };
  }
  if (distanceKm < 25) {
    const rounded = Math.max(5, Math.round(distanceKm / 5) * 5);
    return { distanceKmApprox: rounded, distanceLabel: `حوالي ${rounded} كم` };
  }
  const rounded = Math.max(10, Math.round(distanceKm / 10) * 10);
  return { distanceKmApprox: rounded, distanceLabel: `حوالي ${rounded} كم` };
}

export async function registerNearbyRoutes(app: FastifyInstance, options: { basePath: string }) {
  const prefix = `${options.basePath}/nearby`;

  app.put<{ Body: LocationBody }>(`${prefix}/location`, async (request, reply) => {
    const user = await requireUser(request, reply);
    if (!user) return;

    const latitude = request.body.latitude;
    const longitude = request.body.longitude;
    const accuracyM = request.body.accuracyM ?? null;
    if (
      typeof latitude !== 'number' || !Number.isFinite(latitude) || latitude < -90 || latitude > 90 ||
      typeof longitude !== 'number' || !Number.isFinite(longitude) || longitude < -180 || longitude > 180 ||
      (accuracyM !== null && (!Number.isInteger(accuracyM) || accuracyM < 0 || accuracyM > 50_000))
    ) {
      return reply.code(400).send({ error: 'INVALID_LOCATION' });
    }

    const enabled = await query<{ nearby_enabled: boolean }>(
      'SELECT nearby_enabled FROM users WHERE id = $1 LIMIT 1',
      [user.id]
    );
    if (!enabled.rows[0]?.nearby_enabled) {
      return reply.code(409).send({ error: 'NEARBY_DISABLED' });
    }

    const result = await query<{ updated_at: Date }>(
      `INSERT INTO user_locations (user_id, latitude, longitude, accuracy_m, updated_at)
       VALUES ($1, $2, $3, $4, clock_timestamp())
       ON CONFLICT (user_id) DO UPDATE
       SET latitude = EXCLUDED.latitude,
           longitude = EXCLUDED.longitude,
           accuracy_m = EXCLUDED.accuracy_m,
           updated_at = EXCLUDED.updated_at
       RETURNING updated_at`,
      [user.id, latitude, longitude, accuracyM]
    );

    return reply.send({
      ok: true,
      updatedAt: result.rows[0]!.updated_at
    });
  });

  app.get<{ Querystring: NearbyQuery }>(prefix, async (request, reply) => {
    const user = await requireUser(request, reply);
    if (!user) return;

    const own = await query<OwnNearbyRow>(
      `SELECT u.nearby_enabled, l.latitude, l.longitude, l.updated_at
       FROM users u
       LEFT JOIN user_locations l ON l.user_id = u.id
       WHERE u.id = $1
       LIMIT 1`,
      [user.id]
    );
    const current = own.rows[0];
    if (!current?.nearby_enabled) return reply.code(409).send({ error: 'NEARBY_DISABLED' });
    if (current.latitude === null || current.longitude === null || current.updated_at === null) {
      return reply.code(409).send({ error: 'LOCATION_REQUIRED' });
    }
    if (Date.now() - current.updated_at.getTime() > LOCATION_FRESH_MS) {
      return reply.code(409).send({ error: 'LOCATION_STALE' });
    }

    const gender = request.query.gender?.trim();
    if (gender && gender !== 'boy' && gender !== 'girl') {
      return reply.code(400).send({ error: 'INVALID_GENDER_FILTER' });
    }
    const limitRaw = Number(request.query.limit ?? 30);
    const limit = Number.isInteger(limitRaw) ? Math.min(Math.max(limitRaw, 1), 50) : 30;
    const maxDistanceRaw = Number(request.query.maxDistanceKm ?? 50);
    const maxDistanceKm = Number.isFinite(maxDistanceRaw)
      ? Math.min(Math.max(maxDistanceRaw, 1), 100)
      : 50;

    const result = await query<NearbyRow>(
      `WITH candidates AS (
         SELECT u.id, u.username, u.display_name, u.gender, u.bio,
                6371.0 * 2.0 * asin(
                  sqrt(
                    LEAST(
                      1.0,
                      power(sin(radians(l.latitude - $2) / 2.0), 2) +
                      cos(radians($2)) * cos(radians(l.latitude)) *
                      power(sin(radians(l.longitude - $3) / 2.0), 2)
                    )
                  )
                ) AS distance_km
         FROM users u
         JOIN user_locations l ON l.user_id = u.id
         WHERE u.id <> $1
           AND u.status = 'active'
           AND u.nearby_enabled = true
           AND l.updated_at > now() - interval '30 minutes'
           AND ($4::text IS NULL OR u.gender = $4)
           AND NOT EXISTS (
             SELECT 1 FROM user_blocks b
             WHERE (b.blocker_id = $1 AND b.blocked_id = u.id)
                OR (b.blocker_id = u.id AND b.blocked_id = $1)
           )
       )
       SELECT id, username, display_name, gender, bio, distance_km
       FROM candidates
       WHERE distance_km <= $5
       ORDER BY distance_km ASC, display_name ASC, username ASC
       LIMIT $6`,
      [user.id, current.latitude, current.longitude, gender ?? null, maxDistanceKm, limit]
    );

    return reply.send({
      nearby: result.rows.map((row) => ({
        id: row.id,
        username: row.username,
        displayName: row.display_name,
        gender: row.gender,
        bio: row.bio,
        ...approximateDistance(Number(row.distance_km))
      }))
    });
  });
}

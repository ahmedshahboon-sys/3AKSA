import { randomUUID } from 'node:crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { query, withTransaction } from '../../db.js';
import { authenticateRequest, type AuthenticatedUser } from '../auth/session.js';
import { normalizeUsername } from '../auth/security.js';
import { tvEvents } from '../tv/events.js';
import { roomTvBroadcastState } from '../tv/service.js';
import { roomPresenceCounts, roomPresenceSnapshot } from '../realtime/presence.js';

type RoomVisibility = 'public' | 'private';
type RoomGenderPolicy = 'everyone' | 'boys' | 'girls';
type RoomStatus = 'pending' | 'active' | 'hidden' | 'closed';

type RoomRow = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  owner_id: string;
  owner_username: string;
  owner_display_name: string;
  visibility: RoomVisibility;
  gender_policy: RoomGenderPolicy;
  max_users: number;
  tv_enabled: boolean;
  status: RoomStatus;
  created_at: Date;
  updated_at: Date;
  is_favorite: boolean;
  is_moderator: boolean;
  is_invited: boolean;
};

type RoomCreateBody = {
  name?: string;
  description?: string;
  visibility?: RoomVisibility;
  genderPolicy?: RoomGenderPolicy;
  maxUsers?: number;
  tvEnabled?: boolean;
};

type RoomPatchBody = {
  name?: string;
  description?: string | null;
  visibility?: RoomVisibility;
  genderPolicy?: RoomGenderPolicy;
  maxUsers?: number;
  tvEnabled?: boolean;
  status?: 'active' | 'closed';
};

type UsernameBody = { username?: string; reason?: string; expiresAt?: string | null };

type RoomListQuery = {
  search?: string;
  genderPolicy?: RoomGenderPolicy;
  favoritesOnly?: string;
  sort?: 'alphabetical' | 'newest';
};

function unauthorized(reply: FastifyReply) {
  return reply.code(401).send({ error: 'UNAUTHORIZED' });
}

async function requireUser(request: FastifyRequest, reply: FastifyReply) {
  const user = await authenticateRequest(request);
  if (!user) unauthorized(reply);
  return user;
}

function roomDto(room: RoomRow, viewer?: AuthenticatedUser | null, onlineCount?: number) {
  const role = viewer?.id === room.owner_id ? 'owner' : room.is_moderator ? 'moderator' : 'viewer';
  return {
    id: room.id,
    slug: room.slug,
    name: room.name,
    description: room.description,
    visibility: room.visibility,
    genderPolicy: room.gender_policy,
    maxUsers: room.max_users,
    tvEnabled: room.tv_enabled,
    status: room.status,
    favorite: room.is_favorite,
    viewerRole: role,
    invited: room.is_invited,
    owner: {
      username: room.owner_username,
      displayName: room.owner_display_name
    },
    onlineCount: onlineCount ?? 0,
    createdAt: room.created_at,
    updatedAt: room.updated_at
  };
}

function validRoomName(value: string) {
  return value.length >= 2 && value.length <= 60;
}

function validDescription(value: string | null | undefined) {
  return value === undefined || value === null || value.length <= 240;
}

function validVisibility(value: unknown): value is RoomVisibility {
  return value === 'public' || value === 'private';
}

function validGenderPolicy(value: unknown): value is RoomGenderPolicy {
  return value === 'everyone' || value === 'boys' || value === 'girls';
}

function validMaxUsers(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 2 && value <= 500;
}

async function lookupRoom(roomId: string, viewerId?: string): Promise<RoomRow | null> {
  const result = await query<RoomRow>(
    `SELECT r.id, r.slug, r.name, r.description, r.owner_id,
            owner.username AS owner_username, owner.display_name AS owner_display_name,
            r.visibility, r.gender_policy, r.max_users, r.tv_enabled, r.status,
            r.created_at, r.updated_at,
            EXISTS (SELECT 1 FROM room_favorites rf WHERE rf.room_id = r.id AND rf.user_id = $2) AS is_favorite,
            EXISTS (SELECT 1 FROM room_moderators rm WHERE rm.room_id = r.id AND rm.user_id = $2) AS is_moderator,
            EXISTS (
              SELECT 1 FROM room_invites ri
              WHERE ri.room_id = r.id AND ri.user_id = $2
                AND (ri.expires_at IS NULL OR ri.expires_at > now())
            ) AS is_invited
     FROM rooms r
     JOIN users owner ON owner.id = r.owner_id
     WHERE r.id = $1
     LIMIT 1`,
    [roomId, viewerId ?? '00000000-0000-0000-0000-000000000000']
  );
  return result.rows[0] ?? null;
}

function canViewRoom(room: RoomRow, viewer?: AuthenticatedUser | null) {
  if (room.status !== 'active' && viewer?.id !== room.owner_id) return false;
  if (room.visibility === 'public') return true;
  return Boolean(viewer && (viewer.id === room.owner_id || room.is_moderator || room.is_invited));
}

async function canManageRoom(roomId: string, userId: string, ownerOnly = false) {
  const result = await query<{ owner_id: string; is_moderator: boolean }>(
    `SELECT r.owner_id,
            EXISTS (SELECT 1 FROM room_moderators rm WHERE rm.room_id = r.id AND rm.user_id = $2) AS is_moderator
     FROM rooms r WHERE r.id = $1 LIMIT 1`,
    [roomId, userId]
  );
  const row = result.rows[0];
  if (!row) return { exists: false, allowed: false, owner: false };
  const owner = row.owner_id === userId;
  return { exists: true, allowed: owner || (!ownerOnly && row.is_moderator), owner };
}

async function lookupActiveUser(username: string) {
  const result = await query<{ id: string; username: string; gender: 'boy' | 'girl' }>(
    `SELECT id, username, gender FROM users
     WHERE username_normalized = $1 AND status = 'active' LIMIT 1`,
    [normalizeUsername(username)]
  );
  return result.rows[0] ?? null;
}

function makeRoomSlug() {
  return `room-${randomUUID().replaceAll('-', '').slice(0, 12)}`;
}

export async function registerRoomRoutes(app: FastifyInstance, options: { basePath: string }) {
  const prefix = `${options.basePath}/rooms`;

  app.get<{ Querystring: RoomListQuery }>(prefix, async (request, reply) => {
    const viewer = await authenticateRequest(request);
    const search = request.query.search?.trim().slice(0, 60) ?? '';
    const genderPolicy = request.query.genderPolicy;
    const favoritesOnly = request.query.favoritesOnly === 'true';
    const sort = request.query.sort === 'newest' ? 'newest' : 'alphabetical';

    if (genderPolicy !== undefined && !validGenderPolicy(genderPolicy)) {
      return reply.code(400).send({ error: 'INVALID_GENDER_POLICY' });
    }
    if (favoritesOnly && !viewer) return unauthorized(reply);

    const params: unknown[] = [viewer?.id ?? '00000000-0000-0000-0000-000000000000'];
    const where = [
      `r.status = 'active'`,
      `(r.visibility = 'public' OR r.owner_id = $1
        OR EXISTS (SELECT 1 FROM room_moderators rm0 WHERE rm0.room_id = r.id AND rm0.user_id = $1)
        OR EXISTS (SELECT 1 FROM room_invites ri0 WHERE ri0.room_id = r.id AND ri0.user_id = $1 AND (ri0.expires_at IS NULL OR ri0.expires_at > now())))`
    ];

    if (search) {
      params.push(`%${search}%`);
      where.push(`(r.name ILIKE $${params.length} OR COALESCE(r.description, '') ILIKE $${params.length})`);
    }
    if (genderPolicy) {
      params.push(genderPolicy);
      where.push(`r.gender_policy = $${params.length}`);
    }
    if (favoritesOnly) {
      where.push('EXISTS (SELECT 1 FROM room_favorites rff WHERE rff.room_id = r.id AND rff.user_id = $1)');
    }

    const orderBy = sort === 'newest' ? 'r.created_at DESC' : 'lower(r.name), r.created_at DESC';
    const result = await query<RoomRow>(
      `SELECT r.id, r.slug, r.name, r.description, r.owner_id,
              owner.username AS owner_username, owner.display_name AS owner_display_name,
              r.visibility, r.gender_policy, r.max_users, r.tv_enabled, r.status,
              r.created_at, r.updated_at,
              EXISTS (SELECT 1 FROM room_favorites rf WHERE rf.room_id = r.id AND rf.user_id = $1) AS is_favorite,
              EXISTS (SELECT 1 FROM room_moderators rm WHERE rm.room_id = r.id AND rm.user_id = $1) AS is_moderator,
              EXISTS (SELECT 1 FROM room_invites ri WHERE ri.room_id = r.id AND ri.user_id = $1 AND (ri.expires_at IS NULL OR ri.expires_at > now())) AS is_invited
       FROM rooms r
       JOIN users owner ON owner.id = r.owner_id
       WHERE ${where.join(' AND ')}
       ORDER BY ${orderBy}
       LIMIT 100`,
      params
    );

    const counts = await roomPresenceCounts(result.rows.map((room) => room.id));
    return reply.send({
      rooms: result.rows.map((room) => roomDto(room, viewer, counts.get(room.id) ?? 0))
    });
  });

  app.post<{ Body: RoomCreateBody }>(prefix, async (request, reply) => {
    const auth = await requireUser(request, reply);
    if (!auth) return;
    const name = request.body.name?.trim() ?? '';
    const description = request.body.description?.trim() || null;
    const visibility = request.body.visibility ?? 'public';
    const genderPolicy = request.body.genderPolicy ?? 'everyone';
    const maxUsers = request.body.maxUsers ?? 50;
    const tvEnabled = request.body.tvEnabled ?? false;

    if (!validRoomName(name)) return reply.code(400).send({ error: 'INVALID_ROOM_NAME' });
    if (!validDescription(description)) return reply.code(400).send({ error: 'INVALID_ROOM_DESCRIPTION' });
    if (!validVisibility(visibility)) return reply.code(400).send({ error: 'INVALID_ROOM_VISIBILITY' });
    if (!validGenderPolicy(genderPolicy)) return reply.code(400).send({ error: 'INVALID_GENDER_POLICY' });
    if (!validMaxUsers(maxUsers)) return reply.code(400).send({ error: 'INVALID_MAX_USERS' });
    if (typeof tvEnabled !== 'boolean') return reply.code(400).send({ error: 'INVALID_TV_SETTING' });
    if (tvEnabled) return reply.code(400).send({ error: 'TV_CHANNEL_REQUIRED' });

    const id = randomUUID();
    const result = await query<{ id: string }>(
      `INSERT INTO rooms (id, slug, name, description, owner_id, visibility, gender_policy, max_users, tv_enabled)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING id`,
      [id, makeRoomSlug(), name, description, auth.id, visibility, genderPolicy, maxUsers, tvEnabled]
    );
    const room = await lookupRoom(result.rows[0]!.id, auth.id);
    return reply.code(201).send({ room: roomDto(room!, auth) });
  });

  app.get<{ Params: { roomId: string } }>(`${prefix}/:roomId`, async (request, reply) => {
    const viewer = await authenticateRequest(request);
    const room = await lookupRoom(request.params.roomId, viewer?.id);
    if (!room || !canViewRoom(room, viewer)) return reply.code(404).send({ error: 'ROOM_NOT_FOUND' });
    const presence = await roomPresenceSnapshot(room.id);
    return reply.send({ room: roomDto(room, viewer, presence.onlineCount) });
  });

  app.patch<{ Params: { roomId: string }; Body: RoomPatchBody }>(`${prefix}/:roomId`, async (request, reply) => {
    const auth = await requireUser(request, reply);
    if (!auth) return;
    const permission = await canManageRoom(request.params.roomId, auth.id, true);
    if (!permission.exists) return reply.code(404).send({ error: 'ROOM_NOT_FOUND' });
    if (!permission.allowed) return reply.code(403).send({ error: 'ROOM_OWNER_REQUIRED' });

    const name = request.body.name?.trim();
    const description = request.body.description === null ? null : request.body.description?.trim();
    const visibility = request.body.visibility;
    const genderPolicy = request.body.genderPolicy;
    const maxUsers = request.body.maxUsers;
    const tvEnabled = request.body.tvEnabled;
    const status = request.body.status;

    if (name !== undefined && !validRoomName(name)) return reply.code(400).send({ error: 'INVALID_ROOM_NAME' });
    if (!validDescription(description)) return reply.code(400).send({ error: 'INVALID_ROOM_DESCRIPTION' });
    if (visibility !== undefined && !validVisibility(visibility)) return reply.code(400).send({ error: 'INVALID_ROOM_VISIBILITY' });
    if (genderPolicy !== undefined && !validGenderPolicy(genderPolicy)) return reply.code(400).send({ error: 'INVALID_GENDER_POLICY' });
    if (maxUsers !== undefined && !validMaxUsers(maxUsers)) return reply.code(400).send({ error: 'INVALID_MAX_USERS' });
    if (tvEnabled !== undefined && typeof tvEnabled !== 'boolean') return reply.code(400).send({ error: 'INVALID_TV_SETTING' });
    if (tvEnabled === true) {
      const selected = await query(
        `SELECT 1
         FROM rooms r
         JOIN tv_channels c ON c.id = r.tv_channel_id
         WHERE r.id = $1 AND c.status = 'active' AND c.rights_confirmed = true
         LIMIT 1`,
        [request.params.roomId]
      );
      if ((selected.rowCount ?? 0) === 0) {
        return reply.code(400).send({ error: 'TV_CHANNEL_REQUIRED' });
      }
    }
    if (status !== undefined && status !== 'active' && status !== 'closed') return reply.code(400).send({ error: 'INVALID_ROOM_STATUS' });

    if (
      name === undefined && description === undefined && visibility === undefined && genderPolicy === undefined &&
      maxUsers === undefined && tvEnabled === undefined && status === undefined
    ) {
      return reply.code(400).send({ error: 'NO_ROOM_CHANGES' });
    }

    await query(
      `UPDATE rooms SET
         name = COALESCE($2, name),
         description = CASE WHEN $3::boolean THEN $4::varchar ELSE description END,
         visibility = COALESCE($5, visibility),
         gender_policy = COALESCE($6, gender_policy),
         max_users = COALESCE($7, max_users),
         tv_enabled = COALESCE($8, tv_enabled),
         status = COALESCE($9, status),
         updated_at = now()
       WHERE id = $1`,
      [
        request.params.roomId,
        name ?? null,
        request.body.description !== undefined,
        description ?? null,
        visibility ?? null,
        genderPolicy ?? null,
        maxUsers ?? null,
        tvEnabled ?? null,
        status ?? null
      ]
    );
    if (tvEnabled !== undefined) {
      await query(
        `UPDATE rooms SET tv_updated_by = $2, tv_updated_at = now() WHERE id = $1`,
        [request.params.roomId, auth.id]
      );
      const state = await roomTvBroadcastState(request.params.roomId);
      if (state) tvEvents.emitRoomState({ roomId: request.params.roomId, state });
    }
    const room = await lookupRoom(request.params.roomId, auth.id);
    return reply.send({ room: roomDto(room!, auth) });
  });

  app.post<{ Params: { roomId: string } }>(`${prefix}/:roomId/favorite`, async (request, reply) => {
    const auth = await requireUser(request, reply);
    if (!auth) return;
    const room = await lookupRoom(request.params.roomId, auth.id);
    if (!room || !canViewRoom(room, auth)) return reply.code(404).send({ error: 'ROOM_NOT_FOUND' });
    await query(
      `INSERT INTO room_favorites (room_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [room.id, auth.id]
    );
    return reply.code(201).send({ ok: true });
  });

  app.delete<{ Params: { roomId: string } }>(`${prefix}/:roomId/favorite`, async (request, reply) => {
    const auth = await requireUser(request, reply);
    if (!auth) return;
    await query('DELETE FROM room_favorites WHERE room_id = $1 AND user_id = $2', [request.params.roomId, auth.id]);
    return reply.code(204).send();
  });

  app.post<{ Params: { roomId: string }; Body: UsernameBody }>(`${prefix}/:roomId/moderators`, async (request, reply) => {
    const auth = await requireUser(request, reply);
    if (!auth) return;
    const permission = await canManageRoom(request.params.roomId, auth.id, true);
    if (!permission.exists) return reply.code(404).send({ error: 'ROOM_NOT_FOUND' });
    if (!permission.allowed) return reply.code(403).send({ error: 'ROOM_OWNER_REQUIRED' });
    const target = await lookupActiveUser(request.body.username?.trim() ?? '');
    if (!target) return reply.code(404).send({ error: 'USER_NOT_FOUND' });
    if (target.id === auth.id) return reply.code(400).send({ error: 'OWNER_ALREADY_MANAGER' });
    await query(
      `INSERT INTO room_moderators (room_id, user_id, granted_by) VALUES ($1, $2, $3)
       ON CONFLICT (room_id, user_id) DO NOTHING`,
      [request.params.roomId, target.id, auth.id]
    );
    return reply.code(201).send({ ok: true });
  });

  app.delete<{ Params: { roomId: string; username: string } }>(`${prefix}/:roomId/moderators/:username`, async (request, reply) => {
    const auth = await requireUser(request, reply);
    if (!auth) return;
    const permission = await canManageRoom(request.params.roomId, auth.id, true);
    if (!permission.exists) return reply.code(404).send({ error: 'ROOM_NOT_FOUND' });
    if (!permission.allowed) return reply.code(403).send({ error: 'ROOM_OWNER_REQUIRED' });
    const target = await lookupActiveUser(request.params.username);
    if (!target) return reply.code(404).send({ error: 'USER_NOT_FOUND' });
    await query('DELETE FROM room_moderators WHERE room_id = $1 AND user_id = $2', [request.params.roomId, target.id]);
    return reply.code(204).send();
  });

  app.post<{ Params: { roomId: string }; Body: UsernameBody }>(`${prefix}/:roomId/bans`, async (request, reply) => {
    const auth = await requireUser(request, reply);
    if (!auth) return;
    const permission = await canManageRoom(request.params.roomId, auth.id);
    if (!permission.exists) return reply.code(404).send({ error: 'ROOM_NOT_FOUND' });
    if (!permission.allowed) return reply.code(403).send({ error: 'ROOM_MANAGER_REQUIRED' });
    const target = await lookupActiveUser(request.body.username?.trim() ?? '');
    if (!target) return reply.code(404).send({ error: 'USER_NOT_FOUND' });
    const room = await lookupRoom(request.params.roomId, auth.id);
    if (target.id === room?.owner_id) return reply.code(400).send({ error: 'CANNOT_BAN_ROOM_OWNER' });
    if (target.id === auth.id) return reply.code(400).send({ error: 'CANNOT_BAN_SELF' });
    const reason = request.body.reason?.trim() || null;
    if (reason && reason.length > 240) return reply.code(400).send({ error: 'BAN_REASON_TOO_LONG' });
    let expiresAt: Date | null = null;
    if (request.body.expiresAt) {
      expiresAt = new Date(request.body.expiresAt);
      const maxExpiry = Date.now() + 30 * 24 * 60 * 60 * 1000;
      if (Number.isNaN(expiresAt.getTime()) || expiresAt.getTime() <= Date.now() || expiresAt.getTime() > maxExpiry) {
        return reply.code(400).send({ error: 'INVALID_BAN_EXPIRY' });
      }
    }
    await withTransaction(async (client) => {
      await client.query(
        `INSERT INTO room_bans (room_id, user_id, banned_by, reason, expires_at) VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (room_id, user_id) DO UPDATE SET banned_by = EXCLUDED.banned_by, reason = EXCLUDED.reason,
           expires_at = EXCLUDED.expires_at, created_at = now()`,
        [request.params.roomId, target.id, auth.id, reason, expiresAt]
      );
      await client.query('DELETE FROM room_moderators WHERE room_id = $1 AND user_id = $2', [request.params.roomId, target.id]);
      await client.query('DELETE FROM room_invites WHERE room_id = $1 AND user_id = $2', [request.params.roomId, target.id]);
    });
    return reply.code(201).send({ ok: true });
  });

  app.delete<{ Params: { roomId: string; username: string } }>(`${prefix}/:roomId/bans/:username`, async (request, reply) => {
    const auth = await requireUser(request, reply);
    if (!auth) return;
    const permission = await canManageRoom(request.params.roomId, auth.id);
    if (!permission.exists) return reply.code(404).send({ error: 'ROOM_NOT_FOUND' });
    if (!permission.allowed) return reply.code(403).send({ error: 'ROOM_MANAGER_REQUIRED' });
    const target = await lookupActiveUser(request.params.username);
    if (!target) return reply.code(404).send({ error: 'USER_NOT_FOUND' });
    await query('DELETE FROM room_bans WHERE room_id = $1 AND user_id = $2', [request.params.roomId, target.id]);
    return reply.code(204).send();
  });

  app.post<{ Params: { roomId: string }; Body: UsernameBody }>(`${prefix}/:roomId/invites`, async (request, reply) => {
    const auth = await requireUser(request, reply);
    if (!auth) return;
    const permission = await canManageRoom(request.params.roomId, auth.id);
    if (!permission.exists) return reply.code(404).send({ error: 'ROOM_NOT_FOUND' });
    if (!permission.allowed) return reply.code(403).send({ error: 'ROOM_MANAGER_REQUIRED' });
    const target = await lookupActiveUser(request.body.username?.trim() ?? '');
    if (!target) return reply.code(404).send({ error: 'USER_NOT_FOUND' });
    const room = await lookupRoom(request.params.roomId, auth.id);
    if (room?.visibility !== 'private') return reply.code(400).send({ error: 'ROOM_IS_PUBLIC' });

    let expiresAt: Date | null = null;
    if (request.body.expiresAt) {
      expiresAt = new Date(request.body.expiresAt);
      if (Number.isNaN(expiresAt.getTime()) || expiresAt.getTime() <= Date.now()) {
        return reply.code(400).send({ error: 'INVALID_INVITE_EXPIRY' });
      }
    }

    const banned = await query('SELECT 1 FROM room_bans WHERE room_id = $1 AND user_id = $2 AND (expires_at IS NULL OR expires_at > now()) LIMIT 1', [request.params.roomId, target.id]);
    if ((banned.rowCount ?? 0) > 0) return reply.code(409).send({ error: 'USER_BANNED_FROM_ROOM' });

    await query(
      `INSERT INTO room_invites (id, room_id, user_id, invited_by, expires_at)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (room_id, user_id)
       DO UPDATE SET invited_by = EXCLUDED.invited_by, expires_at = EXCLUDED.expires_at, created_at = now()`,
      [randomUUID(), request.params.roomId, target.id, auth.id, expiresAt]
    );
    return reply.code(201).send({ ok: true });
  });

  app.delete<{ Params: { roomId: string; username: string } }>(`${prefix}/:roomId/invites/:username`, async (request, reply) => {
    const auth = await requireUser(request, reply);
    if (!auth) return;
    const permission = await canManageRoom(request.params.roomId, auth.id);
    if (!permission.exists) return reply.code(404).send({ error: 'ROOM_NOT_FOUND' });
    if (!permission.allowed) return reply.code(403).send({ error: 'ROOM_MANAGER_REQUIRED' });
    const target = await lookupActiveUser(request.params.username);
    if (!target) return reply.code(404).send({ error: 'USER_NOT_FOUND' });
    await query('DELETE FROM room_invites WHERE room_id = $1 AND user_id = $2', [request.params.roomId, target.id]);
    return reply.code(204).send();
  });

  app.post<{ Params: { roomId: string } }>(`${prefix}/:roomId/join-check`, async (request, reply) => {
    const auth = await requireUser(request, reply);
    if (!auth) return;
    const room = await lookupRoom(request.params.roomId, auth.id);
    if (!room || room.status !== 'active') return reply.code(404).send({ error: 'ROOM_NOT_FOUND' });

    const banned = await query('SELECT 1 FROM room_bans WHERE room_id = $1 AND user_id = $2 AND (expires_at IS NULL OR expires_at > now()) LIMIT 1', [room.id, auth.id]);
    if ((banned.rowCount ?? 0) > 0) return reply.code(403).send({ error: 'ROOM_BANNED' });
    if (room.gender_policy === 'boys' && auth.gender !== 'boy') return reply.code(403).send({ error: 'ROOM_BOYS_ONLY' });
    if (room.gender_policy === 'girls' && auth.gender !== 'girl') return reply.code(403).send({ error: 'ROOM_GIRLS_ONLY' });
    if (room.visibility === 'private' && auth.id !== room.owner_id && !room.is_moderator && !room.is_invited) {
      return reply.code(403).send({ error: 'ROOM_PRIVATE' });
    }

    return reply.send({ allowed: true, roomId: room.id, maxUsers: room.max_users });
  });
}

import { createHash, randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import { query, withTransaction } from '../../db.js';
import type { AuthenticatedUser } from '../auth/session.js';
import { tvEvents, type RoomTvBroadcastState, type TvBroadcastChannel } from './events.js';
import {
  fetchM3uPlaylist,
  parseM3uPlaylist,
  validatePublicHttpUrl,
  type ParsedM3uEntry
} from './playlist.js';

type TvChannelRow = {
  id: string;
  name: string;
  group_name: string | null;
  stream_url: string;
  logo_url: string | null;
  sort_order: number;
  status: 'active' | 'hidden';
  rights_confirmed: boolean;
  rights_note: string | null;
  import_batch_id: string | null;
  created_by: string;
  created_at: Date;
  updated_at: Date;
};

type ImportBatchRow = {
  id: string;
  source_type: 'upload' | 'url';
  source_label: string | null;
  source_host: string | null;
  source_fingerprint: string | null;
  rights_attested: boolean;
  imported_count: number;
  skipped_count: number;
  created_by: string;
  created_at: Date;
};

type RoomTvRow = {
  id: string;
  owner_id: string;
  visibility: 'public' | 'private';
  gender_policy: 'everyone' | 'boys' | 'girls';
  status: 'pending' | 'active' | 'hidden' | 'closed';
  tv_enabled: boolean;
  tv_channel_id: string | null;
  tv_updated_at: Date | null;
  is_moderator: boolean;
  is_invited: boolean;
  is_banned: boolean;
};

export type ChannelCreateInput = {
  name: string;
  groupName?: string | null | undefined;
  streamUrl: string;
  logoUrl?: string | null | undefined;
  sortOrder?: number | undefined;
  status?: 'active' | 'hidden' | undefined;
  rightsAttested: boolean;
  rightsNote?: string | null | undefined;
};

export type ChannelPatchInput = Partial<Omit<ChannelCreateInput, 'rightsAttested'>> & {
  rightsAttested?: boolean;
};

export type RoomTvSetInput = {
  enabled?: boolean | undefined;
  channelId?: string | null | undefined;
};

function cleanText(value: string | null | undefined, max: number) {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const clean = value.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
  return clean ? clean.slice(0, max) : null;
}

function requiredName(value: string) {
  const clean = cleanText(value, 120);
  if (!clean) throw new Error('INVALID_TV_CHANNEL_NAME');
  return clean;
}

function channelDto(row: TvChannelRow): TvBroadcastChannel & {
  sortOrder: number;
  status: 'active' | 'hidden';
  rightsConfirmed: boolean;
  rightsNote: string | null;
  createdAt: Date;
  updatedAt: Date;
} {
  return {
    id: row.id,
    name: row.name,
    groupName: row.group_name,
    streamUrl: row.stream_url,
    logoUrl: row.logo_url,
    sortOrder: row.sort_order,
    status: row.status,
    rightsConfirmed: row.rights_confirmed,
    rightsNote: row.rights_note,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function publicChannel(row: TvChannelRow): TvBroadcastChannel {
  return {
    id: row.id,
    name: row.name,
    groupName: row.group_name,
    streamUrl: row.stream_url,
    logoUrl: row.logo_url
  };
}

function catalogChannelDto(row: TvChannelRow) {
  return {
    ...publicChannel(row),
    sortOrder: row.sort_order
  };
}

async function hasTvAdminRole(userId: string, client?: PoolClient) {
  const sql = `SELECT 1
               FROM staff_roles
               WHERE user_id=$1 AND role IN ('super_admin','tv_admin')
               LIMIT 1`;
  const result = client ? await client.query(sql, [userId]) : await query(sql, [userId]);
  return (result.rowCount ?? 0) > 0;
}

export async function requireTvAdmin(userId: string, client?: PoolClient) {
  if (!(await hasTvAdminRole(userId, client))) throw new Error('TV_ADMIN_REQUIRED');
}

async function audit(
  client: PoolClient,
  actorUserId: string,
  action: string,
  options: {
    channelId?: string | null;
    importBatchId?: string | null;
    metadata?: Record<string, unknown>;
  } = {}
) {
  await client.query(
    `INSERT INTO tv_admin_actions (
       id,actor_user_id,action,channel_id,import_batch_id,metadata
     ) VALUES ($1,$2,$3,$4,$5,$6::jsonb)`,
    [
      randomUUID(),
      actorUserId,
      action,
      options.channelId ?? null,
      options.importBatchId ?? null,
      JSON.stringify(options.metadata ?? {})
    ]
  );
}

async function nextSortOrder(client: PoolClient) {
  const result = await client.query<{ next_order: number }>(
    'SELECT COALESCE(max(sort_order), -1)::int + 1 AS next_order FROM tv_channels'
  );
  return result.rows[0]?.next_order ?? 0;
}

async function findChannel(client: PoolClient, channelId: string, forUpdate = false) {
  const result = await client.query<TvChannelRow>(
    `SELECT id,name,group_name,stream_url,logo_url,sort_order,status,rights_confirmed,
            rights_note,import_batch_id,created_by,created_at,updated_at
     FROM tv_channels
     WHERE id=$1
     LIMIT 1
     ${forUpdate ? 'FOR UPDATE' : ''}`,
    [channelId]
  );
  return result.rows[0] ?? null;
}

async function roomIdsUsingChannel(client: PoolClient, channelId: string) {
  const result = await client.query<{ id: string }>(
    'SELECT id FROM rooms WHERE tv_channel_id=$1',
    [channelId]
  );
  return result.rows.map((row) => row.id);
}

async function broadcastRoomStates(roomIds: string[]) {
  for (const roomId of [...new Set(roomIds)]) {
    const state = await roomTvBroadcastState(roomId);
    if (state) tvEvents.emitRoomState({ roomId, state });
  }
}

export async function createDirectChannel(actorUserId: string, input: ChannelCreateInput) {
  if (input.rightsAttested !== true) throw new Error('TV_RIGHTS_ATTESTATION_REQUIRED');

  const name = requiredName(input.name);
  const groupName = cleanText(input.groupName, 120) ?? null;
  const streamUrl = validatePublicHttpUrl(input.streamUrl, 'stream').toString();
  const logoUrl = input.logoUrl
    ? validatePublicHttpUrl(input.logoUrl, 'logo').toString()
    : null;
  const rightsNote = cleanText(input.rightsNote, 500) ?? null;
  const status = input.status ?? 'active';
  if (status !== 'active' && status !== 'hidden') throw new Error('INVALID_TV_CHANNEL_STATUS');
  if (
    input.sortOrder !== undefined &&
    (!Number.isInteger(input.sortOrder) || input.sortOrder < 0)
  ) {
    throw new Error('INVALID_TV_SORT_ORDER');
  }

  try {
    return await withTransaction(async (client) => {
      await requireTvAdmin(actorUserId, client);
      const sortOrder = input.sortOrder ?? await nextSortOrder(client);
      const result = await client.query<TvChannelRow>(
        `INSERT INTO tv_channels (
           id,name,group_name,stream_url,logo_url,sort_order,status,
           rights_confirmed,rights_note,created_by
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,true,$8,$9)
         RETURNING id,name,group_name,stream_url,logo_url,sort_order,status,
                   rights_confirmed,rights_note,import_batch_id,created_by,created_at,updated_at`,
        [
          randomUUID(),
          name,
          groupName,
          streamUrl,
          logoUrl,
          sortOrder,
          status,
          rightsNote,
          actorUserId
        ]
      );
      const channel = result.rows[0]!;
      await audit(client, actorUserId, 'tv_channel_create', {
        channelId: channel.id,
        metadata: { name: channel.name, status: channel.status, source: 'direct' }
      });
      return channelDto(channel);
    });
  } catch (error) {
    if ((error as { code?: string }).code === '23505') throw new Error('TV_CHANNEL_DUPLICATE');
    throw error;
  }
}

type ImportOptions = {
  sourceType: 'upload' | 'url';
  sourceLabel?: string | null | undefined;
  sourceHost?: string | null | undefined;
  sourceFingerprint?: string | null | undefined;
  rightsAttested: boolean;
  rightsNote?: string | null | undefined;
};

async function importEntries(
  actorUserId: string,
  entries: ParsedM3uEntry[],
  options: ImportOptions
) {
  if (options.rightsAttested !== true) throw new Error('TV_RIGHTS_ATTESTATION_REQUIRED');
  const sourceLabel = cleanText(options.sourceLabel, 160) ?? null;
  const rightsNote = cleanText(options.rightsNote, 500) ?? null;

  return withTransaction(async (client) => {
    await requireTvAdmin(actorUserId, client);
    const batchId = randomUUID();
    await client.query(
      `INSERT INTO tv_import_batches (
         id,source_type,source_label,source_host,source_fingerprint,
         rights_attested,created_by
       ) VALUES ($1,$2,$3,$4,$5,true,$6)`,
      [
        batchId,
        options.sourceType,
        sourceLabel,
        options.sourceHost ?? null,
        options.sourceFingerprint ?? null,
        actorUserId
      ]
    );

    let order = await nextSortOrder(client);
    let imported = 0;
    let skipped = 0;

    for (const entry of entries) {
      const inserted = await client.query<{ id: string }>(
        `INSERT INTO tv_channels (
           id,name,group_name,stream_url,logo_url,sort_order,status,
           rights_confirmed,rights_note,import_batch_id,created_by
         ) VALUES ($1,$2,$3,$4,$5,$6,'active',true,$7,$8,$9)
         ON CONFLICT (stream_url) DO NOTHING
         RETURNING id`,
        [
          randomUUID(),
          entry.name,
          entry.groupName,
          entry.streamUrl,
          entry.logoUrl,
          order,
          rightsNote,
          batchId,
          actorUserId
        ]
      );
      if (inserted.rows[0]) {
        imported += 1;
        order += 1;
      } else {
        skipped += 1;
      }
    }

    await client.query(
      `UPDATE tv_import_batches
       SET imported_count=$2,skipped_count=$3
       WHERE id=$1`,
      [batchId, imported, skipped]
    );
    await audit(client, actorUserId, 'tv_playlist_import', {
      importBatchId: batchId,
      metadata: {
        sourceType: options.sourceType,
        imported,
        skipped,
        sourceHost: options.sourceHost ?? null
      }
    });

    return { batchId, imported, skipped, total: entries.length };
  });
}

export async function importM3uContent(
  actorUserId: string,
  content: string,
  options: {
    sourceLabel?: string | null | undefined;
    rightsAttested: boolean;
    rightsNote?: string | null | undefined;
  }
) {
  await requireTvAdmin(actorUserId);
  const entries = parseM3uPlaylist(content);
  return importEntries(actorUserId, entries, {
    sourceType: 'upload',
    sourceLabel: options.sourceLabel,
    sourceFingerprint: createHash('sha256').update(content).digest('hex'),
    rightsAttested: options.rightsAttested,
    rightsNote: options.rightsNote
  });
}

export async function importM3uFromUrl(
  actorUserId: string,
  sourceUrl: string,
  options: {
    sourceLabel?: string | null | undefined;
    rightsAttested: boolean;
    rightsNote?: string | null | undefined;
  }
) {
  await requireTvAdmin(actorUserId);
  if (options.rightsAttested !== true) throw new Error('TV_RIGHTS_ATTESTATION_REQUIRED');

  const fetched = await fetchM3uPlaylist(sourceUrl);
  const entries = parseM3uPlaylist(fetched.content);
  return importEntries(actorUserId, entries, {
    sourceType: 'url',
    sourceLabel: options.sourceLabel,
    sourceHost: fetched.sourceHost,
    sourceFingerprint: fetched.sourceFingerprint,
    rightsAttested: true,
    rightsNote: options.rightsNote
  });
}

export async function updateTvChannel(
  actorUserId: string,
  channelId: string,
  patch: ChannelPatchInput
) {
  const changedFields = Object.keys(patch).filter((key) => patch[key as keyof ChannelPatchInput] !== undefined);
  if (changedFields.length === 0) throw new Error('NO_TV_CHANNEL_CHANGES');

  let affectedRooms: string[] = [];
  try {
    const updated = await withTransaction(async (client) => {
      await requireTvAdmin(actorUserId, client);
      const current = await findChannel(client, channelId, true);
      if (!current) throw new Error('TV_CHANNEL_NOT_FOUND');

      const name = patch.name !== undefined ? requiredName(patch.name) : current.name;
      const groupName = patch.groupName !== undefined
        ? cleanText(patch.groupName, 120) ?? null
        : current.group_name;
      const streamUrl = patch.streamUrl !== undefined
        ? validatePublicHttpUrl(patch.streamUrl, 'stream').toString()
        : current.stream_url;
      if (streamUrl !== current.stream_url && patch.rightsAttested !== true) {
        throw new Error('TV_RIGHTS_ATTESTATION_REQUIRED');
      }
      const logoUrl = patch.logoUrl !== undefined
        ? patch.logoUrl
          ? validatePublicHttpUrl(patch.logoUrl, 'logo').toString()
          : null
        : current.logo_url;
      const sortOrder = patch.sortOrder ?? current.sort_order;
      if (!Number.isInteger(sortOrder) || sortOrder < 0) throw new Error('INVALID_TV_SORT_ORDER');
      const status = patch.status ?? current.status;
      if (status !== 'active' && status !== 'hidden') throw new Error('INVALID_TV_CHANNEL_STATUS');

      const rightsConfirmed = patch.rightsAttested ?? current.rights_confirmed;
      if (status === 'active' && rightsConfirmed !== true) {
        throw new Error('TV_RIGHTS_ATTESTATION_REQUIRED');
      }
      const rightsNote = patch.rightsNote !== undefined
        ? cleanText(patch.rightsNote, 500) ?? null
        : current.rights_note;

      if (current.status === 'active' && status === 'hidden') {
        affectedRooms = await roomIdsUsingChannel(client, current.id);
      }

      const result = await client.query<TvChannelRow>(
        `UPDATE tv_channels
         SET name=$2,group_name=$3,stream_url=$4,logo_url=$5,sort_order=$6,
             status=$7,rights_confirmed=$8,rights_note=$9,updated_at=now()
         WHERE id=$1
         RETURNING id,name,group_name,stream_url,logo_url,sort_order,status,
                   rights_confirmed,rights_note,import_batch_id,created_by,created_at,updated_at`,
        [
          current.id,
          name,
          groupName,
          streamUrl,
          logoUrl,
          sortOrder,
          status,
          rightsConfirmed,
          rightsNote
        ]
      );
      await audit(client, actorUserId, 'tv_channel_update', {
        channelId: current.id,
        metadata: { fields: changedFields, status }
      });
      return channelDto(result.rows[0]!);
    });

    if (affectedRooms.length > 0) await broadcastRoomStates(affectedRooms);
    return updated;
  } catch (error) {
    if ((error as { code?: string }).code === '23505') throw new Error('TV_CHANNEL_DUPLICATE');
    throw error;
  }
}

export async function deleteTvChannel(actorUserId: string, channelId: string) {
  let affectedRooms: string[] = [];
  const deleted = await withTransaction(async (client) => {
    await requireTvAdmin(actorUserId, client);
    const channel = await findChannel(client, channelId, true);
    if (!channel) throw new Error('TV_CHANNEL_NOT_FOUND');
    affectedRooms = await roomIdsUsingChannel(client, channel.id);

    await audit(client, actorUserId, 'tv_channel_delete', {
      channelId: channel.id,
      metadata: { name: channel.name }
    });
    await client.query('DELETE FROM tv_channels WHERE id=$1', [channel.id]);
    return { id: channel.id, name: channel.name };
  });

  if (affectedRooms.length > 0) await broadcastRoomStates(affectedRooms);
  return deleted;
}

export async function deleteAllTvChannels(actorUserId: string) {
  let affectedRooms: string[] = [];
  const count = await withTransaction(async (client) => {
    await requireTvAdmin(actorUserId, client);
    const rooms = await client.query<{ id: string }>(
      'SELECT id FROM rooms WHERE tv_channel_id IS NOT NULL'
    );
    affectedRooms = rooms.rows.map((row) => row.id);

    const result = await client.query<{ count: number }>(
      `WITH deleted AS (
         DELETE FROM tv_channels RETURNING id
       )
       SELECT count(*)::int AS count FROM deleted`
    );
    const deletedCount = result.rows[0]?.count ?? 0;
    await audit(client, actorUserId, 'tv_channel_delete_all', {
      metadata: { deletedCount }
    });
    return deletedCount;
  });

  if (affectedRooms.length > 0) await broadcastRoomStates(affectedRooms);
  return { deletedCount: count };
}

export async function reorderTvChannels(actorUserId: string, channelIds: string[]) {
  if (channelIds.length < 1 || channelIds.length > 1000) throw new Error('INVALID_TV_CHANNEL_ORDER');
  if (new Set(channelIds).size !== channelIds.length) throw new Error('INVALID_TV_CHANNEL_ORDER');

  return withTransaction(async (client) => {
    await requireTvAdmin(actorUserId, client);
    const found = await client.query<{ id: string }>(
      'SELECT id FROM tv_channels WHERE id=ANY($1::uuid[]) FOR UPDATE',
      [channelIds]
    );
    if (found.rows.length !== channelIds.length) throw new Error('TV_CHANNEL_NOT_FOUND');

    for (let index = 0; index < channelIds.length; index += 1) {
      await client.query(
        'UPDATE tv_channels SET sort_order=$2,updated_at=now() WHERE id=$1',
        [channelIds[index], index]
      );
    }
    await audit(client, actorUserId, 'tv_channel_reorder', {
      metadata: { channelCount: channelIds.length }
    });
    return { reordered: channelIds.length };
  });
}

export async function listTvChannels(options: {
  sort?: 'manual' | 'alphabetical' | undefined;
  search?: string | undefined;
  group?: string | undefined;
  limit?: number | undefined;
} = {}) {
  const values: unknown[] = [];
  const where = [`status='active'`, 'rights_confirmed=true'];
  const search = options.search?.trim().slice(0, 120);
  const group = options.group?.trim().slice(0, 120);

  if (search) {
    values.push(`%${search}%`);
    where.push(`(name ILIKE $${values.length} OR COALESCE(group_name,'') ILIKE $${values.length})`);
  }
  if (group) {
    values.push(group);
    where.push(`group_name=$${values.length}`);
  }

  const limit = Math.min(Math.max(options.limit ?? 200, 1), 500);
  values.push(limit);
  const order = options.sort === 'alphabetical'
    ? 'lower(name),id'
    : 'sort_order,lower(name),id';

  const result = await query<TvChannelRow>(
    `SELECT id,name,group_name,stream_url,logo_url,sort_order,status,rights_confirmed,
            rights_note,import_batch_id,created_by,created_at,updated_at
     FROM tv_channels
     WHERE ${where.join(' AND ')}
     ORDER BY ${order}
     LIMIT $${values.length}`,
    values
  );
  return result.rows.map(catalogChannelDto);
}

export async function listAdminTvChannels(actorUserId: string) {
  await requireTvAdmin(actorUserId);
  const result = await query<TvChannelRow>(
    `SELECT id,name,group_name,stream_url,logo_url,sort_order,status,rights_confirmed,
            rights_note,import_batch_id,created_by,created_at,updated_at
     FROM tv_channels
     ORDER BY sort_order,lower(name),id
     LIMIT 2000`
  );
  return result.rows.map(channelDto);
}

export async function listTvImports(actorUserId: string, limit = 100) {
  await requireTvAdmin(actorUserId);
  const safeLimit = Math.min(Math.max(limit, 1), 200);
  const result = await query<ImportBatchRow>(
    `SELECT id,source_type,source_label,source_host,source_fingerprint,rights_attested,
            imported_count,skipped_count,created_by,created_at
     FROM tv_import_batches
     ORDER BY created_at DESC,id DESC
     LIMIT $1`,
    [safeLimit]
  );
  return result.rows.map((row) => ({
    id: row.id,
    sourceType: row.source_type,
    sourceLabel: row.source_label,
    sourceHost: row.source_host,
    sourceFingerprint: row.source_fingerprint,
    rightsAttested: row.rights_attested,
    importedCount: row.imported_count,
    skippedCount: row.skipped_count,
    createdAt: row.created_at
  }));
}

async function roomAccess(client: PoolClient, roomId: string, userId: string) {
  const result = await client.query<RoomTvRow>(
    `SELECT r.id,r.owner_id,r.visibility,r.gender_policy,r.status,r.tv_enabled,
            r.tv_channel_id,r.tv_updated_at,
            EXISTS (
              SELECT 1 FROM room_moderators rm
              WHERE rm.room_id=r.id AND rm.user_id=$2
            ) AS is_moderator,
            EXISTS (
              SELECT 1 FROM room_invites ri
              WHERE ri.room_id=r.id AND ri.user_id=$2
                AND (ri.expires_at IS NULL OR ri.expires_at>now())
            ) AS is_invited,
            EXISTS (
              SELECT 1 FROM room_bans rb
              WHERE rb.room_id=r.id AND rb.user_id=$2
            ) AS is_banned
     FROM rooms r
     WHERE r.id=$1
     LIMIT 1`,
    [roomId, userId]
  );
  return result.rows[0] ?? null;
}

function roomAccessError(room: RoomTvRow, user: AuthenticatedUser) {
  if (room.status !== 'active') return 'ROOM_NOT_FOUND';
  if (room.is_banned) return 'ROOM_NOT_FOUND';
  if (room.gender_policy === 'boys' && user.gender !== 'boy') return 'ROOM_NOT_FOUND';
  if (room.gender_policy === 'girls' && user.gender !== 'girl') return 'ROOM_NOT_FOUND';
  if (
    room.visibility === 'private' &&
    user.id !== room.owner_id &&
    !room.is_moderator &&
    !room.is_invited
  ) {
    return 'ROOM_NOT_FOUND';
  }
  return null;
}

async function activeChannelById(client: PoolClient, channelId: string) {
  const channel = await findChannel(client, channelId);
  if (!channel || channel.status !== 'active' || !channel.rights_confirmed) return null;
  return channel;
}

export async function roomTvBroadcastState(roomId: string): Promise<RoomTvBroadcastState | null> {
  const result = await query<{
    tv_enabled: boolean;
    tv_updated_at: Date | null;
    id: string | null;
    name: string | null;
    group_name: string | null;
    stream_url: string | null;
    logo_url: string | null;
  }>(
    `SELECT r.tv_enabled,r.tv_updated_at,
            c.id,c.name,c.group_name,c.stream_url,c.logo_url
     FROM rooms r
     LEFT JOIN tv_channels c
       ON c.id=r.tv_channel_id
      AND c.status='active'
      AND c.rights_confirmed=true
     WHERE r.id=$1
     LIMIT 1`,
    [roomId]
  );
  const row = result.rows[0];
  if (!row) return null;
  const channel = row.id && row.name && row.stream_url
    ? {
        id: row.id,
        name: row.name,
        groupName: row.group_name,
        streamUrl: row.stream_url,
        logoUrl: row.logo_url
      }
    : null;
  return {
    enabled: Boolean(row.tv_enabled && channel),
    channel: row.tv_enabled ? channel : null,
    updatedAt: row.tv_updated_at
  };
}

export async function getRoomTvState(user: AuthenticatedUser, roomId: string) {
  return withTransaction(async (client) => {
    const room = await roomAccess(client, roomId, user.id);
    if (!room || roomAccessError(room, user)) throw new Error('ROOM_NOT_FOUND');

    const canManage = user.id === room.owner_id || room.is_moderator;
    const selected = room.tv_channel_id
      ? await activeChannelById(client, room.tv_channel_id)
      : null;

    const state: RoomTvBroadcastState = {
      enabled: Boolean(room.tv_enabled && selected),
      channel: room.tv_enabled && selected ? publicChannel(selected) : null,
      updatedAt: room.tv_updated_at
    };

    return {
      ...state,
      canManage,
      selectedChannel: canManage && selected ? publicChannel(selected) : null
    };
  });
}

export async function setRoomTvState(
  user: AuthenticatedUser,
  roomId: string,
  input: RoomTvSetInput
) {
  if (input.enabled === undefined && input.channelId === undefined) {
    throw new Error('NO_TV_STATE_CHANGES');
  }

  const state = await withTransaction(async (client) => {
    const room = await roomAccess(client, roomId, user.id);
    if (!room || roomAccessError(room, user)) throw new Error('ROOM_NOT_FOUND');
    if (user.id !== room.owner_id && !room.is_moderator) throw new Error('ROOM_TV_MANAGER_REQUIRED');

    let selectedChannelId = input.channelId === undefined
      ? room.tv_channel_id
      : input.channelId;

    let selected: TvChannelRow | null = null;
    if (selectedChannelId) {
      selected = await activeChannelById(client, selectedChannelId);
      if (!selected) throw new Error('TV_CHANNEL_NOT_AVAILABLE');
    }

    const enabled = input.enabled ?? room.tv_enabled;
    if (enabled && !selectedChannelId) throw new Error('TV_CHANNEL_REQUIRED');

    const updated = await client.query<{ tv_updated_at: Date }>(
      `UPDATE rooms
       SET tv_enabled=$2,
           tv_channel_id=$3,
           tv_updated_by=$4,
           tv_updated_at=now(),
           updated_at=now()
       WHERE id=$1
       RETURNING tv_updated_at`,
      [room.id, enabled, selectedChannelId, user.id]
    );

    return {
      enabled: Boolean(enabled && selected),
      channel: enabled && selected ? publicChannel(selected) : null,
      updatedAt: updated.rows[0]!.tv_updated_at
    } satisfies RoomTvBroadcastState;
  });

  tvEvents.emitRoomState({ roomId, state });
  return state;
}

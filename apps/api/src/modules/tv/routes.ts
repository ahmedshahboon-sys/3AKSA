import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { authenticateRequest } from '../auth/session.js';
import {
  createDirectChannel,
  deleteAllTvChannels,
  deleteTvChannel,
  getRoomTvState,
  importM3uContent,
  importM3uFromUrl,
  listAdminTvChannels,
  listTvChannels,
  listTvImports,
  reorderTvChannels,
  setRoomTvState,
  updateTvChannel
} from './service.js';

type ChannelBody = {
  name?: string;
  groupName?: string | null;
  streamUrl?: string;
  logoUrl?: string | null;
  sortOrder?: number;
  status?: 'active' | 'hidden';
  rightsAttested?: boolean;
  rightsNote?: string | null;
};

type ImportBody = {
  content?: string;
  sourceUrl?: string;
  sourceLabel?: string | null;
  rightsAttested?: boolean;
  rightsNote?: string | null;
};

type ChannelListQuery = {
  sort?: 'manual' | 'alphabetical';
  search?: string;
  group?: string;
  limit?: string;
};

type ReorderBody = { channelIds?: string[] };
type RoomTvBody = { enabled?: boolean; channelId?: string | null };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function requireUser(request: FastifyRequest, reply: FastifyReply) {
  const user = await authenticateRequest(request);
  if (!user) reply.code(401).send({ error: 'UNAUTHORIZED' });
  return user;
}

function mapTvError(error: unknown, reply: FastifyReply) {
  const code = error instanceof Error ? error.message : '';

  if (code === 'TV_ADMIN_REQUIRED' || code === 'ROOM_TV_MANAGER_REQUIRED') {
    return reply.code(403).send({ error: code });
  }
  if (
    code === 'TV_CHANNEL_NOT_FOUND' ||
    code === 'ROOM_NOT_FOUND'
  ) {
    return reply.code(404).send({ error: code });
  }
  if (
    code === 'TV_CHANNEL_DUPLICATE' ||
    code === 'TV_CHANNEL_NOT_AVAILABLE'
  ) {
    return reply.code(409).send({ error: code });
  }
  if (
    code === 'PLAYLIST_FETCH_FAILED' ||
    code === 'PLAYLIST_DNS_FAILED'
  ) {
    return reply.code(502).send({ error: code });
  }

  const badRequest = new Set([
    'TV_RIGHTS_ATTESTATION_REQUIRED',
    'INVALID_TV_CHANNEL_NAME',
    'INVALID_TV_CHANNEL_STATUS',
    'INVALID_TV_SORT_ORDER',
    'NO_TV_CHANNEL_CHANGES',
    'INVALID_TV_CHANNEL_ORDER',
    'INVALID_STREAM_URL',
    'INVALID_LOGO_URL',
    'INVALID_PLAYLIST_URL',
    'PLAYLIST_URL_NOT_PUBLIC',
    'PLAYLIST_REDIRECT_INVALID',
    'PLAYLIST_TOO_LARGE',
    'PLAYLIST_CHANNEL_LIMIT',
    'INVALID_M3U_PLAYLIST',
    'PLAYLIST_HAS_NO_CHANNELS',
    'TV_CHANNEL_REQUIRED',
    'NO_TV_STATE_CHANGES'
  ]);
  if (badRequest.has(code)) return reply.code(400).send({ error: code });
  throw error;
}

export async function registerTvRoutes(app: FastifyInstance, options: { basePath: string }) {
  const tvPrefix = `${options.basePath}/tv`;

  app.get<{ Querystring: ChannelListQuery }>(`${tvPrefix}/channels`, async (request, reply) => {
    const user = await requireUser(request, reply);
    if (!user) return;

    const sort = request.query.sort === 'alphabetical' ? 'alphabetical' : 'manual';
    const limitRaw = Number(request.query.limit ?? 200);
    const limit = Number.isFinite(limitRaw) ? Math.trunc(limitRaw) : 200;
    const channels = await listTvChannels({
      sort,
      search: request.query.search,
      group: request.query.group,
      limit
    });
    return reply.send({ channels });
  });

  app.get(`${tvPrefix}/admin/channels`, async (request, reply) => {
    const user = await requireUser(request, reply);
    if (!user) return;
    try {
      return reply.send({ channels: await listAdminTvChannels(user.id) });
    } catch (error) {
      return mapTvError(error, reply);
    }
  });

  app.post<{ Body: ChannelBody }>(`${tvPrefix}/admin/channels`, async (request, reply) => {
    const user = await requireUser(request, reply);
    if (!user) return;

    const name = request.body.name?.trim() ?? '';
    const streamUrl = request.body.streamUrl?.trim() ?? '';
    if (!name || !streamUrl) return reply.code(400).send({ error: 'INVALID_TV_CHANNEL' });

    try {
      const channel = await createDirectChannel(user.id, {
        name,
        groupName: request.body.groupName,
        streamUrl,
        logoUrl: request.body.logoUrl,
        sortOrder: request.body.sortOrder,
        status: request.body.status,
        rightsAttested: request.body.rightsAttested === true,
        rightsNote: request.body.rightsNote
      });
      return reply.code(201).send({ channel });
    } catch (error) {
      return mapTvError(error, reply);
    }
  });

  app.patch<{ Params: { channelId: string }; Body: ChannelBody }>(
    `${tvPrefix}/admin/channels/:channelId`,
    async (request, reply) => {
      const user = await requireUser(request, reply);
      if (!user) return;
      if (!UUID_RE.test(request.params.channelId)) {
        return reply.code(404).send({ error: 'TV_CHANNEL_NOT_FOUND' });
      }

      const patch: ChannelBody = {};
      if (request.body.name !== undefined) patch.name = request.body.name;
      if (request.body.groupName !== undefined) patch.groupName = request.body.groupName;
      if (request.body.streamUrl !== undefined) patch.streamUrl = request.body.streamUrl;
      if (request.body.logoUrl !== undefined) patch.logoUrl = request.body.logoUrl;
      if (request.body.sortOrder !== undefined) patch.sortOrder = request.body.sortOrder;
      if (request.body.status !== undefined) patch.status = request.body.status;
      if (request.body.rightsAttested !== undefined) patch.rightsAttested = request.body.rightsAttested;
      if (request.body.rightsNote !== undefined) patch.rightsNote = request.body.rightsNote;

      try {
        return reply.send({
          channel: await updateTvChannel(user.id, request.params.channelId, patch)
        });
      } catch (error) {
        return mapTvError(error, reply);
      }
    }
  );

  app.delete<{ Params: { channelId: string } }>(
    `${tvPrefix}/admin/channels/:channelId`,
    async (request, reply) => {
      const user = await requireUser(request, reply);
      if (!user) return;
      if (!UUID_RE.test(request.params.channelId)) {
        return reply.code(404).send({ error: 'TV_CHANNEL_NOT_FOUND' });
      }
      try {
        return reply.send({ deleted: await deleteTvChannel(user.id, request.params.channelId) });
      } catch (error) {
        return mapTvError(error, reply);
      }
    }
  );

  app.delete(`${tvPrefix}/admin/channels`, async (request, reply) => {
    const user = await requireUser(request, reply);
    if (!user) return;
    if (request.headers['x-confirm-delete-all'] !== 'DELETE_ALL_TV_CHANNELS') {
      return reply.code(400).send({ error: 'TV_DELETE_ALL_CONFIRMATION_REQUIRED' });
    }
    try {
      return reply.send(await deleteAllTvChannels(user.id));
    } catch (error) {
      return mapTvError(error, reply);
    }
  });

  app.put<{ Body: ReorderBody }>(`${tvPrefix}/admin/channels/order`, async (request, reply) => {
    const user = await requireUser(request, reply);
    if (!user) return;
    const ids = request.body.channelIds;
    if (!Array.isArray(ids) || ids.some((id) => typeof id !== 'string' || !UUID_RE.test(id))) {
      return reply.code(400).send({ error: 'INVALID_TV_CHANNEL_ORDER' });
    }
    try {
      return reply.send(await reorderTvChannels(user.id, ids));
    } catch (error) {
      return mapTvError(error, reply);
    }
  });

  app.post<{ Body: ImportBody }>(
    `${tvPrefix}/admin/imports/m3u`,
    { bodyLimit: 2_200_000 },
    async (request, reply) => {
      const user = await requireUser(request, reply);
      if (!user) return;

      const content = typeof request.body.content === 'string' ? request.body.content : '';
      const sourceUrl = request.body.sourceUrl?.trim() ?? '';
      if (Boolean(content) === Boolean(sourceUrl)) {
        return reply.code(400).send({ error: 'TV_IMPORT_REQUIRES_CONTENT_OR_URL' });
      }
      if (request.body.rightsAttested !== true) {
        return reply.code(400).send({ error: 'TV_RIGHTS_ATTESTATION_REQUIRED' });
      }

      try {
        const result = content
          ? await importM3uContent(user.id, content, {
              sourceLabel: request.body.sourceLabel,
              rightsAttested: true,
              rightsNote: request.body.rightsNote
            })
          : await importM3uFromUrl(user.id, sourceUrl, {
              sourceLabel: request.body.sourceLabel,
              rightsAttested: true,
              rightsNote: request.body.rightsNote
            });
        return reply.code(201).send({ import: result });
      } catch (error) {
        return mapTvError(error, reply);
      }
    }
  );

  app.get(`${tvPrefix}/admin/imports`, async (request, reply) => {
    const user = await requireUser(request, reply);
    if (!user) return;
    try {
      return reply.send({ imports: await listTvImports(user.id) });
    } catch (error) {
      return mapTvError(error, reply);
    }
  });

  app.get<{ Params: { roomId: string } }>(
    `${options.basePath}/rooms/:roomId/tv`,
    async (request, reply) => {
      const user = await requireUser(request, reply);
      if (!user) return;
      if (!UUID_RE.test(request.params.roomId)) {
        return reply.code(404).send({ error: 'ROOM_NOT_FOUND' });
      }
      try {
        return reply.send({ tv: await getRoomTvState(user, request.params.roomId) });
      } catch (error) {
        return mapTvError(error, reply);
      }
    }
  );

  app.patch<{ Params: { roomId: string }; Body: RoomTvBody }>(
    `${options.basePath}/rooms/:roomId/tv`,
    async (request, reply) => {
      const user = await requireUser(request, reply);
      if (!user) return;
      if (!UUID_RE.test(request.params.roomId)) {
        return reply.code(404).send({ error: 'ROOM_NOT_FOUND' });
      }
      if (request.body.enabled !== undefined && typeof request.body.enabled !== 'boolean') {
        return reply.code(400).send({ error: 'INVALID_TV_SETTING' });
      }
      if (
        request.body.channelId !== undefined &&
        request.body.channelId !== null &&
        !UUID_RE.test(request.body.channelId)
      ) {
        return reply.code(400).send({ error: 'INVALID_TV_CHANNEL_ID' });
      }

      try {
        const tv = await setRoomTvState(user, request.params.roomId, {
          enabled: request.body.enabled,
          channelId: request.body.channelId
        });
        return reply.send({ tv });
      } catch (error) {
        return mapTvError(error, reply);
      }
    }
  );
}

import { env } from '../../config.js';
import { getRedis } from '../../redis.js';

const PRESENCE_TTL_MS = 90_000;
const PRESENCE_KEY_TTL_SECONDS = 180;

function presenceKey(roomId: string) {
  return `${env.REDIS_KEY_PREFIX}presence:room:${roomId}`;
}

function presenceMember(userId: string, socketId: string) {
  return `${userId}:${socketId}`;
}

async function cleanupExpired(roomId: string) {
  const redis = await getRedis();
  await redis.zRemRangeByScore(presenceKey(roomId), 0, Date.now());
}

export async function tryJoinRoomPresence(
  roomId: string,
  userId: string,
  socketId: string,
  maxUsers: number
) {
  const redis = await getRedis();
  const key = presenceKey(roomId);
  const now = Date.now();
  const expiresAt = now + PRESENCE_TTL_MS;

  const result = (await redis.eval(
    `
      local key = KEYS[1]
      local now = tonumber(ARGV[1])
      local expiresAt = tonumber(ARGV[2])
      local userId = ARGV[3]
      local socketId = ARGV[4]
      local maxUsers = tonumber(ARGV[5])
      local keyTtl = tonumber(ARGV[6])

      redis.call('ZREMRANGEBYSCORE', key, 0, now)
      local members = redis.call('ZRANGE', key, 0, -1)
      local users = {}
      local uniqueCount = 0
      local alreadyPresent = false

      for _, member in ipairs(members) do
        local separator = string.find(member, ':')
        local uid = separator and string.sub(member, 1, separator - 1) or member
        if not users[uid] then
          users[uid] = true
          uniqueCount = uniqueCount + 1
        end
        if uid == userId then
          alreadyPresent = true
        end
      end

      if not alreadyPresent and uniqueCount >= maxUsers then
        return {0, uniqueCount}
      end

      redis.call('ZADD', key, expiresAt, userId .. ':' .. socketId)
      redis.call('EXPIRE', key, keyTtl)
      if not alreadyPresent then
        uniqueCount = uniqueCount + 1
      end
      return {1, uniqueCount}
    `,
    {
      keys: [key],
      arguments: [
        String(now),
        String(expiresAt),
        userId,
        socketId,
        String(maxUsers),
        String(PRESENCE_KEY_TTL_SECONDS)
      ]
    }
  )) as [number, number];

  return { allowed: result[0] === 1, onlineCount: Number(result[1]) };
}

export async function refreshRoomPresence(roomId: string, userId: string, socketId: string) {
  const redis = await getRedis();
  const key = presenceKey(roomId);
  await redis.zAdd(key, [{ score: Date.now() + PRESENCE_TTL_MS, value: presenceMember(userId, socketId) }]);
  await redis.expire(key, PRESENCE_KEY_TTL_SECONDS);
}

export async function removeRoomPresence(roomId: string, userId: string, socketId: string) {
  const redis = await getRedis();
  const key = presenceKey(roomId);
  await redis.zRem(key, presenceMember(userId, socketId));
  await cleanupExpired(roomId);
}

export async function roomPresenceSnapshot(roomId: string) {
  await cleanupExpired(roomId);
  const redis = await getRedis();
  const members = await redis.zRange(presenceKey(roomId), 0, -1);
  const userIds = [...new Set(members.map((member) => member.split(':', 1)[0]).filter(Boolean))] as string[];
  return { onlineCount: userIds.length, userIds };
}

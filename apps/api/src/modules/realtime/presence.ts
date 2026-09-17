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

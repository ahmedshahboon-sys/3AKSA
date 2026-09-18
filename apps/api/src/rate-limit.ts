import { createHash } from 'node:crypto';
import { env } from './config.js';
import { getRedis } from './redis.js';

export type RateLimitResult = {
  allowed: boolean;
  limit: number;
  remaining: number;
  retryAfterSeconds: number;
};

function digestSubject(subject: string) {
  return createHash('sha256').update(subject).digest('hex').slice(0, 32);
}

export async function consumeRateLimit(
  bucket: string,
  subject: string,
  limit: number,
  windowSeconds: number
): Promise<RateLimitResult> {
  const redis = await getRedis();
  const key = `${env.REDIS_KEY_PREFIX}rate:${bucket}:${digestSubject(subject)}`;
  const count = await redis.incr(key);
  if (count === 1) await redis.expire(key, windowSeconds);

  let ttl = await redis.ttl(key);
  if (ttl < 0) {
    await redis.expire(key, windowSeconds);
    ttl = windowSeconds;
  }

  return {
    allowed: count <= limit,
    limit,
    remaining: Math.max(0, limit - count),
    retryAfterSeconds: Math.max(1, ttl)
  };
}

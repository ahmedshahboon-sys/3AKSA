import type { FastifyInstance } from 'fastify';
import { consumeRateLimit } from './rate-limit.js';

function requestSubject(authorization: string | undefined, ip: string) {
  const token = authorization?.trim();
  return token ? `auth:${token}` : `ip:${ip}`;
}

export function registerRequestRateLimits(app: FastifyInstance) {
  app.addHook('preHandler', async (request, reply) => {
    const route = request.routeOptions.url ?? '';
    const subject = requestSubject(request.headers.authorization, request.ip);

    let bucket: string | null = null;
    let limit = 0;
    let windowSeconds = 0;

    if (request.method === 'POST' && route.endsWith('/friends/requests')) {
      bucket = 'friend-request';
      limit = 20;
      windowSeconds = 60 * 60;
    } else if (request.method === 'POST' && route.endsWith('/reports')) {
      bucket = 'user-report';
      limit = 10;
      windowSeconds = 60 * 60;
    } else if (request.method === 'POST' && route.endsWith('/private/messages')) {
      bucket = 'private-start-rest';
      limit = 20;
      windowSeconds = 60;
    } else if (request.method === 'POST' && route.endsWith('/wallet/transfers')) {
      bucket = 'wallet-transfer';
      limit = 20;
      windowSeconds = 60;
    } else if (request.method === 'POST' && route.endsWith('/wallet/topups')) {
      bucket = 'wallet-topup-request';
      limit = 5;
      windowSeconds = 24 * 60 * 60;
    } else if (request.method === 'POST' && route.endsWith('/store/purchases')) {
      bucket = 'store-purchase';
      limit = 20;
      windowSeconds = 60;
    } else if (request.method === 'POST' && route.endsWith('/gifts/send')) {
      bucket = 'paid-gift';
      limit = 20;
      windowSeconds = 60;
    } else if ((request.method === 'PUT' || request.method === 'DELETE') && route.endsWith('/reactions/like')) {
      bucket = 'message-like';
      limit = 60;
      windowSeconds = 60;
    }

    if (!bucket) return;
    const result = await consumeRateLimit(bucket, subject, limit, windowSeconds);
    if (result.allowed) return;

    reply.header('Retry-After', String(result.retryAfterSeconds));
    return reply.code(429).send({
      error: 'RATE_LIMITED',
      retryAfterSeconds: result.retryAfterSeconds
    });
  });
}

import { createHash } from 'node:crypto';
import type { FastifyInstance,FastifyRequest } from 'fastify';
import { consumeRateLimit } from './rate-limit.js';
import { sessionTokenFromRequest } from './modules/auth/session.js';

export function requestSubject(request:Pick<FastifyRequest,'headers'|'ip'>) {
  const token=sessionTokenFromRequest(request as FastifyRequest);
  if(!token)return `ip:${request.ip}`;
  const tokenHash=createHash('sha256').update(token).digest('hex');
  return `session:${tokenHash}`;
}

export function registerRequestRateLimits(app: FastifyInstance) {
  app.addHook('preHandler', async (request, reply) => {
    const route = request.routeOptions.url ?? '';
    const subject = requestSubject(request);

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
    } else if (request.method === 'POST' && route.endsWith('/tv/admin/imports/m3u')) {
      bucket = 'tv-playlist-import';
      limit = 10;
      windowSeconds = 60 * 60;
    } else if (
      (request.method === 'POST' || request.method === 'PATCH' || request.method === 'PUT' || request.method === 'DELETE') &&
      route.includes('/tv/admin/')
    ) {
      bucket = 'tv-admin-write';
      limit = 60;
      windowSeconds = 60;
    } else if (request.method === 'PATCH' && route.endsWith('/rooms/:roomId/tv')) {
      bucket = 'room-tv-control';
      limit = 60;
      windowSeconds = 60;
    } else if (request.method === 'POST' && route.endsWith('/prayer/reference/resolve')) {
      bucket = 'prayer-reference-resolve';
      limit = 20;
      windowSeconds = 60 * 60;
    } else if (request.method === 'PATCH' && route.endsWith('/prayer/preferences')) {
      bucket = 'prayer-preferences';
      limit = 30;
      windowSeconds = 60;
    } else if (request.method === 'PATCH' && route.endsWith('/prayer/admin/settings')) {
      bucket = 'prayer-admin-settings';
      limit = 20;
      windowSeconds = 60 * 60;
    } else if (request.method === 'POST' && route.endsWith('/notifications/push/subscriptions')) {
      bucket = 'push-subscription-register';
      limit = 20;
      windowSeconds = 60 * 60;
    } else if (request.method === 'DELETE' && route.endsWith('/notifications/push/subscriptions/:id')) {
      bucket = 'push-subscription-delete';
      limit = 30;
      windowSeconds = 60 * 60;
    } else if (request.method === 'PATCH' && route.endsWith('/notifications/preferences')) {
      bucket = 'notification-preferences';
      limit = 30;
      windowSeconds = 60;
    } else if (
      request.method === 'POST' &&
      (route.endsWith('/admin/security/mfa/setup') || route.endsWith('/admin/security/mfa/confirm'))
    ) {
      bucket = 'admin-mfa';
      limit = 10;
      windowSeconds = 10 * 60;
    } else if (request.method === 'POST' && route.includes('/admin/break-glass/')) {
      bucket = 'admin-break-glass';
      limit = 10;
      windowSeconds = 60 * 60;
    } else if (
      ['POST','PATCH','PUT','DELETE'].includes(request.method) &&
      route.includes('/admin/')
    ) {
      bucket = 'admin-write';
      limit = 60;
      windowSeconds = 60;
    }

    if (!bucket) return;
    const result = await consumeRateLimit(bucket, subject, limit, windowSeconds);
    if(!result.allowed){
      reply.header('Retry-After',String(result.retryAfterSeconds));
      return reply.code(429).send({
        error:'RATE_LIMITED',
        retryAfterSeconds:result.retryAfterSeconds
      });
    }

    // Authenticated users get independent quotas even when many users share one NAT.
    // IP remains a separate, deliberately higher flood ceiling.
    if(subject.startsWith('session:')){
      const flood=await consumeRateLimit(
        `${bucket}-ip-flood`,
        `ip:${request.ip}`,
        Math.max(limit*20,200),
        windowSeconds
      );
      if(!flood.allowed){
        reply.header('Retry-After',String(flood.retryAfterSeconds));
        return reply.code(429).send({
          error:'RATE_LIMITED',
          retryAfterSeconds:flood.retryAfterSeconds
        });
      }
    }
    return;
    
  });
}

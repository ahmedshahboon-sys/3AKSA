import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { authenticateRequest } from '../auth/session.js';
import {
  formatLydFromMilli,
  transferWalletBalance,
  walletHistory,
  walletSummary
} from './service.js';

type TransferBody = {
  username?: string;
  amountMilli?: number;
};

type HistoryQuery = {
  limit?: string;
  before?: string;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function requireUser(request: FastifyRequest, reply: FastifyReply) {
  const user = await authenticateRequest(request);
  if (!user) reply.code(401).send({ error: 'UNAUTHORIZED' });
  return user;
}

function idempotencyKey(request: FastifyRequest) {
  const raw = request.headers['idempotency-key'];
  const value = Array.isArray(raw) ? raw[0] : raw;
  return typeof value === 'string' ? value.trim() : '';
}

export async function registerEconomyRoutes(app: FastifyInstance, options: { basePath: string }) {
  const walletPrefix = `${options.basePath}/wallet`;

  app.get(walletPrefix, async (request, reply) => {
    const user = await requireUser(request, reply);
    if (!user) return;
    return reply.send(await walletSummary(user.id));
  });

  app.get<{ Querystring: HistoryQuery }>(`${walletPrefix}/history`, async (request, reply) => {
    const user = await requireUser(request, reply);
    if (!user) return;

    const limitRaw = Number(request.query.limit ?? 30);
    const limit = Number.isFinite(limitRaw)
      ? Math.min(Math.max(Math.trunc(limitRaw), 1), 100)
      : 30;

    let before: Date | undefined;
    if (request.query.before) {
      const parsed = new Date(request.query.before);
      if (Number.isNaN(parsed.getTime())) {
        return reply.code(400).send({ error: 'INVALID_CURSOR' });
      }
      before = parsed;
    }

    const history = before
      ? await walletHistory(user.id, limit, before)
      : await walletHistory(user.id, limit);
    return reply.send({ history });
  });

  app.post<{ Body: TransferBody }>(`${walletPrefix}/transfers`, async (request, reply) => {
    const user = await requireUser(request, reply);
    if (!user) return;

    const username = request.body.username?.trim() ?? '';
    const amountMilli = request.body.amountMilli;
    const key = idempotencyKey(request);

    if (!UUID_RE.test(key)) {
      return reply.code(400).send({ error: 'INVALID_IDEMPOTENCY_KEY' });
    }
    if (!username) return reply.code(400).send({ error: 'INVALID_RECIPIENT' });
    if (!Number.isSafeInteger(amountMilli) || (amountMilli ?? 0) <= 0) {
      return reply.code(400).send({ error: 'INVALID_TRANSFER_AMOUNT' });
    }

    try {
      const result = await transferWalletBalance(user.id, username, amountMilli!, key);
      return reply.code(result.replayed ? 200 : 201).send({
        transaction: {
          id: result.transaction.id,
          kind: result.transaction.kind,
          createdAt: result.transaction.created_at
        },
        amountMilli,
        amountLyd: formatLydFromMilli(amountMilli!),
        balanceMilli: result.senderBalanceMilli,
        balanceLyd: formatLydFromMilli(result.senderBalanceMilli),
        currency: 'LYD',
        replayed: result.replayed
      });
    } catch (error) {
      const code = error instanceof Error ? error.message : '';
      if (code === 'RECIPIENT_NOT_FOUND') return reply.code(404).send({ error: code });
      if (
        code === 'CANNOT_TRANSFER_TO_SELF' ||
        code === 'INVALID_TRANSFER_AMOUNT' ||
        code === 'IDEMPOTENCY_KEY_REUSED'
      ) {
        return reply.code(409).send({ error: code });
      }
      if (code === 'INSUFFICIENT_BALANCE') return reply.code(409).send({ error: code });
      throw error;
    }
  });
}

import { env } from '../../config.js';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { authenticateRequest } from '../auth/session.js';
import { createNotification } from '../notifications/service.js';
import {
  formatLydFromMilli,
  transferWalletBalance,
  walletHistory,
  walletSummary
} from './service.js';
import {
  cancelManualTopupRequest,
  createManualTopupRequest,
  listManualTopupRequests
} from './topups.js';

type TransferBody = {
  username?: string;
  amountMilli?: number;
};

type TopupBody = { amountMilli?: number; paymentReference?: string; note?: string };

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

  app.get(`${walletPrefix}/topup-instructions`, async (request, reply) => {
    const user = await requireUser(request, reply);
    if (!user) return;

    return reply.send({
      method: 'whatsapp',
      contactNumber: env.ADMIN_WHATSAPP_NUMBER,
      currency: 'LYD',
      manualReviewRequired: true,
      requestStatus: 'pending_until_review'
    });
  });

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


  app.post<{ Body: TopupBody }>(`${walletPrefix}/topups`, async (request, reply) => {
    const user = await requireUser(request, reply);
    if (!user) return;

    const amountMilli = request.body.amountMilli;
    const paymentReference = request.body.paymentReference?.trim() || null;
    const note = request.body.note?.trim() || null;
    if (!Number.isSafeInteger(amountMilli) || (amountMilli ?? 0) <= 0) {
      return reply.code(400).send({ error: 'INVALID_TOPUP_AMOUNT' });
    }
    if ((paymentReference?.length ?? 0) > 160 || (note?.length ?? 0) > 500) {
      return reply.code(400).send({ error: 'INVALID_TOPUP_DETAILS' });
    }

    try {
      const topup = await createManualTopupRequest(
        user.id,
        amountMilli!,
        paymentReference,
        note
      );
      return reply.code(201).send({ topup });
    } catch (error) {
      const code = error instanceof Error ? error.message : '';
      if (code === 'TOPUP_REQUEST_ALREADY_PENDING') {
        return reply.code(409).send({ error: code });
      }
      if (code === 'INVALID_TOPUP_AMOUNT') return reply.code(400).send({ error: code });
      throw error;
    }
  });

  app.get(`${walletPrefix}/topups`, async (request, reply) => {
    const user = await requireUser(request, reply);
    if (!user) return;
    return reply.send({ topups: await listManualTopupRequests(user.id) });
  });

  app.delete<{ Params: { requestId: string } }>(
    `${walletPrefix}/topups/:requestId`,
    async (request, reply) => {
      const user = await requireUser(request, reply);
      if (!user) return;
      if (!UUID_RE.test(request.params.requestId)) {
        return reply.code(404).send({ error: 'TOPUP_REQUEST_NOT_FOUND' });
      }
      const cancelled = await cancelManualTopupRequest(user.id, request.params.requestId);
      if (!cancelled) return reply.code(404).send({ error: 'TOPUP_REQUEST_NOT_FOUND' });
      return reply.send({ topup: cancelled });
    }
  );

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
      if (!result.replayed) {
        await createNotification({
          userId: result.recipient.id,
          type: 'wallet_transfer',
          title: 'تحويل رصيد وارد',
          body: `${user.display_name} حول لك ${formatLydFromMilli(amountMilli!)} د.ل`,
          data: {
            transactionId: result.transaction.id,
            amountMilli: amountMilli!,
            username: user.username
          },
          soundKey: 'wallet_transfer'
        });
      }
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

import 'dotenv/config';
import { Pool } from 'pg';

const databaseUrl = process.env.DATABASE_URL?.trim();
if (!databaseUrl) throw new Error('DATABASE_URL is required for 3AKSA worker');

const db = new Pool({
  connectionString: databaseUrl,
  max: 2,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000
});

const CLEANUP_INTERVAL_MS = 60_000;
const CLEANUP_BATCH_SIZE = 500;
let stopping = false;
let cleanupRunning = false;
let cleanupTimer: NodeJS.Timeout | null = null;

function log(level: 'info' | 'warn' | 'error', message: string, extra: Record<string, unknown> = {}) {
  console[level](JSON.stringify({
    level,
    service: '3aksa-worker',
    message,
    timestamp: new Date().toISOString(),
    ...extra
  }));
}

async function purgeExpiredRoomMessages() {
  if (cleanupRunning || stopping) return;
  cleanupRunning = true;
  let deletedTotal = 0;

  try {
    while (!stopping) {
      const result = await db.query<{ id: string }>(
        `WITH doomed AS (
           SELECT id
           FROM room_messages
           WHERE expires_at <= now() OR deleted_at IS NOT NULL
           ORDER BY expires_at
           LIMIT $1
         )
         DELETE FROM room_messages m
         USING doomed d
         WHERE m.id = d.id
         RETURNING m.id`,
        [CLEANUP_BATCH_SIZE]
      );

      const deleted = result.rowCount ?? 0;
      deletedTotal += deleted;
      if (deleted < CLEANUP_BATCH_SIZE) break;
    }

    if (deletedTotal > 0) log('info', 'expired room messages purged', { deleted: deletedTotal });
  } catch (error) {
    log('error', 'room message cleanup failed', {
      error: error instanceof Error ? error.message : String(error)
    });
  } finally {
    cleanupRunning = false;
  }
}

async function shutdown(signal: string) {
  if (stopping) return;
  stopping = true;
  if (cleanupTimer) clearInterval(cleanupTimer);
  log('info', 'worker shutdown requested', { signal });

  const deadline = Date.now() + 5_000;
  while (cleanupRunning && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 50));
  }

  await db.end();
}

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    void shutdown(signal).finally(() => process.exit(0));
  });
}

log('info', 'worker started', { cleanupIntervalMs: CLEANUP_INTERVAL_MS });
await purgeExpiredRoomMessages();
cleanupTimer = setInterval(() => {
  void purgeExpiredRoomMessages();
}, CLEANUP_INTERVAL_MS);
cleanupTimer.unref();

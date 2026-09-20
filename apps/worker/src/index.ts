import 'dotenv/config';
import path from 'node:path';
import { Pool } from 'pg';
import { purgeExpiredEphemeralData } from './cleanup.js';

const databaseUrl = process.env.DATABASE_URL?.trim();
if (!databaseUrl) throw new Error('DATABASE_URL is required for 3AKSA worker');

const storageDriver = (process.env.STORAGE_DRIVER ?? 'local').trim();
const storageLocalRoot = (process.env.STORAGE_LOCAL_ROOT ?? './.data/storage').trim();
if (process.env.NODE_ENV === 'production' && storageDriver === 'local' && !path.isAbsolute(storageLocalRoot)) {
  throw new Error('STORAGE_LOCAL_ROOT must be absolute in production');
}
const resolvedStorageRoot = path.resolve(process.cwd(), storageLocalRoot);

const db = new Pool({
  connectionString: databaseUrl,
  max: 2,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000
});

const CLEANUP_INTERVAL_MS = 60_000;
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

async function purgeExpiredMessages() {
  if (cleanupRunning || stopping) return;
  cleanupRunning = true;

  try {
    const result = await purgeExpiredEphemeralData({
      db,
      storageDriver,
      storageRoot: resolvedStorageRoot,
      shouldStop: () => stopping,
      onError: (message, extra) => log('error', message, extra)
    });
    if (result.deleted > 0) {
      log('info', 'expired ephemeral data purged', result);
    }
  } catch (error) {
    log('error', 'message cleanup failed', {
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
await purgeExpiredMessages();
cleanupTimer = setInterval(() => {
  void purgeExpiredMessages();
}, CLEANUP_INTERVAL_MS);
cleanupTimer.unref();

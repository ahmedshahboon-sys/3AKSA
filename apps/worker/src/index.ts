import 'dotenv/config';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { Pool } from 'pg';

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

function storagePath(storageKey: string) {
  const full = path.resolve(resolvedStorageRoot, storageKey);
  if (!full.startsWith(`${resolvedStorageRoot}${path.sep}`)) throw new Error('INVALID_STORAGE_KEY');
  return full;
}

async function deleteVoiceFile(storageKey: string | null) {
  if (!storageKey || storageDriver !== 'local') return;
  try {
    await fs.unlink(storagePath(storageKey));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
}

async function purgeTable(table: 'room_messages' | 'private_messages') {
  let deletedTotal = 0;
  while (!stopping) {
    const doomed = await db.query<{ id: string; storage_key: string | null }>(
      `SELECT id, storage_key
       FROM ${table}
       WHERE expires_at <= now() OR deleted_at IS NOT NULL
       ORDER BY expires_at
       LIMIT $1`,
      [CLEANUP_BATCH_SIZE]
    );
    if (doomed.rows.length === 0) break;

    const removableIds: string[] = [];
    for (const row of doomed.rows) {
      try {
        await deleteVoiceFile(row.storage_key);
        removableIds.push(row.id);
      } catch (error) {
        log('error', 'voice file cleanup failed', {
          table,
          id: row.id,
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }

    if (removableIds.length > 0) {
      const removed = await db.query(
        `DELETE FROM ${table} WHERE id = ANY($1::uuid[])`,
        [removableIds]
      );
      deletedTotal += removed.rowCount ?? 0;
    }

    if (doomed.rows.length < CLEANUP_BATCH_SIZE || removableIds.length === 0) break;
  }
  return deletedTotal;
}

async function purgeExpiredNotifications() {
  let deletedTotal = 0;
  while (!stopping) {
    const removed = await db.query<{ id: string }>(
      `WITH doomed AS (
         SELECT id FROM notifications
         WHERE expires_at <= now()
         ORDER BY expires_at
         LIMIT $1
       )
       DELETE FROM notifications n
       USING doomed d
       WHERE n.id = d.id
       RETURNING n.id`,
      [CLEANUP_BATCH_SIZE]
    );
    deletedTotal += removed.rowCount ?? 0;
    if ((removed.rowCount ?? 0) < CLEANUP_BATCH_SIZE) break;
  }
  return deletedTotal;
}

async function purgeExpiredMessages() {
  if (cleanupRunning || stopping) return;
  cleanupRunning = true;

  try {
    const roomDeleted = await purgeTable('room_messages');
    const privateDeleted = await purgeTable('private_messages');
    const notificationDeleted = await purgeExpiredNotifications();
    if (roomDeleted > 0 || privateDeleted > 0 || notificationDeleted > 0) {
      log('info', 'expired ephemeral data purged', {
        roomDeleted,
        privateDeleted,
        notificationDeleted,
        deleted: roomDeleted + privateDeleted + notificationDeleted
      });
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

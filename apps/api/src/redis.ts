import { createClient } from 'redis';
import { env } from './config.js';

let client: ReturnType<typeof createClient> | null = null;
let connecting: Promise<ReturnType<typeof createClient>> | null = null;

export async function getRedis() {
  if (client?.isReady) return client;
  if (connecting) return connecting;

  const next = client ?? createClient({ url: env.REDIS_URL });
  if (!client) {
    next.on('error', (error) => {
      console.error('[redis]', error);
    });
    client = next;
  }

  connecting = next.connect().then(() => next).finally(() => {
    connecting = null;
  });
  return connecting;
}

export async function closeRedis() {
  const current = client;
  client = null;
  connecting = null;
  if (!current) return;
  if (current.isOpen) await current.quit();
}

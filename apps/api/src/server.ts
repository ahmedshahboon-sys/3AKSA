import { buildApp } from './app.js';
import { env } from './config.js';

const app = await buildApp();

async function shutdown(signal: string) {
  app.log.info({ signal }, 'shutdown requested');
  await app.close();
  process.exit(0);
}

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    void shutdown(signal);
  });
}

try {
  await app.listen({
    host: env.API_HOST,
    port: env.API_PORT
  });
} catch (error) {
  app.log.error(error, 'failed to start API');
  process.exit(1);
}

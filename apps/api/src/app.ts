import Fastify from 'fastify';
import { apiBasePath, env } from './config.js';
import { db } from './db.js';
import { registerAuthRoutes } from './modules/auth/routes.js';
import { registerHealthRoutes } from './modules/health/routes.js';

export async function buildApp() {
  const app = Fastify({
    logger: {
      level: env.NODE_ENV === 'production' ? 'info' : 'debug'
    },
    trustProxy: false,
    bodyLimit: 64 * 1024
  });

  app.addHook('onClose', async () => {
    await db.end();
  });

  await registerHealthRoutes(app, {
    basePath: apiBasePath,
    version: env.APP_VERSION
  });

  await registerAuthRoutes(app, {
    basePath: apiBasePath
  });

  return app;
}

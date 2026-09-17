import Fastify from 'fastify';
import { apiBasePath, env } from './config.js';
import { registerHealthRoutes } from './modules/health/routes.js';

export async function buildApp() {
  const app = Fastify({
    logger: {
      level: env.NODE_ENV === 'production' ? 'info' : 'debug'
    },
    trustProxy: false
  });

  await registerHealthRoutes(app, {
    basePath: apiBasePath,
    version: env.APP_VERSION
  });

  return app;
}

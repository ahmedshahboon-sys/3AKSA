import Fastify from 'fastify';
import { apiBasePath, env } from './config.js';
import { db } from './db.js';
import { registerAuthRoutes } from './modules/auth/routes.js';
import { registerEconomyRoutes } from './modules/economy/routes.js';
import { registerStoreRoutes } from './modules/economy/store-routes.js';
import { registerHealthRoutes } from './modules/health/routes.js';
import { registerMessageRoutes } from './modules/messages/routes.js';
import { registerNearbyRoutes } from './modules/nearby/routes.js';
import { registerPrivateRoutes } from './modules/private/routes.js';
import { registerReactionRoutes } from './modules/reactions/routes.js';
import { attachRealtime } from './modules/realtime/socket.js';
import { registerRoomRoutes } from './modules/rooms/routes.js';
import { registerSocialRoutes } from './modules/social/routes.js';
import { registerSuggestionRoutes } from './modules/social/suggestions.js';
import { registerTvRoutes } from './modules/tv/routes.js';
import { registerRequestRateLimits } from './request-rate-limits.js';

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

  registerRequestRateLimits(app);

  await registerHealthRoutes(app, {
    basePath: apiBasePath,
    version: env.APP_VERSION
  });

  await registerAuthRoutes(app, {
    basePath: apiBasePath
  });

  await registerSocialRoutes(app, {
    basePath: apiBasePath
  });

  await registerSuggestionRoutes(app, {
    basePath: apiBasePath
  });

  await registerNearbyRoutes(app, {
    basePath: apiBasePath
  });

  await registerEconomyRoutes(app, {
    basePath: apiBasePath
  });

  await registerStoreRoutes(app, {
    basePath: apiBasePath
  });

  await registerRoomRoutes(app, {
    basePath: apiBasePath
  });

  await registerMessageRoutes(app, {
    basePath: apiBasePath
  });

  await registerPrivateRoutes(app, {
    basePath: apiBasePath
  });

  await registerReactionRoutes(app, {
    basePath: apiBasePath
  });

  await registerTvRoutes(app, {
    basePath: apiBasePath
  });

  attachRealtime(app);

  return app;
}

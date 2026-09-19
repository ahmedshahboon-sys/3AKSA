import Fastify from 'fastify';
import { apiBasePath, env } from './config.js';
import { db } from './db.js';
import { closeRedis } from './redis.js';
import { registerAuthRoutes } from './modules/auth/routes.js';
import { registerAuthRecoveryRoutes } from './modules/auth/recovery.js';
import { registerAuthDeviceRoutes } from './modules/auth/devices.js';
import { registerAdminRoutes } from './modules/admin/routes.js';
import { registerEconomyRoutes } from './modules/economy/routes.js';
import { registerStoreRoutes } from './modules/economy/store-routes.js';
import { registerAdminStoreRoutes } from './modules/economy/admin-store.js';
import { registerHealthRoutes } from './modules/health/routes.js';
import { registerMessageRoutes } from './modules/messages/routes.js';
import { registerNearbyRoutes } from './modules/nearby/routes.js';
import { registerNotificationRoutes } from './modules/notifications/routes.js';
import { startNotificationDispatcher } from './modules/notifications/service.js';
import { registerPrivateRoutes } from './modules/private/routes.js';
import { registerPrayerRoutes } from './modules/prayer/routes.js';
import { startPrayerScheduler } from './modules/prayer/scheduler.js';
import { registerReactionRoutes } from './modules/reactions/routes.js';
import { registerReleaseRoutes } from './modules/releases/routes.js';
import { attachRealtime } from './modules/realtime/socket.js';
import { registerRoomRoutes } from './modules/rooms/routes.js';
import { registerSocialRoutes } from './modules/social/routes.js';
import { registerSuggestionRoutes } from './modules/social/suggestions.js';
import { registerTvRoutes } from './modules/tv/routes.js';
import { registerRequestRateLimits } from './request-rate-limits.js';
import { registerHttpSecurity } from './security-http.js';
import { assertProductionSecurity } from './production-security.js';

export async function buildApp() {
  assertProductionSecurity(env);
  const app = Fastify({
    logger: {
      level: env.NODE_ENV === 'production' ? 'info' : 'debug'
    },
    trustProxy: env.TRUSTED_PROXY_CIDRS.split(',').map((value)=>value.trim()).filter(Boolean),
    bodyLimit: 64 * 1024
  });

  app.addHook('onClose', async () => {
    await closeRedis();
    await db.end();
  });

  registerHttpSecurity(app);
  registerRequestRateLimits(app);

  await registerHealthRoutes(app, {
    basePath: apiBasePath,
    version: env.APP_VERSION
  });

  await registerAuthRoutes(app, {
    basePath: apiBasePath
  });

  await registerAuthRecoveryRoutes(app, {
    basePath: apiBasePath
  });

  await registerAuthDeviceRoutes(app, {
    basePath: apiBasePath
  });

  await registerAdminRoutes(app, {
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

  await registerNotificationRoutes(app, {
    basePath: apiBasePath
  });

  await registerEconomyRoutes(app, {
    basePath: apiBasePath
  });

  await registerStoreRoutes(app, {
    basePath: apiBasePath
  });

  await registerAdminStoreRoutes(app, {
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

  await registerReleaseRoutes(app, {
    basePath: apiBasePath
  });

  await registerPrayerRoutes(app, {
    basePath: apiBasePath
  });

  await registerTvRoutes(app, {
    basePath: apiBasePath
  });

  attachRealtime(app);

  const stopPrayerScheduler = env.NODE_ENV === 'test' ? null : startPrayerScheduler();
  const stopNotificationDispatcher = env.NODE_ENV === 'test' ? null : startNotificationDispatcher();
  if (stopPrayerScheduler || stopNotificationDispatcher) {
    app.addHook('onClose', async () => {
      stopPrayerScheduler?.();
      stopNotificationDispatcher?.();
    });
  }

  return app;
}

import type { FastifyInstance } from 'fastify';

interface HealthRouteOptions {
  basePath: string;
  version: string;
}

export async function registerHealthRoutes(app: FastifyInstance, options: HealthRouteOptions) {
  const { basePath, version } = options;

  app.get(`${basePath}/health`, async () => ({
    status: 'ok',
    service: '3aksa-api',
    version,
    timestamp: new Date().toISOString()
  }));

  app.get(`${basePath}/ready`, async (_request, reply) => {
    return reply.code(200).send({
      status: 'ready',
      service: '3aksa-api',
      version,
      checks: {
        database: 'foundation-not-wired',
        redis: 'foundation-not-wired',
        storage: 'foundation-not-wired'
      },
      timestamp: new Date().toISOString()
    });
  });
}

import { constants, promises as fs } from 'node:fs';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import { env } from '../../config.js';
import { query } from '../../db.js';
import { getRedis } from '../../redis.js';

interface HealthRouteOptions {
  basePath: string;
  version: string;
}

type Check='ok'|'error'|'unsupported';

async function databaseCheck():Promise<Check>{
  try{
    await query('SELECT 1');
    return 'ok';
  }catch{
    return 'error';
  }
}

async function redisCheck():Promise<Check>{
  try{
    const redis=await getRedis();
    return (await redis.ping())==='PONG'?'ok':'error';
  }catch{
    return 'error';
  }
}

async function storageCheck():Promise<Check>{
  if(env.STORAGE_DRIVER!=='local')return 'unsupported';
  try{
    const root=path.resolve(process.cwd(),env.STORAGE_LOCAL_ROOT);
    await fs.mkdir(root,{recursive:true,mode:0o700});
    await fs.access(root,constants.R_OK|constants.W_OK);
    return 'ok';
  }catch{
    return 'error';
  }
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
    const [database,redis,storage]=await Promise.all([
      databaseCheck(),
      redisCheck(),
      storageCheck()
    ]);
    const ready=database==='ok'&&redis==='ok'&&storage==='ok';
    return reply.code(ready?200:503).send({
      status:ready?'ready':'not_ready',
      service:'3aksa-api',
      version,
      checks:{database,redis,storage},
      timestamp:new Date().toISOString()
    });
  });
}

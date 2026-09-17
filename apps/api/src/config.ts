import 'dotenv/config';
import { serverEnvSchema } from '@3aksa/config';

export const env = serverEnvSchema.parse(process.env);

export const apiBasePath = env.API_BASE_PATH.replace(/\/+$/, '');

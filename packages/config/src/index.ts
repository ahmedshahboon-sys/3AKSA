import { z } from 'zod';

const basePathSchema = z
  .string()
  .min(1)
  .transform((value) => {
    const trimmed = value.trim();
    const withLeadingSlash = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
    return withLeadingSlash.endsWith('/') ? withLeadingSlash : `${withLeadingSlash}/`;
  });

export function normalizeBasePath(value: string): string {
  return basePathSchema.parse(value);
}

export function joinBasePath(basePath: string, childPath: string): string {
  const base = normalizeBasePath(basePath);
  const child = childPath.replace(/^\/+/, '');
  return `${base}${child}`;
}

export const serverEnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  APP_VERSION: z.string().default('0.0.0-dev'),
  API_HOST: z.string().default('127.0.0.1'),
  API_PORT: z.coerce.number().int().min(1).max(65535).default(3101),
  API_BASE_PATH: z.string().default('/3aksa/api'),
  SOCKET_PATH: z.string().default('/3aksa/socket.io'),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),
  REDIS_KEY_PREFIX: z.string().min(1).default('3aksa:'),
  STORAGE_DRIVER: z.enum(['local', 's3']).default('local'),
  STORAGE_LOCAL_ROOT: z.string().default('./.data/storage'),
  SESSION_SECRET: z.string().min(32),
  PASSWORD_PEPPER: z.string().min(32),
  ADMIN_WHATSAPP_NUMBER: z.string().trim().max(32).default('0912992050'),
  ADMIN_MFA_ENCRYPTION_KEY: z.string().min(32).optional(),
  WEB_ALLOWED_ORIGINS: z.string().trim().min(1).optional(),
  PUSH_ENCRYPTION_KEY: z.string().min(32).optional(),
  WEB_PUSH_VAPID_PUBLIC_KEY: z.string().trim().min(1).optional(),
  WEB_PUSH_VAPID_PRIVATE_KEY: z.string().trim().min(1).optional(),
  WEB_PUSH_SUBJECT: z.string().trim().default('mailto:admin@3aksa.local'),
  FCM_PROJECT_ID: z.string().trim().min(1).optional(),
  FCM_CLIENT_EMAIL: z.string().trim().email().optional(),
  FCM_PRIVATE_KEY: z.string().min(1).optional()
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

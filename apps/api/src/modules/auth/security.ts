import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { env } from '../../config.js';

const scrypt = promisify(scryptCallback);
const KEY_LENGTH = 64;
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export function normalizeUsername(value: string): string {
  return value.normalize('NFKC').trim().toLowerCase();
}

export function usernameReservationKey(value: string): string {
  return normalizeUsername(value).replace(/[._-]+/g, '');
}

export function normalizePhone(value: string): string {
  const trimmed = value.trim();
  const hasPlus = trimmed.startsWith('+');
  const digits = trimmed.replace(/\D/g, '');
  return `${hasPlus ? '+' : ''}${digits}`;
}

export function validateUsername(value: string): boolean {
  return /^[A-Za-z0-9._-]{3,24}$/.test(value);
}

export function validatePhone(value: string): boolean {
  return /^\+?\d{8,15}$/.test(value);
}

export function validatePassword(value: string): boolean {
  return value.length >= 8 && value.length <= 128;
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = (await scrypt(`${password}${env.PASSWORD_PEPPER}`, salt, KEY_LENGTH, {
    N: 16_384,
    r: 8,
    p: 1,
    maxmem: 64 * 1024 * 1024
  })) as Buffer;

  return `scrypt$16384$8$1$${salt.toString('base64url')}$${derived.toString('base64url')}`;
}

export async function verifyPassword(password: string, encoded: string): Promise<boolean> {
  const [algorithm, nRaw, rRaw, pRaw, saltRaw, expectedRaw] = encoded.split('$');
  if (algorithm !== 'scrypt' || !nRaw || !rRaw || !pRaw || !saltRaw || !expectedRaw) return false;

  const expected = Buffer.from(expectedRaw, 'base64url');
  const salt = Buffer.from(saltRaw, 'base64url');
  const derived = (await scrypt(`${password}${env.PASSWORD_PEPPER}`, salt, expected.length, {
    N: Number(nRaw),
    r: Number(rRaw),
    p: Number(pRaw),
    maxmem: 64 * 1024 * 1024
  })) as Buffer;

  return expected.length === derived.length && timingSafeEqual(expected, derived);
}

export function createSessionToken() {
  const token = randomBytes(32).toString('base64url');
  return {
    token,
    tokenHash: hashSessionToken(token),
    expiresAt: new Date(Date.now() + SESSION_TTL_MS)
  };
}

export function hashSessionToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

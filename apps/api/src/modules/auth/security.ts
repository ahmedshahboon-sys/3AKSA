import {
  createHash,
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
  type ScryptOptions
} from 'node:crypto';
import { env } from '../../config.js';

const KEY_LENGTH = 64;
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

function scrypt(password: string, salt: Buffer, keyLength: number, options: ScryptOptions): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCallback(password, salt, keyLength, options, (error, derivedKey) => {
      if (error) reject(error);
      else resolve(derivedKey);
    });
  });
}

export function normalizeUsername(value: string): string {
  return value.normalize('NFKC').trim().toLowerCase();
}

export function usernameReservationKey(value: string): string {
  return normalizeUsername(value).replace(/[._-]+/g, '');
}

export function isOwnerUsername(value: string): boolean {
  return normalizeUsername(value) === normalizeUsername(env.OWNER_USERNAME);
}

export function ownerClaimConfigured(): boolean {
  return Boolean(env.OWNER_CLAIM_SECRET);
}

export function verifyOwnerClaimSecret(value: string): boolean {
  const expected = env.OWNER_CLAIM_SECRET;
  if (!expected || !value) return false;
  const expectedDigest = createHash('sha256').update(expected).digest();
  const actualDigest = createHash('sha256').update(value).digest();
  return timingSafeEqual(expectedDigest, actualDigest);
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
  const derived = await scrypt(`${password}${env.PASSWORD_PEPPER}`, salt, KEY_LENGTH, {
    N: 16_384,
    r: 8,
    p: 1,
    maxmem: 64 * 1024 * 1024
  });

  return `scrypt$16384$8$1$${salt.toString('base64url')}$${derived.toString('base64url')}`;
}

export async function verifyPassword(password: string, encoded: string): Promise<boolean> {
  const [algorithm, nRaw, rRaw, pRaw, saltRaw, expectedRaw] = encoded.split('$');
  if (algorithm !== 'scrypt' || !nRaw || !rRaw || !pRaw || !saltRaw || !expectedRaw) return false;

  const expected = Buffer.from(expectedRaw, 'base64url');
  const salt = Buffer.from(saltRaw, 'base64url');
  const derived = await scrypt(`${password}${env.PASSWORD_PEPPER}`, salt, expected.length, {
    N: Number(nRaw),
    r: Number(rRaw),
    p: Number(pRaw),
    maxmem: 64 * 1024 * 1024
  });

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

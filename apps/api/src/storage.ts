import { createReadStream, promises as fs } from 'node:fs';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { env } from './config.js';

export const MAX_VOICE_BYTES = 3 * 1024 * 1024;
export const MAX_VOICE_DURATION_MS = 120_000;
export const MIN_VOICE_DURATION_MS = 250;

type VoiceFormat = { mime: 'audio/webm' | 'audio/ogg' | 'audio/mp4'; extension: 'webm' | 'ogg' | 'm4a' };

function storageRoot() {
  if (env.NODE_ENV === 'production' && !path.isAbsolute(env.STORAGE_LOCAL_ROOT)) {
    throw new Error('STORAGE_LOCAL_ROOT_ABSOLUTE_REQUIRED');
  }
  return path.resolve(process.cwd(), env.STORAGE_LOCAL_ROOT);
}

function localPath(storageKey: string) {
  const root = storageRoot();
  const full = path.resolve(root, storageKey);
  if (!full.startsWith(`${root}${path.sep}`)) throw new Error('INVALID_STORAGE_KEY');
  return full;
}

function sniffVoiceFormat(buffer: Buffer): VoiceFormat | null {
  if (buffer.length >= 4 && buffer[0] === 0x1a && buffer[1] === 0x45 && buffer[2] === 0xdf && buffer[3] === 0xa3) {
    return { mime: 'audio/webm', extension: 'webm' };
  }
  if (buffer.length >= 4 && buffer.subarray(0, 4).toString('ascii') === 'OggS') {
    return { mime: 'audio/ogg', extension: 'ogg' };
  }
  if (buffer.length >= 12 && buffer.subarray(4, 8).toString('ascii') === 'ftyp') {
    return { mime: 'audio/mp4', extension: 'm4a' };
  }
  return null;
}

export function normalizeVoiceBinary(value: unknown): Buffer | null {
  if (Buffer.isBuffer(value)) return value;
  if (value instanceof Uint8Array) return Buffer.from(value);
  if (value instanceof ArrayBuffer) return Buffer.from(value);
  return null;
}

export function validateVoiceBinary(buffer: Buffer, durationMs: number) {
  if (buffer.length < 1 || buffer.length > MAX_VOICE_BYTES) throw new Error('VOICE_SIZE_INVALID');
  if (!Number.isInteger(durationMs) || durationMs < MIN_VOICE_DURATION_MS || durationMs > MAX_VOICE_DURATION_MS) {
    throw new Error('VOICE_DURATION_INVALID');
  }
  const format = sniffVoiceFormat(buffer);
  if (!format) throw new Error('VOICE_FORMAT_INVALID');
  return format;
}

export async function storeVoiceBinary(buffer: Buffer, durationMs: number) {
  if (env.STORAGE_DRIVER !== 'local') throw new Error('STORAGE_DRIVER_UNSUPPORTED');
  const format = validateVoiceBinary(buffer, durationMs);
  const key = `voice/${randomUUID()}.${format.extension}`;
  const target = localPath(key);
  await fs.mkdir(path.dirname(target), { recursive: true, mode: 0o700 });
  await fs.writeFile(target, buffer, { flag: 'wx', mode: 0o600 });
  return { storageKey: key, mime: format.mime, bytes: buffer.length, durationMs };
}

export async function deleteStoredVoice(storageKey: string | null | undefined) {
  if (!storageKey || env.STORAGE_DRIVER !== 'local') return;
  try {
    await fs.unlink(localPath(storageKey));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
}

export function openStoredFile(storageKey: string) {
  if (env.STORAGE_DRIVER !== 'local') throw new Error('STORAGE_DRIVER_UNSUPPORTED');
  return createReadStream(localPath(storageKey));
}

export function openStoredVoice(storageKey: string) {
  return openStoredFile(storageKey);
}

import { createReadStream, promises as fs } from 'node:fs';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { env } from './config.js';

export const MAX_VOICE_BYTES = 3 * 1024 * 1024;
export const MAX_VOICE_DURATION_MS = 120_000;
export const MIN_VOICE_DURATION_MS = 250;
export const MAX_STORE_ASSET_BYTES = 1024 * 1024;

type StoreAssetFormat = { mime: 'image/png'|'image/webp'|'image/gif'|'audio/mpeg'|'audio/ogg'|'audio/webm'; extension: 'png'|'webp'|'gif'|'mp3'|'ogg'|'webm' };
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

function sniffStoreAssetFormat(buffer: Buffer): StoreAssetFormat | null {
  if(buffer.length>=8 && buffer.subarray(0,8).equals(Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]))){
    return {mime:'image/png',extension:'png'};
  }
  if(buffer.length>=12 && buffer.subarray(0,4).toString('ascii')==='RIFF' && buffer.subarray(8,12).toString('ascii')==='WEBP'){
    return {mime:'image/webp',extension:'webp'};
  }
  if(buffer.length>=6 && ['GIF87a','GIF89a'].includes(buffer.subarray(0,6).toString('ascii'))){
    return {mime:'image/gif',extension:'gif'};
  }
  if(buffer.length>=4 && buffer.subarray(0,4).toString('ascii')==='OggS'){
    return {mime:'audio/ogg',extension:'ogg'};
  }
  if(buffer.length>=4 && buffer[0]===0x1a && buffer[1]===0x45 && buffer[2]===0xdf && buffer[3]===0xa3){
    return {mime:'audio/webm',extension:'webm'};
  }
  if(buffer.length>=3 && buffer.subarray(0,3).toString('ascii')==='ID3'){
    return {mime:'audio/mpeg',extension:'mp3'};
  }
  if(buffer.length>=2 && buffer[0]===0xff && (buffer[1]!&0xe0)===0xe0){
    return {mime:'audio/mpeg',extension:'mp3'};
  }
  return null;
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

export async function storeStoreAsset(buffer:Buffer,itemType:string){
  if(env.STORAGE_DRIVER!=='local')throw new Error('STORAGE_DRIVER_UNSUPPORTED');
  if(buffer.length<1||buffer.length>MAX_STORE_ASSET_BYTES)throw new Error('STORE_ASSET_SIZE_INVALID');
  const format=sniffStoreAssetFormat(buffer);
  if(!format)throw new Error('STORE_ASSET_FORMAT_INVALID');
  const isAudio=format.mime.startsWith('audio/');
  if(itemType==='entry_sound'){
    if(!isAudio)throw new Error('STORE_ASSET_TYPE_MISMATCH');
  }else if(isAudio){
    throw new Error('STORE_ASSET_TYPE_MISMATCH');
  }
  const key=`store/${randomUUID()}.${format.extension}`;
  const target=localPath(key);
  await fs.mkdir(path.dirname(target),{recursive:true,mode:0o700});
  await fs.writeFile(target,buffer,{flag:'wx',mode:0o600});
  return {storageKey:key,mime:format.mime,bytes:buffer.length};
}

export async function deleteStoredFile(storageKey:string|null|undefined){
  if(!storageKey||env.STORAGE_DRIVER!=='local')return;
  try{await fs.unlink(localPath(storageKey));}
  catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}
}

export async function deleteStoredVoice(storageKey: string | null | undefined) {
  return deleteStoredFile(storageKey);
}

export function openStoredFile(storageKey: string) {
  if (env.STORAGE_DRIVER !== 'local') throw new Error('STORAGE_DRIVER_UNSUPPORTED');
  return createReadStream(localPath(storageKey));
}

export function openStoredVoice(storageKey: string) {
  return openStoredFile(storageKey);
}

import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { env } from '../../config.js';

function encryptionKey() {
  if (env.NODE_ENV === 'production' && !env.PUSH_ENCRYPTION_KEY) {
    throw new Error('PUSH_ENCRYPTION_KEY_REQUIRED');
  }
  return createHash('sha256').update(env.PUSH_ENCRYPTION_KEY ?? env.SESSION_SECRET).digest();
}

export function encryptPushPayload(value: unknown) {
  const iv=randomBytes(12);
  const cipher=createCipheriv('aes-256-gcm',encryptionKey(),iv);
  const plaintext=Buffer.from(JSON.stringify(value),'utf8');
  const ciphertext=Buffer.concat([cipher.update(plaintext),cipher.final()]);
  const tag=cipher.getAuthTag();
  return [iv,tag,ciphertext].map((part)=>part.toString('base64url')).join('.');
}

export function decryptPushPayload<T>(value:string):T {
  const parts=value.split('.');
  if(parts.length!==3) throw new Error('PUSH_PAYLOAD_INVALID');
  const [ivRaw,tagRaw,cipherRaw]=parts;
  const iv=Buffer.from(ivRaw!,'base64url');
  const tag=Buffer.from(tagRaw!,'base64url');
  const ciphertext=Buffer.from(cipherRaw!,'base64url');
  const decipher=createDecipheriv('aes-256-gcm',encryptionKey(),iv);
  decipher.setAuthTag(tag);
  const plaintext=Buffer.concat([decipher.update(ciphertext),decipher.final()]);
  return JSON.parse(plaintext.toString('utf8')) as T;
}

export function pushEndpointHash(value:string){
  return createHash('sha256').update(value).digest('hex');
}

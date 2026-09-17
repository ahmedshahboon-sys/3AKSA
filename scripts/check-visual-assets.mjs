import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';

const expected = {
  'apps/web/public/icons/logo-main-192.png': '4bb2eac7c30f3478fbc3d5bdf66b7aa5102c9fbe86d530717c22a147c5b45a4d',
  'apps/web/public/icons/logo-main-512.png': '94791769c2939a870bfd8018af21d2a06473dc5a15be08913269e78da6511d88',
  'apps/web/public/icons/logo-pink-512.png': '21d0af7698c6919085886512891f4ab63d4dcf52fb41cfd0ba874313f8c11bc9',
};

const pngSignature = Buffer.from('89504e470d0a1a0a', 'hex');
const failures = [];

for (const [path, expectedHash] of Object.entries(expected)) {
  const url = new URL(`../${path}`, import.meta.url);
  if (!existsSync(url)) {
    failures.push(`${path}: missing`);
    continue;
  }

  const bytes = readFileSync(url);
  if (!bytes.subarray(0, pngSignature.length).equals(pngSignature)) {
    failures.push(`${path}: invalid PNG signature`);
    continue;
  }

  const actualHash = createHash('sha256').update(bytes).digest('hex');
  if (actualHash !== expectedHash) failures.push(`${path}: SHA-256 mismatch (${actualHash})`);
}

if (failures.length) {
  console.error('Official 3AKSA visual assets are incomplete or modified:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`Verified ${Object.keys(expected).length} official 3AKSA runtime logo assets.`);

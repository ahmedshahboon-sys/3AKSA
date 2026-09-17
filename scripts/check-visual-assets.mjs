import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';

const expected = {
  'apps/web/public/icons/logo-main-32.png': 'e6473b22826631d1d4bccf631487e0a79c7ea21512b6e35b8e8042214c58227c',
  'apps/web/public/icons/logo-main-48.png': 'a1f7f4dbab908aee3dfe0d98de2a944775e586c553e605c9eac0ac4245dfb061',
  'apps/web/public/icons/logo-main-128.png': 'eff53b58632d6f0a6983e357db9c055998338b0ce4901a265caade9d58df74f2',
  'apps/web/public/icons/logo-main-180.png': '7cc288be911b1acc6a8968a56e63aef9e821905eb1204ab9c2100a4c9e516747',
  'apps/web/public/icons/logo-main-192.png': '4bb2eac7c30f3478fbc3d5bdf66b7aa5102c9fbe86d530717c22a147c5b45a4d',
  'apps/web/public/icons/logo-main-512.png': '94791769c2939a870bfd8018af21d2a06473dc5a15be08913269e78da6511d88',
  'apps/web/public/icons/logo-main-1024.png': 'ec5841ee418a8ae5e64d4c058a388d81f203ed0c62af2b7866b80c37a284d1c7',
  'apps/web/public/icons/logo-pink-128.png': '3990dec357a584635692148f9570c955e46248ce5b32f696f8a4ba4856009bc0',
  'apps/web/public/icons/logo-pink-512.png': '21d0af7698c6919085886512891f4ab63d4dcf52fb41cfd0ba874313f8c11bc9',
  'apps/web/public/icons/logo-pink-1024.png': 'a2bc47741cecf225f9fa3447efa0b674a126fa98d3c8888a3baf67fba79286b5',
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
  if (actualHash !== expectedHash) {
    failures.push(`${path}: SHA-256 mismatch (${actualHash})`);
  }
}

if (failures.length) {
  console.error('Official 3AKSA visual assets are incomplete or modified:');
  for (const failure of failures) console.error(`- ${failure}`);
  console.error('\nImport the untouched official files with:');
  console.error('bash scripts/import-visual-assets.sh /path/to/3AKSA_VISUAL_SOURCE_OF_TRUTH.zip');
  process.exit(1);
}

console.log(`Verified ${Object.keys(expected).length} official 3AKSA runtime logo assets.`);

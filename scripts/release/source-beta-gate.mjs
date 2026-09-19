import {existsSync,readFileSync} from 'node:fs';

const required=[
  'docs/deployment/GROUP10_PRODUCTION_BOOTSTRAP.md',
  'docs/qa/GROUP11_FINAL_PHYSICAL_QA.md',
  'docs/qa/GROUP11_EVIDENCE_TEMPLATE.md',
  'docs/releases/1.0.1-public-beta.md',
  'docs/releases/PUBLIC_BETA_CHECKLIST.md',
  '.github/workflows/trusted-release.yml',
  '.github/workflows/android-release-candidate.yml'
];

for(const path of required){
  if(!existsSync(path))throw new Error(`Missing release prerequisite: ${path}`);
}

const trusted=readFileSync('.github/workflows/trusted-release.yml','utf8');
for(const value of [
  'ANDROID_KEYSTORE_BASE64',
  'ANDROID_KEYSTORE_PASSWORD',
  'ANDROID_KEY_ALIAS',
  'ANDROID_KEY_PASSWORD',
  'apksigner',
  '--print-certs',
  'sha256sum'
]){
  if(!trusted.includes(value))throw new Error(`Trusted release proof missing: ${value}`);
}

const candidate=readFileSync('.github/workflows/android-release-candidate.yml','utf8');
if(!candidate.includes('ANDROID_VERSION_NAME: "1.0.1"'))throw new Error('Android RC versionName is not 1.0.1');
if(!candidate.includes('ANDROID_VERSION_CODE: "2"'))throw new Error('Android RC versionCode is not 2');
if(!candidate.includes("package: name='ly.threeaksa.app'"))throw new Error('Android application identity check missing');

const beta=readFileSync('docs/releases/PUBLIC_BETA_CHECKLIST.md','utf8');
for(const blocker of ['BLOCKED_EXTERNAL','No open P0','No open P1','Admin MFA','apksigner verify']){
  if(!beta.includes(blocker))throw new Error(`Public Beta gate missing: ${blocker}`);
}

console.log('3AKSA source release gate passed.');
console.log('External Production, signing and physical-device evidence is still required before Public Beta.');

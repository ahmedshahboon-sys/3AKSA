import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';

const root=new URL('../',import.meta.url);
const read=(path)=>readFileSync(new URL(path,root),'utf8');

test('Group 12 source beta gate passes without claiming external evidence',()=>{
  const output=execFileSync(process.execPath,[new URL('scripts/release/source-beta-gate.mjs',root).pathname],{
    cwd:new URL('.',root).pathname,
    encoding:'utf8'
  });
  assert.match(output,/source release gate passed/);
  assert.match(output,/External Production, signing and physical-device evidence is still required/);
});

test('Group 12 release candidate identity is fixed to 1.0.1 code 2',()=>{
  const notes=read('docs/releases/1.0.1-public-beta.md');
  const rc=read('.github/workflows/android-release-candidate.yml');
  assert.ok(notes.includes('RELEASE CANDIDATE — NOT YET PUBLICLY RELEASED'));
  assert.ok(notes.includes('versionName: `1.0.1`'));
  assert.ok(notes.includes('versionCode: `2`'));
  assert.ok(rc.includes('ANDROID_VERSION_NAME: "1.0.1"'));
  assert.ok(rc.includes('ANDROID_VERSION_CODE: "2"'));
});

test('Group 12 requires signed artifact and physical production proof before beta',()=>{
  const gate=read('docs/releases/PUBLIC_BETA_CHECKLIST.md');
  for(const phrase of [
    'apksigner verify',
    'Signing certificate SHA-256',
    'Physical Android cold start PASS',
    'Post-login',
    'No open P0',
    'No open P1',
    'must stay Draft/unmerged'
  ])assert.ok(gate.includes(phrase),phrase);
});

test('Group 12 trusted release retains APK hash and certificate proof',()=>{
  const trusted=read('.github/workflows/trusted-release.yml');
  assert.ok(trusted.includes('--print-certs'));
  assert.ok(trusted.includes('sha256sum'));
  assert.ok(trusted.includes('.apk.cert.txt'));
  assert.ok(trusted.includes('.apk.sha256'));
  assert.ok(trusted.includes('Require release signing secrets'));
});

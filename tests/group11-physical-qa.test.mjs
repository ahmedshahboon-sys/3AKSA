import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';

const root=new URL('../',import.meta.url);
const read=(path)=>readFileSync(new URL(path,root),'utf8');

test('Group 11 Android evidence harness is shell-syntax valid and privacy bounded',()=>{
  const path=new URL('scripts/qa/android-device-evidence.sh',root).pathname;
  execFileSync('bash',['-n',path],{stdio:'pipe'});
  const script=read('scripts/qa/android-device-evidence.sh');
  assert.ok(script.includes('ly.threeaksa.app'));
  assert.ok(script.includes('sha256sum'));
  assert.ok(script.includes('logcat -d --pid='));
  assert.ok(script.includes('FATAL EXCEPTION'));
  assert.ok(script.includes('ANR in'));
  assert.ok(script.includes('qa-evidence'));
  assert.ok(!script.includes('printf \'device_serial=%s'));
});

test('Group 11 QA covers required real-device and two-account release gates',()=>{
  const qa=read('docs/qa/GROUP11_FINAL_PHYSICAL_QA.md');
  for(const phrase of [
    'Post-login stability',
    'Same account',
    'Room voice',
    'Private chat',
    'Gender policy',
    'Nearby',
    'Rose',
    'PWA iOS',
    'Weak network',
    'APK update',
    'P0/P1 blockers'
  ]) assert.ok(qa.includes(phrase),phrase);
  assert.ok(qa.includes('BLOCKED_EXTERNAL'));
  assert.ok(qa.includes('Automated CI success alone is not sufficient'));
});

test('Group 11 evidence template excludes secrets and requires release acceptance',()=>{
  const evidence=read('docs/qa/GROUP11_EVIDENCE_TEMPLATE.md');
  assert.ok(evidence.includes('Do not record passwords'));
  assert.ok(evidence.includes('Signing certificate SHA-256'));
  assert.ok(evidence.includes('No open P0'));
  assert.ok(evidence.includes('No open P1'));
  assert.ok(evidence.includes('Release candidate accepted for Group 12'));
});

test('Group 11 local device evidence is gitignored',()=>{
  assert.ok(read('.gitignore').includes('qa-evidence/'));
});

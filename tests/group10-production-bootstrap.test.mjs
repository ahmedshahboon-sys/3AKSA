import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';

const root=new URL('../',import.meta.url);
const read=(path)=>readFileSync(new URL(path,root),'utf8');

test('Group 10 server scripts are shell-syntax valid',()=>{
  for(const path of [
    'infra/server/create-production-env.sh',
    'infra/server/deploy-trial.sh',
    'infra/server/disable-owner-bootstrap.sh',
    'infra/server/verify-production.sh'
  ]){
    execFileSync('bash',['-n',new URL(path,root).pathname],{stdio:'pipe'});
  }
});

test('Group 10 production env enables secure one-time ahmed owner bootstrap',()=>{
  const env=read('infra/server/create-production-env.sh');
  assert.ok(env.includes('OWNER_USERNAME=ahmed'));
  assert.ok(env.includes('OWNER_CLAIM_SECRET=${OWNER_CLAIM_SECRET}'));
  assert.ok(env.includes('owner-claim-secret'));
  assert.ok(env.includes('it was not printed'));
  assert.ok(!env.includes('echo "${OWNER_CLAIM_SECRET}"'));
});

test('Group 10 owner shutdown validates account and complete role assignment',()=>{
  const script=read('infra/server/disable-owner-bootstrap.sh');
  assert.ok(script.includes("u.username_normalized='ahmed'"));
  assert.ok(script.includes('[ "${role_count}" -ge 5 ]'));
  assert.ok(script.includes("grep -v '^OWNER_CLAIM_SECRET='"));
  assert.ok(script.includes('rm -f "${OWNER_CLAIM_FILE}"'));
  assert.ok(script.includes('/3aksa/api/ready'));
});

test('Group 10 deploy is preflighted and production-smoked',()=>{
  const deploy=read('infra/server/deploy-trial.sh');
  const smoke=read('infra/server/verify-production.sh');
  assert.ok(deploy.includes('security:preflight'));
  assert.ok(deploy.includes('verify-production.sh'));
  assert.ok(smoke.includes('/api/health'));
  assert.ok(smoke.includes('/api/ready'));
  assert.ok(smoke.includes('transport=polling'));
  assert.ok(smoke.includes('content-security-policy'));
});

test('Group 10 runbook never treats server-only evidence as source-complete',()=>{
  const doc=read('docs/deployment/GROUP10_PRODUCTION_BOOTSTRAP.md');
  assert.ok(doc.includes('sudo cat /etc/3aksa/owner-claim-secret'));
  assert.ok(doc.includes('Immediately configure Admin MFA'));
  assert.ok(doc.includes('Do not paste'));
  assert.ok(doc.includes('deployed Git SHA'));
});

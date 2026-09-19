import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';

const root=new URL('../',import.meta.url);
const read=(path)=>readFileSync(new URL(path,root),'utf8');

test('Group 9 operations shell scripts are syntactically valid',()=>{
  for(const path of [
    'scripts/ops/backup.sh',
    'scripts/ops/verify-backup.sh',
    'scripts/ops/restore.sh',
    'scripts/ops/retention-audit.sh',
    'scripts/ops/release-preflight.sh'
  ]){
    execFileSync('bash',['-n',new URL(path,root).pathname],{stdio:'pipe'});
  }
});

test('Group 9 backups exclude ephemeral and privacy-sensitive data',()=>{
  const backup=read('scripts/ops/backup.sh');
  for(const table of [
    'room_messages','private_messages','message_reactions','notifications',
    'notification_deliveries','telemetry_events','user_locations','auth_sessions',
    'password_recovery_requests','admin_mfa_pending','push_subscriptions'
  ])assert.ok(backup.includes(table),table);
  assert.ok(backup.includes('entries+=(store)'));
  assert.ok(backup.includes('entries+=(releases)'));
  assert.ok(!backup.includes('entries+=(voice)'));
  assert.ok(backup.includes('voice_storage=excluded'));
});

test('Group 9 restore requires explicit destructive production confirmation',()=>{
  const restore=read('scripts/ops/restore.sh');
  assert.ok(restore.includes('RESTORE_CONFIRM'));
  assert.ok(restore.includes('RESTORE_3AKSA'));
  assert.ok(restore.includes('ALLOW_PRODUCTION_RESTORE'));
  assert.ok(restore.includes('I_UNDERSTAND_THIS_REPLACES_PRODUCTION'));
  assert.ok(restore.includes('verify-backup.sh'));
  assert.ok(restore.includes('DELETE FROM room_messages'));
  assert.ok(restore.includes('DELETE FROM telemetry_events'));
});

test('Group 9 backup verification rejects voice and unsafe archive paths',()=>{
  const verify=read('scripts/ops/verify-backup.sh');
  assert.ok(verify.includes('sha256sum -c SHA256SUMS'));
  assert.ok(verify.includes('pg_restore --list'));
  assert.ok(verify.includes('Voice data must never be present in durable backups'));
  assert.ok(verify.includes('Unsafe storage archive path'));
});

test('Group 9 production secrets are strong and separated',()=>{
  const security=read('apps/api/src/production-security.ts');
  assert.ok(security.includes('value.length<32'));
  assert.ok(security.includes('must use different values'));
  for(const name of ['SESSION_SECRET','PASSWORD_PEPPER','ADMIN_MFA_ENCRYPTION_KEY','PUSH_ENCRYPTION_KEY']){
    assert.ok(security.includes(name));
  }
});

test('Group 9 operational runbooks cover backup rollback rotation and incidents',()=>{
  const backup=read('docs/operations/backup-restore.md');
  const rollback=read('docs/operations/rollback.md');
  const rotation=read('docs/operations/secret-rotation.md');
  const incident=read('docs/operations/security-operations.md');
  assert.ok(backup.includes('Temporary/private data must not become permanent through backups'));
  assert.ok(rollback.includes('Feature Flag'));
  assert.ok(rotation.includes('Do **not** replace this blindly'));
  assert.ok(incident.includes('not a substitute for network-edge DDoS protection'));
});

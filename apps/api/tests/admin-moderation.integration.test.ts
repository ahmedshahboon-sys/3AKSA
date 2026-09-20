import { randomUUID } from 'node:crypto';
import test from 'node:test';
import assert from 'node:assert/strict';
import { query } from '../src/db.js';
import { adminBanUser, adminUnbanUser } from '../src/modules/admin/service.js';

async function insertUser(input:{id:string;username:string;phone:string;status?:'active'|'banned'}){
  await query(
    `INSERT INTO users(
       id,username,username_normalized,display_name,phone_e164,gender,password_hash,status
     ) VALUES($1,$2,$3,$4,$5,'boy','test-only-hash',$6)`,
    [
      input.id,
      input.username,
      input.username.toLowerCase(),
      input.username,
      input.phone,
      input.status??'active'
    ]
  );
}

test('admin moderation reserves usernames, revokes devices, and preserves shared device blocks',async()=>{
  const actorId=randomUUID();
  const targetId=randomUUID();
  const otherBannedId=randomUUID();
  const sharedInstallation=`phase8-shared-${randomUUID()}`;

  await insertUser({id:actorId,username:`admin_${actorId.slice(0,8)}`,phone:'+218910001001'});
  await insertUser({id:targetId,username:`target_${targetId.slice(0,8)}`,phone:'+218910001002'});
  await insertUser({
    id:otherBannedId,
    username:`other_${otherBannedId.slice(0,8)}`,
    phone:'+218910001003',
    status:'banned'
  });

  await query(
    "INSERT INTO staff_roles(user_id,role,granted_by) VALUES($1,'super_admin',$1)",
    [actorId]
  );
  await query(
    `INSERT INTO user_devices(id,user_id,installation_id,platform)
     VALUES($1,$2,$3,'android'),($4,$5,$3,'android')`,
    [randomUUID(),targetId,sharedInstallation,randomUUID(),otherBannedId]
  );

  const banned=await adminBanUser(actorId,targetId,'integration moderation check');
  assert.equal(banned.status,'banned');

  const target=await query<{status:string}>('SELECT status FROM users WHERE id=$1',[targetId]);
  assert.equal(target.rows[0]?.status,'banned');

  const block=await query<{installation_id:string}>(
    'SELECT installation_id FROM blocked_installations WHERE installation_id=$1',
    [sharedInstallation]
  );
  assert.equal(block.rowCount,1);

  const reserved=await query<{username_key:string}>(
    'SELECT username_key FROM reserved_usernames WHERE username_key=$1',
    [`target${targetId.slice(0,8)}`]
  );
  assert.equal(reserved.rowCount,1);

  const unbanned=await adminUnbanUser(actorId,targetId,'integration moderation release');
  assert.equal(unbanned.status,'active');

  const stillBlocked=await query<{installation_id:string}>(
    'SELECT installation_id FROM blocked_installations WHERE installation_id=$1',
    [sharedInstallation]
  );
  assert.equal(stillBlocked.rowCount,1);
});

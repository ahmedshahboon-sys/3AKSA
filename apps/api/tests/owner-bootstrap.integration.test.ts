import test from 'node:test';
import assert from 'node:assert/strict';
import { buildApp } from '../src/app.js';
import { env } from '../src/config.js';
import { query, withTransaction } from '../src/db.js';

const username='ahmed';
const phone='+218912340099';
const claimSecret='owner-test-secret-1234567890';

async function cleanup(){
  const found=await query<{id:string}>('SELECT id FROM users WHERE username_normalized=$1 LIMIT 1',[username]);
  const userId=found.rows[0]?.id;
  if(!userId)return;
  await withTransaction(async(client)=>{
    await client.query('DELETE FROM admin_audit_log WHERE actor_user_id=$1 OR target_user_id=$1',[userId]);
    await client.query('DELETE FROM staff_roles WHERE user_id=$1',[userId]);
    await client.query('DELETE FROM auth_sessions WHERE user_id=$1',[userId]);
    await client.query('DELETE FROM user_devices WHERE user_id=$1',[userId]);
    await client.query('DELETE FROM users WHERE id=$1',[userId]);
  });
}

test('reserved owner account requires the server claim secret and receives full admin roles',async()=>{
  const previousUsername=env.OWNER_USERNAME;
  const previousSecret=env.OWNER_CLAIM_SECRET;
  env.OWNER_USERNAME=username;
  env.OWNER_CLAIM_SECRET=claimSecret;
  await cleanup();
  const app=await buildApp();

  try{
    const basePayload={
      username,
      displayName:'مالك عكسة',
      phone,
      gender:'boy' as const,
      password:'StrongPass123!',
      deviceId:'ci-owner-installation',
      platform:'ci'
    };

    const withoutClaim=await app.inject({
      method:'POST',
      url:'/3aksa/api/auth/register',
      payload:basePayload
    });
    assert.equal(withoutClaim.statusCode,403,withoutClaim.body);
    assert.equal(withoutClaim.json<{error:string}>().error,'OWNER_CLAIM_INVALID');

    const wrongClaim=await app.inject({
      method:'POST',
      url:'/3aksa/api/auth/register',
      payload:{...basePayload,ownerClaimCode:'wrong-owner-secret-000000'}
    });
    assert.equal(wrongClaim.statusCode,403,wrongClaim.body);

    const registered=await app.inject({
      method:'POST',
      url:'/3aksa/api/auth/register',
      payload:{...basePayload,ownerClaimCode:claimSecret}
    });
    assert.equal(registered.statusCode,201,registered.body);
    const body=registered.json<{accessToken:string;user:{username:string}}>();
    assert.equal(body.user.username,username);

    const roles=await query<{role:string}>(
      `SELECT role FROM staff_roles sr
       JOIN users u ON u.id=sr.user_id
       WHERE u.username_normalized=$1
       ORDER BY role`,
      [username]
    );
    assert.deepEqual(
      roles.rows.map((row)=>row.role),
      ['finance_admin','moderation_admin','release_admin','super_admin','tv_admin']
    );

    const adminMe=await app.inject({
      method:'GET',
      url:'/3aksa/api/admin/me',
      headers:{authorization:`Bearer ${body.accessToken}`}
    });
    assert.equal(adminMe.statusCode,200,adminMe.body);
    assert.ok(adminMe.json<{roles:string[]}>().roles.includes('super_admin'));
  }finally{
    await cleanup();
    await app.close();
    env.OWNER_USERNAME=previousUsername;
    env.OWNER_CLAIM_SECRET=previousSecret;
  }
});

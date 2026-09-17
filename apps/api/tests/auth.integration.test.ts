import test from 'node:test';
import assert from 'node:assert/strict';
import { buildApp } from '../src/app.js';
import { query } from '../src/db.js';

const username = 'phase2_user';
const phone = '+218912345678';

async function cleanup() {
  const user = await query<{ id: string }>('SELECT id FROM users WHERE username_normalized = $1', [username]);
  const userId = user.rows[0]?.id;
  if (!userId) return;
  await query('DELETE FROM auth_sessions WHERE user_id = $1', [userId]);
  await query('DELETE FROM user_devices WHERE user_id = $1', [userId]);
  await query('DELETE FROM users WHERE id = $1', [userId]);
}

test('auth lifecycle: register -> login -> me -> logout', async () => {
  await cleanup();
  const app = await buildApp();

  try {
    const register = await app.inject({
      method: 'POST',
      url: '/3aksa/api/auth/register',
      payload: {
        username,
        displayName: 'اختبار المرحلة الثانية',
        phone,
        gender: 'boy',
        password: 'StrongPass123!',
        deviceId: 'ci-installation-001',
        platform: 'ci'
      }
    });

    assert.equal(register.statusCode, 201, register.body);
    const registerBody = register.json<{ accessToken: string; user: { username: string } }>();
    assert.equal(registerBody.user.username, username);
    assert.ok(registerBody.accessToken.length > 30);

    const duplicate = await app.inject({
      method: 'POST',
      url: '/3aksa/api/auth/register',
      payload: {
        username,
        displayName: 'مكرر',
        phone: '+218912345679',
        gender: 'boy',
        password: 'StrongPass123!'
      }
    });
    assert.equal(duplicate.statusCode, 409);
    assert.equal(duplicate.json<{ error: string }>().error, 'USERNAME_TAKEN');

    const badLogin = await app.inject({
      method: 'POST',
      url: '/3aksa/api/auth/login',
      payload: { login: username, password: 'wrong-password' }
    });
    assert.equal(badLogin.statusCode, 401);

    const login = await app.inject({
      method: 'POST',
      url: '/3aksa/api/auth/login',
      payload: {
        login: username,
        password: 'StrongPass123!',
        deviceId: 'ci-installation-001',
        platform: 'ci'
      }
    });
    assert.equal(login.statusCode, 200, login.body);
    const loginBody = login.json<{ accessToken: string }>();

    const me = await app.inject({
      method: 'GET',
      url: '/3aksa/api/auth/me',
      headers: { authorization: `Bearer ${loginBody.accessToken}` }
    });
    assert.equal(me.statusCode, 200, me.body);
    assert.equal(me.json<{ user: { username: string } }>().user.username, username);

    const logout = await app.inject({
      method: 'POST',
      url: '/3aksa/api/auth/logout',
      headers: { authorization: `Bearer ${loginBody.accessToken}` }
    });
    assert.equal(logout.statusCode, 204);

    const meAfterLogout = await app.inject({
      method: 'GET',
      url: '/3aksa/api/auth/me',
      headers: { authorization: `Bearer ${loginBody.accessToken}` }
    });
    assert.equal(meAfterLogout.statusCode, 401);
  } finally {
    await cleanup();
    await app.close();
  }
});

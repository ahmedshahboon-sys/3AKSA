import test from 'node:test';
import assert from 'node:assert/strict';
import { buildApp } from '../src/app.js';
import { query } from '../src/db.js';

const users = [
  ['suggest_viewer_ci', '+218912345731', 'المشاهد'],
  ['suggest_bridge_ci', '+218912345732', 'الصديق المشترك'],
  ['suggest_alpha_ci', '+218912345733', 'ألفا'],
  ['suggest_beta_ci', '+218912345734', 'بيتا']
] as const;

async function cleanup() {
  const result = await query<{ id: string }>(
    'SELECT id FROM users WHERE username_normalized = ANY($1::text[])',
    [users.map(([username]) => username)]
  );
  const ids = result.rows.map((row) => row.id);
  if (ids.length) await query('DELETE FROM users WHERE id = ANY($1::uuid[])', [ids]);
}

async function register(app: Awaited<ReturnType<typeof buildApp>>, entry: (typeof users)[number]) {
  const [username, phone, displayName] = entry;
  const response = await app.inject({
    method: 'POST',
    url: '/3aksa/api/auth/register',
    payload: {
      username, displayName, phone, gender: 'boy', password: 'StrongPass123!',
      deviceId: `ci-${username}`, platform: 'ci'
    }
  });
  assert.equal(response.statusCode, 201, response.body);
  return response.json<{ accessToken: string; user: { id: string } }>();
}

const auth = (token: string) => ({ authorization: `Bearer ${token}` });

async function friend(a: string, b: string) {
  await query(
    `INSERT INTO friendships (user_low_id, user_high_id)
     VALUES (LEAST($1::uuid, $2::uuid), GREATEST($1::uuid, $2::uuid))`,
    [a, b]
  );
}

test('mutual suggestions honor opt-out, pending requests and blocks', async () => {
  await cleanup();
  const app = await buildApp();
  try {
    const [viewer, bridge, alpha, beta] = await Promise.all(users.map((entry) => register(app, entry)));
    await friend(viewer!.user.id, bridge!.user.id);
    await friend(bridge!.user.id, alpha!.user.id);
    await friend(bridge!.user.id, beta!.user.id);

    const list = async () => (await app.inject({
      method: 'GET', url: '/3aksa/api/friends/suggestions', headers: auth(viewer!.accessToken)
    })).json<{ suggestions: Array<{ username: string; mutualCount: number }> }>().suggestions;

    assert.deepEqual((await list()).map((item) => item.username), ['suggest_alpha_ci', 'suggest_beta_ci']);
    assert.deepEqual((await list()).map((item) => item.mutualCount), [1, 1]);

    await app.inject({
      method: 'PATCH', url: '/3aksa/api/profile/me', headers: auth(alpha!.accessToken),
      payload: { mutualSuggestionsEnabled: false }
    });
    assert.deepEqual((await list()).map((item) => item.username), ['suggest_beta_ci']);

    const pending = await app.inject({
      method: 'POST', url: '/3aksa/api/friends/requests', headers: auth(viewer!.accessToken),
      payload: { username: 'suggest_beta_ci' }
    });
    assert.equal(pending.statusCode, 201, pending.body);
    assert.deepEqual(await list(), []);

    await app.inject({
      method: 'PATCH', url: '/3aksa/api/profile/me', headers: auth(alpha!.accessToken),
      payload: { mutualSuggestionsEnabled: true }
    });
    const blocked = await app.inject({
      method: 'POST', url: '/3aksa/api/blocks', headers: auth(viewer!.accessToken),
      payload: { username: 'suggest_alpha_ci' }
    });
    assert.equal(blocked.statusCode, 201, blocked.body);
    assert.deepEqual(await list(), []);
  } finally {
    await cleanup();
    await app.close();
  }
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { buildApp } from '../src/app.js';
import { query } from '../src/db.js';

const owner = { username: 'near_owner_ci', phone: '+218912345721', displayName: 'صاحب القريبون' };
const girl = { username: 'near_girl_ci', phone: '+218912345722', displayName: 'بنت قريبة' };
const boy = { username: 'near_boy_ci', phone: '+218912345723', displayName: 'ولد بعيد' };
const usernames = [owner.username, girl.username, boy.username];

async function cleanup() {
  const users = await query<{ id: string }>(
    'SELECT id FROM users WHERE username_normalized = ANY($1::text[])',
    [usernames]
  );
  const ids = users.rows.map((row) => row.id);
  if (ids.length === 0) return;
  await query('DELETE FROM auth_sessions WHERE user_id = ANY($1::uuid[])', [ids]);
  await query('DELETE FROM user_devices WHERE user_id = ANY($1::uuid[])', [ids]);
  await query('DELETE FROM users WHERE id = ANY($1::uuid[])', [ids]);
}

async function register(
  app: Awaited<ReturnType<typeof buildApp>>,
  user: typeof owner,
  gender: 'boy' | 'girl'
) {
  const response = await app.inject({
    method: 'POST',
    url: '/3aksa/api/auth/register',
    payload: {
      username: user.username,
      displayName: user.displayName,
      phone: user.phone,
      gender,
      password: 'StrongPass123!',
      deviceId: `ci-${user.username}`,
      platform: 'ci'
    }
  });
  assert.equal(response.statusCode, 201, response.body);
  return response.json<{ accessToken: string; user: { id: string } }>();
}

function auth(token: string) {
  return { authorization: `Bearer ${token}` };
}

async function setNearby(app: Awaited<ReturnType<typeof buildApp>>, token: string, enabled: boolean) {
  const response = await app.inject({
    method: 'PATCH',
    url: '/3aksa/api/profile/me',
    headers: auth(token),
    payload: { nearbyEnabled: enabled, ...(enabled ? { nearbyConsent: true } : {}) }
  });
  assert.equal(response.statusCode, 200, response.body);
}

async function setLocation(
  app: Awaited<ReturnType<typeof buildApp>>,
  token: string,
  latitude: number,
  longitude: number,
  accuracyM = 30
) {
  const response = await app.inject({
    method: 'PUT',
    url: '/3aksa/api/nearby/location',
    headers: auth(token),
    payload: { latitude, longitude, accuracyM }
  });
  assert.equal(response.statusCode, 200, response.body);
}

test('nearby returns only fresh approximate distances and respects privacy controls', async () => {
  await cleanup();
  const app = await buildApp();

  try {
    const ownerSession = await register(app, owner, 'boy');
    const girlSession = await register(app, girl, 'girl');
    const boySession = await register(app, boy, 'boy');

    const disabledLocation = await app.inject({
      method: 'PUT',
      url: '/3aksa/api/nearby/location',
      headers: auth(ownerSession.accessToken),
      payload: { latitude: 32.8872, longitude: 13.1913, accuracyM: 25 }
    });
    assert.equal(disabledLocation.statusCode, 409, disabledLocation.body);
    assert.equal(disabledLocation.json<{ error: string }>().error, 'NEARBY_DISABLED');

    await setNearby(app, ownerSession.accessToken, true);
    await setNearby(app, girlSession.accessToken, true);
    await setNearby(app, boySession.accessToken, true);

    await setLocation(app, ownerSession.accessToken, 32.8872, 13.1913, 20);
    await setLocation(app, girlSession.accessToken, 32.8910, 13.1950, 35);
    await setLocation(app, boySession.accessToken, 32.9500, 13.2200, 40);

    const girlsOnly = await app.inject({
      method: 'GET',
      url: '/3aksa/api/nearby?gender=girl&maxDistanceKm=50',
      headers: auth(ownerSession.accessToken)
    });
    assert.equal(girlsOnly.statusCode, 200, girlsOnly.body);
    const girls = girlsOnly.json<{
      nearby: Array<Record<string, unknown> & { username: string; distanceKmApprox: number; distanceLabel: string }>;
    }>().nearby;
    assert.equal(girls.length, 1);
    assert.equal(girls[0]?.username, girl.username);
    assert.equal(girls[0]?.distanceKmApprox, 0.5);
    assert.equal(girls[0]?.distanceLabel, 'أقل من 1 كم');
    assert.equal('latitude' in girls[0]!, false);
    assert.equal('longitude' in girls[0]!, false);
    assert.equal('accuracyM' in girls[0]!, false);
    assert.equal('updatedAt' in girls[0]!, false);

    const everyone = await app.inject({
      method: 'GET',
      url: '/3aksa/api/nearby?maxDistanceKm=50',
      headers: auth(ownerSession.accessToken)
    });
    assert.equal(everyone.statusCode, 200, everyone.body);
    const all = everyone.json<{ nearby: Array<{ username: string }> }>().nearby;
    assert.deepEqual(all.map((entry) => entry.username), [girl.username, boy.username]);
    assert.equal(all.some((entry) => entry.username === owner.username), false);

    const block = await app.inject({
      method: 'POST',
      url: '/3aksa/api/blocks',
      headers: auth(ownerSession.accessToken),
      payload: { username: girl.username }
    });
    assert.equal(block.statusCode, 201, block.body);

    const blockedNearby = await app.inject({
      method: 'GET',
      url: '/3aksa/api/nearby?gender=girl',
      headers: auth(ownerSession.accessToken)
    });
    assert.equal(blockedNearby.statusCode, 200, blockedNearby.body);
    assert.deepEqual(blockedNearby.json<{ nearby: unknown[] }>().nearby, []);

    const unblock = await app.inject({
      method: 'DELETE',
      url: `/3aksa/api/blocks/${girl.username}`,
      headers: auth(ownerSession.accessToken)
    });
    assert.equal(unblock.statusCode, 204, unblock.body);

    await setNearby(app, girlSession.accessToken, false);
    const disabledCandidate = await app.inject({
      method: 'GET',
      url: '/3aksa/api/nearby?gender=girl',
      headers: auth(ownerSession.accessToken)
    });
    assert.deepEqual(disabledCandidate.json<{ nearby: unknown[] }>().nearby, []);

    await setNearby(app, girlSession.accessToken, true);
    await setLocation(app, girlSession.accessToken, 32.8910, 13.1950, 35);
    await query(
      "UPDATE user_locations SET updated_at = now() - interval '2 hours' WHERE user_id = $1",
      [girlSession.user.id]
    );
    const staleCandidate = await app.inject({
      method: 'GET',
      url: '/3aksa/api/nearby?gender=girl',
      headers: auth(ownerSession.accessToken)
    });
    assert.deepEqual(staleCandidate.json<{ nearby: unknown[] }>().nearby, []);

    const invalid = await app.inject({
      method: 'PUT',
      url: '/3aksa/api/nearby/location',
      headers: auth(ownerSession.accessToken),
      payload: { latitude: 100, longitude: 13.2, accuracyM: 20 }
    });
    assert.equal(invalid.statusCode, 400, invalid.body);
    assert.equal(invalid.json<{ error: string }>().error, 'INVALID_LOCATION');

    await query(
      "UPDATE user_locations SET updated_at = now() - interval '2 hours' WHERE user_id = $1",
      [ownerSession.user.id]
    );
    const staleSelf = await app.inject({
      method: 'GET',
      url: '/3aksa/api/nearby',
      headers: auth(ownerSession.accessToken)
    });
    assert.equal(staleSelf.statusCode, 409, staleSelf.body);
    assert.equal(staleSelf.json<{ error: string }>().error, 'LOCATION_STALE');
  } finally {
    await cleanup();
    await app.close();
  }
});

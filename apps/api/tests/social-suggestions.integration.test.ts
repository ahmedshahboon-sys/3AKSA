import { randomUUID } from 'node:crypto';
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildApp } from '../src/app.js';
import { query } from '../src/db.js';
import { consumeRateLimit } from '../src/rate-limit.js';

const viewer = { username: 'suggest_viewer_ci', phone: '+218912345731', displayName: 'المشاهد' };
const bridge = { username: 'suggest_bridge_ci', phone: '+218912345732', displayName: 'الصديق المشترك' };
const candidateA = { username: 'suggest_alpha_ci', phone: '+218912345733', displayName: 'ألفا' };
const candidateB = { username: 'suggest_beta_ci', phone: '+218912345734', displayName: 'بيتا' };
const usernames = [viewer.username, bridge.username, candidateA.username, candidateB.username];

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

async function register(app: Awaited<ReturnType<typeof buildApp>>, user: typeof viewer) {
  const response = await app.inject({
    method: 'POST',
    url: '/3aksa/api/auth/register',
    payload: {
      username: user.username,
      displayName: user.displayName,
      phone: user.phone,
      gender: 'boy',
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

async function addFriendship(a: string, b: string) {
  await query(
    `INSERT INTO friendships (user_low_id, user_high_id)
     VALUES (LEAST($1::uuid, $2::uuid), GREATEST($1::uuid, $2::uuid))`,
    [a, b]
  );
}

test('mutual friend suggestions honor opt-out, requests and blocks', async () => {
  await cleanup();
  const app = await buildApp();

  try {
    const viewerSession = await register(app, viewer);
    const bridgeSession = await register(app, bridge);
    const alphaSession = await register(app, candidateA);
    const betaSession = await register(app, candidateB);

    await addFriendship(viewerSession.user.id, bridgeSession.user.id);
    await addFriendship(bridgeSession.user.id, alphaSession.user.id);
    await addFriendship(bridgeSession.user.id, betaSession.user.id);

    const initial = await app.inject({
      method: 'GET',
      url: '/3aksa/api/friends/suggestions',
      headers: auth(viewerSession.accessToken)
    });
    assert.equal(initial.statusCode, 200, initial.body);
    const initialSuggestions = initial.json<{
      suggestions: Array<{ username: string; mutualCount: number }>;
    }>().suggestions;
    assert.deepEqual(initialSuggestions.map((entry) => entry.username), [candidateA.username, candidateB.username]);
    assert.deepEqual(initialSuggestions.map((entry) => entry.mutualCount), [1, 1]);

    const alphaOptOut = await app.inject({
      method: 'PATCH',
      url: '/3aksa/api/profile/me',
      headers: auth(alphaSession.accessToken),
      payload: { mutualSuggestionsEnabled: false }
    });
    assert.equal(alphaOptOut.statusCode, 200, alphaOptOut.body);

    const afterOptOut = await app.inject({
      method: 'GET',
      url: '/3aksa/api/friends/suggestions',
      headers: auth(viewerSession.accessToken)
    });
    assert.deepEqual(
      afterOptOut.json<{ suggestions: Array<{ username: string }> }>().suggestions.map((entry) => entry.username),
      [candidateB.username]
    );

    const pendingRequest = await app.inject({
      method: 'POST',
      url: '/3aksa/api/friends/requests',
      headers: auth(viewerSession.accessToken),
      payload: { username: candidateB.username }
    });
    assert.equal(pendingRequest.statusCode, 201, pendingRequest.body);

    const afterRequest = await app.inject({
      method: 'GET',
      url: '/3aksa/api/friends/suggestions',
      headers: auth(viewerSession.accessToken)
    });
    assert.deepEqual(afterRequest.json<{ suggestions: unknown[] }>().suggestions, []);

    const alphaOptIn = await app.inject({
      method: 'PATCH',
      url: '/3aksa/api/profile/me',
      headers: auth(alphaSession.accessToken),
      payload: { mutualSuggestionsEnabled: true }
    });
    assert.equal(alphaOptIn.statusCode, 200, alphaOptIn.body);

    const blockAlpha = await app.inject({
      method: 'POST',
      url: '/3aksa/api/blocks',
      headers: auth(viewerSession.accessToken),
      payload: { username: candidateA.username }
    });
    assert.equal(blockAlpha.statusCode, 201, blockAlpha.body);

    const afterBlock = await app.inject({
      method: 'GET',
      url: '/3aksa/api/friends/suggestions',
      headers: auth(viewerSession.accessToken)
    });
    assert.deepEqual(afterBlock.json<{ suggestions: unknown[] }>().suggestions, []);

    const viewerOptOut = await app.inject({
      method: 'PATCH',
      url: '/3aksa/api/profile/me',
      headers: auth(viewerSession.accessToken),
      payload: { mutualSuggestionsEnabled: false }
    });
    assert.equal(viewerOptOut.statusCode, 200, viewerOptOut.body);

    const disabled = await app.inject({
      method: 'GET',
      url: '/3aksa/api/friends/suggestions',
      headers: auth(viewerSession.accessToken)
    });
    assert.deepEqual(disabled.json<{ suggestions: unknown[] }>().suggestions, []);
  } finally {
    await cleanup();
    await app.close();
  }
});

test('Redis fixed-window limiter blocks after configured allowance', async () => {
  const subject = `ci-${randomUUID()}`;
  const first = await consumeRateLimit('ci-probe', subject, 2, 60);
  const second = await consumeRateLimit('ci-probe', subject, 2, 60);
  const third = await consumeRateLimit('ci-probe', subject, 2, 60);

  assert.equal(first.allowed, true);
  assert.equal(second.allowed, true);
  assert.equal(third.allowed, false);
  assert.equal(third.remaining, 0);
  assert.ok(third.retryAfterSeconds > 0);
});

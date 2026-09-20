import test from 'node:test';
import assert from 'node:assert/strict';
import { buildApp } from '../src/app.js';
import { query } from '../src/db.js';

const alice = { username: 'phase2_alice', phone: '+218912345681', displayName: 'أليس' };
const bob = { username: 'phase2_bob', phone: '+218912345682', displayName: 'بوب' };

async function cleanup() {
  const users = await query<{ id: string }>(
    'SELECT id FROM users WHERE username_normalized = ANY($1::text[])',
    [[alice.username, bob.username]]
  );
  const ids = users.rows.map((row) => row.id);
  if (ids.length === 0) return;

  await query('DELETE FROM user_reports WHERE reporter_id = ANY($1::uuid[]) OR target_user_id = ANY($1::uuid[])', [ids]);
  await query('DELETE FROM user_blocks WHERE blocker_id = ANY($1::uuid[]) OR blocked_id = ANY($1::uuid[])', [ids]);
  await query('DELETE FROM friend_requests WHERE sender_id = ANY($1::uuid[]) OR receiver_id = ANY($1::uuid[])', [ids]);
  await query('DELETE FROM friendships WHERE user_low_id = ANY($1::uuid[]) OR user_high_id = ANY($1::uuid[])', [ids]);
  await query('DELETE FROM auth_sessions WHERE user_id = ANY($1::uuid[])', [ids]);
  await query('DELETE FROM user_devices WHERE user_id = ANY($1::uuid[])', [ids]);
  await query('DELETE FROM users WHERE id = ANY($1::uuid[])', [ids]);
}

async function register(
  app: Awaited<ReturnType<typeof buildApp>>,
  user: typeof alice,
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
  return response.json<{ accessToken: string; user: { id: string; username: string } }>();
}

function auth(token: string) {
  return { authorization: `Bearer ${token}` };
}

test('social lifecycle: profile -> request -> friendship -> block -> report', async () => {
  await cleanup();
  const app = await buildApp();

  try {
    const aliceSession = await register(app, alice, 'girl');
    const bobSession = await register(app, bob, 'boy');

    const updateProfile = await app.inject({
      method: 'PATCH',
      url: '/3aksa/api/profile/me',
      headers: auth(aliceSession.accessToken),
      payload: {
        displayName: 'أليس الجديدة',
        bio: 'نبذة اختبارية',
        nearbyEnabled: true,
        nearbyConsent: true,
        mutualSuggestionsEnabled: false
      }
    });
    assert.equal(updateProfile.statusCode, 200, updateProfile.body);
    const updated = updateProfile.json<{
      profile: { displayName: string; bio: string; nearbyEnabled: boolean; mutualSuggestionsEnabled: boolean };
    }>();
    assert.equal(updated.profile.displayName, 'أليس الجديدة');
    assert.equal(updated.profile.bio, 'نبذة اختبارية');
    assert.equal(updated.profile.nearbyEnabled, true);
    assert.equal(updated.profile.mutualSuggestionsEnabled, false);

    const requestFriend = await app.inject({
      method: 'POST',
      url: '/3aksa/api/friends/requests',
      headers: auth(aliceSession.accessToken),
      payload: { username: bob.username }
    });
    assert.equal(requestFriend.statusCode, 201, requestFriend.body);
    const friendRequestId = requestFriend.json<{ request: { id: string } }>().request.id;

    const duplicateRequest = await app.inject({
      method: 'POST',
      url: '/3aksa/api/friends/requests',
      headers: auth(bobSession.accessToken),
      payload: { username: alice.username }
    });
    assert.equal(duplicateRequest.statusCode, 409);
    assert.equal(duplicateRequest.json<{ error: string }>().error, 'FRIEND_REQUEST_EXISTS');

    const bobRequests = await app.inject({
      method: 'GET',
      url: '/3aksa/api/friends/requests',
      headers: auth(bobSession.accessToken)
    });
    assert.equal(bobRequests.statusCode, 200, bobRequests.body);
    const requests = bobRequests.json<{ requests: Array<{ id: string; direction: string }> }>().requests;
    assert.equal(requests.length, 1);
    assert.equal(requests[0]?.id, friendRequestId);
    assert.equal(requests[0]?.direction, 'incoming');

    const accept = await app.inject({
      method: 'POST',
      url: `/3aksa/api/friends/requests/${friendRequestId}/accept`,
      headers: auth(bobSession.accessToken)
    });
    assert.equal(accept.statusCode, 200, accept.body);

    const aliceFriends = await app.inject({
      method: 'GET',
      url: '/3aksa/api/friends',
      headers: auth(aliceSession.accessToken)
    });
    assert.equal(aliceFriends.statusCode, 200, aliceFriends.body);
    assert.equal(aliceFriends.json<{ friends: Array<{ username: string }> }>().friends[0]?.username, bob.username);

    const block = await app.inject({
      method: 'POST',
      url: '/3aksa/api/blocks',
      headers: auth(aliceSession.accessToken),
      payload: { username: bob.username }
    });
    assert.equal(block.statusCode, 201, block.body);

    const notificationsAfterBlock = await query<{ count: string }>(
      `SELECT count(*)::text AS count
       FROM notifications
       WHERE (user_id = $1 AND data->>'username' = $4)
          OR (user_id = $2 AND data->>'username' = $3)`,
      [aliceSession.user.id, bobSession.user.id, alice.username, bob.username]
    );
    assert.equal(notificationsAfterBlock.rows[0]?.count, '0');

    const friendsAfterBlock = await app.inject({
      method: 'GET',
      url: '/3aksa/api/friends',
      headers: auth(aliceSession.accessToken)
    });
    assert.deepEqual(friendsAfterBlock.json<{ friends: unknown[] }>().friends, []);

    const hiddenProfile = await app.inject({
      method: 'GET',
      url: `/3aksa/api/profiles/${alice.username}`,
      headers: auth(bobSession.accessToken)
    });
    assert.equal(hiddenProfile.statusCode, 404);

    const blockedFriendRequest = await app.inject({
      method: 'POST',
      url: '/3aksa/api/friends/requests',
      headers: auth(bobSession.accessToken),
      payload: { username: alice.username }
    });
    assert.equal(blockedFriendRequest.statusCode, 409);
    assert.equal(blockedFriendRequest.json<{ error: string }>().error, 'RELATIONSHIP_BLOCKED');

    const unblock = await app.inject({
      method: 'DELETE',
      url: `/3aksa/api/blocks/${bob.username}`,
      headers: auth(aliceSession.accessToken)
    });
    assert.equal(unblock.statusCode, 204);

    const visibleAgain = await app.inject({
      method: 'GET',
      url: `/3aksa/api/profiles/${alice.username}`,
      headers: auth(bobSession.accessToken)
    });
    assert.equal(visibleAgain.statusCode, 200, visibleAgain.body);

    const report = await app.inject({
      method: 'POST',
      url: '/3aksa/api/reports',
      headers: auth(aliceSession.accessToken),
      payload: { username: bob.username, reason: 'spam', details: 'بلاغ اختبار تكاملي' }
    });
    assert.equal(report.statusCode, 201, report.body);
    assert.ok(report.json<{ report: { id: string } }>().report.id);
  } finally {
    await cleanup();
    await app.close();
  }
});

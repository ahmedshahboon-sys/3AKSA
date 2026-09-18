import test from 'node:test';
import assert from 'node:assert/strict';
import { buildApp } from '../src/app.js';
import { query } from '../src/db.js';

const owner = { username: 'room_owner_ci', phone: '+218912345691', displayName: 'مسؤول الغرفة' };
const boy = { username: 'room_boy_ci', phone: '+218912345692', displayName: 'مشرف اختبار' };
const girl = { username: 'room_girl_ci', phone: '+218912345693', displayName: 'مستخدمة اختبار' };
const usernames = [owner.username, boy.username, girl.username];

async function cleanup() {
  const users = await query<{ id: string }>(
    'SELECT id FROM users WHERE username_normalized = ANY($1::text[])',
    [usernames]
  );
  const ids = users.rows.map((row) => row.id);
  if (ids.length === 0) return;

  await query('DELETE FROM rooms WHERE owner_id = ANY($1::uuid[])', [ids]);
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
  return response.json<{ accessToken: string; user: { id: string; username: string } }>();
}

function auth(token: string) {
  return { authorization: `Bearer ${token}` };
}

test('rooms lifecycle: policies -> favorite -> private invite -> moderator ban', async () => {
  await cleanup();
  const app = await buildApp();

  try {
    const ownerSession = await register(app, owner, 'boy');
    const boySession = await register(app, boy, 'boy');
    const girlSession = await register(app, girl, 'girl');

    const createPublic = await app.inject({
      method: 'POST',
      url: '/3aksa/api/rooms',
      headers: auth(ownerSession.accessToken),
      payload: {
        name: 'غرفة الأولاد التجريبية',
        description: 'اختبار سياسات الغرف',
        visibility: 'public',
        genderPolicy: 'boys',
        maxUsers: 25,
        tvEnabled: true
      }
    });
    assert.equal(createPublic.statusCode, 201, createPublic.body);
    const publicRoom = createPublic.json<{ room: { id: string; viewerRole: string; tvEnabled: boolean } }>().room;
    assert.equal(publicRoom.viewerRole, 'owner');
    assert.equal(publicRoom.tvEnabled, true);

    const girlDenied = await app.inject({
      method: 'POST',
      url: `/3aksa/api/rooms/${publicRoom.id}/join-check`,
      headers: auth(girlSession.accessToken)
    });
    assert.equal(girlDenied.statusCode, 403);
    assert.equal(girlDenied.json<{ error: string }>().error, 'ROOM_BOYS_ONLY');

    const boyAllowed = await app.inject({
      method: 'POST',
      url: `/3aksa/api/rooms/${publicRoom.id}/join-check`,
      headers: auth(boySession.accessToken)
    });
    assert.equal(boyAllowed.statusCode, 200, boyAllowed.body);
    assert.equal(boyAllowed.json<{ allowed: boolean }>().allowed, true);

    const favorite = await app.inject({
      method: 'POST',
      url: `/3aksa/api/rooms/${publicRoom.id}/favorite`,
      headers: auth(boySession.accessToken)
    });
    assert.equal(favorite.statusCode, 201, favorite.body);

    const favorites = await app.inject({
      method: 'GET',
      url: '/3aksa/api/rooms?favoritesOnly=true',
      headers: auth(boySession.accessToken)
    });
    assert.equal(favorites.statusCode, 200, favorites.body);
    const favoriteRooms = favorites.json<{ rooms: Array<{ id: string; favorite: boolean }> }>().rooms;
    assert.equal(favoriteRooms.length, 1);
    assert.equal(favoriteRooms[0]?.id, publicRoom.id);
    assert.equal(favoriteRooms[0]?.favorite, true);

    const addModerator = await app.inject({
      method: 'POST',
      url: `/3aksa/api/rooms/${publicRoom.id}/moderators`,
      headers: auth(ownerSession.accessToken),
      payload: { username: boy.username }
    });
    assert.equal(addModerator.statusCode, 201, addModerator.body);

    const moderatorBan = await app.inject({
      method: 'POST',
      url: `/3aksa/api/rooms/${publicRoom.id}/bans`,
      headers: auth(boySession.accessToken),
      payload: { username: girl.username, reason: 'اختبار الحظر' }
    });
    assert.equal(moderatorBan.statusCode, 201, moderatorBan.body);

    const girlBanned = await app.inject({
      method: 'POST',
      url: `/3aksa/api/rooms/${publicRoom.id}/join-check`,
      headers: auth(girlSession.accessToken)
    });
    assert.equal(girlBanned.statusCode, 403);
    assert.equal(girlBanned.json<{ error: string }>().error, 'ROOM_BANNED');

    const createPrivate = await app.inject({
      method: 'POST',
      url: '/3aksa/api/rooms',
      headers: auth(ownerSession.accessToken),
      payload: {
        name: 'غرفة خاصة تجريبية',
        visibility: 'private',
        genderPolicy: 'everyone',
        maxUsers: 10
      }
    });
    assert.equal(createPrivate.statusCode, 201, createPrivate.body);
    const privateRoomId = createPrivate.json<{ room: { id: string } }>().room.id;

    const hiddenPrivate = await app.inject({
      method: 'GET',
      url: `/3aksa/api/rooms/${privateRoomId}`,
      headers: auth(girlSession.accessToken)
    });
    assert.equal(hiddenPrivate.statusCode, 404);

    const invite = await app.inject({
      method: 'POST',
      url: `/3aksa/api/rooms/${privateRoomId}/invites`,
      headers: auth(ownerSession.accessToken),
      payload: { username: girl.username }
    });
    assert.equal(invite.statusCode, 201, invite.body);

    const visiblePrivate = await app.inject({
      method: 'GET',
      url: `/3aksa/api/rooms/${privateRoomId}`,
      headers: auth(girlSession.accessToken)
    });
    assert.equal(visiblePrivate.statusCode, 200, visiblePrivate.body);
    assert.equal(visiblePrivate.json<{ room: { invited: boolean } }>().room.invited, true);

    const privateJoin = await app.inject({
      method: 'POST',
      url: `/3aksa/api/rooms/${privateRoomId}/join-check`,
      headers: auth(girlSession.accessToken)
    });
    assert.equal(privateJoin.statusCode, 200, privateJoin.body);

    const patchRoom = await app.inject({
      method: 'PATCH',
      url: `/3aksa/api/rooms/${privateRoomId}`,
      headers: auth(ownerSession.accessToken),
      payload: { name: 'الغرفة الخاصة المعدلة', maxUsers: 12, tvEnabled: true }
    });
    assert.equal(patchRoom.statusCode, 200, patchRoom.body);
    const patched = patchRoom.json<{ room: { name: string; maxUsers: number; tvEnabled: boolean } }>().room;
    assert.equal(patched.name, 'الغرفة الخاصة المعدلة');
    assert.equal(patched.maxUsers, 12);
    assert.equal(patched.tvEnabled, true);
  } finally {
    await cleanup();
    await app.close();
  }
});

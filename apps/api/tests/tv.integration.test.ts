import { randomUUID } from 'node:crypto';
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildApp } from '../src/app.js';
import { query } from '../src/db.js';

const admin={username:'tv_admin_ci',phone:'+218912345791',displayName:'مدير التلفزيون'};
const owner={username:'tv_owner_ci',phone:'+218912345792',displayName:'مسؤول الغرفة'};
const moderator={username:'tv_mod_ci',phone:'+218912345793',displayName:'مشرف الغرفة'};
const viewer={username:'tv_viewer_ci',phone:'+218912345794',displayName:'مشاهد الغرفة'};
const users=[admin,owner,moderator,viewer];
const usernames=users.map((user)=>user.username);

async function cleanup(){
  const found=await query<{id:string}>(
    'SELECT id FROM users WHERE username_normalized=ANY($1::text[])',
    [usernames]
  );
  const ids=found.rows.map((row)=>row.id);
  if(ids.length===0)return;

  await query('DELETE FROM rooms WHERE owner_id=ANY($1::uuid[])',[ids]);
  await query('DELETE FROM tv_admin_actions WHERE actor_user_id=ANY($1::uuid[])',[ids]);
  await query('DELETE FROM tv_channels WHERE created_by=ANY($1::uuid[])',[ids]);
  await query('DELETE FROM tv_import_batches WHERE created_by=ANY($1::uuid[])',[ids]);
  await query('DELETE FROM staff_roles WHERE user_id=ANY($1::uuid[])',[ids]);
  await query('DELETE FROM auth_sessions WHERE user_id=ANY($1::uuid[])',[ids]);
  await query('DELETE FROM user_devices WHERE user_id=ANY($1::uuid[])',[ids]);
  await query('DELETE FROM users WHERE id=ANY($1::uuid[])',[ids]);
}

async function register(app:Awaited<ReturnType<typeof buildApp>>,user:typeof admin){
  const response=await app.inject({
    method:'POST',
    url:'/3aksa/api/auth/register',
    payload:{
      username:user.username,
      displayName:user.displayName,
      phone:user.phone,
      gender:'boy',
      password:'StrongPass123!',
      deviceId:`ci-${user.username}`,
      platform:'ci'
    }
  });
  assert.equal(response.statusCode,201,response.body);
  return response.json<{accessToken:string;user:{id:string;username:string}}>();
}

function auth(token:string){return{authorization:`Bearer ${token}`};}

test('TV catalog management and room playback state enforce licensing and permissions',async()=>{
  await cleanup();
  const app=await buildApp();
  try{
    const adminSession=await register(app,admin);
    const ownerSession=await register(app,owner);
    const moderatorSession=await register(app,moderator);
    const viewerSession=await register(app,viewer);

    await query(
      "INSERT INTO staff_roles (user_id,role,granted_by) VALUES ($1,'super_admin',$1)",
      [adminSession.user.id]
    );

    const unauthorizedAdmin=await app.inject({
      method:'GET',
      url:'/3aksa/api/tv/admin/channels',
      headers:auth(ownerSession.accessToken)
    });
    assert.equal(unauthorizedAdmin.statusCode,403,unauthorizedAdmin.body);
    assert.equal(unauthorizedAdmin.json<{error:string}>().error,'TV_ADMIN_REQUIRED');

    const noRights=await app.inject({
      method:'POST',
      url:'/3aksa/api/tv/admin/channels',
      headers:auth(adminSession.accessToken),
      payload:{
        name:'قناة بدون حقوق',
        streamUrl:'https://media.example.com/unlicensed/master.m3u8',
        rightsAttested:false
      }
    });
    assert.equal(noRights.statusCode,400,noRights.body);
    assert.equal(noRights.json<{error:string}>().error,'TV_RIGHTS_ATTESTATION_REQUIRED');

    const localStream=await app.inject({
      method:'POST',
      url:'/3aksa/api/tv/admin/channels',
      headers:auth(adminSession.accessToken),
      payload:{
        name:'قناة محلية ممنوعة',
        streamUrl:'http://127.0.0.1/private.m3u8',
        rightsAttested:true
      }
    });
    assert.equal(localStream.statusCode,400,localStream.body);
    assert.equal(localStream.json<{error:string}>().error,'INVALID_STREAM_URL');

    const direct=await app.inject({
      method:'POST',
      url:'/3aksa/api/tv/admin/channels',
      headers:auth(adminSession.accessToken),
      payload:{
        name:'قناة الأخبار',
        groupName:'أخبار',
        streamUrl:'https://media.example.com/news/master.m3u8',
        logoUrl:'https://cdn.example.com/news.png',
        rightsAttested:true,
        rightsNote:'CI licensed source'
      }
    });
    assert.equal(direct.statusCode,201,direct.body);
    const news=direct.json<{channel:{id:string;name:string;status:string;rightsConfirmed:boolean}}>().channel;
    assert.equal(news.name,'قناة الأخبار');
    assert.equal(news.status,'active');
    assert.equal(news.rightsConfirmed,true);

    const duplicate=await app.inject({
      method:'POST',
      url:'/3aksa/api/tv/admin/channels',
      headers:auth(adminSession.accessToken),
      payload:{
        name:'نسخة مكررة',
        streamUrl:'https://media.example.com/news/master.m3u8',
        rightsAttested:true
      }
    });
    assert.equal(duplicate.statusCode,409,duplicate.body);
    assert.equal(duplicate.json<{error:string}>().error,'TV_CHANNEL_DUPLICATE');

    const playlist=[
      '#EXTM3U',
      '#EXTINF:-1 tvg-name="قناة الرياضة" tvg-logo="https://cdn.example.com/sport.png" group-title="رياضة",Sport',
      'https://media.example.com/sport/index.m3u8',
      '#EXTINF:-1 group-title="أطفال",قناة الأطفال',
      'https://media.example.com/kids/index.m3u8',
      '#EXTINF:-1 group-title="أخبار",قناة الأخبار المكررة',
      'https://media.example.com/news/master.m3u8'
    ].join('\n');

    const imported=await app.inject({
      method:'POST',
      url:'/3aksa/api/tv/admin/imports/m3u',
      headers:auth(adminSession.accessToken),
      payload:{
        content:playlist,
        sourceLabel:'CI playlist upload',
        rightsAttested:true,
        rightsNote:'CI licensed playlist'
      }
    });
    assert.equal(imported.statusCode,201,imported.body);
    const importBody=imported.json<{import:{batchId:string;imported:number;skipped:number;total:number}}>().import;
    assert.equal(importBody.imported,2);
    assert.equal(importBody.skipped,1);
    assert.equal(importBody.total,3);

    const invalidPlaylist=await app.inject({
      method:'POST',
      url:'/3aksa/api/tv/admin/imports/m3u',
      headers:auth(adminSession.accessToken),
      payload:{
        content:[
          '#EXTM3U',
          '#EXTINF:-1,قناة داخلية',
          'http://192.168.1.10/live.m3u8'
        ].join('\n'),
        rightsAttested:true
      }
    });
    assert.equal(invalidPlaylist.statusCode,400,invalidPlaylist.body);
    assert.equal(invalidPlaylist.json<{error:string}>().error,'INVALID_STREAM_URL');

    const imports=await app.inject({
      method:'GET',
      url:'/3aksa/api/tv/admin/imports',
      headers:auth(adminSession.accessToken)
    });
    assert.equal(imports.statusCode,200,imports.body);
    assert.ok(imports.json<{imports:Array<{id:string}>}>().imports.some((item)=>item.id===importBody.batchId));

    const adminChannels=await app.inject({
      method:'GET',
      url:'/3aksa/api/tv/admin/channels',
      headers:auth(adminSession.accessToken)
    });
    assert.equal(adminChannels.statusCode,200,adminChannels.body);
    const channels=adminChannels.json<{channels:Array<{id:string;name:string}>}>().channels;
    const sport=channels.find((channel)=>channel.name==='قناة الرياضة');
    const kids=channels.find((channel)=>channel.name==='قناة الأطفال');
    assert.ok(sport);
    assert.ok(kids);

    const reorder=await app.inject({
      method:'PUT',
      url:'/3aksa/api/tv/admin/channels/order',
      headers:auth(adminSession.accessToken),
      payload:{channelIds:[kids!.id,sport!.id,news.id]}
    });
    assert.equal(reorder.statusCode,200,reorder.body);
    assert.equal(reorder.json<{reordered:number}>().reordered,3);

    const manual=await app.inject({
      method:'GET',
      url:'/3aksa/api/tv/channels?sort=manual',
      headers:auth(viewerSession.accessToken)
    });
    assert.equal(manual.statusCode,200,manual.body);
    const manualChannels=manual.json<{channels:Array<{id:string;name:string}>}>().channels;
    assert.equal(manualChannels[0]?.id,kids!.id);
    assert.equal(manualChannels[1]?.id,sport!.id);
    assert.equal(manualChannels[2]?.id,news.id);

    const alphabetical=await app.inject({
      method:'GET',
      url:'/3aksa/api/tv/channels?sort=alphabetical',
      headers:auth(viewerSession.accessToken)
    });
    assert.equal(alphabetical.statusCode,200,alphabetical.body);
    const alphabeticNames=alphabetical.json<{channels:Array<{name:string}>}>().channels.map((item)=>item.name);
    assert.equal(alphabeticNames.length,3);

    const invalidInitialTv=await app.inject({
      method:'POST',
      url:'/3aksa/api/rooms',
      headers:auth(ownerSession.accessToken),
      payload:{
        name:'غرفة تشغيل بلا قناة',
        genderPolicy:'everyone',
        visibility:'public',
        maxUsers:20,
        tvEnabled:true
      }
    });
    assert.equal(invalidInitialTv.statusCode,400,invalidInitialTv.body);
    assert.equal(invalidInitialTv.json<{error:string}>().error,'TV_CHANNEL_REQUIRED');

    const roomResponse=await app.inject({
      method:'POST',
      url:'/3aksa/api/rooms',
      headers:auth(ownerSession.accessToken),
      payload:{
        name:'غرفة التلفزيون',
        genderPolicy:'everyone',
        visibility:'public',
        maxUsers:20,
        tvEnabled:false
      }
    });
    assert.equal(roomResponse.statusCode,201,roomResponse.body);
    const roomId=roomResponse.json<{room:{id:string}}>().room.id;

    await query(
      'INSERT INTO room_moderators (room_id,user_id,granted_by) VALUES ($1,$2,$3)',
      [roomId,moderatorSession.user.id,ownerSession.user.id]
    );

    const ownerState=await app.inject({
      method:'GET',
      url:`/3aksa/api/rooms/${roomId}/tv`,
      headers:auth(ownerSession.accessToken)
    });
    assert.equal(ownerState.statusCode,200,ownerState.body);
    assert.equal(ownerState.json<{tv:{enabled:boolean;canManage:boolean}}>().tv.enabled,false);
    assert.equal(ownerState.json<{tv:{enabled:boolean;canManage:boolean}}>().tv.canManage,true);

    const viewerState=await app.inject({
      method:'GET',
      url:`/3aksa/api/rooms/${roomId}/tv`,
      headers:auth(viewerSession.accessToken)
    });
    assert.equal(viewerState.statusCode,200,viewerState.body);
    assert.equal(viewerState.json<{tv:{canManage:boolean}}>().tv.canManage,false);

    const viewerDenied=await app.inject({
      method:'PATCH',
      url:`/3aksa/api/rooms/${roomId}/tv`,
      headers:auth(viewerSession.accessToken),
      payload:{enabled:true,channelId:news.id}
    });
    assert.equal(viewerDenied.statusCode,403,viewerDenied.body);
    assert.equal(viewerDenied.json<{error:string}>().error,'ROOM_TV_MANAGER_REQUIRED');

    const moderatorEnable=await app.inject({
      method:'PATCH',
      url:`/3aksa/api/rooms/${roomId}/tv`,
      headers:auth(moderatorSession.accessToken),
      payload:{enabled:true,channelId:news.id}
    });
    assert.equal(moderatorEnable.statusCode,200,moderatorEnable.body);
    const enabledTv=moderatorEnable.json<{tv:{enabled:boolean;channel:{id:string;name:string}|null}}>().tv;
    assert.equal(enabledTv.enabled,true);
    assert.equal(enabledTv.channel?.id,news.id);

    const viewerPlaying=await app.inject({
      method:'GET',
      url:`/3aksa/api/rooms/${roomId}/tv`,
      headers:auth(viewerSession.accessToken)
    });
    const viewerPlayingTv=viewerPlaying.json<{tv:{enabled:boolean;channel:{id:string;streamUrl:string}|null}}>().tv;
    assert.equal(viewerPlayingTv.enabled,true);
    assert.equal(viewerPlayingTv.channel?.id,news.id);
    assert.equal(viewerPlayingTv.channel?.streamUrl,'https://media.example.com/news/master.m3u8');

    const hide=await app.inject({
      method:'PATCH',
      url:`/3aksa/api/tv/admin/channels/${news.id}`,
      headers:auth(adminSession.accessToken),
      payload:{status:'hidden'}
    });
    assert.equal(hide.statusCode,200,hide.body);

    const disabledAfterHide=await app.inject({
      method:'GET',
      url:`/3aksa/api/rooms/${roomId}/tv`,
      headers:auth(viewerSession.accessToken)
    });
    assert.equal(disabledAfterHide.json<{tv:{enabled:boolean;channel:unknown}}>().tv.enabled,false);
    assert.equal(disabledAfterHide.json<{tv:{enabled:boolean;channel:unknown}}>().tv.channel,null);

    const reactivate=await app.inject({
      method:'PATCH',
      url:`/3aksa/api/tv/admin/channels/${news.id}`,
      headers:auth(adminSession.accessToken),
      payload:{status:'active'}
    });
    assert.equal(reactivate.statusCode,200,reactivate.body);

    const resume=await app.inject({
      method:'PATCH',
      url:`/3aksa/api/rooms/${roomId}/tv`,
      headers:auth(ownerSession.accessToken),
      payload:{enabled:true}
    });
    assert.equal(resume.statusCode,200,resume.body);
    assert.equal(resume.json<{tv:{enabled:boolean;channel:{id:string}|null}}>().tv.channel?.id,news.id);

    const deleted=await app.inject({
      method:'DELETE',
      url:`/3aksa/api/tv/admin/channels/${news.id}`,
      headers:auth(adminSession.accessToken)
    });
    assert.equal(deleted.statusCode,200,deleted.body);

    const disabledAfterDelete=await app.inject({
      method:'GET',
      url:`/3aksa/api/rooms/${roomId}/tv`,
      headers:auth(viewerSession.accessToken)
    });
    assert.equal(disabledAfterDelete.json<{tv:{enabled:boolean;channel:unknown}}>().tv.enabled,false);
    assert.equal(disabledAfterDelete.json<{tv:{enabled:boolean;channel:unknown}}>().tv.channel,null);

    const noConfirmDeleteAll=await app.inject({
      method:'DELETE',
      url:'/3aksa/api/tv/admin/channels',
      headers:auth(adminSession.accessToken)
    });
    assert.equal(noConfirmDeleteAll.statusCode,400,noConfirmDeleteAll.body);

    const deleteAll=await app.inject({
      method:'DELETE',
      url:'/3aksa/api/tv/admin/channels',
      headers:{...auth(adminSession.accessToken),'x-confirm-delete-all':'DELETE_ALL_TV_CHANNELS'}
    });
    assert.equal(deleteAll.statusCode,200,deleteAll.body);
    assert.equal(deleteAll.json<{deletedCount:number}>().deletedCount,2);

    const empty=await app.inject({
      method:'GET',
      url:'/3aksa/api/tv/channels',
      headers:auth(viewerSession.accessToken)
    });
    assert.deepEqual(empty.json<{channels:unknown[]}>().channels,[]);
  }finally{
    await cleanup();
    await app.close();
  }
});

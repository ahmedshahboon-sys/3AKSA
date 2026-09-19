import fs from 'node:fs';

function read(path){return fs.readFileSync(path,'utf8');}
function must(text,fragment,label){if(!text.includes(fragment))throw new Error(`${label} missing: ${fragment}`);}

const routes=read('apps/api/src/modules/rooms/routes.ts');
const client=read('packages/api-client/src/index.ts');
const app=read('apps/web/src/App.tsx');
const roomManage=read('apps/web/src/live/roomManage.tsx');
const rooms=read('apps/web/src/live/rooms.tsx');
const tvRoutes=read('apps/api/src/modules/tv/routes.ts');
const playlist=read('apps/api/src/modules/tv/playlist.ts');
const tvAdmin=read('apps/web/src/live/tvAdmin.tsx');

must(routes,'/:roomId/management','room management endpoint');
for(const method of ['roomManagement','updateRoom','addRoomModerator','removeRoomModerator','banRoomUser','unbanRoomUser','inviteRoomUser','revokeRoomInvite'])must(client,method+'(',method);
must(app,'path="/rooms/:roomId/manage"','room manage route');
must(rooms,"'/manage'","room manager entry");
for(const label of ['إعدادات الغرفة','المشرفون','حظر من الغرفة','دعوات الغرفة الخاصة'])must(roomManage,label,label);

for(const endpoint of ['/admin/channels','/admin/imports/m3u','/admin/imports'])must(tvRoutes,endpoint,endpoint);
for(const method of ['adminTvChannels','createAdminTvChannel','updateAdminTvChannel','deleteAdminTvChannel','deleteAllAdminTvChannels','reorderAdminTvChannels','importAdminM3u','adminTvImports'])must(client,method+'(',method);
must(app,'path="/admin/tv"','TV admin route');
for(const label of ['إضافة قناة','ترتيب أبجدي','حذف الكل','استيراد M3U / M3U8','سجل الاستيراد'])must(tvAdmin,label,label);
must(tvAdmin,'DELETE ALL TV','strong delete-all confirmation');
must(tvAdmin,'rightsAttested','rights attestation');
must(playlist,'PLAYLIST_URL_NOT_PUBLIC','SSRF public URL guard');
must(playlist,'MAX_PLAYLIST_BYTES','playlist size guard');
must(playlist,'MAX_PLAYLIST_CHANNELS','playlist channel limit');

console.log('Group 4 rooms and TV admin contract passed.');

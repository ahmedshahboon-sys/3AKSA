import fs from 'node:fs';

function read(path){return fs.readFileSync(path,'utf8');}
function must(text,fragment,label){if(!text.includes(fragment))throw new Error(`${label} missing: ${fragment}`);}

const api=read('packages/api-client/src/index.ts');
const app=read('apps/web/src/App.tsx');
const social=read('apps/web/src/live/social.tsx');
const nearby=read('apps/web/src/live/nearby.tsx');
const privateUi=read('apps/web/src/live/private.tsx');
const rooms=read('apps/web/src/live/rooms.tsx');
const limits=read('apps/api/src/request-rate-limits.ts');

for(const method of ['acceptFriendRequest','rejectFriendRequest','cancelFriendRequest','removeFriend','blockedUsers','blockUser','unblockUser','reportUser']) must(api,method+'(',`social API ${method}`);
must(app,'path="/friends"','friends route');
must(app,'path="/profiles/:username"','profile route');
for(const reason of ['spam','harassment','impersonation','inappropriate','other'])must(social,"value:'"+reason+"'",`report reason ${reason}`);
must(nearby,'?report=1','Nearby report entry');
must(nearby,'blockUser(person.username)','Nearby block action');
must(privateUi,'async function blockPeer()','Private block action');
must(privateUi,'?report=1','Private report entry');
must(rooms,'async function blockRoomMember','Room member block action');
must(rooms,'?report=1','Room member report entry');
must(limits,'sessionTokenFromRequest','session-based rate-limit identity');
must(limits,'-ip-flood','separate IP flood ceiling');

console.log('Group 3 social safety UI contract passed.');

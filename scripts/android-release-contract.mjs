import fs from 'node:fs';

function read(path){return fs.readFileSync(path,'utf8');}
function must(text,fragment,label){
  if(!text.includes(fragment))throw new Error(`${label} missing: ${fragment}`);
}

const launcher=read('apps/mobile/scripts/install-launcher-assets.mjs');
const candidate=read('.github/workflows/android-release-candidate.yml');
const trusted=read('.github/workflows/trusted-release.yml');

must(launcher,'3AKSA-logo-main-512.png','official launcher source');
must(launcher,'94791769c2939a870bfd8018af21d2a06473dc5a15be08913269e78da6511d88','official launcher hash');
must(launcher,'ic_launcher_round.png','round launcher icon');
must(launcher,'mipmap-anydpi-v26','adaptive launcher icon');
must(candidate,'ANDROID_VERSION_NAME: "1.0.0"','release version name');
must(candidate,'ANDROID_VERSION_CODE: "1"','release version code');
must(candidate,'assembleRelease','release build');
must(candidate,'android-release-candidate','release candidate job');
must(candidate,'apksigner.jar','signing toolkit handoff');
must(trusted,'ANDROID_KEYSTORE_BASE64','trusted release signing secret contract');

console.log('Android 1.0.0 release contract passed.');

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';

const repoRoot=path.resolve(process.cwd(),'../..');
const androidRes=path.resolve(process.cwd(),'android','app','src','main','res');
const zipPath=path.join(repoRoot,'docs','design','source','3AKSA_VISUAL_SOURCE_OF_TRUTH.zip');
const entry='logos/3AKSA-logo-main-512.png';
const expectedHash='94791769c2939a870bfd8018af21d2a06473dc5a15be08913269e78da6511d88';

const logo=execFileSync('unzip',['-p',zipPath,entry],{maxBuffer:8*1024*1024});
const actualHash=createHash('sha256').update(logo).digest('hex');
if(actualHash!==expectedHash){
  throw new Error(`OFFICIAL_LAUNCHER_LOGO_HASH_MISMATCH: ${actualHash}`);
}

const mipmaps=['mipmap-mdpi','mipmap-hdpi','mipmap-xhdpi','mipmap-xxhdpi','mipmap-xxxhdpi'];
for(const dir of mipmaps){
  const target=path.join(androidRes,dir);
  await fs.mkdir(target,{recursive:true});
  await fs.writeFile(path.join(target,'ic_launcher.png'),logo);
  await fs.writeFile(path.join(target,'ic_launcher_round.png'),logo);
}

const drawableNodpi=path.join(androidRes,'drawable-nodpi');
await fs.mkdir(drawableNodpi,{recursive:true});
await fs.writeFile(path.join(drawableNodpi,'ic_launcher_official.png'),logo);

const drawable=path.join(androidRes,'drawable');
await fs.mkdir(drawable,{recursive:true});
await fs.writeFile(
  path.join(drawable,'ic_launcher_foreground_official.xml'),
  `<?xml version="1.0" encoding="utf-8"?>
<inset xmlns:android="http://schemas.android.com/apk/res/android"
    android:drawable="@drawable/ic_launcher_official"
    android:inset="10%" />
`,
  'utf8'
);

const values=path.join(androidRes,'values');
await fs.mkdir(values,{recursive:true});
await fs.writeFile(
  path.join(values,'ic_launcher_background.xml'),
  `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <color name="ic_launcher_background">#111315</color>
</resources>
`,
  'utf8'
);

const adaptive=path.join(androidRes,'mipmap-anydpi-v26');
await fs.mkdir(adaptive,{recursive:true});
const adaptiveXml=`<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@color/ic_launcher_background" />
    <foreground android:drawable="@drawable/ic_launcher_foreground_official" />
</adaptive-icon>
`;
await fs.writeFile(path.join(adaptive,'ic_launcher.xml'),adaptiveXml,'utf8');
await fs.writeFile(path.join(adaptive,'ic_launcher_round.xml'),adaptiveXml,'utf8');

for(const dir of mipmaps){
  for(const name of ['ic_launcher.png','ic_launcher_round.png']){
    const bytes=await fs.readFile(path.join(androidRes,dir,name));
    const hash=createHash('sha256').update(bytes).digest('hex');
    if(hash!==expectedHash)throw new Error(`GENERATED_LAUNCHER_ICON_HASH_MISMATCH: ${dir}/${name}`);
  }
}

console.log(`Installed official 3AKSA Android launcher icon (${actualHash}).`);

import { promises as fs } from 'node:fs';
import path from 'node:path';

const versionName=(process.env.ANDROID_VERSION_NAME??'').trim();
const versionCode=Number(process.env.ANDROID_VERSION_CODE??'');

if(!/^[0-9A-Za-z._-]{1,32}$/.test(versionName))throw new Error('ANDROID_VERSION_NAME_INVALID');
if(!Number.isSafeInteger(versionCode)||versionCode<1||versionCode>2_100_000_000){
  throw new Error('ANDROID_VERSION_CODE_INVALID');
}

const gradle=path.resolve(process.cwd(),'android','app','build.gradle');
let source=await fs.readFile(gradle,'utf8');
if(!/versionCode\s+\d+/.test(source)||!(/versionName\s+["'][^"']+["']/.test(source))){
  throw new Error('ANDROID_VERSION_FIELDS_NOT_FOUND');
}
source=source
  .replace(/versionCode\s+\d+/,`versionCode ${versionCode}`)
  .replace(/versionName\s+["'][^"']+["']/,`versionName "${versionName}"`);
await fs.writeFile(gradle,source,'utf8');
console.log(`Configured Android version ${versionName} (${versionCode}).`);

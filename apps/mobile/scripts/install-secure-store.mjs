import { promises as fs } from 'node:fs';
import path from 'node:path';

const appId=process.env.ANDROID_APP_ID||'ly.threeaksa.app';
const root=path.resolve(process.cwd(),'android');
const javaDir=path.join(root,'app','src','main','java',...appId.split('.'));
const mainActivity=path.join(javaDir,'MainActivity.java');
const manifest=path.join(root,'app','src','main','AndroidManifest.xml');
const template=path.resolve(process.cwd(),'native','SecureStorePlugin.java.template');

await fs.mkdir(javaDir,{recursive:true});
const source=(await fs.readFile(template,'utf8')).replaceAll('__PACKAGE__',appId);
await fs.writeFile(path.join(javaDir,'SecureStorePlugin.java'),source,'utf8');

let activity=await fs.readFile(mainActivity,'utf8');
if(!activity.includes('registerPlugin(SecureStorePlugin.class)')){
  activity=activity.replace(
    'import com.getcapacitor.BridgeActivity;\n',
    'import android.os.Bundle;\nimport com.getcapacitor.BridgeActivity;\n'
  );
  activity=activity.replace(
    /public class MainActivity extends BridgeActivity \{\s*\}/,
    `public class MainActivity extends BridgeActivity {
  @Override
  public void onCreate(Bundle savedInstanceState) {
    super.onCreate(savedInstanceState);
    registerPlugin(SecureStorePlugin.class);
  }
}`
  );
  await fs.writeFile(mainActivity,activity,'utf8');
}

let xml=await fs.readFile(manifest,'utf8');
if(/android:allowBackup="[^"]*"/.test(xml)){
  xml=xml.replace(/android:allowBackup="[^"]*"/,'android:allowBackup="false"');
}else{
  xml=xml.replace('<application','<application android:allowBackup="false"');
}
if(/android:usesCleartextTraffic="[^"]*"/.test(xml)){
  xml=xml.replace(/android:usesCleartextTraffic="[^"]*"/,'android:usesCleartextTraffic="false"');
}else{
  xml=xml.replace('<application','<application android:usesCleartextTraffic="false"');
}
await fs.writeFile(manifest,xml,'utf8');

console.log('Installed 3AKSA Android SecureStore plugin and hardened generated manifest.');

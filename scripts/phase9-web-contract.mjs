import fs from 'node:fs';

function read(path){return fs.readFileSync(path,'utf8');}
function must(text,fragment,label){
  if(!text.includes(fragment))throw new Error(`${label} missing: ${fragment}`);
}

const html=read('apps/web/index.html');
const manifest=JSON.parse(read('apps/web/public/manifest.webmanifest'));
const sw=read('apps/web/public/sw.js');
const theme=read('apps/web/src/theme.ts');
const styles=read('apps/web/src/styles.css');
const main=read('apps/web/src/main.tsx');

must(html,'<html lang="ar" dir="rtl">','RTL document');
must(html,'viewport-fit=cover','mobile safe areas');
must(html,'apple-mobile-web-app-capable','iOS PWA metadata');
must(html,'%BASE_URL%manifest.webmanifest','base-path manifest');

if(manifest.lang!=='ar'||manifest.dir!=='rtl'||manifest.display!=='standalone'){
  throw new Error('PWA manifest language/direction/display contract failed');
}
if(manifest.start_url!=='.'||manifest.scope!=='.')throw new Error('PWA manifest must remain base-path portable');
if(!Array.isArray(manifest.icons)||!manifest.icons.some((icon)=>String(icon.purpose).includes('maskable'))){
  throw new Error('PWA maskable icon missing');
}

for(const value of ["'system'","'light'","'dark'","'pink-light'","'pink-dark'"]){
  must(theme,value,'theme option');
}
must(theme,"root.dataset.palette = theme.startsWith('pink-') ? 'pink' : 'main'","pink palette");
must(styles,":root[data-mode='light']",'light theme tokens');
must(styles,":root[data-palette='pink']",'pink theme tokens');
must(styles,"font-family: 'Readex Pro'","Readex Pro");
must(styles,'env(safe-area-inset-bottom)','safe-area bottom');
must(styles,'@media (max-width:520px)','mobile breakpoint');
must(styles,'@media (min-width:680px)','desktop breakpoint');

must(main,"normalizeBasePath(import.meta.env.VITE_PUBLIC_BASE_PATH || '/3aksa/')",'base-path runtime');
must(main,"navigator.serviceWorker.register",'service-worker registration');
must(sw,"ما فيش اتصال توا",'offline navigation fallback');
must(sw,"event.data?.type === 'SKIP_WAITING'",'explicit PWA update activation');
must(sw,"url.pathname.startsWith(`${scopePath}api/`)","API cache exclusion");
must(sw,"url.pathname.startsWith(`${scopePath}socket.io/`)","Socket.IO cache exclusion");

console.log('Phase 9 Web/PWA contract passed: RTL, themes, responsive, safe-area, offline and base-path behavior.');

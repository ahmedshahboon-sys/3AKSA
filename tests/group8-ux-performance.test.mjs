import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=(path)=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('Group 8 home survives partial API failures',()=>{
  const home=read('apps/web/src/live/home.tsx');
  assert.ok(home.includes('Promise.allSettled'));
  assert.ok(home.includes("issues.push('الغرف')"));
  assert.ok(home.includes('partial-data-banner'));
  assert.ok(home.includes('resource.reload()'));
});

test('Group 8 splits heavy routes and HLS from initial bundle',()=>{
  const app=read('apps/web/src/App.tsx');
  const player=read('apps/web/src/live/tvPlayer.tsx');
  assert.ok(app.includes("lazy(()=>import('./live/tv')"));
  assert.ok(app.includes("lazy(()=>import('./live/admin')"));
  assert.ok(app.includes('<Suspense fallback={<RouteLoading/>}>'));
  assert.ok(!player.includes("import Hls from 'hls.js'"));
  assert.ok(player.includes("import('hls.js')"));
});

test('Group 8 retries live resources on reconnect',()=>{
  const resource=read('apps/web/src/useApiResource.ts');
  assert.ok(resource.includes("window.addEventListener('online',handleOnline)"));
  assert.ok(resource.includes("window.removeEventListener('online',handleOnline)"));
});

test('Group 8 preserves accessibility and reduced motion',()=>{
  const common=read('apps/web/src/live/common.tsx');
  const styles=read('apps/web/src/styles.css');
  assert.ok(common.includes('aria-live="polite"'));
  assert.ok(common.includes('role="alert"'));
  assert.ok(styles.includes('prefers-reduced-motion: reduce'));
  assert.ok(styles.includes('@media (pointer:coarse)'));
  assert.ok(styles.includes('textarea:focus-visible'));
  assert.ok(styles.includes('@media (max-width:360px)'));
});

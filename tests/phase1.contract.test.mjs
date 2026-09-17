import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

const app = read('apps/web/src/App.tsx');
const screens = read('apps/web/src/screens.tsx');
const ui = read('apps/web/src/ui.tsx');
const main = read('apps/web/src/main.tsx');
const master = read('docs/design/3AKSA_VISUAL_UI_MASTER.md');

test('official five-tab navigation stays fixed', () => {
  const labels = ['الرئيسية', 'الغرف', 'القريبون', 'الخاص', 'حسابي'];
  let previous = -1;
  for (const label of labels) {
    const index = app.indexOf(`label: '${label}'`);
    assert.ok(index > previous, `navigation label missing or out of order: ${label}`);
    previous = index;
  }
});

test('visual source is the project authority', () => {
  assert.match(master, /المصدر البصري الرسمي المعتمد/);
  assert.match(master, /Readex Pro/);
  assert.match(master, /Bottom Navigation/);
});

test('V1 exposes text and voice notes without calls or camera', () => {
  assert.match(screens, /تسجيل صوتي/);
  assert.match(ui, /بدون صور أو مكالمات/);
  for (const forbidden of ['camera', 'video-call', 'voice-call', 'VoiceCall', 'VideoCall']) {
    assert.equal(`${screens}\n${ui}`.includes(forbidden), false, `forbidden V1 control found: ${forbidden}`);
  }
});

test('required Phase 1 visual routes exist', () => {
  for (const route of ['/rooms/:roomId', '/private/:userId', '/wallet', '/store', '/tv', '/notifications']) {
    assert.ok(app.includes(route), `missing route ${route}`);
  }
});

test('web foundation is base-path aware and uses Readex Pro', () => {
  assert.match(main, /VITE_PUBLIC_BASE_PATH \|\| '\/3aksa\/'/);
  assert.match(main, /@fontsource\/readex-pro\/400\.css/);
});

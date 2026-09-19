import { readFileSync, existsSync } from 'node:fs';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const mustContain = (text, value, label) => {
  if (!text.includes(value)) throw new Error(`Missing ${label}: ${value}`);
};
const mustNotContain = (text, value, label) => {
  if (text.includes(value)) throw new Error(`Forbidden ${label}: ${value}`);
};

const app = read('apps/web/src/App.tsx');
const screens = read('apps/web/src/screens.tsx');
const ui = read('apps/web/src/ui.tsx');
const main = read('apps/web/src/main.tsx');
const theme = read('apps/web/src/theme.ts');
const manifest = read('apps/web/public/manifest.webmanifest');
const visualMaster = read('docs/design/3AKSA_VISUAL_UI_MASTER.md');
const tokens = read('docs/design/design-tokens.json');

const navLabels = ['الرئيسية', 'الغرف', 'القريبون', 'الخاص', 'حسابي'];
let previousNavIndex = -1;
for (const label of navLabels) {
  const currentIndex = app.indexOf(`label: '${label}'`);
  if (currentIndex <= previousNavIndex) throw new Error(`Bottom navigation label missing or out of order: ${label}`);
  previousNavIndex = currentIndex;
}

for (const route of ['/rooms/:roomId', '/private/:conversationId', '/private/new/:username', '/wallet', '/store', '/tv', '/notifications']) {
  mustContain(app, route, 'Phase 1 route');
}

for (const feature of ['RoomChatScreen', 'ConversationScreen', 'WalletScreen', 'StoreScreen', 'TvScreen', 'NotificationsScreen']) {
  mustContain(screens, `export function ${feature}`, 'Phase 1 screen');
}

for (const forbidden of ['camera', 'video-call', 'voice-call', 'VoiceCall', 'VideoCall']) {
  mustNotContain(`${screens}\n${ui}`, forbidden, 'V1 media/call control');
}

mustContain(screens, 'تسجيل صوتي', 'voice note composer control');
mustContain(ui, 'بدون صور أو مكالمات', 'V1 guard copy');
mustContain(main, "@fontsource/readex-pro/400.css", 'Readex Pro');
mustContain(main, "VITE_PUBLIC_BASE_PATH || '/3aksa/'", 'base path');
mustContain(theme, 'pink-light', 'pink theme');
mustContain(theme, 'pink-dark', 'pink dark theme');
mustContain(manifest, '"display": "standalone"', 'PWA standalone mode');
mustContain(visualMaster, 'المصدر البصري الرسمي المعتمد', 'official visual authority');
mustContain(visualMaster, 'Readex Pro', 'official font rule');
mustContain(visualMaster, 'Bottom Navigation', 'official navigation rule');
mustContain(tokens, '"font_family": "Readex Pro"', 'official design tokens');

for (const path of ['apps/web/public/sw.js', 'docs/design/3AKSA_UI_VISUAL_REFERENCE.html', 'docs/design/README_FIRST.txt']) {
  if (!existsSync(new URL(`../${path}`, import.meta.url))) throw new Error(`Missing required Phase 1 file: ${path}`);
}

console.log('Phase 1 quality gate passed.');

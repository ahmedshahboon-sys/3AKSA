const VERSION = '3aksa-shell-v2';
const scopeUrl = new URL(self.registration.scope);
const scopePath = scopeUrl.pathname.endsWith('/') ? scopeUrl.pathname : `${scopeUrl.pathname}/`;
const shellUrl = new URL(scopePath, self.location.origin).toString();

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(VERSION)
      .then(async (cache) => {
        try {
          const response = await fetch(shellUrl, { cache: 'reload' });
          if (response.ok) await cache.put(shellUrl, response.clone());
        } catch {
          // Installation must still succeed when the network is temporarily unavailable.
        }
      })
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    Promise.all([
      self.clients.claim(),
      caches.keys().then((keys) => Promise.all(
        keys.filter((key) => key.startsWith('3aksa-') && key !== VERSION).map((key) => caches.delete(key)),
      )),
    ]),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin || !url.pathname.startsWith(scopePath)) return;
  if (url.pathname.startsWith(`${scopePath}api/`) || url.pathname.startsWith(`${scopePath}socket.io/`)) return;

  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const response = await fetch(request);
        if (response.ok) {
          const cache = await caches.open(VERSION);
          await Promise.all([
            cache.put(request, response.clone()),
            cache.put(shellUrl, response.clone()),
          ]);
        }
        return response;
      } catch {
        return (await caches.match(request))
          || (await caches.match(shellUrl))
          || new Response(
            '<!doctype html><html lang="ar" dir="rtl"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>3AKSA</title><body><main style="font-family:sans-serif;padding:2rem;text-align:center"><h1>3AKSA | عكسة</h1><p>ما فيش اتصال توا. جرّب مرة ثانية لما يرجع النت.</p></main></body></html>',
            { headers: { 'Content-Type': 'text/html; charset=utf-8' } },
          );
      }
    })());
    return;
  }

  event.respondWith((async () => {
    const cached = await caches.match(request);
    if (cached) return cached;

    const response = await fetch(request);
    if (response.ok && response.type === 'basic') {
      const cache = await caches.open(VERSION);
      await cache.put(request, response.clone());
    }
    return response;
  })());
});

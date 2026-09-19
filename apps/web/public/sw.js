const VERSION = '3aksa-shell-v3';
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
      }),
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


function notificationTarget(payload) {
  const data = payload?.data && typeof payload.data === 'object' ? payload.data : {};
  if (typeof data.conversationId === 'string') return `private/${encodeURIComponent(data.conversationId)}`;
  if (payload?.type === 'message_request') return 'private';
  if (payload?.type === 'friend_request' || payload?.type === 'friend_accepted') return 'notifications';
  if (['wallet_topup','wallet_transfer','purchase','gift_received'].includes(payload?.type)) return 'wallet';
  if (payload?.type === 'app_update') return 'account';
  return 'notifications';
}

self.addEventListener('push', (event) => {
  event.waitUntil((async () => {
    let payload = {};
    try { payload = event.data ? event.data.json() : {}; } catch { payload = {}; }
    const title = typeof payload.title === 'string' ? payload.title : 'عكسة';
    const body = typeof payload.body === 'string' ? payload.body : 'عندك إشعار جديد';
    const target = notificationTarget(payload);
    const targetUrl = new URL(target, self.registration.scope).toString();
    await self.registration.showNotification(title, {
      body,
      icon: new URL('icons/logo-main-192.png', self.registration.scope).toString(),
      badge: new URL('icons/logo-main-192.png', self.registration.scope).toString(),
      tag: typeof payload.id === 'string' ? payload.id : undefined,
      renotify: false,
      data: { url: targetUrl, notificationId: payload.id || null, type: payload.type || null },
      dir: 'rtl',
      lang: 'ar'
    });
  })());
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || self.registration.scope;
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of windows) {
      if ('focus' in client) {
        if ('navigate' in client) await client.navigate(targetUrl);
        return client.focus();
      }
    }
    return self.clients.openWindow(targetUrl);
  })());
});


self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

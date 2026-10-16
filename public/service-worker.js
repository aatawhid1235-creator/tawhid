const CACHE_NAME = 'txb-gaming-panel-v2';
const APP_ROOT = new URL(self.registration.scope).pathname;

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const shellUrl = new URL(APP_ROOT, self.location.origin);
    const response = await fetch(shellUrl);
    if (!response.ok) throw new Error('Could not fetch app shell');
    const html = await response.clone().text();
    const assets = [...html.matchAll(/(?:src|href)="([^"]+)"/g)]
      .map(match => new URL(match[1], self.location.origin))
      .filter(url => url.origin === self.location.origin && url.pathname.startsWith(APP_ROOT))
      .map(url => url.href);
    const cache = await caches.open(CACHE_NAME);
    await cache.put(shellUrl, response.clone());
    await cache.put(new URL('index.html', shellUrl), response.clone());
    await cache.addAll([...new Set(assets)]);
  })());
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('txb-gaming-panel-') && key !== CACHE_NAME).map(key => caches.delete(key)))));
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;
  event.respondWith(caches.match(request).then(cached => cached || fetch(request).then(response => {
    if (response.ok) {
      const copy = response.clone();
      caches.open(CACHE_NAME).then(cache => cache.put(request, copy));
    }
    return response;
  }).catch(() => request.mode === 'navigate' ? caches.match(APP_ROOT) : Response.error())));
});


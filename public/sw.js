const CACHE_NAME = 'patroparadax-cache-v3';

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      // Just cache offline bare minimum
      return cache.addAll(['/']);
    })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(clients.claim());
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  // A simple pass-through fetch handler is enough to trigger PWA installability in Chrome
  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request))
  );
});

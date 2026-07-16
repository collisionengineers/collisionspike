/*
 * CollisionCapture service worker — a deliberately conservative offline shell.
 *
 * Strategy is NETWORK-FIRST for every navigation and same-origin GET asset, so a
 * new deployment is never masked by a stale cached bundle. The cache is only a
 * fallback used when the network fails (field capture on poor connectivity).
 *
 * The capture API and every non-GET request are never intercepted, so uploads,
 * SAS PUTs, token exchange, manifest, complete and submit always go straight to
 * the network and are never cached.
 */
const CACHE = 'collisioncapture-shell-v1';
const SHELL = [
  '/',
  '/manifest.webmanifest',
  '/pwa-icon-192.png',
  '/pwa-icon-512.png',
  '/apple-touch-icon.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(SHELL))
      .then(() => self.skipWaiting())
      .catch(() => undefined)
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Only handle our own GETs; never the capture API, uploads, or cross-origin SAS.
  if (request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api')) {
    return;
  }

  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok && response.type === 'basic') {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(request, copy)).catch(() => undefined);
        }
        return response;
      })
      .catch(async () => {
        const cached = await caches.match(request);
        if (cached) return cached;
        if (request.mode === 'navigate') {
          const shell = await caches.match('/');
          if (shell) return shell;
        }
        return Response.error();
      })
  );
});

// VexlyPOS Service Worker
// BUG-F6 fix: previous version was cache-first for ALL non-API GETs including
// `index.html`, which after a deploy caused the cached HTML to point at JS
// chunks (`main.OLD_HASH.js`) that no longer exist on the server, leading to a
// blank screen until the user did a hard reload.
//
// New strategy:
//   - HTML / navigation requests → NETWORK-FIRST (fall back to cache only if
//     network fails) so users always get the latest hash references.
//   - Static hashed assets (JS/CSS/images) → STALE-WHILE-REVALIDATE so the
//     app loads instantly from cache and the cache refreshes in background.
//   - API requests are always passed through (no caching).
const CACHE_NAME = 'vexlypos-v5';

const STATIC_ASSETS = [
  '/',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png',
];

// Install — pre-cache lightweight shell assets, then skipWaiting
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(STATIC_ASSETS))
      .then(() => self.skipWaiting())
  );
});

// Activate — purge old caches, then claim clients
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

function isHtmlRequest(request) {
  if (request.mode === 'navigate') return true;
  const accept = request.headers.get('accept') || '';
  return accept.includes('text/html');
}

// Fetch — strategy depends on resource type
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.pathname.includes('/api/')) return;

  // ─── HTML: network-first ──────────────────────────────────────────────────
  if (isHtmlRequest(event.request)) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response && response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((c) => c.put(event.request, clone));
          }
          return response;
        })
        .catch(() => caches.match(event.request).then((c) => c || caches.match('/')))
    );
    return;
  }

  // ─── Static assets: stale-while-revalidate ────────────────────────────────
  event.respondWith(
    caches.match(event.request).then((cached) => {
      const networkPromise = fetch(event.request).then((response) => {
        if (response && response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((c) => c.put(event.request, clone));
        }
        return response;
      }).catch(() => cached);
      return cached || networkPromise;
    })
  );
});

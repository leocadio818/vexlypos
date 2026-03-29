const CACHE_NAME = 'vexlypos-v2';

const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png',
];

// Install — cache static assets and force activate
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS);
    })
  );
  self.skipWaiting();
});

// Activate — delete ALL old caches immediately
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

// Fetch — NETWORK FIRST for everything, cache only static assets as fallback
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET
  if (request.method !== 'GET') return;
  if (!url.protocol.startsWith('http')) return;

  // NEVER intercept API calls
  if (url.pathname.startsWith('/api/')) return;

  // NEVER intercept webpack chunks (dynamic imports) — let them go to network directly
  if (url.pathname.includes('/static/js/') && url.pathname.includes('.chunk.')) return;

  // For navigation requests — network first, fallback to cached index.html
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() => caches.match('/index.html'))
    );
    return;
  }

  // For static assets — network first, then cache
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok && shouldCache(url.pathname)) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
        }
        return response;
      })
      .catch(() => caches.match(request))
  );
});

function shouldCache(pathname) {
  // Only cache fonts and the main assets, NOT JS bundles (they change with each build)
  const exts = ['.css', '.png', '.jpg', '.jpeg', '.svg', '.woff', '.woff2', '.ttf', '.ico', '.webp', '.mp3'];
  return exts.some((ext) => pathname.endsWith(ext));
}

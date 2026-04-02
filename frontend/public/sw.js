const CACHE_NAME = 'vexlypos-v3';

const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png',
];

// Install — cache app shell with fault tolerance (one bad URL won't block the rest)
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      Promise.all(
        STATIC_ASSETS.map((url) =>
          cache.add(url).catch((err) => console.warn('[SW] cache skip:', url, err))
        )
      )
    )
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

// Fetch — NETWORK FIRST, cache static assets (including JS/CSS bundles) as fallback
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET and non-http
  if (request.method !== 'GET') return;
  if (!url.protocol.startsWith('http')) return;

  // NEVER intercept API calls
  if (url.pathname.startsWith('/api/')) return;

  // For navigation requests — network first, fallback to cached index.html
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          return response;
        })
        .catch(() => caches.match('/index.html'))
    );
    return;
  }

  // For all other assets (JS, CSS, images, fonts) — network first, then cache
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
  if (pathname.startsWith('/static/')) return true;
  const exts = ['.js', '.css', '.png', '.jpg', '.jpeg', '.svg', '.woff', '.woff2', '.ttf', '.ico', '.webp', '.mp3'];
  return exts.some((ext) => pathname.endsWith(ext));
}

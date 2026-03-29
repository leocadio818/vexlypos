const CACHE_NAME = 'vexlypos-v1';
const API_CACHE = 'vexlypos-api-v1';

const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png',
  '/sounds/notification.mp3',
];

// API endpoints to cache for offline use
const CACHEABLE_API = [
  '/api/products',
  '/api/categories',
  '/api/tables',
  '/api/areas',
  '/api/system/config',
  '/api/customers',
  '/api/taxes',
  '/api/modifiers',
];

// Install — cache static assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS);
    })
  );
  self.skipWaiting();
});

// Activate — clean old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME && key !== API_CACHE)
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

// Fetch handler
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (request.method !== 'GET') return;
  if (!url.protocol.startsWith('http')) return;

  // API calls — Network first, cache fallback for cacheable endpoints
  if (url.pathname.startsWith('/api/')) {
    const isCacheable = CACHEABLE_API.some((ep) => url.pathname === ep || url.pathname.startsWith(ep + '?'));
    if (isCacheable) {
      event.respondWith(networkFirstAPI(request));
    }
    return;
  }

  // Static assets — Cache first, then network
  event.respondWith(cacheFirstStatic(request, url));
});

// Network first for API (fresh data preferred, cache as fallback)
async function networkFirstAPI(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(API_CACHE);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    if (cached) return cached;
    return new Response(JSON.stringify({ error: 'offline', cached: false }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

// Cache first for static assets
async function cacheFirstStatic(request, url) {
  try {
    const cached = await caches.match(request);
    if (cached) return cached;

    const response = await fetch(request);
    if (response.ok && shouldCacheStatic(url.pathname)) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    // Offline fallback for navigation
    if (request.mode === 'navigate') {
      const cached = await caches.match('/index.html');
      if (cached) return cached;
    }
    return new Response('Offline', { status: 503 });
  }
}

function shouldCacheStatic(pathname) {
  const exts = ['.js', '.css', '.png', '.jpg', '.jpeg', '.svg', '.woff', '.woff2', '.ttf', '.ico', '.webp', '.mp3'];
  return exts.some((ext) => pathname.endsWith(ext));
}

// Listen for messages from the app
self.addEventListener('message', (event) => {
  if (event.data === 'skipWaiting') {
    self.skipWaiting();
  }
  if (event.data === 'clearApiCache') {
    caches.delete(API_CACHE);
  }
});

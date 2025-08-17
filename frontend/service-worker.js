/* Basic offline-first SW for shell + static assets */
const VERSION = 'v1.0.0';
const CACHE_NAME = `gg-cache-${VERSION}`;
const ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/assets/css/style.css',
  '/assets/css/responsive.css',
  '/assets/js/script.js',
  '/assets/js/profile.js',
  '/assets/icons/icon-192.png',
  '/assets/icons/icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(ASSETS))
      .then(self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.map(k => (k !== CACHE_NAME ? caches.delete(k) : null)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;

  // Avoid caching non-GET or auth-protected API calls
  const isAPI = req.url.includes('/api/');
  if (req.method !== 'GET' || isAPI) {
    return; // network first
  }

  event.respondWith(
    caches.match(req).then(cached => {
      const fetchPromise = fetch(req)
        .then(res => {
          // Clone and update cache in background
          const resClone = res.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(req, resClone));
          return res;
        })
        .catch(() => cached); // fallback to cache if offline

      return cached || fetchPromise;
    })
  );
});

// Offline support: the page itself is fetched network-first (so updates show up),
// every other file is served from the cache once seen.
const CACHE = 'naorush-v1';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET' || !request.url.startsWith(self.location.origin)) return;
  const put = (response) => {
    if (response.ok) {
      const copy = response.clone();
      caches.open(CACHE).then((cache) => cache.put(request, copy));
    }
    return response;
  };
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then(put)
        .catch(() => caches.match(request)),
    );
    return;
  }
  event.respondWith(caches.match(request).then((hit) => hit ?? fetch(request).then(put)));
});

const CACHE = 'wait-v6';
const ASSETS = ['./', './index.html', './games.js', './manifest.webmanifest', './icon-192.png', './icon-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Track whether we've already notified this session
let notified = false;

function notifyClients() {
  if (notified) return;
  notified = true;
  self.clients.matchAll({ type: 'window' }).then(clients => {
    clients.forEach(c => c.postMessage({ type: 'content-updated' }));
  });
}

// Compare two responses by content-length + last-modified
function hasChanged(cached, fresh) {
  if (!cached) return false; // first fetch, not an "update"
  const cLen = cached.headers.get('content-length');
  const fLen = fresh.headers.get('content-length');
  const cMod = cached.headers.get('last-modified');
  const fMod = fresh.headers.get('last-modified');
  return (cLen !== fLen) || (cMod !== fMod);
}

self.addEventListener('fetch', e => {
  e.respondWith(
    caches.open(CACHE).then(cache =>
      cache.match(e.request).then(cached => {
        const fetchPromise = fetch(e.request).then(response => {
          if (response.ok) {
            if (hasChanged(cached, response)) notifyClients();
            cache.put(e.request, response.clone());
          }
          return response;
        }).catch(() => cached);

        return cached || fetchPromise;
      })
    )
  );
});

// Allow the page to tell us to skip waiting
self.addEventListener('message', e => {
  if (e.data === 'skip-waiting') self.skipWaiting();
});

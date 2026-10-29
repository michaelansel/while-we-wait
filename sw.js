const CACHE = 'wait-v12';
const ASSETS = ['./', './index.html', './games.js', './charades-art.js', './family.js', './manifest.webmanifest', './icon-192.png', './icon-512.png'];

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

// Notify on every detected change — the page's toast is idempotent
// (single #update-toast element), so repeats are harmless. The old
// once-per-SW-session flag silently swallowed later updates.
function notifyClients() {
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
  // Navigations: NETWORK-FIRST. The old always-cached-first behavior could get
  // permanently stuck: revalidation went through the browser HTTP cache (no
  // Cache-Control headers from the server), a stale copy compared "unchanged"
  // and got written back into this cache — poisoning it. A page reload then
  // served the stale copy forever. Online navigations now always hit the
  // network; the cache is only the offline fallback.
  if (e.request.mode === 'navigate') {
    e.respondWith(
      fetch(e.request, {cache:'no-store'})
        .then(response => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE).then(c => c.put(e.request, copy));
          }
          return response;
        })
        .catch(() => caches.open(CACHE).then(c => c.match(e.request)))
    );
    return;
  }
  e.respondWith(
    caches.open(CACHE).then(cache =>
      cache.match(e.request).then(cached => {
        // cache:'no-store' — the browser's HTTP cache can otherwise serve a
        // stale copy here, making hasChanged() see identical headers and
        // silently miss real updates.
        // Update-probe fetches from the manual "Check for updates" button
        // (?ck= param) must not be served from or written into the cache.
        const isProbe = new URL(e.request.url).searchParams.has('ck');
        if (isProbe) return fetch(e.request, {cache:'no-store'});
        const fetchPromise = fetch(e.request, {cache:'no-store'}).then(response => {
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

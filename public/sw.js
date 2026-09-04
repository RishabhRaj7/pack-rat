/* Passport service worker
 * Strategy:
 *  - Navigations: network-first, falling back to the cached shell when offline. (Serving the
 *    cached shell first meant desktop browsers kept booting an outdated bundle after a deploy
 *    until a second reload — with HashRouter every tab/route boots from "/", so a stale shell
 *    broke navigation on already-open tabs.) IndexedDB holds the user's synced data.
 *  - Same-origin static assets (hashed): stale-while-revalidate.
 *  - Data APIs (weather, currency, flight status): network-first, falling back to the last cached
 *    response so the daily prep panel & expense conversions still render offline.
 *  - Fonts / CDN: cache-first.
 *  - Firebase traffic is never intercepted (it has its own offline persistence).
 */
const VERSION = 'pack-rat-v2';
const SHELL_CACHE = `${VERSION}-shell`;
const DATA_CACHE = `${VERSION}-data`;
const FONT_CACHE = `${VERSION}-fonts`;
const SHELL_URLS = ['/', '/index.html', '/manifest.webmanifest', '/icon.svg', '/icon-512.png'];

const DATA_HOSTS = ['api.open-meteo.com', 'api.frankfurter.app', 'aerodatabox.p.rapidapi.com', 'nominatim.openstreetmap.org'];
const FONT_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com'];
const BYPASS_HOSTS = ['firestore.googleapis.com', 'firebasestorage.googleapis.com', 'identitytoolkit.googleapis.com', 'securetoken.googleapis.com', 'www.googleapis.com'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      // add individually so one missing file doesn't abort the whole shell precache
      .then((cache) => Promise.all(SHELL_URLS.map((u) => cache.add(u).catch(() => undefined))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k)))).then(() => self.clients.claim())
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

async function staleWhileRevalidate(request, cacheName, isNavigation = false) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request, { ignoreSearch: isNavigation });
  const network = fetch(request)
    .then((res) => {
      if (res && (res.ok || res.type === 'opaque')) cache.put(request, res.clone());
      return res;
    })
    .catch(() => undefined);
  if (cached) return cached;
  const res = await network;
  if (res) return res;
  if (isNavigation) return (await cache.match('/')) || (await cache.match('/index.html')) || Response.error();
  return Response.error();
}

async function navigationNetworkFirst() {
  const cache = await caches.open(SHELL_CACHE);
  try {
    const res = await fetch('/', { cache: 'no-cache' });
    if (res && res.ok) cache.put('/', res.clone());
    return res;
  } catch (e) {
    return (await cache.match('/')) || (await cache.match('/index.html')) || Response.error();
  }
}

async function networkFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const res = await fetch(request);
    if (res && res.ok) cache.put(request, res.clone());
    return res;
  } catch (e) {
    const cached = await cache.match(request);
    if (cached) return cached;
    return new Response(JSON.stringify({ offline: true }), { status: 503, headers: { 'Content-Type': 'application/json' } });
  }
}

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;
  try {
    const res = await fetch(request);
    if (res && (res.ok || res.type === 'opaque')) cache.put(request, res.clone());
    return res;
  } catch (e) {
    return Response.error();
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);

  if (BYPASS_HOSTS.some((h) => url.hostname.endsWith(h))) return;

  if (request.mode === 'navigate') {
    // Every route boots from "/" (HashRouter). Prefer the network so a fresh deploy is picked up
    // immediately; fall back to the cached shell when offline.
    event.respondWith(navigationNetworkFirst());
    return;
  }
  if (url.origin === self.location.origin) {
    event.respondWith(staleWhileRevalidate(request, SHELL_CACHE));
    return;
  }
  if (DATA_HOSTS.includes(url.hostname)) {
    event.respondWith(networkFirst(request, DATA_CACHE));
    return;
  }
  if (FONT_HOSTS.includes(url.hostname)) {
    event.respondWith(cacheFirst(request, FONT_CACHE));
    return;
  }
});

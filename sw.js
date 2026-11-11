// Service worker: caches the app shell so the app opens instantly (and offline),
// and keeps team crests around. Scores are never cached; they always come from
// the network.
//
// App shell strategy: stale-while-revalidate. The cached copy is served at once
// and refreshed in the background, so after a deploy the new version is picked
// up on the next launch (the app also shows a "New version ready" prompt).
// No version number to bump when you change a file.
// On localhost the shell is fetched network-first so edits show up on reload.

const SHELL_CACHE = 'shell-v1';
const CREST_CACHE = 'crests-v1'; // bump to drop stored crests (e.g. a club changed its badge)
const DEV = ['localhost', '127.0.0.1', '[::1]'].includes(self.location.hostname);
const ROOT = new URL('./', self.location).href;

const SHELL = [
  './',
  'manifest.webmanifest',
  'css/styles.css',
  'js/app.js',
  'js/config.js',
  'js/store.js',
  'js/theme.js',
  'js/lib/dates.js',
  'js/lib/dom.js',
  'js/lib/polling.js',
  'js/providers/index.js',
  'js/providers/espn.js',
  'js/views/day.js',
  'js/views/match.js',
  'icons/favicon.svg',
  'icons/icon-192.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(SHELL.map((url) => new Request(url, { cache: 'reload' }))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      for (const name of await caches.keys()) {
        if (name !== SHELL_CACHE && name !== CREST_CACHE) await caches.delete(name);
      }
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);

  if (url.origin === self.location.origin) {
    event.respondWith(shell(event, request));
  } else if (url.hostname === 'a.espncdn.com') {
    event.respondWith(crest(request));
  }
  // Anything else (the scores API) is left to the browser: network only.
});

/* -------------------------------------------------------------- app shell */

async function shell(event, request) {
  // Every navigation gets the single page, whatever the query string.
  const url = request.mode === 'navigate' ? ROOT : request.url;
  const cache = await caches.open(SHELL_CACHE);
  const cached = await cache.match(url, { ignoreSearch: true });
  const fresh = revalidate(cache, url, cached);

  if (cached && !DEV) {
    event.waitUntil(fresh.catch(() => {}));
    return cached;
  }
  try {
    return await fresh;
  } catch (err) {
    if (cached) return cached; // offline
    throw err;
  }
}

async function revalidate(cache, url, cached) {
  const response = await fetch(url, { cache: 'no-cache' });
  if (response.ok) {
    await cache.put(url, response.clone());
    if (cached && !DEV && hasChanged(cached, response)) announceUpdate();
  }
  return response;
}

function hasChanged(before, after) {
  const tag = (r) => (r.headers.get('etag') || r.headers.get('last-modified') || '').replace(/^W\//, '');
  return tag(before) !== '' && tag(after) !== '' && tag(before) !== tag(after);
}

let announced = false;
async function announceUpdate() {
  if (announced) return;
  announced = true;
  for (const client of await self.clients.matchAll({ type: 'window' })) {
    client.postMessage({ type: 'app-updated' });
  }
}

/* ----------------------------------------------------------------- crests */

async function crest(request) {
  const cache = await caches.open(CREST_CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) cache.put(request, response.clone());
  return response;
}

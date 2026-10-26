// Offline support and clean updates, for a game served under a sub-path (/naorush/).
//
// - The page is fetched network-first (revalidated, never older than the server's),
//   so a new deploy shows up on the next load; offline, the cached page is served,
//   whatever the query string (?perf, …).
// - Built files under assets/ carry a content hash in their name: cache-first.
// - Each page names the files it needs (index.html → scripts, styles, manifest, icons;
//   scripts → chunks, the worker, images). On install and whenever a new page comes in,
//   every one of them is cached *before* the new page replaces the old one: an offline
//   load never mixes versions. Files neither the new nor the previous page needs are
//   dropped, so the cache holds two versions at most.
//
// Kept free of imports and globals besides `self`, `caches` and `fetch`, so the tests
// can run it in Node (tests/robustness.test.js).

const CACHE = 'naorush-v2';
const SCOPE = new URL('./', self.location.href).href;
const ASSETS = `${SCOPE}assets/`;

/** Hashed file names inside scripts and styles (`index-DW92qXWy.js`, `./soundtest-….js`). */
const HASHED =
  /["'`(]((?:\.{0,2}\/|\/)?[\w./-]*?[\w]+-[\w-]{8}\.(?:js|css|png|jpe?g|webp|svg|woff2?|wasm))["'`)]/g;
/** Files a page points to. */
const ATTR = /\s(?:src|href)="([^"#?]+)"/g;
/** Icons a manifest points to. */
const SRC = /"src"\s*:\s*"([^"#?]+)"/g;

/** @param {string} url */
const inScope = (url) => url.startsWith(SCOPE) && url !== SCOPE && !url.endsWith('/sw.js');
/** @param {string} url */
const textual = (url) => /\.(?:js|css|webmanifest)$/.test(url);

/**
 * The files a text refers to, as absolute URLs inside the scope.
 * @param {string} text @param {string} base @param {RegExp} pattern
 */
function refs(text, base, pattern) {
  const out = new Set();
  for (const m of text.matchAll(pattern)) {
    try {
      const url = new URL(m[1], base).href;
      if (inScope(url)) out.add(url);
    } catch {
      /* Not a URL. */
    }
  }
  return out;
}

/**
 * Every file a page needs, followed through scripts, styles and the manifest.
 * `read` gives a file's text (from the network or the cache), or null.
 * @param {string} html @param {(url: string) => Promise<string | null>} read
 */
async function closure(html, read) {
  const need = refs(html, SCOPE, ATTR);
  const queue = [...need];
  while (queue.length) {
    const url = /** @type {string} */ (queue.shift());
    if (!textual(url)) continue;
    const text = await read(url);
    if (text === null) continue;
    const found = url.endsWith('.webmanifest') ? refs(text, url, SRC) : refs(text, url, HASHED);
    for (const u of found)
      if (!need.has(u)) {
        need.add(u);
        queue.push(u);
      }
  }
  return need;
}

/** @param {Response} response */
const usable = (response) => response.ok && response.type !== 'opaque';

/**
 * Caches a new page and every file it needs, then drops what neither it nor the
 * previous page uses. The page itself is stored last: until all its files are in,
 * an offline load still gets the previous, complete version.
 * @param {Response} page a fresh response for the page
 */
async function adopt(page) {
  const cache = await caches.open(CACHE);
  const html = await page.clone().text();
  const before = await cache.match(SCOPE);
  const oldHtml = before ? await before.text() : '';
  if (oldHtml === html) return;
  /** Matches the server doesn't have (a source path quoted in a script): not needed. */
  const absent = new Set();
  /**
   * A file of the new page, into the cache (hashed files are fetched once).
   * @param {string} url @returns {Promise<Response | undefined>}
   */
  const grab = async (url) => {
    const hit = url.startsWith(ASSETS) ? await cache.match(url) : undefined;
    if (hit) return hit;
    const fresh = await fetch(url, { cache: 'no-cache' }).catch(() => null);
    if (!fresh) return undefined;
    if (!usable(fresh)) {
      if (fresh.status === 404 || fresh.status === 410) absent.add(url);
      return undefined;
    }
    await cache.put(url, fresh.clone());
    return fresh;
  };
  const read = new Set();
  const need = await closure(html, async (url) => {
    read.add(url);
    const file = await grab(url);
    return file ? file.text() : null;
  });
  await Promise.all([...need].filter((url) => !read.has(url)).map(grab));
  // A file missing (network hiccup): keep the previous, complete version for offline
  // loads; the next visit tries again.
  for (const url of need) if (!absent.has(url) && !(await cache.match(url))) return;
  await cache.put(SCOPE, page);
  const keep = new Set([SCOPE, ...need]);
  if (oldHtml)
    for (const url of await closure(oldHtml, async (u) => {
      const hit = await cache.match(u);
      return hit ? hit.text() : null;
    }))
      keep.add(url);
  for (const request of await cache.keys()) if (!keep.has(request.url)) await cache.delete(request);
}

/** The page, revalidated with the server. */
const fetchPage = () => fetch(SCOPE, { cache: 'no-cache', credentials: 'same-origin' });

self.addEventListener('install', (event) => {
  event.waitUntil(
    fetchPage()
      .then((page) => (usable(page) ? adopt(page) : undefined))
      .catch(() => undefined)
      .then(() => self.skipWaiting()),
  );
});

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
  if (request.method !== 'GET' || !request.url.startsWith(SCOPE)) return;
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request.url, { cache: 'no-cache', credentials: 'same-origin' })
        .then((page) => {
          const path = new URL(request.url).pathname;
          const home = path === new URL(SCOPE).pathname || path.endsWith('/index.html');
          if (home && usable(page)) event.waitUntil(adopt(page.clone()).catch(() => undefined));
          return page;
        })
        .catch(async () => (await caches.match(SCOPE)) ?? Response.error()),
    );
    return;
  }
  // Hashed files: from the cache, else from the network (and kept).
  if (request.url.startsWith(ASSETS)) {
    event.respondWith(
      caches.match(request, { ignoreSearch: true }).then(
        (hit) =>
          hit ??
          fetch(request).then((response) => {
            if (usable(response)) {
              const copy = response.clone();
              event.waitUntil(caches.open(CACHE).then((cache) => cache.put(request, copy)));
            }
            return response;
          }),
      ),
    );
    return;
  }
  // Other files (manifest, icons): fresh when online, from the cache offline.
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (usable(response)) {
          const copy = response.clone();
          event.waitUntil(
            caches
              .open(CACHE)
              .then(async (cache) => ((await cache.match(request)) ? cache.put(request, copy) : 0)),
          );
        }
        return response;
      })
      .catch(async () => (await caches.match(request, { ignoreSearch: true })) ?? Response.error()),
  );
});

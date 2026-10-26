import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Robustness: saves from earlier versions (and damaged or blocked storage) never crash
 * the game nor lose progress; the service worker keeps the game playable offline and
 * picks up a new deploy without mixing versions; the PWA manifest is well formed.
 */

/** @type {Record<string, string>} */
let saved = {};
/** In-memory localStorage seeded with `data` (raw strings, as the browser keeps them). @param {Record<string, string>} data */
function seed(data) {
  saved = { ...data };
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    writable: true,
    value: {
      getItem: (/** @type {string} */ k) => (k in saved ? saved[k] : null),
      setItem: (/** @type {string} */ k, /** @type {string} */ v) => (saved[k] = String(v)),
      removeItem: (/** @type {string} */ k) => delete saved[k],
    },
  });
}

/** Browser bits the input and options modules touch when loaded or built. */
function stubPage() {
  Object.assign(globalThis, {
    addEventListener: () => {},
    matchMedia: () => ({ matches: false }),
    document: {
      body: { dataset: {}, classList: { remove() {}, add() {}, toggle() {} } },
      querySelectorAll: () => [],
      getElementById: () => null,
    },
  });
}

/** Saves as the earlier versions wrote them (formats read from the git history). */
const OLD = {
  // Round 1: progress written with String(), mute flag, nothing else.
  round1: { 'naorush.stage': '2', 'naorush.muted': '1' },
  // Five stages, options and key bindings.
  options: {
    'naorush.stage': '3',
    'naorush.prefs': JSON.stringify({
      shake: false,
      flash: true,
      contrast: true,
      vibrate: false,
      pad: 'l',
    }),
    'naorush.keys': JSON.stringify({ jump: 'KeyW', fire: 'KeyK' }),
    'naorush.vol.music': '0.4',
    'naorush.vol.sfx': '0.9',
    'naorush.tips': JSON.stringify(['fragile', 'spring']),
  },
  // First trophies (no `days` nor `run` yet), best times per stage and hero.
  trophies: {
    'naorush.trophies': JSON.stringify({
      got: { nao: true, julien: true },
      counts: { stomp: 7 },
      secrets: ['parking:12', 'lcp7:40'],
    }),
    'naorush.best': JSON.stringify({ 'parking:kevin': 41.2, 'lcp7:charline': 63.5 }),
  },
};

describe('saves from earlier versions (garde-fou 6)', () => {
  beforeEach(() => {
    vi.resetModules();
    stubPage();
  });

  it('reads round-1 progress and mute flag', async () => {
    seed(OLD.round1);
    const { load, loadCount } = await import('../src/app/storage.js');
    const prefs = await import('../src/app/audio/prefs.js');
    expect(load('naorush.stage', 0)).toBe(2);
    expect(loadCount('naorush.stage')).toBe(2);
    expect(prefs.load(prefs.MUTE_KEY)).toBe('1');
  });

  it('keeps the options, bindings, volumes and tips of the five-stage version', async () => {
    seed(OLD.options);
    const { prefs } = await import('../src/app/options.js');
    expect(prefs).toMatchObject({ shake: false, flash: true, contrast: true, vibrate: false });
    expect(prefs.pad).toBe('l');
    // Settings added later get their defaults.
    expect(prefs.speed).toBe(1);
    expect(prefs.assist).toBe(false);
    expect(prefs.captions).toBe(false);
    const { Input } = await import('../src/app/input.js');
    const input = new Input();
    expect(input.binding('jump')).toBe('KeyW');
    expect(input.binding('fire')).toBe('KeyK');
    expect(input.actionFor('KeyW')).toBe('jump');
    const { loadVolume } = await import('../src/app/audio/prefs.js');
    expect(loadVolume('music')).toBeCloseTo(0.4);
    expect(loadVolume('sfx')).toBeCloseTo(0.9);
    const { load } = await import('../src/app/storage.js');
    expect(load('naorush.tips', [])).toEqual(['fragile', 'spring']);
  });

  it('keeps the first trophies and records', async () => {
    seed(OLD.trophies);
    const { Trophies } = await import('../src/app/trophies.js');
    const t = new Trophies(() => {});
    expect(t.data.got).toMatchObject({ nao: true, julien: true });
    expect(t.data.counts.stomp).toBe(7);
    expect(t.data.secrets).toEqual(['parking:12', 'lcp7:40']);
    expect(t.data.days).toEqual([]);
    expect(
      t
        .list()
        .filter((x) => x.got)
        .map((x) => x.id),
    ).toEqual(expect.arrayContaining(['nao', 'julien']));
    const { load } = await import('../src/app/storage.js');
    const { BEST_KEY } = await import('../src/app/results.js');
    expect(load(BEST_KEY, {})).toEqual({ 'parking:kevin': 41.2, 'lcp7:charline': 63.5 });
  });
});

describe('damaged saves', () => {
  beforeEach(() => {
    vi.resetModules();
    stubPage();
  });

  const DAMAGED = ['{', 'null', '[]', '"text"', '42', 'true', 'undefined', '{"a":', ''];

  it('falls back to the defaults on any unreadable entry', async () => {
    const { load } = await import('../src/app/storage.js');
    for (const raw of DAMAGED) {
      seed({ k: raw });
      expect(load('k', {})).toEqual({});
      expect(load('k', [])).toEqual([]);
    }
    seed({ k: '[1,2]' });
    expect(load('k', {})).toEqual({});
    expect(load('k', [])).toEqual([1, 2]);
  });

  it('reads progress as a whole stage number, never negative', async () => {
    const { loadCount } = await import('../src/app/storage.js');
    for (const [raw, n] of /** @type {Array<[string, number]>} */ ([
      ['3', 3],
      ['-1', 0],
      ['1.7', 1],
      ['"2"', 0],
      ['{', 0],
      ['null', 0],
      ['1e400', 0],
      ['99', 99],
    ])) {
      seed({ 'naorush.stage': raw });
      expect(loadCount('naorush.stage')).toBe(n);
    }
    seed({});
    expect(loadCount('naorush.stage')).toBe(0);
  });

  it('keeps the well-formed parts of every damaged store', async () => {
    seed({
      'naorush.prefs': JSON.stringify({ speed: 'fast', shake: 'yes', pad: 7, contrast: true }),
      'naorush.keys': JSON.stringify({ jump: 42, fire: 'KeyK', left: null, bogus: 'KeyZ' }),
      'naorush.trophies': JSON.stringify({ got: 'all', counts: [], secrets: 'x', run: 'bad' }),
      'naorush.medals': JSON.stringify({
        'parking:kevin': { tier: 'gold', star: true },
        'lcp7:kevin': { tier: 'platinum', star: 1 },
        'ts:kevin': null,
      }),
      'naorush.secrets': JSON.stringify({ 'parking:kevin': 'x', 'lcp7:kevin': [30, 60] }),
      'naorush.vol.music': 'loud',
      'naorush.vol.sfx': '7',
    });
    const { prefs } = await import('../src/app/options.js');
    expect(prefs.speed).toBe(1);
    expect(prefs.shake).toBe(true);
    expect(prefs.pad).toBe('m');
    expect(prefs.contrast).toBe(true);
    const { Input, controlName } = await import('../src/app/input.js');
    const input = new Input();
    expect(input.binding('jump')).toBe('Space');
    expect(input.binding('fire')).toBe('KeyK');
    expect(input.binding('left')).toBe('ArrowLeft');
    expect(() => controlName('jump', 'keys', input.binding('jump'))).not.toThrow();
    const { Trophies } = await import('../src/app/trophies.js');
    const t = new Trophies(() => {});
    expect(t.data).toMatchObject({ secrets: [], days: [], run: '' });
    expect(() => t.list()).not.toThrow();
    const { Medals } = await import('../src/app/medals.js');
    const m = new Medals();
    expect(m.get('parking', 'kevin')).toEqual({ tier: 'gold', star: true });
    expect(m.get('lcp7', 'kevin')).toBeUndefined();
    expect(m.get('ts', 'kevin')).toBeUndefined();
    const { secretsFound, noteSecrets } = await import('../src/app/results.js');
    expect(secretsFound('parking', 'kevin')).toBe(0);
    expect(secretsFound('lcp7', 'kevin')).toBe(2);
    noteSecrets('parking', 'kevin', [12]);
    expect(JSON.parse(saved['naorush.secrets'])).toMatchObject({
      'parking:kevin': [12],
      'lcp7:kevin': [30, 60],
    });
    const { loadVolume } = await import('../src/app/audio/prefs.js');
    expect(loadVolume('music')).toBe(0.7);
    expect(loadVolume('sfx')).toBe(1);
  });
});

describe('storage unavailable (private browsing, full quota)', () => {
  beforeEach(() => {
    vi.resetModules();
    stubPage();
  });
  afterEach(() => {
    seed({});
  });

  it('plays on with defaults when storage throws on access', async () => {
    const blocked = () => {
      throw new DOMException('The operation is insecure.', 'SecurityError');
    };
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      get: blocked,
    });
    const { load, store, loadCount } = await import('../src/app/storage.js');
    expect(load('naorush.best', {})).toEqual({});
    expect(loadCount('naorush.stage')).toBe(0);
    expect(() => store('naorush.best', { a: 1 })).not.toThrow();
    const { prefs } = await import('../src/app/options.js');
    expect(prefs.speed).toBe(1);
    const { Input } = await import('../src/app/input.js');
    const input = new Input();
    expect(() => input.bind('jump', 'KeyL')).not.toThrow();
    expect(input.binding('jump')).toBe('KeyL');
    const { Trophies } = await import('../src/app/trophies.js');
    const t = new Trophies(() => {});
    expect(() => t.unlock('nao')).not.toThrow();
    const audio = await import('../src/app/audio/prefs.js');
    expect(audio.loadVolume('music')).toBe(0.7);
    expect(() => audio.save(audio.MUTE_KEY, '1')).not.toThrow();
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      writable: true,
      value: undefined,
    });
    expect(load('naorush.best', {})).toEqual({});
    expect(() => store('naorush.best', {})).not.toThrow();
  });

  it('keeps what was saved when the quota is full', async () => {
    seed({ 'naorush.medals': JSON.stringify({ 'parking:kevin': { tier: 'gold', star: false } }) });
    localStorage.setItem = () => {
      throw new DOMException('Quota exceeded', 'QuotaExceededError');
    };
    const { Medals } = await import('../src/app/medals.js');
    const m = new Medals();
    expect(() => m.record('lcp7', 'kevin', { tier: 'silver', star: true })).not.toThrow();
    expect(m.get('lcp7', 'kevin')).toEqual({ tier: 'silver', star: true });
    expect(JSON.parse(saved['naorush.medals'])).toEqual({
      'parking:kevin': { tier: 'gold', star: false },
    });
  });
});

// ---- Service worker ------------------------------------------------------------------

const ORIGIN = 'https://c0sm0cats.github.io';
const BASE = `${ORIGIN}/naorush/`;
const SW = readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8');

/** A deploy of the built site: path under /naorush/ → body. @param {string} v */
function site(v) {
  return {
    '': `<!doctype html><html><head>
<link rel="icon" href="./icons/icon-32.png" />
<link rel="manifest" href="./manifest.webmanifest" />
<meta property="og:image" content="https://c0sm0cats.github.io/naorush/og.jpg" />
<script type="module" crossorigin src="/naorush/assets/index-${v}AAAAAAA.js"></script>
<link rel="stylesheet" crossorigin href="/naorush/assets/index-${v}BBBBBBB.css">
</head><body data-version="${v}"><a href="https://github.com/C0sm0cats/naorush">src</a></body></html>`,
    [`assets/index-${v}AAAAAAA.js`]:
      `new Worker(new URL(\`/naorush/assets/build-worker-${v}CCCCCCC.js\`,""+import.meta.url));` +
      `import("./soundtest-${v}DDDDDDD.js");const img=\`/naorush/assets/Whiteboard01-${v}EEEEEEE.webp\`;` +
      `fetch("https://example.com/x-12345678.js");const src="signage/bureau-technologies-services.webp";`,
    [`assets/index-${v}BBBBBBB.css`]: `body{color:red}`,
    [`assets/build-worker-${v}CCCCCCC.js`]: `self.onmessage=()=>{}`,
    [`assets/soundtest-${v}DDDDDDD.js`]: `import"./index-${v}AAAAAAA.js";`,
    [`assets/Whiteboard01-${v}EEEEEEE.webp`]: `webp-${v}`,
    'manifest.webmanifest': JSON.stringify({
      icons: [{ src: 'icons/icon-192.png' }, { src: 'icons/icon-512.png' }],
    }),
    'icons/icon-32.png': 'png32',
    'icons/icon-192.png': 'png192',
    'icons/icon-512.png': 'png512',
    'og.jpg': 'jpg',
    'sw.js': SW,
  };
}

/** Cache Storage in memory. */
class FakeCache {
  constructor() {
    /** @type {Map<string, Response>} */
    this.map = new Map();
  }
  /** @param {RequestInfo | URL} r */
  static url(r) {
    return typeof r === 'string' ? r : r instanceof URL ? r.href : r.url;
  }
  /** @param {RequestInfo} r @param {{ignoreSearch?: boolean}} [o] */
  async match(r, o) {
    let url = FakeCache.url(r);
    if (o?.ignoreSearch) url = url.split('?')[0];
    for (const [k, v] of this.map)
      if ((o?.ignoreSearch ? k.split('?')[0] : k) === url) return v.clone();
    return undefined;
  }
  /** @param {RequestInfo} r @param {Response} res */
  async put(r, res) {
    this.map.set(FakeCache.url(r), new Response(await res.arrayBuffer(), res));
  }
  async keys() {
    return [...this.map.keys()].map((url) => ({ url }));
  }
  /** @param {RequestInfo} r */
  async delete(r) {
    return this.map.delete(FakeCache.url(r));
  }
}

/** Runs public/sw.js against a fake network and cache storage. */
function worker() {
  /** @type {Record<string, string>} */
  let files = site('1');
  let online = true;
  /** URLs the network was asked for. @type {string[]} */
  const asked = [];
  /** Paths that fail on the network even when online. @type {Set<string>} */
  const failing = new Set();
  /** @type {Map<string, FakeCache>} */
  const stores = new Map();
  const caches = {
    /** @param {string} name */
    open: async (name) => {
      if (!stores.has(name)) stores.set(name, new FakeCache());
      return /** @type {FakeCache} */ (stores.get(name));
    },
    keys: async () => [...stores.keys()],
    /** @param {string} name */
    delete: async (name) => stores.delete(name),
    /** @param {RequestInfo} r @param {{ignoreSearch?: boolean}} [o] */
    match: async (r, o) => {
      for (const c of stores.values()) {
        const hit = await c.match(r, o);
        if (hit) return hit;
      }
      return undefined;
    },
  };
  /** @param {RequestInfo | URL} r */
  const fetch = async (r) => {
    const url = FakeCache.url(r);
    asked.push(url);
    if (!online) throw new TypeError('Failed to fetch');
    const path = url.startsWith(BASE) ? url.slice(BASE.length).split('?')[0] : null;
    if (path !== null && failing.has(path)) throw new TypeError('Failed to fetch');
    if (path === null || !(path in files)) return new Response('Not found', { status: 404 });
    return new Response(files[path], { status: 200 });
  };
  /** @type {Record<string, Function>} */
  const handlers = {};
  const self = {
    location: new URL(`${BASE}sw.js`),
    /** @param {string} type @param {Function} f */
    addEventListener: (type, f) => (handlers[type] = f),
    skipWaiting: async () => {},
    clients: { claim: async () => {} },
  };
  new Function('self', 'caches', 'fetch', SW)(self, caches, fetch);

  /** Fires an event and waits for everything it started. @param {string} type @param {object} [extra] */
  async function fire(type, extra = {}) {
    /** @type {Promise<unknown>[]} */
    const pending = [];
    /** @type {Promise<Response> | undefined} */
    let answer;
    const event = {
      ...extra,
      /** @param {Promise<unknown>} p */
      waitUntil: (p) => pending.push(p),
      /** @param {Promise<Response>} p */
      respondWith: (p) => {
        answer = p;
        pending.push(p);
      },
    };
    handlers[type](event);
    for (let i = 0; i < pending.length; i++) await pending[i];
    return answer;
  }
  /** @param {string} path @param {{mode?: string, method?: string, origin?: string}} [o] */
  const request = (path, o = {}) =>
    fire('fetch', {
      request: {
        url: `${o.origin ?? BASE}${path}`,
        mode: o.mode ?? 'cors',
        method: o.method ?? 'GET',
      },
    });

  return {
    fire,
    request,
    /** Loads the page as a browser would. @param {string} [query] */
    async open(query = '') {
      const page = await request(query, { mode: 'navigate' });
      return page ? page.text() : undefined;
    },
    /** @param {string} v */
    deploy(v) {
      files = site(v);
    },
    /** @param {boolean} on */
    network(on) {
      online = on;
    },
    failing,
    asked,
    stores,
    async cached() {
      const c = stores.get('naorush-v2');
      return c ? [...c.map.keys()].map((u) => u.slice(BASE.length)).sort() : [];
    },
  };
}

/** Every file a version needs, by path. @param {string} v */
const needs = (v) =>
  Object.keys(site(v))
    .filter((p) => p !== 'og.jpg' && p !== 'sw.js')
    .sort();

describe('service worker', () => {
  it('caches the whole game on install, under the /naorush/ base', async () => {
    const sw = worker();
    await sw.fire('install');
    await sw.fire('activate');
    expect(await sw.cached()).toEqual(needs('1'));
    // Nothing outside the site, nor the social image the game never shows.
    expect(sw.asked.every((u) => u.startsWith(BASE))).toBe(true);
    expect(sw.asked).not.toContain(`${BASE}og.jpg`);
  });

  it('plays offline after the first visit, whatever the query string', async () => {
    const sw = worker();
    await sw.fire('install');
    sw.network(false);
    for (const q of ['', '?perf', 'index.html', '?daily=2026-10-26'])
      expect(await sw.open(q)).toContain('data-version="1"');
    for (const path of needs('1').filter((p) => p !== '')) {
      const res = /** @type {Response} */ (await sw.request(path));
      expect(res.ok, path).toBe(true);
    }
  });

  it('drops the caches of older service workers', async () => {
    const sw = worker();
    const old = new FakeCache();
    sw.stores.set('naorush-v1', old);
    await sw.fire('install');
    await sw.fire('activate');
    expect([...sw.stores.keys()]).toEqual(['naorush-v2']);
  });

  it('shows a new deploy on the next load, and keeps two versions at most', async () => {
    const sw = worker();
    await sw.fire('install');
    sw.deploy('2');
    expect(await sw.open()).toContain('data-version="2"');
    const after2 = await sw.cached();
    for (const p of needs('2')) expect(after2).toContain(p);
    // The previous version stays for a tab still running it.
    expect(after2).toContain('assets/soundtest-1DDDDDDD.js');
    sw.deploy('3');
    expect(await sw.open()).toContain('data-version="3"');
    const after3 = await sw.cached();
    expect(after3.some((p) => /-1[A-Z]{7}\./.test(p))).toBe(false);
    expect(after3.filter((p) => p.startsWith('assets/')).length).toBe(10);
    // Offline now: the newest page, and every one of its files.
    sw.network(false);
    expect(await sw.open()).toContain('data-version="3"');
    for (const p of needs('3').filter((p) => p !== ''))
      expect(/** @type {Response} */ (await sw.request(p)).ok, p).toBe(true);
  });

  it('never serves a new page offline before all its files are cached', async () => {
    const sw = worker();
    await sw.fire('install');
    sw.deploy('2');
    sw.failing.add('assets/build-worker-2CCCCCCC.js');
    // Online, the new page loads (the browser fetches the worker itself)…
    expect(await sw.open()).toContain('data-version="2"');
    // …but offline, the cached game is still the complete first version.
    sw.network(false);
    expect(await sw.open()).toContain('data-version="1"');
    for (const p of needs('1').filter((p) => p !== ''))
      expect(/** @type {Response} */ (await sw.request(p)).ok, p).toBe(true);
    // Back online, the next load completes the update.
    sw.network(true);
    sw.failing.clear();
    await sw.open();
    sw.network(false);
    expect(await sw.open()).toContain('data-version="2"');
  });

  it('serves hashed files from the cache and the others fresh', async () => {
    const sw = worker();
    await sw.fire('install');
    sw.asked.length = 0;
    await sw.request('assets/index-1AAAAAAA.js');
    expect(sw.asked).toEqual([]);
    await sw.request('manifest.webmanifest');
    expect(sw.asked).toEqual([`${BASE}manifest.webmanifest`]);
  });

  it('leaves other sites, other paths and non-GET requests to the browser', async () => {
    const sw = worker();
    expect(await sw.request('', { origin: 'https://example.com/' })).toBeUndefined();
    expect(await sw.request('x', { origin: `${ORIGIN}/other/` })).toBeUndefined();
    expect(await sw.request('assets/a.js', { method: 'POST' })).toBeUndefined();
  });
});

// ---- PWA manifest ---------------------------------------------------------------------

describe('PWA manifest', () => {
  const manifest = JSON.parse(
    readFileSync(new URL('../public/manifest.webmanifest', import.meta.url), 'utf8'),
  );
  const at = `${BASE}manifest.webmanifest`;

  it('starts and stays inside /naorush/', () => {
    expect(new URL(manifest.start_url, at).href).toBe(BASE);
    expect(new URL(manifest.scope, at).href).toBe(BASE);
    expect(new URL(manifest.id, at).href).toBe(BASE);
    expect(['fullscreen', 'standalone']).toContain(manifest.display);
    // Portrait is supported (dedicated camera): the installed game must not lock it.
    expect(manifest.orientation ?? 'any').toBe('any');
    expect(manifest.name).toBe('NAO Rush');
    expect(manifest.short_name.length).toBeLessThanOrEqual(12);
  });

  it('lists icons that exist at their stated size, with a separate maskable one', () => {
    /** @type {Array<{src: string, sizes: string, type: string, purpose?: string}>} */
    const icons = manifest.icons;
    for (const icon of icons) {
      const png = readFileSync(new URL(`../public/${icon.src}`, import.meta.url));
      expect(png.subarray(1, 4).toString()).toBe('PNG');
      const size = `${png.readUInt32BE(16)}x${png.readUInt32BE(20)}`;
      expect(size, icon.src).toBe(icon.sizes);
      expect(icon.type).toBe('image/png');
      expect(icon.purpose ?? 'any').not.toMatch(/ /);
    }
    const sizes = (/** @type {string} */ purpose) =>
      icons.filter((i) => (i.purpose ?? 'any') === purpose).map((i) => i.sizes);
    expect(sizes('any')).toEqual(expect.arrayContaining(['192x192', '512x512']));
    expect(sizes('maskable').length).toBeGreaterThan(0);
  });

  it('is linked from the page with the same theme colour, and the social image is large', () => {
    const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
    expect(html).toContain('<link rel="manifest" href="./manifest.webmanifest" />');
    expect(html).toContain(`<meta name="theme-color" content="${manifest.theme_color}" />`);
    for (const m of html.matchAll(/href="\.\/(icons\/[^"]+)"/g))
      expect(() => readFileSync(new URL(`../public/${m[1]}`, import.meta.url))).not.toThrow();
    const og = readFileSync(new URL('../public/og.jpg', import.meta.url));
    expect([og[0], og[1]]).toEqual([0xff, 0xd8]);
    expect(og.length).toBeLessThan(1_000_000);
  });
});

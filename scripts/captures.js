// Captures every room of every stage, both bosses and every screen on three devices, for
// the visual review of a round (a production-like build with the dev hook, see README):
//   node scripts/captures.js http://localhost:5231/ /tmp/captures
// Options: --devices=pc,portrait,paysage  --stages=0,2,4  --skip=screens,rooms,bosses
//          --full (every room in landscape too; by default one room per stage there).
// Writes JPEGs per device, <dir>/INDEX.md (one line per image) and contact sheets in
// <dir>/planches/. A capture that fails is listed as such and the run goes on; running
// again into the same folder replaces the images it retakes and keeps the others.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium, devices } from 'playwright';
import { LEVELS, ROOM_W } from '../src/data/levels/index.js';
import { PATTERNS } from '../src/game/boss.js';

/**
 * @typedef {Object} Entry
 * @property {string} file Path relative to the output folder.
 * @property {string} device
 * @property {string} group Contact sheet the image goes on.
 * @property {string} stage Stage name, or '—' for a menu screen.
 * @property {string} place Room, screen or boss moment.
 * @property {string} sees What the image shows (or why it failed).
 * @property {boolean} ok
 * @property {number} order
 */

const [url, out] = process.argv.slice(2).filter((a) => !a.startsWith('--'));
if (!url || !out) {
  console.error(
    'usage: node scripts/captures.js <url> <dossier> [--devices=] [--stages=] [--skip=]',
  );
  process.exit(2);
}
/** @param {string} name */
const flag = (name) =>
  process.argv
    .find((a) => a.startsWith(`--${name}=`))
    ?.slice(name.length + 3)
    .split(',')
    .filter(Boolean);
const skip = new Set(flag('skip') ?? []);
const full = process.argv.includes('--full');
const onlyStages = flag('stages')?.map(Number);

const PIXEL7 = devices['Pixel 7'].userAgent;
/**
 * The three devices: the hero alternates so both get looked at.
 * @type {Record<string, {label: string, hero: 'kevin'|'charline', allRooms: boolean,
 *   context: import('playwright').BrowserContextOptions}>}
 */
const DEVICES = {
  pc: {
    label: 'PC 1280×720',
    hero: 'kevin',
    allRooms: true,
    context: { viewport: { width: 1280, height: 720 } },
  },
  portrait: {
    label: 'Pixel 7 portrait 412×915',
    hero: 'charline',
    allRooms: true,
    context: { viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true },
  },
  paysage: {
    label: 'Pixel 7 paysage 863×360',
    hero: 'kevin',
    allRooms: full,
    context: { viewport: { width: 863, height: 360 }, isMobile: true, hasTouch: true },
  },
};
const deviceIds = flag('devices') ?? Object.keys(DEVICES);
const BOSSES = /** @type {Record<string, string>} */ ({
  techServicesDirector: 'Julien',
  regionalDirector: 'Rodolphe',
});
/** Boss states that are not an attack. */
const CALM = ['idle', 'intro', 'walk', 'consult', 'hit', 'phase', 'convinced', 'sign'];

mkdirSync(join(out, 'planches'), { recursive: true });
const indexFile = join(out, 'index.json');
/** @type {Map<string, Entry>} */
const entries = new Map(
  existsSync(indexFile)
    ? /** @type {Entry[]} */ (JSON.parse(readFileSync(indexFile, 'utf8'))).map((e) => [e.file, e])
    : [],
);
let order = Math.max(0, ...[...entries.values()].map((e) => e.order)) + 1;
/** @param {Omit<Entry, 'order'>} e */
const record = (e) => {
  entries.set(e.file, { ...e, order: entries.get(e.file)?.order ?? order++ });
  writeFileSync(indexFile, JSON.stringify([...entries.values()], null, 1));
};

/** @param {string} s */
const slug = (s) =>
  s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
/** @param {number} ms */
const wait = (ms) => new Promise((done) => setTimeout(done, ms));
const started = Date.now();
/** @param {string} text */
const log = (text) => console.info(`[${Math.round((Date.now() - started) / 1000)} s] ${text}`);

const browser = await chromium.launch({
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});

for (const deviceId of deviceIds) {
  const device = DEVICES[deviceId];
  if (!device) continue;
  mkdirSync(join(out, deviceId), { recursive: true });
  /** @type {import('playwright').BrowserContext | undefined} */
  let context;
  let page = /** @type {import('playwright').Page} */ (/** @type {unknown} */ (undefined));

  /** Opens the game on the title screen, in a fresh context. */
  const open = async () => {
    await context?.close().catch(() => {});
    context = await browser.newContext({
      ...device.context,
      deviceScaleFactor: 1,
      ...(device.context.isMobile ? { userAgent: PIXEL7 } : {}),
    });
    page = await context.newPage();
    page.setDefaultTimeout(120000);
    page.on('pageerror', (e) => log(`page error: ${e.message}`));
    await page.addInitScript(() => {
      // Clean captures: tips already seen, no speech bubbles or toasts over the scenery.
      const seen = ['chairRoll', 'drawerOut', 'sprayOn', 'paperShot', 'trapdoor', 'invite'];
      seen.push('vacuumBounce', 'internStun', 'archive', 'rackDrop', 'cableWarn', 'zoneWarn');
      seen.push('dash', 'secret');
      localStorage.setItem('naorush.tips', JSON.stringify(seen));
      addEventListener('DOMContentLoaded', () => {
        const style = document.createElement('style');
        style.id = 'capture-clean';
        style.textContent = '.bark, .toast, .hint { visibility: hidden !important; }';
        document.head.append(style);
      });
    });
    await page.goto(url);
    await until('title', 180000);
    await wait(5000);
  };
  /** @param {string} screen @param {number} [timeout] */
  const until = (screen, timeout = 120000) =>
    page.waitForFunction((s) => document.body.dataset.screen === s, screen, {
      timeout,
      polling: 250,
    });
  /** @param {string} id */
  const click = (id) => page.evaluate((i) => document.getElementById(i)?.click(), id);
  /** @param {string} expr Evaluated in the page with `n` bound to the dev hook. */
  const nao = (expr) => page.evaluate(`(() => { const n = globalThis.__nao; ${expr} })()`);

  /** What a menu screen shows: title, buttons on and off screen. */
  const describeScreen = () =>
    page.evaluate(() => {
      const screen = document.body.dataset.screen ?? '';
      const host =
        document.getElementById(screen === 'reading' ? 'reader' : screen) ?? document.body;
      const head = host.querySelector('h1, h2')?.textContent?.replace(/\s+/g, ' ').trim();
      /** @type {string[]} */
      const shown = [];
      /** @type {string[]} */
      const off = [];
      for (const b of host.querySelectorAll('button')) {
        const el = /** @type {HTMLElement} */ (b);
        if (!el.offsetParent) continue;
        const r = el.getBoundingClientRect();
        const label = el.querySelector('b')?.textContent || el.textContent;
        const text =
          (label || el.getAttribute('aria-label') || '').trim().slice(0, 28) +
          (el.getAttribute('aria-checked') === 'true' ? ' ✓' : '');
        const inside = r.bottom <= innerHeight + 1 && r.top >= -1 && r.right <= innerWidth + 1;
        (inside ? shown : off).push(text.replace(/\s+/g, ' '));
      }
      const parts = [`écran ${screen}`];
      if (head) parts.push(`titre « ${head} »`);
      /** @param {string} id */
      const text = (id) => document.getElementById(id)?.textContent?.replace(/\s+/g, ' ').trim();
      if (screen === 'talk')
        parts.push(`${text('talkName')} : « ${text('talkText')?.slice(0, 90)} »`);
      if (screen === 'posters') parts.push(`affiche « ${text('posterCaption')?.slice(0, 90)} »`);
      if (screen === 'loading') parts.push(`astuce « ${text('loadingTip')} »`);
      if (shown.length) parts.push(`boutons : ${shown.slice(0, 12).join(', ')}`);
      if (off.length) parts.push(`HORS ÉCRAN : ${off.join(', ')}`);
      return parts.join(' · ');
    });

  /** What a game frame shows: hero, things and decor in view, HUD. @param {number} stage */
  const describeScene = (stage) =>
    page.evaluate(
      ([decor, rooms]) => {
        const n = /** @type {any} */ (globalThis).__nao;
        const s = n.sim;
        const m = n.camera.out.viewProj;
        /** @param {number} x @param {number} y */
        const seen = (x, y) => {
          const w = m[3] * x + m[7] * y + m[15];
          const px = (m[0] * x + m[4] * y + m[12]) / w;
          const py = (m[1] * x + m[5] * y + m[13]) / w;
          return w > 0 && Math.abs(px) <= 1 && Math.abs(py) <= 1;
        };
        const h = s.hero;
        /** @type {Record<string, number>} */
        const kinds = {};
        for (const t of s.things)
          if (t.alive !== false && t.kind !== 'boss' && seen(t.x, t.y + 0.4))
            kinds[t.kind] = (kinds[t.kind] ?? 0) + 1;
        const props = /** @type {Array<{type: string, id?: string, x: number, y: number}>} */ (
          decor
        )
          .filter((d) => seen(d.x, d.y + 0.5))
          .map((d) => (d.id ? `${d.type} ${d.id}` : d.type));
        const boss = s.things.find((/** @type {any} */ t) => t.kind === 'boss');
        const parts = [
          `écran ${n.screen}`,
          `héros ${seen(h.x + 0.3, h.y + 0.9) ? 'visible' : 'HORS CHAMP'} (${h.state}, x ${h.x.toFixed(1)} y ${h.y.toFixed(1)}${h.invuln > 0 ? ', clignote' : ''})`,
          `salle « ${/** @type {string[]} */ (rooms)[Math.floor(h.x / 20)] ?? '?'} »`,
        ];
        if (boss && s.bossActive)
          parts.push(
            `boss ${boss.state} phase ${boss.phase ?? 1} pv ${boss.hp ?? '?'}${seen(boss.x, boss.y + 1) ? '' : ' HORS CHAMP'}`,
          );
        const things = Object.entries(kinds).map(([k, c]) => (c > 1 ? `${k}×${c}` : k));
        if (things.length) parts.push(`objets : ${things.join(', ')}`);
        if (props.length) parts.push(`décor : ${[...new Set(props)].join(', ')}`);
        parts.push(`HUD ${h.hearts}♥ ${s.tickets} tickets ${s.ammo} CR`);
        return parts.join(' · ');
      },
      [LEVELS[stage].decor, LEVELS[stage].rooms],
    );

  /**
   * Takes one capture and records it; never throws.
   * @param {Omit<Entry, 'order'|'ok'|'sees'|'device'>} what
   * @param {() => Promise<unknown>} prepare Gets the page ready; may throw.
   * @param {() => Promise<string>} describe
   */
  const shot = async (what, prepare, describe) => {
    try {
      await prepare();
      const sees = await describe().catch((e) => `(description impossible : ${e.message})`);
      await page.screenshot({ path: join(out, what.file), type: 'jpeg', quality: 70 });
      record({ ...what, device: deviceId, sees, ok: true });
      log(`${what.file}`);
    } catch (e) {
      rmSync(join(out, what.file), { force: true });
      const message = /** @type {Error} */ (e).message.split('\n')[0];
      record({ ...what, device: deviceId, sees: `ÉCHEC : ${message}`, ok: false });
      log(`FAILED ${what.file}: ${message}`);
    }
  };
  /**
   * @param {string} name @param {string} place @param {() => Promise<unknown>} prepare
   * @param {() => Promise<string>} [describe]
   */
  const screenShot = (name, place, prepare, describe = describeScreen) =>
    shot(
      { file: `${deviceId}/ecran-${name}.jpg`, group: `ecrans-${deviceId}`, stage: '—', place },
      async () => {
        await prepare();
        await wait(1500);
      },
      describe,
    );

  /** Clicks through dialogues until play resumes. @param {number} [timeout] */
  const skipTalk = async (timeout = 90000) => {
    const end = Date.now() + timeout;
    while (Date.now() < end) {
      const screen = await nao(
        `if (n.screen === 'talk') document.getElementById('talk').click(); return n.screen;`,
      );
      if (screen === 'play') return;
      await wait(200);
    }
    throw new Error('dialogue sans fin');
  };
  /**
   * Waits for play with the hero standing still, not blinking, and the camera settled.
   * @param {number} [timeout]
   * @returns {Promise<boolean>} false when it never settled (the capture goes on).
   */
  const settle = async (timeout = 45000) => {
    const end = Date.now() + timeout;
    /** @type {any} */
    let last = null;
    let calm = 0;
    while (Date.now() < end) {
      const now = /** @type {any} */ (
        await nao(`
          if (n.screen === 'talk') document.getElementById('talk').click();
          n.sim.assist = true;
          const f = n.camera.out.focus;
          return { screen: n.screen, fx: f[0], fy: f[1], state: n.sim.hero.state,
            invuln: n.sim.hero.invuln };`)
      );
      const still =
        last &&
        now.screen === 'play' &&
        now.state === 'ground' &&
        now.invuln <= 0 &&
        Math.abs(now.fx - last.fx) < 0.03 &&
        Math.abs(now.fy - last.fy) < 0.03;
      calm = still ? calm + 1 : 0;
      if (calm >= 3) return true;
      last = now;
      await wait(400);
    }
    return false;
  };
  /** @param {number} x @param {number} y @param {number} [facing] */
  const teleport = (x, y, facing = 1) =>
    nao(`n.sim.assist = true;
      Object.assign(n.sim.hero, { x: ${x}, y: ${y}, vx: 0, vy: 0, facing: ${facing},
        state: 'air', invuln: 0 });`);
  /**
   * Floor tiles of a room, nearest to its middle first, at least three columns apart
   * (the lowest free tile of each column).
   * @param {number} room
   * @returns {Promise<Array<{x: number, y: number}>>}
   */
  const spotsIn = (room) =>
    page.evaluate(
      ([room, roomW]) => {
        const s = /** @type {any} */ (globalThis).__nao.sim;
        /** @param {number} c @param {number} r */
        const at = (c, r) => (r >= s.h ? 0 : r < 0 ? 1 : s.tiles[c + r * s.w]);
        const mid = room * roomW + roomW / 2;
        /** @type {Array<{x: number, y: number}>} */
        const spots = [];
        for (let d = 0; d < roomW / 2; d++)
          for (const c of [mid + d, mid - d - 1]) {
            if (c < 1 || c >= s.w - 1 || spots.some((p) => Math.abs(p.x - c) < 3)) continue;
            for (let r = 1; r < s.h; r++)
              if ((at(c, r - 1) === 1 || at(c, r - 1) === 6) && !at(c, r) && !at(c, r + 1)) {
                spots.push({ x: c + 0.2, y: r + 0.05 });
                break;
              }
          }
        return spots.slice(0, 4);
      },
      [room, ROOM_W],
    );

  // ---- Menus -------------------------------------------------------------------------
  log(`${deviceId}: opening ${url}`);
  try {
    await open();
  } catch (e) {
    log(`${deviceId}: the title never came (${/** @type {Error} */ (e).message})`);
    record({
      file: `${deviceId}/ecran-titre.jpg`,
      device: deviceId,
      group: `ecrans-${deviceId}`,
      stage: '—',
      place: 'titre',
      sees: 'ÉCHEC : le titre ne s’affiche pas',
      ok: false,
    });
    continue;
  }
  if (!skip.has('screens')) {
    await screenShot('titre', 'titre', async () => {});
    await screenShot('heros', 'sélection du héros (Charline cochée)', async () => {
      await page.evaluate(() =>
        /** @type {HTMLElement} */ (
          document.querySelector('.hero-card[data-hero="charline"]')
        )?.click(),
      );
    });
    await screenShot('options', 'options (depuis le titre)', async () => {
      await click('optionsBtn');
      await until('options', 10000);
    });
    await click('optionsClose');
    await screenShot('trophees', 'trophées (partie neuve)', async () => {
      await until('title', 10000);
      await click('trophiesBtn');
      await until('trophies', 10000);
    });
    await click('trophiesClose');
    await screenShot('distribution', 'distribution', async () => {
      await until('title', 10000);
      await click('castBtn');
      await until('cast', 10000);
      await wait(3000);
    });
    await screenShot('affiches-1', 'galerie d’affiches (1re)', async () => {
      await click('postersBtn');
      await until('posters', 10000);
      await wait(1500);
    });
    await screenShot('affiches-2', 'galerie d’affiches (2e)', async () => {
      await click('posterNext');
      await wait(1500);
    });
    await click('postersClose');
    await wait(500);
    await click('castClose');
    await until('title', 10000).catch(() => {});
  }
  await page.evaluate(
    (hero) =>
      /** @type {HTMLElement} */ (
        document.querySelector(`.hero-card[data-hero="${hero}"]`)
      )?.click(),
    device.hero,
  );
  const heroName = device.hero === 'kevin' ? 'Kévin' : 'Charline';

  // ---- Stages ------------------------------------------------------------------------
  const stages = onlyStages ?? LEVELS.map((_, i) => i);
  let credited = false;
  for (const s of stages) {
    const level = LEVELS[s];
    if (!level) continue;
    const tag = `${String(s).padStart(2, '0')}-${level.id}`;
    const group = `etape-${tag}-${deviceId}`;
    const stageName = `${s + 1}. ${level.name}`;
    log(`${deviceId}: stage ${tag}`);
    try {
      if (page.isClosed()) await open();
      await nao(`n.stage(${s});`);
      // The title already shows the parking: the loading screen appears for the others.
      if (s === stages.find((i) => i > 0) && !skip.has('screens'))
        await screenShot('chargement', 'écran de chargement', () => until('loading', 20000));
      await until('talk', 300000);
      await page.waitForFunction(
        () => document.getElementById('loading')?.getAttribute('aria-hidden') === 'true',
        null,
        { timeout: 120000 },
      );
      await shot(
        {
          file: `${deviceId}/${tag}-00-dialogue.jpg`,
          group,
          stage: stageName,
          place: 'dialogue d’intro',
        },
        () => wait(3500),
        describeScreen,
      );
      await skipTalk();
      await wait(3500);
    } catch (e) {
      log(`${deviceId}: stage ${tag} did not load (${/** @type {Error} */ (e).message})`);
      record({
        file: `${deviceId}/${tag}-00-dialogue.jpg`,
        device: deviceId,
        group,
        stage: stageName,
        place: 'chargement de l’étape',
        sees: `ÉCHEC : étape non chargée (${/** @type {Error} */ (e).message.split('\n')[0]})`,
        ok: false,
      });
      await open().catch(() => {});
      continue;
    }
    const scene = () => describeScene(s);

    if (s === 0 && !skip.has('screens')) {
      await page.evaluate(() => {
        const style = /** @type {HTMLStyleElement | null} */ (
          document.getElementById('capture-clean')
        );
        if (style) style.disabled = true;
      });
      await screenShot(
        'hud',
        'HUD en jeu (bulles et astuces visibles)',
        () => settle(20000),
        () => describeScene(s),
      );
      await page.evaluate(() => {
        const style = /** @type {HTMLStyleElement | null} */ (
          document.getElementById('capture-clean')
        );
        if (style) style.disabled = false;
      });
      await screenShot('pause', 'pause', async () => {
        await click('pauseBtn');
        await until('pause', 10000);
      });
      await screenShot('options-pause', 'options (depuis la pause)', async () => {
        await click('pauseOptions');
        await until('options', 10000);
      });
      await click('optionsClose');
      await wait(300);
      await click('resume');
      await until('play', 10000).catch(() => {});
    }

    // Every room (the boss arena has its own sequence below).
    const arenaRoom = level.boss ? Math.floor(level.boss.arena[0] / ROOM_W) : -1;
    const rooms = level.rooms
      .map((name, r) => ({ name, r }))
      .filter(({ r }) => r !== arenaRoom || !level.boss);
    const picked = device.allRooms ? rooms : [rooms[Math.floor(rooms.length / 2)]];
    if (!skip.has('rooms'))
      for (const { name, r } of picked) {
        await shot(
          {
            file: `${deviceId}/${tag}-${String(r + 1).padStart(2, '0')}-${slug(name)}.jpg`,
            group,
            stage: stageName,
            place: `salle ${r + 1} « ${name} »`,
          },
          async () => {
            const spots = await spotsIn(r);
            if (!spots.length) throw new Error('aucun sol trouvé dans la salle');
            // A trap or a colleague keeps knocking the hero (he blinks): try further on.
            for (const spot of spots) {
              await teleport(spot.x, spot.y);
              await wait(1500);
              if (await settle(spot === spots[0] ? 40000 : 25000)) return wait(800);
            }
            // Never calm (a printer or a loose floor nearby): at least catch him unblinking.
            await page
              .waitForFunction(
                () => {
                  const n = /** @type {any} */ (globalThis).__nao;
                  return n.screen === 'play' && n.sim.hero.invuln <= 0;
                },
                null,
                { timeout: 20000, polling: 50 },
              )
              .catch(() => {});
          },
          async () => `${heroName} · ${await scene()}`,
        );
      }

    if (s === 0 && !skip.has('screens')) {
      await screenShot('game-over', 'game over', async () => {
        await nao(`n.sim.assist = false; Object.assign(n.sim.hero, { hearts: 1, invuln: 0,
          y: -3, vx: 0, vy: 0, state: 'air' });`);
        await until('gameover', 60000);
      });
      await click('goResume');
      await until('play', 10000).catch(() => {});
      await nao(`n.sim.assist = true;`);
      await screenShot('resultats', `résultats (${level.name})`, async () => {
        await nao(`n.sim.hasKey = true; n.sim.won = true;`);
        const end = Date.now() + 90000;
        while (Date.now() < end) {
          const screen = await nao(
            `if (n.screen === 'talk') document.getElementById('talk').click(); return n.screen;`,
          );
          if (screen === 'won') return wait(2500);
          await wait(300);
        }
        throw new Error('l’écran de résultats ne vient pas');
      });
    }

    // ---- Boss --------------------------------------------------------------------------
    if (level.boss && !skip.has('bosses')) {
      const bossId = level.boss.id;
      const who = BOSSES[bossId] ?? bossId;
      const bossGroup = `boss-${slug(who)}-${deviceId}`;
      const base = `${deviceId}/boss-${slug(who)}`;
      const [a0] = level.boss.arena;
      /** @returns {Promise<any>} */
      const bossState = () =>
        nao(`if (n.screen === 'talk') document.getElementById('talk').click();
          n.sim.assist = true; n.sim.hero.hearts = Math.max(n.sim.hero.hearts, 3);
          const b = n.sim.things.find((t) => t.kind === 'boss');
          return b && { state: b.state, phase: b.phase ?? 1, hp: b.hp, x: b.x, y: b.y0 ?? b.y,
            screen: n.screen, active: n.sim.bossActive, done: n.sim.bossDone,
            invuln: n.sim.hero.invuln, hx: n.sim.hero.x };`);
      /**
       * Waits until a test on the boss passes, landing a CR during every consult when asked.
       * @param {(b: any) => boolean} test @param {boolean} strike @param {number} timeout
       */
      const bossUntil = async (test, strike, timeout) => {
        const end = Date.now() + timeout;
        let struck = false;
        while (Date.now() < end) {
          const b = await bossState();
          if (b && test(b)) return b;
          if (b && strike && b.state === 'consult' && b.screen === 'play' && !struck) {
            // Stand three tiles from him, facing him, and throw.
            const side = b.x - 3.2 > a0 + 1.5 ? -1 : 1;
            await teleport(b.x + side * 3.2 - 0.3, b.y + 0.05, -side);
            await wait(250);
            // One CR per phase is enough here: the director starts the hit on the last
            // argument of his phase.
            const last = (PATTERNS[bossId].phases[b.phase - 1] ?? 0) + 1;
            await nao(`n.sim.ammo = 9;
              const b = n.sim.things.find((t) => t.kind === 'boss');
              b.hp = Math.min(b.hp, ${last});`);
            await page.keyboard.down('KeyX');
            await wait(150);
            await page.keyboard.up('KeyX');
            struck = true;
          } else if (b?.state !== 'consult') struck = false;
          await wait(300);
        }
        throw new Error(`délai dépassé (${Math.round(timeout / 1000)} s)`);
      };
      const bossShot = (
        /** @type {string} */ step,
        /** @type {string} */ place,
        /** @type {() => Promise<unknown>} */ prepare,
      ) =>
        shot(
          {
            file: `${base}-${step}.jpg`,
            group: bossGroup,
            stage: stageName,
            place: `${who} : ${place}`,
          },
          prepare,
          async () => `${heroName} · ${await scene()}`,
        );
      /** Frames the director with the hero: on a phone he can stand out of view. */
      const closeIn = async () => {
        const b = await bossState();
        if (b && Math.abs(b.hx - b.x) > 3.8) {
          const side = b.x - 3.2 > a0 + 1.5 ? -1 : 1;
          await teleport(b.x + side * 3.2 - 0.3, b.y + 0.05, -side);
          await wait(1200);
        }
        await bossUntil((b) => b.invuln <= 0, false, 15000).catch(() => {});
        await wait(600);
      };
      log(`${deviceId}: boss ${who}`);
      await teleport(a0 + 4, 3.05);
      await bossShot('1-entree', 'entrée (après son dialogue)', async () => {
        await bossUntil(
          (b) => b.active && b.screen === 'play' && b.state === 'intro',
          false,
          240000,
        );
        await wait(400);
      });
      await bossShot('2-phase-1', 'phase 1, une attaque', async () => {
        await bossUntil((b) => !CALM.includes(b.state), false, 120000);
        await closeIn();
      });
      await bossShot('3-phase-2', 'phase 2, une attaque', async () => {
        await bossUntil((b) => b.phase >= 2 && !CALM.includes(b.state), true, 480000);
        await closeIn();
      });
      if (level.boss.id === 'regionalDirector')
        await bossShot('4-phase-3', 'phase 3 (grand final), une attaque', async () => {
          await bossUntil((b) => b.phase >= 3 && !CALM.includes(b.state), true, 480000);
          await closeIn();
        });
      await bossShot('5-defaite', 'défaite (convaincu)', async () => {
        await bossUntil((b) => b.done, true, 480000);
        // His closing words, then the signing.
        await bossUntil((b) => b.screen === 'play' && b.state === 'sign', false, 60000);
        await wait(1500);
      });
      // The end of the boss stage: the results, or the epilogue and the credits.
      const final = level.boss.id === 'regionalDirector';
      await shot(
        {
          file: final ? `${deviceId}/ecran-credits.jpg` : `${base}-6-resultats.jpg`,
          group: final ? `ecrans-${deviceId}` : bossGroup,
          stage: final ? '—' : stageName,
          place: final ? 'crédits (après Rodolphe)' : `${who} : résultats de l’étape`,
        },
        async () => {
          const want = final ? 'credits' : 'won';
          // The signed key, straight to the exit.
          await nao(`n.sim.hasKey = true; n.sim.won = true;`);
          const end = Date.now() + 120000;
          while (Date.now() < end) {
            const screen = await nao(
              `if (n.screen === 'talk') document.getElementById('talk').click(); return n.screen;`,
            );
            if (screen === want) return wait(4000);
            await wait(300);
          }
          throw new Error(`l’écran ${want} ne vient pas`);
        },
        describeScreen,
      );
      if (final) credited = true;
    }
  }

  // ---- After the story: credits (if not reached), title, chapters, trophies --------------
  if (!skip.has('screens')) {
    if (!credited)
      await screenShot('credits', 'crédits', async () => {
        await nao(`n.credits();`);
        await until('credits', 20000);
        await wait(2500);
      });
    await click('creditsClose');
    await screenShot('titre-fin', 'titre après le générique', async () => {
      await until('title', 120000);
      await wait(3000);
    });
    await screenShot('chapitres', 'chapitres', async () => {
      const hidden = await page.evaluate(() => document.getElementById('chaptersBtn')?.hidden);
      if (hidden) {
        await page.evaluate(() => localStorage.setItem('naorush.stage', '4'));
        await page.reload();
        await until('title', 180000);
        await wait(3000);
      }
      await click('chaptersBtn');
      await until('chapters', 10000);
    });
    await click('chaptersClose');
    await screenShot('trophees-fin', 'trophées (après la partie)', async () => {
      await until('title', 10000);
      await click('trophiesBtn');
      await until('trophies', 10000);
    });
  }
  await context?.close().catch(() => {});
}
await browser.close();

// ---- Contact sheets and index ---------------------------------------------------------------
const all = [...entries.values()].sort((a, b) => a.order - b.order);
/** @type {Map<string, Entry[]>} */
const groups = new Map();
for (const e of all) if (e.ok) groups.set(e.group, [...(groups.get(e.group) ?? []), e]);
/** @type {string[]} */
const sheets = [];
for (const [group, list] of [...groups].sort(([a], [b]) => a.localeCompare(b))) {
  const count = Math.ceil(list.length / 9);
  for (let k = 0; k < count; k++) {
    const part = list.slice(k * 9, (k + 1) * 9);
    const name = `planches/${group}${count > 1 ? `-${k + 1}` : ''}.jpg`;
    const args = ['montage'];
    for (const e of part)
      args.push('-label', e.place.slice(0, e.device === 'portrait' ? 30 : 48), join(out, e.file));
    args.push(
      // Thumbnails keep the device's shape: portrait ones are tall, the others wide.
      ...['-tile', '3x', '-geometry', part[0].device === 'portrait' ? 'x460+6+6' : '440x+6+6'],
      ...['-pointsize', '13'],
      ...['-background', '#1d1f24', '-fill', '#f0f0f0', '-title', group, '-quality', '80'],
      join(out, name),
    );
    try {
      execFileSync('magick', args, { stdio: 'pipe' });
      sheets.push(`- [${name}](${name}) : ${part.length} vignettes`);
    } catch (e) {
      sheets.push(
        `- ${name} : ÉCHEC du montage (${/** @type {Error} */ (e).message.split('\n')[0]})`,
      );
    }
  }
}
const cell = (/** @type {string} */ s) => s.replace(/\|/g, '/').replace(/\n/g, ' ');
const failed = all.filter((e) => !e.ok);
writeFileSync(
  join(out, 'INDEX.md'),
  [
    '# Captures NAO Rush',
    '',
    `${all.length - failed.length} images, ${failed.length} échec(s), ${sheets.length} planches. ` +
      `Appareils : ${Object.entries(DEVICES)
        .map(([id, d]) => `${id} = ${d.label} (${d.hero === 'kevin' ? 'Kévin' : 'Charline'})`)
        .join(' ; ')}. JPEG qualité 70, deviceScaleFactor 1.`,
    '',
    '## Planches',
    '',
    ...sheets,
    '',
    '## Images',
    '',
    '| Image | Étape | Salle / écran | Appareil | Ce qu’on y voit |',
    '| --- | --- | --- | --- | --- |',
    ...all.map(
      (e) =>
        `| ${e.ok ? `[${e.file}](${e.file})` : `~~${e.file}~~`} | ${cell(e.stage)} | ${cell(e.place)} | ${DEVICES[e.device]?.label ?? e.device} | ${cell(e.sees)} |`,
    ),
    '',
  ].join('\n'),
);
log(`done: ${all.length - failed.length} images, ${failed.length} failed, ${sheets.length} sheets`);

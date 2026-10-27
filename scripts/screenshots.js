// Captures the README images into docs/ (and the link preview into public/) from a
// development build, which exposes the `__nao` hook:
//   npm run dev -- --port 5210 & npm run screenshots -- http://localhost:5210/
// Options: --only=title,gif,interlude,stages,bosses or image names such as
// stage-ts or boss-julien (default: everything); --keep keeps the GIF's images.
// The animated GIF needs ffmpeg on the PATH.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { LEVELS } from '../src/data/levels/index.js';
import { solve } from '../src/game/solver.js';

const url = process.argv.find((a) => a.startsWith('http')) ?? 'http://localhost:5173/';
const only = process.argv
  .find((a) => a.startsWith('--only='))
  ?.slice(7)
  .split(',');
/** @param {string[]} parts A part of the captures, or an image's name. */
const wanted = (...parts) => !only || parts.some((p) => only.includes(p));
/** Thursday evening: the title's dusk light and its « Jour des NAO ! » line. */
const THURSDAY = new Date('2026-10-29T18:40:00');

const browser = await chromium.launch({
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});

/**
 * A page with clean captures: every tip already seen, no speech bubble, toast or
 * hint over the scenery, the clock set to {@link THURSDAY}.
 * @param {import('playwright').BrowserContextOptions} options
 */
async function open(options) {
  const page = await (await browser.newContext(options)).newPage();
  // Software rendering on a busy machine can draw a frame a second: generous delays.
  page.setDefaultTimeout(300000);
  page.on('pageerror', (e) => console.error('page error:', e.message));
  await page.clock.setSystemTime(THURSDAY);
  await page.addInitScript(() => {
    // For the GIF: frame timestamps can be frozen (`on`), then moved on by `add` ms at
    // the next frame, so each image is one even step of play however slow the rendering.
    // That frame's picture is read straight from the game's canvas (`image`), after the
    // game has drawn it: a page screenshot waits for several frames.
    const gif = { on: false, t: 0, add: 0, real: 0, grab: false, image: '' };
    Object.assign(globalThis, { __gif: gif });
    const raf = requestAnimationFrame.bind(globalThis);
    globalThis.requestAnimationFrame = (cb) =>
      raf((ts) => {
        if (ts !== gif.real) {
          gif.real = ts;
          gif.grab = gif.on && gif.add > 0;
          if (!gif.on) gif.t = ts;
          else [gif.t, gif.add] = [gif.t + gif.add, 0];
        }
        cb(gif.t);
        const canvas = /** @type {HTMLCanvasElement | null} */ (document.getElementById('game'));
        if (gif.grab && canvas) gif.image = canvas.toDataURL('image/jpeg', 0.92);
      });
    const seen = ['chairRoll', 'drawerOut', 'sprayOn', 'puddle', 'paperShot', 'trapdoor'];
    seen.push('invite', 'vacuumBounce', 'internStun', 'archive', 'rackDrop', 'cableWarn');
    seen.push('zoneWarn', 'dash', 'switch', 'secret');
    localStorage.setItem('naorush.tips', JSON.stringify(seen));
    addEventListener('DOMContentLoaded', () => {
      const style = document.createElement('style');
      style.textContent =
        '.bark, .toast, .hint, .close-up :is(.hud, .bossbar, .consult) ' +
        '{ visibility: hidden !important; }';
      document.head.append(style);
    });
  });
  await page.goto(url);
  return page;
}

/**
 * The helpers bound to one page.
 * @param {import('playwright').Page} page
 */
function helpers(page) {
  /** @param {string} screen @param {number} [timeout] */
  const until = (screen, timeout = 300000) =>
    page.waitForFunction((s) => document.body.dataset.screen === s, screen, { timeout });
  /** Clicks through the dialogue until play resumes, then lets the stage title fade. */
  const skipTalk = async () => {
    for (let i = 0; i < 120; i++) {
      const screen = await page.evaluate(() => {
        document.getElementById('talk')?.click();
        return document.body.dataset.screen;
      });
      if (screen === 'play') break;
      await page.waitForTimeout(150);
    }
    await page.waitForTimeout(3500);
  };
  /** @param {number} stage */
  const start = async (stage) => {
    await page.evaluate((i) => /** @type {any} */ (globalThis).__nao.stage(i), stage);
    await until('talk');
    // The first frames of a stage are slow (shaders, uploads).
    await page.waitForFunction(
      () => document.getElementById('loading')?.getAttribute('aria-hidden') === 'true',
      null,
      { timeout: 300000 },
    );
    await page.waitForTimeout(4000);
    await skipTalk();
  };
  /**
   * Freezes the game's time, then plays it on by `ms` (at most 100 per call).
   * @param {number} ms
   */
  const advance = (ms) =>
    page.evaluate(
      (ms) =>
        new Promise((done) => {
          const gif = /** @type {any} */ (globalThis).__gif;
          [gif.on, gif.add] = [true, ms];
          const wait = () =>
            requestAnimationFrame(() => (gif.add || gif.grab ? wait() : done(null)));
          wait();
        }),
      ms,
    );
  /**
   * Places the hero and waits until the camera has caught up with him, he stands and
   * no longer blinks (software rendering is slow: no fixed delay).
   * @param {number} x @param {number} y
   */
  const goto = async (x, y, facing = 1, settle = true) => {
    await page.evaluate(
      ([x, y, facing]) => {
        const sim = /** @type {any} */ (globalThis).__nao.sim;
        Object.assign(sim.hero, { x, y, vx: 0, vy: 0, facing, state: 'air', invuln: 0 });
      },
      [x, y, facing],
    );
    if (!settle) return;
    await page.waitForFunction(
      () => {
        const nao = /** @type {any} */ (globalThis).__nao;
        const { focus } = nao.camera.out;
        // The camera leads the hero by up to 2.5 tiles.
        const near = Math.abs(focus[0] - nao.sim.hero.x) < 3;
        const { hero } = nao.sim;
        return near && nao.screen === 'play' && hero.state === 'ground' && hero.invuln <= 0;
      },
      null,
      { timeout: 300000, polling: 500 },
    );
    await page.waitForTimeout(3000);
    // Freeze there, standing: a nudge restarts the standing time, so no idle loop
    // (Kévin's watch, Charline's pointing) shows.
    await page.evaluate(() => {
      /** @type {any} */ (globalThis).__nao.sim.hero.vx = 0.06;
    });
    await advance(0);
    await page.evaluate(() => {
      /** @type {any} */ (globalThis).__nao.sim.hero.vx = 0;
    });
  };
  /**
   * Takes a screenshot with the game's time frozen: nothing moves or blinks while a
   * slow software renderer gets the picture out.
   * @param {import('playwright').PageScreenshotOptions} options
   */
  const still = async (options) => {
    await page.evaluate(() => {
      /** @type {any} */ (globalThis).__gif.on = true;
    });
    await page.screenshot({ timeout: 900000, ...options });
    await page.evaluate(() => {
      /** @type {any} */ (globalThis).__gif.on = false;
    });
  };
  return { until, skipTalk, start, goto, still, advance };
}

/** @param {string} name */
const doc = (name) => `docs/${name}.jpg`;
/** @param {string} path */
const kb = (path) => `${path} ${Math.round(statSync(path).size / 1024)} Ko`;

if (wanted('gif')) {
  // Its own smaller page: every image is a frame drawn by software.
  const page = await open({ viewport: { width: 960, height: 540 }, deviceScaleFactor: 1 });
  const { until, start, goto } = helpers(page);
  await until('title');
  await start(0);
  // A stretch of the parking played by the solver, one even step per image:
  // car roofs over a cable pit, the robot vacuum springboard, the goods lift wall and
  // the wet floor behind its yellow sign.
  await goto(39.5, 3);
  await page.evaluate(() => {
    /** @type {any} */ (globalThis).__gif.on = true;
  });
  await page.waitForTimeout(500);
  const snapshot = await page.evaluate(() => {
    const sim = /** @type {any} */ (globalThis).__nao.sim;
    return JSON.stringify({ ...sim, tiles: Array.from(sim.tiles) });
  });
  const sim = JSON.parse(snapshot);
  sim.tiles = Uint8Array.from(sim.tiles);
  const route = solve(sim, {
    goal: { x: 81, y: 8, done: (s) => s.hero.x >= 81 && s.hero.state === 'ground' },
  });
  if (!route.won) throw new Error('no route for the GIF');
  // The game reads exactly one input per simulation step: queue the route there.
  await page.evaluate((inputs) => {
    const input = /** @type {any} */ (globalThis).__nao.input;
    const queue = [...inputs];
    const own = input.state.bind(input);
    input.state = () => queue.shift() ?? own();
  }, route.inputs);
  const dir = mkdtempSync(join(tmpdir(), 'naorush-gif-'));
  const fps = 12;
  // Half a second of landing after the route.
  const frames = Math.ceil(((route.inputs.length + 30) / 60) * fps);
  for (let i = 0; i < frames; i++) {
    // One step of play, the frame drawn after it, then that frame's picture.
    const image = await page.evaluate(
      (ms) =>
        new Promise((done) => {
          const gif = /** @type {any} */ (globalThis).__gif;
          [gif.add, gif.image] = [ms, ''];
          const wait = () =>
            requestAnimationFrame(() => (gif.image && !gif.grab ? done(gif.image) : wait()));
          wait();
        }),
      1000 / fps,
    );
    const name = join(dir, `${String(i).padStart(4, '0')}.jpg`);
    writeFileSync(name, Buffer.from(String(image).split(',')[1], 'base64'));
  }
  await page.evaluate(() => {
    /** @type {any} */ (globalThis).__gif.on = false;
  });
  execFileSync('ffmpeg', [
    ...['-y', '-loglevel', 'error', '-framerate', String(fps)],
    ...['-i', join(dir, '%04d.jpg'), '-vf'],
    // The camera scrolls, so every image changes all over: a small size, 64 colours and
    // no dithering keep the GIF under 3 MB.
    'scale=480:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=64:stats_mode=diff[p];' +
      '[b][p]paletteuse=dither=none:diff_mode=rectangle',
    ...['-loop', '0', 'docs/gameplay.gif'],
  ]);
  console.info(kb('docs/gameplay.gif'), `${readdirSync(dir).length} images, ${fps} i/s`);
  if (process.argv.includes('--keep')) console.info(`images kept in ${dir}`);
  else rmSync(dir, { recursive: true });
  await page.context().close();
}

if (wanted('interlude')) {
  // Its own page at the screen's size: the card is crisp, and frames come faster.
  const page = await open({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
  const { until, start, still } = helpers(page);
  await until('title');
  // The way to the next stage: the route of the week, the clock, a line.
  await start(0);
  await page.evaluate(() => {
    const sim = /** @type {any} */ (globalThis).__nao.sim;
    Object.assign(sim, { hasKey: true, won: true });
  });
  for (let i = 0; i < 200; i++) {
    const screen = await page.evaluate(() => {
      if (document.body.dataset.screen === 'talk') document.getElementById('talk')?.click();
      return document.body.dataset.screen;
    });
    if (screen === 'won') break;
    await page.waitForTimeout(300);
  }
  await until('won');
  await page.waitForTimeout(3000);
  // A script click: Playwright's waits for a stable button outlast slow frames.
  await page.evaluate(() => document.getElementById('next')?.click());
  await until('interlude');
  // Halfway: the clock running, the dot halfway to the next stop, the line shown.
  await page.evaluate(
    () =>
      new Promise((done) => {
        /** @param {string} selector */
        const cx = (selector) => Number(document.querySelector(selector)?.getAttribute('cx'));
        const look = () => {
          const from = cx('.il-stop.done:has(+ .il-stop.next) circle');
          const k = (cx('.il-dot') - from) / (cx('.il-stop.next circle') - from);
          if (k >= 0.5) done(null);
          else requestAnimationFrame(look);
        };
        look();
      }),
  );
  // The card and a margin of the scene behind it.
  const clip = { x: 240, y: 120, width: 800, height: 480 };
  await still({ path: doc('interlude'), type: 'jpeg', quality: 82, clip });
  console.info(kb(doc('interlude')));
  await page.context().close();
}

// ---- PC: 1280×720 at twice the pixels (smoother edges, sharper boss close-ups) ----
/** Stage stills: stage, image, where the hero stands. @type {Array<[number, string, number, number]>} */
const STILLS = [
  [0, 'parking', 9, 4],
  [1, 'lcp7', 109.6, 7],
  [2, 'ts', 64.5, 6],
  [3, 'copil', 66.5, 4],
  [4, 'rooftop', 131.5, 9],
  [5, 'intercontrat', 187.5, 6],
  [6, 'pause', 52.5, 6],
  [7, 'seminaire', 30.5, 6],
];
/** Boss close-ups: stage, image, the attack they catch. @type {Record<number, [string, string]>} */
const DUELS = { 2: ['julien', 'rackDrop'], 4: ['rodolphe', 'fan'] };

const PC = ['title', 'stages', 'bosses'];
PC.push(...STILLS.map(([, name]) => `stage-${name}`));
PC.push(...Object.values(DUELS).map(([name]) => `boss-${name}`));

if (wanted(...PC)) {
  const pc = await open({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 2 });
  const { until, start, goto, still, advance } = helpers(pc);
  /** @param {string} name */
  const shot = async (name, quality = 80) => {
    await still({ path: doc(name), type: 'jpeg', quality, scale: 'css' });
    console.info(kb(doc(name)));
  };
  await until('title');
  await pc.waitForTimeout(5000);

  if (wanted('title')) {
    await shot('title');
    // The link preview image (Teams, Slack, social networks).
    await still({
      path: 'public/og.jpg',
      type: 'jpeg',
      quality: 82,
      scale: 'css',
      clip: { x: 40, y: 45, width: 1200, height: 630 },
    });
    console.info(kb('public/og.jpg'));
  }

  /**
   * A close-up framing the hero and the boss: projects both through the game camera
   * and crops the screenshot around them (16:9, at least 560 px wide).
   * @param {string} name
   */
  const closeUp = async (name) => {
    const [cast, all] = await pc.evaluate(() => {
      const nao = /** @type {any} */ (globalThis).__nao;
      const m = nao.camera.out.viewProj;
      const { hero } = nao.sim;
      const boss = nao.sim.things.find((/** @type {any} */ t) => t.kind === 'boss');
      const pts = [
        [hero.x - 0.3, hero.y],
        [hero.x + 0.9, hero.y + 1.8],
        [boss.x - 0.8, boss.y],
        [boss.x + 0.8, boss.y + 3],
      ];
      const people = pts.length;
      // And the attack in the air near them: a rack coming down, slides.
      for (const t of nao.sim.things)
        if (
          t.alive !== false &&
          (t.kind === 'kpi' || (t.kind === 'rack' && t.state === 'fall' && t.y < t.y0 + 4.5)) &&
          Math.abs(t.x - hero.x) < 9
        )
          pts.push([t.x - 0.6, t.y], [t.x + 0.6, t.y + (t.kind === 'rack' ? 2.2 : 0.6)]);
      /** Screen box (CSS pixels) of some points. @param {number[][]} p */
      const bounds = (p) => {
        const s = p.map(([x, y]) => {
          const w = m[3] * x + m[7] * y + m[15];
          return [
            ((m[0] * x + m[4] * y + m[12]) / w + 1) * 640,
            (1 - (m[1] * x + m[5] * y + m[13]) / w) * 360,
          ];
        });
        const xs = s.map((q) => q[0]);
        const ys = s.map((q) => q[1]);
        return [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
      };
      return [bounds(pts.slice(0, people)), bounds(pts)];
    });
    const [x0, x1, y0, y1] = all;
    // Close enough for the characters to read (and the image to stay light).
    const width = Math.min(760, Math.max(560, (x1 - x0) * 1.35, ((y1 - y0) * 1.5 * 16) / 9));
    const height = (width * 9) / 16;
    // Centred on everything, but the hero and the director always whole.
    const margin = 24;
    /** @param {number} c @param {number} size @param {number} lo @param {number} hi */
    const keep = (c, size, lo, hi) =>
      Math.max(hi + margin - size / 2, Math.min(lo - margin + size / 2, c));
    const cx = keep((x0 + x1) / 2, width, cast[0], cast[1]);
    const cy = keep((y0 + y1) / 2 - height * 0.04, height, cast[2], cast[3]);
    const clip = {
      x: Math.max(0, Math.min(1280 - width, cx - width / 2)),
      y: Math.max(0, Math.min(720 - height, cy - height / 2)),
      width,
      height,
    };
    // Without the HUD, which the crop would cut through.
    await pc.evaluate(() => document.body.classList.add('close-up'));
    await still({ path: doc(name), type: 'jpeg', quality: 85, clip });
    await pc.evaluate(() => document.body.classList.remove('close-up'));
    console.info(kb(doc(name)));
  };

  /**
   * Walks into the arena and lets the duel run (no damage) until the wanted attack.
   * @param {number} stage @param {string} attack
   */
  const fight = async (stage, attack) => {
    const [a0] = LEVELS[stage].boss?.arena ?? [0];
    await goto(a0 + 4, 3.05, 1, false);
    let state;
    for (let i = 0; i < 600; i++) {
      state = await pc.evaluate(() => {
        const nao = /** @type {any} */ (globalThis).__nao;
        if (nao.screen === 'talk') document.getElementById('talk')?.click();
        nao.sim.assist = true;
        nao.sim.hero.hearts = 9;
        return nao.sim.things.find((/** @type {any} */ t) => t.kind === 'boss')?.state;
      });
      if (state === attack) break;
      await pc.waitForTimeout(250);
    }
    if (state !== attack) throw new Error(`boss never reached ${attack}`);
    // Freeze there, the hero four tiles from the director, then play the attack on
    // a frame at a time until it shows best: a rack halfway down beside the hero, or
    // a fan of slides in the air.
    await advance(0);
    await pc.evaluate(() => {
      const nao = /** @type {any} */ (globalThis).__nao;
      const boss = nao.sim.things.find((/** @type {any} */ t) => t.kind === 'boss');
      Object.assign(nao.sim.hero, { x: boss.x - 4, vx: 0, facing: 1, invuln: 0 });
    });
    for (let i = 0; i < 80; i++) {
      const ready = await pc.evaluate((attack) => {
        const { hero, things } = /** @type {any} */ (globalThis).__nao.sim;
        hero.invuln = 0;
        const live = things.filter((/** @type {any} */ t) => t.alive !== false);
        if (attack === 'rackDrop') {
          // A rack halfway down: the hero steps out from under it, just in time.
          const rack = live.find(
            (/** @type {any} */ r) =>
              r.kind === 'rack' && r.state === 'fall' && r.y > r.y0 + 2 && r.y < r.y0 + 4.5,
          );
          if (rack && Math.abs(rack.x - hero.x - 0.3) < 1.5) hero.x = rack.x - 1.9;
          return Boolean(rack);
        }
        // Slides clear of the director's face.
        const boss = live.find((/** @type {any} */ t) => t.kind === 'boss');
        const kpi = live.filter((/** @type {any} */ t) => t.kind === 'kpi');
        const clear = (/** @type {any} */ t) => Math.hypot(t.x - boss.x, t.y - boss.y - 2.6) > 2;
        return kpi.length >= 3 && kpi.every(clear);
      }, attack);
      if (ready) break;
      await advance(50);
    }
  };

  for (const [stage, name, x, y] of STILLS) {
    const duel = DUELS[stage];
    const boss = duel && wanted('bosses', `boss-${duel[0]}`);
    if (!wanted('stages', `stage-${name}`) && !boss) continue;
    await start(stage);
    if (wanted('stages', `stage-${name}`)) {
      await goto(x, y);
      await shot(`stage-${name}`);
    }
    if (boss) {
      await fight(stage, duel[1]);
      await closeUp(`boss-${duel[0]}`);
    }
  }
}

await browser.close();

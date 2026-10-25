// Captures the README screenshots into docs/ from a running dev server:
//   npm run dev -- --port 5210 & npm run screenshots -- http://localhost:5210/
import { chromium } from 'playwright';

const url = process.argv[2] ?? 'http://localhost:5173/';
const browser = await chromium.launch({
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
// Twice the pixels, so boss close-ups can be cropped without blur.
const page = await (
  await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 2 })
).newPage();
page.setDefaultTimeout(90000);
/** @param {string} screen */
const until = (screen) =>
  page.waitForFunction((s) => document.body.dataset.screen === s, screen, { timeout: 90000 });
/** @param {string} name */
const shot = async (name) => {
  await page.screenshot({ path: `docs/${name}.jpg`, type: 'jpeg', quality: 86, scale: 'css' });
};
/**
 * A close-up framing the hero and the boss: projects both through the game camera and
 * crops the device-scale screenshot around them (16:9, at least 640 px wide).
 * @param {string} name
 */
const closeUp = async (name) => {
  const box = await page.evaluate(() => {
    const nao = /** @type {any} */ (globalThis).__nao;
    const m = nao.camera.out.viewProj;
    const boss = nao.sim.things.find((/** @type {any} */ t) => t.kind === 'boss');
    const pts = [
      [nao.sim.hero.x + 0.3, nao.sim.hero.y],
      [nao.sim.hero.x + 0.3, nao.sim.hero.y + 1.8],
      [boss.x, boss.y],
      [boss.x, boss.y + 2.2],
    ].map(([x, y]) => {
      const w = m[3] * x + m[7] * y + m[15];
      return [
        ((m[0] * x + m[4] * y + m[12]) / w + 1) * 640,
        (1 - (m[1] * x + m[5] * y + m[13]) / w) * 360,
      ];
    });
    const xs = pts.map((p) => p[0]);
    const ys = pts.map((p) => p[1]);
    return [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  });
  const [x0, x1, y0, y1] = box;
  const width = Math.min(1280, Math.max(560, (x1 - x0) * 1.3, ((y1 - y0) * 1.5 * 16) / 9));
  const height = (width * 9) / 16;
  const cx = (x0 + x1) / 2;
  const cy = (y0 + y1) / 2 - height * 0.05;
  const clip = {
    x: Math.max(0, Math.min(1280 - width, cx - width / 2)),
    y: Math.max(0, Math.min(720 - height, cy - height / 2)),
    width,
    height,
  };
  await page.screenshot({ path: `docs/${name}.jpg`, type: 'jpeg', quality: 88, clip });
};
/** Clicks through the dialogue until play resumes, then lets the stage title fade. */
const skipTalk = async () => {
  for (let i = 0; i < 80; i++) {
    const screen = await page.evaluate(() => {
      document.getElementById('talk')?.click();
      return document.body.dataset.screen;
    });
    if (screen === 'play') break;
    await page.waitForTimeout(150);
  }
  await page.waitForTimeout(3500);
};
/** Places the hero, waits for the camera to settle. @param {number} x @param {number} y */
const goto = async (x, y, facing = 1, settle = true) => {
  await page.evaluate(
    ([x, y, facing]) => {
      const sim = /** @type {any} */ (globalThis).__nao.sim;
      Object.assign(sim.hero, { x, y, vx: 0, vy: 0, facing, state: 'air', invuln: 0 });
    },
    [x, y, facing],
  );
  if (!settle) return;
  // Software rendering at twice the pixels is slow: wait until the camera has
  // caught up with the hero and the HUD is back, rather than a fixed delay.
  await page.waitForFunction(
    () => {
      const nao = /** @type {any} */ (globalThis).__nao;
      const near = Math.abs(nao.camera.out.focus[0] - nao.sim.hero.x) < 3;
      return near && nao.screen === 'play' && nao.sim.hero.state === 'ground';
    },
    null,
    { timeout: 60000, polling: 500 },
  );
  await page.waitForTimeout(2500);
};

// Clean captures: tips already seen, no first-time toasts.
await page.addInitScript(() => {
  const seen = [
    'chairRoll',
    'drawerOut',
    'sprayOn',
    'paperShot',
    'trapdoor',
    'invite',
    'vacuumBounce',
  ];
  seen.push('internStun', 'archive', 'rackDrop', 'cableWarn', 'zoneWarn', 'dash', 'secret');
  localStorage.setItem('naorush.tips', JSON.stringify(seen));
  // No speech bubbles or toasts over the scenery.
  addEventListener('DOMContentLoaded', () => {
    const style = document.createElement('style');
    style.textContent = '.bark, .toast, .hint { visibility: hidden !important; }';
    document.head.append(style);
  });
});
await page.goto(url);
await until('title');
await page.waitForTimeout(4000);
await shot('title');
// The link preview image (Teams, Slack, social networks).
await page.screenshot({
  path: 'public/og.jpg',
  type: 'jpeg',
  quality: 85,
  clip: { x: 40, y: 45, width: 1200, height: 630 },
});

/** @param {number} stage */
const start = async (stage) => {
  await page.evaluate((i) => /** @type {any} */ (globalThis).__nao.stage(i), stage);
  await until('talk');
  await page.waitForTimeout(4000);
};

await start(0);
await page.waitForTimeout(2500);
await skipTalk();
await goto(9, 4);
await shot('stage-parking');

await start(1);
await skipTalk();
await page.waitForTimeout(3000);
await goto(70.5, 7);
await shot('stage-lcp7');

await start(2);
await skipTalk();
// The server room takes longest to build: let the loading screen clear first.
await page.waitForFunction(
  () => document.getElementById('loading')?.getAttribute('aria-hidden') === 'true',
  null,
  { timeout: 90000 },
);
await page.waitForTimeout(5000);
await goto(19.5, 8.2);
await shot('stage-ts');

/** Starts the boss fight and lets it run into a given attack. @param {string} attack */
const fight = async (attack) => {
  await goto(86, 3, 1, false);
  // Skip the boss's lines whenever they show up, until the wanted attack starts.
  let state;
  for (let i = 0; i < 160; i++) {
    state = await page.evaluate(() => {
      const nao = /** @type {any} */ (globalThis).__nao;
      if (nao.screen === 'talk') document.getElementById('talk')?.click();
      nao.sim.assist = true;
      nao.sim.hero.hearts = 9;
      return nao.sim.things.find((/** @type {any} */ t) => t.kind === 'boss')?.state;
    });
    if (state === attack) break;
    await page.waitForTimeout(400);
  }
  if (state !== attack) throw new Error(`boss never reached ${attack}`);
  // Wait for the hero to stop blinking after a hit.
  await page.waitForFunction(
    () => /** @type {any} */ (globalThis).__nao.sim.hero.invuln <= 0,
    null,
    {
      timeout: 30000,
    },
  );
};
await fight('rackDrop');
await closeUp('boss-julien');

await start(3);
await skipTalk();
await goto(46, 4);
await shot('stage-copil');

await start(4);
await skipTalk();
await goto(54.5, 3.2);
await shot('stage-rooftop');
await fight('fan');
await closeUp('boss-rodolphe');

// Bonus stages.
for (const [i, name, x, y] of /** @type {const} */ ([
  [5, 'intercontrat', 47.5, 3.2],
  [6, 'pause', 49.5, 3.2],
  [7, 'seminaire', 42.5, 3.2],
])) {
  await start(i);
  await skipTalk();
  await goto(x, y);
  await shot(`stage-${name}`);
}

await browser.close();

// Captures the README screenshots into docs/ from a running dev server:
//   npm run dev -- --port 5210 & npm run screenshots -- http://localhost:5210/
import { chromium } from 'playwright';

const url = process.argv[2] ?? 'http://localhost:5173/';
const browser = await chromium.launch({
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
page.setDefaultTimeout(90000);
/** @param {string} screen */
const until = (screen) =>
  page.waitForFunction((s) => document.body.dataset.screen === s, screen, { timeout: 90000 });
/** @param {string} name */
const shot = (name) => page.screenshot({ path: `docs/${name}.jpg`, type: 'jpeg', quality: 86 });
const skipTalk = () =>
  page.evaluate(() => {
    for (let i = 0; i < 12; i++) document.getElementById('talk')?.click();
  });
/** Places the hero, waits for the camera to settle. @param {number} x @param {number} y */
const goto = async (x, y, facing = 1) => {
  await page.evaluate(
    ([x, y, facing]) => {
      const sim = /** @type {any} */ (globalThis).__nao.sim;
      Object.assign(sim.hero, { x, y, vx: 0, vy: 0, facing, state: 'air', invuln: 0 });
    },
    [x, y, facing],
  );
  await page.waitForTimeout(4000);
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
await shot('dialogue');
await skipTalk();
await goto(9, 4);
await shot('stage-parking');

await start(1);
await skipTalk();
await page.waitForTimeout(3000);
await goto(30, 3);
await shot('stage-lcp7');

await start(2);
await skipTalk();
await goto(13, 6);
await shot('stage-ts');

/** Starts the boss fight and lets it run into a given attack. @param {string} attack */
const fight = async (attack) => {
  await goto(86, 3);
  // Skip the boss's lines whenever they show up, until the wanted attack starts.
  for (let i = 0; i < 160; i++) {
    const state = await page.evaluate(() => {
      const nao = /** @type {any} */ (globalThis).__nao;
      if (nao.screen === 'talk') document.getElementById('talk')?.click();
      nao.sim.assist = true;
      nao.sim.hero.hearts = 9;
      return nao.sim.things.find((/** @type {any} */ t) => t.kind === 'boss')?.state;
    });
    if (state === attack) break;
    await page.waitForTimeout(400);
  }
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
await shot('boss-julien');

await start(3);
await skipTalk();
await goto(46, 4);
await shot('stage-copil');

await start(4);
await skipTalk();
await goto(41, 6);
await shot('stage-rooftop');
await fight('fan');
await shot('boss-rodolphe');

await browser.close();

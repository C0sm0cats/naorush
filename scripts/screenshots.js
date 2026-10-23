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

await page.goto(url);
await until('title');
await page.waitForTimeout(4000);
await shot('title');

/** @param {number} stage */
const start = async (stage) => {
  await page.evaluate((i) => /** @type {any} */ (globalThis).__nao.stage(i), stage);
  await until('talk');
  await page.waitForTimeout(4000);
};

await start(0);
await shot('dialogue');
await skipTalk();
await goto(41, 3);
await shot('stage1');

await start(1);
await skipTalk();
await goto(26, 7);
await shot('stage2');
await goto(66, 3);
await page.waitForTimeout(400);
await skipTalk();
await page.waitForTimeout(3500);
await shot('boss');

await start(2);
await skipTalk();
await goto(41, 6);
await shot('stage3');

await browser.close();

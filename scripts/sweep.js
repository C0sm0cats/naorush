// Walks the hero through every stage of a running dev server and reports page errors:
//   npm run dev -- --port 5210 & npm run sweep -- http://localhost:5210/
import { chromium } from 'playwright';

const url = process.argv[2] ?? 'http://localhost:5173/';
const browser = await chromium.launch({
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const page = await (await browser.newContext({ viewport: { width: 800, height: 450 } })).newPage();
page.setDefaultTimeout(120000);
/** @type {string[]} */
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));

/** The dev-only hook exposed by main.js. */
const nao = () => /** @type {any} */ (globalThis).__nao;

await page.goto(url);
await page.waitForFunction(() => document.body.dataset.screen === 'title', null, {
  timeout: 60000,
});
for (let s = 0; s < 7; s++) {
  await page.evaluate(`(${nao})().stage(${s})`);
  await page.waitForFunction(`(${nao})().screen === 'talk'`, null, { timeout: 120000 });
  const w = await page.evaluate(`(${nao})().sim.w`);
  for (let x = 4; x < w - 2; x += 6) {
    // Skip dialogues, stay safe (relaxed mode) and drop the hero along the stage.
    await page.evaluate(`(() => {
      const n = (${nao})();
      if (n.screen === 'talk') document.getElementById('talk').click();
      n.sim.assist = true;
      Object.assign(n.sim.hero, { x: ${x}, y: 9, vx: 0, vy: 0, state: 'air' });
    })()`);
    await page.waitForTimeout(250);
  }
  console.info(`stage ${s}: ${errors.length} error(s) so far`);
}
console.info([...new Set(errors)].join('\n') || 'no errors');
await browser.close();
process.exitCode = errors.length ? 1 : 0;

// Renders every procedural poster into one contact sheet PNG.
// Usage: node scripts/poster-sheet.js [out.png] [--each <dir>]
//   --each also writes every poster as its own PNG into <dir>.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { createServer } from 'vite';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const eachIdx = args.indexOf('--each');
const eachDir = eachIdx >= 0 ? resolve(args[eachIdx + 1]) : null;
if (eachIdx >= 0) args.splice(eachIdx, 2);
const out = resolve(args[0] ?? join(root, 'test-results', 'poster-sheet.png'));

const server = await createServer({
  root,
  logLevel: 'error',
  server: { port: 5290, strictPort: false, host: '127.0.0.1' },
});
await server.listen();
const base = server.resolvedUrls?.local[0];
if (!base) throw new Error('Vite did not report a URL');

const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  page.on('pageerror', (e) => console.error(e));
  // Any same-origin URL works; the module is imported dynamically below.
  await page.goto(new URL('src/gfx/posters.js', base).href);
  const result = await page.evaluate(async (wantEach) => {
    const url = '/src/gfx/posters.js';
    /** @type {typeof import('../src/gfx/posters.js')} */
    const mod = await import(/* @vite-ignore */ url);
    const H = 420;
    const GAP = 28;
    const LABEL = 30;
    const SHEET_W = 2600;
    const posters = mod.POSTER_LIST.map((p) => {
      const c = /** @type {HTMLCanvasElement} */ (mod.renderPoster(p.id));
      return { id: p.id, c, w: Math.round((c.width / c.height) * H) };
    });
    // Simple row flow layout.
    /** @type {{id: string, c: HTMLCanvasElement, w: number, x: number, y: number}[]} */
    const placed = [];
    let x = GAP;
    let y = GAP;
    for (const p of posters) {
      if (x + p.w + GAP > SHEET_W) {
        x = GAP;
        y += H + LABEL + GAP;
      }
      placed.push({ ...p, x, y });
      x += p.w + GAP;
    }
    const sheet = document.createElement('canvas');
    sheet.width = SHEET_W;
    sheet.height = y + H + LABEL + GAP;
    const ctx = /** @type {CanvasRenderingContext2D} */ (sheet.getContext('2d'));
    ctx.fillStyle = '#d9dbe2';
    ctx.fillRect(0, 0, sheet.width, sheet.height);
    ctx.imageSmoothingQuality = 'high';
    for (const p of placed) {
      ctx.drawImage(p.c, p.x, p.y, p.w, H);
      ctx.fillStyle = '#141a2c';
      ctx.font = '600 20px system-ui, sans-serif';
      ctx.fillText(p.id, p.x, p.y + H + 22);
    }
    return {
      sheet: sheet.toDataURL('image/png'),
      each: wantEach ? posters.map((p) => ({ id: p.id, url: p.c.toDataURL('image/png') })) : [],
    };
  }, eachDir !== null);

  /** @param {string} url */
  const png = (url) => Buffer.from(url.split(',')[1], 'base64');
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, png(result.sheet));
  console.info(`Contact sheet: ${out}`);
  if (eachDir) {
    mkdirSync(eachDir, { recursive: true });
    for (const p of result.each) writeFileSync(join(eachDir, `${p.id}.png`), png(p.url));
    console.info(`Posters: ${eachDir}`);
  }
} finally {
  await browser.close();
  await server.close();
}

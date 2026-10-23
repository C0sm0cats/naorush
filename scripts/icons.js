// Draws the app icons (favicon, PWA icons) in a headless browser canvas:
//   npm run icons
import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright';

const browser = await chromium.launch();
const page = await browser.newPage();
mkdirSync('public/icons', { recursive: true });
for (const size of [32, 180, 192, 512]) {
  const data = await page.evaluate((size) => {
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const g = /** @type {CanvasRenderingContext2D} */ (c.getContext('2d'));
    const k = size / 512;
    // Navy rounded tile with a lime glow.
    const bg = g.createLinearGradient(0, 0, 0, size);
    bg.addColorStop(0, '#27408b');
    bg.addColorStop(1, '#0e1424');
    g.fillStyle = bg;
    g.beginPath();
    g.roundRect(0, 0, size, size, 110 * k);
    g.fill();
    // The NAO envelope: white, pink flap, lime seal.
    g.fillStyle = '#fffaf0';
    g.beginPath();
    g.roundRect(96 * k, 150 * k, 320 * k, 220 * k, 28 * k);
    g.fill();
    g.fillStyle = '#ff4f9a';
    g.beginPath();
    g.moveTo(96 * k, 170 * k);
    g.lineTo(256 * k, 290 * k);
    g.lineTo(416 * k, 170 * k);
    g.lineTo(416 * k, 160 * k);
    g.quadraticCurveTo(416 * k, 150 * k, 400 * k, 150 * k);
    g.lineTo(112 * k, 150 * k);
    g.quadraticCurveTo(96 * k, 150 * k, 96 * k, 160 * k);
    g.fill();
    g.fillStyle = '#c6f432';
    g.beginPath();
    g.arc(256 * k, 290 * k, 46 * k, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#0e1424';
    g.font = `900 ${44 * k}px system-ui, sans-serif`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('N', 256 * k, 292 * k);
    return c.toDataURL('image/png').split(',')[1];
  }, size);
  writeFileSync(`public/icons/icon-${size}.png`, Buffer.from(data, 'base64'));
}
await browser.close();

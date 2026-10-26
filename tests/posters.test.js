import { describe, expect, it } from 'vitest';
import { cameraTarget, followHeight } from '../src/app/camera.js';
import { POSTER_H, WHITEBOARD_W, posterWidth } from '../src/data/inetum.js';
import { LEVELS } from '../src/data/levels/index.js';
import { BOARD_ZOOM } from '../src/gfx/boards.js';
import { lookAt, multiply, perspective, project } from '../src/gfx/mat4.js';
import { POSTER_LIST } from '../src/gfx/posters.js';

const IDS = [
  'inetum-lcp7',
  'learning-academy',
  'chronotime',
  'global-service-center',
  'sap-concur',
  'mypeopledoc',
  'swile',
  'bon-commande',
  'ordre-mission',
  'success-factors',
  'gcomp',
  'power-up',
  'power-up-tour',
  'lets-connect',
  'gen-ai',
  'charity-day',
  'summer-party',
  'cooptation',
  'espace-vip',
  'your-digital-hub',
  'my-way',
  'spark',
  'gofluent',
  'primo',
  'copil',
  'covoiturage',
  'note-de-frais',
  'inetum-et-moi',
  'adopt-tools',
  'gen-ai-hub',
  'annuaire',
  'celine-dion',
];

describe('POSTER_LIST', () => {
  it('lists the 32 poster ids exactly once', () => {
    const ids = POSTER_LIST.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect([...ids].sort()).toEqual([...IDS].sort());
  });

  it('gives every poster a title and a valid shape', () => {
    for (const p of POSTER_LIST) {
      expect(p.title.length).toBeGreaterThan(0);
      expect(['portrait', 'landscape', 'banner']).toContain(p.shape);
    }
  });

  it('uses the banner format for the two banners', () => {
    const banners = POSTER_LIST.filter((p) => p.shape === 'banner').map((p) => p.id);
    expect(banners.sort()).toEqual(['espace-vip', 'power-up-tour']);
  });
});

describe('the Directeur de Projets whiteboard', () => {
  it('keeps the « Congés » line word for word for the reader close-up', () => {
    expect(BOARD_ZOOM.projectDirector.text).toBe(
      'Congés — il faut privilégier les CP puis RS puis RE car les CP ne peuvent pas être reportés au delà du 31 Mai.',
    );
  });
});

/** PC screen, and the HUD band across its top (pixels). */
const SCREEN = { w: 1280, h: 720, hud: 62 };
const TAN = Math.tan(Math.PI / 12);
const SOLID = '#MBVHQYA-L';

/**
 * Share (0–1) of a piece of wall art seen whole on a PC, below the HUD and not hidden
 * behind the building's front, for a hero standing at (x, y).
 * @param {import('../src/data/levels/index.js').Level} level
 * @param {{x: number, y: number, w: number, h: number}} art
 * @param {number} x @param {number} y
 */
function seen(level, art, x, y) {
  const h = level.map.length;
  const w = level.map[0].length;
  const solid = (/** @type {number} */ c, /** @type {number} */ r) =>
    c >= 0 && c < w && r >= 0 && r < h && SOLID.includes(level.map[h - 1 - r][c]);
  const aspect = SCREEN.w / SCREEN.h;
  const sky = level.theme === 'rooftop' ? 4 : 0;
  const visH = followHeight(aspect, h + sky);
  const dist = visH / 2 / TAN;
  let best = 0;
  for (const facing of [1, -1]) {
    const [tx, ty] = cameraTarget(aspect, visH, { x, y, facing }, { w, h, sky });
    const eye = [tx + 0.6, ty + 1.4, dist];
    const m = multiply(
      perspective(Math.PI / 6, aspect, 0.5, 220, new Float32Array(16)),
      lookAt(eye, [tx, ty, -0.8], undefined, new Float32Array(16)),
      new Float32Array(16),
    );
    let ok = 0;
    for (let i = 0; i < 6; i++)
      for (let j = 0; j < 6; j++) {
        const px = art.x + ((i + 0.5) / 6) * art.w;
        const py = art.y + ((j + 0.5) / 6) * art.h;
        const p = project(m, px, py, -2.6);
        const sx = ((p.x + 1) / 2) * SCREEN.w;
        const sy = ((1 - p.y) / 2) * SCREEN.h;
        if (sx < 0 || sx > SCREEN.w || sy < SCREEN.hud || sy > SCREEN.h) continue;
        let hidden = false;
        for (let k = 1; k <= 10 && !hidden; k++) {
          const t = ((1.4 + 2.6) * k) / 10 / (eye[2] + 2.6);
          hidden = solid(Math.floor(px + (eye[0] - px) * t), Math.floor(py + (eye[1] - py) * t));
        }
        if (!hidden) ok++;
      }
    best = Math.max(best, ok / 36);
  }
  return best;
}

describe('wall art placement', () => {
  it('shows every poster and whiteboard whole on a PC from somewhere beneath it', () => {
    /** @type {string[]} */
    const cut = [];
    for (const level of LEVELS) {
      const h = level.map.length;
      const solid = (/** @type {number} */ c, /** @type {number} */ r) =>
        r >= 0 && r < h && SOLID.includes(level.map[h - 1 - r][c] ?? '#');
      for (const d of level.decor ?? []) {
        if (d.front || (d.type !== 'poster' && d.type !== 'whiteboard') || !d.id) continue;
        const board = d.type === 'whiteboard';
        const art = {
          x: d.x,
          y: d.y + (board ? 0.75 : 0.9),
          w: board ? WHITEBOARD_W : posterWidth(d.id),
          h: board ? WHITEBOARD_W * 0.75 : POSTER_H,
        };
        // Floors under it (up to six tiles down) and the lifts' stops.
        /** @type {[number, number][]} */
        const spots = [];
        for (let c = Math.floor(art.x); c < art.x + art.w; c++)
          for (let r = Math.floor(art.y + 0.5); r >= Math.max(1, art.y - 6); r--)
            if (solid(c, r - 1) && !solid(c, r)) spots.push([c + 0.5, r]);
        for (const l of level.lifts ?? []) {
          const lw = l.w ?? 2;
          if (l.x < art.x + art.w && l.x + lw > art.x)
            for (const y of [l.y, l.top]) spots.push([l.x + lw / 2, y]);
        }
        const view = Math.max(0, ...spots.map(([x, y]) => seen(level, art, x, y)));
        if (view < 0.97) cut.push(`${level.id} ${d.type} ${d.id} (${Math.round(view * 100)} %)`);
      }
    }
    expect(cut).toEqual([]);
  });
});

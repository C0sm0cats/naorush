import { CAST } from '../data/cast.js';

/**
 * Lists shown on the title's secondary screens: trophies, the cast, bonus stages.
 */

/** Order of the Distribution screen: heroes, bosses, then the office. */
const CAST_ORDER = [
  'kevin',
  'charline',
  'techServicesDirector',
  'regionalDirector',
  'mathis',
  'intern',
  'visio',
];

/**
 * @param {HTMLElement} list
 * @param {Array<{name: string, text: string, got: boolean}>} trophies
 */
export function renderTrophies(list, trophies) {
  list.replaceChildren(
    ...trophies.map((t) => {
      const li = document.createElement('li');
      li.className = t.got ? 'got' : '';
      const name = document.createElement('b');
      name.textContent = t.name;
      const text = document.createElement('span');
      text.textContent = t.text;
      li.append(name, text);
      return li;
    }),
  );
}

/** @param {HTMLElement} list */
export function renderCast(list) {
  list.replaceChildren(
    ...CAST_ORDER.map((id) => {
      const c = CAST[id];
      const li = document.createElement('li');
      const name = document.createElement('b');
      name.textContent = c.title ? `${c.name} · ${c.title}` : c.name;
      const bio = document.createElement('span');
      bio.textContent = c.bio ?? '';
      li.append(name, bio);
      return li;
    }),
  );
}

/**
 * @param {HTMLElement} row
 * @param {Array<{name: string}>} stages Bonus stages.
 * @param {(k: number) => void} play Called with the bonus index.
 */
export function renderBonus(row, stages, play) {
  row.replaceChildren(
    ...stages.map((l, k) => {
      const b = document.createElement('button');
      b.className = 'ghost';
      b.textContent = l.name;
      b.onclick = () => play(k);
      return b;
    }),
  );
}

/**
 * The first stretch of clear floor on a stage, where the cast can line up.
 * @param {import('../game/sim.js').Sim} sim
 * @param {(sim: import('../game/sim.js').Sim, c: number, r: number) => number} tileAt
 * @param {{SOLID: number, EMPTY: number}} TILE
 */
export function clearFloor(sim, tileAt, TILE) {
  const open = (/** @type {number} */ c) =>
    tileAt(sim, c, 2) === TILE.SOLID &&
    tileAt(sim, c, 3) === TILE.EMPTY &&
    tileAt(sim, c, 4) === TILE.EMPTY;
  for (let c = 6; c < sim.w - 8; c++) {
    let ok = true;
    for (let k = 0; k < 6 && ok; k++) ok = open(c + k);
    if (ok) return c + 0.6;
  }
  return 8.6;
}

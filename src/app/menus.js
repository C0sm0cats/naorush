import { CAST } from '../data/cast.js';
import { TIER_NAME, medalTargets, recordKey } from './medals.js';

/**
 * Lists shown on the title's secondary screens: trophies, the cast, bonus stages,
 * and the « Chapitres » stage select.
 *
 * @typedef {'kevin'|'charline'} HeroId
 * @typedef {import('./medals.js').Mode} Mode
 * @typedef {import('./medals.js').Medal} Medal
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
 * A list row the keyboard and the gamepad can stop on (up/down in menuInput), so a
 * long list scrolls without a mouse or a finger. Not in the Tab order.
 * @param {HTMLElement} li
 */
function navigable(li) {
  li.tabIndex = -1;
  li.dataset.nav = '';
}

/**
 * Menu elements in the order the eye reads them: rows top to bottom, each row left to
 * right, whatever order the markup has them in (CSS grids and `grid-row` reorder screens
 * on phones). Up/down then visits every element exactly once.
 * @template {{getBoundingClientRect: () => {top: number, left: number, height: number}}} T
 * @param {T[]} items
 * @returns {T[]}
 */
export function readingOrder(items) {
  const boxes = items.map((el, i) => {
    const r = el.getBoundingClientRect();
    return { el, i, top: r.top, left: r.left, mid: r.top + r.height / 2, h: r.height };
  });
  boxes.sort((a, b) => a.top - b.top || a.left - b.left || a.i - b.i);
  /** @type {Array<typeof boxes>} */
  const rows = [];
  for (const b of boxes) {
    const row = rows.at(-1);
    // Same row: its middle sits within the first element's height.
    if (row && Math.abs(b.mid - row[0].mid) < Math.max(4, Math.min(b.h, row[0].h) / 2)) row.push(b);
    else rows.push([b]);
  }
  return rows.flatMap((row) => row.sort((a, b) => a.left - b.left || a.i - b.i).map((b) => b.el));
}

/**
 * @param {HTMLElement} list
 * @param {Array<{name: string, text: string, got: boolean}>} trophies
 */
export function renderTrophies(list, trophies) {
  list.replaceChildren(
    ...trophies.map((t) => {
      const li = document.createElement('li');
      li.className = t.got ? 'got' : '';
      navigable(li);
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
      navigable(li);
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

// ---- Générique -----------------------------------------------------------------

/**
 * One line of the credits: `t` the title, `h` a heading, `s` a kind line under a name.
 * @typedef {[string, ('t'|'h'|'s')?]} CreditLine
 */

/** @param {HTMLElement} roll @param {CreditLine[]} lines */
export function renderCredits(roll, lines) {
  roll.replaceChildren(
    ...lines.map(([text, kind]) => {
      const n = el(
        kind === 't' ? 'h2' : kind === 'h' ? 'h3' : 'p',
        kind === 's' ? 'creditLine' : '',
        text,
      );
      return n;
    }),
  );
  roll.scrollTop = 0;
}

/** Credits roll speed (px a second) and the pause before they start rolling. */
export const ROLL_SPEED = 24;
export const ROLL_DELAY = 3;

/**
 * Rolls the credits up their scroll box, like a real end credits sequence, then stops at
 * the end. A wheel, a finger, a click or a manual scroll hands control to the player;
 * the screen closing stops it too.
 * @param {HTMLElement} box The scroll box (`#creditsRoll`).
 * @param {{reduced?: boolean, speed?: number, delay?: number,
 *   raf?: (f: (now: number) => void) => unknown}} [o] `reduced`: no motion, nothing rolls.
 * @returns {() => void} Stops the roll.
 */
export function autoRoll(box, o = {}) {
  const speed = o.speed ?? ROLL_SPEED;
  const raf = o.raf ?? requestAnimationFrame;
  const events = ['wheel', 'pointerdown', 'touchstart', 'keydown'];
  let stopped = false;
  let t = -(o.delay ?? ROLL_DELAY);
  /** @type {number | null} */
  let last = null;
  // scrollTop is rounded by the browser: the roll keeps its own fractional position.
  let pos = box.scrollTop;
  const stop = () => {
    stopped = true;
    for (const type of events) box.removeEventListener(type, stop);
  };
  if (o.reduced) return stop;
  for (const type of events) box.addEventListener(type, stop, { passive: true });
  const tick = (/** @type {number} */ now) => {
    if (stopped) return;
    if (!box.isConnected || box.closest('[hidden]')) return stop();
    // The player scrolled by hand (scrollbar, keyboard): leave it there.
    if (Math.abs(box.scrollTop - pos) > 2) return stop();
    const dt = last === null ? 0 : Math.min(0.1, Math.max(0, (now - last) / 1000));
    last = now;
    t += dt;
    if (t > 0) {
      pos = Math.min(pos + speed * dt, Math.max(0, box.scrollHeight - box.clientHeight));
      box.scrollTop = pos;
      pos = Math.abs(box.scrollTop - pos) < 1 ? pos : box.scrollTop;
      if (pos >= box.scrollHeight - box.clientHeight - 1) return stop();
    }
    raf(tick);
  };
  raf(tick);
  return stop;
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

// ---- Chapitres -----------------------------------------------------------------

/**
 * @typedef {{best?: number, medal?: Medal, secrets: number,
 *   targets: {gold: number, silver: number} | null}} ChapterHero
 * @typedef {{index: number, id: string, label: string, name: string, open: boolean,
 *   lock: string, secretTotal: number, heroes: Record<HeroId, ChapterHero>}} Chapter
 */

/** @type {HeroId[]} */
const HEROES = ['kevin', 'charline'];
/** @type {Mode[]} */
const MODES = ['normal', 'sansFilet'];

const MEDAL_HINT =
  'Or et argent au chrono, ★ sans retour au badge (hors mode détente et vitesse réduite).';
const LOCKED_HINT = 'Le mode « Sans filet » s’ouvre après le générique.';
const SANS_FILET_HINT =
  'Sans filet : 1 cœur, pas de café, pièges 15 % plus rapides, fenêtres PRIMO raccourcies. Records et médailles à part.';

/** A stopwatch time, `1:05`. @param {number} s */
const stopwatch = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
/** A time read aloud, `1 min 05 s`. @param {number} s */
const spoken = (s) => `${Math.floor(s / 60)} min ${String(Math.floor(s % 60)).padStart(2, '0')} s`;

/**
 * What the « Chapitres » screen lists in a mode: every stage, whether it can be
 * replayed (cleared once, or a bonus stage after the credits), and each hero's
 * record, medal and secrets there.
 * @param {{levels: Array<{id: string, name: string, map: string[]}>, campaign: number,
 *   progress: number, finished: boolean, bests: Record<string, number>,
 *   medals: {get: (id: string, hero: HeroId, mode?: Mode) => Medal | undefined},
 *   secretsOf: (id: string, hero: HeroId) => number, mode: Mode}} o
 *   `progress`: story stages cleared so far (the saved stage); `finished`: the
 *   envelope is signed.
 * @returns {Chapter[]}
 */
export function chapterRows(o) {
  return o.levels.map((l, i) => {
    const bonus = i >= o.campaign;
    const played = HEROES.some((h) =>
      MODES.some(
        (m) => typeof o.bests[recordKey(l.id, h, m)] === 'number' || o.medals.get(l.id, h, m),
      ),
    );
    const open = played || o.finished || (!bonus && i < o.progress);
    const hero = (/** @type {HeroId} */ h) => {
      const best = o.bests[recordKey(l.id, h, o.mode)];
      return {
        best: typeof best === 'number' ? best : undefined,
        medal: o.medals.get(l.id, h, o.mode),
        secrets: o.secretsOf(l.id, h),
        targets: medalTargets(l.id, h),
      };
    };
    return {
      index: i,
      id: l.id,
      label: bonus ? 'Bonus' : `Étape ${i + 1}`,
      name: l.name.replace(/^Bonus\s*:\s*/, ''),
      open,
      lock: bonus ? 'S’ouvre une fois l’enveloppe signée.' : `Termine l’étape ${i} pour l’ouvrir.`,
      secretTotal: l.map.join('').split('*').length - 1,
      heroes: { kevin: hero('kevin'), charline: hero('charline') },
    };
  });
}

/**
 * The next medal to aim for: silver first, then gold.
 * @param {ChapterHero} h @returns {string}
 */
function nextMedal(h) {
  if (!h.targets || h.medal?.tier === 'gold') return '';
  return h.medal?.tier === 'silver'
    ? `Or sous ${stopwatch(h.targets.gold)}`
    : `Argent sous ${stopwatch(h.targets.silver)}`;
}

/**
 * @param {string} tag @param {string} className @param {string} [text]
 * @returns {HTMLElement}
 */
function el(tag, className, text = '') {
  const n = document.createElement(tag);
  if (className) n.className = className;
  n.textContent = text;
  return n;
}

/**
 * One hero's play button on a chapter: medal, record, secrets, next medal.
 * @param {Chapter} c @param {HeroId} id @param {() => void} play
 */
function heroButton(c, id, play) {
  const h = c.heroes[id];
  const name = CAST[id].name;
  const b = el('button', `chapter-hero ${id}`);
  b.dataset.hero = id;
  b.onclick = play;
  const top = el('span', 'chapter-who');
  top.append(el('b', '', name));
  if (h.medal) {
    const chip = el('i', `medal-chip ${h.medal.tier}`);
    chip.setAttribute('aria-hidden', 'true');
    top.append(chip);
    if (h.medal.star) {
      const star = el('i', 'medal-star', '★');
      star.setAttribute('aria-hidden', 'true');
      top.append(star);
    }
  }
  const secrets = c.secretTotal ? ` · secrets ${h.secrets}/${c.secretTotal}` : '';
  const line = h.best === undefined ? 'À faire' : `${stopwatch(h.best)}${secrets}`;
  const next = nextMedal(h);
  b.append(top, el('span', 'chapter-best', line));
  if (next) b.append(el('small', 'chapter-next', next));
  // A plain sentence for screen readers, instead of glyphs and stopwatch times.
  const said = [`${c.name} avec ${name}.`];
  if (h.medal)
    said.push(
      `Médaille : ${TIER_NAME[h.medal.tier]}${h.medal.star ? ', sans retour au badge' : ''}.`,
    );
  said.push(h.best === undefined ? 'Pas encore terminée.' : `Record : ${spoken(h.best)}.`);
  if (c.secretTotal) said.push(`Secrets : ${h.secrets} sur ${c.secretTotal}.`);
  if (next) said.push(`${next.replace(/(\d+):(\d+)/, (_, m, s) => `${m} min ${s} s`)}.`);
  b.setAttribute('aria-label', said.join(' '));
  return b;
}

/**
 * @param {Chapter} c @param {Mode} mode
 * @param {(index: number, hero: HeroId, mode: Mode) => void} play
 */
function chapterItem(c, mode, play) {
  const li = el('li', c.open ? 'chapter' : 'chapter locked');
  const title = el('p', 'chapter-name');
  title.append(el('small', '', c.label), document.createTextNode(` ${c.open ? c.name : '???'}`));
  li.append(title);
  if (!c.open) li.append(el('p', 'chapter-lock', c.lock));
  else li.append(...HEROES.map((h) => heroButton(c, h, () => play(c.index, h, mode))));
  return li;
}

/**
 * Fills the « Chapitres » screen: the mode switch once « Sans filet » is unlocked,
 * then every stage with a play button per hero (locked stages say how to open them).
 * @param {{modes: HTMLElement, list: HTMLElement}} host
 * @param {(mode: Mode) => Chapter[]} rowsFor
 * @param {{mode?: Mode, sansFilet: boolean, play: (index: number, hero: HeroId, mode: Mode) => void,
 *   onMode?: (mode: Mode) => void}} o
 *   `sansFilet`: the mode is unlocked; `onMode` hears about a switch (to remember it).
 */
export function renderChapters(host, rowsFor, o) {
  /** @type {Mode} */
  let mode = o.sansFilet && o.mode === 'sansFilet' ? 'sansFilet' : 'normal';
  const hint = el('p', 'chapter-hint');
  const fill = () => {
    hint.textContent =
      mode === 'sansFilet'
        ? SANS_FILET_HINT
        : o.sansFilet
          ? MEDAL_HINT
          : `${MEDAL_HINT} ${LOCKED_HINT}`;
    host.list.dataset.mode = mode;
    host.list.replaceChildren(...rowsFor(mode).map((c) => chapterItem(c, mode, o.play)));
  };
  if (!o.sansFilet) host.modes.replaceChildren(hint);
  else {
    const group = el('div', 'chapter-modes');
    group.setAttribute('role', 'radiogroup');
    group.setAttribute('aria-label', 'Mode de jeu');
    const buttons = MODES.map((m) => {
      const b = el('button', 'ghost small', m === 'normal' ? 'Normal' : 'Sans filet');
      b.dataset.mode = m;
      b.setAttribute('role', 'radio');
      b.onclick = () => {
        if (mode === m) return;
        mode = m;
        mark();
        fill();
        o.onMode?.(m);
      };
      return b;
    });
    // A radio group: only the chosen mode is in the Tab order, left/right switch modes
    // (once per press, a held arrow does not flicker between the two).
    const mark = () => {
      for (const b of buttons) {
        b.setAttribute('aria-checked', String(b.dataset.mode === mode));
        b.tabIndex = b.dataset.mode === mode ? 0 : -1;
      }
    };
    group.addEventListener('keydown', (ev) => {
      const e = /** @type {KeyboardEvent} */ (ev);
      if ((e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') || e.repeat) return;
      e.preventDefault();
      const other = buttons[1 - MODES.indexOf(mode)];
      other.click();
      other.focus();
    });
    mark();
    group.append(...buttons);
    host.modes.replaceChildren(group, hint);
  }
  fill();
}

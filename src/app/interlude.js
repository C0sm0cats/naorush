import { INTERLUDES } from '../data/barks.js';
import { CAST } from '../data/cast.js';
import '../interlude.css';

/**
 * NA-2: the short interlude between two story stages. The route of the week
 * (parking to the NAO room), the clock running from one stage's time to the
 * next, the countdown to Thursday's NAO, and one line from the hero. Any key,
 * a tap or the button skips it; it ends by itself after a few seconds.
 *
 * @typedef {{id: string, subtitle: string}} StageRef
 */

const DAYS = /** @type {const} */ (['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi']);
/** The NAO open on Thursday at 9 h 00 (minutes since Monday 0 h 00). */
export const NAO_AT = 3 * 1440 + 9 * 60;

/** The story's stops, in order, and where the NAO open. */
export const ROUTE = [
  { id: 'parking', label: 'Parking' },
  { id: 'lcp7', label: 'LCP7' },
  { id: 'ts', label: 'T&S' },
  { id: 'copil', label: 'COPIL' },
  { id: 'rooftop', label: 'Toit' },
  { id: 'nao', label: 'NAO' },
];

/** How long the clock runs, then the least the card holds (seconds). */
export const RUN = 2.4;
export const HOLD = 2.2;
/** Reading pace: a screen reader's speech, slower than the eye (seconds per word). */
const PER_WORD = 0.4;

/**
 * How long the card stays up once the clock has stopped: time to read (or hear)
 * everything it says, never less than HOLD. @param {string} text
 */
export function readingTime(text) {
  const words = text.split(/\s+/).filter((w) => /[\p{L}\d]/u.test(w)).length;
  return Math.max(HOLD, 1 + words * PER_WORD);
}
/** The clock ticks this many times on its way (more often in the quick middle). */
export const TICKS = 18;

/**
 * The time a stage takes place, from its subtitle (« … · mardi, 14 h 03 »), in
 * minutes since Monday 0 h 00; null when the subtitle has no time.
 * @param {string} subtitle
 */
export function stageTime(subtitle) {
  const m = /(lundi|mardi|mercredi|jeudi|vendredi),? (\d{1,2}) h (\d{2})/.exec(subtitle);
  if (!m) return null;
  return DAYS.indexOf(/** @type {(typeof DAYS)[number]} */ (m[1])) * 1440 + +m[2] * 60 + +m[3];
}

/** « mardi, 14 h 03 ». @param {number} t Minutes since Monday 0 h 00. */
export function clockText(t) {
  const m = Math.round(t);
  const day = DAYS[Math.min(DAYS.length - 1, Math.floor(m / 1440))];
  const h = Math.floor((m % 1440) / 60);
  return `${day}, ${h} h ${String(m % 60).padStart(2, '0')}`;
}

/** « 2 j 18 h 57 min » until the NAO open; « C’est l’heure ! » once there. @param {number} t */
export function countdownText(t) {
  const left = Math.max(0, Math.round(NAO_AT - t));
  if (left === 0) return 'C’est l’heure !';
  const d = Math.floor(left / 1440);
  const h = Math.floor((left % 1440) / 60);
  const min = left % 60;
  return [d && `${d} j`, (d || h) && `${h} h`, `${String(min).padStart(d || h ? 2 : 1, '0')} min`]
    .filter(Boolean)
    .join(' ');
}

/**
 * Eased minutes for the running clock: slow start, quick middle, a soft stop on the
 * new stage's minute. @param {number} from @param {number} to @param {number} k 0 to 1
 */
export function clockAt(from, to, k) {
  const c = Math.max(0, Math.min(1, k));
  return from + (to - from) * c * c * (3 - 2 * c);
}

/**
 * Everything the interlude shows between two stages, or null when there is no
 * interlude for them (bonus stages, unknown times, going backwards).
 * @param {StageRef} from @param {StageRef} to @param {'kevin'|'charline'} hero
 */
export function interludeFor(from, to, hero) {
  const a = stageTime(from.subtitle);
  const b = stageTime(to.subtitle);
  const i = ROUTE.findIndex((r) => r.id === from.id);
  const j = ROUTE.findIndex((r) => r.id === to.id);
  const line = INTERLUDES[to.id]?.[hero];
  if (a === null || b === null || b < a || i < 0 || j !== i + 1 || !line) return null;
  return { from: a, to: b, stop: i, line, who: CAST[hero].name };
}

const SVG = 'http://www.w3.org/2000/svg';
/** Route drawing: stops from x 40 to 560 on a 600 × 92 board. */
const stopX = (/** @type {number} */ i) => 40 + (520 * i) / (ROUTE.length - 1);

/** @param {string} tag @param {Record<string, string | number>} attrs @param {Element} [parent] */
function svg(tag, attrs, parent) {
  const el = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  parent?.append(el);
  return el;
}

/** @param {string} tag @param {string} cls @param {Element} parent */
function html(tag, cls, parent) {
  const el = document.createElement(tag);
  el.className = cls;
  parent.append(el);
  return el;
}

export class Interlude {
  constructor() {
    this.active = false;
    /** @type {() => void} */
    this.done = () => {};
    /**
     * Sound hook (main.js: `(type, opts) => audio.sfx(type, opts)`): 'clockTick' as the
     * clock runs, higher as it goes, then 'arrive' when the dot reaches the next stop.
     * @type {(type: string, opts?: { pitch?: number }) => void}
     */
    this.onSound = () => {};
    this.raf = 0;
    this.el = document.createElement('section');
    this.el.className = 'interlude';
    this.el.id = 'interlude';
    this.el.hidden = true;
    this.el.setAttribute('role', 'dialog');
    this.el.setAttribute('aria-label', 'En route vers l’étape suivante');
    const card = html('div', 'il-card', this.el);
    this.clock = html('p', 'il-clock', card);
    this.clock.setAttribute('aria-hidden', 'true');
    this.count = html('p', 'il-count', card);
    this.count.setAttribute('aria-hidden', 'true');
    this.map = svg('svg', { viewBox: '0 0 600 92', class: 'il-map', 'aria-hidden': 'true' }, card);
    svg(
      'line',
      { x1: stopX(0), y1: 40, x2: stopX(ROUTE.length - 1), y2: 40, class: 'il-road' },
      this.map,
    );
    this.trail = svg(
      'line',
      { x1: stopX(0), y1: 40, x2: stopX(0), y2: 40, class: 'il-trail' },
      this.map,
    );
    /** @type {Element[]} */
    this.stops = ROUTE.map((r, i) => {
      const g = svg('g', { class: `il-stop${r.id === 'nao' ? ' il-nao' : ''}` }, this.map);
      svg('circle', { cx: stopX(i), cy: 40, r: r.id === 'nao' ? 11 : 8 }, g);
      svg('text', { x: stopX(i), y: 78, 'text-anchor': 'middle' }, g).textContent = r.label;
      return g;
    });
    this.dot = svg('circle', { cx: stopX(0), cy: 40, r: 6, class: 'il-dot' }, this.map);
    const said = html('p', 'il-line', card);
    this.who = html('b', 'il-who', said);
    this.text = html('span', '', said);
    this.skipBtn = /** @type {HTMLButtonElement} */ (html('button', 'il-skip', card));
    this.skipBtn.id = 'interludeSkip';
    this.skipBtn.textContent = 'Passer ▶';
    // For screen readers, the whole card at once: a live region that is always there
    // (outside the card, which is hidden between stages), filled once the card is up.
    this.live = html('p', 'sr-only', document.body);
    this.live.setAttribute('aria-live', 'polite');
    this.say = 0;
    this.el.addEventListener('pointerdown', (e) => {
      if (e.target !== this.skipBtn) this.skip();
    });
    this.skipBtn.addEventListener('click', () => this.skip());
    document.body.append(this.el);
  }

  /**
   * Plays the interlude from one stage to the next; resolves when it ends or is
   * skipped, at once when there is none for these stages.
   * @param {StageRef} from @param {StageRef} to @param {'kevin'|'charline'} hero
   * @param {boolean} [still] Reduced motion: the final state straight away.
   * @returns {Promise<void>}
   */
  play(from, to, hero, still = false) {
    const it = interludeFor(from, to, hero);
    if (!it) return Promise.resolve();
    this.el.dataset.hero = hero;
    this.who.textContent = `${it.who} : `;
    this.text.textContent = it.line;
    const said = `${clockText(it.to)}. Avant les NAO : ${countdownText(it.to)}. ${it.who} : ${it.line}`;
    this.live.textContent = '';
    clearTimeout(this.say);
    this.say = window.setTimeout(() => (this.live.textContent = said), 150);
    const hold = readingTime(said);
    this.stops.forEach((g, i) => {
      g.classList.toggle('done', i <= it.stop);
      g.classList.toggle('next', i === it.stop + 1);
    });
    this.el.hidden = false;
    this.active = true;
    let ticks = still ? TICKS : 0;
    let arrived = false;
    /** @param {number} k */
    const draw = (k) => {
      // A tick each time the eased clock passes a step, a ding on arrival.
      const done = Math.floor(clockAt(0, 1, k) * TICKS);
      if (done > ticks && done < TICKS) this.onSound('clockTick', { pitch: 0.9 + 0.25 * k });
      ticks = Math.max(ticks, done);
      if (k >= 1 && !arrived) {
        arrived = true;
        this.onSound('arrive');
      }
      const t = clockAt(it.from, it.to, k);
      this.clock.textContent = clockText(t);
      this.count.textContent = `Avant les NAO : ${countdownText(t)}`;
      const x = stopX(it.stop) + (stopX(it.stop + 1) - stopX(it.stop)) * clockAt(0, 1, k);
      this.dot.setAttribute('cx', String(x));
      this.trail.setAttribute('x2', String(x));
    };
    return new Promise((resolve) => {
      this.done = resolve;
      // Time on screen, frame by frame: a tab in the background does not count.
      let s = 0;
      let last = performance.now();
      const tick = (/** @type {number} */ now = last) => {
        s += Math.min(0.1, Math.max(0, (now - last) / 1000));
        last = now;
        draw(still ? 1 : s / RUN);
        if (s >= RUN + hold) return this.skip();
        this.raf = requestAnimationFrame(tick);
      };
      tick();
    });
  }

  /** Ends the interlude now (a key, a tap, the button, or the time is up). */
  skip() {
    if (!this.active) return;
    this.active = false;
    cancelAnimationFrame(this.raf);
    clearTimeout(this.say);
    this.live.textContent = '';
    this.el.hidden = true;
    this.done();
  }
}

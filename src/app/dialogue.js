import { BARKS } from '../data/barks.js';
import { CAST } from '../data/cast.js';
import { project } from '../gfx/mat4.js';

/**
 * Story dialogue (typewriter box at the bottom) and speech bubbles above heads.
 *
 * @typedef {import('../data/levels/index.js').Line} Line
 */

/** @param {string} id */
const $ = (id) => /** @type {HTMLElement} */ (document.getElementById(id));

export class Dialogue {
  /**
   * @param {import('./audio.js').Audio} audio
   * @param {(who: Line['who']) => string} castId CAST id speaking a line ('' for hints and narration).
   */
  constructor(audio, castId) {
    this.audio = audio;
    this.castId = castId;
    /** @type {Line[]} */
    this.lines = [];
    this.i = 0;
    /** Characters revealed so far. */
    this.shown = 0;
    /** @type {() => void} */
    this.done = () => {};
  }

  /** @param {Line[]} lines @param {() => void} done @returns {boolean} Whether there is anything to say. */
  start(lines, done) {
    Object.assign(this, { lines, i: 0, shown: 0, done });
    if (!lines.length) return false;
    this.speaker();
    return true;
  }

  speaker() {
    const line = this.lines[this.i];
    const id = this.castId(line.who);
    const who = id ? CAST[id] : null;
    const name = who?.name ?? (line.who === 'narrator' ? 'NAO Rush' : 'Astuce');
    $('talkName').textContent = name;
    $('talkTitle').textContent = who?.title ?? '';
    $('talkWho').dataset.who = id || line.who;
    $('talkText').textContent = '';
    // Screen readers get the whole line at once, not the typewriter.
    $('talkLive').textContent = `${name} : ${line.text}`;
  }

  /** Completes the current line, or moves to the next one. */
  advance() {
    const line = this.lines[this.i];
    if (!line) return;
    if (this.shown < line.text.length) {
      this.shown = line.text.length;
      $('talkText').textContent = line.text;
      return;
    }
    this.audio.sfx('select');
    if (++this.i >= this.lines.length) {
      this.lines = [];
      return this.done();
    }
    this.shown = 0;
    this.speaker();
  }

  /** Typewriter effect. @param {number} dt */
  update(dt) {
    const line = this.lines[this.i];
    if (!line) return;
    const before = Math.floor(this.shown);
    this.shown = Math.min(line.text.length, this.shown + dt * 55);
    const now = Math.floor(this.shown);
    if (now !== before) {
      $('talkText').textContent = line.text.slice(0, now);
      if (now % 3 === 0 && line.text[now - 1] !== ' ')
        this.audio.sfx('talk', { who: this.castId(line.who) || line.who });
    }
  }
}

/** World point to CSS pixels. @param {Float32Array} vp @param {number} x @param {number} y */
function toScreen(vp, x, y) {
  const p = project(vp, x, y, 0);
  return [(p.x * 0.5 + 0.5) * innerWidth, (0.5 - p.y * 0.5) * innerHeight];
}

/**
 * Deals a moment's lines in shuffled rounds: every line comes up once per round,
 * and a new round never opens with the line that closed the previous one.
 */
export class ShuffleBag {
  /** @param {() => number} [random] */
  constructor(random = Math.random) {
    this.random = random;
    /** Indices still to deal, per key. @type {Map<string, number[]>} */
    this.bags = new Map();
    /** Last index dealt, per key. @type {Map<string, number>} */
    this.last = new Map();
  }

  /** @param {string} key @param {number} n How many lines there are. @returns {number} */
  next(key, n) {
    if (n <= 1) return 0;
    let bag = this.bags.get(key);
    if (!bag?.length || bag.some((i) => i >= n)) {
      bag = Array.from({ length: n }, (_, i) => i);
      for (let i = n - 1; i > 0; i--) {
        const j = Math.floor(this.random() * (i + 1));
        [bag[i], bag[j]] = [bag[j], bag[i]];
      }
      // Dealt from the end: keep the previous line away from the first draw.
      if (bag[n - 1] === this.last.get(key)) [bag[0], bag[n - 1]] = [bag[n - 1], bag[0]];
      this.bags.set(key, bag);
    }
    const pick = /** @type {number} */ (bag.pop());
    this.last.set(key, pick);
    return pick;
  }
}

/** A short line in a bubble above a character's head. */
export class Bubbles {
  constructor() {
    this.el = $('bark');
    this.text = '';
    this.who = '';
    this.time = 0;
    /** Last time each speaker said each moment. @type {Record<string, number>} */
    this.last = {};
    this.bag = new ShuffleBag();
  }

  /**
   * Picks a line for a moment from its shuffle bag; each moment waits a while before repeating.
   * @param {string} who CAST id @param {string} moment @param {boolean} [force]
   */
  say(who, moment, force = false) {
    const lines = BARKS[who]?.[moment];
    if (!lines) return;
    const key = `${who}:${moment}`;
    const now = performance.now() / 1000;
    if (!force && (now - (this.last[key] ?? -99) < 8 || this.time > 0.4)) return;
    this.last[key] = now;
    this.line(who, lines[this.bag.next(key, lines.length)]);
  }

  /** @param {string} who @param {string} text */
  line(who, text) {
    Object.assign(this, { text, who, time: 2.6 });
  }

  clear() {
    this.time = 0;
  }

  /**
   * @param {number} dt
   * @param {Float32Array} vp Camera view-projection.
   * @param {(who: string) => number[] | null} anchor World point above the speaker's head.
   * @param {boolean} visible
   */
  update(dt, vp, anchor, visible) {
    const at = this.time > 0 && visible ? anchor(this.who) : null;
    if (!at) {
      this.el.classList.remove('show');
      return;
    }
    this.time -= dt;
    const [sx, sy] = toScreen(vp, at[0], at[1]);
    if (this.el.textContent !== this.text) this.el.textContent = this.text;
    this.el.dataset.who = this.who;
    this.el.style.transform = `translate(${Math.round(sx)}px, ${Math.round(sy)}px) translate(-50%, -100%)`;
    this.el.classList.toggle('show', this.time > 0.15);
  }
}

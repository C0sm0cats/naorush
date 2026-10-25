import { BARKS, STAGE_BARKS } from '../data/barks.js';
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

  /** Forgets every round: the next draws start fresh bags (a new stage). */
  reset() {
    this.bags.clear();
    this.last.clear();
  }
}

/**
 * Picks the bubble lines of a stage. The stage's own lines come first, then the
 * shared ones, and only once both are used up does a line come back: nothing
 * repeats within a stage until every line of that moment has been said.
 */
export class BarkDeck {
  /** @param {() => number} [random] */
  constructor(random = Math.random) {
    this.bag = new ShuffleBag(random);
    /** The stage's own lines. @type {Record<string, Record<string, string[]>>} */
    this.local = {};
    /** Lines dealt this stage, per speaker and moment. @type {Map<string, number>} */
    this.used = new Map();
  }

  /** A new stage (or a restart): fresh bags. @param {Record<string, Record<string, string[]>>} [local] */
  stage(local = {}) {
    this.bag.reset();
    this.local = local;
    this.used.clear();
  }

  /** @param {string} who @param {string} moment @returns {string | undefined} */
  next(who, moment) {
    const local = this.local[who]?.[moment] ?? [];
    const shared = BARKS[who]?.[moment] ?? [];
    const key = `${who}:${moment}`;
    const used = this.used.get(key) ?? 0;
    this.used.set(key, used + 1);
    if (used < local.length) return local[this.bag.next(`${key}:stage`, local.length)];
    if (used < local.length + shared.length) return shared[this.bag.next(key, shared.length)];
    const all = [...local, ...shared];
    return all[this.bag.next(`${key}:all`, all.length)];
  }
}

/**
 * The column of the checkpoint just before a stage's set piece: the last 'C'
 * left of `at`, at most 30 tiles before it. @param {string[]} map @param {number} at
 * @returns {number | null} Centre of that checkpoint (as in the checkpoint event).
 */
export function teaserCheckpoint(map, at) {
  let best = null;
  for (const row of map)
    for (let x = row.indexOf('C'); x >= 0; x = row.indexOf('C', x + 1))
      if (x + 0.5 < at && at - x <= 30 && (best === null || x + 0.5 > best)) best = x + 0.5;
  return best;
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
    this.deck = new BarkDeck();
    /** Lines waiting for the current bubble to fade. @type {Array<[string, string]>} */
    this.queue = [];
    /** The set-piece teaser: where it plays, per-hero lines, and whether it has. */
    this.teaserX = /** @type {number | null} */ (null);
    /** @type {Record<string, string[]>} */
    this.teaserLines = {};
    this.teased = false;
    /** Called when a queued line comes up (for its sound). @type {(who: string) => void} */
    this.onLine = () => {};
  }

  /**
   * A new stage, or a restart: fresh shuffle bags, the stage's own lines, its teaser.
   * @param {{id: string, map: string[]}} level
   */
  stage(level) {
    const own = STAGE_BARKS[level.id];
    this.deck.stage(own?.lines);
    this.teaserX = own?.teaser ? teaserCheckpoint(level.map, own.teaser.at) : null;
    this.teaserLines = own?.teaser?.lines ?? {};
    this.teased = false;
    this.last = {};
    this.clear();
  }

  /**
   * Badging at the checkpoint before the set piece: two bubbles tease what comes next.
   * @param {string} who The hero's CAST id. @param {number} x The checkpoint's centre.
   * @returns {boolean} Whether the teaser plays (instead of the usual checkpoint line).
   */
  teaser(who, x) {
    const lines = this.teaserLines[who];
    if (this.teased || this.teaserX === null || Math.abs(x - this.teaserX) > 0.6 || !lines)
      return false;
    this.teased = true;
    this.line(who, lines[0]);
    this.queue = lines.slice(1).map((text) => [who, text]);
    return true;
  }

  /**
   * Picks a line for a moment, never repeating within a stage while fresh lines remain;
   * each moment waits a while before speaking again.
   * @param {string} who CAST id @param {string} moment @param {boolean} [force]
   */
  say(who, moment, force = false) {
    if (!BARKS[who]?.[moment] && !this.deck.local[who]?.[moment]) return;
    const key = `${who}:${moment}`;
    const now = performance.now() / 1000;
    if (!force && (now - (this.last[key] ?? -99) < 8 || this.time > 0.4 || this.queue.length))
      return;
    this.last[key] = now;
    this.queue = [];
    this.line(who, this.deck.next(who, moment) ?? '');
  }

  /** Longer lines stay up longer. @param {string} who @param {string} text */
  line(who, text) {
    Object.assign(this, { text, who, time: Math.max(2.6, 1.2 + text.length * 0.05) });
  }

  clear() {
    this.time = 0;
    this.queue = [];
  }

  /**
   * @param {number} dt
   * @param {Float32Array} vp Camera view-projection.
   * @param {(who: string) => number[] | null} anchor World point above the speaker's head.
   * @param {boolean} visible
   */
  update(dt, vp, anchor, visible) {
    if (this.time <= 0 && this.queue.length && visible) {
      const [who, text] = /** @type {[string, string]} */ (this.queue.shift());
      this.line(who, text);
      this.onLine(who);
    }
    const at = this.time > 0 && visible ? anchor(this.who) : null;
    if (!at) {
      this.el.classList.remove('show');
      return;
    }
    this.time -= dt;
    const [sx, sy] = toScreen(vp, at[0], at[1]);
    if (this.el.textContent !== this.text) this.el.textContent = this.text;
    this.el.dataset.who = this.who;
    // Kept whole on screen: the bubble slides along the edge, its tail still points at the speaker.
    const margin = 8;
    const half = this.el.offsetWidth / 2;
    const x = Math.max(half + margin, Math.min(innerWidth - half - margin, sx));
    const y = Math.max(this.el.offsetHeight + margin, sy);
    const tail = Math.max(14 - half, Math.min(half - 14, sx - x));
    this.el.style.setProperty('--tail', `${Math.round(tail)}px`);
    this.el.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px) translate(-50%, -100%)`;
    this.el.classList.toggle('show', this.time > 0.15);
  }
}

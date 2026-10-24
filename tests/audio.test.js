import { readFileSync, readdirSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AMBIENCES,
  Audio,
  FLOORS,
  SFX_TYPES,
  STAGES,
  TRACKS,
  VOICE_IDS,
  eventSfx,
  stageBed,
  stageFloor,
  stageTrack,
  trackInfo,
} from '../src/app/audio.js';
import { position } from '../src/app/audio/scheduler.js';
import { BARS, SONGS, barsFor } from '../src/app/audio/tracks/index.js';
import { chord, degreeOf } from '../src/app/audio/tracks/theory.js';

/**
 * Every event type the game can emit: string literals in the first argument after `s`
 * (not the ones it is compared with, as in `t.variant === 'cable' ? 'cableZap' : …`).
 */
function emittedEvents() {
  const dir = new URL('../src/game/', import.meta.url);
  /** @type {Set<string>} */
  const types = new Set();
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.js'))) {
    const src = readFileSync(new URL(file, dir), 'utf8');
    for (const m of src.matchAll(/\bemit\(\s*s\s*,/g)) {
      let depth = 0;
      let i = /** @type {number} */ (m.index) + m[0].length;
      const start = i;
      for (; i < src.length; i++) {
        const c = src[i];
        if (c === '(' || c === '[' || c === '{') depth++;
        else if (c === ')' || c === ']' || c === '}') depth--;
        else if (c === ',' && depth === 0) break;
      }
      for (const lit of src.slice(start, i).matchAll(/(?<![=!]==\s*)'([a-zA-Z]+)'/g))
        types.add(lit[1]);
    }
  }
  return types;
}

/**
 * A tiny WebAudio stand-in: enough of the API for the audio engine to run, and strict
 * where real browsers throw (non-finite values, exponential ramps to zero).
 */
class Param {
  /** @param {number} v */
  constructor(v = 0) {
    this.value = v;
  }
  /** @param {number} v @param {number} t */
  check(v, t) {
    if (!Number.isFinite(v) || !Number.isFinite(t) || t < 0) throw new RangeError(`bad ${v}@${t}`);
    return this;
  }
  /** @param {number} v @param {number} t */
  setValueAtTime(v, t) {
    this.value = v;
    return this.check(v, t);
  }
  /** @param {number} v @param {number} t */
  linearRampToValueAtTime(v, t) {
    this.value = v;
    return this.check(v, t);
  }
  /** @param {number} v @param {number} t */
  exponentialRampToValueAtTime(v, t) {
    if (!(v > 0)) throw new RangeError('exponential ramp to a non-positive value');
    this.value = v;
    return this.check(v, t);
  }
  /** @param {number} v @param {number} t @param {number} tc */
  setTargetAtTime(v, t, tc) {
    this.last = { v, t, tc };
    return this.check(v, t);
  }
  cancelScheduledValues() {
    return this;
  }
}

/** @type {{ nodes: number, oscillators: number[], modulators: number[], starts: number[], ctx: any }} */
const stats = { nodes: 0, oscillators: [], modulators: [], starts: [], ctx: null };

class Node {
  constructor() {
    stats.nodes++;
    this.gain = new Param(1);
    this.frequency = new Param(440);
    this.detune = new Param(0);
    this.Q = new Param(1);
    this.pan = new Param(0);
    this.delayTime = new Param(0);
    this.threshold = new Param(0);
    this.knee = new Param(0);
    this.ratio = new Param(1);
    this.attack = new Param(0);
    this.release = new Param(0);
    this.type = '';
    /** @type {(() => void) | null} */
    this.onended = null;
    /** @type {any} */
    this.out = null;
  }
  /** @param {any} n */
  connect(n) {
    this.out = n;
    return n;
  }
  disconnect() {}
  start(t = 0) {
    if (!Number.isFinite(t)) throw new RangeError('bad start');
  }
  stop(t = 0) {
    if (!Number.isFinite(t)) throw new RangeError('bad stop');
  }
}
class Osc extends Node {
  /** @override @param {number} t */
  start(t = 0) {
    super.start(t);
    // A modulator (vibrato, FM, chorus) feeds an AudioParam, not the mix: not a note.
    let n = this.out;
    for (let hops = 0; n && !(n instanceof Param) && hops < 3; hops++) n = n.out;
    if (n instanceof Param) stats.modulators.push(this.frequency.value);
    else stats.oscillators.push(this.frequency.value);
    stats.starts.push(t);
  }
  /** @param {any} wave */
  setPeriodicWave(wave) {
    if (!wave) throw new TypeError('no wave');
  }
}

class FakeContext {
  constructor() {
    this.currentTime = 0;
    this.sampleRate = 8000;
    this.state = 'running';
    this.destination = new Node();
    stats.ctx = this;
  }
  createGain() {
    return new Node();
  }
  createOscillator() {
    return new Osc();
  }
  createBiquadFilter() {
    return new Node();
  }
  createBufferSource() {
    return new Node();
  }
  createStereoPanner() {
    return new Node();
  }
  createDynamicsCompressor() {
    return new Node();
  }
  createDelay() {
    return new Node();
  }
  createConvolver() {
    return Object.assign(new Node(), { buffer: null });
  }
  /** @param {Float32Array} real @param {Float32Array} imag */
  createPeriodicWave(real, imag) {
    if (real.length !== imag.length) throw new RangeError('wave lengths differ');
    return { real };
  }
  /** @param {number} _c @param {number} len @param {number} sr */
  createBuffer(_c, len, sr) {
    const data = new Float32Array(len);
    return { duration: len / sr, getChannelData: () => data };
  }
  resume() {
    return Promise.resolve();
  }
  suspend() {
    return Promise.resolve();
  }
}

/** Advances the fake clock and timers by `secs`, in scheduler ticks. */
const advance = (/** @type {number} */ secs) => {
  for (let t = 0; t < secs; t += 0.025) {
    stats.ctx.currentTime += 0.025;
    vi.advanceTimersByTime(25);
  }
};

/** @returns {Audio} an unlocked engine on the fake context */
const engine = () => {
  const a = new Audio();
  a.unlock();
  return a;
};

beforeEach(() => {
  vi.useFakeTimers();
  /** @type {Record<string, string>} */
  const store = {};
  Object.assign(globalThis, {
    AudioContext: FakeContext,
    localStorage: {
      getItem: (/** @type {string} */ k) => store[k] ?? null,
      setItem: (/** @type {string} */ k, /** @type {string} */ v) => (store[k] = v),
    },
  });
  stats.nodes = 0;
  stats.oscillators = [];
  stats.modulators = [];
  stats.starts = [];
});
afterEach(() => {
  vi.useRealTimers();
  delete (/** @type {any} */ (globalThis).AudioContext);
});

describe('audio engine', () => {
  it('has a track for every stage, with distinct themes for the bonus stages', () => {
    for (const id of STAGES) expect(TRACKS).toContain(stageTrack({ id }));
    expect(stageTrack({ id: 'pause', music: 'copil' })).toBe('cafe');
    expect(stageTrack({ id: 'seminaire', music: 'copil' })).toBe('seminar');
    expect(stageTrack({ id: 'intercontrat', music: 'office' })).toBe('intercontrat');
    // Unknown stages fall back to their own data, or to silence.
    expect(stageTrack({ id: 'new-stage', music: 'rooftop' })).toBe('rooftop');
    expect(stageTrack({ id: 'new-stage', music: 'nope' })).toBeNull();
    expect(stageBed({ id: 'pause', theme: 'office' })).toBe('cafe');
    expect(stageBed({ id: 'new-stage', theme: 'datacenter' })).toBe('datacenter');
    for (const id of STAGES) expect(AMBIENCES).toContain(stageBed({ id }));
  });

  it('plays every track through a full loop at full intensity with sane notes', () => {
    for (const name of TRACKS) {
      const a = engine();
      a.intensity(1);
      stats.oscillators = [];
      a.music(name);
      const { seconds, bpm } = trackInfo(name);
      expect(bpm).toBeGreaterThan(60);
      advance(seconds + 0.5);
      expect(stats.oscillators.length, name).toBeGreaterThan(10);
      for (const f of stats.oscillators) {
        expect(f, name).toBeGreaterThan(20);
        expect(f, name).toBeLessThan(12000);
      }
      for (const f of stats.modulators) {
        expect(f, name).toBeGreaterThan(0);
        expect(f, name).toBeLessThan(12000);
      }
      a.music(null);
    }
  });

  it('plays every sound effect without errors', () => {
    const a = engine();
    for (const type of SFX_TYPES) {
      const before = stats.nodes;
      a.sfx(type);
      expect(stats.nodes, type).toBeGreaterThan(before);
    }
    // Unknown names and prototype keys are ignored.
    const before = stats.nodes;
    a.sfx('nope');
    a.sfx('constructor');
    expect(stats.nodes).toBe(before);
  });

  it('builds every ambient bed and the stage hook switches music and bed together', () => {
    const a = engine();
    for (const name of AMBIENCES) {
      a.ambience(name);
      advance(0.2);
      expect(a.bed?.name).toBe(name);
    }
    a.stage({ id: 'pause', music: 'copil', theme: 'office' });
    expect(a.run?.name).toBe('cafe');
    expect(a.bed?.name).toBe('cafe');
    a.ambience(null);
    expect(a.bed).toBeNull();
  });

  it('schedules nothing while muted, and resumes in time when unmuted', () => {
    const a = engine();
    a.setMuted(true);
    a.music('office');
    advance(1);
    const before = stats.nodes;
    a.sfx('jump');
    advance(2);
    expect(stats.nodes).toBe(before);
    a.setMuted(false);
    advance(0.5);
    expect(stats.nodes).toBeGreaterThan(before);
  });

  it('brings layers in on the next beat and lets them out gently', () => {
    const a = engine();
    a.music('office');
    advance(1);
    a.intensity(1);
    const run = /** @type {NonNullable<typeof a.run>} */ (a.run);
    const up = /** @type {any} */ (run.drive.gain).last;
    const now = stats.ctx.currentTime;
    const beat = 60 / trackInfo('office').bpm;
    expect(up.v).toBe(1);
    expect(up.t).toBeGreaterThanOrEqual(now);
    expect(up.t - now).toBeLessThanOrEqual(beat + 0.2);
    run.drive.gain.value = 1;
    a.intensity(0);
    const down = /** @type {any} */ (run.drive.gain).last;
    expect(down.v).toBe(0);
    expect(down.tc).toBeGreaterThan(up.tc);
  });

  it('gives every game event a sound', () => {
    const events = emittedEvents();
    // The parser must see the whole game, including events picked by a ternary.
    for (const t of ['jump', 'hardland', 'zap', 'trapdoor', 'cableZap', 'bossPhase'])
      expect(events).toContain(t);
    for (const type of events) expect(SFX_TYPES, type).toContain(eventSfx({ type }));
    expect(eventSfx({ type: 'block', cause: 'boss' })).toBe('guard');
    expect(eventSfx({ type: 'block' })).toBe('block');
    expect(eventSfx({ type: 'step' })).toBe('touchdown');
    // Moments wired by main.js rather than by a game event.
    for (const t of ['finale', 'consultTick', 'record', 'gold', 'trophy', 'back', 'page', 'bubble'])
      expect(SFX_TYPES).toContain(t);
  });

  it('walks, jumps and lands on every floor for both heroes, and voices every speaker', () => {
    const a = engine();
    for (const id of STAGES) expect(FLOORS).toContain(stageFloor({ id }));
    expect(stageFloor({ id: 'new-stage', theme: 'datacenter' })).toBe('metal');
    a.stage({ id: 'parking' }, 'charline');
    expect([a.floor, a.hero]).toEqual(['concrete', 'charline']);
    // After a boss, the stage comes back without a hero: the hero stays.
    a.stage({ id: 'ts' });
    expect([a.floor, a.hero]).toEqual(['metal', 'charline']);
    for (const hero of /** @type {const} */ (['kevin', 'charline'])) {
      a.hero = hero;
      for (const floor of FLOORS) {
        for (const type of ['step', 'touchdown', 'land', 'hardland', 'jump', 'bonk']) {
          const before = stats.nodes;
          a.sfx(type, { floor });
          expect(stats.nodes, `${type} ${floor} ${hero}`).toBeGreaterThan(before);
        }
      }
    }
    for (const who of [...VOICE_IDS, '', 'nobody']) {
      for (const type of ['talk', 'bubble']) {
        const before = stats.nodes;
        a.sfx(type, { who });
        expect(stats.nodes, `${type} ${who}`).toBeGreaterThan(before);
      }
    }
  });

  it('delays and pitches an effect on request, within bounds', () => {
    const a = engine();
    stats.starts = [];
    stats.oscillators = [];
    a.sfx('consultTick', { delay: 1.5, pitch: 1.2 });
    expect(Math.min(...stats.starts)).toBeGreaterThanOrEqual(1.5);
    // The tick's 1976 Hz partial, raised by the pitch (and the ±4 % per-play variation).
    expect(Math.min(...stats.oscillators)).toBeGreaterThan(1976 * 1.2 * 0.95);
    stats.starts = [];
    a.sfx('record', { delay: -3, pitch: -1 });
    expect(Math.min(...stats.starts)).toBeGreaterThanOrEqual(0);
  });

  it('reads chord symbols and sharpened melody degrees', () => {
    expect(chord('I')).toEqual({ root: 0, minor: false, tones: [0, 4, 7] });
    expect(chord('vi7')).toEqual({ root: 9, minor: true, tones: [0, 3, 7, 10] });
    expect(chord('bVII')).toEqual({ root: 10, minor: false, tones: [0, 4, 7] });
    expect(chord('III7').tones).toEqual([0, 4, 7, 10]);
    expect(chord('iv6')).toEqual({ root: 5, minor: true, tones: [0, 3, 7, 9] });
    expect(chord('Vs7').tones).toEqual([0, 5, 7, 10]);
    expect(chord('viio').tones).toEqual([0, 3, 6]);
    expect(() => chord('H7')).toThrow();
    expect(degreeOf('4')).toEqual([4, 0]);
    expect(degreeOf('$')).toEqual([4, 1]);
    expect(degreeOf('a')).toEqual([10, 0]);
    expect(degreeOf('A')).toEqual([10, 1]);
  });

  it('quotes the main motif (sol mi sol do) in every track', () => {
    for (const name of TRACKS) {
      const def = SONGS[name];
      /** @type {number[][]} */
      const lines = [[], [], []];
      for (const bar of BARS[name]) {
        const d = bar.def;
        const root = def.root + bar.key;
        [bar.mel, bar.counter, bar.finale].forEach((p, k) => {
          for (const c of p) {
            if (c === '.' || c === '-') continue;
            const [deg, sharp] = degreeOf(c);
            lines[k].push(root + d.scale[deg % 7] + 12 * Math.floor(deg / 7) + sharp);
          }
        });
      }
      // Down a third, back up, then up a fourth: in major, minor and the modes.
      const quotes = lines.some((n) =>
        n.some(
          (x, k) =>
            k + 3 < n.length &&
            [3, 4].includes(x - n[k + 1]) &&
            n[k + 2] === x &&
            n[k + 3] - x === 5,
        ),
      );
      expect(quotes, name).toBe(true);
    }
  });

  it('gives each hero their variant of the theme, at the same length', () => {
    for (const name of ['win', 'credits', 'rooftop']) {
      const kevin = barsFor(/** @type {any} */ (name), 'kevin').bars;
      const charline = barsFor(/** @type {any} */ (name), 'charline').bars;
      expect(charline.length, name).toBe(kevin.length);
      expect(
        charline.map((b) => b.mel),
        name,
      ).not.toEqual(kevin.map((b) => b.mel));
    }
    expect(barsFor('office', 'charline').bars).toBe(BARS.office);
  });

  it('plays an intro once, then loops the song from its first bar', () => {
    const { bars, loop } = barsFor('title', 'kevin');
    expect(loop).toBeGreaterThan(0);
    const total = bars.length * 16;
    const run = /** @type {any} */ ({ loop, step: 0 });
    expect(position(run, total)).toBe(0);
    run.step = total;
    expect(position(run, total)).toBe(loop * 16);
    run.step = total + (total - loop * 16) + 5;
    expect(position(run, total)).toBe(loop * 16 + 5);
    // The last bar leads back into the loop's first chord, not the intro's.
    expect(bars[bars.length - 1].next).toBe(bars[loop].chords[0].root + bars[loop].key);
  });

  it('keeps the finale layer for the last phase of a boss', () => {
    const a = engine();
    a.music('bossRodolphe');
    advance(0.5);
    const run = /** @type {NonNullable<typeof a.run>} */ (a.run);
    a.intensity(0.9);
    expect(/** @type {any} */ (run.lead.gain).last.v).toBe(1);
    expect(/** @type {any} */ (run.finale.gain).last.v).toBe(0);
    a.intensity(1);
    expect(/** @type {any} */ (run.finale.gain).last.v).toBe(1);
    stats.oscillators = [];
    run.finale.gain.value = 1;
    advance(3);
    expect(stats.oscillators.length).toBeGreaterThan(10);
  });
});

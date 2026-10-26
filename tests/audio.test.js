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
  screenPan,
  stageBed,
  stageFloor,
  stageTrack,
  trackInfo,
} from '../src/app/audio.js';
import { ceilingCurve } from '../src/app/audio/engine.js';
import { LEAK_RANGE, PHONE_HIGH, PHONE_LOW, nearness } from '../src/app/audio/phone.js';
import { position, step } from '../src/app/audio/scheduler.js';
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
  it('pans an effect by where it happens on screen', () => {
    expect(screenPan(10, 10, 8)).toBe(0);
    expect(screenPan(14, 10, 8)).toBeCloseTo(0.425);
    expect(screenPan(2, 10, 8)).toBeCloseTo(-0.85);
    // Off screen: hard on its side, never past it.
    expect(screenPan(60, 10, 8)).toBeCloseTo(0.85);
    expect(screenPan(NaN, 10, 8)).toBe(0);
    const a = engine();
    const made = vi.spyOn(stats.ctx, 'createStereoPanner');
    a.sfx('ticket', { pan: 0.5 });
    expect(made.mock.results.map((r) => r.value.pan.value)).toContain(0.5);
    made.mockClear();
    a.sfx('ticket', { pan: 7 });
    expect(made.mock.results.map((r) => r.value.pan.value)).toContain(1);
    made.mockClear();
    // Centred (or no pan given): no panner at all.
    a.sfx('ticket');
    a.sfx('ticket', { pan: 0 });
    expect(made).not.toHaveBeenCalled();
  });

  it('never plays the same take of a varied effect twice in a row', () => {
    const a = engine();
    /** The triad take of the ticket starts more oscillators than the two-note ones. */
    const counts = [];
    for (let k = 0; k < 60; k++) {
      stats.oscillators = [];
      a.sfx('ticket');
      counts.push(stats.oscillators.length);
    }
    const most = Math.max(...counts);
    expect(new Set(counts).size).toBeGreaterThan(1);
    for (let k = 1; k < counts.length; k++)
      expect(counts[k] === most && counts[k - 1] === most, `take ${k}`).toBe(false);
  });

  it('ducks the music under hurts, boss hits and keys, then lets it swell back', () => {
    const a = engine();
    a.music('office');
    advance(1);
    const duck = /** @type {any} */ (a.duckNode).gain;
    a.sfx('jump');
    expect(duck.last).toBeUndefined();
    const now = stats.ctx.currentTime;
    a.sfx('hurt');
    expect(duck.last.v).toBe(1);
    expect(duck.last.t).toBeGreaterThan(now + 0.1);
    a.sfx('key', { delay: 1 });
    expect(duck.last.t).toBeGreaterThan(now + 1.5);
  });

  it('plays stingers in time with the music on key, door and checkpoint', () => {
    const a = engine();
    a.sfx('key');
    a.music('copil');
    advance(1.37);
    const run = /** @type {NonNullable<typeof a.run>} */ (a.run);
    const s16 = 60 / run.def.bpm / 4;
    for (const type of ['key', 'door', 'checkpoint']) {
      /** @type {number[]} */
      const starts = [];
      const tone = run.stingVoice.tone;
      run.stingVoice.tone = (o) => {
        starts.push(o.t);
        return tone(o);
      };
      a.sfx(type);
      run.stingVoice.tone = tone;
      expect(starts.length, type).toBeGreaterThan(1);
      // On the track's sixteenth grid (which started at 0.08 s), never in the past.
      for (const t of starts) {
        expect(t, type).toBeGreaterThanOrEqual(stats.ctx.currentTime);
        const k = (t - 0.08) / s16;
        expect(Math.abs(k - Math.round(k)), type).toBeLessThan(1e-6);
      }
    }
  });

  it('lifts a boss track a tone at each phase, on a half bar, up to two tones', () => {
    const a = engine();
    a.music('bossRodolphe');
    advance(1);
    const run = /** @type {NonNullable<typeof a.run>} */ (a.run);
    expect(run.lift).toBeNull();
    a.sfx('bossPhase');
    expect(run.lift).toMatchObject({ from: 0, to: 2 });
    expect(/** @type {any} */ (run.lift).at % 8).toBe(0);
    expect(/** @type {any} */ (run.lift).at).toBeGreaterThanOrEqual(run.step);
    advance(2);
    a.sfx('finale');
    expect(run.lift).toMatchObject({ from: 2, to: 4 });
    advance(2);
    a.sfx('bossPhase');
    expect(/** @type {any} */ (run.lift).to).toBe(4);
    // Every pitched note moves up a tone (the drums stay put).
    const notesAt = (/** @type {typeof run.lift} */ lift) => {
      run.lift = lift;
      run.step = 64;
      stats.oscillators = [];
      step(run, run.total, [1, 1, 1]);
      return [...stats.oscillators];
    };
    const plain = notesAt(null);
    const lifted = notesAt({ from: 0, to: 2, at: 0 });
    const tone = 2 ** (2 / 12);
    const near = (/** @type {number[]} */ list, /** @type {number} */ f) =>
      list.some((x) => Math.abs(x / f - 1) < 1e-9);
    for (const f of plain) expect(near(lifted, f * tone) || near(lifted, f), String(f)).toBe(true);
    expect(plain.filter((f) => near(lifted, f * tone)).length).toBeGreaterThan(3);
    // Stage tracks never change key on a phase sound.
    a.music('office');
    advance(1);
    a.sfx('bossPhase');
    expect(a.run?.lift).toBeNull();
  });

  it('hands one track over to the next on the beat', () => {
    const a = engine();
    a.music('office');
    advance(1.31);
    const beat = 60 / trackInfo('office').bpm;
    const now = stats.ctx.currentTime;
    a.music('copil');
    const next = /** @type {NonNullable<typeof a.run>} */ (a.run).next;
    const k = (next - 0.08) / beat;
    expect(Math.abs(k - Math.round(k))).toBeLessThan(1e-6);
    expect(next).toBeGreaterThan(now);
    expect(next - now).toBeLessThanOrEqual(beat + 0.05);
    // From silence, a track starts right away.
    a.music(null);
    a.music('title');
    expect(/** @type {NonNullable<typeof a.run>} */ (a.run).next).toBeCloseTo(
      stats.ctx.currentTime + 0.08,
    );
  });

  it('plays the victory variation after a signature, once', () => {
    const a = engine();
    a.music('datacenter');
    advance(0.5);
    a.sfx('sign');
    a.music('win');
    expect(a.run?.name).toBe('winSigned');
    a.music('win');
    expect(a.run?.name).toBe('winSigned');
    a.music('parking');
    a.music('win');
    expect(a.run?.name).toBe('win');
  });

  it('puts the music on hold down a phone line in pause, and takes it back on resume', () => {
    expect([PHONE_LOW, PHONE_HIGH]).toEqual([300, 3400]);
    const a = engine();
    a.music('office');
    advance(1);
    const dry = /** @type {any} */ (a.dryNode).gain;
    const line = /** @type {any} */ (a.phone).line.gain;
    a.sfx('pause');
    expect(a.held).toBe(true);
    expect(dry.last.v).toBe(0);
    expect(line.last.v).toBe(1);
    // The line hiss runs only on hold.
    expect(/** @type {any} */ (a)._hiss).not.toBeNull();
    // The track keeps playing (no restart): the same run, in time.
    const run = a.run;
    advance(1);
    expect(a.run).toBe(run);
    a.sfx('resume');
    expect(a.held).toBe(false);
    expect(dry.last.v).toBe(1);
    expect(line.last.v).toBe(0);
    // Back smoothly: the way out is gentler than the way in.
    expect(line.last.tc).toBeGreaterThan(0.05);
    expect(/** @type {any} */ (a)._hiss).toBeNull();
    // Quitting, restarting the stage or any new music leaves the switchboard.
    a.sfx('pause');
    a.stage({ id: 'lcp7', music: 'office', theme: 'office' });
    expect(a.held).toBe(false);
    a.sfx('pause');
    a.music('title');
    expect(a.held).toBe(false);
    expect(dry.last.v).toBe(1);
  });

  it('lets the hold music leak from a colleague headset, placed and discreet', () => {
    expect(nearness(Infinity)).toBe(0);
    expect(nearness(NaN)).toBe(0);
    expect(nearness(LEAK_RANGE + 1)).toBe(0);
    expect(nearness(0)).toBe(1);
    expect(nearness(2)).toBeGreaterThan(nearness(4));
    const a = engine();
    a.music('office');
    advance(0.5);
    const phone = /** @type {any} */ (a.phone);
    const dry = /** @type {any} */ (a.dryNode).gain;
    a.headset(1, 0.8);
    const close = phone.leak.gain.last.v;
    expect(close).toBeGreaterThan(0);
    // Discreet: under the line level, and the room music only dips a little.
    expect(close).toBeLessThanOrEqual(1);
    expect(dry.last.v).toBeGreaterThan(0.6);
    expect(dry.last.v).toBeLessThan(1);
    expect(phone.pan.pan.last.v).toBeCloseTo(0.8);
    a.headset(4, -0.5);
    expect(phone.leak.gain.last.v).toBeLessThan(close);
    expect(phone.pan.pan.last.v).toBeCloseTo(-0.5);
    // Same place every frame: the mix is left alone.
    const calls = phone.leak.gain.last;
    a.headset(4, -0.5);
    expect(phone.leak.gain.last).toBe(calls);
    a.headset(Infinity);
    expect(phone.leak.gain.last.v).toBe(0);
    expect(dry.last.v).toBe(1);
    // On hold, the whole music is on the line: no extra leak.
    a.headset(1, 0);
    a.hold(true);
    expect(phone.leak.gain.last.v).toBe(0);
    // A new track clears the headset until the game reports it again.
    a.hold(false);
    a.headset(1, 0);
    a.music('copil');
    expect(phone.leak.gain.last.v).toBe(0);
  });

  it('skips the steps missed during a stall, even at a hand-over, never plays them late', () => {
    const a = engine();
    a.music('office');
    advance(1);
    // The main thread freezes 0.6 s (a stage being built): the clock runs, no tick.
    stats.ctx.currentTime += 0.6;
    const thaw = stats.ctx.currentTime;
    stats.starts = [];
    a.music('copil');
    advance(0.5);
    expect(stats.starts.length).toBeGreaterThan(0);
    for (const t of stats.starts) expect(t).toBeGreaterThanOrEqual(thaw - 0.03);
    // Same without a hand-over: the clock jumps ahead instead of catching up.
    a.music('office');
    advance(1);
    stats.ctx.currentTime += 0.6;
    const cut = stats.ctx.currentTime;
    stats.starts = [];
    advance(0.1);
    for (const t of stats.starts) expect(t).toBeGreaterThanOrEqual(cut - 0.03);
  });

  it('keeps every sample under the -1 dBFS ceiling', () => {
    const curve = ceilingCurve();
    const ceiling = 10 ** (-1 / 20);
    expect(Math.max(...curve.map(Math.abs))).toBeLessThan(ceiling);
    for (let k = 1; k < curve.length; k++) expect(curve[k]).toBeGreaterThanOrEqual(curve[k - 1]);
    // Transparent below -7 dBFS: the shaper's input is halved, its output is not.
    const mid = (curve.length - 1) / 2;
    const at = (/** @type {number} */ x) => curve[Math.round(mid + (x / 2) * mid)];
    expect(at(0.3)).toBeCloseTo(0.3, 2);
  });
});

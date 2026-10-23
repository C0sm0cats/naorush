// Procedural audio: every sound and track is synthesised with WebAudio, no asset files.

const MUTE_KEY = 'naorush.muted';
const FADE = 0.6;
const LOOKAHEAD = 0.14;
const TICK_MS = 25;

/**
 * @typedef {object} ToneOpts
 * @property {number} f start frequency (Hz)
 * @property {number} t start time (context clock)
 * @property {number} d duration (s)
 * @property {OscillatorType} [type]
 * @property {number} [v] peak gain
 * @property {number} [to] end frequency (exponential glide)
 * @property {number} [a] attack (s)
 * @property {number} [lp] lowpass cutoff (Hz)
 */
/**
 * @typedef {object} NoiseOpts
 * @property {number} t
 * @property {number} d
 * @property {BiquadFilterType} [type]
 * @property {number} [f] filter frequency
 * @property {number} [to] end filter frequency
 * @property {number} [q]
 * @property {number} [v]
 * @property {number} [a]
 */
/** @typedef {{ now: number, tone: (o: ToneOpts) => void, noise: (o: NoiseOpts) => void }} Voice */
/**
 * @typedef {object} Track
 * @property {number} bpm
 * @property {number} root bass tonic (MIDI)
 * @property {number} lead melody octave offset above root (semitones)
 * @property {number[]} scale
 * @property {[number, boolean][]} chords one per bar: [semitone offset, isMinor]
 * @property {string[]} melody one 8-step string per bar: scale degree (base 36), '.' = rest
 * @property {OscillatorType} wave
 * @property {number} cutoff
 * @property {string} bass 1 root, 2 octave, 5 fifth
 * @property {string} kick
 * @property {string} snare
 * @property {string} hat
 * @property {boolean} [arp]
 * @property {boolean} [pad]
 * @property {boolean} [comp]
 */

const MAJOR = [0, 2, 4, 5, 7, 9, 11];
const MINOR = [0, 2, 3, 5, 7, 8, 10];

/** @param {number} m */
const mtof = (m) => 440 * 2 ** ((m - 69) / 12);
/** @param {string} s e.g. '0 9m 5 7' */
const chords = (s) =>
  /** @type {[number, boolean][]} */ (s.split(' ').map((x) => [parseInt(x), x.endsWith('m')]));
/** @param {string} s */
const bars = (s) => s.split(' ');

/** @type {Record<string, Track>} */
const TRACKS = {
  title: {
    bpm: 110,
    root: 36,
    lead: 24,
    scale: MAJOR,
    wave: 'triangle',
    cutoff: 3500,
    chords: chords('0 9m 5 7 0 9m 5 7'),
    melody: bars('4.24.742 5.75.972 5.35.753 4.68.64. 7.97.742 5.75.9.7 3.57.5.3 4.64.1..'),
    bass: '1.5.1.5.',
    kick: '1...1...',
    snare: '......1.',
    hat: '.1.1.1.1',
    comp: true,
  },
  office: {
    bpm: 120,
    root: 38,
    lead: 24,
    scale: MAJOR,
    wave: 'square',
    cutoff: 2600,
    chords: chords('0 5 0 7 0 5 7 0'),
    melody: bars('2.42.74. 3.53.75. 2.42.9.7 4.64.86. 7.42.40. 5.73.57. 6.48.64. 7.4.2.0.'),
    bass: '1..21.2.',
    kick: '1..1.1..',
    snare: '..1...1.',
    hat: '11111111',
    comp: true,
  },
  datacenter: {
    bpm: 124,
    root: 45,
    lead: 36,
    scale: MINOR,
    wave: 'sawtooth',
    cutoff: 1800,
    chords: chords('0m 8 3 10 0m 8 3 10'),
    melody: bars('4...7.4. 5...7.5. 2...4.6. 6...8.6. 7.9.7.4. 9.7.5.7. 6.4.2.4. 6.8.a.8.'),
    bass: '1.1.1.2.',
    kick: '1...1...',
    snare: '......1.',
    hat: '.1.1.1.1',
    arp: true,
    pad: true,
  },
  rooftop: {
    bpm: 132,
    root: 40,
    lead: 24,
    scale: MAJOR,
    wave: 'square',
    cutoff: 3000,
    chords: chords('0 7 9m 5 0 7 9m 5'),
    melody: bars('4.7.9.7. 4.68.64. 5.79.75. 7.53.57. 9.a.9.7. 8.6.4.6. 9.7.5.7. 7.5.7.9.'),
    bass: '1.1.5.1.',
    kick: '1.1.1.1.',
    snare: '..1...1.',
    hat: '.1.1.1.1',
    pad: true,
  },
  boss: {
    bpm: 146,
    root: 40,
    lead: 24,
    scale: MINOR,
    wave: 'sawtooth',
    cutoff: 2200,
    chords: chords('0m 0m 8 10 0m 0m 8 10'),
    melody: bars('00.20.42 4.42.04. 5.75.97. 6.86.a8. 7.74.24. 00.2.4.7 9.75.79. a.86.8.6'),
    bass: '11211211',
    kick: '1.1.1.1.',
    snare: '..1...1.',
    hat: '11111111',
  },
  win: {
    bpm: 128,
    root: 36,
    lead: 24,
    scale: MAJOR,
    wave: 'square',
    cutoff: 3200,
    chords: chords('0 5 7 0'),
    melody: bars('0.24.79. 7.5.7.a. 8.6.8.b. 9.7.9.e.'),
    bass: '1.5.1.5.',
    kick: '1.1.1.1.',
    snare: '..1...1.',
    hat: '.1.1.1.1',
    comp: true,
  },
};

/** @type {Record<string, (v: Voice) => void>} */
const SFX = {
  jump: (v) => v.tone({ f: 280, to: 560, t: v.now, d: 0.14, type: 'triangle', v: 0.35 }),
  airjump: (v) => {
    v.tone({ f: 700, to: 1400, t: v.now, d: 0.12, type: 'triangle', v: 0.3 });
    v.tone({ f: 1050, to: 2100, t: v.now + 0.05, d: 0.14, v: 0.16 });
    v.tone({ f: 2800, t: v.now + 0.1, d: 0.1, v: 0.08 });
  },
  land: (v) => v.noise({ t: v.now, d: 0.07, f: 600, v: 0.25 }),
  hardland: (v) => {
    v.tone({ f: 120, to: 45, t: v.now, d: 0.22, v: 0.7 });
    v.noise({ t: v.now, d: 0.12, f: 400, v: 0.4 });
  },
  ticket: (v) => {
    v.tone({ f: 988, t: v.now, d: 0.08, type: 'square', v: 0.14, lp: 3500 });
    v.tone({ f: 1319, t: v.now + 0.07, d: 0.25, type: 'square', v: 0.14, lp: 3500 });
  },
  ammo: (v) => {
    v.noise({ t: v.now, d: 0.18, type: 'bandpass', f: 3000, to: 1500, v: 0.3, a: 0.03 });
    v.tone({ f: 880, t: v.now + 0.12, d: 0.07, v: 0.2 });
  },
  checkpoint: (v) => {
    for (const [i, f] of [700, 700, 1050].entries()) {
      v.tone({
        f,
        t: v.now + i * 0.1,
        d: i === 2 ? 0.25 : 0.07,
        type: 'square',
        v: 0.13,
        lp: 3000,
      });
    }
  },
  door: (v) => {
    v.noise({ t: v.now, d: 0.35, type: 'bandpass', f: 400, to: 2500, v: 0.28, a: 0.08 });
    v.tone({ f: 1047, t: v.now + 0.22, d: 0.35, v: 0.2 });
    v.tone({ f: 1568, t: v.now + 0.3, d: 0.4, v: 0.15 });
  },
  key: (v) => {
    for (const [i, f] of [523, 659, 784, 1047].entries()) {
      v.tone({ f, t: v.now + i * 0.1, d: i === 3 ? 0.5 : 0.14, type: 'square', v: 0.14, lp: 3200 });
    }
  },
  collapse: (v) => {
    v.noise({ t: v.now, d: 0.7, f: 900, to: 200, v: 0.5, a: 0.02 });
    for (let i = 0; i < 5; i++) {
      v.noise({ t: v.now + i * 0.09, d: 0.08, type: 'bandpass', f: 300 + i * 90, v: 0.3 });
    }
  },
  smash: (v) => {
    v.noise({ t: v.now, d: 0.18, type: 'highpass', f: 3000, v: 0.4 });
    v.tone({ f: 1800, to: 600, t: v.now, d: 0.08, type: 'square', v: 0.14, lp: 4000 });
    v.tone({ f: 3200, t: v.now + 0.05, d: 0.2, v: 0.08 });
    v.tone({ f: 4100, t: v.now + 0.09, d: 0.2, v: 0.06 });
  },
  splash: (v) => {
    v.noise({ t: v.now, d: 0.38, type: 'bandpass', f: 1200, to: 3000, v: 0.3, a: 0.04 });
    v.noise({ t: v.now, d: 0.25, f: 600, v: 0.25 });
  },
  hurt: (v) => {
    v.tone({ f: 400, to: 110, t: v.now, d: 0.32, type: 'sawtooth', v: 0.22, lp: 1500 });
    v.tone({ f: 410, to: 100, t: v.now, d: 0.32, type: 'square', v: 0.1, lp: 1200 });
  },
  zap: (v) => {
    v.noise({ t: v.now, d: 0.22, type: 'highpass', f: 2000, v: 0.25 });
    for (let i = 0; i < 6; i++) {
      v.tone({
        f: 200 + Math.random() * 1500,
        t: v.now + i * 0.03,
        d: 0.03,
        type: 'square',
        v: 0.09,
        lp: 3000,
      });
    }
  },
  bump: (v) => {
    v.tone({ f: 200, to: 520, t: v.now, d: 0.12, v: 0.4 });
    v.tone({ f: 520, to: 240, t: v.now + 0.1, d: 0.22, v: 0.35 });
  },
  meeting: (v) => {
    v.tone({ f: 300, to: 800, t: v.now, d: 0.07, v: 0.4 });
    v.tone({ f: 1500, to: 2200, t: v.now + 0.08, d: 0.28, v: 0.12, a: 0.05 });
  },
  empty: (v) => {
    v.noise({ t: v.now, d: 0.03, type: 'bandpass', f: 1500, v: 0.3 });
    v.tone({ f: 150, t: v.now, d: 0.04, type: 'square', v: 0.1, lp: 800 });
  },
  fire: (v) => v.noise({ t: v.now, d: 0.18, type: 'bandpass', f: 800, to: 3500, v: 0.28, a: 0.04 }),
  parry: (v) => {
    v.tone({ f: 2400, t: v.now, d: 0.28, v: 0.2 });
    v.tone({ f: 3650, t: v.now, d: 0.18, v: 0.1 });
    v.noise({ t: v.now, d: 0.03, type: 'highpass', f: 5000, v: 0.2 });
  },
  block: (v) => {
    v.tone({ f: 140, to: 70, t: v.now, d: 0.13, v: 0.55 });
    v.noise({ t: v.now, d: 0.06, f: 500, v: 0.3 });
  },
  bossStart: (v) => {
    v.tone({ f: 55, t: v.now, d: 1.0, v: 0.6, a: 0.02 });
    for (const f of [110, 131, 165]) {
      v.tone({ f, t: v.now, d: 0.9, type: 'sawtooth', v: 0.12, lp: 700, a: 0.02 });
    }
    v.noise({ t: v.now, d: 0.5, f: 300, v: 0.4 });
  },
  bossThrow: (v) =>
    v.noise({ t: v.now, d: 0.22, type: 'bandpass', f: 500, to: 2500, v: 0.3, a: 0.05 }),
  bossHit: (v) => {
    v.tone({ f: 160, to: 50, t: v.now, d: 0.22, v: 0.55 });
    v.noise({ t: v.now, d: 0.1, f: 800, v: 0.4 });
    v.tone({ f: 400, to: 900, t: v.now + 0.1, d: 0.16, type: 'triangle', v: 0.22 });
  },
  bossDone: (v) => {
    const hit = (/** @type {number} */ at, /** @type {number[]} */ fs, /** @type {number} */ d) => {
      for (const f of fs) v.tone({ f, t: v.now + at, d, type: 'square', v: 0.09, lp: 2500 });
    };
    hit(0, [392, 523, 659], 0.16);
    hit(0.18, [392, 523, 659], 0.16);
    hit(0.36, [523, 659, 784, 1047], 0.8);
  },
  consult: (v) => {
    v.tone({ f: 880, t: v.now, d: 0.16, v: 0.26 });
    v.tone({ f: 1175, t: v.now + 0.12, d: 0.35, v: 0.26 });
  },
  slam: (v) => {
    v.tone({ f: 90, to: 35, t: v.now, d: 0.5, v: 0.8 });
    v.noise({ t: v.now, d: 0.25, f: 300, v: 0.5 });
  },
  poof: (v) => v.noise({ t: v.now, d: 0.12, f: 1500, to: 300, v: 0.22 }),
  win: (v) => {
    for (const [i, f] of [523, 659, 784, 1047, 784, 1047, 1319].entries()) {
      v.tone({ f, t: v.now + i * 0.1, d: i === 6 ? 0.7 : 0.14, type: 'square', v: 0.13, lp: 3200 });
    }
  },
  talk: (v) =>
    v.tone({ f: 300 + Math.random() * 250, t: v.now, d: 0.045, type: 'square', v: 0.1, lp: 1800 }),
  select: (v) => v.tone({ f: 700, t: v.now, d: 0.05, type: 'triangle', v: 0.25 }),
  confirm: (v) => {
    v.tone({ f: 600, t: v.now, d: 0.07, type: 'triangle', v: 0.28 });
    v.tone({ f: 900, t: v.now + 0.06, d: 0.15, type: 'triangle', v: 0.28 });
  },
};

export class Audio {
  constructor() {
    /** @type {AudioContext | null} */
    this.ctx = null;
    /** @type {AudioBuffer | null} */
    this.buf = null;
    /** @type {GainNode | null} */
    this.master = null;
    /** @type {GainNode | null} */
    this.sfxBus = null;
    /** @type {GainNode | null} */
    this.musicBus = null;
    /** @type {{ name: string, bus: GainNode, timer: ReturnType<typeof setInterval>, step: number, next: number } | null} */
    this.run = null;
    /** @type {'title'|'office'|'datacenter'|'rooftop'|'boss'|'win'|null} */
    this.wanted = null;
    this._muted = false;
    try {
      this._muted = globalThis.localStorage?.getItem(MUTE_KEY) === '1';
    } catch {
      /* storage unavailable */
    }
  }

  get muted() {
    return this._muted;
  }

  /** Lazily creates the AudioContext; call from a user gesture. */
  unlock() {
    if (!this.ctx) {
      const w = /** @type {any} */ (globalThis);
      const Ctor = w.AudioContext ?? w.webkitAudioContext;
      if (!Ctor) return;
      try {
        this.#build(new Ctor());
      } catch {
        this.ctx = null;
        return;
      }
    }
    const ctx = this.ctx;
    if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {});
    if (this.wanted && !this.run) this.music(this.wanted);
  }

  /** @param {AudioContext} ctx */
  #build(ctx) {
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16;
    comp.knee.value = 24;
    comp.ratio.value = 4;
    comp.attack.value = 0.003;
    comp.release.value = 0.2;
    const master = ctx.createGain();
    master.gain.value = this._muted ? 0 : 0.8;
    master.connect(comp).connect(ctx.destination);
    const sfx = ctx.createGain();
    sfx.gain.value = 0.5;
    sfx.connect(master);
    const music = ctx.createGain();
    music.gain.value = 0.22;
    music.connect(master);
    const buf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    Object.assign(this, { ctx, buf, master, sfxBus: sfx, musicBus: music });
  }

  /** @param {boolean} m */
  setMuted(m) {
    this._muted = m;
    try {
      globalThis.localStorage?.setItem(MUTE_KEY, m ? '1' : '0');
    } catch {
      /* storage unavailable */
    }
    if (this.ctx && this.master) {
      this.master.gain.setTargetAtTime(m ? 0 : 0.8, this.ctx.currentTime, 0.03);
    }
  }

  /** @param {string} type */
  sfx(type) {
    const play = Object.hasOwn(SFX, type) ? SFX[type] : undefined;
    if (!play || !this.ctx || !this.sfxBus) return;
    play(this.#voice(this.sfxBus));
  }

  /** @param {'title'|'office'|'datacenter'|'rooftop'|'boss'|'win'|null} track */
  music(track) {
    this.wanted = track;
    const ctx = this.ctx;
    if (!ctx || !this.musicBus) return;
    if (this.run && this.run.name === track) return;
    const now = ctx.currentTime;
    const old = this.run;
    this.run = null;
    if (old) {
      clearInterval(old.timer);
      old.bus.gain.cancelScheduledValues(now);
      old.bus.gain.setValueAtTime(old.bus.gain.value, now);
      old.bus.gain.linearRampToValueAtTime(0, now + FADE);
      setTimeout(() => old.bus.disconnect(), (FADE + 0.2) * 1000);
    }
    if (!track || !Object.hasOwn(TRACKS, track)) return;
    const def = TRACKS[track];
    const bus = ctx.createGain();
    bus.gain.setValueAtTime(0, now);
    bus.gain.linearRampToValueAtTime(1, now + FADE);
    bus.connect(this.musicBus);
    const run = { name: track, bus, step: 0, next: now + 0.08, timer: setInterval(() => {}, 1e9) };
    clearInterval(run.timer);
    run.timer = setInterval(() => {
      while (run.next < ctx.currentTime + LOOKAHEAD) {
        this.#step(def, run);
        run.next += 60 / def.bpm / 2;
        run.step++;
      }
    }, TICK_MS);
    this.run = run;
  }

  /** @param {AudioNode} dest @returns {Voice} */
  #voice(dest) {
    const ctx = /** @type {AudioContext} */ (this.ctx);
    const buf = /** @type {AudioBuffer} */ (this.buf);
    return {
      now: ctx.currentTime,
      tone: ({ f, t, d, type = 'sine', v = 0.3, to, a = 0.005, lp }) => {
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(f, t);
        if (to) osc.frequency.exponentialRampToValueAtTime(to, t + d);
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(v, t + Math.min(a, d / 2));
        g.gain.exponentialRampToValueAtTime(0.0001, t + d);
        let out = osc.connect(g);
        if (lp) {
          const filter = ctx.createBiquadFilter();
          filter.frequency.value = lp;
          out = out.connect(filter);
        }
        out.connect(dest);
        osc.start(t);
        osc.stop(t + d + 0.05);
      },
      noise: ({ t, d, type = 'lowpass', f = 2000, to, q = 1, v = 0.3, a = 0.005 }) => {
        const src = ctx.createBufferSource();
        src.buffer = buf;
        src.loop = true;
        const filter = ctx.createBiquadFilter();
        filter.type = type;
        filter.Q.value = q;
        filter.frequency.setValueAtTime(f, t);
        if (to) filter.frequency.exponentialRampToValueAtTime(to, t + d);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(v, t + Math.min(a, d / 2));
        g.gain.exponentialRampToValueAtTime(0.0001, t + d);
        src.connect(filter).connect(g).connect(dest);
        src.start(t, Math.random() * 0.5);
        src.stop(t + d + 0.05);
      },
    };
  }

  /**
   * Schedules one eighth-note step of a track at run.next.
   * @param {Track} def
   * @param {{ bus: GainNode, step: number, next: number }} run
   */
  #step(def, run) {
    const v = this.#voice(run.bus);
    const t = run.next;
    const sd = 60 / def.bpm / 2;
    const total = def.melody.length * 8;
    const s = run.step % total;
    const bar = Math.floor(s / 8);
    const i = s % 8;
    const [off, minor] = def.chords[bar % def.chords.length];
    const third = minor ? 3 : 4;
    const base = def.root + off;

    const m = def.melody[bar][i];
    if (m !== '.') {
      const deg = parseInt(m, 36);
      const note = def.root + def.lead + def.scale[deg % 7] + 12 * Math.floor(deg / 7);
      const hold = def.melody[bar][i + 1] === '.' ? 1.8 : 0.9;
      v.tone({ f: mtof(note), t, d: sd * hold, type: def.wave, v: 0.13, lp: def.cutoff, a: 0.01 });
    }

    const b = def.bass[i];
    if (b !== '.') {
      const shift = b === '2' ? 12 : b === '5' ? 7 : 0;
      v.tone({ f: mtof(base + shift), t, d: sd * 0.9, type: 'triangle', v: 0.5, a: 0.008 });
    }

    if (def.arp) {
      const tones = [0, third, 7, 12];
      const k = tones[[0, 1, 2, 3, 2, 1, 2, 3][i]];
      v.tone({ f: mtof(base + 24 + k), t, d: sd * 0.8, type: 'square', v: 0.07, lp: 1800 });
    }
    if (def.pad && i === 0) {
      for (const k of [0, third, 7]) {
        v.tone({ f: mtof(base + 24 + k), t, d: sd * 8, type: 'triangle', v: 0.06, a: 0.4 });
      }
    }
    if (def.comp && (i === 2 || i === 6)) {
      for (const k of [0, third, 7]) {
        v.tone({ f: mtof(base + 24 + k), t, d: sd * 1.5, type: 'triangle', v: 0.05, a: 0.01 });
      }
    }

    if (def.kick[i] === '1') v.tone({ f: 140, to: 45, t, d: 0.16, v: 0.75, a: 0.003 });
    if (def.snare[i] === '1') {
      v.noise({ t, d: 0.12, type: 'highpass', f: 1500, v: 0.3 });
      v.tone({ f: 220, t, d: 0.07, type: 'triangle', v: 0.2 });
    }
    if (def.hat[i] === '1') {
      v.noise({ t, d: 0.04, type: 'highpass', f: 7000, v: i % 2 ? 0.1 : 0.14 });
    }
  }
}

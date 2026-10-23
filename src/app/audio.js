// Procedural audio: every sound and track is synthesised with WebAudio, no asset files.

const MUTE_KEY = 'naorush.muted';
const VOL_KEYS = { music: 'naorush.vol.music', sfx: 'naorush.vol.sfx' };
const VOL_DEFAULT = { music: 0.7, sfx: 0.8 };
// Bus gain at volume 1 (defaults land on the original 0.22 / 0.5 mix).
const BUS_GAIN = { music: 0.22 / 0.7, sfx: 0.5 / 0.8 };
const MASTER = 0.8;
const FADE = 0.6;
const LAYER_TC = 0.13; // setTargetAtTime constant: ~95 % after 0.4 s
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
 * @property {number} [lpTo] lowpass cutoff at the end (filter envelope)
 * @property {number} [q] lowpass resonance
 * @property {number} [det] adds a second oscillator detuned by this many cents
 * @property {number} [pan] stereo position -1..1
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
 * @property {number} [pan]
 */
/** @typedef {{ now: number, tone: (o: ToneOpts) => void, noise: (o: NoiseOpts) => void }} Voice */
/**
 * Patterns are 8 chars (eighth notes) or 16 chars (sixteenth notes) per bar.
 * @typedef {object} Track
 * @property {number} bpm
 * @property {number} root bass tonic (MIDI)
 * @property {number} lead melody octave offset above root (semitones)
 * @property {number[]} scale
 * @property {[number, boolean][]} chords one per bar: [semitone offset, isMinor]
 * @property {string[]} melody one pattern per bar: scale degree (base 36), '.' rest, '-' hold
 * @property {OscillatorType} wave
 * @property {number} cutoff
 * @property {string} bass 1 root, 2 octave, 3 third, 4 fourth, 5 fifth, b flat seventh
 * @property {'triangle'|'saw'|'slap'} [bassWave]
 * @property {string} kick
 * @property {string} snare
 * @property {string} hat '1' closed, 'o' open
 * @property {string} [clap]
 * @property {string} [stab] chord stabs
 * @property {number} [arp] base arpeggio resolution: 8 or 16
 * @property {boolean} [pad]
 * @property {OscillatorType} [padWave]
 * @property {boolean} [comp]
 * @property {boolean} [hum] server-room drone
 * @property {boolean} [bells] sine doubling of the melody one octave up
 * @property {boolean} [big] stadium drums
 * @property {number} [det] lead detune (cents)
 * @property {number} [echo] melody echo send 0..1
 * @property {OscillatorType} [leadWave] intensity-1 arpeggio wave
 * @property {boolean} [once] plays once instead of looping
 */
/**
 * @typedef {'title'|'parking'|'office'|'datacenter'|'copil'|'rooftop'|'bossJulien'|'bossRodolphe'|'win'|'gameover'|'credits'} TrackName
 */
/**
 * @typedef {object} Run
 * @property {TrackName} name
 * @property {Track} def
 * @property {GainNode} bus
 * @property {GainNode} base
 * @property {GainNode} drive
 * @property {GainNode} lead
 * @property {GainNode} wet melody send (to base + echo)
 * @property {AudioNode[]} nodes everything to disconnect on stop
 * @property {ReturnType<typeof setInterval> | null} timer
 * @property {number} step sixteenth index
 * @property {number} next
 */

const MAJOR = [0, 2, 4, 5, 7, 9, 11];
const MINOR = [0, 2, 3, 5, 7, 8, 10];
const DORIAN = [0, 2, 3, 5, 7, 9, 10];
const HARMONIC = [0, 2, 3, 5, 7, 8, 11];

/** @param {number} m */
const mtof = (m) => 440 * 2 ** ((m - 69) / 12);
/** @param {string} s e.g. '0 9m 5 7' */
const chords = (s) =>
  /** @type {[number, boolean][]} */ (s.split(' ').map((x) => [parseInt(x), x.endsWith('m')]));
/** @param {string} s */
const bars = (s) => s.split(' ');
/** @param {number} db */
const dbToGain = (db) => 10 ** (db / 20);
/** @param {number} x */
const clamp01 = (x) => Math.min(1, Math.max(0, Number.isFinite(x) ? x : 0));

/** @type {Record<TrackName, Track>} */
const SONGS = {
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
    bells: true,
    echo: 0.25,
  },
  parking: {
    bpm: 100,
    root: 41,
    lead: 24,
    scale: MINOR,
    wave: 'sawtooth',
    det: 9,
    cutoff: 1900,
    chords: chords('0m 8 3 10 0m 8 10 7'),
    melody: bars('7---4-5- 5---4-2- 2--4--7- 6---5-4- 7---9-a- b--a--9- a---9-8- 8-------'),
    bass: '11121112',
    bassWave: 'saw',
    kick: '1...1...',
    snare: '..1...1.',
    hat: '.1.1.1.1',
    pad: true,
    padWave: 'sawtooth',
    echo: 0.45,
    leadWave: 'triangle',
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
    echo: 0.15,
  },
  datacenter: {
    bpm: 124,
    root: 45,
    lead: 36,
    scale: MINOR,
    wave: 'sawtooth',
    det: 6,
    cutoff: 1800,
    chords: chords('0m 8 3 10 0m 8 3 10'),
    melody: bars('4...7.4. 5...7.5. 2...4.6. 6...8.6. 7.9.7.4. 9.7.5.7. 6.4.2.4. 6.8.a.8.'),
    bass: '1.1.1.2.',
    kick: '1...1...',
    snare: '......1.',
    hat: '.1.1.1.1',
    arp: 8,
    pad: true,
    hum: true,
    echo: 0.3,
  },
  copil: {
    bpm: 116,
    root: 43,
    lead: 24,
    scale: DORIAN,
    wave: 'square',
    cutoff: 2200,
    chords: chords('0m 5 0m 5 3 5 0m 7m'),
    melody: bars(
      '7..7..5.4.2.4... 5..5..4.3.4.5... 7..7..9.7.5.4... 5.4.3.2.3...0... ' +
        '2..2..4.5.4.2... 3..3..5.7.5.3... 4.5.7.9.a.9.7.5. 8...7...4...1...',
    ),
    bass: '1..21.2.1.b.1.2.',
    bassWave: 'slap',
    kick: '1.....1...1.....',
    snare: '....1.......1...',
    hat: '1.1.1.1o1.1.1.1o',
    clap: '............1...',
    comp: true,
    echo: 0.12,
  },
  rooftop: {
    bpm: 132,
    root: 40,
    lead: 24,
    scale: MAJOR,
    wave: 'square',
    det: 5,
    cutoff: 3000,
    chords: chords('0 7 9m 5 0 7 9m 5'),
    melody: bars('4.7.9.7. 4.68.64. 5.79.75. 7.53.57. 9.a.9.7. 8.6.4.6. 9.7.5.7. 7.5.7.9.'),
    bass: '1.1.5.1.',
    kick: '1.1.1.1.',
    snare: '..1...1.',
    hat: '.1.1.1.1',
    pad: true,
    bells: true,
    echo: 0.25,
  },
  bossJulien: {
    bpm: 140,
    root: 35,
    lead: 36,
    scale: HARMONIC,
    wave: 'sawtooth',
    det: 7,
    cutoff: 2000,
    chords: chords('0m 0m 8 8 5m 5m 7 7'),
    melody: bars('4...7.6. 7.4.2.0. 5...9.8. 7.5.4.2. 3...7.5. 3.4.5.6. 6...4... 6.8.6.4.'),
    bass: '11111112',
    bassWave: 'saw',
    kick: '1.1.1.1.',
    snare: '..1...1.',
    hat: '.1.1.1.1',
    arp: 16,
    pad: true,
    padWave: 'sawtooth',
    echo: 0.2,
    leadWave: 'triangle',
  },
  bossRodolphe: {
    bpm: 138,
    root: 36,
    lead: 24,
    scale: MINOR,
    wave: 'sawtooth',
    det: 10,
    cutoff: 2600,
    chords: chords('0m 0m 8 10 5m 8 7 7'),
    melody: bars('7---4--- 7-9-a-9- 7---5--- 6-8-9-8- a---7--- c-b-a-9- b---8--- 9-8-b---'),
    bass: '1.1.1.12',
    bassWave: 'saw',
    kick: '1.1...1.',
    snare: '....1...',
    hat: '1.1.1.1.',
    stab: '1..1..1.',
    pad: true,
    big: true,
    echo: 0.3,
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
    bells: true,
  },
  gameover: {
    bpm: 84,
    root: 41,
    lead: 24,
    scale: MAJOR,
    wave: 'triangle',
    cutoff: 2500,
    chords: chords('5m 0'),
    melody: bars('4-3-1--- 2---0---'),
    bass: '1-------',
    kick: '........',
    snare: '........',
    hat: '........',
    pad: true,
    bells: true,
    echo: 0.3,
    once: true,
  },
  credits: {
    bpm: 105,
    root: 43,
    lead: 24,
    scale: MAJOR,
    wave: 'triangle',
    cutoff: 3000,
    chords: chords('0 7 9m 4m 5 0 5 7'),
    melody: bars('4-2-4-7- 6---4--- 5-4-5-7- 6---4-2- 3-2-3-5- 4---2--- 3-4-5-7- 8---6-4-'),
    bass: '1..5.1.5',
    kick: '1...1...',
    snare: '..1...1.',
    hat: '.1.1.1.1',
    pad: true,
    comp: true,
    bells: true,
    echo: 0.3,
  },
};

/** Every playable track name, in display order. */
export const TRACKS = /** @type {TrackName[]} */ (Object.keys(SONGS));

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

  // --- movement ---
  step: (v) => {
    v.noise({ t: v.now, d: 0.04, f: 350, v: 0.1 });
    v.tone({ f: 95, to: 60, t: v.now, d: 0.05, v: 0.12 });
  },
  grab: (v) => {
    v.noise({ t: v.now, d: 0.05, type: 'bandpass', f: 1800, q: 1.5, v: 0.32 });
    v.tone({ f: 320, to: 190, t: v.now, d: 0.05, type: 'square', v: 0.08, lp: 1400 });
  },
  climb: (v) => {
    v.noise({ t: v.now, d: 0.18, type: 'bandpass', f: 600, to: 1800, v: 0.18, a: 0.06 });
    v.tone({ f: 200, to: 330, t: v.now, d: 0.12, type: 'triangle', v: 0.12 });
  },
  death: (v) => {
    for (let i = 0; i < 6; i++) {
      const f = 660 * 0.83 ** i;
      v.tone({ f, to: f * 0.9, t: v.now + i * 0.09, d: 0.1, type: 'square', v: 0.1, lp: 2000 });
    }
    v.tone({ f: 196, to: 180, t: v.now + 0.56, d: 0.45, type: 'triangle', v: 0.22, a: 0.02 });
    v.tone({ f: 294, t: v.now + 0.56, d: 0.45, type: 'triangle', v: 0.1, a: 0.02 });
  },
  respawn: (v) => {
    v.tone({ f: 1320, t: v.now, d: 0.06, type: 'square', v: 0.1, lp: 4000 });
    v.tone({ f: 1760, t: v.now + 0.08, d: 0.1, type: 'square', v: 0.1, lp: 4000 });
    for (const [i, f] of [2093, 2637, 3136, 4186].entries()) {
      v.tone({ f, t: v.now + 0.16 + i * 0.05, d: 0.3, v: 0.05, pan: i % 2 ? 0.4 : -0.4 });
    }
  },

  // --- office traps & props ---
  chairRoll: (v) => {
    v.noise({ t: v.now, d: 0.5, f: 300, v: 0.18, a: 0.05 });
    for (let i = 0; i < 10; i++) {
      const t = v.now + i * 0.045 + Math.random() * 0.015;
      v.noise({ t, d: 0.02, type: 'bandpass', f: 2200 + Math.random() * 900, q: 3, v: 0.14 });
    }
  },
  drawerOut: (v) => {
    v.noise({ t: v.now, d: 0.16, type: 'bandpass', f: 1200, to: 2600, q: 2, v: 0.2, a: 0.03 });
    v.tone({ f: 180, to: 90, t: v.now + 0.15, d: 0.12, v: 0.45 });
    v.noise({ t: v.now + 0.15, d: 0.05, f: 1500, v: 0.25 });
    v.tone({ f: 1250, t: v.now + 0.15, d: 0.28, v: 0.05 });
    v.tone({ f: 1873, t: v.now + 0.15, d: 0.22, v: 0.04 });
  },
  sprayOn: (v) => {
    v.noise({ t: v.now, d: 0.45, type: 'highpass', f: 4000, v: 0.2, a: 0.04 });
    v.noise({ t: v.now, d: 0.4, type: 'bandpass', f: 6500, q: 2, v: 0.12, a: 0.06 });
  },
  paperShot: (v) => {
    v.tone({ f: 400, to: 1300, t: v.now, d: 0.12, type: 'square', v: 0.08, lp: 2500 });
    v.noise({ t: v.now, d: 0.12, type: 'bandpass', f: 3000, q: 2, v: 0.15 });
    v.noise({ t: v.now + 0.13, d: 0.04, type: 'bandpass', f: 1500, v: 0.22 });
    v.noise({ t: v.now + 0.2, d: 0.04, type: 'bandpass', f: 1800, v: 0.16 });
  },
  trapdoor: (v) => {
    for (let i = 0; i < 4; i++) {
      v.tone({
        f: 170 + i * 25,
        t: v.now + i * 0.05,
        d: 0.06,
        type: 'sawtooth',
        v: 0.07,
        lp: 1100,
        q: 6,
      });
    }
    v.tone({ f: 220, to: 105, t: v.now + 0.24, d: 0.09, v: 0.45 });
    v.noise({ t: v.now + 0.24, d: 0.05, type: 'bandpass', f: 1000, v: 0.3 });
  },
  binderFall: (v) => {
    for (let i = 0; i < 4; i++) {
      const t = v.now + i * 0.08 + Math.random() * 0.02;
      v.tone({ f: 150 * (1 - i * 0.08), to: 70, t, d: 0.1, v: 0.32 });
      v.noise({ t, d: 0.06, f: 700, v: 0.2 });
    }
  },
  internStun: (v) => {
    v.tone({ f: 330, to: 200, t: v.now, d: 0.2, type: 'triangle', v: 0.25, lp: 1200 });
    v.noise({ t: v.now, d: 0.1, type: 'bandpass', f: 700, q: 2, v: 0.12 });
    for (let i = 0; i < 5; i++) {
      const t = v.now + 0.12 + i * 0.06 + Math.random() * 0.02;
      v.noise({ t, d: 0.03, type: 'bandpass', f: 2200 + Math.random() * 800, q: 2, v: 0.1 });
    }
  },
  vacuumBounce: (v) => {
    v.tone({ f: 160, to: 620, t: v.now, d: 0.09, v: 0.35 });
    v.tone({ f: 620, to: 230, t: v.now + 0.09, d: 0.26, v: 0.3 });
    v.tone({ f: 110, t: v.now, d: 0.45, type: 'sawtooth', v: 0.05, lp: 600, a: 0.05 });
    v.noise({ t: v.now, d: 0.45, type: 'bandpass', f: 900, q: 5, v: 0.08, a: 0.05 });
  },
  invite: (v) => {
    v.tone({ f: 1319, t: v.now, d: 0.4, v: 0.2 });
    v.tone({ f: 2638, t: v.now, d: 0.2, v: 0.04 });
    v.tone({ f: 1047, t: v.now + 0.22, d: 0.55, v: 0.2 });
    v.tone({ f: 2094, t: v.now + 0.22, d: 0.25, v: 0.04 });
  },
  visioMute: (v) => {
    v.noise({ t: v.now, d: 0.015, type: 'highpass', f: 3000, v: 0.25 });
    v.tone({ f: 620, to: 300, t: v.now + 0.01, d: 0.12, v: 0.28 });
  },
  heart: (v) => {
    v.noise({ t: v.now, d: 0.2, type: 'bandpass', f: 1500, to: 900, q: 3, v: 0.15, a: 0.05 });
    for (const [i, f] of [784, 988, 1175].entries()) {
      v.tone({ f, t: v.now + 0.22 + i * 0.08, d: 0.5, v: 0.12 });
    }
  },
  crack: (v) => {
    for (let i = 0; i < 6; i++) {
      const t = v.now + i * 0.028;
      v.noise({ t, d: 0.03, type: 'bandpass', f: 800 + Math.random() * 1400, q: 2, v: 0.3 });
    }
  },
  secret: (v) => {
    for (const [i, f] of [784, 988, 1175, 1568].entries()) {
      const t = v.now + i * 0.09;
      v.tone({ f, t, d: i === 3 ? 0.5 : 0.12, type: 'square', v: 0.09, lp: 4000 });
      v.tone({ f: f * 2, t, d: 0.3, v: 0.04, pan: i % 2 ? 0.5 : -0.5 });
    }
  },

  // --- bosses ---
  bossPhase: (v) => {
    v.noise({ t: v.now, d: 0.7, type: 'bandpass', f: 300, to: 4000, v: 0.28, a: 0.6 });
    v.tone({ f: 110, to: 440, t: v.now, d: 0.7, type: 'sawtooth', v: 0.1, lp: 1500, a: 0.5 });
    const t = v.now + 0.7;
    v.tone({ f: 80, to: 40, t, d: 0.5, v: 0.7 });
    v.noise({ t, d: 0.3, f: 800, v: 0.35 });
    for (const f of [220, 262, 330]) {
      v.tone({ f, t, d: 0.4, type: 'sawtooth', v: 0.07, lp: 2200, lpTo: 600 });
    }
  },
  telegraph: (v) => {
    v.tone({ f: 1760, t: v.now, d: 0.06, type: 'square', v: 0.1, lp: 4000 });
    v.tone({ f: 2349, t: v.now + 0.07, d: 0.08, type: 'square', v: 0.1, lp: 4000 });
  },
  rackDrop: (v) => v.tone({ f: 2400, to: 600, t: v.now, d: 0.6, v: 0.14, a: 0.05 }),
  rackLand: (v) => {
    v.tone({ f: 90, to: 40, t: v.now, d: 0.4, v: 0.7 });
    v.noise({ t: v.now, d: 0.25, type: 'bandpass', f: 2000, v: 0.28 });
    for (const f of [523, 1187, 1693, 2311]) v.tone({ f, t: v.now, d: 0.6, v: 0.045 });
  },
  teleport: (v) => {
    v.tone({ f: 200, to: 2400, t: v.now, d: 0.18, type: 'square', v: 0.09, lp: 3000 });
    v.noise({ t: v.now, d: 0.25, type: 'bandpass', f: 1000, to: 6000, v: 0.2, a: 0.04 });
    v.tone({ f: 2400, to: 800, t: v.now + 0.15, d: 0.15, v: 0.1 });
  },
  cableWarn: (v) => {
    v.tone({ f: 60, to: 120, t: v.now, d: 0.5, type: 'sawtooth', v: 0.12, lp: 800, a: 0.3 });
    v.tone({ f: 120, to: 240, t: v.now, d: 0.5, type: 'square', v: 0.05, lp: 600, a: 0.3 });
  },
  cableZap: (v) => {
    v.tone({ f: 120, t: v.now, d: 0.2, type: 'sawtooth', v: 0.14, lp: 2000 });
    for (let i = 0; i < 8; i++) {
      const t = v.now + Math.random() * 0.22;
      v.noise({ t, d: 0.02, type: 'highpass', f: 3000, v: 0.22 });
    }
  },
  fan: (v) => {
    for (let i = 0; i < 3; i++) {
      v.noise({
        t: v.now + i * 0.05,
        d: 0.3,
        type: 'bandpass',
        f: 800,
        to: 2500,
        v: 0.14,
        a: 0.1,
        pan: (i - 1) * 0.6,
      });
    }
  },
  dash: (v) => {
    v.noise({ t: v.now, d: 0.15, type: 'bandpass', f: 2000, to: 500, v: 0.3, a: 0.02 });
    v.tone({ f: 900, to: 400, t: v.now, d: 0.1, v: 0.08 });
  },
  zoneWarn: (v) => {
    for (const at of [0, 0.16]) {
      v.tone({ f: 988, t: v.now + at, d: 0.1, type: 'square', v: 0.11, lp: 2500 });
      v.tone({ f: 1319, t: v.now + at, d: 0.1, type: 'triangle', v: 0.08 });
    }
  },
  zoneHit: (v) => {
    v.tone({ f: 70, to: 35, t: v.now, d: 0.3, v: 0.7 });
    v.noise({ t: v.now, d: 0.35, type: 'highpass', f: 5000, v: 0.16 });
  },
  spot: (v) => {
    v.tone({ f: 120, to: 60, t: v.now, d: 0.12, v: 0.5 });
    v.noise({ t: v.now, d: 0.04, f: 1500, v: 0.25 });
    v.tone({ f: 120, t: v.now + 0.02, d: 0.4, v: 0.05, a: 0.05 });
  },
  curtain: (v) => v.noise({ t: v.now, d: 0.6, f: 600, to: 1800, q: 0.7, v: 0.3, a: 0.25 }),
  fireworks: (v) => {
    v.tone({ f: 300, to: 80, t: v.now, d: 0.08, v: 0.4 });
    v.noise({ t: v.now, d: 0.1, f: 1200, v: 0.3 });
    for (let i = 0; i < 12; i++) {
      const t = v.now + 0.25 + Math.random() * 0.6;
      v.noise({ t, d: 0.02, type: 'highpass', f: 4000, v: 0.15, pan: Math.random() - 0.5 });
    }
  },
  sign: (v) => {
    for (let i = 0; i < 6; i++) {
      const t = v.now + i * 0.045;
      v.noise({ t, d: 0.035, type: 'bandpass', f: 3000 + Math.random() * 1500, q: 3, v: 0.15 });
    }
    v.tone({ f: 140, to: 60, t: v.now + 0.35, d: 0.15, v: 0.5 });
    v.noise({ t: v.now + 0.35, d: 0.06, f: 600, v: 0.3 });
    for (const [i, f] of [523, 659, 784, 1047].entries()) {
      const t = v.now + 0.55 + i * 0.09;
      v.tone({ f, t, d: i === 3 ? 0.35 : 0.1, type: 'square', v: 0.1, lp: 3000 });
    }
  },

  // --- UI ---
  pause: (v) => {
    v.tone({ f: 1047, t: v.now, d: 0.06, type: 'square', v: 0.1, lp: 3000 });
    v.tone({ f: 784, t: v.now + 0.07, d: 0.1, type: 'square', v: 0.1, lp: 3000 });
  },
  resume: (v) => {
    v.tone({ f: 784, t: v.now, d: 0.06, type: 'square', v: 0.1, lp: 3000 });
    v.tone({ f: 1047, t: v.now + 0.07, d: 0.1, type: 'square', v: 0.1, lp: 3000 });
  },
  gameover: (v) => {
    for (const [i, f] of [523, 466, 392].entries()) {
      v.tone({ f, t: v.now + i * 0.16, d: 0.15, type: 'triangle', v: 0.25 });
    }
    v.tone({ f: 349, t: v.now + 0.48, d: 0.5, type: 'triangle', v: 0.25 });
    v.tone({ f: 440, t: v.now + 0.48, d: 0.5, v: 0.1 });
  },
  menuMove: (v) => {
    v.tone({ f: 1200, t: v.now, d: 0.02, type: 'square', v: 0.07, lp: 4000 });
    v.noise({ t: v.now, d: 0.01, type: 'highpass', f: 5000, v: 0.08 });
  },
};

/* AUDIT-TRIM-START */
/** Loudness trim per effect (dB), measured so all effects sit at a similar RMS. @type {Record<string, number>} */
const SFX_TRIM_DB = {
  jump: 21,
  airjump: 9,
  land: 20,
  hardland: 4,
  ticket: 10,
  ammo: 13,
  checkpoint: 12,
  door: 10,
  key: 9,
  collapse: 18,
  smash: 7,
  splash: 17,
  hurt: 8,
  zap: 9,
  bump: 4,
  meeting: 9,
  empty: 12,
  fire: 19,
  parry: 7,
  block: 1,
  bossStart: 4,
  bossThrow: 21,
  bossHit: 2,
  bossDone: 10,
  consult: 6,
  slam: 2,
  poof: 16,
  win: 15,
  talk: 13,
  select: 8,
  confirm: 8,
  step: 13,
  grab: 10,
  climb: 12,
  death: 11,
  respawn: 17,
  chairRoll: 24,
  drawerOut: 8,
  sprayOn: 10,
  paperShot: 18,
  trapdoor: 8,
  binderFall: 6,
  internStun: 13,
  vacuumBounce: 6,
  invite: 8,
  visioMute: 7,
  heart: 11,
  crack: 22,
  secret: 13,
  bossPhase: 5,
  telegraph: 11,
  rackDrop: 11,
  rackLand: 4,
  teleport: 14,
  cableWarn: 17,
  cableZap: 11,
  fan: 20,
  dash: 15,
  zoneWarn: 13,
  zoneHit: 4,
  spot: 5,
  curtain: 18,
  fireworks: 11,
  sign: 9,
  pause: 11,
  resume: 11,
  gameover: 12,
  menuMove: 15,
};
/** Loudness trim per track (dB), measured so all tracks sit at a similar RMS. @type {Record<TrackName, number>} */
const TRACK_TRIM_DB = {
  title: 4,
  parking: 4,
  office: 2,
  datacenter: 4,
  copil: 2,
  rooftop: 1,
  bossJulien: 2,
  bossRodolphe: 1,
  win: 2,
  gameover: 8,
  credits: 4,
};
/* AUDIT-TRIM-END */

/** Every sound effect name. */
export const SFX_TYPES = Object.keys(SFX);

/** @typedef {'music'|'sfx'} Bus */

/** @param {string} key */
function load(key) {
  try {
    return globalThis.localStorage?.getItem(key) ?? null;
  } catch {
    return null;
  }
}
/** @param {string} key @param {string} value */
function save(key, value) {
  try {
    globalThis.localStorage?.setItem(key, value);
  } catch {
    /* storage unavailable */
  }
}
/** @param {Bus} bus */
function loadVolume(bus) {
  const raw = load(VOL_KEYS[bus]);
  const n = raw === null ? NaN : Number(raw);
  return Number.isFinite(n) ? clamp01(n) : VOL_DEFAULT[bus];
}

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
    /** @type {Run | null} */
    this.run = null;
    /** @type {TrackName | null} */
    this.wanted = null;
    this._muted = load(MUTE_KEY) === '1';
    this._vol = { music: loadVolume('music'), sfx: loadVolume('sfx') };
    this._intensity = 0;
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
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -6;
    limiter.knee.value = 0;
    limiter.ratio.value = 20;
    limiter.attack.value = 0.001;
    limiter.release.value = 0.1;
    const master = ctx.createGain();
    master.gain.value = this._muted ? 0 : MASTER;
    master.connect(comp).connect(limiter).connect(ctx.destination);
    const sfx = ctx.createGain();
    sfx.gain.value = BUS_GAIN.sfx * this._vol.sfx;
    sfx.connect(master);
    const music = ctx.createGain();
    music.gain.value = BUS_GAIN.music * this._vol.music;
    music.connect(master);
    const buf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    Object.assign(this, { ctx, buf, master, sfxBus: sfx, musicBus: music });
  }

  /** @param {boolean} m */
  setMuted(m) {
    this._muted = m;
    save(MUTE_KEY, m ? '1' : '0');
    if (this.ctx && this.master) {
      this.master.gain.setTargetAtTime(m ? 0 : MASTER, this.ctx.currentTime, 0.03);
    }
  }

  /** @param {Bus} bus @param {number} v 0..1 */
  setVolume(bus, v) {
    if (bus !== 'music' && bus !== 'sfx') return;
    const vol = clamp01(v);
    this._vol[bus] = vol;
    save(VOL_KEYS[bus], String(vol));
    const node = bus === 'music' ? this.musicBus : this.sfxBus;
    if (this.ctx && node)
      node.gain.setTargetAtTime(BUS_GAIN[bus] * vol, this.ctx.currentTime, 0.03);
  }

  /** @param {Bus} bus */
  getVolume(bus) {
    return bus === 'music' || bus === 'sfx' ? this._vol[bus] : 0;
  }

  /**
   * Dynamic layers on the current track: 0 = base, > 0.5 adds drums + bass octave,
   * 1 adds a lead arpeggio. Ramps smoothly, never restarts the track.
   * @param {number} level 0..1
   */
  intensity(level) {
    this._intensity = clamp01(level);
    if (this.ctx && this.run) this.#applyLayers(this.run, this.ctx.currentTime);
  }

  /** @param {Run} run @param {number} now */
  #applyLayers(run, now) {
    const [drive, lead] = this.#layerTargets();
    run.drive.gain.setTargetAtTime(drive, now, LAYER_TC);
    run.lead.gain.setTargetAtTime(lead, now, LAYER_TC);
  }

  #layerTargets() {
    const x = this._intensity;
    return [clamp01((x - 0.45) / 0.15), clamp01((x - 0.8) / 0.2)];
  }

  /** @param {string} type */
  sfx(type) {
    const play = Object.hasOwn(SFX, type) ? SFX[type] : undefined;
    if (!play || !this.ctx || !this.sfxBus) return;
    // Per-sound loudness trim, so every effect lands at a comparable level.
    const trim = this.ctx.createGain();
    trim.gain.value = dbToGain(SFX_TRIM_DB[type] ?? 0);
    trim.connect(this.sfxBus);
    play(this.#voice(trim, 1 + (Math.random() - 0.5) * 0.08));
  }

  /** @param {TrackName | 'boss' | null} track 'boss' is an alias of 'bossJulien' */
  music(track) {
    const name = track === 'boss' ? 'bossJulien' : track;
    if (name !== null && !Object.hasOwn(SONGS, name)) return;
    this.wanted = name;
    const ctx = this.ctx;
    if (!ctx || !this.musicBus) return;
    if (this.run && this.run.name === name) return;
    const now = ctx.currentTime;
    const old = this.run;
    this.run = null;
    if (old) this.#stop(old, now);
    if (!name) return;
    const def = SONGS[name];
    const bus = ctx.createGain();
    bus.gain.setValueAtTime(0, now);
    bus.gain.linearRampToValueAtTime(1, now + FADE);
    const trim = ctx.createGain();
    trim.gain.value = dbToGain(TRACK_TRIM_DB[name]);
    trim.connect(this.musicBus);
    bus.connect(trim);
    const [d0, l0] = this.#layerTargets();
    const layer = (/** @type {number} */ g) => {
      const n = ctx.createGain();
      n.gain.value = g;
      n.connect(bus);
      return n;
    };
    const base = layer(1);
    const drive = layer(d0);
    const lead = layer(l0);
    const wet = ctx.createGain();
    wet.connect(base);
    /** @type {AudioNode[]} */
    const nodes = [bus, trim, base, drive, lead, wet];
    if (def.echo) {
      const delay = ctx.createDelay(1);
      delay.delayTime.value = (60 / def.bpm) * 0.75;
      const fb = ctx.createGain();
      fb.gain.value = 0.32;
      const tone = ctx.createBiquadFilter();
      tone.frequency.value = 2400;
      const send = ctx.createGain();
      send.gain.value = def.echo;
      wet.connect(send);
      lead.connect(send);
      send.connect(delay).connect(tone).connect(fb).connect(delay);
      tone.connect(bus);
      nodes.push(delay, fb, tone, send);
    }
    /** @type {Run} */
    const run = { name, def, bus, base, drive, lead, wet, nodes, timer: null, step: 0, next: now };
    run.next = now + 0.08;
    const total = Math.max(def.melody.length, def.chords.length) * 16;
    run.timer = setInterval(() => {
      while (run.next < ctx.currentTime + LOOKAHEAD) {
        if (def.once && run.step >= total) {
          if (run.timer) clearInterval(run.timer);
          run.timer = null;
          return;
        }
        this.#step(run, total);
        run.next += 60 / def.bpm / 4;
        run.step++;
      }
    }, TICK_MS);
    this.run = run;
  }

  /** @param {Run} run @param {number} now */
  #stop(run, now) {
    if (run.timer) clearInterval(run.timer);
    run.timer = null;
    const g = run.bus.gain;
    g.cancelScheduledValues(now);
    g.setValueAtTime(g.value, now);
    g.linearRampToValueAtTime(0, now + FADE);
    setTimeout(
      () => {
        for (const n of run.nodes) n.disconnect();
      },
      (FADE + 0.3) * 1000,
    );
  }

  /** @param {AudioNode} dest @param {number} [pitch] frequency multiplier @returns {Voice} */
  #voice(dest, pitch = 1) {
    const ctx = /** @type {AudioContext} */ (this.ctx);
    const buf = /** @type {AudioBuffer} */ (this.buf);
    /** @param {AudioNode} node @param {number | undefined} pan */
    const out = (node, pan) => {
      if (pan && ctx.createStereoPanner) {
        const p = ctx.createStereoPanner();
        p.pan.value = Math.max(-1, Math.min(1, pan));
        node.connect(p).connect(dest);
      } else node.connect(dest);
    };
    return {
      now: ctx.currentTime,
      tone: ({ f, t, d, type = 'sine', v = 0.3, to, a = 0.005, lp, lpTo, q, det, pan }) => {
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(v, t + Math.min(a, d / 2));
        g.gain.exponentialRampToValueAtTime(0.0001, t + d);
        const oscs = [ctx.createOscillator()];
        if (det) oscs.push(ctx.createOscillator());
        oscs.forEach((osc, i) => {
          osc.type = type;
          osc.frequency.setValueAtTime(f * pitch, t);
          if (to) osc.frequency.exponentialRampToValueAtTime(to * pitch, t + d);
          if (i === 1 && det) osc.detune.value = det;
          osc.connect(g);
          osc.start(t);
          osc.stop(t + d + 0.05);
        });
        if (lp) {
          const filter = ctx.createBiquadFilter();
          filter.frequency.setValueAtTime(lp, t);
          if (lpTo) filter.frequency.exponentialRampToValueAtTime(lpTo, t + d);
          if (q) filter.Q.value = q;
          out(g.connect(filter), pan);
        } else out(g, pan);
      },
      noise: ({ t, d, type = 'lowpass', f = 2000, to, q = 1, v = 0.3, a = 0.005, pan }) => {
        const src = ctx.createBufferSource();
        src.buffer = buf;
        src.loop = true;
        const filter = ctx.createBiquadFilter();
        filter.type = type;
        filter.Q.value = q;
        filter.frequency.setValueAtTime(f * pitch, t);
        if (to) filter.frequency.exponentialRampToValueAtTime(to * pitch, t + d);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(v, t + Math.min(a, d / 2));
        g.gain.exponentialRampToValueAtTime(0.0001, t + d);
        out(src.connect(filter).connect(g), pan);
        src.start(t, Math.random() * 0.5);
        src.stop(t + d + 0.05);
      },
    };
  }

  /**
   * Schedules one sixteenth-note step of a track at run.next.
   * @param {Run} run
   * @param {number} total loop length in sixteenths
   */
  #step(run, total) {
    const { def } = run;
    const t = run.next;
    const s16 = 60 / def.bpm / 4;
    const s = run.step % total;
    const bar = Math.floor(s / 16);
    const i = s % 16;
    const lastBar = bar === total / 16 - 1;
    const [off, minor] = def.chords[bar % def.chords.length];
    const third = minor ? 3 : 4;
    const base = def.root + off;
    /** char of an 8- or 16-step pattern at this sixteenth, '.' between eighths */
    const at = (/** @type {string} */ p) =>
      p.length === 16 ? p[i] : i % 2 ? '.' : (p[i / 2] ?? '.');
    const unit = (/** @type {string} */ p) => (p.length === 16 ? s16 : s16 * 2);
    const [driveT, leadT] = this.#layerTargets();
    const driveOn = driveT > 0 || run.drive.gain.value > 0.001;
    const leadOn = leadT > 0 || run.lead.gain.value > 0.001;

    const v = this.#voice(run.base);
    const wet = this.#voice(run.wet);
    const drive = this.#voice(run.drive);
    const lead = this.#voice(run.lead);

    // Melody
    const mbar = def.melody[bar % def.melody.length];
    const m = at(mbar);
    if (m !== '.' && m !== '-') {
      const k = mbar.length === 16 ? i : i / 2;
      let holds = 0;
      while (mbar[k + 1 + holds] === '-') holds++;
      const len = holds ? holds + 0.9 : mbar[k + 1] === '.' ? 1.8 : 0.9;
      const deg = parseInt(m, 36);
      const note = def.root + def.lead + def.scale[deg % 7] + 12 * Math.floor(deg / 7);
      const d = unit(mbar) * len;
      const level = def.det ? 0.08 : 0.12;
      wet.tone({
        f: mtof(note),
        t,
        d,
        type: def.wave,
        v: level,
        lp: def.cutoff,
        a: 0.01,
        det: def.det,
      });
      if (def.bells) wet.tone({ f: mtof(note + 12), t, d: d * 0.8, v: 0.035, a: 0.005 });
    }

    // Bass
    const b = at(def.bass);
    if (b !== '.' && b !== '-') {
      /** @type {Record<string, number>} */
      const shifts = { 1: 0, 2: 12, 3: third, 4: 5, 5: 7, b: 10 };
      const k = def.bass.length === 16 ? i : i / 2;
      let holds = 0;
      while (def.bass[k + 1 + holds] === '-') holds++;
      const d = unit(def.bass) * (holds ? holds + 0.9 : 0.9);
      const f = mtof(base + (shifts[b] ?? 0));
      if (def.bassWave === 'saw') {
        v.tone({ f, t, d, type: 'sawtooth', v: 0.3, lp: 900, lpTo: 300, q: 3, a: 0.005 });
      } else if (def.bassWave === 'slap') {
        v.tone({ f, t, d, type: 'sawtooth', v: 0.32, lp: 2600, lpTo: 260, q: 4, a: 0.002 });
        v.tone({ f, t, d, type: 'triangle', v: 0.3, a: 0.004 });
      } else {
        v.tone({ f, t, d, type: 'triangle', v: 0.5, a: 0.008 });
      }
      if (driveOn) {
        drive.tone({ f: f * 2, t, d: d * 0.8, type: 'sawtooth', v: 0.1, lp: 1300, lpTo: 400 });
      }
    }

    // Harmony
    const triad = [0, third, 7];
    if (def.arp && (def.arp === 16 || i % 2 === 0)) {
      const seq = [0, third, 7, 12, 7, third, 12, 7 + 12];
      const k = seq[(def.arp === 16 ? i : i / 2) % 8];
      wet.tone({
        f: mtof(base + 24 + k),
        t,
        d: s16 * (def.arp === 16 ? 0.9 : 1.6),
        type: 'square',
        v: def.arp === 16 ? 0.05 : 0.07,
        lp: 1800,
        pan: i % 4 < 2 ? -0.3 : 0.3,
      });
    }
    if ((def.pad || def.hum) && i === 0) {
      const d = s16 * 16 + 0.05;
      if (def.pad) {
        const saw = def.padWave === 'sawtooth';
        for (const k of triad) {
          v.tone({
            f: mtof(base + 24 + k),
            t,
            d,
            type: def.padWave ?? 'triangle',
            v: saw ? 0.035 : 0.06,
            a: 0.4,
            lp: saw ? 1100 : undefined,
            det: saw ? 8 : undefined,
          });
        }
      }
      if (def.hum) {
        v.tone({ f: mtof(def.root + 12), t, d, type: 'sawtooth', v: 0.06, a: 0.3, lp: 260 });
        v.noise({ t, d, type: 'bandpass', f: 120, q: 4, v: 0.08, a: 0.3 });
      }
    }
    if (def.comp && (i === 4 || i === 12 || (def.bassWave === 'slap' && i === 10))) {
      for (const k of triad) {
        v.tone({ f: mtof(base + 24 + k), t, d: s16 * 3, type: 'triangle', v: 0.05, a: 0.01 });
      }
    }
    if (def.stab && at(def.stab) === '1') {
      for (const k of [0, third, 7, 12]) {
        const f = mtof(base + 24 + k);
        v.tone({ f, t, d: 0.22, type: 'sawtooth', v: 0.04, lp: 2600, lpTo: 700, det: 12 });
      }
    }

    // Drums
    const kick = (/** @type {Voice} */ to, /** @type {number} */ g) => {
      to.tone({ f: def.big ? 130 : 150, to: 42, t, d: def.big ? 0.28 : 0.18, v: g, a: 0.003 });
      to.noise({ t, d: 0.015, type: 'highpass', f: 3000, v: 0.05 });
    };
    if (at(def.kick) === '1') kick(v, 0.75);
    if (at(def.snare) === '1') {
      if (def.big) {
        v.noise({ t, d: 0.35, type: 'bandpass', f: 1800, q: 0.6, v: 0.35 });
        v.tone({ f: 180, to: 140, t, d: 0.12, type: 'triangle', v: 0.3 });
        this.#clap(v, t, 0.18);
      } else {
        v.noise({ t, d: 0.12, type: 'highpass', f: 1500, v: 0.3 });
        v.tone({ f: 220, t, d: 0.07, type: 'triangle', v: 0.2 });
      }
    }
    if (def.clap && at(def.clap) === '1') this.#clap(v, t, 0.14);
    const h = at(def.hat);
    if (h === '1' || h === 'o') {
      const d = h === 'o' ? 0.16 : 0.04;
      v.noise({ t, d, type: 'highpass', f: 7000, v: i % 4 ? 0.1 : 0.14 });
    }

    // Drive layer: sixteenth hats, extra kicks, claps, a fill on the last bar
    if (driveOn && !def.once) {
      drive.noise({ t, d: 0.03, type: 'highpass', f: 8000, v: i % 2 ? 0.05 : 0.08, pan: 0.25 });
      if (i === 10 || (i === 14 && bar % 2)) kick(drive, 0.5);
      if (i === 4 || i === 12) this.#clap(drive, t, 0.1);
      if (lastBar && i >= 12) {
        drive.tone({ f: [220, 180, 150, 120][i - 12], to: 70, t, d: 0.16, v: 0.3, a: 0.003 });
      }
    }

    // Lead layer: sparkling counter arpeggio
    if (leadOn && !def.once) {
      const seq = [12, 7, third + 12, 7, 19, 12, third + 12, 7];
      const note = base + 36 + seq[i % 8] - (i >= 8 ? 12 : 0);
      lead.tone({
        f: mtof(note),
        t,
        d: s16 * 0.9,
        type: def.leadWave ?? 'square',
        v: 0.045,
        lp: 3200,
        pan: i % 2 ? 0.45 : -0.45,
      });
    }
  }

  /** @param {Voice} v @param {number} t @param {number} g */
  #clap(v, t, g) {
    for (const k of [0, 0.012, 0.024]) {
      v.noise({ t: t + k, d: k === 0.024 ? 0.12 : 0.02, type: 'bandpass', f: 1300, q: 1.2, v: g });
    }
  }
}

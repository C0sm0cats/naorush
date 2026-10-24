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
 * @property {string} bass 1 root, 2 octave, 3 third, 4 fourth, 5 fifth, b flat seventh,
 *   w chromatic approach to the next bar's root
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
 * @property {Section[]} [form] song form; each section lasts as long as its melody (default: once)
 */
/**
 * One song section; unset fields inherit the track's own (A section) values.
 * @typedef {object} Section
 * @property {[number, boolean][]} [chords]
 * @property {string[]} [melody]
 * @property {string[]} [counter] countermelody, melody syntax, one octave below the melody
 * @property {string} [bass]
 * @property {string} [kick]
 * @property {string} [snare]
 * @property {string} [hat]
 * @property {string} [clap]
 * @property {string} [stab]
 * @property {boolean} [thin] breakdown: the drive layer drops its kicks and claps
 */
/**
 * One compiled bar of a song form.
 * @typedef {object} Bar
 * @property {[number, boolean]} chord
 * @property {string} mel
 * @property {string} counter
 * @property {string} bass
 * @property {string} kick
 * @property {string} snare
 * @property {string} hat
 * @property {string} clap
 * @property {string} stab
 * @property {boolean} thin
 * @property {number} sec section index in the form
 * @property {boolean} start first bar of its section
 * @property {boolean} fill last bar of its section (drum fill)
 * @property {number} next chord offset of the following bar (wraps at the loop point)
 */
/**
 * @typedef {'title'|'parking'|'office'|'datacenter'|'copil'|'rooftop'|'bossJulien'|'bossRodolphe'|'win'|'gameover'|'credits'} TrackName
 */
/**
 * @typedef {object} Run
 * @property {TrackName} name
 * @property {Track} def
 * @property {Bar[]} bars
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

/** @param {string[]} a @param {Record<number, string>} edits bar index -> replacement */
const vary = (a, edits) => a.map((x, k) => edits[k] ?? x);

const PARKING_A = bars('7---4-5- 5---4-2- 2--4--7- 6---5-4- 7---9-a- b--a--9- a---9-8- 8-------');

// Looping tracks follow an A (8 bars) / B (8 bars) / A' (countermelody) / bridge (4 bars) form;
// every bridge ends on a dominant-ish chord that resolves into bar 1 at the loop point.
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
    form: [
      {},
      {
        chords: chords('5 7 4m 9m 5 7 0 7'),
        melody: bars('a-9-7-5- b-a-8-6- 9---b-9- 7-6-5--- a-9-a-c- b---8-6- 7-9-b-9- 8---6-4-'),
        bass: '1.3.5.3w',
        kick: '1..11...',
        snare: '..1...1.',
      },
      {
        counter: bars('9------- 9---7--- 7---5--- 6---8--- 7---9--- 7---c--- a---c--- b---8---'),
        bass: '1.5.1.5w',
      },
      {
        chords: chords('5 9m 5 7'),
        melody: bars('7------- c---9--- a---7--- 8---6---'),
        bass: '1-------',
        kick: '1.......',
        snare: '........',
        hat: '...1...1',
        thin: true,
      },
    ],
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
    melody: PARKING_A,
    bass: '11121112',
    bassWave: 'saw',
    kick: '1...1...',
    snare: '..1...1.',
    hat: '.1.1.1.1',
    pad: true,
    padWave: 'sawtooth',
    echo: 0.45,
    leadWave: 'triangle',
    form: [
      {},
      {
        chords: chords('8 10 7m 0m 8 10 7 7'),
        melody: bars('9---7--- a---8-6- 8---6-4- 7------- c---9--- a---8-a- b---8--- 8---4---'),
        bass: '1.5.2.5w',
        kick: '1..1..1.',
        hat: '.1.11.1.',
      },
      {
        melody: vary(PARKING_A, { 1: '5---7-4-', 3: '6---a-8-', 5: 'c---9-a-', 6: 'a---8-7-' }),
        counter: bars('2---4--- 5---2--- 4---6--- 6---3--- 4---2--- 5---7--- 6---8--- 8---4---'),
        bass: '1112111w',
      },
      {
        chords: chords('0m 8 5m 7'),
        melody: bars('4------- 5---2--- 3---5--- 4---1---'),
        bass: '1-------',
        kick: '........',
        snare: '........',
        thin: true,
      },
    ],
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
    form: [
      {},
      {
        chords: chords('9m 5 0 7 9m 5 7 7'),
        melody: bars('5.75.97. 3.53.75. 7.97.b9. b.a.8.6. 9.7.5.7. a.7.5.3. 4.64.86. 4.6.8.6.'),
        bass: '1..51.5w',
        kick: '1..1..1.',
        hat: '1o1o1o1o',
      },
      {
        counter: bars('7---4--- 5---3--- 4---2--- 6---4--- 7---9--- 7---5--- 6---8--- 9---7---'),
        bass: '1..21.2w',
      },
      {
        chords: chords('5 7 9m 7'),
        melody: bars('7---5--- 6---4--- 5---9--- 8---6---'),
        bass: '1...5...',
        kick: '1...1...',
        snare: '........',
        hat: '.1.1.1.1',
        thin: true,
      },
    ],
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
    form: [
      {},
      {
        chords: chords('5m 0m 8 10 5m 0m 8 7m'),
        melody: bars('3...5.3. 4...2.0. 5...2.0. 6...3.1. 3.5.7.5. 4.2.4.7. 5.4.2.0. 4...1...'),
        bass: '1.1.5.2.',
        kick: '1..1.1..',
        snare: '....1...',
        hat: '.1.1.111',
      },
      {
        chords: chords('8 10 7m 10'),
        melody: bars('0------- 1---3--- 4---6--- 6---3---'),
        bass: '1-------',
        kick: '........',
        snare: '........',
        hat: '...1...1',
        thin: true,
      },
      {
        counter: bars('2---0--- 0---2--- 2---4--- 3---1--- 2---4--- 5---2--- 4---2--- 1---3---'),
        bass: '1.1.1.2w',
      },
    ],
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
        '2..2..4.6.4.2... 3..3..5.7.5.3... 4.5.7.9.a.9.7.5. 8...7...4...1...',
    ),
    bass: '1..21.2.1.b.1.2.',
    bassWave: 'slap',
    kick: '1.....1...1.....',
    snare: '....1.......1...',
    hat: '1.1.1.1o1.1.1.1o',
    clap: '............1...',
    comp: true,
    echo: 0.12,
    form: [
      {},
      {
        chords: chords('10 5 7m 0m 10 5 2m 7m'),
        melody: bars(
          'a...a.8.6...8... 7..7..5.3...5... 4..4..6.8.6.4... 7...4...2..3.4.. ' +
            '6..6..8.a.8.6... 5..5..7.a.7.5... 8..8..a.5...3... 4...6...8...b...',
        ),
        bass: '1..2..1.5.3.1.2w',
        kick: '1.....1.1.1.....',
        hat: '1.1o1.1.1.1o1.1o',
      },
      {
        counter: bars('4---2--- 5---3--- 4---7--- 5---3--- 4---6--- 5---7--- 4---2--- 1---4---'),
        bass: '1..21.2.1.b.1.2w',
      },
      {
        chords: chords('3 5 10 5'),
        melody: bars('2-------4------- 3-------5------- 6-------8------- 7-------5---3---'),
        bass: '1.......1.....5.',
        kick: '1...............',
        snare: '............1...',
        hat: '..1...1...1...1.',
        clap: '................',
        thin: true,
      },
    ],
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
    form: [
      {},
      {
        chords: chords('5 7 4m 9m 5 7 0 7'),
        melody: bars('a.9.7.5. b.a.8.6. 9.b.9.6. c.b.9.7. a.c.e.c. b.8.6.8. 7.9.b.9. 8.6.4.6.'),
        bass: '1.2.5.2w',
        hat: '.o.o.o.o',
      },
      {
        counter: bars('7---9--- 6---8--- 5---7--- 5---3--- 4---7--- 4---6--- 5---9--- a---7---'),
        bass: '1.1.5.1w',
      },
      {
        chords: chords('9m 5 0 7'),
        melody: bars('7------- 5---7--- 4---7--- 6---8---'),
        bass: '1---5---',
        kick: '........',
        snare: '........',
        thin: true,
      },
    ],
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
    form: [
      {},
      {
        chords: chords('5m 7 0m 8 5m 7 8 7'),
        melody: bars(
          '7.5.3.5.7...3... 6.4.1.4.6...8... 7.4.2.4.7.9.7.4. 5.2.0.2.5...9... ' +
            '3.5.7.9.a.9.7.5. 4.6.8.6.4...1... 5.7.9.7.5.4.2.0. 1...4...6...8...',
        ),
        bass: '12151215',
        kick: '1.1.1.11',
        hat: '11111111',
      },
      {
        counter: bars('4---2--- 0---2--- 2---0--- 5---2--- 3---5--- 7---5--- 6---4--- 4---1---'),
        bass: '1111111w',
      },
      {
        chords: chords('8 8 7 7'),
        melody: bars('5------- 7---9--- 6------- 4---8---'),
        bass: '11111111',
        snare: '........',
        hat: '11111111',
        thin: true,
      },
    ],
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
    melody: bars('7---4--- 7-9-b-9- 7---5--- 6-8-a-8- a---7--- c-b-9-a- b---8--- 8-7-8-b-'),
    bass: '1.1.1.12',
    bassWave: 'saw',
    kick: '1.1...1.',
    snare: '....1...',
    hat: '1.1.1.1.',
    stab: '1..1..1.',
    pad: true,
    big: true,
    echo: 0.3,
    form: [
      {},
      {
        chords: chords('8 10 0m 3 8 5m 7 7'),
        melody: bars('e-d-c--- d---a--- b-c-b-9- b---9--- c-b-c-e- e---c-a- b---8--- 8-9-8-7-'),
        bass: '1.1.5.12',
        kick: '1...1...',
        snare: '..1...1.',
        stab: '1.....1.',
      },
      {
        counter: bars('9---b--- b---9--- 9---7--- 8---6--- 7---5--- 7---9--- b---8--- 8---b---'),
        bass: '1.1.1.1w',
      },
      {
        chords: chords('8 8 7 7'),
        melody: bars('c------- e---c--- b------- 8---b---'),
        bass: '1-------',
        kick: '1.......',
        snare: '........',
        stab: '1.......',
        thin: true,
      },
    ],
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
    form: [
      {},
      {
        chords: chords('5 7 4m 9m 5 7 0 7'),
        melody: bars('7-5-3-5- 8---6-4- 6---4-2- 5---7--- a-9-7-5- 8---4-6- 7---9--- 8-6-4---'),
        bass: '1.2.5.3w',
      },
      {
        counter: bars('2---4--- 1---4--- 2---0--- 4---6--- 5---3--- 4---2--- 3---5--- 6---4---'),
        bass: '1..5.1.w',
      },
      {
        chords: chords('9m 5 2m 7'),
        melody: bars('9------- 7---a--- 8---5--- 6---8---'),
        bass: '1...5...',
        kick: '1.......',
        snare: '........',
        thin: true,
      },
    ],
  },
};

/**
 * Flattens a track's form into one entry per bar.
 * @param {Track} def
 * @returns {Bar[]}
 */
function compile(def) {
  /** @type {Bar[]} */
  const out = [];
  (def.form ?? [{}]).forEach((sec, si) => {
    const melody = sec.melody ?? def.melody;
    const ch = sec.chords ?? def.chords;
    const n = Math.max(melody.length, ch.length);
    for (let k = 0; k < n; k++) {
      out.push({
        chord: ch[k % ch.length],
        mel: melody[k % melody.length],
        counter: sec.counter ? sec.counter[k % sec.counter.length] : '',
        bass: sec.bass ?? def.bass,
        kick: sec.kick ?? def.kick,
        snare: sec.snare ?? def.snare,
        hat: sec.hat ?? def.hat,
        clap: sec.clap ?? def.clap ?? '',
        stab: sec.stab ?? def.stab ?? '',
        thin: !!sec.thin,
        sec: si,
        start: k === 0,
        fill: k === n - 1,
        next: 0,
      });
    }
  });
  out.forEach((b, k) => (b.next = out[(k + 1) % out.length].chord[0]));
  return out;
}

/** Every playable track name, in display order. */
export const TRACKS = /** @type {TrackName[]} */ (Object.keys(SONGS));
const BARS = /** @type {Record<TrackName, Bar[]>} */ (
  Object.fromEntries(TRACKS.map((n) => [n, compile(SONGS[n])]))
);

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

const AMB_FADE = 1;
const AMBIENCE_NAMES = ['office', 'datacenter', 'parking', 'rooftop', 'copil'];
// Per-bed output trim (dB), tuned so each bed sits around -40 dBFS RMS at default volumes.
const AMB_TRIM_DB = { office: -12, datacenter: -26, parking: -19, rooftop: -22, copil: -16 };

/**
 * Builds one ambient bed into `dest`. Random events use their own timeouts, all cleared by `stop`.
 * @param {AudioContext} ctx @param {AudioBuffer} buf @param {AudioNode} dest @param {string} name
 */
function buildBed(ctx, buf, dest, name) {
  /** @type {AudioNode[]} */
  const nodes = [];
  /** @type {AudioScheduledSourceNode[]} */
  const sources = [];
  /** @type {ReturnType<typeof setTimeout>[]} */
  const timers = [];
  let alive = true;
  /** @param {AudioNode} n */
  const keep = (n) => {
    nodes.push(n);
    return n;
  };
  /** @param {number} v */
  const gain = (v) => {
    const g = ctx.createGain();
    g.gain.value = v;
    return /** @type {GainNode} */ (keep(g));
  };
  /** @param {BiquadFilterType} type @param {number} f @param {number} [q] */
  const filt = (type, f, q = 0.7) => {
    const b = ctx.createBiquadFilter();
    b.type = type;
    b.frequency.value = f;
    b.Q.value = q;
    return /** @type {BiquadFilterNode} */ (keep(b));
  };
  /** @param {OscillatorType} type @param {number} f */
  const osc = (type, f) => {
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.value = f;
    o.start();
    sources.push(o);
    return o;
  };
  /** Looping noise from a random offset, optionally through a chain, then a gain into `to`. */
  const noise = (/** @type {AudioNode[]} */ chain, /** @type {number} */ g, to = out) => {
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    src.start(0, Math.random() * buf.duration);
    sources.push(src);
    let n = /** @type {AudioNode} */ (src);
    for (const c of chain) n = n.connect(c);
    n.connect(gain(g)).connect(to);
  };
  /** Slow sine LFO modulating `param` by +-depth. */
  const lfo = (
    /** @type {AudioParam} */ param,
    /** @type {number} */ hz,
    /** @type {number} */ depth,
  ) => {
    const l = osc('sine', hz);
    const d = gain(depth);
    l.connect(d).connect(param);
  };
  /** @param {number} minMs @param {number} maxMs @param {() => void} fn */
  const every = (minMs, maxMs, fn) => {
    const tick = () => {
      if (!alive) return;
      try {
        fn();
      } catch {
        /* a failed event must never stop the bed */
      }
      timers.push(setTimeout(tick, minMs + Math.random() * (maxMs - minMs)));
      if (timers.length > 8) timers.shift();
    };
    timers.push(setTimeout(tick, minMs * Math.random() + 300));
  };
  /** One-shot enveloped voice that disconnects itself when done. */
  const blip = (
    /** @type {OscillatorType} */ type,
    /** @type {number} */ f,
    /** @type {number} */ peak,
    /** @type {number} */ dur,
    /** @type {AudioNode} */ to = out,
    /** @type {number} */ delay = 0,
  ) => {
    const t = ctx.currentTime + delay;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.value = f;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(peak, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(to);
    o.start(t);
    o.stop(t + dur + 0.05);
    o.onended = () => {
      o.disconnect();
      g.disconnect();
    };
  };
  /** Short filtered noise tick (keyboard click). */
  const tick = (/** @type {number} */ f, /** @type {number} */ peak, /** @type {number} */ dur) => {
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = f;
    bp.Q.value = 1.2;
    const g = ctx.createGain();
    g.gain.setValueAtTime(peak, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(bp).connect(g).connect(out);
    src.start(t, Math.random() * 0.9);
    src.stop(t + dur + 0.02);
    src.onended = () => {
      src.disconnect();
      bp.disconnect();
      g.disconnect();
    };
  };
  const out = gain(dbToGain(AMB_TRIM_DB[/** @type {keyof typeof AMB_TRIM_DB} */ (name)] ?? 0));
  out.connect(dest);

  if (name === 'office') {
    noise([filt('lowpass', 500, 0.5), filt('lowpass', 900, 0.4)], 0.5);
    noise([filt('bandpass', 3200, 0.8)], 0.012);
    every(250, 1400, () => {
      const burst = 1 + Math.floor(Math.random() * 4);
      for (let i = 0; i < burst; i++) {
        setTimeout(
          () => {
            if (alive) tick(1800 + Math.random() * 2200, 0.05 + Math.random() * 0.05, 0.03);
          },
          i * (70 + Math.random() * 90),
        );
      }
    });
    every(14000, 30000, () => {
      // A short-lived filter, released once the ring is over (not kept with the bed).
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 1800;
      lp.Q.value = 0.5;
      lp.connect(out);
      for (let k = 0; k < 4; k++) {
        blip('sine', 1330, 0.012, 0.09, lp, k * 0.12);
        blip('sine', 1000, 0.012, 0.09, lp, k * 0.12 + 0.06);
      }
      setTimeout(() => lp.disconnect(), 900);
    });
  } else if (name === 'datacenter') {
    const hum = gain(0.6);
    hum.connect(out);
    [50, 100.4, 150.7].forEach((f, i) => {
      const o = osc('sine', f);
      const g = gain([0.5, 0.3, 0.12][i]);
      o.connect(g).connect(hum);
      lfo(g.gain, 0.11 + i * 0.07, [0.15, 0.1, 0.05][i]);
    });
    const beat = osc('sine', 50.7);
    beat.connect(gain(0.25)).connect(hum);
    noise([filt('bandpass', 1400, 0.5), filt('lowpass', 3500, 0.5)], 0.35);
  } else if (name === 'parking') {
    noise([filt('lowpass', 120, 0.7), filt('lowpass', 160, 0.5)], 2.2);
    noise([filt('bandpass', 400, 0.6)], 0.1);
    const delay = /** @type {DelayNode} */ (keep(ctx.createDelay(1)));
    delay.delayTime.value = 0.23;
    const fb = gain(0.5);
    const damp = filt('lowpass', 2200, 0.5);
    delay.connect(damp).connect(fb).connect(delay);
    damp.connect(out);
    every(3500, 9000, () => {
      const f = 900 + Math.random() * 500;
      blip('sine', f, 0.12, 0.07, delay);
      blip('sine', f * 1.5, 0.05, 0.04, delay);
      blip('sine', f, 0.05, 0.07, out);
    });
  } else if (name === 'rooftop') {
    const bp = filt('bandpass', 500, 0.9);
    noise([bp], 1.4);
    lfo(bp.frequency, 0.13, 260);
    const bp2 = filt('bandpass', 900, 1.2);
    noise([bp2], 0.5);
    lfo(bp2.frequency, 0.07, 350);
    const am = gain(1);
    lfo(am.gain, 0.09, 0.25);
    noise([filt('lowpass', 350, 0.6), filt('lowpass', 500, 0.5)], 0.7, am);
    am.connect(out);
  } else if (name === 'copil') {
    noise([filt('lowpass', 450, 0.5), filt('lowpass', 800, 0.4)], 0.45);
    [
      [380, 0.31],
      [620, 0.23],
      [900, 0.41],
    ].forEach(([f, hz], i) => {
      const am = gain(0.5);
      lfo(am.gain, hz, 0.45);
      lfo(am.gain, hz * 2.7, 0.15);
      noise([filt('bandpass', f, 2.5 + i)], 1.2, am);
      am.connect(out);
    });
  }

  return {
    name,
    out,
    stop() {
      alive = false;
      for (const t of timers) clearTimeout(t);
      timers.length = 0;
    },
    dispose() {
      alive = false;
      for (const t of timers) clearTimeout(t);
      for (const s of sources) {
        try {
          s.stop();
        } catch {
          /* already stopped */
        }
      }
      for (const n of nodes) n.disconnect();
    },
  };
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
    /** @type {GainNode | null} */
    this.ambBus = null;
    /** @type {ReturnType<typeof buildBed> | null} */
    this.bed = null;
    /** @type {'office' | 'datacenter' | 'parking' | 'rooftop' | 'copil' | null} */
    this.ambWanted = null;
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
    if (this.ambWanted && !this.bed) this.ambience(this.ambWanted);
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
    const amb = ctx.createGain();
    amb.connect(sfx);
    const buf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    Object.assign(this, { ctx, buf, master, sfxBus: sfx, musicBus: music, ambBus: amb });
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
    const bars = BARS[name];
    /** @type {Run} */
    const run = {
      name,
      def,
      bars,
      bus,
      base,
      drive,
      lead,
      wet,
      nodes,
      timer: null,
      step: 0,
      next: now,
    };
    run.next = now + 0.08;
    const total = bars.length * 16;
    run.timer = setInterval(() => {
      // After a main-thread stall (a stage being built), skip the missed steps instead
      // of playing them all at once.
      const s16 = 60 / def.bpm / 4;
      if (run.next < ctx.currentTime - s16) {
        const skip = Math.ceil((ctx.currentTime - run.next) / s16);
        run.step += skip;
        run.next += skip * s16;
      }
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

  /**
   * Quiet synthesised ambient bed under music and SFX (routed through the sfx bus).
   * @param {'office' | 'datacenter' | 'parking' | 'rooftop' | 'copil' | null} name
   */
  ambience(name) {
    if (name !== null && !AMBIENCE_NAMES.includes(name)) return;
    this.ambWanted = name;
    const ctx = this.ctx;
    if (!ctx || !this.ambBus || !this.buf) return;
    if (this.bed && this.bed.name === name) return;
    if (!this.bed && !name) return;
    const now = ctx.currentTime;
    const old = this.bed;
    this.bed = null;
    if (old) {
      old.stop();
      const g = old.out.gain;
      g.cancelScheduledValues(now);
      g.setValueAtTime(g.value, now);
      g.linearRampToValueAtTime(0, now + AMB_FADE);
      setTimeout(() => old.dispose(), (AMB_FADE + 0.3) * 1000);
    }
    if (!name) return;
    const fade = ctx.createGain();
    fade.gain.setValueAtTime(0, now);
    fade.gain.linearRampToValueAtTime(1, now + AMB_FADE);
    fade.connect(this.ambBus);
    const bed = buildBed(ctx, this.buf, fade, name);
    const dispose = bed.dispose;
    bed.dispose = () => {
      dispose();
      fade.disconnect();
    };
    this.bed = bed;
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
    const bar = run.bars[Math.floor(s / 16)];
    const i = s % 16;
    const [off, minor] = bar.chord;
    const third = minor ? 3 : 4;
    const base = def.root + off;
    const loop = !def.once;
    /** char of an 8- or 16-step pattern at this sixteenth, '.' between eighths */
    const at = (/** @type {string} */ p) =>
      p.length === 16 ? p[i] : i % 2 ? '.' : (p[i / 2] ?? '.');
    const unit = (/** @type {string} */ p) => (p.length === 16 ? s16 : s16 * 2);
    /** Note starting here: [char, held steps, next char] or null. */
    const onset = (/** @type {string} */ p) => {
      const c = at(p);
      if (c === '.' || c === '-') return null;
      const k = p.length === 16 ? i : i / 2;
      let holds = 0;
      while (p[k + 1 + holds] === '-') holds++;
      return /** @type {[string, number, string | undefined]} */ ([c, holds, p[k + 1]]);
    };
    /** Scale degree (base 36) to MIDI note. */
    const degree = (/** @type {string} */ c, /** @type {number} */ oct) => {
      const deg = parseInt(c, 36);
      return def.root + oct + def.scale[deg % 7] + 12 * Math.floor(deg / 7);
    };
    const [driveT, leadT] = this.#layerTargets();
    const driveOn = driveT > 0 || run.drive.gain.value > 0.001;
    const leadOn = leadT > 0 || run.lead.gain.value > 0.001;

    const v = this.#voice(run.base);
    const wet = this.#voice(run.wet);
    const drive = this.#voice(run.drive);
    const lead = this.#voice(run.lead);

    // Melody
    const m = onset(bar.mel);
    if (m) {
      const [c, holds, after] = m;
      const len = holds ? holds + 0.9 : after === '.' ? 1.8 : 0.9;
      const note = degree(c, def.lead);
      const d = unit(bar.mel) * len;
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

    // Countermelody: soft triangle line under the melody
    const cm = bar.counter ? onset(bar.counter) : null;
    if (cm) {
      const [c, holds] = cm;
      const d = unit(bar.counter) * (holds ? holds + 0.9 : 0.9);
      const f = mtof(degree(c, def.lead - 12));
      v.tone({ f, t, d, type: 'triangle', v: 0.05, a: 0.03, pan: -0.25 });
    }

    // Bass
    const b = onset(bar.bass);
    if (b) {
      const [c, holds] = b;
      /** @type {Record<string, number>} */
      const shifts = { 1: 0, 2: 12, 3: third, 4: 5, 5: 7, b: 10 };
      const d = unit(bar.bass) * (holds ? holds + 0.9 : 0.9);
      const f = mtof(c === 'w' ? def.root + bar.next - 1 : base + (shifts[c] ?? 0));
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
      const seq =
        bar.sec % 2
          ? [12, 7, third, 7, 12, 7 + 12, 12, third + 12]
          : [0, third, 7, 12, 7, third, 12, 7 + 12];
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
    if (at(bar.stab) === '1') {
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
    // Crash on every section change, including the loop point
    if (loop && bar.start && i === 0 && run.step > 0) {
      v.noise({ t, d: 1.4, type: 'highpass', f: 6000, v: 0.07, a: 0.002 });
      v.noise({ t, d: 0.45, type: 'bandpass', f: 3500, q: 0.8, v: 0.05 });
    }
    if (at(bar.kick) === '1') kick(v, 0.75);
    if (loop && bar.fill && i >= 12) {
      // Section-end fill: four rising snare/tom hits on the last beat
      const g = 0.13 + (i - 12) * 0.05;
      v.noise({ t, d: def.big ? 0.16 : 0.09, type: 'highpass', f: 1500, v: g });
      v.tone({ f: 260 - (i - 12) * 30, to: 110, t, d: 0.1, type: 'triangle', v: g, a: 0.003 });
    } else if (at(bar.snare) === '1') {
      if (def.big) {
        v.noise({ t, d: 0.35, type: 'bandpass', f: 1800, q: 0.6, v: 0.35 });
        v.tone({ f: 180, to: 140, t, d: 0.12, type: 'triangle', v: 0.3 });
        this.#clap(v, t, 0.18);
      } else {
        v.noise({ t, d: 0.12, type: 'highpass', f: 1500, v: 0.3 });
        v.tone({ f: 220, t, d: 0.07, type: 'triangle', v: 0.2 });
      }
    }
    if (at(bar.clap) === '1') this.#clap(v, t, 0.14);
    const h = at(bar.hat);
    if (h === '1' || h === 'o') {
      const d = h === 'o' ? 0.16 : 0.04;
      v.noise({ t, d, type: 'highpass', f: 7000, v: i % 4 ? 0.1 : 0.14 });
    }

    // Drive layer: sixteenth hats, extra kicks, claps, a fill at each section end
    if (driveOn && loop) {
      drive.noise({ t, d: 0.03, type: 'highpass', f: 8000, v: i % 2 ? 0.05 : 0.08, pan: 0.25 });
      if (!bar.thin) {
        if (i === 10 || (i === 14 && s % 32 >= 16)) kick(drive, 0.5);
        if (i === 4 || i === 12) this.#clap(drive, t, 0.1);
      }
      if (bar.fill && bar.sec % 2 === 0 && i >= 12) {
        drive.tone({ f: [220, 180, 150, 120][i - 12], to: 70, t, d: 0.16, v: 0.3, a: 0.003 });
      } else if (bar.fill && i >= 8) {
        const g = 0.06 + (i - 8) * 0.025;
        drive.noise({ t, d: 0.07, type: 'bandpass', f: 1800 + (i - 8) * 150, q: 0.8, v: g });
      }
    }

    // Lead layer: sparkling counter arpeggio, a different figure in each section
    if (leadOn && loop && (!bar.thin || i % 2 === 0)) {
      const seq = [
        [12, 7, third + 12, 7, 19, 12, third + 12, 7],
        [0, 7, 12, third + 12, 19, third + 12, 12, 7],
        [19, third + 12, 12, 7, 12, third + 12, 19, 12],
      ][bar.sec % 3];
      const note = base + 36 + seq[i % 8] - (i >= 8 ? 12 : 0);
      lead.tone({
        f: mtof(note),
        t,
        d: s16 * (bar.thin ? 1.8 : 0.9),
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

// Procedural audio: every sound and track is synthesised with WebAudio, no asset files.

const MUTE_KEY = 'naorush.muted';
const VOL_KEYS = { music: 'naorush.vol.music', sfx: 'naorush.vol.sfx' };
const VOL_DEFAULT = { music: 0.7, sfx: 0.8 };
// Bus gain at volume 1 (defaults land on the original 0.22 / 0.5 mix).
const BUS_GAIN = { music: 0.22 / 0.7, sfx: 0.5 / 0.8 };
const MASTER = 0.8;
const FADE = 0.6;
// Layer ramps (setTargetAtTime constants): layers come in on the next beat, quickly,
// and leave gently.
const LAYER_IN_TC = 0.06;
const LAYER_OUT_TC = 0.5;
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
 * @property {BiquadFilterType} [ft] filter type for `lp` (default lowpass; bandpass = formant)
 * @property {number} [q] lowpass resonance
 * @property {number} [det] adds a second oscillator detuned by this many cents
 * @property {number} [pan] stereo position -1..1
 * @property {[number, number]} [vib] vibrato: [rate (Hz), depth (cents)]
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
/**
 * Each call returns its (main) source node, so callers can hook its end.
 * @typedef {{ now: number, tone: (o: ToneOpts) => AudioScheduledSourceNode, noise: (o: NoiseOpts) => AudioScheduledSourceNode }} Voice
 */
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
 * @property {'triangle'|'saw'|'slap'|'pluck'} [bassWave] pluck: short pizzicato notes
 * @property {string} kick
 * @property {string} snare
 * @property {string} hat '1' closed, 'o' open
 * @property {string} [clap]
 * @property {string} [stab] chord stabs
 * @property {string} [rim] rimshot / clave
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
 * @property {number} [swing] off-beat eighths late by this fraction of a sixteenth
 * @property {boolean} [sev] seventh chords in the comp, pad and stabs
 * @property {boolean} [rhodes] electric-piano stabs (sine tines) instead of saw stabs
 * @property {boolean} [shaker] softer, duller hats
 * @property {boolean} [mallet] marimba-like melody (struck, short decay)
 * @property {boolean} [pulse] sixteenth-note resonant bass sequence, filter swept over 4 bars
 * @property {boolean} [choir] vowel-formant choir pad instead of the plain pad
 * @property {boolean} [horns] long melody notes doubled by a brass section an octave below
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
 * @property {string} [rim]
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
 * @property {string} rim
 * @property {boolean} thin
 * @property {number} sec section index in the form
 * @property {boolean} start first bar of its section
 * @property {boolean} fill last bar of its section (drum fill)
 * @property {number} next chord offset of the following bar (wraps at the loop point)
 */
/**
 * @typedef {'title'|'parking'|'office'|'datacenter'|'copil'|'rooftop'|'intercontrat'|'cafe'|'seminar'|'bossJulien'|'bossRodolphe'|'win'|'gameover'|'credits'} TrackName
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
 * @property {{ base: Voice, wet: Voice, drive: Voice, lead: Voice }} voices one per layer, reused
 * @property {AudioNode[]} nodes everything to disconnect on stop
 * @property {ReturnType<typeof setInterval> | null} timer
 * @property {number} step sixteenth index
 * @property {number} next
 */

const MAJOR = [0, 2, 4, 5, 7, 9, 11];
const MINOR = [0, 2, 3, 5, 7, 8, 10];
const DORIAN = [0, 2, 3, 5, 7, 9, 10];
const HARMONIC = [0, 2, 3, 5, 7, 8, 11];
const MIXOLYDIAN = [0, 2, 4, 5, 7, 9, 10];

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
  // Bonus: the inter-contract floor on a Friday afternoon. Bouncy marimba, pizzicato bass
  // and a little shuffle: consultants between two missions keep busy, cheerfully.
  intercontrat: {
    bpm: 112,
    root: 43,
    lead: 24,
    scale: MIXOLYDIAN,
    wave: 'triangle',
    cutoff: 3200,
    mallet: true,
    swing: 0.28,
    chords: chords('0 10 5 0 0 10 5 7'),
    melody: bars('7.4.2.4. 6.5.3.1. 3.5.7.5. 4-2-0--- 7.9.b.9. 8.6.5.3. 5.3.5.7. 8.4.1.4.'),
    bass: '1.5.1.5.',
    bassWave: 'pluck',
    kick: '1..1..1.',
    snare: '..1...1.',
    hat: '.1.1.1.1',
    comp: true,
    echo: 0.15,
    form: [
      {},
      {
        chords: chords('5 5 0 0 5 5 10 7'),
        melody: bars('7-5-3-5- 7.8.7.5. 4-2-4-7- 9------- a-9-7-5- 3.5.7.a. 8-6-3-1- 8---b---'),
        bass: '1.3.5.3w',
        hat: '.1.1.111',
      },
      {
        counter: bars('2---4--- 1---3--- 3---5--- 2---4--- 4---2--- 3---1--- 5---3--- 4---1---'),
        bass: '1.5.1.5w',
      },
      {
        chords: chords('9m 5 10 7'),
        melody: bars('5------- 3---7--- 6---3--- 4---8---'),
        bass: '1...5...',
        kick: '1.......',
        snare: '........',
        thin: true,
      },
    ],
  },
  // Bonus: the break room, Friday 10:30. Laid-back bossa: Rhodes chords, clave, shaker.
  cafe: {
    bpm: 100,
    root: 41,
    lead: 24,
    scale: MAJOR,
    wave: 'triangle',
    cutoff: 2400,
    sev: true,
    rhodes: true,
    shaker: true,
    chords: chords('0 9m 2m 7 4m 9m 2m 7'),
    melody: bars('6--4-2-- 5-4-2-0- 1--3-5-- 4---3-2- 2--4-6-- 5-7-5-4- 3--1-5-- 4-------'),
    bass: '1..51..5',
    kick: '1..11..1',
    snare: '........',
    hat: '11111111',
    rim: '1..1..1...1..1..',
    stab: '1..1...1..1..1..',
    echo: 0.2,
    form: [
      {},
      {
        chords: chords('5 4m 2m 0 5 4m 2m 7'),
        melody: bars('7-5-3-2- 2-4-6-8- 7--5-3-- 2------- 9-7-5-3- 8-6-4-2- 5-3-1-3- 4---6-8-'),
        bass: '1..51.3w',
      },
      {
        counter: bars('2------- 0------- 1---3--- 6---3--- 4------- 5---7--- 3---1--- 4---6---'),
        bass: '1..51..w',
      },
      {
        chords: chords('5 5m 0 7'),
        melody: bars('9------- 7---3--- 6---4--- 3---1---'),
        bass: '1---5---',
        kick: '1.......',
        rim: '1.....1.....1...',
        thin: true,
      },
    ],
  },
  // Bonus: the annual seminar, evening at the congress centre. Disco-funk gala: four on
  // the floor, slap octaves, string pad and seventh-chord stabs.
  seminar: {
    bpm: 118,
    root: 45,
    lead: 24,
    scale: DORIAN,
    wave: 'sawtooth',
    det: 6,
    cutoff: 2200,
    sev: true,
    chords: chords('0m 5 0m 5 3 10 7m 5'),
    melody: bars('7..6..4. 5.3.0... 2.4.6.7. 8-7-5--- 9..6..4. 8.6.3.1. 4.6.8.6. 5---3---'),
    bass: '12121212',
    bassWave: 'slap',
    kick: '1.1.1.1.',
    snare: '........',
    hat: '.o.o.o.o',
    clap: '....1.......1...',
    stab: '..1...1.',
    pad: true,
    echo: 0.3,
    leadWave: 'triangle',
    form: [
      {},
      {
        chords: chords('3 10 5 0m 3 10 5 5'),
        melody: bars('9-9-7-6- 6-8-a--- a-9-7-5- 7------- 9.9.b.9. a.8.6.8. 7.5.3.5. 7---a---'),
        bass: '12151215',
        stab: '..1..11.',
      },
      {
        counter: bars('4---2--- 3---5--- 6---4--- 5---3--- 2---6--- 1---3--- 4---1--- 3---0---'),
        bass: '1212121w',
      },
      {
        chords: chords('3 10 5 5'),
        melody: bars('6------- 8---6--- 5---7--- a---7---'),
        bass: '1-------',
        kick: '1.......',
        clap: '................',
        hat: '.1.1.1.1',
        stab: '1.......',
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
    bass: '1.1.1.12',
    pulse: true,
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
        bass: '1.1.5.12',
        kick: '1.1.1.11',
        hat: '11111111',
      },
      {
        counter: bars('4---2--- 0---2--- 2---0--- 5---2--- 3---5--- 7---5--- 6---4--- 4---1---'),
        bass: '1.1.1.1w',
      },
      {
        chords: chords('8 8 7 7'),
        melody: bars('5------- 7---9--- 6------- 4---8---'),
        bass: '1.......',
        snare: '........',
        hat: '11111111',
        thin: true,
      },
    ],
  },
  // The final boss: stately tempo, a choir, a brass section and timpani. Grand, never mocking.
  bossRodolphe: {
    bpm: 128,
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
    choir: true,
    horns: true,
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
    melody: bars('4.24.7-. 7.5.7.a. 8.6.8.b. 9.7.9.e.'),
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
        rim: sec.rim ?? def.rim ?? '',
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

/** Tempo, length in bars and loop length in seconds of a track (sound test, tests). */
export const trackInfo = (/** @type {TrackName} */ name) => {
  const { bpm, once } = SONGS[name];
  const n = BARS[name].length;
  return { bpm, bars: n, seconds: (n * 4 * 60) / bpm, loops: !once };
};
/** Uniform random number in [lo, hi), for per-play variation. */
const rnd = (/** @type {number} */ lo, /** @type {number} */ hi) => lo + Math.random() * (hi - lo);
/** @template T @param {T[]} list @returns {T} */
const pick = (list) => list[Math.floor(Math.random() * list.length)];
/** Very short filtered-noise transient (the "attack" of an effect). */
const click = (
  /** @type {Voice} */ v,
  /** @type {number} */ t,
  /** @type {number} */ f,
  /** @type {number} */ vol,
  q = 1.5,
  d = 0.012,
) => v.noise({ t, d, type: 'bandpass', f, q, v: vol, a: 0.001 });
/** Pitched body: a sine that drops quickly, like a drum or a heavy object. */
const thump = (
  /** @type {Voice} */ v,
  /** @type {number} */ t,
  /** @type {number} */ f,
  /** @type {number} */ to,
  /** @type {number} */ d,
  /** @type {number} */ vol,
) => v.tone({ f, to, t, d, v: vol });
/** Struck metal: inharmonic sine partials, higher ones dying first. */
const ring = (
  /** @type {Voice} */ v,
  /** @type {number} */ t,
  /** @type {number} */ f,
  /** @type {number} */ d,
  /** @type {number} */ vol,
  ratios = [1, 2.76, 5.4],
) => {
  ratios.forEach((r, i) => v.tone({ f: f * r, t, d: d / (1 + i * 0.8), v: vol / (1 + i * 1.6) }));
};
/** Soft bell: fundamental, octave and twelfth with staggered decays. */
const chime = (
  /** @type {Voice} */ v,
  /** @type {number} */ t,
  /** @type {number} */ f,
  /** @type {number} */ d,
  /** @type {number} */ vol,
) => {
  v.tone({ f, t, d, v: vol });
  v.tone({ f: f * 2, t, d: d * 0.5, v: vol * 0.3 });
  v.tone({ f: f * 3, t, d: d * 0.3, v: vol * 0.1 });
};
/** Chiptune note with a closing lowpass (no fizz) and a triangle sub for body. */
const note = (
  /** @type {Voice} */ v,
  /** @type {number} */ t,
  /** @type {number} */ f,
  /** @type {number} */ d,
  /** @type {number} */ vol,
) => {
  v.tone({ f, t, d, type: 'square', v: vol, lp: Math.min(4500, f * 5), lpTo: f * 2, a: 0.004 });
  v.tone({ f: f / 2, t, d: d * 0.8, type: 'triangle', v: vol * 0.7 });
};
/** Brass-like stab: detuned saws through a closing lowpass. */
const brass = (
  /** @type {Voice} */ v,
  /** @type {number} */ t,
  /** @type {number} */ f,
  /** @type {number} */ d,
  /** @type {number} */ vol,
) => v.tone({ f, t, d, type: 'sawtooth', v: vol, lp: 3200, lpTo: 900, a: 0.015, det: 9 });
/** Cymbal-ish sizzle tail. */
const sizzle = (
  /** @type {Voice} */ v,
  /** @type {number} */ t,
  /** @type {number} */ d,
  /** @type {number} */ vol,
) => {
  v.noise({ t, d, type: 'highpass', f: 6500, v: vol, a: 0.002 });
  v.noise({ t, d: d * 0.6, type: 'bandpass', f: 9000, q: 1.5, v: vol * 0.6, a: 0.002 });
};

/**
 * The game's signature: the title-theme hook (sol mi sol do) played as chip notes from
 * `root` (Hz of the top "do"), spaced by `gap` seconds; returns when the last note starts.
 */
const signature = (
  /** @type {Voice} */ v,
  /** @type {number} */ t,
  /** @type {number} */ root,
  /** @type {number} */ gap,
  /** @type {number} */ vol,
  last = 0.3,
) => {
  [0.75, 0.63, 0.75, 1].forEach((r, i) =>
    note(v, t + i * gap, root * r, i === 3 ? last : gap * 0.9, vol),
  );
  return t + 3 * gap;
};

/** @type {Record<string, (v: Voice) => void>} */
const SFX = {
  // Springy push-off: scuff, rising triangle "hop", whoosh of air.
  jump: (v) => {
    const t = v.now;
    const k = rnd(0.94, 1.07);
    click(v, t, 1800, 0.1, 1.2);
    v.tone({ f: 250 * k, to: 600 * k, t, d: 0.15, type: 'triangle', v: 0.34 });
    v.tone({ f: 500 * k, to: 1200 * k, t: t + 0.01, d: 0.09, v: 0.07 });
    v.noise({ t, d: 0.13, type: 'bandpass', f: 700, to: 2200, q: 0.8, v: 0.07, a: 0.03 });
  },
  // Double jump: airy flutter sweep and two sparkles, no ground contact.
  airjump: (v) => {
    const t = v.now;
    const top = pick([2093, 2349, 2637]);
    v.noise({ t, d: 0.18, type: 'bandpass', f: 1600, to: 5500, q: 1.2, v: 0.14, a: 0.04 });
    v.tone({ f: 620, to: 1500, t, d: 0.12, type: 'triangle', v: 0.26, vib: [28, 30] });
    chime(v, t + 0.06, top, 0.16, 0.08);
    chime(v, t + 0.11, top * 1.5, 0.2, 0.06);
  },
  // Soft landing: dull thud, sole scuff.
  land: (v) => {
    const t = v.now;
    thump(v, t, rnd(140, 170), 55, 0.09, 0.3);
    v.noise({ t, d: 0.08, f: rnd(750, 950), to: 250, v: 0.2 });
    click(v, t, rnd(1200, 1600), 0.08, 1.5, 0.015);
  },
  // Heavy landing: deep boom, crunch, then a little debris settling.
  hardland: (v) => {
    const t = v.now;
    thump(v, t, 125, 38, 0.3, 0.7);
    v.tone({ f: 250, to: 80, t, d: 0.08, type: 'triangle', v: 0.2 });
    v.noise({ t, d: 0.16, f: 650, to: 150, v: 0.4 });
    click(v, t, 1800, 0.22, 1, 0.03);
    for (let i = 0; i < 3; i++) {
      const at = t + 0.07 + i * rnd(0.03, 0.05);
      click(v, at, rnd(900, 2200), 0.07, 3, 0.025);
    }
  },
  // Ticket: two-note chip coin plus a paper flick and a shimmer.
  ticket: (v) => {
    const t = v.now;
    v.noise({ t, d: 0.025, type: 'highpass', f: 5500, v: 0.05 });
    note(v, t, 988, 0.08, 0.12);
    note(v, t + 0.07, 1319, 0.26, 0.12);
    chime(v, t + 0.07, 2637, 0.3, 0.035);
  },
  // Ammo: paper rustle, a stapler clack, two pings.
  ammo: (v) => {
    const t = v.now;
    v.noise({ t, d: 0.16, type: 'bandpass', f: rnd(2700, 3300), to: 1400, v: 0.24, a: 0.03 });
    click(v, t + 0.11, 1200, 0.18, 3, 0.02);
    thump(v, t + 0.11, 190, 120, 0.05, 0.14);
    chime(v, t + 0.12, 880, 0.12, 0.16);
    chime(v, t + 0.17, 1320, 0.15, 0.08);
  },
  checkpoint: (v) => {
    const t = v.now;
    [700, 700, 1050].forEach((f, i) => note(v, t + i * 0.1, f, i === 2 ? 0.3 : 0.07, 0.11));
    chime(v, t + 0.2, 2100, 0.4, 0.045);
    v.noise({ t: t + 0.2, d: 0.35, type: 'bandpass', f: 4000, to: 7000, q: 2, v: 0.03, a: 0.1 });
  },
  // Door: latch clunk, hinge creak, airy swing, two chimes.
  door: (v) => {
    const t = v.now;
    click(v, t, 2500, 0.2, 3, 0.015);
    thump(v, t, 200, 110, 0.07, 0.3);
    v.tone({
      f: rnd(150, 180),
      to: rnd(220, 260),
      t: t + 0.05,
      d: 0.22,
      type: 'sawtooth',
      v: 0.05,
      lp: 900,
      q: 8,
      vib: [9, 40],
    });
    v.noise({ t: t + 0.04, d: 0.32, type: 'bandpass', f: 400, to: 2500, v: 0.2, a: 0.08 });
    chime(v, t + 0.22, 1047, 0.35, 0.15);
    chime(v, t + 0.3, 1568, 0.4, 0.11);
  },
  // Key (and concert tickets): arpeggio fanfare, drum, shimmering chord, sizzle.
  key: (v) => {
    const t = v.now;
    [523, 659, 784, 1047].forEach((f, i) => note(v, t + i * 0.1, f, i === 3 ? 0.55 : 0.14, 0.12));
    thump(v, t + 0.3, 130, 65, 0.15, 0.25);
    for (const f of [1319, 1568, 2093]) v.tone({ f, t: t + 0.3, d: 0.6, v: 0.03, a: 0.03 });
    sizzle(v, t + 0.3, 0.5, 0.035);
  },
  // Floor collapse: snap, long rumble, crumbling chunks.
  collapse: (v) => {
    const t = v.now;
    click(v, t, 1500, 0.35, 2, 0.03);
    v.noise({ t, d: 0.7, f: 900, to: 180, v: 0.42, a: 0.02 });
    thump(v, t, 70, 35, 0.6, 0.35);
    for (let i = 0; i < 7; i++) {
      const at = t + i * 0.075 + rnd(0, 0.03);
      v.noise({ t: at, d: rnd(0.04, 0.08), type: 'bandpass', f: rnd(250, 900), q: 2, v: 0.26 });
    }
  },
  // Smash: impact, glassy burst, scattered tinkles.
  smash: (v) => {
    const t = v.now;
    thump(v, t, 220, 70, 0.08, 0.32);
    v.noise({ t, d: 0.2, type: 'highpass', f: 3000, to: 5000, v: 0.3 });
    click(v, t, 1800, 0.22, 1, 0.05);
    for (let i = 0; i < 6; i++) {
      v.tone({ f: rnd(2600, 5200), t: t + 0.03 + rnd(0, 0.25), d: rnd(0.08, 0.2), v: 0.045 });
    }
  },
  // Splash: plop, bloop, spray, droplets.
  splash: (v) => {
    const t = v.now;
    v.noise({ t, d: 0.05, f: 900, v: 0.24, a: 0.002 });
    v.tone({ f: rnd(300, 380), to: 900, t, d: 0.06, v: 0.12 });
    v.noise({ t, d: 0.38, type: 'bandpass', f: 1200, to: 3000, v: 0.24, a: 0.04 });
    v.noise({ t, d: 0.25, f: 600, v: 0.18 });
    for (let i = 0; i < 4; i++) {
      v.tone({
        f: rnd(700, 1600),
        to: rnd(1700, 2600),
        t: t + 0.08 + rnd(0, 0.22),
        d: 0.04,
        v: 0.05,
      });
    }
  },
  // Hurt: body impact then a wobbly falling "oof" (vocal-ish filter close).
  hurt: (v) => {
    const t = v.now;
    const k = rnd(0.93, 1.07);
    thump(v, t, 180, 70, 0.1, 0.32);
    v.noise({ t, d: 0.05, f: 1400, v: 0.2, a: 0.001 });
    v.tone({
      f: 420 * k,
      to: 115 * k,
      t,
      d: 0.32,
      type: 'sawtooth',
      v: 0.2,
      lp: 1800,
      lpTo: 500,
      vib: [11, 35],
    });
    v.tone({ f: 430 * k, to: 105 * k, t, d: 0.3, type: 'square', v: 0.07, lp: 1200, lpTo: 400 });
  },
  // Zap: arc snap, buzzing "bzzt" (fast vibrato), crackle, random sparks.
  zap: (v) => {
    const t = v.now;
    v.noise({ t, d: 0.012, type: 'highpass', f: 4000, v: 0.28, a: 0.001 });
    v.tone({
      f: 95,
      t,
      d: 0.26,
      type: 'sawtooth',
      v: 0.15,
      lp: 3200,
      lpTo: 900,
      q: 5,
      vib: [47, 220],
    });
    v.tone({ f: 190, t, d: 0.2, type: 'square', v: 0.05, lp: 2500, vib: [53, 260] });
    v.noise({ t, d: 0.22, type: 'bandpass', f: 2400, q: 0.7, v: 0.15 });
    for (let i = 0; i < 6; i++) {
      const at = t + i * 0.035 + rnd(0, 0.01);
      v.tone({ f: rnd(300, 1800), t: at, d: 0.025, type: 'square', v: 0.06, lp: 3000 });
    }
  },
  // Bump: cartoon bonk with a knock and a wobble.
  bump: (v) => {
    const t = v.now;
    click(v, t, 900, 0.24, 3, 0.02);
    v.tone({ f: 200, to: 520, t, d: 0.12, v: 0.36 });
    v.tone({ f: 520, to: 240, t: t + 0.1, d: 0.24, v: 0.3, vib: [14, 30] });
    v.tone({ f: 1040, to: 480, t: t + 0.1, d: 0.12, v: 0.05 });
  },
  meeting: (v) => {
    const t = v.now;
    click(v, t, 2000, 0.14, 2, 0.015);
    v.tone({ f: 300, to: 800, t, d: 0.07, v: 0.36 });
    v.tone({ f: 1500, to: 2200, t: t + 0.08, d: 0.28, v: 0.1, a: 0.05, vib: [6, 25] });
    v.tone({ f: 750, to: 1100, t: t + 0.08, d: 0.22, type: 'triangle', v: 0.08, a: 0.03 });
  },
  // Out of ammo: dry trigger click and spring tick.
  empty: (v) => {
    const t = v.now;
    click(v, t, rnd(1300, 1700), 0.28, 2, 0.025);
    v.tone({ f: 150, t, d: 0.04, type: 'square', v: 0.09, lp: 800 });
    click(v, t + 0.045, 3200, 0.1, 3);
  },
  // Throw: flick then a whoosh.
  fire: (v) => {
    const t = v.now;
    click(v, t, 2500, 0.15, 2);
    v.noise({
      t,
      d: 0.18,
      type: 'bandpass',
      f: rnd(700, 900),
      to: rnd(3000, 4000),
      v: 0.26,
      a: 0.03,
    });
    v.tone({ f: 300, to: 700, t, d: 0.08, type: 'triangle', v: 0.08 });
  },
  // Parry: bright metallic "shing" that rings, with a beating partial.
  parry: (v) => {
    const t = v.now;
    const f = rnd(2300, 2550);
    v.noise({ t, d: 0.01, type: 'highpass', f: 5000, v: 0.26, a: 0.001 });
    v.noise({ t, d: 0.09, type: 'bandpass', f: 3000, to: 6500, v: 0.09, a: 0.01 });
    ring(v, t, f, 0.45, 0.18);
    v.tone({ f: f * 1.006, t, d: 0.3, v: 0.06 });
    v.tone({ f: f / 2, t, d: 0.1, type: 'triangle', v: 0.07 });
  },
  // Block / bonk: dull wooden "thock", no ring.
  block: (v) => {
    const t = v.now;
    thump(v, t, 150, 72, 0.13, 0.5);
    v.noise({ t, d: 0.06, f: 500, v: 0.28 });
    click(v, t, rnd(550, 750), 0.22, 4, 0.03);
    v.tone({ f: 330, to: 260, t, d: 0.05, type: 'triangle', v: 0.1 });
  },
  // Boss intro: low boom, dark detuned chord closing down, gong partials.
  bossStart: (v) => {
    const t = v.now;
    v.tone({ f: 55, t, d: 1.0, v: 0.5, a: 0.02 });
    thump(v, t, 110, 45, 0.3, 0.35);
    for (const f of [110, 131, 165]) {
      v.tone({ f, t, d: 0.9, type: 'sawtooth', v: 0.06, lp: 1400, lpTo: 300, a: 0.02, det: 8 });
    }
    v.noise({ t, d: 0.5, f: 300, v: 0.35 });
    ring(v, t, 196, 1.0, 0.06, [1, 2.4, 4.1]);
    sizzle(v, t, 0.8, 0.03);
  },
  bossThrow: (v) => {
    const t = v.now;
    v.noise({ t, d: 0.22, type: 'bandpass', f: rnd(450, 550), to: 2500, v: 0.27, a: 0.05 });
    v.tone({ f: 140, to: 320, t, d: 0.16, type: 'triangle', v: 0.12, a: 0.03 });
    v.noise({ t: t + 0.12, d: 0.12, type: 'bandpass', f: 2500, to: 1200, q: 2, v: 0.07 });
  },
  // Boss hit: punchy smack + rewarding upward chirp.
  bossHit: (v) => {
    const t = v.now;
    thump(v, t, 165, 48, 0.24, 0.52);
    v.noise({ t, d: 0.1, f: 900, to: 300, v: 0.36 });
    click(v, t, 2600, 0.24, 1, 0.025);
    v.tone({ f: 400, to: 900, t: t + 0.1, d: 0.16, type: 'triangle', v: 0.2 });
    v.tone({ f: 800, to: 1800, t: t + 0.12, d: 0.12, v: 0.05 });
  },
  // Boss defeated: three brass-and-chip hits with timpani, cymbal on the last.
  bossDone: (v) => {
    const t = v.now;
    const hit = (/** @type {number} */ at, /** @type {number[]} */ fs, /** @type {number} */ d) => {
      for (const f of fs) {
        v.tone({ f, t: t + at, d, type: 'square', v: 0.06, lp: 2600, lpTo: 1200 });
        brass(v, t + at, f / 2, d, 0.03);
      }
      thump(v, t + at, 98, 55, 0.18, 0.28);
    };
    hit(0, [392, 523, 659], 0.16);
    hit(0.18, [392, 523, 659], 0.16);
    hit(0.36, [523, 659, 784, 1047], 0.8);
    sizzle(v, t + 0.36, 0.9, 0.05);
  },
  consult: (v) => {
    const t = v.now;
    click(v, t, 3000, 0.05, 2);
    chime(v, t, 880, 0.18, 0.24);
    chime(v, t + 0.12, 1175, 0.38, 0.24);
  },
  // Slam: ground-shaking boom, crack, rubble.
  slam: (v) => {
    const t = v.now;
    thump(v, t, 90, 35, 0.5, 0.75);
    v.noise({ t, d: 0.25, f: 320, v: 0.45 });
    click(v, t, 1400, 0.25, 1, 0.03);
    for (let i = 0; i < 3; i++) {
      click(v, t + 0.08 + i * rnd(0.04, 0.07), rnd(500, 1300), 0.1, 3, 0.03);
    }
  },
  // Poof: soft pop and a puff of air.
  poof: (v) => {
    const t = v.now;
    v.tone({ f: rnd(500, 600), to: 180, t, d: 0.05, v: 0.15 });
    v.noise({ t, d: 0.14, f: 1600, to: 300, v: 0.22, a: 0.004 });
    v.noise({ t: t + 0.02, d: 0.16, type: 'bandpass', f: 2500, to: 900, q: 0.8, v: 0.06, a: 0.03 });
  },
  // Stage clear: the signature hook, then it lifts to a bright chord with a cymbal.
  win: (v) => {
    const t = v.now;
    const top = signature(v, t, 523, 0.11, 0.12, 0.2) + 0.15;
    note(v, top, 659, 0.7, 0.11);
    note(v, top, 784, 0.7, 0.07);
    note(v, top, 1047, 0.7, 0.07);
    thump(v, top, 130, 65, 0.18, 0.25);
    for (const f of [1568, 2093, 2637]) v.tone({ f, t: top, d: 0.7, v: 0.025, a: 0.04 });
    sizzle(v, top, 0.6, 0.035);
  },
  // Dialogue blip: a tiny two-formant "voice" with a random vowel.
  talk: (v) => {
    const t = v.now;
    const f = rnd(300, 550);
    v.tone({ f, t, d: 0.045, type: 'square', v: 0.09, lp: rnd(1400, 2200), q: 3 });
    v.tone({ f: f * pick([2, 2.5, 3]), t, d: 0.035, v: 0.03 });
  },
  select: (v) => {
    const t = v.now;
    click(v, t, 4000, 0.04, 2, 0.008);
    v.tone({ f: 700, t, d: 0.05, type: 'triangle', v: 0.24 });
    v.tone({ f: 1400, t, d: 0.03, v: 0.04 });
  },
  confirm: (v) => {
    const t = v.now;
    click(v, t, 3500, 0.04, 2, 0.008);
    v.tone({ f: 600, t, d: 0.07, type: 'triangle', v: 0.27 });
    v.tone({ f: 900, t: t + 0.06, d: 0.15, type: 'triangle', v: 0.27 });
    v.tone({ f: 1800, t: t + 0.06, d: 0.12, v: 0.04 });
  },

  // --- movement ---
  // Footstep: soft heel thud with a varying carpet scuff.
  step: (v) => {
    const t = v.now;
    thump(v, t, rnd(85, 105), 58, 0.055, 0.12);
    v.noise({ t, d: 0.035, f: rnd(300, 450), v: 0.1 });
    click(v, t, rnd(1800, 2800), 0.025, 2, 0.01);
  },
  // Grab a ledge: palm slap and a small knock.
  grab: (v) => {
    const t = v.now;
    v.noise({ t, d: 0.05, type: 'bandpass', f: rnd(1600, 2000), q: 1.5, v: 0.3 });
    v.tone({ f: 320, to: 190, t, d: 0.05, type: 'square', v: 0.07, lp: 1400 });
    thump(v, t, 180, 120, 0.04, 0.12);
  },
  // Climb: two cloth rustles and an effort chirp.
  climb: (v) => {
    const t = v.now;
    v.noise({ t, d: 0.1, type: 'bandpass', f: rnd(600, 900), to: 1800, v: 0.16, a: 0.04 });
    v.noise({
      t: t + 0.08,
      d: 0.1,
      type: 'bandpass',
      f: rnd(900, 1300),
      to: 2200,
      v: 0.12,
      a: 0.03,
    });
    v.tone({ f: 200, to: 330, t, d: 0.12, type: 'triangle', v: 0.12 });
  },
  // Death: falling chip arpeggio over a sliding "whee", sad chord, puff.
  death: (v) => {
    const t = v.now;
    for (let i = 0; i < 6; i++) {
      const f = 660 * 0.83 ** i;
      v.tone({
        f,
        to: f * 0.9,
        t: t + i * 0.09,
        d: 0.1,
        type: 'square',
        v: 0.09,
        lp: 2000,
        lpTo: 900,
      });
    }
    v.tone({ f: 880, to: 220, t, d: 0.55, type: 'triangle', v: 0.05, vib: [7, 40] });
    v.tone({ f: 196, to: 180, t: t + 0.56, d: 0.5, type: 'triangle', v: 0.2, a: 0.02 });
    v.tone({ f: 233, t: t + 0.56, d: 0.5, type: 'triangle', v: 0.08, a: 0.02 });
    v.tone({ f: 294, t: t + 0.56, d: 0.45, v: 0.08, a: 0.02 });
    v.noise({ t: t + 0.56, d: 0.2, f: 1200, to: 300, v: 0.08, a: 0.01 });
  },
  // Respawn: rising swell then a sparkling arpeggio.
  respawn: (v) => {
    const t = v.now;
    v.noise({ t, d: 0.25, type: 'bandpass', f: 1500, to: 6000, q: 1.5, v: 0.06, a: 0.2 });
    note(v, t, 1320, 0.06, 0.09);
    note(v, t + 0.08, 1760, 0.1, 0.09);
    for (const [i, f] of [2093, 2637, 3136, 4186].entries()) {
      v.tone({ f, t: t + 0.16 + i * 0.05, d: 0.3, v: 0.05, pan: i % 2 ? 0.4 : -0.4 });
    }
  },

  // --- office traps & props ---
  // Office chair: caster rumble, irregular wheel clicks, a squeaky axle.
  chairRoll: (v) => {
    const t = v.now;
    v.noise({ t, d: 0.5, f: 300, v: 0.17, a: 0.05 });
    for (let i = 0; i < 10; i++) {
      const at = t + i * 0.045 + rnd(0, 0.015);
      v.noise({ t: at, d: 0.02, type: 'bandpass', f: rnd(2200, 3100), q: 3, v: 0.13 });
    }
    const sq = rnd(1700, 2100);
    v.tone({ f: sq, to: sq * 1.12, t: t + 0.08, d: 0.3, v: 0.018, a: 0.06, vib: [13, 60] });
  },
  // Drawer: wooden slide, thunk at the stop, rattling handle.
  drawerOut: (v) => {
    const t = v.now;
    v.noise({ t, d: 0.16, type: 'bandpass', f: 1200, to: 2600, q: 2, v: 0.18, a: 0.03 });
    v.noise({ t, d: 0.15, type: 'bandpass', f: rnd(800, 1000), q: 5, v: 0.08, a: 0.02 });
    thump(v, t + 0.15, 180, 90, 0.12, 0.42);
    v.noise({ t: t + 0.15, d: 0.05, f: 1500, v: 0.22 });
    v.tone({ f: 1250, t: t + 0.15, d: 0.28, v: 0.05 });
    v.tone({ f: 1873, t: t + 0.15, d: 0.22, v: 0.04 });
    click(v, t + 0.21, rnd(2500, 3500), 0.06, 4);
  },
  // Spray: valve click, sputter, then a steady aerosol hiss.
  sprayOn: (v) => {
    const t = v.now;
    click(v, t, 2200, 0.12, 3);
    v.noise({ t: t + 0.01, d: 0.45, type: 'bandpass', f: 4200, q: 0.6, v: 0.19, a: 0.04 });
    v.noise({ t: t + 0.01, d: 0.4, type: 'bandpass', f: rnd(5500, 6500), q: 2, v: 0.06, a: 0.06 });
    v.noise({ t: t + 0.01, d: 0.12, type: 'bandpass', f: 2500, q: 1, v: 0.06, a: 0.01 });
  },
  // Paper shot: rubber-band twang, swish, then the wad flutters down.
  paperShot: (v) => {
    const t = v.now;
    v.tone({ f: 380, to: 1100, t, d: 0.1, type: 'triangle', v: 0.13, vib: [30, 40] });
    v.noise({ t, d: 0.12, type: 'bandpass', f: 3000, q: 2, v: 0.14 });
    v.noise({ t: t + 0.13, d: 0.04, type: 'bandpass', f: rnd(1300, 1700), v: 0.2 });
    v.noise({ t: t + 0.2, d: 0.04, type: 'bandpass', f: rnd(1600, 2000), v: 0.14 });
  },
  // Trapdoor: ratchet, latch click, creak, hollow drop.
  trapdoor: (v) => {
    const t = v.now;
    for (let i = 0; i < 4; i++) {
      v.tone({
        f: 170 + i * 25,
        t: t + i * 0.05,
        d: 0.06,
        type: 'sawtooth',
        v: 0.065,
        lp: 1100,
        q: 6,
      });
    }
    click(v, t + 0.22, 3000, 0.14, 4);
    v.tone({
      f: 140,
      to: 95,
      t: t + 0.22,
      d: 0.2,
      type: 'sawtooth',
      v: 0.03,
      lp: 700,
      q: 8,
      vib: [8, 50],
    });
    thump(v, t + 0.24, 220, 105, 0.09, 0.42);
    thump(v, t + 0.24, 80, 45, 0.2, 0.2);
    v.noise({ t: t + 0.24, d: 0.05, type: 'bandpass', f: 1000, v: 0.28 });
  },
  // Binders: cascading thumps, paper flaps, ring-binder rattles.
  binderFall: (v) => {
    for (let i = 0; i < 4; i++) {
      const t = v.now + i * 0.08 + rnd(0, 0.02);
      thump(v, t, 150 * (1 - i * 0.08), 70, 0.1, 0.3);
      v.noise({ t, d: 0.06, f: 700, v: 0.18 });
      v.noise({ t, d: 0.03, type: 'bandpass', f: rnd(1400, 2000), q: 1.5, v: 0.07 });
      if (i % 2) v.tone({ f: rnd(2400, 3000), t, d: 0.06, v: 0.02 });
    }
  },
  // Intern stunned: dazed falling tone, then circling "tweety" stars.
  internStun: (v) => {
    const t = v.now;
    v.tone({ f: 330, to: 200, t, d: 0.2, type: 'triangle', v: 0.24, lp: 1200 });
    v.noise({ t, d: 0.1, type: 'bandpass', f: 700, q: 2, v: 0.11 });
    for (let i = 0; i < 5; i++) {
      const at = t + 0.12 + i * 0.06 + rnd(0, 0.02);
      v.noise({ t: at, d: 0.03, type: 'bandpass', f: rnd(2200, 3000), q: 2, v: 0.08 });
      v.tone({ f: i % 2 ? 2637 : 2349, t: at, d: 0.05, v: 0.025 });
    }
  },
  // Robot vacuum: rubber bump, boing, motor whir.
  vacuumBounce: (v) => {
    const t = v.now;
    click(v, t, 600, 0.15, 2, 0.02);
    v.tone({ f: 160, to: 620, t, d: 0.09, v: 0.33 });
    v.tone({ f: 620, to: 230, t: t + 0.09, d: 0.26, v: 0.28, vib: [18, 25] });
    v.tone({ f: 110, t, d: 0.45, type: 'sawtooth', v: 0.05, lp: 600, a: 0.05, vib: [5, 30] });
    v.noise({ t, d: 0.45, type: 'bandpass', f: 900, q: 5, v: 0.08, a: 0.05 });
  },
  // Calendar invite: two-tone notification bell.
  invite: (v) => {
    const t = v.now;
    chime(v, t, 1319, 0.42, 0.19);
    chime(v, t + 0.22, 1047, 0.58, 0.19);
    v.tone({ f: 1319 * 1.004, t, d: 0.3, v: 0.03 });
  },
  // Mic mute: button click, "bloop" down, small release tick.
  visioMute: (v) => {
    const t = v.now;
    v.noise({ t, d: 0.015, type: 'highpass', f: 3000, v: 0.24 });
    v.tone({ f: 620, to: 300, t: t + 0.01, d: 0.12, v: 0.27 });
    v.tone({ f: 1240, to: 600, t: t + 0.01, d: 0.06, type: 'triangle', v: 0.05 });
    click(v, t + 0.12, 2400, 0.05, 3, 0.008);
  },
  // Heart: warm swell then a rising major arpeggio of chimes.
  heart: (v) => {
    const t = v.now;
    v.noise({ t, d: 0.2, type: 'bandpass', f: 1500, to: 900, q: 3, v: 0.14, a: 0.05 });
    thump(v, t + 0.02, 90, 60, 0.1, 0.12);
    for (const [i, f] of [784, 988, 1175].entries()) chime(v, t + 0.22 + i * 0.08, f, 0.5, 0.11);
  },
  // Archive crack: splintering cardboard, a creak and dust.
  crack: (v) => {
    const t = v.now;
    for (let i = 0; i < 6; i++) {
      click(v, t + i * 0.028 + rnd(0, 0.008), rnd(800, 2200), 0.28, 2, 0.03);
    }
    thump(v, t, 140, 70, 0.08, 0.16);
    v.noise({ t: t + 0.04, d: 0.2, f: 1400, to: 400, v: 0.06, a: 0.02 });
  },
  // Secret: sparkly ascending discovery jingle.
  secret: (v) => {
    const t = v.now;
    for (const [i, f] of [784, 988, 1175, 1568].entries()) {
      const at = t + i * 0.09;
      v.tone({ f, t: at, d: i === 3 ? 0.5 : 0.12, type: 'square', v: 0.08, lp: 4000, lpTo: 1800 });
      v.tone({ f: f * 2, t: at, d: 0.3, v: 0.04, pan: i % 2 ? 0.5 : -0.5 });
    }
    v.noise({ t: t + 0.27, d: 0.4, type: 'bandpass', f: 5000, to: 8000, q: 2, v: 0.03, a: 0.08 });
  },

  // --- bosses ---
  bossPhase: (v) => {
    v.noise({ t: v.now, d: 0.7, type: 'bandpass', f: 300, to: 4000, v: 0.26, a: 0.6 });
    v.tone({
      f: 110,
      to: 440,
      t: v.now,
      d: 0.7,
      type: 'sawtooth',
      v: 0.09,
      lp: 1500,
      a: 0.5,
      det: 7,
    });
    const t = v.now + 0.7;
    thump(v, t, 80, 40, 0.5, 0.65);
    v.noise({ t, d: 0.3, f: 800, v: 0.33 });
    click(v, t, 2000, 0.15, 1, 0.02);
    for (const f of [220, 262, 330]) {
      v.tone({ f, t, d: 0.4, type: 'sawtooth', v: 0.06, lp: 2200, lpTo: 600 });
    }
    sizzle(v, t, 0.4, 0.03);
  },
  // Attack warning: a rising wood-block "tock-tick", clear but soft (it plays often).
  telegraph: (v) => {
    const t = v.now;
    for (const [k, f] of [880, 1320].entries()) {
      const at = t + k * 0.08;
      v.tone({ f, t: at, d: 0.16, type: 'triangle', v: 0.2, a: 0.002 });
      v.tone({ f: f * 2.01, t: at, d: 0.06, v: 0.05, a: 0.002 });
      click(v, at, f * 2.5, 0.05, 4, 0.01);
    }
  },
  // Server rack falling: descending whistle with a rattle.
  rackDrop: (v) => {
    const t = v.now;
    v.tone({ f: 2400, to: 600, t, d: 0.6, v: 0.13, a: 0.05 });
    v.tone({ f: 2400 * 1.5, to: 900, t, d: 0.5, v: 0.025, a: 0.05 });
    v.noise({ t, d: 0.55, type: 'bandpass', f: 2500, to: 900, q: 4, v: 0.03, a: 0.2 });
  },
  // Rack landing: boom plus a metal clang.
  rackLand: (v) => {
    const t = v.now;
    thump(v, t, 90, 40, 0.4, 0.65);
    v.noise({ t, d: 0.25, type: 'bandpass', f: 2000, v: 0.26 });
    click(v, t, 3500, 0.15, 1, 0.02);
    for (const f of [523, 1187, 1693, 2311])
      v.tone({ f: f * rnd(0.98, 1.02), t, d: 0.6, v: 0.042 });
  },
  teleport: (v) => {
    const t = v.now;
    v.tone({ f: 200, to: 2400, t, d: 0.18, type: 'square', v: 0.08, lp: 3000, vib: [24, 50] });
    v.noise({ t, d: 0.25, type: 'bandpass', f: 1000, to: 6000, v: 0.19, a: 0.04 });
    v.tone({ f: 2400, to: 800, t: t + 0.15, d: 0.15, v: 0.1 });
    chime(v, t + 0.2, 3136, 0.15, 0.025);
  },
  // Cable about to arc: rising mains hum with a nervous wobble.
  cableWarn: (v) => {
    const t = v.now;
    v.tone({
      f: 60,
      to: 120,
      t,
      d: 0.5,
      type: 'sawtooth',
      v: 0.11,
      lp: 800,
      a: 0.3,
      vib: [12, 25],
    });
    v.tone({ f: 120, to: 240, t, d: 0.5, type: 'square', v: 0.05, lp: 600, a: 0.3 });
    v.noise({ t, d: 0.5, type: 'highpass', f: 5000, v: 0.025, a: 0.35 });
  },
  // Cable arc: mains buzz and random crackles.
  cableZap: (v) => {
    const t = v.now;
    v.tone({ f: 120, t, d: 0.2, type: 'sawtooth', v: 0.13, lp: 2000, lpTo: 700 });
    v.tone({ f: 240, t, d: 0.15, type: 'square', v: 0.03, lp: 1500 });
    for (let i = 0; i < 8; i++) {
      v.noise({
        t: t + rnd(0, 0.22),
        d: 0.02,
        type: 'bandpass',
        f: rnd(2000, 3200),
        q: 0.9,
        v: 0.2,
      });
    }
  },
  fan: (v) => {
    for (let i = 0; i < 3; i++) {
      v.noise({
        t: v.now + i * 0.05,
        d: 0.3,
        type: 'bandpass',
        f: rnd(700, 900),
        to: 2500,
        v: 0.13,
        a: 0.1,
        pan: (i - 1) * 0.6,
      });
    }
    v.noise({ t: v.now, d: 0.35, f: 250, v: 0.08, a: 0.1 });
  },
  dash: (v) => {
    const t = v.now;
    click(v, t, 1800, 0.1, 1.5);
    v.noise({ t, d: 0.15, type: 'bandpass', f: 2000, to: 500, v: 0.28, a: 0.02 });
    v.tone({ f: 900, to: 400, t, d: 0.1, v: 0.08 });
  },
  zoneWarn: (v) => {
    for (const at of [0, 0.16]) {
      note(v, v.now + at, 988, 0.1, 0.1);
      v.tone({ f: 1319, t: v.now + at, d: 0.1, type: 'triangle', v: 0.07 });
    }
  },
  zoneHit: (v) => {
    const t = v.now;
    thump(v, t, 70, 35, 0.3, 0.65);
    click(v, t, 1500, 0.15, 1, 0.025);
    v.noise({ t, d: 0.35, type: 'highpass', f: 5000, v: 0.15 });
  },
  // Spotlight: heavy switch clunk and an electrical hum swelling in.
  spot: (v) => {
    const t = v.now;
    thump(v, t, 120, 60, 0.12, 0.48);
    v.noise({ t, d: 0.04, f: 1500, v: 0.24 });
    click(v, t, 3000, 0.08, 3, 0.01);
    v.tone({ f: 120, t: t + 0.02, d: 0.4, v: 0.05, a: 0.05 });
    v.tone({ f: 240, t: t + 0.02, d: 0.35, type: 'triangle', v: 0.015, a: 0.08 });
  },
  curtain: (v) => {
    const t = v.now;
    v.noise({ t, d: 0.6, f: 600, to: 1800, q: 0.7, v: 0.28, a: 0.25 });
    v.noise({ t: t + 0.1, d: 0.45, type: 'bandpass', f: 3000, to: 1500, q: 1, v: 0.05, a: 0.15 });
  },
  fireworks: (v) => {
    const t = v.now;
    thump(v, t, 300, 80, 0.08, 0.2);
    v.noise({ t, d: 0.1, f: 1200, v: 0.16 });
    v.tone({ f: 600, to: 1800, t: t + 0.05, d: 0.2, v: 0.03, a: 0.1 });
    for (let i = 0; i < 12; i++) {
      const at = t + 0.25 + rnd(0, 0.6);
      const f = rnd(2600, 4000);
      v.noise({ t: at, d: 0.02, type: 'bandpass', f, q: 1, v: 0.14, pan: rnd(-0.5, 0.5) });
    }
  },
  // Signature: pen scribble, rubber stamp, little success jingle.
  sign: (v) => {
    const t = v.now;
    v.noise({ t, d: 0.3, type: 'bandpass', f: 3500, to: 2500, q: 3, v: 0.03, a: 0.03 });
    for (let i = 0; i < 6; i++) {
      const at = t + i * 0.045 + rnd(0, 0.01);
      v.noise({ t: at, d: 0.035, type: 'bandpass', f: rnd(3000, 4500), q: 3, v: 0.14 });
    }
    thump(v, t + 0.35, 140, 60, 0.15, 0.3);
    v.noise({ t: t + 0.35, d: 0.06, f: 600, v: 0.18 });
    click(v, t + 0.35, 900, 0.1, 4, 0.02);
    // The signature hook, in G to lead into the credits theme.
    const top = signature(v, t + 0.55, 784, 0.085, 0.11, 0.4);
    chime(v, top, 1568, 0.5, 0.04);
  },

  // --- UI ---
  pause: (v) => {
    note(v, v.now, 1047, 0.06, 0.09);
    note(v, v.now + 0.07, 784, 0.1, 0.09);
  },
  resume: (v) => {
    note(v, v.now, 784, 0.06, 0.09);
    note(v, v.now + 0.07, 1047, 0.1, 0.09);
  },
  gameover: (v) => {
    const t = v.now;
    for (const [i, f] of [523, 466, 392].entries()) {
      v.tone({ f, t: t + i * 0.16, d: 0.15, type: 'triangle', v: 0.24 });
    }
    v.tone({ f: 349, t: t + 0.48, d: 0.55, type: 'triangle', v: 0.24, vib: [5, 15] });
    v.tone({ f: 440, t: t + 0.48, d: 0.5, v: 0.09 });
    v.tone({ f: 175, t: t + 0.48, d: 0.55, type: 'triangle', v: 0.1 });
  },
  // Menu tick: short and rounded, it repeats a lot.
  menuMove: (v) => {
    v.tone({ f: 1100, t: v.now, d: 0.025, type: 'square', v: 0.06, lp: 2400 });
    v.tone({ f: 550, t: v.now, d: 0.03, type: 'triangle', v: 0.06 });
    click(v, v.now, 2500, 0.04, 2, 0.008);
  },
};

/* AUDIT-TRIM-START */
/** Loudness trim per effect (dB), measured so all effects sit at a similar RMS. @type {Record<string, number>} */
const SFX_TRIM_DB = {
  jump: 7,
  airjump: 10,
  land: 1,
  hardland: 1,
  ticket: 10,
  ammo: 12,
  checkpoint: 13,
  door: 11,
  key: 11,
  collapse: 6,
  smash: 9,
  splash: 16,
  hurt: 6,
  zap: 11,
  bump: 5,
  meeting: 10,
  empty: 17,
  fire: 18,
  parry: 6,
  block: 2,
  bossStart: 4,
  bossThrow: 16,
  bossHit: 2,
  bossDone: 10,
  consult: 6,
  slam: 0,
  poof: 14,
  win: 15,
  talk: 13,
  select: 8,
  confirm: 8,
  step: 13,
  grab: 8,
  climb: 13,
  death: 11,
  respawn: 15,
  chairRoll: 23,
  drawerOut: 8,
  sprayOn: 11,
  paperShot: 19,
  trapdoor: 7,
  binderFall: 6,
  internStun: 13,
  vacuumBounce: 7,
  invite: 8,
  visioMute: 8,
  heart: 11,
  crack: 15,
  secret: 14,
  bossPhase: 5,
  telegraph: 9,
  rackDrop: 11,
  rackLand: 4,
  teleport: 15,
  cableWarn: 17,
  cableZap: 14,
  fan: 21,
  dash: 15,
  zoneWarn: 13,
  zoneHit: 2,
  spot: 6,
  curtain: 18,
  fireworks: 15,
  sign: 12,
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
  intercontrat: 2,
  cafe: 2,
  seminar: 0,
  bossJulien: 2,
  bossRodolphe: 2,
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
/** @typedef {'office' | 'datacenter' | 'parking' | 'rooftop' | 'copil' | 'cafe' | 'seminar'} Bed */
/** @type {Bed[]} */
export const AMBIENCES = ['office', 'datacenter', 'parking', 'rooftop', 'copil', 'cafe', 'seminar'];
// Per-bed output trim (dB), tuned so each bed sits around -40 dBFS RMS at default volumes.
const AMB_TRIM_DB = {
  office: -12,
  datacenter: -26,
  parking: -19,
  rooftop: -22,
  copil: -16,
  cafe: -12,
  seminar: -17,
};

/** Music of each stage, by level id (falls back to the level's own `music`). @type {Record<string, TrackName>} */
const STAGE_MUSIC = {
  parking: 'parking',
  lcp7: 'office',
  ts: 'datacenter',
  copil: 'copil',
  rooftop: 'rooftop',
  intercontrat: 'intercontrat',
  pause: 'cafe',
  seminaire: 'seminar',
};
/** Ambient bed of each stage, by level id (falls back to the level's `theme`). @type {Record<string, Bed>} */
const STAGE_BED = {
  parking: 'parking',
  lcp7: 'office',
  ts: 'datacenter',
  copil: 'copil',
  rooftop: 'rooftop',
  intercontrat: 'office',
  pause: 'cafe',
  seminaire: 'seminar',
};
/** Every stage id known to the audio, in play order. */
export const STAGES = Object.keys(STAGE_MUSIC);
/** @typedef {{ id: string, music?: string, theme?: string }} StageRef */
/** @param {StageRef} level @returns {TrackName | null} */
export const stageTrack = (level) =>
  STAGE_MUSIC[level.id] ??
  (level.music && Object.hasOwn(SONGS, level.music)
    ? /** @type {TrackName} */ (level.music)
    : null);
/** @param {StageRef} level @returns {Bed | null} */
export const stageBed = (level) =>
  STAGE_BED[level.id] ??
  (AMBIENCES.includes(/** @type {Bed} */ (level.theme)) ? /** @type {Bed} */ (level.theme) : null);

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
  const tick = (
    /** @type {number} */ f,
    /** @type {number} */ peak,
    /** @type {number} */ dur,
    delay = 0,
  ) => {
    const t = ctx.currentTime + delay;
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
  } else if (name === 'cafe') {
    // Break room: room tone, a light murmur, spoons on cups, the espresso machine now and then.
    noise([filt('lowpass', 500, 0.5), filt('lowpass', 900, 0.4)], 0.4);
    [
      [420, 0.27],
      [760, 0.37],
    ].forEach(([f, hz]) => {
      const am = gain(0.4);
      lfo(am.gain, hz, 0.35);
      lfo(am.gain, hz * 2.3, 0.12);
      noise([filt('bandpass', f, 3)], 0.8, am);
      am.connect(out);
    });
    every(2500, 7000, () => {
      const f = 2400 + Math.random() * 1200;
      const n = 1 + Math.floor(Math.random() * 3);
      for (let k = 0; k < n; k++) {
        blip('sine', f, 0.02, 0.18, out, k * 0.09);
        blip('sine', f * 2.71, 0.006, 0.08, out, k * 0.09);
      }
    });
    every(20000, 40000, () => {
      // Espresso: a pump buzz under a steamy hiss that swells and fades.
      const t = ctx.currentTime;
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 3200;
      bp.Q.value = 0.8;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.05, t + 0.6);
      g.gain.setValueAtTime(0.05, t + 2);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 3);
      src.connect(bp).connect(g).connect(out);
      src.start(t, Math.random());
      src.stop(t + 3.1);
      blip('sawtooth', 100, 0.004, 2.6, out);
      src.onended = () => {
        src.disconnect();
        bp.disconnect();
        g.disconnect();
      };
    });
  } else if (name === 'seminar') {
    // Congress hall: low room rumble, a big crowd murmur, and polite applause now and then.
    noise([filt('lowpass', 180, 0.7)], 1.2);
    [
      [300, 0.21],
      [480, 0.33],
      [650, 0.17],
      [880, 0.29],
    ].forEach(([f, hz], i) => {
      const am = gain(0.5);
      lfo(am.gain, hz, 0.35);
      lfo(am.gain, hz * 3.1, 0.12);
      noise([filt('bandpass', f, 2 + i * 0.5)], 0.9, am);
      am.connect(out);
    });
    every(25000, 50000, () => {
      for (let k = 0; k < 45; k++) {
        const at = (k / 45) * 2.4 + Math.random() * 0.05;
        const swell = Math.sin((Math.PI * k) / 45);
        tick(1500 + Math.random() * 2000, 0.01 + swell * 0.03, 0.025, at);
      }
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
    /** @type {Bed | null} */
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
    // Next beat at or after the next unscheduled step, so a new layer enters on the beat.
    const s16 = 60 / run.def.bpm / 4;
    const beat = Math.max(now, run.next + ((4 - (run.step % 4)) % 4) * s16);
    for (const [node, target] of /** @type {[GainNode, number][]} */ ([
      [run.drive, drive],
      [run.lead, lead],
    ])) {
      const g = node.gain;
      g.cancelScheduledValues(now);
      g.setValueAtTime(g.value, now);
      if (target > g.value) g.setTargetAtTime(target, beat, LAYER_IN_TC);
      else g.setTargetAtTime(target, now, LAYER_OUT_TC);
    }
  }

  #layerTargets() {
    const x = this._intensity;
    return [clamp01((x - 0.45) / 0.15), clamp01((x - 0.8) / 0.2)];
  }

  /** @param {string} type */
  sfx(type) {
    const play = Object.hasOwn(SFX, type) ? SFX[type] : undefined;
    if (!play || !this.ctx || !this.sfxBus || this._muted || this._vol.sfx === 0) return;
    // Per-sound loudness trim, so every effect lands at a comparable level.
    const trim = this.ctx.createGain();
    trim.gain.value = dbToGain(SFX_TRIM_DB[type] ?? 0);
    trim.connect(this.sfxBus);
    const voice = this.#voice(trim, 1 + (Math.random() - 0.5) * 0.08);
    // Release the whole effect graph once its last source has finished.
    /** @type {AudioScheduledSourceNode | null} */
    let last = null;
    let end = -1;
    /** @param {AudioScheduledSourceNode} src @param {number} t @param {number} d */
    const track = (src, t, d) => {
      if (t + d >= end) [last, end] = [src, t + d];
      return src;
    };
    play({
      now: voice.now,
      tone: (o) => track(voice.tone(o), o.t, o.d),
      noise: (o) => track(voice.noise(o), o.t, o.d),
    });
    const lastSrc = /** @type {AudioScheduledSourceNode | null} */ (last);
    if (lastSrc) lastSrc.onended = () => trim.disconnect();
    else trim.disconnect();
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
    const voices = {
      base: this.#voice(base),
      wet: this.#voice(wet),
      drive: this.#voice(drive),
      lead: this.#voice(lead),
    };
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
      voices,
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
      // Muted or music at zero: keep time, but schedule nothing (saves the whole graph).
      const silent = this._muted || this._vol.music === 0;
      while (run.next < ctx.currentTime + LOOKAHEAD) {
        if (def.once && run.step >= total) {
          if (run.timer) clearInterval(run.timer);
          run.timer = null;
          return;
        }
        if (!silent) this.#step(run, total);
        run.next += 60 / def.bpm / 4;
        run.step++;
      }
    }, TICK_MS);
    this.run = run;
  }

  /**
   * Music and ambient bed of a stage. Uses the stage's own theme when it has one (café
   * pause, seminar, intercontrat), else the level's `music` / `theme`. Idempotent:
   * calling it again with the same stage (e.g. after a boss) only restores the music.
   * @param {StageRef} level
   */
  stage(level) {
    this.music(stageTrack(level));
    this.ambience(stageBed(level));
  }

  /**
   * Quiet synthesised ambient bed under music and SFX (routed through the sfx bus).
   * @param {Bed | null} name
   */
  ambience(name) {
    if (name !== null && !AMBIENCES.includes(name)) return;
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
      tone: ({
        f,
        t,
        d,
        type = 'sine',
        v = 0.3,
        to,
        a = 0.005,
        lp,
        lpTo,
        ft,
        q,
        det,
        pan,
        vib,
      }) => {
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
        if (vib) {
          const lfo = ctx.createOscillator();
          const depth = ctx.createGain();
          lfo.frequency.value = vib[0];
          depth.gain.value = vib[1];
          lfo.connect(depth);
          for (const osc of oscs) depth.connect(osc.detune);
          lfo.start(t);
          lfo.stop(t + d + 0.05);
        }
        if (lp) {
          const filter = ctx.createBiquadFilter();
          if (ft) filter.type = ft;
          filter.frequency.setValueAtTime(lp, t);
          if (lpTo) filter.frequency.exponentialRampToValueAtTime(lpTo, t + d);
          if (q) filter.Q.value = q;
          out(g.connect(filter), pan);
        } else out(g, pan);
        return oscs[0];
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
        return src;
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
    const s16 = 60 / def.bpm / 4;
    const s = run.step % total;
    const bar = run.bars[Math.floor(s / 16)];
    const i = s % 16;
    // Swing: off-beat eighths land a little late.
    const t = run.next + (def.swing && i % 4 === 2 ? def.swing * s16 : 0);
    const [off, minor] = bar.chord;
    const third = minor ? 3 : 4;
    // Seventh: flat on minor chords and on the dominant, major elsewhere.
    const seventh = minor || (off + 12) % 12 === 7 ? 10 : 11;
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

    const { base: v, wet, drive, lead } = run.voices;

    // Melody
    const m = onset(bar.mel);
    if (m) {
      const [c, holds, after] = m;
      const len = holds ? holds + 0.9 : after === '.' ? 1.8 : 0.9;
      const note = degree(c, def.lead);
      const d = unit(bar.mel) * len;
      const level = def.det ? 0.08 : 0.12;
      if (def.mallet) {
        // Struck bar: sine body, a quick octave partial and a woody inharmonic click.
        const f = mtof(note);
        const md = Math.min(d + 0.15, 0.6);
        wet.tone({ f, t, d: md, v: level * 1.25, a: 0.002 });
        wet.tone({ f: f * 2, t, d: md * 0.35, v: level * 0.3, a: 0.002 });
        wet.tone({ f: f * 3.9, t, d: 0.05, v: level * 0.18, a: 0.001 });
      } else {
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
      }
      if (def.bells) wet.tone({ f: mtof(note + 12), t, d: d * 0.8, v: 0.035, a: 0.005 });
      // Brass section on the long notes, an octave below, kept dry for weight.
      if (def.horns && holds >= 1) {
        const f = mtof(note - 12);
        v.tone({ f, t, d, type: 'sawtooth', v: 0.045, lp: 2600, lpTo: 1100, a: 0.05, det: 11 });
        v.tone({
          f: f * 1.5,
          t,
          d: d * 0.9,
          type: 'sawtooth',
          v: 0.025,
          lp: 2200,
          lpTo: 900,
          a: 0.07,
        });
      }
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
      if (def.bassWave === 'pluck') {
        v.tone({ f, t, d: Math.min(d, s16 * 1.6), type: 'triangle', v: 0.55, a: 0.003 });
        v.tone({ f: f * 2, t, d: 0.06, v: 0.08, a: 0.002 });
      } else if (def.bassWave === 'saw') {
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
    // Pulse: a resonant sixteenth sequence whose filter opens and closes every 4 bars
    // (a fixed cutoff per note: automating hundreds of filters a bar is costly).
    if (def.pulse && !(bar.thin && i % 2)) {
      const k = [0, 0, 12, 0, 0, 12, 0, 7, 0, 0, 12, 0, 0, 12, 7, 12][i];
      const sweep = 0.5 - 0.5 * Math.cos((2 * Math.PI * (s % 64)) / 64);
      const lp = 450 + 2300 * sweep;
      v.tone({
        f: mtof(base + 12 + k),
        t,
        d: s16 * 0.7,
        type: 'sawtooth',
        v: i % 4 ? 0.06 : 0.09,
        lp,
        q: 7,
        a: 0.002,
        pan: i % 2 ? 0.15 : -0.15,
      });
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
    const chord = def.sev ? [0, third, 7, seventh] : triad;
    if ((def.pad || def.hum || def.choir) && i === 0) {
      const d = s16 * 16 + 0.05;
      if (def.choir) {
        // "Aah" choir: detuned saws through a vowel formant (no LFO vibrato: a-rate detune
        // on bar-long voices is costly; the detuned pair already gives the ensemble motion).
        for (const k of [0, third, 7, 12]) {
          v.tone({
            f: mtof(base + 12 + k),
            t,
            d,
            type: 'sawtooth',
            v: 0.06,
            a: 0.45,
            lp: 820,
            ft: 'bandpass',
            q: 1.4,
            det: 9,
          });
        }
      }
      if (def.pad) {
        const saw = def.padWave === 'sawtooth';
        for (const k of chord) {
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
      for (const k of chord) {
        v.tone({ f: mtof(base + 24 + k), t, d: s16 * 3, type: 'triangle', v: 0.05, a: 0.01 });
      }
    }
    if (at(bar.stab) === '1') {
      if (def.rhodes) {
        // Electric piano: sine tine plus a bell-ish second partial that dies fast.
        for (const k of chord) {
          const f = mtof(base + 24 + k);
          v.tone({ f, t, d: s16 * 5, v: 0.05, a: 0.004, pan: k === third ? -0.2 : 0.2 });
          v.tone({ f: f * 2, t, d: s16 * 1.5, v: 0.012, a: 0.002 });
        }
      } else {
        for (const k of def.sev ? chord : [0, third, 7, 12]) {
          const f = mtof(base + 24 + k);
          v.tone({ f, t, d: 0.22, type: 'sawtooth', v: 0.04, lp: 2600, lpTo: 700, det: 12 });
        }
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
      if (def.big) {
        // Timpani: tuned to the chord root and fifth, a soft mallet noise on top.
        const f = mtof(base - 12 + (i % 2 ? 7 : 0));
        v.tone({ f, to: f * 0.97, t, d: 0.45, v: g * 1.8, a: 0.004 });
        v.noise({ t, d: 0.06, type: 'bandpass', f: 400, q: 1, v: g * 0.6 });
      } else {
        v.noise({ t, d: 0.09, type: 'highpass', f: 1500, v: g });
        v.tone({ f: 260 - (i - 12) * 30, to: 110, t, d: 0.1, type: 'triangle', v: g, a: 0.003 });
      }
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
    if (at(bar.rim) === '1') {
      v.noise({ t, d: 0.03, type: 'bandpass', f: 1800, q: 3, v: 0.2 });
      v.tone({ f: 830, t, d: 0.035, type: 'triangle', v: 0.1, a: 0.001 });
    }
    const h = at(bar.hat);
    if (h === '1' || h === 'o') {
      const d = h === 'o' ? 0.16 : 0.04;
      if (def.shaker) {
        v.noise({
          t,
          d: 0.06,
          type: 'bandpass',
          f: 5200,
          q: 1.2,
          v: i % 4 === 2 ? 0.1 : 0.06,
          a: 0.012,
        });
      } else v.noise({ t, d, type: 'highpass', f: 7000, v: i % 4 ? 0.1 : 0.14 });
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

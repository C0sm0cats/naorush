// Side-stage themes: intercontrat, café pause, seminar.

import { THEME_A } from './menus.js';
import { DORIAN, MAJOR, MIXOLYDIAN, bars, chords } from './theory.js';
/** @typedef {import('../types.js').Track} Track */

// Intercontrat, Friday afternoon: consultants between two missions keep busy, cheerfully.
// The marimba trips the motif over a flat seventh; in the bridge someone whistles it.
const INTER_A = bars(
  '4.2.4.6.7...6.4. 3.5.3.1.0....... 2.4.2.0.5...4... 4-------....2.4. ' +
    '4.2.4.6.7...9.7. 6.5.3.5.6....... 5.4.2.4.3...1... 0-------........',
);
const INTER_B = bars(
  '5-------3-----.. 2-3-5-7-5-3-2--- 4-------2-----.. 1-2-4-7-4-2-1--- ' +
    '5-------3-----.. 7-6-5-3-5-6-7--- 6-------5---3--- 4-------1-------',
);

// Café pause, 10:30: a bossa on brushes and Rhodes. The B section is the main theme,
// dressed in sevenths.
const CAFE_A = bars(
  '9-----8-7------- 8-----7-6-----5- 6-------4------- 5--------------- ' +
    'a-----9-8------- 8-----7-$------- 9-------b------- a---8---9---b---',
);

// Seminar, evening gala: disco octaves for the hook; in the B section the strings play
// the motif on every chord, French-touch style, with the pads pumping on the kick.
const SEMINAR_A = bars(
  '7.7.e.7.c.a.9.7. a---9-7-8------- 7.7.e.7.c.a.9.7. c---a-9-a------- ' +
    '6.6.d.6.b.9.8.6. 9---8-6-7------- a---9---b---^--- 7-----------....',
);
const SEMINAR_B = bars(
  'b-9-b-e--------- 8-6-8-b--------- a-8-a-d--------- c-------a------- ' +
    'b-9-b-e--------- 8-6-8-b--------- a-8-a-d---c-a--- b-----------^---',
);

/** @satisfies {Record<string, Track>} */
export const INTERLUDE_SONGS = {
  intercontrat: {
    bpm: 112,
    root: 43,
    lead: 24,
    scale: MIXOLYDIAN,
    patch: 'mallet',
    level: 0.11,
    swing: 0.28,
    chords: chords('I bVII IV I I bVII IV|bVII I'),
    melody: INTER_A,
    bass: '1.5.1.5.',
    bassWave: 'pluck',
    kit: 'brush',
    kick: '1..1..1.',
    snare: '..1...1.',
    hat: '.1.1.1.1',
    comp: '.1.1.1.1',
    compPatch: 'guitar',
    echo: 0.2,
    form: [
      {},
      {
        chords: chords('IV IV I vi IV IV bVII v'),
        melody: INTER_B,
        bass: '1.3.5.3w',
        hat: '.1.1.111',
        pad: 'warm',
      },
      {
        counter: bars('2---4--- 1---3--- 0---2--- 2---4--- 2---4--- 1---3--- 2---1--- 2-------'),
        counterPatch: 'pluck',
        counterOct: 0,
        double: 'bells',
        bass: '1.5.1.5w',
      },
      // Bridge: the motif, whistled (its second time trips on the flat seventh again).
      {
        chords: chords('I IV I v'),
        melody: bars('4-2-4-7--------- ................ 4-2-4-6---7----- 4---------------'),
        patch: 'whistle',
        level: 0.1,
        bass: '1...5...',
        kick: '1.......',
        snare: '........',
        comp: '',
        thin: true,
      },
    ],
  },
  cafe: {
    bpm: 100,
    root: 41,
    lead: 12,
    scale: MAJOR,
    patch: 'flute',
    level: 0.085,
    chords: chords('IM7 ii7 V7 I6 IVM7 iv6 iii7|VI7 ii7|V7'),
    melody: CAFE_A,
    bass: '1..51..5',
    bassWave: 'upright',
    kit: 'brush',
    kick: '1..11..1',
    snare: '........',
    hat: '11111111',
    rim: '1..1..1...1..1..',
    comp: '1..1...1..1..1..',
    compPatch: 'epiano',
    reverb: 0.25,
    echo: 0.15,
    chorus: 0.3,
    form: [
      {},
      {
        lead: 24,
        chords: chords('IM7 iii7 vi7 ii7|V7 IM7 III7 IVM7|iv6 IM7'),
        melody: THEME_A,
        patch: 'epiano',
        level: 0.14,
        bass: '1..51.3w',
      },
      {
        counter: bars('2------- 3------- 3---1--- 2------- 5------- 4---3--- 4---6--- 5---4---'),
        counterPatch: 'soft',
        counterOct: 0,
        bass: '1..51..w',
      },
      {
        chords: chords('IVM7 iv6 IM7 Vs7|V7'),
        melody: bars('9-------7---5--- 8-------$------- 6-------4------- 5---------------'),
        bass: '1---5---',
        kick: '1.......',
        rim: '1.....1.....1...',
        thin: true,
      },
    ],
  },
  seminar: {
    bpm: 118,
    root: 45,
    lead: 12,
    scale: DORIAN,
    patch: 'brass',
    level: 0.16,
    chords: chords('i7 IV i7 IV bVII bIII IV|V i7'),
    melody: SEMINAR_A,
    bass: '12121212',
    bassWave: 'synth',
    kick: '1.1.1.1.',
    snare: '........',
    hat: '.o.o.o.o',
    clap: '....1.......1...',
    tamb: '..1...1...1...1.',
    stab: '..1...1.',
    stabPatch: 'strings',
    pad: 'strings',
    pump: 0.45,
    reverb: 0.35,
    echo: 0.15,
    chorus: 0.3,
    form: [
      {},
      {
        chords: chords('i v bVII IV i v bVII|IV V'),
        melody: SEMINAR_B,
        patch: 'strings',
        double: 'octave',
        bass: '12151215',
        stab: '..1..11.',
      },
      {
        counter: bars('4---2--- 3---5--- 4---2--- 5---3--- 3---1--- 2---0--- 3---4--- 2-------'),
        counterPatch: 'organ',
        counterOct: 0,
        bass: '1212121w',
      },
      // Breakdown: the director's speech — bass, claps and a filtered pad.
      {
        chords: chords('i7 i7 IV IV'),
        melody: bars('7-------........ 9-------7------- a-------........ c-------a-------'),
        patch: 'strings',
        bass: '1-------',
        kick: '1.......',
        clap: '................',
        hat: '.1.1.1.1',
        stab: '1.......',
        tamb: '',
        thin: true,
      },
    ],
  },
};

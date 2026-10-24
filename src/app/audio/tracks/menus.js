// Title, results and credits themes.
//
// The main theme's motif is sol–mi–sol–do (5–3–5–8), the hook the stage-clear and
// signature jingles also play. Every track of the game quotes it somewhere, re-harmonised:
// in minor at dawn, as a ringtone in the offices, as the server room's arpeggio, in the
// COPIL's bass, in glory on the rooftop, and in the bosses' last phases. Kévin's variant
// walks it in even notes, Charline's skips it in dotted ones.

import { MAJOR, bars, chords, vary } from './theory.js';
/** @typedef {import('../types.js').Track} Track */

/** Main theme, A: the motif climbs a step each bar, an E7 lifts it, a minor iv sighs home. */
export const THEME_A = bars(
  '4-2-4-7--------- 6-5-6-8--------- 7-6-5-9--------- 8---7---5---6--- ' +
    '4-2-4-7--------- 6-$-6-9--------- a---9-8-7---$--- 4-----------....',
);
export const THEME_CHORDS = chords('I V vi IV|V I III7 IV|iv I');
/** Second ending: a run down from the top, home on do. */
export const THEME_A2 = vary(THEME_A, { 6: 'c-b-a-9-8---6---', 7: '7-----------....' });
export const THEME_CHORDS2 = chords('I V vi IV|V I III7 IV|V I');
/** Charline's lighter A: the same notes, skipping in dotted rhythm. */
export const THEME_A_SKIP = vary(THEME_A2, {
  0: '4--24-7---------',
  1: '6--56-8---------',
  2: '7--65-9---------',
  4: '4--24-7---------',
  5: '6--$6-9---------',
});
/** Inner voice under the A section (an octave below the melody). */
export const THEME_COUNTER = bars(
  '9---7--- 8---6--- 7---9--- 5---6--- 4---7--- $---6--- 7---8--- 9-------',
);
/** Main theme, B: long lyrical lines up to the high la. */
export const THEME_B = bars(
  '9-------8---7--- 7-------5------- 4---7---9---b--- a-------8------- ' +
    '9-------8---7--- 7-------c------- b---a---9---8--- 6-----------....',
);
export const THEME_B_CHORDS = chords('vi IV I V7 vi IV ii|V V');

const SILENT = { kick: '........', snare: '........', hat: '........' };

/** @satisfies {Record<string, Track>} */
export const MENU_SONGS = {
  // The main theme: bells from afar, the chip lead takes it, flute and strings sing the
  // bridge, then everyone plays it together.
  title: {
    bpm: 112,
    root: 36,
    lead: 24,
    scale: MAJOR,
    patch: 'chip',
    chords: THEME_CHORDS,
    melody: THEME_A,
    bass: '1..5..1.',
    kick: '1..1..1.',
    snare: '..1...1.',
    hat: '.1.1.1.1',
    comp: '..1...1.',
    compPatch: 'piano',
    pad: 'strings',
    echo: 0.22,
    reverb: 0.35,
    chorus: 0.4,
    form: [
      {
        intro: true,
        chords: chords('I IVM7 I Vs|V'),
        melody: bars('4-2-4-7--------- ................ 4-2-4-9--------- 8-----------....'),
        patch: 'bell',
        bass: '1-------',
        comp: '',
        pad: 'warm',
        ...SILENT,
      },
      {},
      {
        chords: THEME_CHORDS2,
        melody: THEME_A2,
        counter: THEME_COUNTER,
        counterPatch: 'strings',
        hat: '11111111',
      },
      {
        chords: THEME_B_CHORDS,
        melody: THEME_B,
        patch: 'flute',
        bass: '1---5---',
        kick: '1.......',
        snare: '....1...',
        hat: '1.1.1.1.',
        comp: '1.......',
      },
      {
        chords: THEME_CHORDS2,
        melody: THEME_A2,
        double: 'strings',
        counter: THEME_COUNTER,
        counterPatch: 'brass',
        bass: '1.15.15.',
        kick: '1..1.11.',
        clap: '..1...1.',
        hat: '11111111',
      },
    ],
  },
  // Stage clear: a victory lap on the motif, in each hero's step, then a shared answer.
  win: {
    bpm: 126,
    root: 36,
    lead: 24,
    scale: MAJOR,
    patch: 'brass',
    chords: chords('I IV V I vi IV ii|V I'),
    melody: bars(
      '4---2---4---7--- 7-----------5--- 6---8---6---4--- 7-----------.... ' +
        '9---8---7---5--- 7---5---3---5--- 4---5---6---8--- 7-----------....',
    ),
    bass: '1.51.5.5',
    kick: '1.1.1.1.',
    snare: '..1...1.',
    hat: '.1.1.1.1',
    comp: '..1...1.',
    compPatch: 'piano',
    pad: 'strings',
    reverb: 0.3,
    chorus: 0.3,
    form: [
      {
        charline: {
          melody: bars(
            '4--24-7-9--79-b- c-----a-7------- b--9b-8-6------- 7-9-b-e--------- ' +
              '9---8---7---5--- 7---5---3---5--- 4---5---6---8--- 7-----------....',
          ),
          patch: 'chip',
          double: 'bells',
        },
      },
      {
        counter: bars('9---7--- 7---5--- 8---6--- 9---7--- 7---5--- 5---3--- 4---6--- 7-------'),
        counterPatch: 'strings',
        hat: '11111111',
        charline: {
          melody: bars(
            '4--24-7-9--79-b- c-----a-7------- b--9b-8-6------- 7-9-b-e--------- ' +
              '9---8---7---5--- 7---5---3---5--- 4---5---6---8--- 7-----------....',
          ),
          patch: 'chip',
          double: 'bells',
        },
      },
    ],
  },
  // Game over: a music box plays the motif on the minor iv, then smiles on the major third.
  gameover: {
    bpm: 80,
    root: 41,
    lead: 24,
    scale: MAJOR,
    patch: 'bell',
    chords: chords('I IV iv I'),
    melody: bars('........4-2-4--- 7-----------6-5- 4-------3---1--- 2---------------'),
    bass: '1-------',
    ...SILENT,
    pad: 'warm',
    echo: 0.3,
    reverb: 0.45,
    once: true,
  },
  // Credits: the main theme, sung by the flute in the hero's step, a montage of the stages'
  // hooks, then a last chorus a tone up.
  credits: {
    bpm: 100,
    root: 43,
    lead: 12,
    scale: MAJOR,
    patch: 'flute',
    level: 0.1,
    chords: THEME_CHORDS2,
    melody: THEME_A2,
    bass: '1..5.1.5',
    kick: '1...1...',
    snare: '..1...1.',
    hat: '.1.1.1.1',
    comp: '..1...1.',
    compPatch: 'piano',
    pad: 'strings',
    echo: 0.25,
    reverb: 0.4,
    chorus: 0.4,
    form: [
      { charline: { melody: THEME_A_SKIP } },
      {
        chords: THEME_B_CHORDS,
        melody: THEME_B,
        patch: 'strings',
        double: 'bells',
        bass: '1---5---',
        kick: '1.......',
        snare: '....1...',
      },
      // Montage: the car park's motif in minor, the office jingle, the server room's
      // tresillo, the rooftop's leap, each re-harmonised in G.
      {
        chords: chords('vi IV I V vi IV I V'),
        melody: bars(
          '9-7-9-c--------- ..e-c-a-9------- e--cb-e-----.... e---d---b------- ' +
            'c..c..e.c..9..a. 9-------........ e---b-c-e---g--- f-------e-d-b---',
        ),
        patch: 'chip',
        double: 'bells',
        hat: '11111111',
      },
      {
        key: 2,
        chords: THEME_CHORDS2,
        melody: THEME_A2,
        patch: 'brass',
        double: 'strings',
        counter: THEME_COUNTER,
        counterPatch: 'strings',
        kick: '1.1.1.1.',
        clap: '..1...1.',
        hat: '11111111',
        nofill: true,
      },
      // Back down to G for the loop: A7, D7.
      {
        chords: chords('II|V7'),
        melody: bars('7---6---4---2---'),
        patch: 'flute',
        bass: '1...5...',
        kick: '1.......',
        snare: '........',
        thin: true,
      },
    ],
  },
};

// Boss themes: Julien and Rodolphe. Respectful and grand, never mocking: each boss has his
// own theme, and in his last phase the heroes' motif rises against it in the brass.

import { DORIAN, HARMONIC, MINOR, bars, chords } from './theory.js';
/** @typedef {import('../types.js').Track} Track */

// Julien, technology director: a precise toccata (pedal-point sixteenths) over a pulsing
// sequencer. In the B section the heroes answer with their motif on each chord.
const JULIEN_A = bars(
  '7.e.d.e.b.e.c.b. c.b.a.b.9.b.7... c.e.d.e.a.e.9.a. c-------a-9-7--- ' +
    'a.e.d.e.c.e.a.9. a---c---e---a--- b.d.b.8.6.8.b.d. e-------d-------',
);
const JULIEN_B = bars(
  'b-9-b-e--------- a-8-a-d--------- 9-7-9-c--------- b---8---^---b--- ' +
    'b-9-b-e--------- a-8-a-d--------- 9-7-9-c---a-c--- e-------D-------',
);
/** The heroes' motif in long notes, two bars per chord (finale layer over the A section). */
const JULIEN_FINALE = bars(
  'b-------9------- b-------e------- 9-------7------- 9-------c------- ' +
    '7-------5------- 7-------a------- 8-------6------- 8-------b-------',
);

// Rodolphe, regional director: a reel on the pipes over drones — it opens on the heroes'
// motif — then a broad anthem of the Région Ouest for brass and choir.
const RODOLPHE_A = bars(
  '4-2-4-7-8-9-8-7- 3-1-3-6-7-8-7-6- 4-2-4-7-8-9-a-b- b---a-9-8---4--- ' +
    '4-2-4-7-8-9-8-7- 3-1-3-6-7-8-9-a- b-a-9-8-9-8-7-4- 7-------........',
);
const RODOLPHE_B = bars(
  '7-------9------- a-------8------- 9-------7---9--- b--------------- ' +
    'c-------a---9--- a-------8---7--- 9---8---7---9--- ^---------------',
);
/** The heroes' motif on each chord of the anthem, for the brass of the grand finale. */
const RODOLPHE_FINALE = bars(
  '2-0-2-5--------- 3-1-3-6--------- 4-2-4-7--------- 4-2-4-7--------- ' +
    '2-0-2-5--------- 3-1-3-6--------- 4-2-4-7---5-7--- 8-^-8-b---------',
);

/** @satisfies {Record<string, Track>} */
export const BOSS_SONGS = {
  bossJulien: {
    bpm: 140,
    root: 33,
    lead: 24,
    scale: HARMONIC,
    patch: 'saw',
    lp: 2400,
    level: 0.16,
    chords: chords('i i bVI bVI iv iv V V'),
    melody: JULIEN_A,
    finale: JULIEN_FINALE,
    finaleOct: 12,
    bass: '1.1.1.12',
    bassWave: 'fm',
    pulse: true,
    kit: 'electro',
    kick: '1.1.1.1.',
    snare: '..1...1.',
    hat: '.1.1.1.1',
    pad: 'strings',
    echo: 0.18,
    reverb: 0.25,
    chorus: 0.2,
    form: [
      {},
      {
        scale: MINOR,
        chords: chords('i bVII bVI V i bVII bVI|iv V'),
        melody: JULIEN_B,
        patch: 'chip',
        finale: bars('7------- 6------- 5------- 4------- 7------- 6------- 5---3--- 4-------'),
        bass: '1.1.5.12',
        kick: '1.1.1.11',
        hat: '11111111',
      },
      {
        counter: bars('4---2--- 0---2--- 2---0--- 5---2--- 3---5--- 7---5--- 6---4--- 4---1---'),
        counterPatch: 'thin',
        counterOct: 0,
        bass: '1.1.1.1w',
      },
      // Breakdown: the sequencer alone, sweeping, then the toccata climbs back in.
      {
        chords: chords('bVI bVI V V'),
        melody: bars('c-------........ e-------c------- d-------........ b-------8-------'),
        finale: bars('9------- 7------- 8------- 6-------'),
        finaleOct: 12,
        bass: '1.......',
        snare: '........',
        hat: '11111111',
        thin: true,
      },
    ],
  },
  bossRodolphe: {
    bpm: 124,
    root: 38,
    lead: 24,
    scale: DORIAN,
    patch: 'pipe',
    level: 0.14,
    chords: chords('i bVII i v i bVII IV|i i'),
    melody: RODOLPHE_A,
    finale: RODOLPHE_A,
    finalePatch: 'brass',
    finaleOct: 12,
    bass: '1.1.1.12',
    bassWave: 'saw',
    kit: 'march',
    kick: '1...1...',
    snare: '..1...1.',
    hat: '1.1.1.1.',
    drone: true,
    pad: 'choir',
    echo: 0.2,
    reverb: 0.4,
    chorus: 0.25,
    form: [
      {},
      {
        scale: MINOR,
        chords: chords('bVI bVII i i bVI bVII i|bVI V'),
        melody: RODOLPHE_B,
        finale: RODOLPHE_FINALE,
        finaleOct: 0,
        patch: 'brass',
        double: 'horns',
        kit: 'big',
        drone: false,
        stab: '1..1..1.',
        stabPatch: 'brass',
        bass: '1.1.5.12',
        kick: '1...1...',
        snare: '..1...1.',
      },
      {
        counter: bars('2---4--- 1---3--- 2---4--- 4---1--- 2---4--- 3---1--- 3---4--- 2-------'),
        counterPatch: 'flute',
        counterOct: 0,
        bass: '1.1.1.1w',
      },
      // Breakdown: a slow air on the pipes over drones and choir.
      {
        chords: chords('i bVII i v'),
        melody: bars('7-------4------- 6-------3------- 7---8---9---b--- a-------8-------'),
        finale: bars('2-------0------- 1-------3------- 2-------4------- 4-------1-------'),
        bass: '1-------',
        kick: '1.......',
        snare: '........',
        thin: true,
      },
    ],
  },
};

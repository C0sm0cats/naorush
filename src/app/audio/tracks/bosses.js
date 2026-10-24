// Boss themes: Julien and Rodolphe.

import { MINOR, HARMONIC, chords, bars } from '../util.js';
/** @typedef {import('../types.js').Track} Track */

/** @satisfies {Record<string, Track>} */
export const BOSS_SONGS = {
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
};

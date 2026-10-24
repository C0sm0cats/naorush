// Main stage themes: car park, offices, server room, COPIL, rooftop.

import { THEME_A, THEME_A_SKIP, THEME_CHORDS } from './menus.js';
import { DORIAN, MAJOR, MINOR, bars, chords, vary } from './theory.js';
/** @typedef {import('../types.js').Track} Track */

// Car park, dawn: someone whistles the motif in minor on the way in; the B section climbs
// into the relative major as the sun comes up.
const PARKING_A = bars(
  '4-2-4-7--------- ..9-7-5-4------- 4-2-4-9--------- ..a-9-8-6------- ' +
    '4-2-4-7--------- ..9-7-5-4---2--- a---9---8---^--- 7-----------....',
);
const PARKING_CHORDS = chords('i bVI bIII bVII i bVI iv|V i');
const PARKING_B = bars(
  '4-----7-9------- 8-------6------- 7-----a-9------- 9-------7------- ' +
    'b-----d-b------- a-------8---a--- 9---7---5---4--- ^-------4-------',
);

// Offices, daylight: a cheerful corporate jingle on marimba ("lun-di ma-tin…"); in the B
// section the phone rings — the motif as a marimba ringtone — and the jingle answers.
const OFFICE_A = bars(
  '7--54-7-----.... 3-4-5---4-5-7--5 7--54-7-----9-8- 7---6---4------- ' +
    '7--54-7-----.... 3-4-5---4-5-7--9 a--98-7---6-4--- 7-----------....',
);
const OFFICE_B = bars(
  '4247-...4247-... 8.7.5.4.7------- 4247-...4247-... 8.7.5.4.6------- ' +
    '7.5.4.2.4.5.7.9. 9-----8-7------- 8-7-5-4-6-5-4-2- 4---------------',
);

// Server room, night: the arpeggio plays the motif on every chord (5–3–5–8) under a cool
// tresillo lead that steps down the scale.
const DATACENTER_A = bars(
  '7..7..9.7..4..5. 4-------........ 6..6..8.6..3..4. 2-------........ ' +
    '5..5..7.5..2..3. 4-------9---7--- 8..8..a.8..6..5. ^---------------',
);
const DATACENTER_B = bars(
  '9-------b------- a-------8------- 7-------9---b--- b-----------.... ' +
    '9-------b---d--- c-------a------- 9-------7---5--- ^---------------',
);

// COPIL: spy-funk tension. The slap bass plays the motif's shape (5–3–5–8) on every chord,
// the lead climbs the agenda a step at a time.
const COPIL_A = bars(
  '7.7.9.7.a...9... 8.8.a.8.b...a... 9.9.b.9.c...b... b-------9------- ' +
    'a.a.8.a.7...8... 9.9.7.9.6...7... 8...7...6...5... 7-----------....',
);
const COPIL_B = bars(
  'c-------b---a--- a-------8---7--- 9---a---b---9--- ^-------....b-a- ' +
    'c-------b---a--- a-------b---c--- e---d---c---b--- ^---------------',
);

// Rooftop, dusk: a sweeping saw lead with strings; the B section is the main theme in
// full glory, in each hero's step.
const ROOFTOP_A = bars(
  '7---4-5-7---9--- 8-------7-6-4--- 7---4-5-7---b--- a-------9-7-8--- ' +
    '7---4-5-7---9--- 8-------7-6-4--- 5---7---9---8--- 7-----------....',
);

/** @satisfies {Record<string, Track>} */
export const STAGE_SONGS = {
  parking: {
    bpm: 96,
    root: 41,
    lead: 24,
    scale: MINOR,
    patch: 'whistle',
    level: 0.125,
    swing: 0.22,
    chords: PARKING_CHORDS,
    melody: PARKING_A,
    bass: '1..1.5..',
    bassWave: 'sub',
    kick: '1.........1.....',
    snare: '..1...1.',
    hat: '11111111',
    comp: '1..1....',
    compPatch: 'epiano',
    pad: 'warm',
    echo: 0.3,
    reverb: 0.45,
    chorus: 0.3,
    form: [
      {},
      {
        chords: chords('bIII bVII iv bVI bIII bVII bVI V7'),
        melody: PARKING_B,
        pad: 'strings',
        double: 'bells',
        bass: '1..5.1..',
        hat: '1o1o1o1o',
      },
      {
        counter: bars('9------- 7------- 9------- 8------- 9------- 7------- 5---^--- 4-------'),
        counterPatch: 'epiano',
        counterOct: 12,
        kick: '1.........1..1..',
      },
      {
        chords: chords('i bVI iv V'),
        melody: bars('4-2-4-7--------- ................ 4-2-4-a--------- ^---------------'),
        patch: 'bell',
        bass: '1-------',
        kick: '........',
        snare: '........',
        hat: '..1...1.',
        comp: '1.......',
        thin: true,
      },
    ],
  },
  office: {
    bpm: 120,
    root: 38,
    lead: 24,
    scale: MAJOR,
    patch: 'mallet',
    level: 0.13,
    chords: chords('I IV I V I IV ii|V I'),
    melody: OFFICE_A,
    bass: '1..21.5.',
    bassWave: 'pluck',
    kick: '1..1.1..',
    snare: '..1...1.',
    hat: '11111111',
    comp: '.1.1.1.1',
    compPatch: 'clav',
    echo: 0.15,
    form: [
      {},
      {
        chords: chords('vi7 IV vi7 V IV I ii7|V7 V7'),
        melody: OFFICE_B,
        bass: '1..51.5w',
        kick: '1..1..1.',
        hat: '1o1o1o1o',
        clap: '....1.......1...',
        pad: 'warm',
      },
      {
        counter: bars('2---4--- 1---3--- 2---4--- 4---3--- 2---4--- 1---3--- 3---6--- 2-------'),
        counterPatch: 'soft',
        counterOct: 0,
        bass: '1..21.2w',
      },
      // Coffee-machine breakdown: the jingle's head, just clav, bass and rimshots.
      {
        chords: chords('IVM7 iii7 ii7 Vs7|V7'),
        melody: bars('7--54-7--------- ................ 5--43-5--------- 6---------------'),
        bass: '1...5...',
        kick: '1.......',
        snare: '........',
        hat: '.1.1.1.1',
        clap: '',
        rim: '....1.......1...',
        thin: true,
      },
    ],
  },
  datacenter: {
    bpm: 124,
    root: 45,
    lead: 12,
    scale: MINOR,
    patch: 'saw',
    lp: 2200,
    glide: 0.05,
    level: 0.14,
    chords: chords('i bVI bVII i iv bVI bVII V'),
    melody: DATACENTER_A,
    bass: '1.1.1.2.',
    bassWave: 'synth',
    kick: '1...1...',
    snare: '......1.',
    hat: '.1.1.1.1',
    arp: 16,
    arpSeq: '5358',
    arpPatch: 'thin',
    pad: 'glass',
    hum: true,
    echo: 0.3,
    reverb: 0.35,
    chorus: 0.25,
    form: [
      {},
      {
        chords: chords('bIII bVII iv i bIII bVII bVI V'),
        melody: DATACENTER_B,
        patch: 'chip',
        bass: '1.1.5.2.',
        kick: '1..1.1..',
        snare: '....1...',
        hat: '.1.1.111',
      },
      // Breakdown: hum, arpeggio and the motif on a bell.
      {
        chords: chords('i bVI iv V'),
        melody: bars('4-2-4-7--------- ................ 4-2-4-9--------- ^---------------'),
        patch: 'bell',
        bass: '1-------',
        kick: '........',
        snare: '........',
        hat: '...1...1',
        thin: true,
      },
      {
        counter: bars('2---0--- 0---2--- 3---1--- 2---0--- 3---5--- 0---2--- 1---3--- 4-------'),
        counterPatch: 'thin',
        counterOct: 0,
        bass: '1.1.1.2w',
      },
    ],
  },
  copil: {
    bpm: 116,
    root: 43,
    lead: 12,
    scale: DORIAN,
    patch: 'square',
    level: 0.12,
    chords: chords('i IV i IV bVII IV v|bVII i'),
    melody: COPIL_A,
    bass: '5..3..5.2.......',
    bassWave: 'slap',
    kick: '1.....1...1.....',
    snare: '....1.......1...',
    hat: '1.1.1.1o1.1.1.1o',
    clap: '............1...',
    comp: '..1...1.',
    compPatch: 'guitar',
    echo: 0.15,
    form: [
      {},
      {
        scale: MINOR,
        chords: chords('bVI bVII i V bVI bVII iv V'),
        melody: COPIL_B,
        stab: '1..1..1.',
        stabPatch: 'brass',
        bass: '1..2..1.5.3.1.2w',
        kick: '1.....1.1.1.....',
        hat: '1.1o1.1.1.1o1.1o',
      },
      {
        counter: bars('4---5--- 5---3--- 4---5--- 5---3--- 3---4--- 3---2--- 1---0--- 0-------'),
        counterPatch: 'organ',
        counterOct: 0,
        comp: '',
        bass: '5..3..5.2.....2w',
      },
      // Breakdown: everyone holds their breath before the vote; the motif climbs the chords.
      {
        chords: chords('bIII IV bVII V'),
        melody: bars('6-4-6-9--------- 7-5-7-a--------- a-8-a-d--------- 8-^-8-b---------'),
        patch: 'organ',
        bass: '1.......1.....5.',
        kick: '1...............',
        snare: '............1...',
        hat: '..1...1...1...1.',
        clap: '',
        comp: '',
        thin: true,
      },
    ],
  },
  rooftop: {
    bpm: 132,
    root: 40,
    lead: 24,
    scale: MAJOR,
    patch: 'saw',
    lp: 3000,
    glide: 0.04,
    level: 0.15,
    chords: chords('I V vi IV I V IV|V I'),
    melody: ROOFTOP_A,
    bass: '1.1.5.1.',
    bassWave: 'saw',
    kick: '1.1.1.1.',
    snare: '..1...1.',
    hat: '.1.1.1.1',
    pad: 'strings',
    echo: 0.25,
    reverb: 0.3,
    chorus: 0.35,
    form: [
      {},
      {
        chords: THEME_CHORDS,
        melody: vary(THEME_A, { 7: '7-----------....' }),
        patch: 'brass',
        double: 'strings',
        bass: '1.2.5.2w',
        hat: '.o.o.o.o',
        kick: '1.1.1.11',
        charline: { melody: vary(THEME_A_SKIP, { 6: THEME_A[6] }) },
      },
      {
        counter: bars('9---b--- 8---6--- 7---9--- 5---4--- 9---b--- 8---6--- 7---8--- 9-------'),
        counterPatch: 'strings',
        double: 'bells',
        bass: '1.1.5.1w',
      },
      // Breakdown: wind and bells, then the drums build back up.
      {
        chords: chords('IV V vi V'),
        melody: bars('4-2-4-7--------- ................ 4-2-4-9--------- 8---------------'),
        patch: 'bell',
        bass: '1---5---',
        kick: '........',
        snare: '........',
        hat: '.1.1.1.1',
        thin: true,
      },
    ],
  },
};

// The sound effects, one synth recipe each.

import {
  rnd,
  pick,
  click,
  thump,
  ring,
  chime,
  note,
  brass,
  sizzle,
  signature,
  foot,
  gait,
  GAIT,
} from './sfx-kit.js';

/** @typedef {import('./types.js').Voice} Voice */
/** @typedef {import('./types.js').Foley} Foley */

/**
 * Speaking voices: pitch range of the blips, formant cutoff, wave, and a gain that evens
 * out their loudness (darker waves and the band-limited video call need more).
 * @typedef {{ lo: number, hi: number, lp: number, type: OscillatorType, gain: number }} VoiceDef
 * @type {Record<string, VoiceDef>}
 */
const VOICES = {
  kevin: { lo: 210, hi: 320, lp: 1500, type: 'square', gain: 1 },
  charline: { lo: 360, hi: 520, lp: 2200, type: 'square', gain: 1 },
  techServicesDirector: { lo: 240, hi: 330, lp: 1700, type: 'sawtooth', gain: 1.75 },
  regionalDirector: { lo: 160, hi: 230, lp: 1200, type: 'sawtooth', gain: 2 },
  colleague: { lo: 300, hi: 420, lp: 1800, type: 'square', gain: 1 },
  intern: { lo: 440, hi: 620, lp: 2600, type: 'square', gain: 1 },
  visio: { lo: 300, hi: 420, lp: 1500, type: 'sawtooth', gain: 6 },
  partner: { lo: 300, hi: 460, lp: 1900, type: 'square', gain: 1 },
  narrator: { lo: 280, hi: 380, lp: 1300, type: 'triangle', gain: 1.45 },
};
/** @type {VoiceDef} */
const VOICE_DEFAULT = { lo: 300, hi: 550, lp: 1800, type: 'square', gain: 1 };
/** One voiced syllable: buzzy source through a formant, the video-call voice band-limited. */
const syllable = (
  /** @type {Voice} */ v,
  /** @type {number} */ t,
  /** @type {string} */ who,
  /** @type {number} */ d,
  /** @type {number} */ vol,
) => {
  const { lo, hi, lp, type, gain } = VOICES[who] ?? VOICE_DEFAULT;
  const f = rnd(lo, hi);
  const g = vol * gain;
  if (who === 'visio') {
    v.tone({ f, t, d, type, v: g, lp, ft: 'bandpass', q: 2.5 });
    return;
  }
  v.tone({ f, t, d, type, v: g, lp: rnd(lp * 0.8, lp * 1.25), q: 3 });
  v.tone({ f: f * pick([2, 2.5, 3]), t, d: d * 0.8, v: g * 0.33 });
};

/** Effects with four takes (Foley.variant): the engine never plays the same take twice in a row. */
export const VARIED = new Set(['step', 'jump', 'land', 'touchdown', 'ticket']);

// Takes of the jump: the hop's sweep (from, to, length), the whoosh band, a cloth flick.
const JUMP_TAKES = [
  { a: 250, b: 600, d: 0.15, w: [700, 2200], flick: false },
  { a: 280, b: 720, d: 0.12, w: [900, 2600], flick: false },
  { a: 225, b: 520, d: 0.17, w: [600, 1900], flick: true },
  { a: 265, b: 640, d: 0.14, w: [800, 2400], flick: true },
];
// Takes of the landing: body pitch range, noise colour, slap pitch, settling grit.
const LAND_TAKES = [
  { b: [140, 170], n: [750, 950], c: [1200, 1600], grit: false },
  { b: [125, 150], n: [600, 800], c: [1000, 1300], grit: true },
  { b: [155, 185], n: [850, 1100], c: [1500, 1900], grit: false },
  { b: [135, 160], n: [700, 900], c: [1100, 1500], grit: true },
];
// Takes of the ticket: the coin's notes (fourths, fifths, a quick triad).
const TICKET_TAKES = [
  [988, 1319],
  [1047, 1397],
  [1175, 1568],
  [988, 1245, 1480],
];

/** @type {Record<string, (v: Voice, f: Foley) => void>} */
export const SFX = {
  // Springy push-off: scuff, rising triangle "hop", whoosh of air.
  jump: (v, f) => {
    const t = v.now;
    const g = GAIT[f.hero] ?? GAIT.kevin;
    const tk = JUMP_TAKES[f.variant & 3];
    const k = rnd(0.96, 1.05) * (0.55 + g.k * 0.5);
    foot(v, t, f.floor, g.w * 0.45, g.k, f.variant);
    click(v, t, 1800, 0.1, 1.2);
    v.tone({ f: tk.a * k, to: tk.b * k, t, d: tk.d, type: 'triangle', v: 0.34 });
    v.tone({ f: tk.a * 2 * k, to: tk.b * 2 * k, t: t + 0.01, d: tk.d * 0.6, v: 0.07 });
    v.noise({ t, d: 0.13, type: 'bandpass', f: tk.w[0], to: tk.w[1], q: 0.8, v: 0.07, a: 0.03 });
    if (tk.flick) v.noise({ t: t + 0.05, d: 0.05, type: 'highpass', f: 3500, v: 0.035, a: 0.01 });
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
  // Landing from a jump: both feet on the floor's material, then the body's weight.
  land: (v, f) => {
    const t = v.now;
    const { w, k } = gait(f);
    const tk = LAND_TAKES[f.variant & 3];
    // Body weight, kept audible for the lighter hero too.
    const b = 0.55 + 0.45 * w;
    foot(v, t, f.floor, w * 1.5, k * 0.95, f.variant);
    foot(v, t + 0.022, f.floor, w * 1.1, k, (f.variant + 1) & 3);
    thump(v, t, rnd(tk.b[0], tk.b[1]) * k, 55 * k, 0.07 + 0.04 * w, 0.26 * b);
    v.noise({ t, d: 0.08, f: rnd(tk.n[0], tk.n[1]), to: 250, v: 0.17 * b });
    click(v, t, rnd(tk.c[0], tk.c[1]), 0.06, 1.5, 0.015);
    if (tk.grit) {
      for (const dt of [0.05, 0.08]) click(v, t + dt, rnd(1800, 3200), 0.025, 3, 0.012);
    }
    // Kévin's weight: a sub thump you feel more than hear.
    if (w > 1) thump(v, t + 0.01, 70, 40, 0.12, 0.18 * (w - 0.6));
  },
  // A short drop: a quick two-foot plant, a touch heavier than a step.
  touchdown: (v, f) => {
    const t = v.now;
    const { w, k } = gait(f);
    // Takes: the gap between the two feet, and which foot leads.
    const gap = [0.028, 0.018, 0.038, 0.024][f.variant & 3];
    foot(v, t, f.floor, w * 1.2, k, f.variant);
    foot(v, t + gap, f.floor, w * 0.9, k * (f.variant & 1 ? 0.97 : 1.03), (f.variant + 2) & 3);
    thump(v, t, 120 * k, 60 * k, 0.06, 0.08 * w);
  },
  // Heavy landing: deep boom, crunch, then a little debris settling.
  hardland: (v, f) => {
    const t = v.now;
    foot(v, t, f.floor, 1.8, gait(f).k * 0.9);
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
  ticket: (v, f) => {
    const t = v.now;
    const fs = TICKET_TAKES[f.variant & 3];
    const gap = fs.length > 2 ? 0.05 : 0.07;
    v.noise({ t, d: 0.025, type: 'highpass', f: 5500, v: 0.05 });
    fs.forEach((hz, i) => {
      const last = i === fs.length - 1;
      note(v, t + i * gap, hz, last ? 0.26 : 0.08, last ? 0.12 : 0.11);
    });
    chime(v, t + (fs.length - 1) * gap, fs[fs.length - 1] * 2, 0.3, 0.035);
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
  // Pitched and coloured by the speaker (`who`), so each character sounds like themself.
  talk: (v, f) => syllable(v, v.now, f.who, 0.045, 0.09),
  // Speech bubble: a soft pop, then a two- or three-syllable mumble in the speaker's voice.
  bubble: (v, f) => {
    const t = v.now;
    v.tone({ f: 620, to: 1000, t, d: 0.04, v: 0.06 });
    click(v, t, 3000, 0.03, 2, 0.006);
    const n = pick([2, 3]);
    for (let i = 0; i < n; i++) syllable(v, t + 0.05 + i * 0.075, f.who, 0.055, 0.07);
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
  // Footstep: the floor's own material, weighted by the hero, alternating feet.
  step: (v, f) => {
    const { w, k } = gait(f);
    foot(v, v.now, f.floor, w, k, f.variant);
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

  // --- events with their own sound (were aliases) ---
  // Kévin's heavy CR knocks an archive box over: cardboard crunch, the box thuds down,
  // papers flutter, and a small reward ding.
  archive: (v) => {
    const t = v.now;
    for (let i = 0; i < 4; i++)
      click(v, t + i * 0.02 + rnd(0, 0.006), rnd(700, 1800), 0.2, 2, 0.03);
    thump(v, t + 0.05, 130, 60, 0.18, 0.45);
    v.noise({ t: t + 0.05, d: 0.18, f: 700, to: 200, v: 0.24 });
    for (let i = 0; i < 5; i++) {
      const at = t + 0.12 + i * 0.05 + rnd(0, 0.02);
      v.noise({ t: at, d: 0.04, type: 'bandpass', f: rnd(2500, 4000), q: 3, v: 0.06 });
    }
    chime(v, t + 0.1, 1175, 0.22, 0.05);
  },
  // Head against the ceiling: hollow knock and a small dropping "tonk".
  bonk: (v, f) => {
    const t = v.now;
    const { k } = gait(f);
    click(v, t, 1200, 0.2, 3, 0.015);
    thump(v, t, 240, 140, 0.06, 0.3);
    v.tone({ f: 520 * k, to: 380 * k, t, d: 0.08, type: 'square', v: 0.07, lp: 1800 });
  },
  // A CR slaps against a director on guard: paper slap, then a muted "nuh-uh" (wait for
  // PRIMO). Distinct from the wooden block of crates and vacuums.
  guard: (v) => {
    const t = v.now;
    v.noise({ t, d: 0.04, type: 'bandpass', f: 2400, q: 1.2, v: 0.25, a: 0.001 });
    thump(v, t, 200, 110, 0.06, 0.2);
    for (const [at, f, d] of [
      [0.06, 330, 0.11],
      [0.2, 247, 0.22],
    ]) {
      brass(v, t + at, f, d, 0.05);
      v.tone({ f: f * 2, to: f * 1.94, t: t + at, d, type: 'square', v: 0.03, lp: 1400 });
    }
  },
  // A charging chair stopped (by a wall or a CR): caster skid, padded thud, casters settle.
  chairBump: (v) => {
    const t = v.now;
    const sq = rnd(1500, 1800);
    v.tone({ f: sq, to: sq * 0.6, t, d: 0.12, type: 'sawtooth', v: 0.02, lp: 2500, q: 6 });
    v.noise({ t, d: 0.1, type: 'bandpass', f: 1800, to: 900, q: 3, v: 0.08 });
    thump(v, t + 0.06, 140, 75, 0.12, 0.42);
    v.noise({ t: t + 0.06, d: 0.06, f: 600, v: 0.22 });
    click(v, t + 0.06, 900, 0.15, 3, 0.02);
    for (let i = 0; i < 3; i++) {
      click(v, t + 0.13 + i * rnd(0.035, 0.05), rnd(2200, 3000), 0.05 * (1 - i * 0.25), 4, 0.012);
    }
  },
  // Céline Dion concert tickets: a harp sweep over a major seventh, a crowd's "aah", sparkle.
  concert: (v) => {
    const t = v.now;
    for (const [i, f] of [523, 659, 784, 988, 1319].entries()) {
      v.tone({ f, t: t + i * 0.05, d: 0.7, type: 'triangle', v: 0.09, a: 0.003 });
      v.tone({ f: f * 2, t: t + i * 0.05, d: 0.3, v: 0.02, pan: i % 2 ? 0.4 : -0.4 });
    }
    v.noise({ t: t + 0.1, d: 0.85, type: 'bandpass', f: 700, to: 1100, q: 2, v: 0.08, a: 0.3 });
    v.noise({ t: t + 0.1, d: 0.8, type: 'bandpass', f: 1800, to: 2400, q: 3, v: 0.04, a: 0.35 });
    sizzle(v, t + 0.25, 0.6, 0.025);
  },
  // Water shut-off valve: the wheel squeaks round, the pipe clanks, the hiss dies down to a
  // gurgle, and a ding says the sprinklers are off.
  switch: (v) => {
    const t = v.now;
    for (let i = 0; i < 3; i++) {
      const f = 600 + i * 80;
      v.tone({
        f,
        to: f + 100,
        t: t + i * 0.09,
        d: 0.07,
        type: 'sawtooth',
        v: 0.035,
        lp: 1800,
        q: 7,
        vib: [20, 40],
      });
    }
    const at = t + 0.28;
    thump(v, at, 160, 80, 0.12, 0.4);
    click(v, at, 2200, 0.15, 3, 0.015);
    ring(v, at, 640, 0.3, 0.04, [1, 2.7]);
    v.noise({ t: at, d: 0.5, type: 'bandpass', f: 4500, to: 1500, q: 0.8, v: 0.08, a: 0.01 });
    for (let i = 0; i < 4; i++) {
      v.tone({ f: rnd(250, 450), to: rnd(600, 900), t: at + 0.08 + i * 0.07, d: 0.04, v: 0.05 });
    }
    chime(v, t + 0.55, 880, 0.35, 0.07);
  },
  // A colleague notices you: a rising "hm?" and a little "!" ping.
  wake: (v) => {
    const t = v.now;
    const f = rnd(200, 240);
    v.tone({ f, to: f * 1.5, t, d: 0.14, type: 'sawtooth', v: 0.06, lp: 900, lpTo: 1700, q: 4 });
    v.tone({ f: f * 2, to: f * 3, t, d: 0.1, v: 0.02 });
    chime(v, t + 0.13, 1568, 0.18, 0.06);
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
  // Rodolphe's grand finale (third phase): a long riser, then an orchestral hit in D minor
  // with a choir, a gong and two tolls of a bell.
  finale: (v) => {
    const t = v.now;
    v.noise({ t, d: 1.0, type: 'bandpass', f: 200, to: 6000, v: 0.22, a: 0.9 });
    for (const f of [110, 165]) {
      v.tone({ f, to: f * 2, t, d: 1.0, type: 'sawtooth', v: 0.06, lp: 1600, a: 0.8, det: 8 });
    }
    const top = t + 1.0;
    thump(v, top, 70, 32, 0.8, 0.75);
    v.noise({ t: top, d: 0.5, f: 1000, to: 150, v: 0.33 });
    click(v, top, 2000, 0.18, 1, 0.025);
    for (const f of [147, 220, 294, 349, 440]) brass(v, top, f, 0.9, 0.045);
    for (const f of [294, 349, 440]) {
      v.tone({
        f,
        t: top,
        d: 1.4,
        type: 'sawtooth',
        v: 0.035,
        lp: 900,
        ft: 'bandpass',
        q: 3,
        a: 0.08,
        vib: [5, 12],
      });
    }
    ring(v, top, 98, 2.0, 0.07, [1, 2.4, 4.1, 5.9]);
    chime(v, top, 587, 1.2, 0.06);
    chime(v, top + 0.45, 587, 1.0, 0.045);
    sizzle(v, top, 1.2, 0.04);
  },
  // The PRIMO window closing: a bright clock tick (main.js raises the pitch per tick).
  consultTick: (v) => {
    const t = v.now;
    click(v, t, 5000, 0.08, 6, 0.006);
    v.tone({ f: 1976, t, d: 0.04, type: 'triangle', v: 0.16, a: 0.001 });
    v.tone({ f: 3951, t, d: 0.02, v: 0.03, a: 0.001 });
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
  // Boss arena, second phase: a server rack locks in place at the top of its rise
  // (hydraulic sigh, latch clunk, a hollow cabinet ring).
  riserUp: (v) => {
    const t = v.now;
    v.noise({ t, d: 0.3, type: 'bandpass', f: 2400, to: 900, q: 1.2, v: 0.12, a: 0.02 });
    thump(v, t + 0.12, 110, 60, 0.14, 0.4);
    click(v, t + 0.12, 2200, 0.16, 3, 0.02);
    ring(v, t + 0.12, 310, 0.35, 0.05, [1, 2.3, 3.9]);
  },
  // A lighting truss drops from the rig and clangs to a stop on its chains.
  riserDown: (v) => {
    const t = v.now;
    thump(v, t, 95, 45, 0.3, 0.5);
    click(v, t, 3000, 0.18, 1.2, 0.02);
    ring(v, t, 440, 0.6, 0.06, [1, 2.76, 5.4]);
    for (let i = 0; i < 3; i++) click(v, t + 0.08 + i * 0.05, rnd(4000, 6000), 0.05, 4, 0.01);
  },
  // A stunned intern drops his stack of files: a paper slap with a little slide.
  pile: (v) => {
    const t = v.now;
    thump(v, t, 140, 70, 0.1, 0.35);
    v.noise({ t, d: 0.08, f: 900, v: 0.2 });
    v.noise({ t: t + 0.03, d: 0.18, type: 'bandpass', f: 2600, to: 1500, q: 1, v: 0.08, a: 0.02 });
  },
  // The stack is picked back up: a quick riffle of pages.
  pileGone: (v) => {
    const t = v.now;
    for (let i = 0; i < 5; i++)
      v.noise({ t: t + i * 0.035, d: 0.04, type: 'bandpass', f: rnd(2500, 4000), q: 2, v: 0.3 });
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
  // Back / close: the confirm figure, falling.
  back: (v) => {
    const t = v.now;
    click(v, t, 3000, 0.035, 2, 0.008);
    v.tone({ f: 820, t, d: 0.06, type: 'triangle', v: 0.22 });
    v.tone({ f: 560, t: t + 0.055, d: 0.1, type: 'triangle', v: 0.2 });
  },
  // Poster page turn: a paper swish and a soft tick.
  page: (v) => {
    const t = v.now;
    v.noise({ t, d: 0.13, type: 'bandpass', f: 1500, to: 4200, q: 0.9, v: 0.15, a: 0.03 });
    click(v, t + 0.1, 2200, 0.05, 2, 0.01);
    v.tone({ f: 880, t: t + 0.1, d: 0.03, type: 'triangle', v: 0.05 });
  },
  // Trophy unlocked: a pop, a warm bell arpeggio and a shimmer (the 'secret' jingle is chip).
  trophy: (v) => {
    const t = v.now;
    v.tone({ f: 300, to: 600, t, d: 0.06, type: 'triangle', v: 0.15 });
    for (const [i, f] of [1047, 1319, 1568].entries()) chime(v, t + 0.06 + i * 0.07, f, 0.5, 0.1);
    v.tone({ f: 523, t: t + 0.06, d: 0.6, type: 'triangle', v: 0.06, a: 0.03 });
    v.noise({ t: t + 0.2, d: 0.5, type: 'bandpass', f: 6000, to: 9000, q: 2, v: 0.025, a: 0.1 });
  },
  // New best time on the results screen: rising brass triplet, held chord, bells, cymbal.
  record: (v) => {
    const t = v.now;
    for (const [i, f] of [392, 523, 659].entries()) {
      note(v, t + i * 0.09, f * 2, 0.08, 0.1);
      brass(v, t + i * 0.09, f, 0.09, 0.05);
    }
    const top = t + 0.3;
    for (const f of [523, 659, 784, 1047]) {
      note(v, top, f, 0.9, 0.05);
      brass(v, top, f / 2, 0.9, 0.03);
    }
    thump(v, top, 98, 50, 0.3, 0.35);
    for (const [i, f] of [2093, 2637, 3136].entries()) chime(v, top + 0.05 + i * 0.1, f, 0.8, 0.04);
    sizzle(v, top, 1.0, 0.04);
  },
  // Another gold line on the results (all secrets, no return to the badge): a golden ding.
  gold: (v) => {
    const t = v.now;
    chime(v, t, 1568, 0.4, 0.12);
    chime(v, t + 0.08, 2093, 0.55, 0.1);
    v.noise({ t: t + 0.08, d: 0.4, type: 'bandpass', f: 7000, to: 9500, q: 2, v: 0.02, a: 0.08 });
  },
};

/** Every speaking voice. */
export const VOICE_IDS = Object.keys(VOICES);
/** Every sound effect name. */
export const SFX_TYPES = Object.keys(SFX);

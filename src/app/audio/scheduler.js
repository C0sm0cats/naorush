// Music scheduler: a look-ahead clock and the per-sixteenth synthesis of a song.

import { degreeOf } from './tracks/theory.js';
import { mtof } from './util.js';
import { PATCHES } from './voice.js';

/** @typedef {import('./types.js').Voice} Voice */
/** @typedef {import('./types.js').Run} Run */
/** @typedef {import('./types.js').Bar} Bar */
/** @typedef {import('./types.js').NoteOpts} NoteOpts */

const LOOKAHEAD = 0.14;
const TICK_MS = 25;
// Pads, comping and stabs are voiced inside one octave from here (MIDI), so chords move
// by the nearest notes instead of jumping in parallel.
const PAD_LOW = 53;
const STAB_LOW = 57;
// Mix: the melody leads, the bass supports (both scale their instruments' own levels).
const MEL_GAIN = 1.5;
const BASS_GAIN = 0.6;
const DRUM_GAIN = 0.7;

/**
 * Starts the look-ahead clock of a run: every tick schedules the steps due before
 * ctx.currentTime + LOOKAHEAD. A `once` track stops its clock at the end.
 * @param {BaseAudioContext} ctx @param {Run} run @param {number} total song length in sixteenths
 * @param {() => boolean} silent muted or music at zero: keep time, schedule nothing
 * @param {() => number[]} targets drive, lead and finale layer gain targets
 */
export function startClock(ctx, run, total, silent, targets) {
  const { def } = run;
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
    const quiet = silent();
    while (run.next < ctx.currentTime + LOOKAHEAD) {
      if (def.once && run.step >= total) {
        if (run.timer) clearInterval(run.timer);
        run.timer = null;
        return;
      }
      if (!quiet) step(run, total, targets());
      run.next += 60 / def.bpm / 4;
      run.step++;
    }
  }, TICK_MS);
}

/**
 * Sixteenth of the song form at a run's step: the intro plays once, then the rest loops.
 * @param {Run} run @param {number} total
 */
export function position(run, total) {
  const loop = run.loop * 16;
  return run.step < total ? run.step : loop + ((run.step - total) % (total - loop));
}

/** Notes of a chord voiced inside the octave above `low`. */
const voicing = (/** @type {number} */ base, /** @type {number[]} */ tones, low = PAD_LOW) =>
  tones.map((k) => low + ((((base + k - low) % 12) + 12) % 12));

/** @param {string} name @param {Voice} v @param {NoteOpts} n */
const play = (name, v, n) => (PATCHES[name] ?? PATCHES.square)(v, n);

/**
 * Schedules one sixteenth-note step of a track at run.next.
 * @param {Run} run
 * @param {number} total song length in sixteenths
 * @param {number[]} targets drive, lead and finale layer gain targets
 */
export function step(run, total, [driveT = 0, leadT = 0, finaleT = 0]) {
  const song = run.def;
  const s16 = 60 / song.bpm / 4;
  const s = position(run, total);
  const bar = run.bars[Math.floor(s / 16)];
  const d = bar.def;
  const i = s % 16;
  // Swing: off-beat eighths land a little late.
  const t = run.next + (song.swing && i % 4 === 2 ? song.swing * s16 : 0);
  const ch = bar.chords[bar.chords.length > 1 && i >= 8 ? 1 : 0];
  const root = song.root + bar.key;
  const base = root + ch.root;
  const [, third, fifth] = ch.tones;
  // Seventh: flat on minor chords and on the dominant, major elsewhere.
  const seventh = ch.tones[3] ?? (ch.minor || ch.root === 7 ? 10 : 11);
  const tones = d.sev && ch.tones.length === 3 ? [...ch.tones, seventh] : ch.tones;
  const loop = !song.once;
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
  /** Melody character (scale degree, Shift = sharp) to MIDI note. */
  const degree = (/** @type {string} */ c, /** @type {number} */ oct) => {
    const [deg, sharp] = degreeOf(c);
    return root + oct + d.scale[deg % 7] + 12 * Math.floor(deg / 7) + sharp;
  };
  const driveOn = driveT > 0 || run.drive.gain.value > 0.001;
  const leadOn = leadT > 0 || run.lead.gain.value > 0.001;
  const finaleOn = finaleT > 0 || run.finale.gain.value > 0.001;
  const { base: v, wet, pad, drive, lead, finale } = run.voices;

  // Melody
  const m = onset(bar.mel);
  if (m) {
    const [c, holds, after] = m;
    const len = holds ? holds + 0.9 : after === '.' ? 1.8 : 0.9;
    const note = degree(c, d.lead);
    const u = unit(bar.mel);
    const dur = u * len;
    const legato = d.glide && run.prev && t - run.prevEnd < u * 0.3;
    const f = mtof(note);
    const patch = d.patch ?? 'square';
    const g = (d.level ?? 0.12) * MEL_GAIN;
    play(patch, wet, { f, t, d: dur, g, lp: d.lp, from: legato ? mtof(run.prev) : undefined });
    run.prev = note;
    run.prevEnd = t + dur;
    if (d.double === 'bells') PATCHES.bell(wet, { f: f * 2, t, d: dur, g: 0.045 });
    else if (d.double === 'octave') play(patch, wet, { f: f / 2, t, d: dur, g: g * 0.55 });
    else if (d.double === 'strings') PATCHES.strings(pad, { f, t, d: dur, g: g * 0.6 });
    else if (d.double === 'horns' && dur > 0.3) {
      // Brass section on the long notes, an octave below, kept dry for weight.
      PATCHES.brass(v, { f: f / 2, t, d: dur, g: 0.1 });
    }
  }

  // Countermelody, an octave (or `counterOct`) under the melody
  const cm = bar.counter ? onset(bar.counter) : null;
  if (cm) {
    const [c, holds] = cm;
    const dur = unit(bar.counter) * (holds ? holds + 0.9 : 0.9);
    const f = mtof(degree(c, d.lead - (d.counterOct ?? 12)));
    play(d.counterPatch ?? 'soft', v, { f, t, d: dur, g: 0.055, pan: -0.25 });
  }

  // Bass
  const b = onset(d.bass);
  if (b) {
    const [c, holds] = b;
    const dur = unit(d.bass) * (holds ? holds + 0.9 : 0.9);
    /** @type {Record<string, number>} */
    const shifts = { 0: -12, 1: 0, 2: 12, 3: third, 4: 5, 5: fifth, 6: 9, 7: seventh, b: 10 };
    const next = song.root + bar.next;
    const midi = c === 'w' ? next - 1 : c === 'u' ? next + 1 : base + (shifts[c] ?? 0);
    const f = mtof(midi);
    if (c === 'x') {
      v.noise({ t, d: 0.03, type: 'bandpass', f: 900, q: 2, v: 0.12 });
      v.tone({ f: mtof(base), t, d: 0.045, type: 'triangle', v: 0.16, a: 0.002 });
    } else bassNote(d.bassWave, louder(v, BASS_GAIN), f, t, dur, s16);
    if (driveOn && c !== 'x') {
      drive.tone({
        f: f * 2,
        t,
        d: dur * 0.8,
        type: 'sawtooth',
        v: 0.075,
        lp: 1100,
        sus: 0.5,
        rel: 0.04,
      });
    }
  }
  // Pulse: a resonant sixteenth sequence whose filter opens and closes every 4 bars (the
  // cutoff moves in eighth-of-a-sweep steps, so notes share a handful of filters).
  if (d.pulse && !(bar.thin && i % 2)) {
    const k = [0, 0, 12, 0, 0, 12, 0, 7, 0, 0, 12, 0, 0, 12, 7, 12][i];
    const sweep = 0.5 - 0.5 * Math.cos((2 * Math.PI * (s % 64)) / 64);
    v.tone({
      f: mtof(base + 12 + k),
      t,
      d: s16 * 0.7,
      type: 'sawtooth',
      v: i % 4 ? 0.07 : 0.1,
      lp: 450 + 2300 * (Math.round(sweep * 8) / 8),
      q: 7,
      a: 0.002,
      sus: 0.6,
      rel: 0.02,
      pan: i % 2 ? 0.15 : -0.15,
    });
  }

  // Harmony
  if (d.arp && (d.arp === 16 || i % 2 === 0)) {
    const k8 = d.arp === 16 ? i : i / 2;
    /** @type {Record<string, number>} */
    const tone = { 1: 0, 3: third, 5: fifth, 7: seventh, 8: 12, a: third + 12, c: fifth + 12 };
    const k = d.arpSeq
      ? (tone[d.arpSeq[k8 % d.arpSeq.length]] ?? 0)
      : (bar.sec % 2
          ? [12, fifth, third, fifth, 12, fifth + 12, 12, third + 12]
          : [0, third, fifth, 12, fifth, third, 12, fifth + 12])[k8 % 8];
    const n = { f: mtof(base + 24 + k), t, d: s16 * (d.arp === 16 ? 0.9 : 1.6), g: 0.06 };
    if (d.arpPatch) play(d.arpPatch, wet, { ...n, pan: i % 4 < 2 ? -0.3 : 0.3 });
    else {
      wet.tone({
        f: n.f,
        t,
        d: n.d,
        type: 'square',
        v: d.arp === 16 ? 0.05 : 0.07,
        lp: 1800,
        pan: i % 4 < 2 ? -0.3 : 0.3,
      });
    }
  }
  const halves = bar.chords.length > 1;
  if ((d.pad || d.hum || d.drone) && (i === 0 || (halves && i === 8))) {
    const dur = s16 * (halves ? 8 : 16) + 0.25;
    if (d.pad) padChord(d.pad, pad, voicing(base, tones), t, dur);
    if (d.hum) {
      v.tone({ f: mtof(song.root + 12), t, d: dur, type: 'sawtooth', v: 0.06, a: 0.3, lp: 260 });
      v.noise({ t, d: dur, type: 'bandpass', f: 120, q: 4, v: 0.08, a: 0.3 });
    }
    if (d.drone && i === 0) {
      // Bagpipe drones: the tonic in two octaves and the fifth, steady through the bar.
      for (const [k, g] of [
        [-12, 0.05],
        [0, 0.035],
        [7, 0.025],
      ]) {
        pad.tone({
          f: mtof(root + k),
          t,
          d: dur,
          wave: 'reed',
          v: g,
          a: 0.08,
          sus: 1,
          rel: 0.2,
          lp: 1500,
        });
      }
    }
  }
  if (d.comp && at(d.comp) === '1') {
    for (const n of voicing(base, tones)) compNote(d.compPatch, v, mtof(n), t, s16, n === base);
  }
  if (d.stab && at(d.stab) === '1') {
    for (const n of voicing(base, tones, STAB_LOW)) stabNote(d.stabPatch, v, mtof(n), t, s16);
  }

  drums(run, bar, i, t, s16, at, base, driveOn);

  // Lead layer: the section's descant, or a sparkling counter arpeggio
  if (leadOn && loop) {
    const dm = bar.descant ? onset(bar.descant) : null;
    if (bar.descant) {
      if (dm) {
        const [c, holds] = dm;
        const dur = unit(bar.descant) * (holds ? holds + 0.9 : 0.9);
        const f = mtof(degree(c, d.lead + 12));
        play(d.descantPatch ?? 'bell', lead, { f, t, d: dur, g: 0.07, pan: 0.3 });
      }
    } else if (!bar.thin || i % 2 === 0) {
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
        type: 'square',
        v: 0.04,
        lp: 3200,
        pan: i % 2 ? 0.45 : -0.45,
      });
    }
  }

  // Finale layer (a boss's last phase): its own line, and a pipe-band roll under it
  if (finaleOn && loop) {
    const fm = bar.finale ? onset(bar.finale) : null;
    if (fm) {
      const [c, holds] = fm;
      const dur = unit(bar.finale) * (holds ? holds + 0.9 : 0.9);
      const f = mtof(degree(c, d.lead - (d.finaleOct ?? 0)));
      play(d.finalePatch ?? 'brass', finale, { f, t, d: dur, g: 0.13 });
    }
    if (!bar.thin) {
      const accent = i % 4 === 0;
      finale.noise({ t, d: 0.05, type: 'highpass', f: 2500, v: accent ? 0.14 : 0.07, pan: -0.2 });
      if (i === 0)
        finale.tone({ f: mtof(root - 12), to: mtof(root - 12) * 0.9, t, d: 0.6, v: 0.4, a: 0.004 });
    }
  }
}

/**
 * One bass note.
 * @param {string | undefined} kind @param {Voice} v @param {number} f @param {number} t
 * @param {number} d @param {number} s16
 */
function bassNote(kind, v, f, t, d, s16) {
  switch (kind) {
    case 'pluck':
      // Pizzicato: short and round, a little click of the string.
      v.tone({ f, t, d: Math.min(d, s16 * 1.6), type: 'triangle', v: 0.55, a: 0.003 });
      v.tone({ f: f * 2, t, d: 0.06, v: 0.08, a: 0.002 });
      break;
    case 'saw':
      // Analog bass: a filtered saw over a sine sub.
      v.tone({ f, t, d, type: 'sawtooth', v: 0.17, lp: 750, q: 2, a: 0.004, sus: 0.55, rel: 0.05 });
      v.tone({ f, t, d, v: 0.2, a: 0.005, sus: 0.8, rel: 0.05 });
      break;
    case 'slap':
      // Thumb slap: a bright pop over a round body.
      v.tone({ f, t, d, type: 'triangle', v: 0.36, a: 0.002, sus: 0.55, rel: 0.05 });
      v.tone({ f, t, d: 0.07, type: 'sawtooth', v: 0.22, lp: 2600, a: 0.001 });
      break;
    case 'sub':
      v.tone({ f, t, d, v: 0.28, a: 0.006, sus: 0.85, rel: 0.06 });
      v.tone({ f: f * 2, t, d, type: 'triangle', v: 0.06, a: 0.006, sus: 0.6, rel: 0.06 });
      break;
    case 'fm':
      // FM bass: a metallic growl at the attack that settles into a sine.
      v.tone({ f, t, d, v: 0.36, a: 0.003, sus: 0.6, rel: 0.05, fm: [1, 2.4, 0.35] });
      break;
    case 'synth':
      v.tone({ f, t, d, wave: 'pulse25', v: 0.18, lp: 950, a: 0.004, sus: 0.6, rel: 0.05 });
      v.tone({ f, t, d, v: 0.19, a: 0.005, sus: 0.8, rel: 0.05 });
      break;
    case 'upright':
      // Upright bass: a woody thump, then a round note that rings a little.
      v.tone({ f, t, d: Math.max(d, 0.3), type: 'triangle', v: 0.46, a: 0.01 });
      v.noise({ t, d: 0.04, type: 'lowpass', f: 500, v: 0.14 });
      break;
    default:
      v.tone({ f, t, d, type: 'triangle', v: 0.5, a: 0.008 });
  }
}

/**
 * One chord of the pad (notes already voiced).
 * @param {string} kind @param {Voice} v @param {number[]} notes @param {number} t @param {number} d
 */
function padChord(kind, v, notes, t, d) {
  for (const n of notes) {
    const f = mtof(n + 12);
    switch (kind) {
      case 'strings':
        // One saw per note: the run's chorus makes the ensemble.
        v.tone({ f, t, d, type: 'sawtooth', v: 0.036, a: 0.3, sus: 0.9, rel: 0.3, lp: 1900 });
        break;
      case 'choir':
        // "Aah" choir: saws through a vowel formant (the chorus spreads the voices).
        v.tone({
          f: f / 2,
          t,
          d,
          type: 'sawtooth',
          v: 0.075,
          a: 0.4,
          sus: 0.9,
          rel: 0.35,
          lp: 820,
          ft: 'bandpass',
          q: 1.4,
        });
        break;
      case 'organ':
        v.tone({ f: f / 2, t, d, wave: 'organ', v: 0.028, a: 0.02, sus: 1, rel: 0.12 });
        break;
      case 'glass':
        v.tone({ f, t, d, type: 'triangle', v: 0.04, a: 0.25, sus: 0.7, rel: 0.4 });
        break;
      default:
        v.tone({ f, t, d, type: 'triangle', v: 0.05, a: 0.35, sus: 0.85, rel: 0.35 });
    }
  }
}

/**
 * One note of a comping chord.
 * @param {string | undefined} kind @param {Voice} v @param {number} f @param {number} t
 * @param {number} s16 @param {boolean} low the chord's root
 */
function compNote(kind, v, f, t, s16, low) {
  switch (kind) {
    case 'clav':
      v.tone({
        f,
        t,
        d: s16 * 1.2,
        wave: 'pulse25',
        v: 0.07,
        a: 0.002,
        sus: 0.4,
        rel: 0.03,
        lp: 2600,
        pan: low ? -0.15 : 0.15,
      });
      break;
    case 'guitar':
      // Muted funk guitar: a short, nasal chop.
      v.tone({
        f,
        t,
        d: s16 * 0.9,
        type: 'sawtooth',
        v: 0.09,
        a: 0.002,
        sus: 0.35,
        rel: 0.03,
        lp: 1600,
        ft: 'bandpass',
        q: 0.9,
        pan: 0.3,
      });
      break;
    case 'epiano':
      v.tone({ f, t, d: s16 * 4, v: 0.06, a: 0.003, fm: [1, 1.2, 0.1], pan: low ? -0.2 : 0.2 });
      break;
    case 'piano':
      v.tone({ f, t, d: s16 * 5, type: 'triangle', v: 0.065, a: 0.003 });
      break;
    case 'organ':
      v.tone({ f, t, d: s16 * 1.6, wave: 'organ', v: 0.03, a: 0.005, sus: 1, rel: 0.04 });
      break;
    default:
      v.tone({ f, t, d: s16 * 3, type: 'triangle', v: 0.05, a: 0.01 });
  }
}

/**
 * One note of a chord stab.
 * @param {string | undefined} kind @param {Voice} v @param {number} f @param {number} t
 * @param {number} s16
 */
function stabNote(kind, v, f, t, s16) {
  switch (kind) {
    case 'epiano':
      // Electric piano: the tine's bark over a sine body.
      v.tone({ f, t, d: s16 * 5, v: 0.05, a: 0.004, fm: [1, 1.3, 0.1] });
      break;
    case 'strings':
      v.tone({ f, t, d: s16 * 1.8, type: 'sawtooth', det: 10, v: 0.05, a: 0.008, lp: 3200 });
      break;
    case 'organ':
      v.tone({ f, t, d: s16 * 1.5, wave: 'organ', v: 0.035, a: 0.004, sus: 1, rel: 0.04 });
      break;
    default:
      v.tone({ f, t, d: 0.22, type: 'sawtooth', v: 0.04, lp: 2200, det: 12, a: 0.004 });
  }
}

/**
 * Drum kit and the drive layer's extra percussion.
 * @param {Run} run @param {Bar} bar @param {number} i @param {number} t @param {number} s16
 * @param {(p: string) => string} at @param {number} base chord root @param {boolean} driveOn
 */
function drums(run, bar, i, t, s16, at, base, driveOn) {
  const d = bar.def;
  const v = louder(run.voices.base, DRUM_GAIN);
  const drive = louder(run.voices.drive, DRUM_GAIN);
  const kit = d.kit ?? 'pop';
  const loop = !run.def.once;
  const kick = (/** @type {Voice} */ to, /** @type {number} */ g) => {
    if (kit === 'big') to.tone({ f: 130, to: 40, t, d: 0.3, v: g, a: 0.003 });
    else if (kit === 'electro') to.tone({ f: 175, to: 45, t, d: 0.22, v: g * 1.05, a: 0.002 });
    else if (kit === 'brush') to.tone({ f: 110, to: 50, t, d: 0.16, v: g * 0.6, a: 0.006 });
    else to.tone({ f: 150, to: 42, t, d: 0.18, v: g, a: 0.003 });
    if (kit !== 'brush') to.noise({ t, d: 0.015, type: 'highpass', f: 3000, v: 0.05 });
  };
  // Crash on every section change, including the loop point
  if (loop && bar.start && i === 0 && run.step > 0) {
    if (kit === 'brush')
      v.noise({ t, d: 1.2, type: 'bandpass', f: 5500, q: 1.2, v: 0.05, a: 0.02 });
    else {
      v.noise({ t, d: 1.4, type: 'highpass', f: 6000, v: 0.07, a: 0.002 });
      v.noise({ t, d: 0.45, type: 'bandpass', f: 3500, q: 0.8, v: 0.05 });
    }
  }
  if (at(d.kick) === '1') {
    kick(v, 0.75);
    if (d.pump) duck(run, t, d.pump);
  }
  if (loop && bar.fill && !d.nofill && i >= 12) {
    // Section-end fill: four rising hits on the last beat
    const g = 0.13 + (i - 12) * 0.05;
    if (kit === 'big') {
      // Timpani: tuned to the chord root and fifth, a soft mallet noise on top.
      const f = mtof(base - 12 + (i % 2 ? 7 : 0));
      v.tone({ f, to: f * 0.97, t, d: 0.45, v: g * 1.8, a: 0.004 });
      v.noise({ t, d: 0.06, type: 'bandpass', f: 400, q: 1, v: g * 0.6 });
    } else if (kit === 'march') {
      // Snare ruff: two strokes per sixteenth, getting louder.
      for (const k of [0, 0.5]) {
        v.noise({ t: t + k * s16, d: 0.06, type: 'highpass', f: 2200, v: g * 1.3 });
      }
    } else if (kit === 'brush') {
      v.noise({ t, d: 0.12, type: 'bandpass', f: 2800, q: 0.7, v: g * 0.7, a: 0.015 });
    } else {
      v.noise({ t, d: 0.09, type: 'highpass', f: 1500, v: g });
      v.tone({ f: 260 - (i - 12) * 30, to: 110, t, d: 0.1, type: 'triangle', v: g, a: 0.003 });
    }
  } else if (at(d.snare) === '1') {
    if (kit === 'big') {
      v.noise({ t, d: 0.35, type: 'bandpass', f: 1800, q: 0.6, v: 0.35 });
      v.tone({ f: 180, to: 140, t, d: 0.12, type: 'triangle', v: 0.3 });
      clap(v, t, 0.18);
    } else if (kit === 'electro') {
      v.noise({ t, d: 0.16, type: 'bandpass', f: 1900, q: 0.7, v: 0.34 });
      v.tone({ f: 195, to: 150, t, d: 0.08, type: 'triangle', v: 0.22 });
    } else if (kit === 'brush') {
      v.noise({ t, d: 0.18, type: 'bandpass', f: 3000, q: 0.6, v: 0.16, a: 0.02 });
    } else if (kit === 'march') {
      v.noise({ t, d: 0.11, type: 'highpass', f: 2000, v: 0.32 });
      v.noise({ t, d: 0.05, type: 'bandpass', f: 4200, q: 1.5, v: 0.12 });
      v.tone({ f: 330, t, d: 0.035, type: 'triangle', v: 0.14 });
    } else {
      v.noise({ t, d: 0.12, type: 'highpass', f: 1500, v: 0.24 });
      v.tone({ f: 220, t, d: 0.07, type: 'triangle', v: 0.2 });
    }
  }
  if (d.clap && at(d.clap) === '1') clap(v, t, 0.14);
  if (d.rim && at(d.rim) === '1') {
    v.noise({ t, d: 0.03, type: 'bandpass', f: 1800, q: 3, v: 0.2 });
    v.tone({ f: 830, t, d: 0.035, type: 'triangle', v: 0.1, a: 0.001 });
  }
  const h = at(d.hat);
  if (h === '1' || h === 'o') {
    if (kit === 'brush') {
      v.noise({
        t,
        d: 0.06,
        type: 'bandpass',
        f: 5200,
        q: 1.2,
        v: i % 4 === 2 ? 0.1 : 0.06,
        a: 0.012,
      });
    } else {
      const g = i % 4 ? 0.075 : 0.105;
      v.noise({ t, d: h === 'o' ? 0.16 : 0.04, type: 'highpass', f: 7000, v: g });
    }
  }
  if (d.ride && at(d.ride) === '1') {
    v.noise({
      t,
      d: 0.4,
      type: 'bandpass',
      f: 6500,
      q: 1.4,
      v: i % 4 ? 0.045 : 0.065,
      a: 0.002,
      pan: 0.3,
    });
  }
  if (d.tamb && at(d.tamb) === '1') {
    for (const k of [0, 0.018]) {
      v.noise({ t: t + k, d: 0.06, type: 'bandpass', f: 8500, q: 2, v: 0.06, pan: -0.3 });
    }
  }

  // Drive layer: sixteenth hats, extra kicks, claps, a fill at each section end
  if (driveOn && loop) {
    if (kit === 'brush') {
      drive.noise({
        t,
        d: 0.05,
        type: 'bandpass',
        f: 5600,
        q: 1.2,
        v: i % 2 ? 0.05 : 0.08,
        a: 0.01,
        pan: 0.25,
      });
    } else {
      drive.noise({ t, d: 0.03, type: 'highpass', f: 8000, v: i % 2 ? 0.05 : 0.08, pan: 0.25 });
    }
    if (!bar.thin && kit !== 'brush') {
      if (i === 10 || (i === 14 && run.step % 32 >= 16)) kick(drive, 0.5);
      if (i === 4 || i === 12) clap(drive, t, 0.1);
    }
    if (bar.fill && bar.sec % 2 === 0 && i >= 12) {
      drive.tone({ f: [220, 180, 150, 120][i - 12], to: 70, t, d: 0.16, v: 0.3, a: 0.003 });
    } else if (bar.fill && i >= 8) {
      const g = 0.06 + (i - 8) * 0.025;
      drive.noise({ t, d: 0.07, type: 'bandpass', f: 1800 + (i - 8) * 150, q: 0.8, v: g });
    }
  }
}

/** Sidechain feel: the pads dip on the kick and swell back. @param {Run} run @param {number} t @param {number} depth */
function duck(run, t, depth) {
  const g = run.pad.gain;
  g.setTargetAtTime(1 - depth, t, 0.004);
  g.setTargetAtTime(1, t + 0.05, 0.08);
}

/** @type {WeakMap<Voice, Map<number, Voice>>} */
const scaled = new WeakMap();
/** The same voice with every level scaled by `g` (cached per voice). @param {Voice} v @param {number} g @returns {Voice} */
function louder(v, g) {
  let map = scaled.get(v);
  if (!map) scaled.set(v, (map = new Map()));
  let out = map.get(g);
  if (!out) {
    out = {
      now: v.now,
      tone: (o) => v.tone({ ...o, v: (o.v ?? 0.3) * g }),
      noise: (o) => v.noise({ ...o, v: (o.v ?? 0.3) * g }),
    };
    map.set(g, out);
  }
  return out;
}

/** @param {Voice} v @param {number} t @param {number} g */
function clap(v, t, g) {
  for (const k of [0, 0.012, 0.024]) {
    v.noise({ t: t + k, d: k === 0.024 ? 0.12 : 0.02, type: 'bandpass', f: 1300, q: 1.2, v: g });
  }
}

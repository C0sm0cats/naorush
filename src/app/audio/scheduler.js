// Music scheduler: a look-ahead clock and the per-sixteenth synthesis of a song.

import { mtof } from './util.js';

/** @typedef {import('./types.js').Voice} Voice */
/** @typedef {import('./types.js').Run} Run */

const LOOKAHEAD = 0.14;
const TICK_MS = 25;

/**
 * Starts the look-ahead clock of a run: every tick schedules the steps due before
 * ctx.currentTime + LOOKAHEAD. A `once` track stops its clock at the end.
 * @param {AudioContext} ctx @param {Run} run @param {number} total loop length in sixteenths
 * @param {() => boolean} silent muted or music at zero: keep time, schedule nothing
 * @param {() => [number, number]} targets drive and lead layer gain targets
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
 * Schedules one sixteenth-note step of a track at run.next.
 * @param {Run} run
 * @param {number} total loop length in sixteenths
 * @param {[number, number]} targets drive and lead layer gain targets
 */
export function step(run, total, [driveT, leadT]) {
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
      clap(v, t, 0.18);
    } else {
      v.noise({ t, d: 0.12, type: 'highpass', f: 1500, v: 0.3 });
      v.tone({ f: 220, t, d: 0.07, type: 'triangle', v: 0.2 });
    }
  }
  if (at(bar.clap) === '1') clap(v, t, 0.14);
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
      if (i === 4 || i === 12) clap(drive, t, 0.1);
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
function clap(v, t, g) {
  for (const k of [0, 0.012, 0.024]) {
    v.noise({ t: t + k, d: k === 0.024 ? 0.12 : 0.02, type: 'bandpass', f: 1300, q: 1.2, v: g });
  }
}

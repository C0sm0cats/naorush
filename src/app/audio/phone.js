// Switchboard hold music: the stage's own music through a telephone line (300–3400 Hz,
// mono, a little nasal and saturated), heard while the game is paused, and leaking from
// the headset of the colleague who is on a call.

import { clamp01, dbToGain } from './util.js';

// Telephone band (ITU narrowband), each edge a fourth-order Butterworth-ish slope.
export const PHONE_LOW = 300;
export const PHONE_HIGH = 3400;
// Makeup gain: the band throws away the bass, the line still sits a little under the music.
const MAKEUP_DB = 0;
// Line hiss under the hold music, far below it.
const HISS = dbToGain(-46);
// Hold cross-fade (setTargetAtTime constants): into the line quickly, back gently.
export const HOLD_IN_TC = 0.07;
export const HOLD_OUT_TC = 0.12;
// Headset leak: heard within LEAK_RANGE tiles, at most at the line's level (LEAK_DB) and
// thinned further (measured about 7 dB under the room music), while the room music dips
// by up to NEAR_DIP_DB so the little speaker stands out.
export const LEAK_RANGE = 7;
const LEAK_DB = 0;
const NEAR_DIP_DB = -3;
// A small speaker a couple of metres away: a few milliseconds late, tinnier still.
const LEAK_DELAY = 0.014;
export const LEAK_TC = 0.12;

/**
 * How close the hero is to a headset, 0 (out of range) .. 1 (right next to it).
 * @param {number} dist distance in tiles (Infinity or NaN: no headset)
 */
export function nearness(dist) {
  if (!Number.isFinite(dist)) return 0;
  const k = clamp01(1 - (Math.max(0, dist) - 1) / (LEAK_RANGE - 1));
  return k * k;
}

/**
 * Gain targets of the routing: dry music, the line (hold), the headset leak.
 * @param {boolean} held paused: the music goes down the line
 * @param {number} near 0..1 nearness to a headset
 */
export function phoneTargets(held, near) {
  if (held) return { dry: 0, line: 1, leak: 0 };
  return {
    dry: 1 - (1 - dbToGain(NEAR_DIP_DB)) * near,
    line: 0,
    leak: dbToGain(LEAK_DB) * near,
  };
}

/** Saturation of a cheap earpiece: transparent at low level, rounding the peaks. */
function earpieceCurve(n = 1024) {
  const curve = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    // Unit slope at low level (no gain of its own), peaks rounded off above it.
    curve[i] = Math.tanh(1.6 * x) / 1.6;
  }
  return curve;
}

/**
 * Builds the line: `input` takes the music (post duck), `line` and `leak` feed the music
 * bus. Gains start at zero (no hold, no headset nearby).
 * @param {BaseAudioContext} ctx @param {AudioNode} out music bus
 */
export function buildPhone(ctx, out) {
  const input = ctx.createGain();
  // A phone line is mono.
  input.channelCount = 1;
  input.channelCountMode = 'explicit';
  input.channelInterpretation = 'speakers';
  /** @type {AudioNode[]} */
  const chain = [];
  // Lowpass and highpass Q are in dB in WebAudio: the two Butterworth stages of a
  // fourth-order slope (Q 0.54 and 1.31) are -5.3 dB and +2.3 dB.
  /** @param {BiquadFilterType} type @param {number} f @param {number} q @param {number} [g] */
  const biquad = (type, f, q, g = 0) => {
    const b = ctx.createBiquadFilter();
    b.type = type;
    b.frequency.value = f;
    b.Q.value = q;
    b.gain.value = g;
    chain.push(b);
    return b;
  };
  biquad('highpass', PHONE_LOW, -5.3);
  biquad('highpass', PHONE_LOW, 2.3);
  // The earpiece's nasal bump.
  biquad('peaking', 1700, 0.9, 5);
  biquad('lowpass', PHONE_HIGH, -5.3);
  biquad('lowpass', PHONE_HIGH, 2.3);
  /** @type {AudioNode} */
  let node = input;
  for (const b of chain) node = node.connect(b);
  if (ctx.createWaveShaper) {
    const pre = ctx.createGain();
    pre.gain.value = 0.9;
    const shaper = ctx.createWaveShaper();
    shaper.curve = earpieceCurve();
    node = node.connect(pre).connect(shaper);
    chain.push(pre, shaper);
  }
  const makeup = ctx.createGain();
  makeup.gain.value = dbToGain(MAKEUP_DB);
  node.connect(makeup);
  const line = ctx.createGain();
  line.gain.value = 0;
  makeup.connect(line).connect(out);
  // The headset: a little later, thinner, placed where the colleague stands.
  const delay = ctx.createDelay(0.1);
  delay.delayTime.value = LEAK_DELAY;
  const thin = ctx.createBiquadFilter();
  thin.type = 'highpass';
  thin.frequency.value = 700;
  thin.Q.value = -3;
  const leak = ctx.createGain();
  leak.gain.value = 0;
  makeup.connect(delay).connect(thin);
  /** @type {StereoPannerNode | null} */
  let pan = null;
  if (ctx.createStereoPanner) {
    pan = ctx.createStereoPanner();
    thin.connect(pan).connect(leak);
  } else thin.connect(leak);
  leak.connect(out);
  const hiss = ctx.createGain();
  hiss.gain.value = HISS;
  const hissBand = ctx.createBiquadFilter();
  hissBand.type = 'bandpass';
  hissBand.frequency.value = 1400;
  hissBand.Q.value = 0.45;
  hissBand.connect(hiss).connect(line);
  return {
    input,
    line,
    leak,
    pan,
    hissIn: hissBand,
    nodes: [
      input,
      ...chain,
      makeup,
      line,
      delay,
      thin,
      leak,
      hiss,
      hissBand,
      ...(pan ? [pan] : []),
    ],
  };
}

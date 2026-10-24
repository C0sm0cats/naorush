// Tone and noise voices: every synthesised note goes through one of these.

/** @typedef {import('./types.js').Voice} Voice */

/**
 * Voice whose sources play into `dest`.
 * @param {AudioContext} ctx @param {AudioBuffer} buf noise source
 * @param {AudioNode} dest @param {number} [pitch] frequency multiplier @returns {Voice}
 */
export function makeVoice(ctx, buf, dest, pitch = 1) {
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
    tone: ({ f, t, d, type = 'sine', v = 0.3, to, a = 0.005, lp, lpTo, ft, q, det, pan, vib }) => {
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

// The audio engine: context, mixer (master, buses, compressor, limiter), music runs and SFX.

import { AMB_FADE, AMBIENCES, buildBed } from './ambience.js';
import { HOLD_IN_TC, HOLD_OUT_TC, LEAK_TC, buildPhone, nearness, phoneTargets } from './phone.js';
import { MUTE_KEY, VOL_KEYS, load, loadVolume, save } from './prefs.js';
import { catchUp, harmonyAt, liftAt, playUntil, startClock } from './scheduler.js';
import { SFX, VARIED } from './sfx.js';
import { stageBed, stageFloor, stageTrack } from './stages.js';
import { STINGS } from './stingers.js';
import { SONGS, barsFor } from './tracks/index.js';
import { SFX_TRIM_DB, TRACK_TRIM_DB } from './trim.js';
import { clamp01, dbToGain } from './util.js';
import { makeVoice } from './voice.js';

/** @typedef {import('./types.js').Voice} Voice */
/** @typedef {import('./types.js').Run} Run */
/** @typedef {import('./types.js').TrackName} TrackName */
/** @typedef {import('./types.js').Floor} Floor */
/** @typedef {import('./types.js').Hero} Hero */
/** @typedef {import('./types.js').SfxOpts} SfxOpts */
/** @typedef {import('./ambience.js').Bed} Bed */
/** @typedef {import('./prefs.js').Bus} Bus */
/** @typedef {import('./stages.js').StageRef} StageRef */

// Bus gain at volume 1. The default volumes land on a 1.05 / 0.7 mix: measured on offline
// renders, the music sits about -18 dBFS RMS in game (it was -29), the effects on top.
const BUS_GAIN = { music: 1.05 / 0.7, sfx: 0.7 / 0.8 };
const MASTER = 0.8;
const FADE = 0.6;
// Beat-synced hand-over: the old track plays to the next beat, then cross-fades this fast.
const XFADE = 0.3;
const CUT_IN = 0.04;
// Output ceiling: nothing leaves the mixer above -1 dBFS.
const CEILING = dbToGain(-1);
// Music ducked under the hits that matter: depth (dB) and hold (s) before it swells back.
/** @type {Record<string, [number, number]>} */
const DUCK = {
  hurt: [-6, 0.3],
  zap: [-6, 0.3],
  death: [-9, 0.8],
  bossHit: [-5, 0.35],
  key: [-5, 0.7],
  hardland: [-3, 0.2],
};
const DUCK_RELEASE = 0.22;
// Effects that also play a stinger in the music, in its key and on its grid.
const STUNG = new Set(['key', 'door', 'checkpoint']);
// Tracks that open on an entrance stinger, and lift a tone at each of the boss's phases.
const BOSS_TRACKS = new Set(['bossJulien', 'bossRodolphe']);
const MAX_LIFT = 4;
// Layer ramps (setTargetAtTime constants): layers come in on the next beat, quickly,
// and leave gently.
const LAYER_IN_TC = 0.06;
const LAYER_OUT_TC = 0.5;
// Music reverb: one shared hall (a synthesised impulse response), fed per track. Mono in,
// mono out: half the cost of a stereo convolution (the width comes from the panned parts).
const VERB_SECONDS = 1.6;

/**
 * Soft-clip curve of the output stage: straight up to -7 dBFS, then a tanh shoulder that
 * never reaches the ceiling (the input runs to +6 dBFS: the shaper's input is halved).
 */
export function ceilingCurve(n = 2048) {
  const curve = new Float32Array(n);
  const knee = 0.45;
  const span = CEILING - knee;
  for (let i = 0; i < n; i++) {
    const x = ((i / (n - 1)) * 2 - 1) * 2;
    const a = Math.abs(x);
    const y = a <= knee ? a : knee + span * Math.tanh((a - knee) / span);
    curve[i] = Math.sign(x) * y;
  }
  return curve;
}

/**
 * Impulse response of a warm hall: a few early reflections, then a dense tail that darkens
 * as it decays (no sound file: noise shaped in code).
 * @param {BaseAudioContext} ctx
 */
function hallImpulse(ctx) {
  const rate = ctx.sampleRate;
  const n = Math.floor(rate * VERB_SECONDS);
  const ir = ctx.createBuffer(1, n, rate);
  const data = ir.getChannelData(0);
  const pre = Math.floor(rate * 0.012);
  let lp = 0;
  for (let i = pre; i < n; i++) {
    const x = (i - pre) / (n - pre);
    // One-pole lowpass whose cutoff falls with time: air absorbs the highs first.
    lp += (0.75 - 0.6 * x) * (Math.random() * 2 - 1 - lp);
    data[i] = lp * Math.exp(-6.2 * x) * (1 - x);
  }
  for (const [ms, g] of [
    [17, 0.5],
    [29, -0.35],
    [41, 0.28],
    [58, -0.2],
  ]) {
    data[Math.floor((rate * ms) / 1000)] += g;
  }
  return ir;
}

export class Audio {
  constructor() {
    /** @type {AudioContext | null} */
    this.ctx = null;
    /** @type {AudioBuffer | null} */
    this.buf = null;
    /** @type {GainNode | null} */
    this.master = null;
    /** @type {GainNode | null} */
    this.sfxBus = null;
    /** @type {GainNode | null} */
    this.musicBus = null;
    /** @type {Run | null} */
    this.run = null;
    /** @type {TrackName | null} */
    this.wanted = null;
    /** @type {GainNode | null} */
    this.ambBus = null;
    /** Shared music reverb input. @type {AudioNode | null} */
    this.verbIn = null;
    /** @type {ReturnType<typeof buildBed> | null} */
    this.bed = null;
    /** @type {Bed | null} */
    this.ambWanted = null;
    this._muted = load(MUTE_KEY) === '1';
    this._vol = { music: loadVolume('music'), sfx: loadVolume('sfx') };
    this._intensity = 0;
    /** Who walks (footsteps, landings and jumps follow the hero's weight). @type {Hero} */
    this.hero = 'kevin';
    /** What the current stage's floor is made of. @type {Floor} */
    this.floor = 'carpet';
    this._foot = 0;
    /** Last take of each varied effect, so the same one never plays twice in a row. @type {Map<string, number>} */
    this._takes = new Map();
    /** A boss just signed: the next stage-clear plays the victory variation. */
    this._signed = false;
    /** @type {GainNode | null} music ducking (under hurt, boss hits, keys) */
    this.duckNode = null;
    /** The music straight to the bus (the line takes over while on hold). @type {GainNode | null} */
    this.dryNode = null;
    /** Switchboard line: hold music in pause, headset leak near a colleague. @type {ReturnType<typeof buildPhone> | null} */
    this.phone = null;
    /** Paused: the music plays down the phone line. */
    this._held = false;
    /** Nearness (0..1) to a colleague's headset, and where it is (pan). */
    this._near = 0;
    this._nearPan = 0;
    /** Line hiss while on hold. @type {AudioBufferSourceNode | null} */
    this._hiss = null;
  }

  get muted() {
    return this._muted;
  }

  /** Lazily creates the AudioContext; call from a user gesture. */
  unlock() {
    if (!this.ctx) {
      const w = /** @type {any} */ (globalThis);
      const Ctor = w.AudioContext ?? w.webkitAudioContext;
      if (!Ctor) return;
      try {
        this.#build(new Ctor());
      } catch {
        this.ctx = null;
        return;
      }
    }
    const ctx = this.ctx;
    if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {});
    if (this.wanted && !this.run) this.music(this.wanted);
    if (this.ambWanted && !this.bed) this.ambience(this.ambWanted);
  }

  /** @param {AudioContext} ctx */
  #build(ctx) {
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16;
    comp.knee.value = 24;
    comp.ratio.value = 4;
    comp.attack.value = 0.003;
    comp.release.value = 0.2;
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -3;
    limiter.knee.value = 0;
    limiter.ratio.value = 20;
    limiter.attack.value = 0.001;
    limiter.release.value = 0.1;
    const master = ctx.createGain();
    master.gain.value = this._muted ? 0 : MASTER;
    // Safety ceiling after the limiter (it lets the odd transient through): a soft clip
    // that holds every sample under -1 dBFS.
    /** @type {AudioNode} */
    let out = ctx.destination;
    if (ctx.createWaveShaper) {
      const pre = ctx.createGain();
      pre.gain.value = 0.5;
      const shaper = ctx.createWaveShaper();
      shaper.curve = ceilingCurve();
      pre.connect(shaper).connect(ctx.destination);
      out = pre;
    }
    master.connect(comp).connect(limiter).connect(out);
    const sfx = ctx.createGain();
    sfx.gain.value = BUS_GAIN.sfx * this._vol.sfx;
    sfx.connect(master);
    const music = ctx.createGain();
    music.gain.value = BUS_GAIN.music * this._vol.music;
    music.connect(master);
    const duck = ctx.createGain();
    const dry = ctx.createGain();
    duck.connect(dry).connect(music);
    const phone = buildPhone(ctx, music);
    duck.connect(phone.input);
    const amb = ctx.createGain();
    amb.connect(sfx);
    // Music reverb, shared by every track (each run feeds it through its own send).
    /** @type {AudioNode | null} */
    let verbIn = null;
    if (ctx.createConvolver) {
      const verb = ctx.createConvolver();
      verb.channelCount = 1;
      verb.channelCountMode = 'explicit';
      verb.buffer = hallImpulse(ctx);
      verb.connect(duck);
      verbIn = verb;
    }
    const buf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    Object.assign(this, {
      ctx,
      buf,
      master,
      sfxBus: sfx,
      musicBus: music,
      duckNode: duck,
      dryNode: dry,
      phone,
      ambBus: amb,
      verbIn,
    });
  }

  /** @param {boolean} m */
  setMuted(m) {
    this._muted = m;
    save(MUTE_KEY, m ? '1' : '0');
    if (this.ctx && this.master) {
      this.master.gain.setTargetAtTime(m ? 0 : MASTER, this.ctx.currentTime, 0.03);
    }
  }

  /** @param {Bus} bus @param {number} v 0..1 */
  setVolume(bus, v) {
    if (bus !== 'music' && bus !== 'sfx') return;
    const vol = clamp01(v);
    this._vol[bus] = vol;
    save(VOL_KEYS[bus], String(vol));
    const node = bus === 'music' ? this.musicBus : this.sfxBus;
    if (this.ctx && node)
      node.gain.setTargetAtTime(BUS_GAIN[bus] * vol, this.ctx.currentTime, 0.03);
  }

  /** @param {Bus} bus */
  getVolume(bus) {
    return bus === 'music' || bus === 'sfx' ? this._vol[bus] : 0;
  }

  /**
   * Switchboard hold: the music goes down a phone line (300–3400 Hz, mono, a faint hiss)
   * and comes back smoothly. The pause and resume effects call it; any music request
   * releases it.
   * @param {boolean} on
   */
  hold(on) {
    const held = Boolean(on);
    if (held === this._held) return;
    this._held = held;
    const ctx = this.ctx;
    if (!ctx || !this.phone || !this.buf) return;
    const now = ctx.currentTime;
    if (held && !this._hiss) {
      const src = ctx.createBufferSource();
      src.buffer = this.buf;
      src.loop = true;
      src.connect(this.phone.hissIn);
      src.start(now);
      this._hiss = src;
    } else if (!held && this._hiss) {
      const src = this._hiss;
      this._hiss = null;
      src.stop(now + HOLD_OUT_TC * 8);
      src.onended = () => src.disconnect();
    }
    this.#route(held ? HOLD_IN_TC : HOLD_OUT_TC);
  }

  /** On hold (paused). */
  get held() {
    return this._held;
  }

  /**
   * The colleague on a call: the same music leaks from their headset, placed where they
   * stand and louder as the hero comes close. Call it every frame in play with the
   * nearest one (Infinity when there is none).
   * @param {number} dist distance from the hero, in tiles
   * @param {number} [pan] where the headset is, -1..1 (see `screenPan`)
   */
  headset(dist, pan = 0) {
    const near = nearness(dist);
    const p = Number.isFinite(pan) ? Math.max(-1, Math.min(1, pan)) : 0;
    // Per-frame calls: only move the mix when it audibly changes.
    if (Math.abs(near - this._near) < 0.01 && Math.abs(p - this._nearPan) < 0.02) return;
    if (near === 0 && this._near === 0) return;
    this._near = near;
    this._nearPan = p;
    this.#route(LEAK_TC);
  }

  /** Moves dry music, line and leak to their targets. @param {number} tc */
  #route(tc) {
    const ctx = this.ctx;
    const phone = this.phone;
    if (!ctx || !phone || !this.dryNode) return;
    const now = ctx.currentTime;
    const t = phoneTargets(this._held, this._near);
    for (const [param, v] of /** @type {[AudioParam, number][]} */ ([
      [this.dryNode.gain, t.dry],
      [phone.line.gain, t.line],
      [phone.leak.gain, t.leak],
    ])) {
      param.cancelScheduledValues(now);
      param.setValueAtTime(param.value, now);
      param.setTargetAtTime(v, now, tc);
    }
    if (phone.pan) phone.pan.pan.setTargetAtTime(this._nearPan, now, tc);
  }

  /**
   * Dynamic layers on the current track: 0 = base, > 0.5 adds drums + bass octave,
   * 0.9 adds the lead layer (descant or arpeggio), 1 the finale layer of a boss's last
   * phase. Ramps smoothly, never restarts the track.
   * @param {number} level 0..1
   */
  intensity(level) {
    this._intensity = clamp01(level);
    if (this.ctx && this.run) this.#applyLayers(this.run, this.ctx.currentTime);
  }

  /** @param {Run} run @param {number} now */
  #applyLayers(run, now) {
    const [drive, lead, finale] = this.#layerTargets();
    // Next beat at or after the next unscheduled step, so a new layer enters on the beat.
    const s16 = 60 / run.def.bpm / 4;
    const beat = Math.max(now, run.next + ((4 - (run.step % 4)) % 4) * s16);
    for (const [node, target] of /** @type {[GainNode, number][]} */ ([
      [run.drive, drive],
      [run.lead, lead],
      [run.finale, finale],
    ])) {
      const g = node.gain;
      g.cancelScheduledValues(now);
      g.setValueAtTime(g.value, now);
      if (target > g.value) g.setTargetAtTime(target, beat, LAYER_IN_TC);
      else g.setTargetAtTime(target, now, LAYER_OUT_TC);
    }
  }

  /** Drive, lead and finale layer gains for the current intensity. */
  #layerTargets() {
    const x = this._intensity;
    // Rounded, so the levels main.js uses (0.9, 1) land exactly on full layers.
    const ramp = (/** @type {number} */ a, /** @type {number} */ b) =>
      clamp01(Math.round(((x - a) / (b - a)) * 1e6) / 1e6);
    return [ramp(0.45, 0.6), ramp(0.8, 0.9), ramp(0.95, 1)];
  }

  /**
   * Plays an effect. `opts.pan` places it in the stereo field (see `screenPan`). Some
   * effects also move the music: a stinger in key (key, door, checkpoint), a duck under
   * the hits that matter, a key lift at a boss's phase, the victory variation after a
   * signature.
   * @param {string} type @param {SfxOpts} [opts]
   */
  sfx(type, opts = {}) {
    const play = Object.hasOwn(SFX, type) ? SFX[type] : undefined;
    if (!play || !this.ctx || !this.sfxBus) return;
    const delay = Math.min(5, Math.max(0, opts.delay || 0));
    const at = this.ctx.currentTime + delay;
    this.#cue(type, at);
    if (this._muted || this._vol.sfx === 0) return;
    if (DUCK[type]) this.#duck(...DUCK[type], at);
    // Per-sound loudness trim, so every effect lands at a comparable level.
    const trim = this.ctx.createGain();
    trim.gain.value = dbToGain(SFX_TRIM_DB[type] ?? 0);
    /** @type {AudioNode[]} */
    const graph = [trim];
    const pan = Number.isFinite(opts.pan) ? Math.max(-1, Math.min(1, Number(opts.pan))) : 0;
    if (pan && this.ctx.createStereoPanner) {
      const panner = this.ctx.createStereoPanner();
      panner.pan.value = pan;
      trim.connect(panner).connect(this.sfxBus);
      graph.push(panner);
    } else trim.connect(this.sfxBus);
    const pitch = opts.pitch && opts.pitch > 0 ? opts.pitch : 1;
    const voice = this.#voice(trim, pitch * (1 + (Math.random() - 0.5) * 0.08));
    // Running footsteps alternate feet (a slight pitch shift between left and right).
    if (type === 'step') this._foot ^= 1;
    // Release the whole effect graph once its last source has finished.
    /** @type {AudioScheduledSourceNode | null} */
    let last = null;
    let end = -1;
    /** @param {AudioScheduledSourceNode} src @param {number} t @param {number} d */
    const track = (src, t, d) => {
      if (t + d >= end) [last, end] = [src, t + d];
      return src;
    };
    play(
      {
        now: voice.now + delay,
        tone: (o) => track(voice.tone(o), o.t, o.d),
        noise: (o) => track(voice.noise(o), o.t, o.d),
      },
      {
        hero: this.hero,
        floor: opts.floor ?? this.floor,
        who: opts.who ?? '',
        foot: this._foot,
        variant: VARIED.has(type) ? this.#take(type) : 0,
      },
    );
    const release = () => graph.forEach((n) => n.disconnect());
    const lastSrc = /** @type {AudioScheduledSourceNode | null} */ (last);
    if (lastSrc) lastSrc.onended = release;
    else release();
  }

  /** Next take (0..3) of a varied effect, never the previous one. @param {string} type */
  #take(type) {
    const prev = this._takes.get(type) ?? -1;
    let k = Math.floor(Math.random() * (prev < 0 ? 4 : 3));
    if (prev >= 0 && k >= prev) k++;
    this._takes.set(type, k);
    return k;
  }

  /** What an effect does to the music. @param {string} type @param {number} at */
  #cue(type, at) {
    if (type === 'sign') this._signed = true;
    // The pause and resume chimes put the music on hold and take it off.
    if (type === 'pause') this.hold(true);
    else if (type === 'resume') this.hold(false);
    const run = this.run;
    if (!run || !this.ctx) return;
    if ((type === 'bossPhase' || type === 'finale') && BOSS_TRACKS.has(run.name)) this.#lift(run);
    else if (STUNG.has(type)) this.#sting(run, type, at);
  }

  /**
   * Ducks the music by `db` for `hold` seconds from `at`, then lets it swell back.
   * @param {number} db @param {number} hold @param {number} at
   */
  #duck(db, hold, at) {
    const ctx = this.ctx;
    const node = this.duckNode;
    if (!ctx || !node) return;
    const g = node.gain;
    const now = ctx.currentTime;
    // A deeper or longer duck wins over one in progress.
    const depth = Math.min(dbToGain(db), g.value);
    g.cancelScheduledValues(now);
    g.setValueAtTime(g.value, now);
    g.setTargetAtTime(depth, at, 0.012);
    g.setTargetAtTime(1, at + hold, DUCK_RELEASE);
  }

  /**
   * A stinger on the current track, on its next sixteenth (in key).
   * @param {Run} run @param {string} name @param {number} at
   */
  #sting(run, name, at) {
    const recipe = STINGS[name];
    if (!recipe || this._muted || this._vol.music === 0 || !this.ctx) return;
    const when = Math.max(at, this.ctx.currentTime + 0.02);
    recipe(run.stingVoice, harmonyAt(run, run.total, when));
  }

  /** Lifts a boss track a tone on its next half bar (capped), with a roll into it. @param {Run} run */
  #lift(run) {
    const from = liftAt(run, run.step);
    const to = Math.min(MAX_LIFT, (run.lift?.to ?? 0) + 2);
    if (to === from) return;
    const at = run.step + ((8 - (run.step % 8)) % 8);
    run.lift = { from, to, at };
    if (this._muted || this._vol.music === 0 || !this.ctx) return;
    const now = this.ctx.currentTime;
    const h = harmonyAt(run, run.total, run.next + (at - run.step) * (60 / run.def.bpm / 4) - 1e-4);
    STINGS.lift(run.stingVoice, { ...h, now });
  }

  /**
   * Switches the music. A track already playing hands over on its next beat (the new one
   * cuts in on it); 'win' right after a boss signed plays the victory variation.
   * @param {TrackName | 'boss' | null} track 'boss' is an alias of 'bossJulien'
   */
  music(track) {
    let name = track === 'boss' ? 'bossJulien' : track;
    if (name !== null && !Object.hasOwn(SONGS, name)) return;
    // Any music request leaves the switchboard: a menu, a restart, a boss, a result.
    this.hold(false);
    this.headset(Infinity);
    if (name === 'win' && (this._signed || this.wanted === 'winSigned')) name = 'winSigned';
    if (name !== 'winSigned' && name !== this.wanted) this._signed = false;
    this.wanted = name;
    const ctx = this.ctx;
    if (!ctx || !this.musicBus || !this.duckNode) return;
    if (this.run && this.run.name === name) return;
    const now = ctx.currentTime;
    const old = this.run;
    this.run = null;
    // On the beat: the old track plays up to its next beat, the new one starts there.
    const synced = Boolean(old?.timer && name);
    const start = old && synced ? this.#handOver(old, now) : now + 0.08;
    if (old) this.#stop(old, now, synced ? start : now, synced ? XFADE : FADE);
    if (!name) return;
    const def = SONGS[name];
    const fadeIn = synced ? CUT_IN : FADE;
    const bus = ctx.createGain();
    bus.gain.setValueAtTime(0, now);
    bus.gain.setValueAtTime(0, start);
    bus.gain.linearRampToValueAtTime(1, start + fadeIn);
    const trimGain = dbToGain(TRACK_TRIM_DB[name]);
    const trim = ctx.createGain();
    trim.gain.value = trimGain;
    trim.connect(this.duckNode);
    bus.connect(trim);
    // Stingers skip the duck (a key's fanfare must not dip under its own duck).
    const stingIn = ctx.createGain();
    const sting = ctx.createGain();
    sting.gain.value = trimGain;
    stingIn.connect(sting).connect(this.musicBus);
    const [d0, l0, f0] = this.#layerTargets();
    /** @param {number} g @param {AudioNode} [to] */
    const gain = (g, to = bus) => {
      const n = ctx.createGain();
      n.gain.value = g;
      n.connect(to);
      return n;
    };
    const base = gain(1);
    const drive = gain(d0);
    const lead = gain(l0);
    const finale = gain(f0);
    const wet = gain(1, base);
    const pad = gain(1, base);
    /** @type {AudioNode[]} */
    const nodes = [bus, trim, base, drive, lead, finale, wet, pad, stingIn, sting];
    /** @type {AudioScheduledSourceNode[]} */
    const lfos = [];
    const voice = (/** @type {AudioNode} */ dest) => this.#voice(dest, 1, nodes, lfos);
    const voices = {
      base: voice(base),
      wet: voice(wet),
      pad: voice(pad),
      drive: voice(drive),
      lead: voice(lead),
      finale: voice(finale),
    };
    if (def.echo) {
      const delay = ctx.createDelay(1);
      delay.delayTime.value = (60 / def.bpm) * 0.75;
      const fb = ctx.createGain();
      fb.gain.value = 0.32;
      const tone = ctx.createBiquadFilter();
      tone.frequency.value = 2400;
      const send = ctx.createGain();
      send.gain.value = def.echo;
      wet.connect(send);
      lead.connect(send);
      finale.connect(send);
      send.connect(delay).connect(tone).connect(fb).connect(delay);
      tone.connect(bus);
      nodes.push(delay, fb, tone, send);
    }
    // Reverb send: melody, pads and the upper layers; it fades with the track.
    /** @type {GainNode | null} */
    let verb = null;
    if (def.reverb && this.verbIn) {
      verb = ctx.createGain();
      verb.gain.setValueAtTime(0, now);
      verb.gain.setValueAtTime(0, start);
      verb.gain.linearRampToValueAtTime(def.reverb * trimGain, start + fadeIn);
      // The stingers ring in the same hall.
      for (const n of [wet, pad, lead, finale, stingIn]) n.connect(verb);
      verb.connect(this.verbIn);
      nodes.push(verb);
    }
    // Chorus on the pads: two slowly swaying delays, one each side.
    if (def.chorus && ctx.createStereoPanner) {
      const send = ctx.createGain();
      send.gain.value = def.chorus;
      pad.connect(send);
      nodes.push(send);
      for (const [ms, rate, side] of [
        [17, 0.31, -0.7],
        [23, 0.43, 0.7],
      ]) {
        const delay = ctx.createDelay(0.05);
        delay.delayTime.value = ms / 1000;
        const lfo = ctx.createOscillator();
        lfo.frequency.value = rate;
        const depth = ctx.createGain();
        depth.gain.value = 0.0025;
        lfo.connect(depth).connect(delay.delayTime);
        lfo.start(now);
        const pan = ctx.createStereoPanner();
        pan.pan.value = side;
        send.connect(delay).connect(pan).connect(bus);
        nodes.push(delay, depth, pan, lfo);
        lfos.push(lfo);
      }
    }
    const { bars, loop } = barsFor(name, this.hero);
    const total = bars.length * 16;
    /** @type {Run} */
    const run = {
      name,
      def,
      bars,
      loop,
      bus,
      base,
      drive,
      lead,
      finale,
      wet,
      pad,
      verb,
      sting,
      stingVoice: voice(stingIn),
      total,
      lift: null,
      voices,
      nodes,
      lfos,
      timer: null,
      step: 0,
      next: start,
      prev: 0,
      prevEnd: 0,
    };
    startClock(
      ctx,
      run,
      total,
      () => this._muted || this._vol.music === 0,
      () => this.#layerTargets(),
    );
    this.run = run;
    if (BOSS_TRACKS.has(name)) this.#sting(run, 'entrance', start);
  }

  /**
   * Plays the old track up to its next beat and returns that time (the hand-over).
   * @param {Run} old @param {number} now
   */
  #handOver(old, now) {
    // After a stall (a stage being built), the steps already late are skipped, never
    // played in a burst at the hand-over.
    catchUp(old, now);
    const s16 = 60 / old.def.bpm / 4;
    // First sixteenth at least 30 ms away, then up to the beat it belongs to.
    const first = old.step + Math.ceil((now + 0.03 - old.next) / s16);
    const beat = first + ((4 - (first % 4)) % 4);
    const at = old.next + (beat - old.step) * s16;
    if (!this._muted && this._vol.music > 0) playUntil(old, old.total, at, this.#layerTargets());
    return at;
  }

  /**
   * Music and ambient bed of a stage. Uses the stage's own theme when it has one (café
   * pause, seminar, intercontrat), else the level's `music` / `theme`. Idempotent:
   * calling it again with the same stage (e.g. after a boss) only restores the music.
   * @param {StageRef} level
   * @param {Hero} [hero] who plays it (footsteps); unchanged when omitted
   */
  stage(level, hero) {
    if (hero === 'kevin' || hero === 'charline') this.hero = hero;
    this.music(stageTrack(level));
    this.ambience(stageBed(level));
    this.floor = stageFloor(level);
  }

  /**
   * Quiet synthesised ambient bed under music and SFX (routed through the sfx bus).
   * @param {Bed | null} name
   */
  ambience(name) {
    if (name !== null && !AMBIENCES.includes(name)) return;
    this.ambWanted = name;
    const ctx = this.ctx;
    if (!ctx || !this.ambBus || !this.buf) return;
    if (this.bed && this.bed.name === name) return;
    if (!this.bed && !name) return;
    const now = ctx.currentTime;
    const old = this.bed;
    this.bed = null;
    if (old) {
      old.stop();
      const g = old.out.gain;
      g.cancelScheduledValues(now);
      g.setValueAtTime(g.value, now);
      g.linearRampToValueAtTime(0, now + AMB_FADE);
      setTimeout(() => old.dispose(), (AMB_FADE + 0.3) * 1000);
    }
    if (!name) return;
    const fade = ctx.createGain();
    fade.gain.setValueAtTime(0, now);
    fade.gain.linearRampToValueAtTime(1, now + AMB_FADE);
    fade.connect(this.ambBus);
    const bed = buildBed(ctx, this.buf, fade, name);
    const dispose = bed.dispose;
    bed.dispose = () => {
      dispose();
      fade.disconnect();
    };
    this.bed = bed;
  }

  /**
   * Fades a run out over `fade` seconds from `from`, then releases its graph.
   * @param {Run} run @param {number} now @param {number} from @param {number} fade
   */
  #stop(run, now, from, fade) {
    if (run.timer) clearInterval(run.timer);
    run.timer = null;
    for (const node of [run.bus, run.verb, run.sting]) {
      if (!node) continue;
      const g = node.gain;
      const v = g.value;
      g.cancelScheduledValues(now);
      g.setValueAtTime(v, now);
      if (from > now) g.setValueAtTime(v, from);
      g.linearRampToValueAtTime(0, from + fade);
    }
    setTimeout(
      () => {
        for (const lfo of run.lfos) lfo.stop();
        for (const n of run.nodes) n.disconnect();
      },
      (from - now + fade + 0.3) * 1000,
    );
  }

  /**
   * @param {AudioNode} dest @param {number} [pitch] frequency multiplier
   * @param {AudioNode[]} [keep] shared nodes of a music run
   * @param {AudioScheduledSourceNode[]} [lfos] shared LFOs of a music run @returns {Voice}
   */
  #voice(dest, pitch = 1, keep, lfos) {
    const ctx = /** @type {AudioContext} */ (this.ctx);
    const buf = /** @type {AudioBuffer} */ (this.buf);
    return makeVoice(ctx, buf, dest, pitch, keep, lfos);
  }
}

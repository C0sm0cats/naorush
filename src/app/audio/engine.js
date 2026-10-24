// The audio engine: context, mixer (master, buses, compressor, limiter), music runs and SFX.

import { AMB_FADE, AMBIENCES, buildBed } from './ambience.js';
import { MUTE_KEY, VOL_KEYS, load, loadVolume, save } from './prefs.js';
import { startClock } from './scheduler.js';
import { SFX } from './sfx.js';
import { stageBed, stageTrack } from './stages.js';
import { BARS, SONGS } from './tracks/index.js';
import { SFX_TRIM_DB, TRACK_TRIM_DB } from './trim.js';
import { clamp01, dbToGain } from './util.js';
import { makeVoice } from './voice.js';

/** @typedef {import('./types.js').Voice} Voice */
/** @typedef {import('./types.js').Run} Run */
/** @typedef {import('./types.js').TrackName} TrackName */
/** @typedef {import('./ambience.js').Bed} Bed */
/** @typedef {import('./prefs.js').Bus} Bus */
/** @typedef {import('./stages.js').StageRef} StageRef */

// Bus gain at volume 1 (defaults land on the original 0.22 / 0.5 mix).
const BUS_GAIN = { music: 0.22 / 0.7, sfx: 0.5 / 0.8 };
const MASTER = 0.8;
const FADE = 0.6;
// Layer ramps (setTargetAtTime constants): layers come in on the next beat, quickly,
// and leave gently.
const LAYER_IN_TC = 0.06;
const LAYER_OUT_TC = 0.5;

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
    /** @type {ReturnType<typeof buildBed> | null} */
    this.bed = null;
    /** @type {Bed | null} */
    this.ambWanted = null;
    this._muted = load(MUTE_KEY) === '1';
    this._vol = { music: loadVolume('music'), sfx: loadVolume('sfx') };
    this._intensity = 0;
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
    limiter.threshold.value = -6;
    limiter.knee.value = 0;
    limiter.ratio.value = 20;
    limiter.attack.value = 0.001;
    limiter.release.value = 0.1;
    const master = ctx.createGain();
    master.gain.value = this._muted ? 0 : MASTER;
    master.connect(comp).connect(limiter).connect(ctx.destination);
    const sfx = ctx.createGain();
    sfx.gain.value = BUS_GAIN.sfx * this._vol.sfx;
    sfx.connect(master);
    const music = ctx.createGain();
    music.gain.value = BUS_GAIN.music * this._vol.music;
    music.connect(master);
    const amb = ctx.createGain();
    amb.connect(sfx);
    const buf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    Object.assign(this, { ctx, buf, master, sfxBus: sfx, musicBus: music, ambBus: amb });
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
   * Dynamic layers on the current track: 0 = base, > 0.5 adds drums + bass octave,
   * 1 adds a lead arpeggio. Ramps smoothly, never restarts the track.
   * @param {number} level 0..1
   */
  intensity(level) {
    this._intensity = clamp01(level);
    if (this.ctx && this.run) this.#applyLayers(this.run, this.ctx.currentTime);
  }

  /** @param {Run} run @param {number} now */
  #applyLayers(run, now) {
    const [drive, lead] = this.#layerTargets();
    // Next beat at or after the next unscheduled step, so a new layer enters on the beat.
    const s16 = 60 / run.def.bpm / 4;
    const beat = Math.max(now, run.next + ((4 - (run.step % 4)) % 4) * s16);
    for (const [node, target] of /** @type {[GainNode, number][]} */ ([
      [run.drive, drive],
      [run.lead, lead],
    ])) {
      const g = node.gain;
      g.cancelScheduledValues(now);
      g.setValueAtTime(g.value, now);
      if (target > g.value) g.setTargetAtTime(target, beat, LAYER_IN_TC);
      else g.setTargetAtTime(target, now, LAYER_OUT_TC);
    }
  }

  /** @returns {[number, number]} */
  #layerTargets() {
    const x = this._intensity;
    return [clamp01((x - 0.45) / 0.15), clamp01((x - 0.8) / 0.2)];
  }

  /** @param {string} type */
  sfx(type) {
    const play = Object.hasOwn(SFX, type) ? SFX[type] : undefined;
    if (!play || !this.ctx || !this.sfxBus || this._muted || this._vol.sfx === 0) return;
    // Per-sound loudness trim, so every effect lands at a comparable level.
    const trim = this.ctx.createGain();
    trim.gain.value = dbToGain(SFX_TRIM_DB[type] ?? 0);
    trim.connect(this.sfxBus);
    const voice = this.#voice(trim, 1 + (Math.random() - 0.5) * 0.08);
    // Release the whole effect graph once its last source has finished.
    /** @type {AudioScheduledSourceNode | null} */
    let last = null;
    let end = -1;
    /** @param {AudioScheduledSourceNode} src @param {number} t @param {number} d */
    const track = (src, t, d) => {
      if (t + d >= end) [last, end] = [src, t + d];
      return src;
    };
    play({
      now: voice.now,
      tone: (o) => track(voice.tone(o), o.t, o.d),
      noise: (o) => track(voice.noise(o), o.t, o.d),
    });
    const lastSrc = /** @type {AudioScheduledSourceNode | null} */ (last);
    if (lastSrc) lastSrc.onended = () => trim.disconnect();
    else trim.disconnect();
  }

  /** @param {TrackName | 'boss' | null} track 'boss' is an alias of 'bossJulien' */
  music(track) {
    const name = track === 'boss' ? 'bossJulien' : track;
    if (name !== null && !Object.hasOwn(SONGS, name)) return;
    this.wanted = name;
    const ctx = this.ctx;
    if (!ctx || !this.musicBus) return;
    if (this.run && this.run.name === name) return;
    const now = ctx.currentTime;
    const old = this.run;
    this.run = null;
    if (old) this.#stop(old, now);
    if (!name) return;
    const def = SONGS[name];
    const bus = ctx.createGain();
    bus.gain.setValueAtTime(0, now);
    bus.gain.linearRampToValueAtTime(1, now + FADE);
    const trim = ctx.createGain();
    trim.gain.value = dbToGain(TRACK_TRIM_DB[name]);
    trim.connect(this.musicBus);
    bus.connect(trim);
    const [d0, l0] = this.#layerTargets();
    const layer = (/** @type {number} */ g) => {
      const n = ctx.createGain();
      n.gain.value = g;
      n.connect(bus);
      return n;
    };
    const base = layer(1);
    const drive = layer(d0);
    const lead = layer(l0);
    const wet = ctx.createGain();
    wet.connect(base);
    /** @type {AudioNode[]} */
    const nodes = [bus, trim, base, drive, lead, wet];
    const voices = {
      base: this.#voice(base),
      wet: this.#voice(wet),
      drive: this.#voice(drive),
      lead: this.#voice(lead),
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
      send.connect(delay).connect(tone).connect(fb).connect(delay);
      tone.connect(bus);
      nodes.push(delay, fb, tone, send);
    }
    const bars = BARS[name];
    /** @type {Run} */
    const run = {
      name,
      def,
      bars,
      bus,
      base,
      drive,
      lead,
      wet,
      voices,
      nodes,
      timer: null,
      step: 0,
      next: now,
    };
    run.next = now + 0.08;
    const total = bars.length * 16;
    startClock(
      ctx,
      run,
      total,
      () => this._muted || this._vol.music === 0,
      () => this.#layerTargets(),
    );
    this.run = run;
  }

  /**
   * Music and ambient bed of a stage. Uses the stage's own theme when it has one (café
   * pause, seminar, intercontrat), else the level's `music` / `theme`. Idempotent:
   * calling it again with the same stage (e.g. after a boss) only restores the music.
   * @param {StageRef} level
   */
  stage(level) {
    this.music(stageTrack(level));
    this.ambience(stageBed(level));
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

  /** @param {Run} run @param {number} now */
  #stop(run, now) {
    if (run.timer) clearInterval(run.timer);
    run.timer = null;
    const g = run.bus.gain;
    g.cancelScheduledValues(now);
    g.setValueAtTime(g.value, now);
    g.linearRampToValueAtTime(0, now + FADE);
    setTimeout(
      () => {
        for (const n of run.nodes) n.disconnect();
      },
      (FADE + 0.3) * 1000,
    );
  }

  /** @param {AudioNode} dest @param {number} [pitch] frequency multiplier @returns {Voice} */
  #voice(dest, pitch = 1) {
    const ctx = /** @type {AudioContext} */ (this.ctx);
    const buf = /** @type {AudioBuffer} */ (this.buf);
    return makeVoice(ctx, buf, dest, pitch);
  }
}

import { CAST } from '../data/cast.js';
import {
  DESKS,
  PLAQUES,
  POSTER_H,
  WHITEBOARDS,
  WHITEBOARD_W,
  posterWidth,
} from '../data/inetum.js';
import { renderPlaque, renderWhiteboard } from '../gfx/boards.js';
import { renderPoster } from '../gfx/posters.js';
import { buildProps } from '../gfx/props.js';
import { DrawPool, buildCharacter, poseCharacter, poseOptions } from '../gfx/characters.js';
import { chain, multiply, scaling, translation } from '../gfx/mat4.js';
import { Mesh, Sprite } from '../gfx/renderer.js';
import { buildThings } from '../gfx/things.js';
import { MAT, Volume, meshVolume } from '../gfx/voxels.js';
import { buildOffice, buildSkyline } from '../gfx/world-builder.js';
import { HERO, TILE } from '../game/sim.js';
import { assetUrl, crop, loadImage } from './assets.js';
import { drawThing } from './draw-things.js';
import { blinkAt, bossPose, heroPose, idlePose } from './poses.js';

const IDENTITY = translation(0, 0, 0);
const GALLERY = [
  'kevin',
  'charline',
  'mathis',
  'intern',
  'visio',
  'techServicesDirector',
  'regionalDirector',
];
/** The end party line-up, left to right. */
const CROWD = [
  'regionalDirector',
  'charline',
  'kevin',
  'techServicesDirector',
  'intern',
  'visio',
  'mathis',
];
const SIDES = [-1, 1];
const RACK_GLOW = [0.3, 1.6, 1.2];
// Scratch factors for the per-frame matrices (results go into pooled items).
const F1 = new Float32Array(16);
const F2 = new Float32Array(16);
/** Reused dance pose of the end party. @type {Pose} */
const DANCE = {
  legL: 0,
  legR: 0,
  armL: 0,
  armR: 0,
  armSpread: 0.5,
  bob: 0,
  head: 0,
  mood: 'happy',
  blink: 0,
};

/**
 * Whiteboard artwork: the heroes' boards are images, the bosses' are drawn in code.
 * @param {string} id
 * @returns {Promise<HTMLImageElement | HTMLCanvasElement | null>}
 */
async function boardArt(id) {
  if (id in WHITEBOARDS)
    return loadImage(WHITEBOARDS[/** @type {keyof typeof WHITEBOARDS} */ (id)]);
  return /** @type {HTMLCanvasElement} */ (
    renderWhiteboard(/** @type {'techServicesDirector'|'regionalDirector'} */ (id))
  );
}

/** URL of a whiteboard for the full-screen reader. @param {string} id */
export function boardUrl(id) {
  if (id in WHITEBOARDS) return assetUrl(WHITEBOARDS[/** @type {keyof typeof WHITEBOARDS} */ (id)]);
  BOARD_URLS[id] ??= /** @type {HTMLCanvasElement} */ (
    renderWhiteboard(/** @type {'techServicesDirector'|'regionalDirector'} */ (id))
  ).toDataURL('image/webp', 0.92);
  return BOARD_URLS[id];
}
/** @type {Record<string, string>} */
const BOARD_URLS = {};

/** The city skyline depends only on the level width: built once per width. */
const SKYLINES = new Map();
/** @param {WebGL2RenderingContext} gl @param {number} width @returns {Mesh} */
function skylineMesh(gl, width) {
  if (!SKYLINES.has(width)) SKYLINES.set(width, new Mesh(gl, buildSkyline(width)));
  return SKYLINES.get(width);
}

/** The "SORTIE" sign: white running figure and arrow on emergency green. */
function exitSign() {
  const c = document.createElement('canvas');
  c.width = 384;
  c.height = 144;
  const g = /** @type {CanvasRenderingContext2D} */ (c.getContext('2d'));
  g.fillStyle = '#0f9d58';
  g.beginPath();
  g.roundRect(0, 0, 384, 144, 18);
  g.fill();
  g.strokeStyle = '#e8fff1';
  g.lineWidth = 8;
  g.strokeRect(10, 10, 364, 124);
  g.fillStyle = '#ffffff';
  g.font = '900 64px system-ui, sans-serif';
  g.textBaseline = 'middle';
  g.fillText('SORTIE', 34, 76);
  // Arrow.
  g.beginPath();
  g.moveTo(282, 60);
  g.lineTo(322, 60);
  g.lineTo(322, 42);
  g.lineTo(356, 72);
  g.lineTo(322, 102);
  g.lineTo(322, 84);
  g.lineTo(282, 84);
  g.closePath();
  g.fill();
  return c;
}

/** Meshes shared by every level, built once per GL context. */
const SHARED = new WeakMap();
/** @param {WebGL2RenderingContext} gl */
function sharedMeshes(gl) {
  if (!SHARED.has(gl)) {
    /** @type {Record<string, ReturnType<typeof buildCharacter>>} */
    const cast = {};
    for (const id of Object.keys(CAST)) cast[id] = buildCharacter(gl, CAST[id]);
    const v = new Volume(1, 1, 1, 1, [-0.5, -0.5, -0.5]);
    v.set(0, 0, 0, 0xffffff, MAT.EMISSIVE);
    /**
     * A floor tile in disguise (hidden trapdoor): top at y = 0, spanning the full depth.
     * @param {(x: number, z: number) => number} top @param {number} [body] @param {number} [nose]
     */
    const floor = (top, body = 0xbdb4a6, nose = 0xc6f432) => {
      const f = new Volume(8, 8, 30, 1 / 8, [-0.5, -1, -2.4]);
      f.box(0, 0, 0, 8, 6, 30, body);
      f.box(0, 6, 0, 8, 8, 30, (x, _y, z) => top(x, z));
      f.box(0, 6, 29, 8, 7, 30, nose);
      return new Mesh(gl, meshVolume(f));
    };
    SHARED.set(gl, {
      things: buildThings(gl),
      props: buildProps(gl),
      cast,
      cube: new Mesh(gl, meshVolume(v)),
      hiddenFloor: {
        office: floor(() => 0x3e5170),
        dc: floor((x, z) => (((x >> 2) + (z >> 2)) % 2 ? 0xa3acb7 : 0x8d96a2)),
        roof: floor((x, z) => ((x * 7 + z * 13) % 5 ? 0x7d7a75 : 0x6c6964), 0xb9b2a6, 0xd8d2c6),
        parking: floor(() => 0x3b3f47, 0x7b818c, 0xc6f432),
      },
    });
  }
  return /** @type {{things: ReturnType<typeof buildThings>, props: ReturnType<typeof buildProps>, cast: Record<string, ReturnType<typeof buildCharacter>>, cube: Mesh, hiddenFloor: {office: Mesh, dc: Mesh, roof: Mesh, parking: Mesh}}} */ (
    SHARED.get(gl)
  );
}

/**
 * @typedef {import('../gfx/renderer.js').DrawItem} DrawItem
 * @typedef {import('../game/sim.js').Sim} Sim
 * @typedef {import('../gfx/characters.js').Pose} Pose
 */

/**
 * Everything drawn for one level: static diorama, artwork, animated cast and props.
 */
export class LevelView {
  /**
   * @param {WebGL2RenderingContext} gl
   * @param {Sim} sim A fresh simulation of the level (for its layout).
   * @param {import('../data/levels/index.js').Level} level
   */
  constructor(gl, sim, level) {
    this.gl = gl;
    this.levelId = level.id;
    this.theme = level.theme;
    this.decor = level.decor;
    const office = buildOffice(sim, level.decor, level.map, level.theme);
    this.lights = office.lights;
    this.office = new Mesh(gl, office.mesh);
    this.skyline =
      level.theme === 'datacenter' || level.theme === 'parking' ? null : skylineMesh(gl, sim.w);
    const shared = sharedMeshes(gl);
    this.things = shared.things;
    this.props = shared.props;
    this.cast = shared.cast;
    this.cube = shared.cube;
    this.hiddenFloor = shared.hiddenFloor;
    /** Furniture and props standing in the level. @type {DrawItem[]} */
    this.furniture = [];
    // Parked cars ('Q' runs) and meeting tables ('Y') stand on their tiles.
    const cars = /** @type {const} */ (['carBlue', 'carRed', 'carWhite']);
    let carCount = 0;
    level.map.forEach((row, i) => {
      const y = sim.h - 1 - i;
      for (let c = 0; c < row.length; c++) {
        if (row[c] === 'Y')
          this.furniture.push({
            mesh: this.props.copilTable,
            model: chain(translation(c + 0.5, y + 0.1, -0.5), scaling(1, 1, 1.6)),
          });
        if (row[c] === 'Q' && row[c - 1] !== 'Q') {
          let n = 0;
          while (row[c + n] === 'Q') n++;
          this.furniture.push({
            mesh: this.props[cars[carCount++ % cars.length]],
            model: chain(translation(c + n / 2, y - 0.35, -0.6), scaling(n / 3.6, 1, 1)),
          });
        }
      }
    });
    for (const d of level.decor) {
      if (d.type === 'desk') this.furniture.push(this.prop('chair', d.x + 4.7, d.y, -1.1));
      else if (d.type in this.props) {
        const mesh = /** @type {keyof typeof this.props} */ (d.type);
        this.furniture.push(this.prop(mesh, d.x, d.y, d.z ?? -1.9));
        if (d.type === 'lampPost')
          this.lights.push({ pos: [d.x, d.y + 2.5, -1.4], radius: 5, color: [0.7, 0.5, 0.3] });
      }
    }
    /** @type {Sprite[]} */
    this.sprites = [];
    /** Per-frame draw items are recycled from here (see items()). */
    this.pool = new DrawPool();
    /** The list items() returns, refilled every frame. @type {DrawItem[]} */
    this.frame = [];
    /** @type {DrawItem} */
    this.officeItem = { mesh: this.office, model: IDENTITY };
    /** @type {DrawItem | null} */
    this.skylineItem = this.skyline
      ? { mesh: this.skyline, model: IDENTITY, noShadow: true }
      : null;
    /** Door and arena gate tiles, found once per tile map. @type {{tiles: Sim['tiles'] | null, doors: number[], gates: number[]}} */
    this.gates = { tiles: null, doors: [], gates: [] };
    /** What the stage's key item looks like. */
    this.keyMesh = this.things[level.keyModel ?? 'key'];
    const exit = sim.things.find((t) => t.kind === 'exit');
    /** Where the stage ends, for the exit sign. */
    this.exitAt = exit ? { x: exit.x, y: exit.y } : null;
    this.ready = this.loadArtwork();
    this.doorT = 0;
    this.gallery = false;
    /** Where the gallery line-up starts. */
    this.galleryX = 1.4;
    /** Title screen: the hero poses for the camera. */
    this.showcase = false;
    /** End party: x where the cast dances (0 = no party). */
    this.party = 0;
    this.landAt = -1;
    this.jumpAt = -1;
    this.throwAt = -1;
    /** Seconds the hero has stood still. */
    this.still = 0;
  }

  /**
   * @param {keyof ReturnType<typeof buildProps>} id
   * @param {number} x @param {number} y @param {number} z
   * @returns {DrawItem}
   */
  prop(id, x, y, z) {
    return { mesh: this.props[id], model: translation(x, y, z) };
  }

  /**
   * Remembers landings and take-offs for squash and stretch.
   * @param {import('../game/sim.js').SimEvent} e @param {number} time Simulation time.
   */
  event(e, time) {
    if (e.type === 'land' || e.type === 'step' || e.type === 'hardland') this.landAt = time;
    if (e.type === 'jump' || e.type === 'airjump') this.jumpAt = time;
    if (e.type === 'throw') this.throwAt = time;
  }

  /**
   * A small glowing cube (warning lights, drips).
   * @param {number} x @param {number} y @param {number} z @param {number} size @param {number[]} color
   * @returns {DrawItem}
   */
  glow(x, y, z, size, color) {
    const it = this.pool.take(this.cube, undefined, color, true);
    multiply(translation(x, y, z, F1), scaling(size, size, size, F2), it.model);
    return it;
  }

  /** Frees the level's own GPU resources (shared meshes stay). */
  dispose() {
    this.office.dispose(this.gl);
    for (const s of this.sprites) s.dispose(this.gl);
    this.sprites = [];
  }

  async loadArtwork() {
    const gl = this.gl;
    // A green emergency-exit sign above the way out.
    const exit = this.exitAt;
    if (exit)
      this.sprites.push(
        new Sprite(gl, exitSign(), [exit.x - 0.75, exit.y + 2.55, -0.85, 1.5, 0.56]),
      );
    const jobs = this.decor.map(async (d) => {
      if (d.type === 'poster' && d.id) {
        const art = /** @type {HTMLCanvasElement} */ (renderPoster(d.id));
        const z = d.front ? 1.43 : -2.6;
        this.sprites.push(new Sprite(gl, art, [d.x, d.y + 0.9, z, posterWidth(d.id), POSTER_H]));
      } else if (d.type === 'whiteboard' && d.id) {
        const img = await boardArt(d.id);
        if (img)
          this.sprites.push(
            new Sprite(gl, img, [d.x, d.y + 0.75, -2.6, WHITEBOARD_W, WHITEBOARD_W * 0.75]),
          );
      } else if (d.type === 'desk' && d.id) {
        const id = /** @type {keyof typeof DESKS} */ (d.id);
        const img = await loadImage(DESKS[id].file);
        if (img) {
          const art = crop(img, DESKS[id].crop);
          const w = 4.2;
          this.sprites.push(
            new Sprite(gl, art, [d.x, d.y, -1.75, w, (w * art.height) / art.width]),
          );
        }
        const src = PLAQUES[id];
        const plaque =
          typeof src === 'string'
            ? await loadImage(src)
            : /** @type {HTMLCanvasElement} */ (renderPlaque(src));
        if (plaque)
          this.sprites.push(
            new Sprite(gl, plaque, [
              d.x + 1.1,
              d.y + 3.4,
              -2.6,
              2,
              (2 * plaque.height) / plaque.width,
            ]),
          );
      }
    });
    await Promise.all(jobs);
  }

  /** The whiteboard the hero stands in front of, if any. @param {Sim} sim */
  boardAt(sim) {
    const hx = sim.hero.x + HERO.w / 2;
    return this.decor.find(
      (d) =>
        d.type === 'whiteboard' &&
        hx > d.x - 0.2 &&
        hx < d.x + WHITEBOARD_W + 0.2 &&
        Math.abs(sim.hero.y - d.y) < 0.6,
    );
  }

  /** The poster the hero walks past (for its hint). @param {Sim} sim */
  posterAt(sim) {
    const hx = sim.hero.x + HERO.w / 2;
    return this.decor.find((d) => {
      if (d.type !== 'poster' || !d.id) return false;
      const w = posterWidth(d.id);
      return hx > d.x && hx < d.x + w && sim.hero.y < d.y + 3 && sim.hero.y > d.y - 2.5;
    });
  }

  /**
   * @param {Sim} sim
   * @param {number} t Seconds, for idle animation.
   * @param {import('./fx.js').Particle[]} particles
   * @returns {DrawItem[]}
   */
  items(sim, t, particles) {
    // Items come from the pool and are only valid until the next call: the renderer
    // consumes them right away.
    const pool = this.pool;
    pool.reset();
    const items = this.frame;
    items.length = 0;
    items.push(this.officeItem);
    for (const f of this.furniture) items.push(f);
    if (this.skylineItem) items.push(this.skylineItem);
    if (this.party) {
      // The end: everybody celebrates the signed envelope at the Espace VIP.
      for (let i = 0; i < CROWD.length; i++) {
        const id = CROWD[i];
        const ph = t * 6 + i * 1.3;
        const d = DANCE;
        d.legL = Math.max(0, Math.sin(ph)) * 0.7;
        d.legR = Math.max(0, -Math.sin(ph)) * 0.7;
        d.armL = 2.6 + Math.sin(ph) * 0.4;
        d.armR = 2.6 - Math.sin(ph) * 0.4;
        d.bob = Math.abs(Math.sin(ph)) * 2;
        d.head = Math.sin(ph * 0.5) * 0.2;
        d.blink = blinkAt(t + i);
        const o = poseOptions(CAST[id].scale, 0.3, 0.4);
        poseCharacter(
          this.cast[id],
          this.party + (i - 3) * 1.15,
          3,
          (i % 2) * -0.6,
          1,
          d,
          o,
          items,
          pool,
        );
      }
      return items;
    }
    if (this.gallery) {
      for (let i = 0; i < GALLERY.length; i++) {
        const id = GALLERY[i];
        const x = this.galleryX + i * (this.galleryX > 2 ? 0.8 : 0.9);
        const o = poseOptions(CAST[id].scale, 0.35, 0.4);
        poseCharacter(this.cast[id], x, 3, 0.4, 1, idlePose(t + i), o, items, pool);
      }
      return items;
    }
    this.drawHero(items, sim, t);
    // Off-screen things are skipped (the view is about 15 tiles wide).
    const near = sim.bossActive ? 30 : 16;
    for (const th of sim.things) {
      if (!th.alive || (Math.abs(th.x - sim.hero.x) > near && th.kind !== 'zone')) continue;
      drawThing(this, items, sim, th, t);
    }
    for (const p of particles) {
      const k = p.size * Math.min(1, (p.life / p.max) * 2);
      const it = pool.take(this.cube, undefined, p.color, true);
      multiply(translation(p.x, p.y, p.z, F1), scaling(k, k, k, F2), it.model);
      items.push(it);
    }
    const g = this.gateTiles(sim);
    // Doors slide up into the ceiling once the badge reader has been used.
    const lift = sim.doorOpen ? Math.min(2.2, this.doorT * 3) : 0;
    for (let i = 0; i < g.doors.length; i += 2) {
      const it = pool.take(this.things.door);
      translation(g.doors[i] + 0.5, g.doors[i + 1] + lift, -0.6, it.model);
      items.push(it);
    }
    // The arena gate drops shut while the boss fight is on.
    if (sim.bossActive && !sim.bossDone)
      for (let i = 0; i < g.gates.length; i += 2) {
        const it = pool.take(this.props.gate);
        translation(g.gates[i] + 0.5, g.gates[i + 1], -0.2, it.model);
        items.push(it);
      }
    return items;
  }

  /**
   * Door tops and gate tiles as (column, row) pairs, in column order. The sim never
   * adds or removes these tiles, so the scan runs once per tile map.
   * @param {Sim} sim
   */
  gateTiles(sim) {
    const g = this.gates;
    if (g.tiles === sim.tiles) return g;
    g.tiles = sim.tiles;
    g.doors = [];
    g.gates = [];
    for (let c = 0; c < sim.w; c++)
      for (let r = 0; r < sim.h; r++) {
        const tile = sim.tiles[c + r * sim.w];
        if (tile === TILE.DOOR && (r === 0 || sim.tiles[c + (r - 1) * sim.w] !== TILE.DOOR))
          g.doors.push(c, r);
        if (tile === TILE.GATE) g.gates.push(c, r);
      }
    return g;
  }

  /**
   * The level boss. Every attack has its own pose, held during the wind-up so it
   * reads as a warning: arm cocked for a volley, arms raised to lower the racks,
   * crouch before a leap, lean before the dash.
   * @param {DrawItem[]} items @param {Sim} sim @param {import('../game/sim.js').Thing} b @param {number} t
   */
  drawBoss(items, sim, b, t) {
    const id = sim.boss?.id ?? 'techServicesDirector';
    const { pose, y, turn, tint, facing } = bossPose(b, sim.hero.x + HERO.w / 2, t);
    // Entrances: Julien's racks light up one by one, Rodolphe's curtain opens.
    if (b.state === 'intro' || b.state === 'phase') {
      const k = Math.min(1, b.t / 1.6);
      if (id === 'techServicesDirector')
        for (let i = 0; i < 8; i++) {
          if (i / 8 > k) break;
          const side = i % 2 ? 1 : -1;
          const dx = side * (1.2 + Math.floor(i / 2) * 0.9);
          items.push(this.glow(b.x + dx, b.y + 0.4 + (i % 3) * 0.7, -1.4, 0.12, RACK_GLOW));
        }
      else if (b.state === 'intro')
        for (const side of SIDES) {
          const it = this.pool.take(this.props.curtain);
          translation(b.x + side * (0.7 + k * 3.2), b.y, 0.5, it.model);
          items.push(it);
        }
    }
    const o = poseOptions(CAST[id].scale, turn, b.state === 'consult' ? 0.9 : 0.45, tint);
    poseCharacter(this.cast[id], b.x, y, -0.1, facing, pose, o, items, this.pool);
  }

  /**
   * The hero's face: winces when hurt, beams on success, concentrates on a ledge.
   * Updates `pose` in place (heroPose() returns a fresh object every frame).
   * @param {Pose} pose @param {Sim} sim @param {number} t
   * @returns {Pose}
   */
  face(pose, sim, t) {
    const h = sim.hero;
    /** @type {Pose['mood']} */
    const mood =
      h.state === 'dead' || h.invuln > 1.1
        ? 'ouch'
        : sim.won
          ? 'happy'
          : h.state === 'hang' || h.state === 'climb'
            ? 'focus'
            : pose.mood;
    pose.blink = mood === 'ouch' ? 0 : (pose.blink ?? blinkAt(t));
    pose.mood = mood;
    return pose;
  }

  /**
   * Throwing arm on top of whatever the body is doing (updates `pose` in place).
   * @param {Pose} pose @param {Sim} sim
   * @returns {Pose}
   */
  overlay(pose, sim) {
    const k = sim.time - this.throwAt;
    if (k < 0 || k > 0.28) return pose;
    const swing = k < 0.08 ? -1.6 * (k / 0.08) : -1.6 + 4.2 * ((k - 0.08) / 0.2);
    pose.armR = Math.min(swing, 2.6);
    pose.lean = (pose.lean ?? 0) + 0.12;
    return pose;
  }

  /**
   * Squash on landing, stretch on take-off (updates `pose` in place).
   * @param {Pose} pose @param {number} time
   * @returns {Pose}
   */
  squashed(pose, time) {
    const land = time - this.landAt,
      jump = time - this.jumpAt;
    let k = pose.squash ?? 0;
    if (land >= 0 && land < 0.14) k += 0.16 * (1 - land / 0.14);
    if (jump >= 0 && jump < 0.12) k -= 0.1 * (1 - jump / 0.12);
    pose.squash = k;
    return pose;
  }

  /** @param {DrawItem[]} items @param {Sim} sim @param {number} t */
  drawHero(items, sim, t) {
    const h = sim.hero;
    const dt = t - (this.lastDraw ?? t);
    this.lastDraw = t;
    this.still = h.state === 'ground' && Math.abs(h.vx) < 0.05 && !sim.won ? this.still + dt : 0;
    let hx = h.x + HERO.w / 2;
    let hy = h.y;
    if (h.state === 'climb') {
      const k = Math.min(1, h.stateTime / sim.stats.climb);
      const e = k * k * (3 - 2 * k);
      hy = h.y + (h.ledge.y - h.y) * e;
      hx += h.facing * 0.55 * Math.max(0, e - 0.5) * 2;
    }
    if (h.invuln > 0 && h.state !== 'dead' && Math.floor(t * 14) % 2 === 0) return;
    if (this.showcase) {
      // Title screen: relaxed and smiling, weight shifting gently from foot to foot.
      const sway = Math.sin(t * 1.1);
      const wave = idlePose(t);
      wave.legL = sway * 0.05;
      wave.legR = -sway * 0.05;
      wave.armL = 0.08 + Math.sin(t * 1.1 + 0.6) * 0.06;
      wave.armR = 0.08 - Math.sin(t * 1.1 + 0.6) * 0.06;
      wave.lean = -0.03;
      wave.bob = Math.abs(sway) * 0.4;
      wave.head = Math.sin(t * 0.7) * 0.08;
      wave.mood = 'happy';
      const o = poseOptions(CAST[sim.heroId].scale, 0.3, 0.35);
      poseCharacter(this.cast[sim.heroId], hx, hy, 0.3, 1, wave, o, items, this.pool);
      return;
    }
    const pose = this.face(
      this.squashed(this.overlay(heroPose(sim, t, this.still), sim), sim.time),
      sim,
      t,
    );
    const turn = h.state === 'hang' || h.state === 'climb' ? 1.45 : 1.0;
    const o = poseOptions(CAST[sim.heroId].scale, turn, 0.55);
    poseCharacter(this.cast[sim.heroId], hx, hy, 0, h.facing, pose, o, items, this.pool);
  }
}

export { IDENTITY };

import { CAST } from '../data/cast.js';
import { LEVELS } from '../data/levels/index.js';
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
import { buildProps, propVariant } from '../gfx/props.js';
import { DrawPool, buildCharacter, poseCharacter, poseOptions } from '../gfx/characters.js';
import { chain, multiply, scaling, translation } from '../gfx/mat4.js';
import { Mesh, Sprite, perfStats } from '../gfx/renderer.js';
import { buildThings } from '../gfx/things.js';
import { MAT, Volume, meshVolume } from '../gfx/voxels.js';
import { BOSS_STAGE_SCALE } from '../game/boss.js';
import { HERO, TILE } from '../game/sim.js';
import { assetUrl, crop, loadImage } from './assets.js';
import { buildStage } from './build-worker.js';
import { drawThing } from './draw-things.js';
import { bossPose, dancePose, heroLayers, heroPose, idlePose } from './poses.js';
import { title } from './title.js';

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
/** Cast screen: spacing of the line-up and the depth it stands at. */
const CAST_STEP = 0.8;
const CAST_Z = 0.4;
/** The game camera's vertical field of view and eye offset (see camera.js). */
const CAMERA_FOV = (30 * Math.PI) / 180;
const CAMERA_EYE_DX = 0.6;
const CAMERA_TARGET_Z = -0.8;
/** The cast screen's framing, rewritten by castFocus(). */
const CAST_FOCUS = { x: 0, y: 1.6, facing: 0.001, visH: 5.4 };
const SIDES = [-1, 1];
const RACK_GLOW = [0.3, 1.6, 1.2];
// Scratch factors for the per-frame matrices (results go into pooled items).
const F1 = new Float32Array(16);
const F2 = new Float32Array(16);

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

/** The city skyline depends only on the level width: built once per width. @type {Map<number, Mesh>} */
const SKYLINES = new Map();

/** @typedef {ReturnType<typeof buildStage>} BuiltStage */
/** The worker building stage dioramas; null: build on the main thread. @type {Worker | null | undefined} */
let builder;
/** Builds waiting for the worker, by request id. */
const jobs = new Map();
let nextJob = 1;

/** Starts the build worker, if this browser can run one. @returns {Worker | null} */
function startBuilder() {
  if (typeof Worker === 'undefined') return null;
  try {
    const w = new Worker(new URL('./build-worker.js', import.meta.url), { type: 'module' });
    w.onmessage = (e) => {
      const job = jobs.get(e.data.id);
      jobs.delete(e.data.id);
      if (e.data.error) job?.reject(new Error(e.data.error));
      else job?.resolve(e.data);
    };
    // A worker that cannot start (no module workers): every build falls back.
    w.onerror = (e) => {
      e.preventDefault();
      builder = null;
      w.terminate();
      for (const job of jobs.values()) job.reject(new Error('build worker'));
      jobs.clear();
    };
    return w;
  } catch {
    return null;
  }
}

/**
 * A stage's diorama (and the skyline for `skyline` tiles of width, when > 0), built in
 * the worker so the main thread prepares the artwork meanwhile; on the main thread
 * when there is no worker. Both run the same code on the same data.
 * @param {import('../data/levels/index.js').Level} level
 * @param {import('../game/sim.js').HeroId} heroId
 * @param {number} skyline
 * @returns {Promise<BuiltStage>}
 */
function buildDiorama(level, heroId, skyline) {
  const stage = LEVELS.indexOf(level);
  const worker = builder;
  if (worker === undefined) {
    // A worker only gets going once the main thread is free, and at boot it is not:
    // the first stage builds here and the worker starts right after, for the next ones.
    builder = null;
    setTimeout(() => (builder = startBuilder()));
  }
  if (!worker || stage < 0) return Promise.resolve(buildStage(level, heroId, skyline));
  return /** @type {Promise<BuiltStage>} */ (
    new Promise((resolve, reject) => {
      const id = nextJob++;
      jobs.set(id, { resolve, reject });
      worker.postMessage({ id, stage, heroId, skyline });
    })
  ).catch(() => buildStage(level, heroId, skyline));
}

/**
 * An image decoded off the main thread, so uploading it does not stall a frame.
 * @template {HTMLImageElement | null} T @param {T} img @returns {Promise<T>}
 */
async function decoded(img) {
  await img?.decode().catch(() => {});
  return img;
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
    const start = performance.now();
    this.gl = gl;
    this.levelId = level.id;
    this.theme = level.theme;
    this.decor = level.decor;
    // The diorama builds in the background (see buildDiorama) while the shared meshes,
    // furniture and artwork are prepared here; `ready` waits for both.
    const sky = level.theme !== 'datacenter' && level.theme !== 'parking';
    const width = sim.w;
    const built = buildDiorama(level, sim.heroId, sky && !SKYLINES.has(width) ? width : 0);
    /** The stage's point lights (filled in once the diorama is built, same array). */
    this.lights = /** @type {Array<{pos: number[], radius: number, color: number[]}>} */ ([]);
    /** @type {Mesh | null} */
    this.office = null;
    /** @type {Mesh | null} */
    this.skyline = null;
    /** @type {DrawItem | null} */
    this.officeItem = null;
    /** @type {DrawItem | null} */
    this.skylineItem = null;
    this.disposed = false;
    /** Street lamps' lights, after the diorama's own. @type {typeof this.lights} */
    const lamps = [];
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
        if (row[c] === 'Y' && level.mood === 'lounge') {
          // Break room: a run of 'Y' tiles is one table football, its rim the tile top.
          if (row[c - 1] !== 'Y') {
            let n = 0;
            while (row[c + n] === 'Y') n++;
            this.furniture.push({
              mesh: this.props.babyFoot,
              model: chain(translation(c + n / 2, y, -0.55), scaling(n / 1.34, 1 / 0.88, 1)),
            });
          }
        } else if (row[c] === 'Y')
          this.furniture.push({
            mesh: this.props.copilTable,
            model: chain(translation(c + 0.5, y + 0.1, -0.5), scaling(1, 1, 1.6)),
          });
        if (row[c] === 'Q' && row[c - 1] !== 'Q') {
          let n = 0;
          while (row[c + n] === 'Q') n++;
          this.furniture.push({
            mesh: this.props[cars[carCount++ % cars.length]],
            // Wheels on the floor, roof on the tile top (the hero stands on it): the
            // model is 4 long and 1 tall, drawn unscaled on a 4-tile run.
            model: chain(translation(c + n / 2, y, -0.6), scaling(n / 4, 1, 1)),
          });
        }
      }
    });
    for (const d of level.decor) {
      if (d.type === 'desk')
        this.furniture.push(this.prop(propVariant('chair', d.x + 4.7, d.y), d.x + 4.7, d.y, -1.1));
      else if (d.type in this.props) {
        const mesh = /** @type {keyof typeof this.props} */ (d.type);
        this.furniture.push(this.prop(propVariant(mesh, d.x, d.y), d.x, d.y, d.z ?? -1.9));
        if (d.type === 'lampPost')
          lamps.push({ pos: [d.x, d.y + 2.5, -1.4], radius: 5, color: [0.7, 0.5, 0.3] });
      }
    }
    /** @type {Sprite[]} */
    this.sprites = [];
    /** Per-frame draw items are recycled from here (see items()). */
    this.pool = new DrawPool();
    /** The list items() returns, refilled every frame. @type {DrawItem[]} */
    this.frame = [];
    /** Door and arena gate tiles, found once per tile map. @type {{tiles: Sim['tiles'] | null, doors: number[], gates: number[]}} */
    this.gates = { tiles: null, doors: [], gates: [] };
    /** What the stage's key item looks like. */
    this.keyMesh = this.things[level.keyModel ?? 'key'];
    const exit = sim.things.find((t) => t.kind === 'exit');
    /** Where the stage ends, for the exit sign: over the way out, but kept clear of
     * the end walls so the camera, which stops at the level's edge, shows it whole. */
    this.exitAt = exit ? { x: Math.max(2.6, Math.min(sim.w - 2.6, exit.x)), y: exit.y } : null;
    /** Milliseconds the main thread spent on this build (the constructor's added below). */
    let main = 0;
    const diorama = built.then((b) => {
      const t = performance.now();
      if (this.disposed) return;
      for (const l of b.lights) this.lights.push(l);
      for (const l of lamps) this.lights.push(l);
      this.office = new Mesh(gl, b.office);
      this.officeItem = { mesh: this.office, model: IDENTITY };
      if (b.skyline && !SKYLINES.has(width)) SKYLINES.set(width, new Mesh(gl, b.skyline));
      this.skyline = (sky && SKYLINES.get(width)) || null;
      this.skylineItem = this.skyline
        ? { mesh: this.skyline, model: IDENTITY, noShadow: true }
        : null;
      main += performance.now() - t;
    });
    this.ready = Promise.all([diorama, this.loadArtwork()]).then(() => {
      perfStats.buildMs = performance.now() - start;
      perfStats.mainMs = main;
    });
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
    this.joyAt = -1;
    /** Highest point of the current jump or fall, and how far the last landing dropped. */
    this.peak = 0;
    this.drop = 0;
    /** Seconds since each of those beats, handed to heroLayers() (rewritten per frame). */
    this.beats = { land: -1, jump: -1, throw: -1, joy: -1, drop: 0 };
    /** Seconds the hero has stood still. */
    this.still = 0;
    main += performance.now() - start;
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
   * Camera framing of the cast screen: the whole line-up (from `galleryX`) centred in
   * the part of the screen the cast card leaves free, from `left` to `right` (shares
   * of the canvas width), zooming out only when it would not fit. When the card
   * leaves almost nothing (upright phones), the line-up is centred on the screen.
   * Returns the same object every call.
   * @param {number} aspect Canvas width / height.
   * @param {number} [left] @param {number} [right]
   */
  castFocus(aspect, left = 0, right = 1) {
    if (right - left < 0.35) {
      left = 0;
      right = 1;
    }
    // The line-up's extent, half a body beyond the first and last (directors are wider).
    let a = Infinity,
      b = -Infinity;
    for (let i = 0; i < GALLERY.length; i++) {
      const x = this.galleryX + i * CAST_STEP;
      const half = 0.5 * CAST[GALLERY[i]].scale;
      a = Math.min(a, x - half);
      b = Math.max(b, x + half);
    }
    // At the line-up's depth (nearer than the wall plane the view height is set for)
    // the visible width is aspect · (visH − 2·z·tan(fov/2)).
    const tan = Math.tan(CAMERA_FOV / 2);
    const visH = Math.max(5.4, ((b - a) * 1.1) / (right - left) / aspect + 2 * CAST_Z * tan);
    const width = aspect * (visH - 2 * CAST_Z * tan);
    const dist = visH / 2 / tan;
    // The eye sits to the right of the point it looks at, which shifts the view's
    // centre at the line-up's depth.
    const shift = (CAMERA_EYE_DX * (CAST_Z - CAMERA_TARGET_Z)) / (dist - CAMERA_TARGET_Z);
    const f = CAST_FOCUS;
    f.x = (a + b) / 2 - ((left + right) / 2 - 0.5) * width - shift;
    f.visH = visH;
    return f;
  }

  /**
   * Remembers landings and take-offs for squash and stretch.
   * @param {import('../game/sim.js').SimEvent} e @param {number} time Simulation time.
   */
  event(e, time) {
    if (e.type === 'land' || e.type === 'step' || e.type === 'hardland') {
      this.landAt = time;
      this.drop = Math.max(0, this.peak - e.y);
      this.peak = e.y;
    }
    if (e.type === 'jump' || e.type === 'airjump') this.jumpAt = time;
    if (e.type === 'throw') this.throwAt = time;
    if (e.type === 'ticket' || e.type === 'secret' || e.type === 'key' || e.type === 'checkpoint')
      this.joyAt = time;
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
    this.disposed = true;
    this.office?.dispose(this.gl);
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
        const art = await boardArt(d.id);
        const img = art instanceof HTMLImageElement ? await decoded(art) : art;
        if (img)
          this.sprites.push(
            new Sprite(gl, img, [d.x, d.y + 0.75, -2.6, WHITEBOARD_W, WHITEBOARD_W * 0.75]),
          );
      } else if (d.type === 'desk' && d.id) {
        const id = /** @type {keyof typeof DESKS} */ (d.id);
        const img = await decoded(await loadImage(DESKS[id].file));
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
            ? await decoded(await loadImage(src))
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
    const items = this.dynamicItems(sim, t, particles);
    // Static scenery last: what stands in front fills the depth buffer first, so the
    // walls and skyline behind it are rejected before shading.
    for (const f of this.furniture) items.push(f);
    if (this.officeItem) items.push(this.officeItem);
    if (this.skylineItem) items.push(this.skylineItem);
    return items;
  }

  /**
   * The cast, things, particles, doors and gates of this frame.
   * @param {Sim} sim
   * @param {number} t
   * @param {import('./fx.js').Particle[]} particles
   * @returns {DrawItem[]}
   */
  dynamicItems(sim, t, particles) {
    // Items come from the pool and are only valid until the next call: the renderer
    // consumes them right away.
    const pool = this.pool;
    pool.reset();
    const items = this.frame;
    items.length = 0;
    if (this.party) {
      // The end: everybody celebrates the signed envelope at the Espace VIP.
      for (let i = 0; i < CROWD.length; i++) {
        const id = CROWD[i];
        const d = dancePose(t, i);
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
        const x = this.galleryX + i * (this.galleryX > 2 ? CAST_STEP : 0.9);
        const o = poseOptions(CAST[id].scale, 0.35, 0.4);
        poseCharacter(this.cast[id], x, 3, CAST_Z, 1, idlePose(t + i), o, items, pool);
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
    const { pose, y, turn, tint, facing } = bossPose(b, sim.hero.x + HERO.w / 2, t, sim.boss?.id);
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
    // Imposing in their duel: a head and shoulders over the heroes (boss.js BOSS_HEIGHT).
    const scale = CAST[id].scale * BOSS_STAGE_SCALE;
    const o = poseOptions(scale, turn, b.state === 'consult' ? 0.9 : 0.45, tint);
    poseCharacter(this.cast[id], b.x, y, -0.1, facing, pose, o, items, this.pool);
  }

  /** @param {DrawItem[]} items @param {Sim} sim @param {number} t */
  drawHero(items, sim, t) {
    const h = sim.hero;
    const dt = t - (this.lastDraw ?? t);
    this.lastDraw = t;
    this.still = h.state === 'ground' && Math.abs(h.vx) < 0.05 && !sim.won ? this.still + dt : 0;
    // The top of the arc, for a landing squash that grows with the drop.
    this.peak = h.state === 'air' ? Math.max(this.peak, h.y) : h.y;
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
      // Title screen: both heroes pose, the chosen one in front (see title.js).
      title.draw(this.cast, sim.heroId, t, items, this.pool);
      return;
    }
    const b = this.beats;
    b.land = sim.time - this.landAt;
    b.jump = sim.time - this.jumpAt;
    b.throw = sim.time - this.throwAt;
    b.joy = sim.time - this.joyAt;
    b.drop = this.drop;
    if (this.landAt < 0) b.land = -1;
    if (this.jumpAt < 0) b.jump = -1;
    if (this.throwAt < 0) b.throw = -1;
    if (this.joyAt < 0) b.joy = -1;
    // Body, face (neutral, effort, ouch, joy) and the throw/landing/take-off layers.
    const pose = heroLayers(heroPose(sim, t, this.still), sim, b);
    const turn = h.state === 'hang' || h.state === 'climb' ? 1.45 : 1.0;
    const o = poseOptions(CAST[sim.heroId].scale, turn, 0.55);
    poseCharacter(this.cast[sim.heroId], hx, hy, 0, h.facing, pose, o, items, this.pool);
  }
}

export { IDENTITY };

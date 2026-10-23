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
import { buildCharacter, poseCharacter } from '../gfx/characters.js';
import { chain, rotationY, rotationZ, scaling, translation } from '../gfx/mat4.js';
import { Mesh, Sprite } from '../gfx/renderer.js';
import { buildThings } from '../gfx/things.js';
import { MAT, Volume, meshVolume } from '../gfx/voxels.js';
import { buildOffice, buildSkyline } from '../gfx/world-builder.js';
import { HERO, TILE } from '../game/sim.js';
import { assetUrl, crop, loadImage } from './assets.js';

const IDENTITY = translation(0, 0, 0);
const GALLERY = ['kevin', 'charline', 'mathis', 'techServicesDirector', 'regionalDirector'];

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
    SHARED.set(gl, {
      things: buildThings(gl),
      props: buildProps(gl),
      cast,
      cube: new Mesh(gl, meshVolume(v)),
    });
  }
  return /** @type {{things: ReturnType<typeof buildThings>, props: ReturnType<typeof buildProps>, cast: Record<string, ReturnType<typeof buildCharacter>>, cube: Mesh}} */ (
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
    this.skyline = level.theme === 'datacenter' ? null : new Mesh(gl, buildSkyline(sim.w));
    const shared = sharedMeshes(gl);
    this.things = shared.things;
    this.props = shared.props;
    this.cast = shared.cast;
    this.cube = shared.cube;
    /** Furniture and props standing in the level. @type {DrawItem[]} */
    this.furniture = [];
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
    this.ready = this.loadArtwork();
    this.doorT = 0;
    this.gallery = false;
    this.landAt = -1;
    this.jumpAt = -1;
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
  }

  /** Frees the level's own GPU resources (shared meshes stay). */
  dispose() {
    this.office.dispose(this.gl);
    this.skyline?.dispose(this.gl);
    for (const s of this.sprites) s.dispose(this.gl);
    this.sprites = [];
  }

  async loadArtwork() {
    const gl = this.gl;
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
    /** @type {DrawItem[]} */
    const items = [{ mesh: this.office, model: IDENTITY }, ...this.furniture];
    if (this.skyline) items.push({ mesh: this.skyline, model: IDENTITY, noShadow: true });
    if (this.gallery) {
      GALLERY.forEach((id, i) =>
        items.push(
          ...poseCharacter(this.cast[id], 1.2 + i * 1.1, 3, 0.4, 1, idlePose(t + i), {
            scale: CAST[id].scale,
            turn: 0.35,
            rim: 0.4,
          }),
        ),
      );
      return items;
    }
    this.drawHero(items, sim, t);
    const things = this.things;
    /** @param {Mesh} mesh @param {number} x @param {number} y @param {number} z @param {...Float32Array} extra */
    const at = (mesh, x, y, z, ...extra) =>
      items.push({ mesh, model: chain(translation(x, y, z), ...extra) });
    const partner = sim.heroId === 'kevin' ? 'charline' : 'kevin';
    for (const th of sim.things) {
      if (!th.alive) continue;
      switch (th.kind) {
        case 'ticket':
          at(
            things.ticket,
            th.x,
            th.y + Math.sin(t * 3 + th.x) * 0.08,
            0,
            rotationY(t * 2.5 + th.x),
          );
          break;
        case 'ammo':
          if (th.state === 'gone') break;
          at(
            things.ammo,
            th.x,
            th.y + Math.sin(t * 2.6 + th.x) * 0.06,
            0,
            rotationY(Math.sin(t) * 0.5),
          );
          break;
        case 'cr':
          at(things.cr, th.x, th.y, 0.1, rotationZ(t * 18));
          break;
        case 'key':
          at(
            things.key,
            th.x,
            th.y + Math.sin(t * 2.5) * 0.1,
            0,
            rotationY(Math.sin(t * 1.5) * 0.6),
          );
          break;
        case 'loose':
          if (th.state !== 'gone')
            at(
              things.loose,
              th.x + 0.5 + (th.state === 'shaking' ? Math.sin(t * 90) * 0.04 : 0),
              th.y + 1,
              -0.53,
            );
          break;
        case 'panel':
          if (th.state !== 'broken')
            at(
              things.panel,
              th.x + 0.5 + (th.state === 'shaking' ? Math.sin(t * 80) * 0.03 : 0),
              th.y + 0.9,
              -0.6,
            );
          break;
        case 'bottle':
          if (th.state !== 'burst')
            at(things.bottle, th.x, th.y + 0.31, 0, rotationZ(-th.x / 0.31));
          break;
        case 'checkpoint':
          at(th.state === 'on' ? things.checkpointOn : things.checkpoint, th.x, th.y, -0.9);
          break;
        case 'reader':
          at(th.state === 'on' ? things.readerOn : things.reader, th.x, th.y + 0.9, -0.8);
          break;
        case 'exit':
          at(things.exit, th.x, th.y, -0.9);
          items.push(
            ...poseCharacter(this.cast[partner], th.x + 0.35, th.y, -0.4, -1, idlePose(t + 1), {
              scale: CAST[partner].scale,
              rim: 0.4,
            }),
          );
          break;
        case 'colleague': {
          const meeting = th.state === 'meeting';
          const ph = t * 6;
          /** @type {Pose} */
          const pose = meeting
            ? {
                legL: 1.4,
                legR: 1.4,
                armL: 1.2 + Math.sin(t * 14) * 0.08,
                armR: 1.2 - Math.sin(t * 14) * 0.08,
                bob: -5,
                head: 0.25,
              }
            : {
                legL: Math.sin(ph) * 0.6,
                legR: -Math.sin(ph) * 0.6,
                armL: -Math.sin(ph) * 0.4,
                armR: 2.5,
                armSpread: -0.3,
                bob: Math.abs(Math.cos(ph)),
                head: -0.1,
              };
          items.push(
            ...poseCharacter(
              this.cast.mathis,
              th.x,
              th.y,
              -0.2,
              meeting ? 1 : Math.sign(th.vx) || 1,
              pose,
              { scale: CAST.mathis.scale, rim: 0.3, turn: meeting ? 0.4 : 1 },
            ),
          );
          break;
        }
        case 'lift':
          items.push({
            mesh: this.props.lift,
            model: chain(
              translation(th.x + (th.w ?? 2) / 2, th.y - 0.25, -0.2),
              scaling(th.w ?? 2, 1, 1),
            ),
          });
          break;
        case 'kpi':
          at(this.props.kpi, th.x, th.y, 0.1, rotationZ(th.t * 9));
          break;
        case 'wave':
          at(
            this.props.wave,
            th.x,
            th.y,
            0,
            scaling(Math.sign(th.vx) || 1, 1 + Math.sin(th.t * 30) * 0.15, 1),
          );
          break;
        case 'boss':
          this.drawBoss(items, sim, th, t);
          break;
        default:
          break;
      }
    }
    for (const p of particles) {
      const k = p.size * Math.min(1, (p.life / p.max) * 2);
      items.push({
        mesh: this.cube,
        model: chain(translation(p.x, p.y, p.z), scaling(k, k, k)),
        tint: p.color,
        noShadow: true,
      });
    }
    // Doors slide up into the ceiling once the badge reader has been used.
    for (let c = 0; c < sim.w; c++)
      for (let r = 0; r < sim.h; r++)
        if (
          sim.tiles[c + r * sim.w] === TILE.DOOR &&
          (r === 0 || sim.tiles[c + (r - 1) * sim.w] !== TILE.DOOR)
        )
          items.push({
            mesh: things.door,
            model: translation(
              c + 0.5,
              r + (sim.doorOpen ? Math.min(2.2, this.doorT * 3) : 0),
              -0.6,
            ),
          });
    // The arena gate drops shut while the boss fight is on.
    if (sim.bossActive && !sim.bossDone)
      for (let c = 0; c < sim.w; c++)
        for (let r = 0; r < sim.h; r++)
          if (sim.tiles[c + r * sim.w] === TILE.GATE)
            items.push({ mesh: this.props.gate, model: translation(c + 0.5, r, -0.2) });
    return items;
  }

  /**
   * The level boss: throws KPI slides, consults PRIMO on a tablet, leaps (regional),
   * and cheers once convinced.
   * @param {DrawItem[]} items @param {Sim} sim @param {import('../game/sim.js').Thing} b @param {number} t
   */
  drawBoss(items, sim, b, t) {
    const id = sim.boss?.id ?? 'techServicesDirector';
    const hx = sim.hero.x + HERO.w / 2;
    const facing = b.state === 'convinced' ? 1 : Math.sign(hx - b.x) || -1;
    let y = b.y;
    /** @type {Pose} */
    let pose = idlePose(t);
    let turn = 1;
    switch (b.state) {
      case 'intro':
        pose = {
          legL: 0.1,
          legR: -0.1,
          armL: 0.6,
          armR: 0.6,
          armSpread: 0.9,
          lean: -0.1,
          head: -0.15,
        };
        turn = 0.5;
        break;
      case 'throw': {
        const k = (b.t % 0.95) / 0.95;
        pose = { legL: 0.3, legR: -0.3, armL: -0.3, armR: k < 0.8 ? -1.2 * k : 2.6, lean: 0.15 };
        break;
      }
      case 'leap': {
        const k = Math.min(1, b.t / 0.7);
        y += Math.sin(Math.PI * k) * 1.6;
        pose = { legL: 0.9, legR: 0.6, armL: 2.6, armR: 2.6, squash: k > 0.95 ? 0.15 : -0.05 };
        break;
      }
      case 'consult':
        pose = { legL: 0, legR: 0, armL: 0.2, armR: 1.1, head: 0.45, bob: Math.sin(t * 2) * 0.3 };
        turn = 0.35;
        break;
      case 'hit':
        pose = { legL: -0.3, legR: 0.4, armL: 2.2, armR: 1.8, lean: -0.35, squash: 0.08 };
        break;
      case 'convinced':
        pose = {
          legL: 0,
          legR: 0,
          armL: 2.9 + Math.sin(t * 8) * 0.15,
          armR: 2.9 - Math.sin(t * 8) * 0.15,
          armSpread: 0.3,
          bob: Math.abs(Math.sin(t * 6)) * 1.5,
          head: -0.2,
        };
        turn = 0.3;
        break;
      default:
        break;
    }
    items.push(
      ...poseCharacter(this.cast[id], b.x, y, -0.1, facing, pose, {
        scale: CAST[id].scale,
        turn,
        rim: b.state === 'consult' ? 0.9 : 0.45,
        tint: b.state === 'hit' && b.t < 0.2 ? [1.6, 1.2, 1.2] : undefined,
      }),
    );
  }

  /**
   * Squash on landing, stretch on take-off.
   * @param {Pose} pose @param {number} time
   * @returns {Pose}
   */
  squashed(pose, time) {
    const land = time - this.landAt,
      jump = time - this.jumpAt;
    let k = pose.squash ?? 0;
    if (land >= 0 && land < 0.14) k += 0.16 * (1 - land / 0.14);
    if (jump >= 0 && jump < 0.12) k -= 0.1 * (1 - jump / 0.12);
    return { ...pose, squash: k };
  }

  /** @param {DrawItem[]} items @param {Sim} sim @param {number} t */
  drawHero(items, sim, t) {
    const h = sim.hero;
    let hx = h.x + HERO.w / 2;
    let hy = h.y;
    if (h.state === 'climb') {
      const k = Math.min(1, h.stateTime / sim.stats.climb);
      const e = k * k * (3 - 2 * k);
      hy = h.y + (h.ledge.y - h.y) * e;
      hx += h.facing * 0.55 * Math.max(0, e - 0.5) * 2;
    }
    if (h.invuln > 0 && h.state !== 'dead' && Math.floor(t * 14) % 2 === 0) return;
    items.push(
      ...poseCharacter(
        this.cast[sim.heroId],
        hx,
        hy,
        0,
        h.facing,
        this.squashed(heroPose(sim, t), sim.time),
        {
          scale: CAST[sim.heroId].scale,
          turn: h.state === 'hang' || h.state === 'climb' ? 1.45 : 1.0,
          rim: 0.55,
        },
      ),
    );
  }
}

/**
 * @param {Sim} sim
 * @param {number} t
 * @returns {Pose}
 */
function heroPose(sim, t) {
  const h = sim.hero;
  if (h.state === 'hang')
    return { legL: 0.15, legR: -0.1, armL: Math.PI * 0.95, armR: Math.PI * 0.95, lean: 0.1 };
  if (h.state === 'climb') {
    const k = Math.min(1, h.stateTime / sim.stats.climb);
    return {
      legL: 0.8 * k,
      legR: 0.2,
      armL: Math.PI * (0.95 - k * 0.6),
      armR: Math.PI * (0.95 - k * 0.6),
      lean: 0.4 * k,
    };
  }
  if (h.state === 'dead')
    return { legL: 0.3, legR: -0.2, armL: 2.6, armR: 2.4, lean: -0.3, squash: 0.15 };
  if (h.state === 'air') {
    const up = h.vy > 0;
    return {
      legL: up ? 0.7 : 0.3,
      legR: up ? -0.4 : -0.2,
      armL: up ? -0.8 : 0.9,
      armR: up ? 1.4 : 1.1,
      lean: 0.12,
      squash: up ? -0.06 : 0,
    };
  }
  const speed = Math.abs(h.vx);
  if (speed > 0.3) {
    const ph = h.run * 2.3;
    const a = Math.min(1, speed / sim.stats.run);
    return {
      legL: Math.sin(ph) * 0.9 * a,
      legR: -Math.sin(ph) * 0.9 * a,
      armL: -Math.sin(ph) * 0.8 * a,
      armR: Math.sin(ph) * 0.8 * a,
      lean: 0.18 * a,
      bob: Math.abs(Math.cos(ph)) * 1.2 * a,
    };
  }
  return idlePose(t);
}

/** @param {number} t @returns {Pose} */
export function idlePose(t) {
  return {
    legL: 0,
    legR: 0,
    armL: Math.sin(t * 1.3) * 0.08,
    armR: Math.sin(t * 1.7) * 0.08,
    bob: Math.sin(t * 2.4) * 0.3,
    head: Math.sin(t * 0.7) * 0.06,
  };
}

export { IDENTITY };

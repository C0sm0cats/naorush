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
    /**
     * A floor tile in disguise (hidden trapdoor): top at y = 0, spanning the full depth.
     * @param {(x: number, z: number) => number} top
     */
    const floor = (top) => {
      const f = new Volume(8, 8, 30, 1 / 8, [-0.5, -1, -2.4]);
      f.box(0, 0, 0, 8, 6, 30, 0xbdb4a6);
      f.box(0, 6, 0, 8, 8, 30, (x, _y, z) => top(x, z));
      f.box(0, 6, 29, 8, 7, 30, 0xc6f432);
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
      },
    });
  }
  return /** @type {{things: ReturnType<typeof buildThings>, props: ReturnType<typeof buildProps>, cast: Record<string, ReturnType<typeof buildCharacter>>, cube: Mesh, hiddenFloor: {office: Mesh, dc: Mesh}}} */ (
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
      level.theme === 'datacenter' || level.theme === 'parking'
        ? null
        : new Mesh(gl, buildSkyline(sim.w));
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
    this.ready = this.loadArtwork();
    this.doorT = 0;
    this.gallery = false;
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
    return {
      mesh: this.cube,
      model: chain(translation(x, y, z), scaling(size, size, size)),
      tint: color,
      noShadow: true,
    };
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
    const P = this.props;
    /** @param {Mesh} mesh @param {number} x @param {number} y @param {number} z @param {...Float32Array} extra */
    const at = (mesh, x, y, z, ...extra) =>
      items.push({ mesh, model: chain(translation(x, y, z), ...extra) });
    const partner = sim.heroId === 'kevin' ? 'charline' : 'kevin';
    // Off-screen things are skipped (the view is about 15 tiles wide).
    const near = sim.bossActive ? 30 : 16;
    for (const th of sim.things) {
      if (!th.alive || (Math.abs(th.x - sim.hero.x) > near && th.kind !== 'zone')) continue;
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
          // Hidden trapdoors look exactly like the floor until they shake.
          if (th.hidden && th.state !== 'gone' && th.state !== 'falling')
            at(
              this.theme === 'datacenter' ? this.hiddenFloor.dc : this.hiddenFloor.office,
              th.x + 0.5 + (th.state === 'shaking' ? Math.sin(t * 90) * 0.04 : 0),
              th.y + 1,
              0,
            );
          else if (th.state !== 'gone')
            at(
              things.loose,
              th.x + 0.5 + (th.state === 'shaking' ? Math.sin(t * 90) * 0.04 : 0),
              th.y + 1,
              -0.53,
            );
          break;
        case 'panel':
          if (th.variant === 'binders') {
            if (th.state !== 'broken' || th.t < 0.6)
              at(
                P.binders,
                th.x + 0.5 + (th.state === 'shaking' ? Math.sin(t * 70) * 0.04 : 0),
                th.y,
                -0.2,
              );
            break;
          }
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
        case 'chair':
          at(
            P.chair,
            th.x + (th.state === 'wobble' ? Math.sin(t * 60) * 0.04 : 0),
            th.y,
            -0.15,
            rotationY(th.state === 'rolling' ? th.x * 2.2 : 0.5),
          );
          break;
        case 'drawer': {
          const dir = th.dir ?? 1;
          const base = dir > 0 ? th.x - 0.5 : th.x + 0.5;
          const shake = th.state === 'rattle' ? Math.sin(t * 70) * 0.03 : 0;
          at(
            P.drawer,
            base + dir * ((th.w ?? 0) - 0.92 + shake),
            th.y + 0.75,
            -0.2,
            scaling(dir, 1, 1),
          );
          break;
        }
        case 'sprinkler': {
          const top = th.y1 ?? th.y + 1;
          at(P.sprinkler, th.x, top, -0.3);
          if (th.state === 'on') {
            const h = top - 0.15 - (th.y0 ?? 0);
            items.push({
              mesh: P.spray,
              model: chain(
                translation(th.x, top - 0.15, -0.3),
                scaling(0.8 + Math.sin(t * 40) * 0.05, h, 0.8),
              ),
              tint: [0.75, 0.9, 1.25],
              noShadow: true,
            });
          } else if (th.state === 'drip') {
            const k = ((t * 1.6) % 1) * (top - (th.y0 ?? 0));
            items.push(this.glow(th.x, top - 0.2 - k, -0.3, 0.06, [0.5, 0.8, 1]));
          }
          break;
        }
        case 'printer':
          at(P.printer, th.x, th.y, -0.4, scaling(th.dir ?? 1, 1, 1));
          if (th.state === 'blink' && Math.floor(t * 12) % 2 === 0)
            items.push(
              this.glow(th.x + (th.dir ?? 1) * 0.35, th.y + 1.02, -0.1, 0.09, [1, 0.25, 0.2]),
            );
          break;
        case 'paper':
          at(P.paper, th.x, th.y, 0, rotationZ(Math.sin(th.t * 20) * 0.25));
          break;
        case 'crate':
          at(P.archive, th.x + 0.5, th.y, -0.5, scaling(1, 1, 1.9));
          break;
        case 'cup':
          if (th.state !== 'gone')
            at(
              P.cup,
              th.x,
              th.y + Math.sin(t * 2.4 + th.x) * 0.06,
              0,
              rotationY(Math.sin(t) * 0.6),
            );
          break;
        case 'intern': {
          const stunned = th.state === 'stunned';
          const ph = t * 9;
          items.push(
            ...poseCharacter(
              this.cast.intern,
              th.x,
              th.y,
              -0.1,
              stunned ? 1 : Math.sign(th.vx) || 1,
              stunned
                ? { legL: 1.5, legR: 1.5, armL: 0.9, armR: 1.4, bob: -6, head: 0.2 }
                : {
                    legL: Math.sin(ph) * 0.9,
                    legR: -Math.sin(ph) * 0.9,
                    armL: 1.5,
                    armR: 1.5,
                    lean: 0.25,
                    bob: Math.abs(Math.cos(ph)),
                  },
              { scale: CAST.intern.scale, rim: 0.3, turn: stunned ? 0.4 : 1 },
            ),
          );
          if (!stunned)
            at(
              P.binders,
              th.x + (Math.sign(th.vx) || 1) * 0.28,
              th.y + 0.95,
              0.25,
              scaling(0.6, 0.6, 0.6),
            );
          else at(P.cup, th.x + 0.35, th.y, 0.2);
          break;
        }
        case 'vacuum':
          at(P.vacuum, th.x, th.y, 0, rotationY(th.t * 3));
          break;
        case 'visio': {
          const dir = th.dir ?? -1;
          const muted = th.state === 'muted';
          items.push(
            ...poseCharacter(
              this.cast.visio,
              th.x - dir * 0.15,
              th.y,
              -0.5,
              dir,
              muted
                ? { legL: 0, legR: 0, armL: 0.1, armR: 0.1, head: 0.35 }
                : th.state === 'ring'
                  ? { legL: 0, legR: 0, armL: 0.4, armR: 2.6, head: -0.2 }
                  : { ...idlePose(t), armR: 1.2 + Math.sin(t * 5) * 0.4 },
              { scale: CAST.visio.scale, rim: 0.3, turn: 0.7 },
            ),
          );
          at(P.laptopStand, th.x + dir * 0.35, th.y, -0.3);
          break;
        }
        case 'invite':
          at(P.invite, th.x, th.y, 0, rotationZ(Math.sin(th.t * 12) * 0.2));
          break;
        case 'rack': {
          const floor = th.y0 ?? th.y;
          if (th.state === 'warn') {
            const k = Math.min(1, th.t / 0.9);
            at(P.shadow, th.x, floor + 0.02, 0, scaling(0.4 + k * 0.8, 1, 0.4 + k * 0.8));
            items.push(this.glow(th.x, floor + 0.05, 0.6, 0.12, [1, 0.5, 0.15]));
          } else at(P.rackFall, th.x, th.y, -0.1);
          break;
        }
        case 'zone': {
          const floor = th.y0 ?? th.y;
          const w = th.w ?? 1;
          if (th.variant === 'arrow') {
            const dir = th.dir ?? 1;
            for (let x = th.x + 0.8; x < th.x + w; x += 2)
              items.push({
                mesh: P.arrow,
                model: chain(translation(x, floor + 0.01, 0.2), scaling(dir, 1, 1)),
                tint: [1, 0.6 + Math.sin(t * 12) * 0.3, 0.3],
                noShadow: true,
              });
            break;
          }
          const live = th.state === 'live';
          const pulse = 0.6 + Math.sin(t * (live ? 40 : 14)) * 0.4;
          const color = live
            ? th.variant === 'cable'
              ? [0.6 * pulse + 0.6, 0.9, 1.6]
              : [1.6, 0.5, 0.6 * pulse]
            : [1.2 * pulse, 0.55 * pulse, 0.15];
          items.push({
            mesh: P.warn,
            model: chain(translation(th.x + w / 2, floor + 0.01, -0.4), scaling(w, 1, 2.4)),
            tint: color,
            noShadow: true,
          });
          break;
        }
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
   * The level boss. Every attack has its own pose, held during the wind-up so it
   * reads as a warning: arm cocked for a volley, arms raised to lower the racks,
   * crouch before a leap, lean before the dash.
   * @param {DrawItem[]} items @param {Sim} sim @param {import('../game/sim.js').Thing} b @param {number} t
   */
  drawBoss(items, sim, b, t) {
    const id = sim.boss?.id ?? 'techServicesDirector';
    const hx = sim.hero.x + HERO.w / 2;
    const done = b.state === 'convinced' || b.state === 'sign';
    const facing = b.state === 'dash' ? (b.dir ?? 1) : done ? 1 : Math.sign(hx - b.x) || -1;
    let y = b.y;
    /** @type {Pose} */
    let pose = idlePose(t);
    let turn = 1;
    /** @type {number[] | undefined} */
    let tint;
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
      case 'volley': {
        const k = ((b.t + 0.05) % 0.55) / 0.55;
        pose =
          b.t < 0.5
            ? { legL: 0.3, legR: -0.3, armL: -0.3, armR: -1.3, lean: -0.1 }
            : { legL: 0.3, legR: -0.3, armL: -0.3, armR: k < 0.7 ? -1.2 * k : 2.6, lean: 0.15 };
        break;
      }
      case 'fan':
        pose =
          b.t < 0.55
            ? { legL: 0.4, legR: -0.4, armL: -1.4, armR: -1.4, armSpread: 0.6, lean: -0.15 }
            : { legL: 0.2, legR: -0.2, armL: 2.4, armR: 2.4, armSpread: 1, lean: 0.2 };
        break;
      case 'rackDrop':
      case 'cables':
        pose = {
          legL: 0.2,
          legR: -0.2,
          armL: 2.8 + Math.sin(t * 10) * 0.1,
          armR: 2.8 - Math.sin(t * 10) * 0.1,
          armSpread: 0.4,
          head: -0.3,
        };
        turn = 0.6;
        break;
      case 'teleport':
        pose = { legL: 0, legR: 0, armL: 1.6, armR: 1.6, armSpread: 1.2, head: -0.2 };
        tint = b.t < 0.55 ? [1 + b.t * 2, 1 + b.t * 2.4, 1 + b.t * 3] : undefined;
        turn = 0.5 + b.t * 4;
        break;
      case 'leap': {
        if (b.t < 0.5)
          pose = { legL: 1.1, legR: 1.1, armL: -0.6, armR: -0.6, squash: 0.18, lean: 0.3 };
        else {
          const k = Math.min(1, (b.t - 0.5) / 0.6);
          y += Math.sin(Math.PI * k) * 1.8;
          pose = { legL: 0.9, legR: 0.6, armL: 2.6, armR: 2.6, squash: k > 0.95 ? 0.18 : -0.06 };
        }
        break;
      }
      case 'dash':
        if (b.t < 0.85)
          pose = { legL: 0.8, legR: -0.6, armL: -0.9, armR: 0.9, lean: 0.45, squash: 0.08 };
        else {
          const ph = t * 22;
          pose = {
            legL: Math.sin(ph) * 1.1,
            legR: -Math.sin(ph) * 1.1,
            armL: -Math.sin(ph) * 1.1,
            armR: Math.sin(ph) * 1.1,
            lean: 0.4,
          };
        }
        break;
      case 'zones':
        pose = { legL: 0.3, legR: -0.3, armL: 1.5, armR: 2.7, armSpread: 1.1, head: -0.25 };
        turn = 0.4;
        break;
      case 'consult':
        pose = { legL: 0, legR: 0, armL: 0.2, armR: 1.1, head: 0.45, bob: Math.sin(t * 2) * 0.3 };
        turn = 0.35;
        break;
      case 'hit':
        pose = { legL: -0.3, legR: 0.4, armL: 2.2, armR: 1.8, lean: -0.35, squash: 0.08 };
        tint = b.t < 0.2 ? [1.6, 1.3, 1.2] : undefined;
        break;
      case 'phase':
        // Second wind: a power pose and a glow.
        pose = {
          legL: 0.5,
          legR: -0.5,
          armL: 2.9,
          armR: 2.9,
          armSpread: 0.9,
          head: -0.35,
          squash: -0.05,
        };
        tint = [1.2 + Math.sin(t * 18) * 0.2, 1.15, 1.3];
        turn = 0.3;
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
      case 'sign':
        // Signs the envelope, then offers a handshake.
        pose =
          b.t < 1.2
            ? { legL: 0, legR: 0, armL: 0.9, armR: 1.2 + Math.sin(t * 16) * 0.12, head: 0.4 }
            : { legL: 0, legR: 0, armL: 0.1, armR: 1.4, head: -0.05, bob: Math.sin(t * 2) * 0.3 };
        turn = b.t < 1.2 ? 0.4 : 0.8;
        break;
      default:
        break;
    }
    items.push(
      ...poseCharacter(this.cast[id], b.x, y, -0.1, facing, pose, {
        scale: CAST[id].scale,
        turn,
        rim: b.state === 'consult' ? 0.9 : 0.45,
        tint,
      }),
    );
  }

  /**
   * Throwing arm on top of whatever the body is doing.
   * @param {Pose} pose @param {Sim} sim
   * @returns {Pose}
   */
  overlay(pose, sim) {
    const k = sim.time - this.throwAt;
    if (k < 0 || k > 0.28) return pose;
    const swing = k < 0.08 ? -1.6 * (k / 0.08) : -1.6 + 4.2 * ((k - 0.08) / 0.2);
    return { ...pose, armR: Math.min(swing, 2.6), lean: (pose.lean ?? 0) + 0.12 };
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
    items.push(
      ...poseCharacter(
        this.cast[sim.heroId],
        hx,
        hy,
        0,
        h.facing,
        this.squashed(this.overlay(heroPose(sim, t, this.still), sim), sim.time),
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
 * @param {number} still Seconds standing still.
 * @returns {Pose}
 */
function heroPose(sim, t, still) {
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
  if (h.state === 'dead') {
    // Surprise first, then a cartoon flop.
    if (h.stateTime < 0.35)
      return {
        legL: 0.4,
        legR: -0.4,
        armL: 2.9,
        armR: 2.9,
        armSpread: 0.8,
        squash: -0.12,
        head: -0.3,
      };
    const k = Math.min(1, (h.stateTime - 0.35) / 0.4);
    return {
      legL: 1.2 * k,
      legR: 0.6 * k,
      armL: 2.4,
      armR: 1.8,
      lean: -1.1 * k,
      squash: 0.2 * k,
      bob: -6 * k,
    };
  }
  if (sim.won) {
    const k = t * 7;
    return {
      legL: 0,
      legR: 0,
      armL: 2.9 + Math.sin(k) * 0.15,
      armR: 2.9 - Math.sin(k) * 0.15,
      bob: Math.abs(Math.sin(k)) * 2,
      head: -0.2,
    };
  }
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
  // Skid: still sliding one way while facing the other.
  if (speed > 2 && Math.sign(h.vx) !== h.facing)
    return { legL: 0.7, legR: -0.5, armL: -1, armR: 1.2, lean: -0.35, squash: 0.06 };
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
  // Waiting around: a glance at the watch, then at the phone.
  if (still > 4) {
    const k = (still - 4) % 6;
    if (k < 2.5) return { ...idlePose(t), armL: 1.6, armSpread: -0.4, head: 0.35 };
    if (k > 3.5) return { ...idlePose(t), armR: 1.3, head: 0.3 };
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

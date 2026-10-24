import { CAST } from '../data/cast.js';
import { poseCharacter } from '../gfx/characters.js';
import { chain, rotationY, rotationZ, scaling, translation } from '../gfx/mat4.js';
import { blinkAt, idlePose } from './poses.js';

/**
 * How each moving thing of the simulation is drawn: pickups, traps, enemies,
 * boss attacks. The static diorama and the hero are drawn by LevelView itself.
 *
 * @typedef {import('../gfx/renderer.js').DrawItem} DrawItem
 * @typedef {import('../game/sim.js').Sim} Sim
 * @typedef {import('../game/sim.js').Thing} Thing
 * @typedef {import('../gfx/characters.js').Pose} Pose
 */

/**
 * @param {import('./scene.js').LevelView} view
 * @param {DrawItem[]} items
 * @param {Sim} sim
 * @param {Thing} th
 * @param {number} t Seconds, for idle animation.
 */
export function drawThing(view, items, sim, th, t) {
  const things = view.things;
  const P = view.props;
  /** @param {import('../gfx/renderer.js').Mesh} mesh @param {number} x @param {number} y @param {number} z @param {...Float32Array} extra */
  const at = (mesh, x, y, z, ...extra) =>
    items.push({ mesh, model: chain(translation(x, y, z), ...extra) });
  const partner = sim.heroId === 'kevin' ? 'charline' : 'kevin';
  switch (th.kind) {
    case 'ticket':
      at(things.ticket, th.x, th.y + Math.sin(t * 3 + th.x) * 0.08, 0, rotationY(t * 2.5 + th.x));
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
      at(view.keyMesh, th.x, th.y + Math.sin(t * 2.5) * 0.1, 0, rotationY(Math.sin(t * 1.5) * 0.6));
      break;
    case 'loose':
      // Hidden trapdoors look exactly like the floor until they shake.
      if (th.hidden && th.state !== 'gone' && th.state !== 'falling')
        at(
          view.theme === 'datacenter' ? view.hiddenFloor.dc : view.hiddenFloor.office,
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
      if (th.state !== 'burst') at(things.bottle, th.x, th.y + 0.31, 0, rotationZ(-th.x / 0.31));
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
        ...poseCharacter(view.cast[partner], th.x + 0.35, th.y, -0.4, -1, idlePose(t + 1), {
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
            mood: 'focus',
            blink: blinkAt(t + th.x),
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
          view.cast.mathis,
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
        mesh: view.props.lift,
        model: chain(
          translation(th.x + (th.w ?? 2) / 2, th.y - 0.25, -0.2),
          scaling(th.w ?? 2, 1, 1),
        ),
      });
      break;
    case 'kpi':
      at(view.props.kpi, th.x, th.y, 0.1, rotationZ(th.t * 9));
      break;
    case 'wave':
      at(
        view.props.wave,
        th.x,
        th.y,
        0,
        scaling(Math.sign(th.vx) || 1, 1 + Math.sin(th.t * 30) * 0.15, 1),
      );
      break;
    case 'boss':
      view.drawBoss(items, sim, th, t);
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
        items.push(view.glow(th.x, top - 0.2 - k, -0.3, 0.06, [0.5, 0.8, 1]));
      }
      break;
    }
    case 'printer':
      at(P.printer, th.x, th.y, -0.4, scaling(th.dir ?? 1, 1, 1));
      if (th.state === 'blink' && Math.floor(t * 12) % 2 === 0)
        items.push(view.glow(th.x + (th.dir ?? 1) * 0.35, th.y + 1.02, -0.1, 0.09, [1, 0.25, 0.2]));
      break;
    case 'beamer':
      at(P.monitor, th.x, th.y, -0.3, scaling(1.3, 1.3, 1.3));
      if (th.state === 'flicker' && Math.floor(t * 16) % 2 === 0)
        items.push(view.glow(th.x, th.y + 0.45, 0, 0.16, [1.4, 1.4, 1.8]));
      break;
    case 'paper':
      at(P.paper, th.x, th.y, 0, rotationZ(Math.sin(th.t * 20) * 0.25));
      break;
    case 'crate':
      at(P.archive, th.x + 0.5, th.y, -0.5, scaling(1, 1, 1.9));
      break;
    case 'cup':
      if (th.state !== 'gone')
        at(P.cup, th.x, th.y + Math.sin(t * 2.4 + th.x) * 0.06, 0, rotationY(Math.sin(t) * 0.6));
      break;
    case 'intern': {
      const stunned = th.state === 'stunned';
      const ph = t * 9;
      items.push(
        ...poseCharacter(
          view.cast.intern,
          th.x,
          th.y,
          -0.1,
          stunned ? 1 : Math.sign(th.vx) || 1,
          stunned
            ? { legL: 1.5, legR: 1.5, armL: 0.9, armR: 1.4, bob: -6, head: 0.2, mood: 'happy' }
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
          view.cast.visio,
          th.x - dir * 0.15,
          th.y,
          -0.5,
          dir,
          muted
            ? { legL: 0, legR: 0, armL: 0.1, armR: 0.1, head: 0.35, mood: 'ouch' }
            : th.state === 'ring'
              ? { legL: 0, legR: 0, armL: 0.4, armR: 2.6, head: -0.2 }
              : { ...idlePose(t), armR: 1.2 + Math.sin(t * 5) * 0.4 },
          { scale: CAST.visio.scale, rim: 0.3, turn: 0.7 },
        ),
      );
      at(P.laptopStand, th.x + dir * 0.35, th.y, -0.3);
      break;
    }
    case 'switch':
      items.push({
        mesh: th.state === 'on' ? things.readerOn : things.reader,
        model: translation(th.x, th.y + 0.9, -0.8),
        tint: [0.6, 0.85, 1.6],
      });
      break;
    case 'secret':
      // A faint glint gives the hiding place away to curious eyes.
      if (th.state === 'idle' && Math.sin(t * 2.3 + th.x) > 0.6)
        items.push(view.glow(th.x, th.y + 0.6 + Math.sin(t * 3) * 0.1, 0.3, 0.07, [1.4, 1.2, 0.5]));
      break;
    case 'invite':
      at(P.invite, th.x, th.y, 0, rotationZ(Math.sin(th.t * 12) * 0.2));
      break;
    case 'rack': {
      const floor = th.y0 ?? th.y;
      if (th.state === 'warn') {
        const k = Math.min(1, th.t / 0.9);
        at(P.shadow, th.x, floor + 0.02, 0, scaling(0.4 + k * 0.8, 1, 0.4 + k * 0.8));
        items.push(view.glow(th.x, floor + 0.05, 0.6, 0.12, [1, 0.5, 0.15]));
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

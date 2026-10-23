import { Volume, meshVolume, rgb, MAT } from './voxels.js';
import { Mesh } from './renderer.js';
import { chain, rotationX, rotationY, rotationZ, scaling, translation } from './mat4.js';

/**
 * Voxel characters built part by part (head, torso, arms, legs) so they can be
 * animated with simple joint rotations. One voxel = 1/16 of a tile; a hero is
 * about 28 voxels tall, with a slightly large head for readability on phones.
 *
 * @typedef {Object} Look
 * @property {string} skin
 * @property {string} hair
 * @property {'short'|'quiff'|'long'|'bun'|'curly'|'bald'|'bob'|'ponytail'} hairStyle
 * @property {string} jacket
 * @property {string} shirt
 * @property {string} legs Trousers or tights colour.
 * @property {string} shoes
 * @property {string} [tie]
 * @property {string} [skirt]
 * @property {boolean} [glasses]
 * @property {boolean} [beard]
 * @property {boolean} [earrings]
 * @property {string} [lips]
 * @property {string} [prop] Held item: 'tablet' | 'laptop' | 'mug' | 'folder'.
 */

export const VOXEL = 1 / 16;

/**
 * @typedef {Object} Part
 * @property {Mesh} mesh
 * @property {number[]} pivot Joint position in model space (world units).
 */

/** Builds a small volume and returns its mesh, offset so `pivot` is the origin. */
function part(gl, sx, sy, sz, paint, pivot) {
  const vol = new Volume(sx, sy, sz, VOXEL, [
    -pivot[0] * VOXEL,
    -pivot[1] * VOXEL,
    -pivot[2] * VOXEL,
  ]);
  paint(vol);
  return new Mesh(gl, meshVolume(vol));
}

/**
 * @param {WebGL2RenderingContext} gl
 * @param {Look} look
 * @returns {Record<string, Part>}
 */
export function buildCharacter(gl, look) {
  const skin = rgb(look.skin);
  const hair = rgb(look.hair);
  const jacket = rgb(look.jacket);
  const shirt = rgb(look.shirt);
  const legs = rgb(look.legs);
  const shoes = rgb(look.shoes);
  const dark = rgb('#1b1a24');
  const white = rgb('#fbfbf6');

  // Head: 10 wide, 10 tall, 9 deep; pivot at the bottom centre (neck).
  const head = part(
    gl,
    12,
    13,
    11,
    (v) => {
      v.box(1, 0, 1, 11, 10, 10, skin);
      const female = Boolean(look.lips);
      // Eyes: two tall dark pupils with a tiny catch-light on top.
      for (const ex of [3, 8]) {
        v.box(ex, 4, 10, ex + 1, 7, 11, dark);
        v.set(ex, 6, 10, rgb('#6b7ea8'));
      }
      if (female) {
        // Lashes flick outwards; arched brows.
        v.set(2, 7, 10, dark);
        v.set(9, 7, 10, dark);
        v.box(3, 8, 10, 5, 9, 11, hair);
        v.box(7, 8, 10, 9, 9, 11, hair);
      } else {
        v.box(2, 8, 10, 5, 9, 11, hair);
        v.box(7, 8, 10, 10, 9, 11, hair);
      }
      v.box(5, 3, 10, 7, 4, 11, rgb(shade(look.skin, -0.1)));
      if (female) {
        v.box(4, 1, 10, 8, 2, 11, rgb(/** @type {string} */ (look.lips)));
        v.box(5, 2, 10, 7, 3, 11, rgb(shade(/** @type {string} */ (look.lips), 0.25)));
      } else v.box(4, 1, 10, 8, 2, 11, rgb('#a2614f'));
      v.box(1, 2, 10, 3, 3, 11, rgb('#f2a39a'));
      v.box(9, 2, 10, 11, 3, 11, rgb('#f2a39a'));
      if (look.beard) {
        v.box(1, 0, 6, 11, 3, 10, hair);
        v.box(2, 0, 9, 10, 3, 11, hair);
        v.box(4, 1, 10, 8, 2, 11, rgb('#8a4a3a'));
      }
      if (look.glasses) {
        // Thin frames around each eye and a bridge; lenses stay transparent-looking.
        for (const ex of [1, 7]) {
          v.box(ex, 3, 10, ex + 4, 4, 11, dark);
          v.box(ex, 7, 10, ex + 4, 8, 11, dark);
          v.box(ex, 3, 10, ex + 1, 8, 11, dark);
          v.box(ex + 3, 3, 10, ex + 4, 8, 11, dark);
        }
        v.box(5, 6, 10, 7, 7, 11, dark);
        v.box(1, 6, 4, 2, 7, 10, dark);
        v.box(10, 6, 4, 11, 7, 10, dark);
      }
      if (look.earrings) {
        v.box(0, 1, 5, 1, 3, 6, rgb('#ffd166'), MAT.GLOSSY);
        v.box(11, 1, 5, 12, 3, 6, rgb('#ffd166'), MAT.GLOSSY);
      }
      // Hair.
      const s = look.hairStyle;
      if (s !== 'bald') {
        v.box(0, 9, 0, 12, 12, 11, hair);
        v.box(0, 3, 0, 12, 12, 2, hair);
        v.box(0, 6, 0, 1, 12, 9, hair);
        v.box(11, 6, 0, 12, 12, 9, hair);
      } else {
        v.box(0, 5, 2, 1, 8, 7, hair);
        v.box(11, 5, 2, 12, 8, 7, hair);
      }
      if (s === 'quiff') v.box(2, 11, 4, 10, 13, 11, hair);
      if (s === 'curly') {
        for (let x = 0; x < 12; x += 2) v.box(x, 12, 1, x + 2, 13, 10, hair);
        v.box(0, 7, 0, 12, 13, 2, hair);
      }
      if (s === 'bob' || s === 'long') {
        v.box(0, 2, 0, 2, 12, 8, hair);
        v.box(10, 2, 0, 12, 12, 8, hair);
        v.box(1, 9, 9, 7, 11, 11, hair); // side-swept fringe
        v.box(7, 10, 9, 11, 11, 11, hair);
      }
      if (s === 'quiff') v.box(1, 10, 9, 11, 11, 11, hair);
      if (s === 'bun') v.box(4, 11, 2, 8, 13, 6, hair);
      if (s === 'ponytail') v.box(4, 6, 0, 8, 11, 1, hair);
    },
    [6, 0, 5.5],
  );

  // Long hair: a back curtain plus two strands falling over the shoulders (torso frame).
  const longHair =
    look.hairStyle === 'long'
      ? part(
          gl,
          14,
          12,
          12,
          (v) => {
            v.box(1, 0, 0, 13, 12, 3, hair);
            v.box(0, 2, 0, 2, 12, 9, hair);
            v.box(12, 2, 0, 14, 12, 9, hair);
            v.box(0, 0, 3, 2, 3, 7, hair);
            v.box(12, 0, 3, 14, 3, 7, hair);
            // A few lighter streaks.
            v.box(4, 2, 0, 5, 11, 1, rgb(shade(look.hair, 0.18)));
            v.box(9, 4, 0, 10, 12, 1, rgb(shade(look.hair, 0.18)));
          },
          [7, 12, 6],
        )
      : look.hairStyle === 'ponytail'
        ? part(gl, 4, 9, 3, (v) => v.box(0, 0, 0, 4, 9, 3, hair), [2, 9, 1.5])
        : null;

  // Torso: jacket with an open front showing the shirt (and tie).
  const torso = part(
    gl,
    10,
    11,
    6,
    (v) => {
      v.box(0, 0, 0, 10, 11, 6, jacket);
      v.box(3, 3, 5, 7, 11, 6, shirt);
      if (look.tie) v.box(4, 2, 5, 6, 10, 6, rgb(look.tie), MAT.GLOSSY);
      v.box(4, 10, 5, 6, 11, 6, shirt);
      // Lapels.
      v.set(2, 9, 5, rgb(shade(look.jacket, -0.25)));
      v.set(7, 9, 5, rgb(shade(look.jacket, -0.25)));
      // Neck.
      v.box(4, 11, 2, 6, 11, 4, skin);
      if (!look.skirt) v.box(0, 0, 0, 10, 1, 6, dark);
    },
    [5, 0, 3],
  );
  const neck = part(gl, 4, 2, 4, (v) => v.box(0, 0, 0, 4, 2, 4, skin), [2, 0, 2]);

  const arm = part(
    gl,
    3,
    10,
    3,
    (v) => {
      v.box(0, 2, 0, 3, 10, 3, jacket);
      v.box(0, 1, 0, 3, 2, 3, shirt);
      v.box(0, 0, 0, 3, 1, 3, skin);
    },
    [1.5, 10, 1.5],
  );

  const leg = part(
    gl,
    4,
    11,
    5,
    (v) => {
      if (look.skirt) {
        // Slim legs in tights, court shoes with a heel at the back.
        v.box(1, 2, 1, 3, 11, 4, legs);
        v.box(1, 1, 1, 3, 2, 5, shoes, MAT.GLOSSY);
        v.box(1, 0, 3, 3, 1, 5, shoes, MAT.GLOSSY);
        v.box(1, 0, 0, 3, 1, 1, shoes);
      } else {
        v.box(0, 2, 0, 4, 11, 5, legs);
        v.box(0, 0, 0, 4, 2, 5, shoes, MAT.GLOSSY);
      }
    },
    [2, 11, 2.5],
  );
  const skirt = look.skirt
    ? part(
        gl,
        12,
        6,
        8,
        (v) => {
          v.box(1, 3, 1, 11, 6, 7, rgb(/** @type {string} */ (look.skirt)));
          v.box(0, 0, 0, 12, 3, 8, rgb(/** @type {string} */ (look.skirt)));
          v.box(0, 0, 0, 12, 1, 8, rgb(shade(/** @type {string} */ (look.skirt), -0.2)));
        },
        [6, 6, 4],
      )
    : null;

  /** @type {Mesh | null} */
  let prop = null;
  if (look.prop === 'tablet')
    prop = part(
      gl,
      6,
      8,
      1,
      (v) => {
        v.box(0, 0, 0, 6, 8, 1, dark);
        v.box(1, 1, 0, 5, 7, 1, rgb('#4cc9f0'), MAT.EMISSIVE);
      },
      [3, 8, 0],
    );
  else if (look.prop === 'laptop')
    prop = part(
      gl,
      8,
      1,
      6,
      (v) => {
        v.box(0, 0, 0, 8, 1, 6, rgb('#9aa3ad'), MAT.GLOSSY);
      },
      [4, 1, 3],
    );
  else if (look.prop === 'folder')
    prop = part(
      gl,
      6,
      8,
      1,
      (v) => {
        v.box(0, 0, 0, 6, 8, 1, rgb('#ffd166'));
        v.box(1, 2, 0, 5, 3, 1, white);
      },
      [3, 8, 0],
    );
  else if (look.prop === 'mug')
    prop = part(
      gl,
      3,
      3,
      3,
      (v) => {
        v.box(0, 0, 0, 3, 3, 3, white);
        v.box(1, 2, 1, 2, 3, 2, rgb('#6b3e26'));
      },
      [1.5, 0, 1.5],
    );

  /** @type {Record<string, Part>} */
  const parts = {
    head: { mesh: head, pivot: [0, 23, 0] },
    neck: { mesh: neck, pivot: [0, 22, 0] },
    torso: { mesh: torso, pivot: [0, 11, 0] },
    armL: { mesh: arm, pivot: [-6.5, 21, 0] },
    armR: { mesh: arm, pivot: [6.5, 21, 0] },
    legL: { mesh: leg, pivot: [-2.5, 11, 0] },
    legR: { mesh: leg, pivot: [2.5, 11, 0] },
  };
  if (longHair) parts.hair = { mesh: longHair, pivot: [0, 0, 0] };
  if (prop) parts.prop = { mesh: prop, pivot: [0, 0, 0] };
  if (skirt) parts.skirt = { mesh: skirt, pivot: [0, 0, 0] };
  return parts;
}

/**
 * @param {string} hex
 * @param {number} amount -1..1
 */
function shade(hex, amount) {
  const n = parseInt(hex.slice(1), 16);
  const f = (c) =>
    Math.max(0, Math.min(255, Math.round(c + (amount < 0 ? c * amount : (255 - c) * amount))));
  return (
    '#' +
    [f(n >> 16), f((n >> 8) & 255), f(n & 255)].map((c) => c.toString(16).padStart(2, '0')).join('')
  );
}

/**
 * @typedef {Object} Pose
 * @property {number} legL Swing angle (radians, + = forward).
 * @property {number} legR
 * @property {number} armL
 * @property {number} armR
 * @property {number} [armSpread] Sideways raise of both arms.
 * @property {number} [lean] Torso lean forward.
 * @property {number} [bob] Vertical body offset (voxels).
 * @property {number} [head] Head nod.
 * @property {number} [squash] Vertical squash (−0.2..0.2).
 */

/**
 * Turns a posed character into draw items.
 * @param {Record<string, Part>} parts
 * @param {number} x Feet position (world).
 * @param {number} y
 * @param {number} z
 * @param {number} facing 1 = right, −1 = left.
 * @param {Pose} pose
 * @param {{scale?: number, turn?: number, rim?: number, tint?: number[]}} [o]
 * @returns {import('./renderer.js').DrawItem[]}
 */
export function poseCharacter(parts, x, y, z, facing, pose, o = {}) {
  const scale = o.scale ?? 1;
  // Three-quarter turn: the face stays visible to the camera while walking sideways.
  const yaw = facing * (o.turn ?? 1.05);
  const sq = pose.squash ?? 0;
  const root = chain(
    translation(x, y, z),
    rotationY(yaw),
    scaling(scale * (1 + sq * 0.5), scale * (1 - sq), scale * (1 + sq * 0.5)),
    translation(0, (pose.bob ?? 0) * VOXEL, 0),
  );
  const lean = rotationX(pose.lean ?? 0);
  const v = (p) => translation(p[0] * VOXEL, p[1] * VOXEL, p[2] * VOXEL);
  const base = { rim: o.rim ?? 0.35, tint: o.tint };
  const at = (name, ...ms) => ({ mesh: parts[name].mesh, model: chain(root, ...ms), ...base });
  const hip = [0, 11, 0];
  const torsoM = [v(hip), lean];
  /** @type {import('./renderer.js').DrawItem[]} */
  const items = [
    at('legL', v(parts.legL.pivot), rotationX(-pose.legL)),
    at('legR', v(parts.legR.pivot), rotationX(-pose.legR)),
    at('torso', ...torsoM),
    at('neck', ...torsoM, v([0, 11, 0])),
    at('head', ...torsoM, v([0, 12, 0]), rotationX(pose.head ?? 0)),
    at(
      'armL',
      ...torsoM,
      v([-6.5, 10, 0]),
      rotationZ(-(pose.armSpread ?? 0)),
      rotationX(-pose.armL),
    ),
    at('armR', ...torsoM, v([6.5, 10, 0]), rotationZ(pose.armSpread ?? 0), rotationX(-pose.armR)),
  ];
  if (parts.hair)
    items.push(at('hair', ...torsoM, v([0, 21, -1.5]), rotationX(0.06 + (pose.lean ?? 0) * -0.4)));
  if (parts.skirt) items.push(at('skirt', v(hip), v([0, 1, 0]), lean));
  if (parts.prop)
    items.push(at('prop', ...torsoM, v([6.5, 10, 0]), rotationX(-pose.armR), v([0, -10, 2.5])));
  return items;
}

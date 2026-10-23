import { MeshBuilder } from './geometry.js';
import { chain, rotationX, rotationY, rotationZ, scaling, translation } from './mat4.js';
import { Mesh } from './renderer.js';
import { MAT } from './voxels.js';

/**
 * Smooth "designer toy" characters built from rounded primitives, split into
 * parts so they can be animated with joint rotations. Units are tiles; a hero
 * stands about 1.75 tiles tall, with a large head for readability on phones.
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
 * @property {string} [eyes]
 * @property {string} [prop] Held item: 'tablet' | 'laptop' | 'phone' | 'mug' | 'folder'.
 *
 * @typedef {{mesh: Mesh}} Part
 */

// Joint positions (model space, feet at y = 0, facing +z).
const HIP_Y = 0.62;
const HIP_X = 0.1;
const SHOULDER_Y = 0.48; // above the hip
const SHOULDER_X = 0.235;
const NECK_Y = 0.52;

/**
 * @param {string} hex
 * @param {number} amount -1..1
 */
export function shade(hex, amount) {
  const n = parseInt(hex.slice(1), 16);
  /** @param {number} c */
  const f = (c) =>
    Math.max(0, Math.min(255, Math.round(c + (amount < 0 ? c * amount : (255 - c) * amount))));
  return (
    '#' +
    [f(n >> 16), f((n >> 8) & 255), f(n & 255)].map((c) => c.toString(16).padStart(2, '0')).join('')
  );
}

/**
 * @param {WebGL2RenderingContext} gl
 * @param {(b: MeshBuilder) => void} draw
 * @returns {Part}
 */
const part = (gl, draw) => {
  const b = new MeshBuilder();
  draw(b);
  return { mesh: new Mesh(gl, b.build()) };
};

/**
 * @param {WebGL2RenderingContext} gl
 * @param {Look} look
 * @returns {Record<string, Part>}
 */
export function buildCharacter(gl, look) {
  const female = Boolean(look.lips);
  const dark = '#1d1a24';
  const gloss = MAT.GLOSSY;

  // Head: origin at the neck joint.
  const head = part(gl, (b) => {
    b.ellipsoid([0, 0.25, 0], [0.205, 0.215, 0.19], look.skin, { seg: 16 });
    b.ellipsoid([-0.2, 0.24, -0.01], [0.035, 0.05, 0.03], look.skin);
    b.ellipsoid([0.2, 0.24, -0.01], [0.035, 0.05, 0.03], look.skin);
    for (const s of [-1, 1]) {
      // Eyes: dark ovals with a catch-light.
      b.ellipsoid(
        [s * 0.072, 0.27, 0.172],
        [0.028, female ? 0.038 : 0.034, 0.02],
        look.eyes ?? '#2a2236',
        { seg: 8 },
      );
      b.ellipsoid([s * 0.064 + 0.006, 0.284, 0.188], [0.009, 0.009, 0.006], '#ffffff', {
        seg: 6,
        mat: MAT.EMISSIVE,
      });
      // Brows, lashes for female characters.
      b.roundedBox(
        [s * 0.075, 0.335, 0.166],
        [0.038, female ? 0.007 : 0.011, 0.012],
        0.007,
        female ? dark : look.hair,
      );
      if (female) b.roundedBox([s * 0.105, 0.302, 0.162], [0.014, 0.006, 0.01], 0.005, dark);
      b.ellipsoid([s * 0.12, 0.2, 0.15], [0.035, 0.022, 0.02], '#f19a92', { seg: 6 });
    }
    b.ellipsoid([0, 0.225, 0.19], [0.022, 0.028, 0.02], shade(look.skin, -0.08), { seg: 6 });
    if (female)
      b.ellipsoid([0, 0.155, 0.168], [0.05, 0.016, 0.02], /** @type {string} */ (look.lips), {
        seg: 8,
        mat: gloss,
      });
    else b.roundedBox([0, 0.158, 0.172], [0.04, 0.008, 0.01], 0.006, '#8c4a3c');
    if (look.beard)
      b.ellipsoid([0, 0.13, 0.08], [0.17, 0.11, 0.12], look.hair, { from: 0, to: 0.62 });
    if (look.glasses) {
      for (const s of [-1, 1])
        b.lathe(
          [s * 0.075, 0.268, 0.178],
          [
            [0.045, -0.006],
            [0.045, 0.006],
          ],
          dark,
          { seg: 18 },
        );
      b.roundedBox([0, 0.275, 0.182], [0.03, 0.005, 0.005], 0.004, dark);
    }
    if (look.earrings)
      for (const s of [-1, 1])
        b.ellipsoid([s * 0.2, 0.17, 0], [0.018, 0.018, 0.018], '#ffd166', { mat: gloss });
    const s = look.hairStyle;
    if (s !== 'bald') {
      // Hair cap: slightly larger shells over the top and back of the skull.
      b.ellipsoid([0, 0.29, -0.025], [0.222, 0.2, 0.2], look.hair, {
        from: 0.42,
        to: 1,
        mat: gloss,
      });
      b.ellipsoid([0, 0.25, -0.05], [0.215, 0.2, 0.17], look.hair, {
        from: 0.15,
        to: 0.6,
        mat: gloss,
      });
    }
    if (s === 'quiff') {
      b.ellipsoid([0.03, 0.47, 0.08], [0.15, 0.07, 0.11], look.hair, { mat: gloss });
      b.ellipsoid([-0.06, 0.44, 0.13], [0.1, 0.05, 0.07], look.hair, { mat: gloss });
    }
    if (s === 'short') b.ellipsoid([0, 0.44, 0.06], [0.17, 0.05, 0.13], look.hair, { mat: gloss });
    if (s === 'curly')
      for (let i = 0; i < 9; i++) {
        const a = (i / 9) * Math.PI * 2;
        b.ellipsoid(
          [Math.sin(a) * 0.15, 0.42 + Math.cos(a * 2) * 0.02, Math.cos(a) * 0.13 - 0.02],
          [0.08, 0.07, 0.08],
          look.hair,
        );
      }
    if (s === 'long' || s === 'bob') {
      // Side-swept fringe and locks framing the face.
      b.ellipsoid([-0.06, 0.42, 0.13], [0.17, 0.07, 0.08], look.hair, { mat: gloss });
      for (const side of [-1, 1]) {
        b.roundedBox(
          [side * 0.2, 0.22, 0.02],
          [0.05, s === 'long' ? 0.17 : 0.12, 0.12],
          0.05,
          look.hair,
          { mat: gloss },
        );
        if (s === 'long')
          b.ellipsoid([side * 0.19, 0.06, -0.02], [0.07, 0.09, 0.1], look.hair, { mat: gloss });
      }
    }
    if (s === 'bun') b.ellipsoid([0, 0.5, -0.08], [0.09, 0.08, 0.09], look.hair, { mat: gloss });
  });

  // Long hair down the back, as its own part so it sways with the body.
  const longHair =
    look.hairStyle === 'long'
      ? part(gl, (b) => {
          b.roundedBox([0, -0.12, 0], [0.2, 0.2, 0.07], 0.07, look.hair, { mat: gloss });
          b.roundedBox([0, -0.31, 0.01], [0.16, 0.06, 0.05], 0.05, look.hair, { mat: gloss });
        })
      : look.hairStyle === 'ponytail'
        ? part(gl, (b) => b.roundedBox([0, -0.12, 0], [0.05, 0.16, 0.05], 0.05, look.hair))
        : null;

  // Torso: origin at the hip; jacket open over the shirt.
  const torso = part(gl, (b) => {
    // Chest wider than the waist, generously rounded.
    b.roundedBox([0, 0.34, 0], [0.215, 0.17, 0.13], 0.12, look.jacket);
    b.roundedBox([0, 0.16, 0], [0.18, 0.15, 0.115], 0.1, look.jacket);
    b.roundedBox([0, 0.37, 0.12], [0.07, 0.14, 0.04], 0.035, look.shirt);
    for (const s of [-1, 1])
      b.roundedBox([s * 0.08, 0.38, 0.14], [0.025, 0.11, 0.02], 0.018, shade(look.jacket, -0.18));
    if (look.tie) {
      b.roundedBox([0, 0.33, 0.16], [0.03, 0.12, 0.012], 0.012, look.tie, { mat: gloss });
      b.roundedBox([0, 0.47, 0.158], [0.034, 0.025, 0.014], 0.012, look.tie);
    }
    if (!look.skirt) b.roundedBox([0, 0.035, 0], [0.19, 0.035, 0.11], 0.03, look.legs);
    b.roundedBox([0, 0.52, 0], [0.055, 0.05, 0.05], 0.045, look.skin);
    for (const y of [0.18, 0.1])
      b.ellipsoid([0.06, y, 0.125], [0.014, 0.014, 0.008], shade(look.jacket, -0.35));
  });

  const skirt = look.skirt
    ? part(gl, (b) =>
        b.lathe(
          [0, 0, 0],
          [
            [0.2, 0.05],
            [0.2, 0],
            [0.24, -0.2],
            [0.25, -0.24],
          ],
          /** @type {string} */ (look.skirt),
          {
            seg: 24,
            scaleZ: 0.68,
          },
        ),
      )
    : null;

  // Arm: origin at the shoulder, hanging down.
  const arm = part(gl, (b) => {
    b.roundedBox([0, -0.17, 0], [0.058, 0.2, 0.06], 0.056, look.jacket);
    b.roundedBox([0, -0.37, 0], [0.05, 0.025, 0.052], 0.024, look.shirt);
    b.ellipsoid([0, -0.42, 0.005], [0.048, 0.055, 0.05], look.skin);
  });

  // Leg: origin at the hip joint; court shoes with a heel under a skirt.
  const leg = part(gl, (b) => {
    if (look.skirt) {
      b.roundedBox([0, -0.3, 0], [0.05, 0.28, 0.05], 0.05, look.legs);
      b.roundedBox([0, -0.585, 0.035], [0.05, 0.03, 0.09], 0.03, look.shoes, { mat: gloss });
      b.roundedBox([0, -0.6, -0.04], [0.02, 0.025, 0.02], 0.015, look.shoes);
    } else {
      b.roundedBox([0, -0.28, 0], [0.075, 0.29, 0.08], 0.07, look.legs);
      b.roundedBox([0, -0.585, 0.04], [0.075, 0.04, 0.115], 0.04, look.shoes, { mat: gloss });
    }
  });

  /** @type {Part | null} */
  let prop = null;
  if (look.prop === 'phone')
    prop = part(gl, (b) => {
      b.roundedBox([0, 0, 0], [0.035, 0.07, 0.008], 0.008, dark, { mat: gloss });
      b.roundedBox([0, 0, 0.007], [0.028, 0.06, 0.002], 0.002, '#58d5ff', { mat: MAT.EMISSIVE });
    });
  else if (look.prop === 'tablet')
    prop = part(gl, (b) => {
      b.roundedBox([0, 0, 0], [0.12, 0.16, 0.012], 0.012, dark);
      b.roundedBox([0, 0, 0.011], [0.1, 0.14, 0.002], 0.002, '#4cc9f0', { mat: MAT.EMISSIVE });
    });
  else if (look.prop === 'folder')
    prop = part(gl, (b) => b.roundedBox([0, 0, 0], [0.11, 0.15, 0.015], 0.01, '#ffd166'));
  else if (look.prop === 'mug')
    prop = part(gl, (b) =>
      b.lathe(
        [0, 0, 0],
        [
          [0.04, 0],
          [0.045, 0.1],
        ],
        '#ffffff',
      ),
    );

  /** @type {Record<string, Part>} */
  const parts = { head, torso, armL: arm, armR: arm, legL: leg, legR: leg };
  if (longHair) parts.hair = longHair;
  if (skirt) parts.skirt = skirt;
  if (prop) parts.prop = prop;
  return parts;
}

/**
 * @typedef {Object} Pose
 * @property {number} legL Swing angle (radians, + = forward).
 * @property {number} legR
 * @property {number} armL
 * @property {number} armR
 * @property {number} [armSpread] Sideways raise of both arms.
 * @property {number} [lean] Torso lean forward.
 * @property {number} [bob] Vertical body offset (1/16 tile).
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
  // Three-quarter turn: the face stays visible while running sideways.
  const yaw = facing * (o.turn ?? 1.05);
  const sq = pose.squash ?? 0;
  const root = chain(
    translation(x, y, z),
    rotationY(yaw),
    scaling(scale * (1 + sq * 0.5), scale * (1 - sq), scale * (1 + sq * 0.5)),
    translation(0, (pose.bob ?? 0) / 16, 0),
  );
  const base = { rim: o.rim ?? 0.35, tint: o.tint };
  /** @param {string} name @param {...Float32Array} ms */
  const at = (name, ...ms) => ({ mesh: parts[name].mesh, model: chain(root, ...ms), ...base });
  const torso = [translation(0, HIP_Y, 0), rotationX(pose.lean ?? 0)];
  const spread = pose.armSpread ?? 0;
  /** @type {import('./renderer.js').DrawItem[]} */
  const items = [
    at('legL', translation(-HIP_X, HIP_Y, 0), rotationX(-pose.legL)),
    at('legR', translation(HIP_X, HIP_Y, 0), rotationX(-pose.legR)),
    at('torso', ...torso),
    at('head', ...torso, translation(0, NECK_Y, 0), rotationX(pose.head ?? 0)),
    at(
      'armL',
      ...torso,
      translation(-SHOULDER_X, SHOULDER_Y, 0),
      rotationZ(-spread),
      rotationX(-pose.armL),
    ),
    at(
      'armR',
      ...torso,
      translation(SHOULDER_X, SHOULDER_Y, 0),
      rotationZ(spread),
      rotationX(-pose.armR),
    ),
  ];
  if (parts.hair)
    items.push(
      at(
        'hair',
        ...torso,
        translation(0, NECK_Y + 0.28, -0.1),
        rotationX(0.08 - (pose.lean ?? 0) * 0.5),
      ),
    );
  if (parts.skirt) items.push(at('skirt', ...torso, translation(0, 0.06, 0)));
  if (parts.prop)
    items.push(
      at(
        'prop',
        ...torso,
        translation(SHOULDER_X, SHOULDER_Y, 0),
        rotationZ(spread),
        rotationX(-pose.armR),
        translation(0, -0.43, 0.06),
      ),
    );
  return items;
}

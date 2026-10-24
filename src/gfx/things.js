import { MeshBuilder } from './geometry.js';
import { Mesh } from './renderer.js';
import { MAT, rgb } from './voxels.js';

/**
 * Smooth "designer toy" models for everything that moves or changes state.
 * Units are tiles. Each model is centred on x/z with its origin at the bottom
 * (y = 0), except the floating pickups (ticket, key, badge, envelope, cr, ammo,
 * bottle), which are centred, and `loose`, whose origin is its top face.
 * Fronts face +z, towards the camera.
 */

const { MATTE, EMISSIVE, GLOSSY } = MAT;

const PINK = '#ff4f9a';
const LIME = '#c6f432';
const NAVY = '#27408b';
const PAPER = '#fbfbf6';
const INK = '#5a6b8c';
const ALU = '#c3cad3';
const GRAPHITE = '#2a2f3a';

/** @param {number} a @returns {number[]} */
const rotX = (a) => {
  const c = Math.cos(a),
    s = Math.sin(a);
  return [1, 0, 0, 0, c, -s, 0, s, c];
};
/** @param {number} a @returns {number[]} */
const rotY = (a) => {
  const c = Math.cos(a),
    s = Math.sin(a);
  return [c, 0, s, 0, 1, 0, -s, 0, c];
};
/** @param {number} a @returns {number[]} */
const rotZ = (a) => {
  const c = Math.cos(a),
    s = Math.sin(a);
  return [c, -s, 0, s, c, 0, 0, 0, 1];
};

/**
 * Rotates then translates every vertex added since `start`.
 * @param {MeshBuilder} b @param {number} start @param {number[]} m @param {number[]} [t]
 */
function place(b, start, m, t = [0, 0, 0]) {
  const P = b.pos,
    N = b.nrm;
  for (let i = start * 3; i < P.length; i += 3) {
    const x = P[i],
      y = P[i + 1],
      z = P[i + 2];
    P[i] = m[0] * x + m[1] * y + m[2] * z + t[0];
    P[i + 1] = m[3] * x + m[4] * y + m[5] * z + t[1];
    P[i + 2] = m[6] * x + m[7] * y + m[8] * z + t[2];
    const a = N[i],
      c = N[i + 1],
      d = N[i + 2];
    N[i] = m[0] * a + m[1] * c + m[2] * d;
    N[i + 1] = m[3] * a + m[4] * c + m[5] * d;
    N[i + 2] = m[6] * a + m[7] * c + m[8] * d;
  }
}

/**
 * Builds a part at the origin, then rotates it and moves it to `t`.
 * @param {MeshBuilder} b @param {number[]} m @param {number[]} t @param {() => void} part
 */
function posed(b, m, t, part) {
  const s = b.mat.length;
  part();
  place(b, s, m, t);
}

/**
 * Rounded box with fewer segments by default: these models are small on screen.
 * @param {MeshBuilder} b @param {number[]} c @param {number[]} h @param {number} r
 * @param {string} color @param {number} [mat] @param {number} [seg]
 */
function rb(b, c, h, r, color, mat = MATTE, seg = 4) {
  b.roundedBox(c, h, r, color, { mat, seg });
}

/**
 * Sharp-edged box (12 triangles) for decals: lines, LEDs, slots.
 * @param {MeshBuilder} b @param {number[]} c @param {number[]} h @param {string} color
 * @param {number} [mat]
 */
function flatBox(b, c, h, color, mat = MATTE) {
  const col = rgb(color);
  for (let axis = 0; axis < 3; axis++)
    for (const s of [-1, 1]) {
      const a1 = (axis + 1) % 3,
        a2 = (axis + 2) % 3;
      b.grid(
        1,
        1,
        (u, v) => {
          const p = [0, 0, 0];
          p[axis] = s * h[axis];
          p[a1] = (u * 2 - 1) * h[a1];
          p[a2] = (v * 2 - 1) * h[a2];
          const n = [0, 0, 0];
          n[axis] = s;
          return { p: p.map((x, i) => x + c[i]), n };
        },
        col,
        mat,
      );
    }
}

/**
 * Disc (short capped cylinder) facing +z, centred on `c`.
 * @param {MeshBuilder} b @param {number[]} c @param {number} r @param {number} depth
 * @param {string} color @param {number} [mat] @param {number} [seg]
 */
function disc(b, c, r, depth, color, mat = MATTE, seg = 18) {
  posed(b, rotX(Math.PI / 2), c, () =>
    b.lathe(
      [0, -depth / 2, 0],
      [
        [0, 0],
        [r, 0],
        [r, depth * 0.7],
        [r * 0.85, depth],
        [0, depth],
      ],
      color,
      { mat, seg },
    ),
  );
}

/**
 * Flat triangle facing +z (or -z when `back`), for envelope flaps and dog-ears.
 * @param {MeshBuilder} b @param {number[][]} tri Three [x, y] corners.
 * @param {number} z @param {string} color @param {number} [mat] @param {boolean} [back]
 */
function tri(b, tri, z, color, mat = MATTE, back = false) {
  const [p0, p1, p2] = back ? [tri[1], tri[0], tri[2]] : tri;
  b.grid(
    1,
    1,
    (u, v) => {
      const x = (p0[0] + (p1[0] - p0[0]) * u) * (1 - v) + p2[0] * v;
      const y = (p0[1] + (p1[1] - p0[1]) * u) * (1 - v) + p2[1] * v;
      return { p: [x, y, z], n: [0, 0, back ? -1 : 1] };
    },
    rgb(color),
    mat,
  );
}

/** Swile meal ticket: glossy pink card, white logo strip, same on both faces (it spins). */
function ticket() {
  const b = new MeshBuilder();
  rb(b, [0, 0, 0], [0.24, 0.33, 0.045], 0.04, PINK, GLOSSY, 5);
  for (const s of [1, -1]) {
    const z = s * 0.047;
    rb(b, [0, 0.13, z], [0.2, 0.075, 0.008], 0.008, '#ffffff', MATTE, 2);
    // The logo: a little pink "S" swoosh made of two dots and a bar.
    rb(b, [-0.1, 0.13, z + s * 0.011], [0.03, 0.03, 0.005], 0.005, PINK, MATTE, 2);
    rb(b, [0.04, 0.13, z + s * 0.011], [0.09, 0.016, 0.005], 0.005, '#ff8cbc', MATTE, 2);
    rb(b, [-0.1, -0.13, z], [0.065, 0.05, 0.008], 0.012, '#ffd1e6', GLOSSY, 2);
    rb(b, [0.11, -0.23, z], [0.07, 0.016, 0.006], 0.006, '#ffd1e6', MATTE, 2);
  }
  return b;
}

/**
 * Five-pointed star facing +z (or -z when `back`), centred on [x, y].
 * @param {MeshBuilder} b @param {number} x @param {number} y @param {number} z @param {number} r
 * @param {string} color @param {number} [mat] @param {boolean} [back]
 */
function star(b, x, y, z, r, color, mat = MATTE, back = false) {
  for (let i = 0; i < 5; i++) {
    const a0 = (i / 5) * Math.PI * 2,
      a1 = a0 + Math.PI / 5,
      a2 = a0 + (Math.PI * 2) / 5;
    const o0 = [x + Math.sin(a0) * r, y + Math.cos(a0) * r];
    const n1 = [x + Math.sin(a1) * r * 0.45, y + Math.cos(a1) * r * 0.45];
    const o2 = [x + Math.sin(a2) * r, y + Math.cos(a2) * r];
    tri(b, [o0, n1, [x, y]], z, color, mat, back);
    tri(b, [n1, o2, [x, y]], z, color, mat, back);
  }
}

/**
 * Céline Dion concert tickets: two gold tickets fanned out, each with a tear-off
 * stub, a pink star and a music note, the same on both faces (they spin).
 */
function concertTickets() {
  const b = new MeshBuilder();
  const GOLD = '#ffc63a';
  for (const [a, dx, dy, dz] of [
    [0.32, -0.05, 0.05, -0.03],
    [-0.14, 0.05, -0.04, 0.03],
  ])
    posed(b, rotZ(a), [dx, dy, dz], () => {
      rb(b, [-0.05, 0, 0], [0.2, 0.12, 0.018], 0.022, GOLD, GLOSSY, 4);
      rb(b, [0.2, 0, 0], [0.052, 0.12, 0.018], 0.02, '#ffe08a', GLOSSY, 3);
      for (const s of [1, -1]) {
        const z = s * 0.02;
        // Perforation between ticket and stub.
        for (let i = 0; i < 5; i++)
          flatBox(b, [0.145, -0.09 + i * 0.045, z], [0.005, 0.01, 0.002], '#b8750f');
        for (const y of [0.095, -0.095]) flatBox(b, [-0.05, y, z], [0.17, 0.005, 0.002], '#d08a16');
        star(b, -0.14, 0, z + s * 0.002, 0.058, PINK, EMISSIVE, s < 0);
        flatBox(b, [0.02, 0.035, z], [0.075, 0.014, 0.002], NAVY);
        flatBox(b, [0.005, -0.008, z], [0.06, 0.008, 0.002], '#a5650d');
        flatBox(b, [0.015, -0.045, z], [0.07, 0.008, 0.002], '#a5650d');
        // Music note on the stub.
        b.ellipsoid([0.19, -0.04, z], [0.02, 0.016, 0.005], NAVY, { seg: 6 });
        flatBox(b, [0.207, 0.0, z], [0.005, 0.042, 0.002], NAVY);
        flatBox(b, [0.222, 0.036, z], [0.016, 0.007, 0.002], NAVY);
      }
    });
  return b;
}

/** Signed purchase order: yellow folder, paper with typed lines and a green stamp. */
function purchaseOrder() {
  const b = new MeshBuilder();
  // Back cover and tab.
  rb(b, [0, -0.02, -0.04], [0.31, 0.38, 0.018], 0.018, '#ffc94d', MATTE, 4);
  rb(b, [-0.16, 0.37, -0.04], [0.11, 0.035, 0.016], 0.016, '#ffc94d', MATTE, 3);
  // The sheet, slightly askew.
  posed(b, rotZ(0.04), [0.01, 0.0, -0.01], () => {
    rb(b, [0, 0, 0], [0.26, 0.35, 0.01], 0.008, '#fffdf4', MATTE, 3);
    flatBox(b, [-0.06, 0.27, 0.014], [0.14, 0.022, 0.002], NAVY);
    for (let i = 0; i < 5; i++)
      flatBox(
        b,
        [-0.02 + (i % 2) * -0.03, 0.17 - i * 0.07, 0.014],
        [0.19 - (i % 2) * 0.04, 0.012, 0.002],
        '#9aa3ad',
      );
    // Signature squiggle.
    for (let i = 0; i < 4; i++)
      posed(b, rotZ(i % 2 ? -0.7 : 0.7), [-0.17 + i * 0.045, -0.2, 0.015], () =>
        flatBox(b, [0, 0, 0], [0.032, 0.007, 0.002], NAVY),
      );
  });
  // Front pocket.
  rb(b, [0, -0.3, 0.025], [0.31, 0.09, 0.014], 0.014, '#ffd166', MATTE, 4);
  flatBox(b, [0, -0.215, 0.04], [0.29, 0.006, 0.002], '#e8a92e');
  // The stamp: a round green seal, tilted.
  posed(b, rotZ(-0.3), [0.14, -0.14, 0.046], () => {
    disc(b, [0, 0, 0], 0.095, 0.02, '#2fb36b', EMISSIVE, 20);
    disc(b, [0, 0, 0.012], 0.06, 0.012, '#9cf2bf', EMISSIVE, 16);
    flatBox(b, [0, 0, 0.02], [0.04, 0.008, 0.002], '#2fb36b', EMISSIVE);
  });
  return b;
}

/** Visitor badge: white card on a pink lanyard; card from y -0.5 to 0.125. */
function badge() {
  const b = new MeshBuilder();
  // Lanyard: two straps meeting at the clip.
  for (const s of [-1, 1])
    posed(b, rotZ(s * 0.32), [s * 0.075, 0.33, -0.02], () =>
      rb(b, [0, 0, 0], [0.035, 0.19, 0.012], 0.012, PINK, MATTE, 3),
    );
  rb(b, [0, 0.135, -0.005], [0.06, 0.035, 0.03], 0.02, ALU, GLOSSY, 3);
  // Card.
  rb(b, [0, -0.19, 0], [0.3, 0.3, 0.04], 0.04, PAPER, GLOSSY, 5);
  rb(b, [0, 0.055, 0.03], [0.03, 0.012, 0.015], 0.01, '#9aa3ad', MATTE, 2);
  const z = 0.043;
  rb(b, [0, -0.0, z], [0.26, 0.04, 0.006], 0.006, NAVY, MATTE, 2);
  flatBox(b, [-0.05, 0.0, z + 0.009], [0.15, 0.01, 0.002], '#ffffff');
  // Photo: lime background, little navy head and shoulders.
  rb(b, [-0.13, -0.2, z], [0.1, 0.12, 0.006], 0.01, LIME, MATTE, 2);
  b.ellipsoid([-0.13, -0.17, z + 0.01], [0.04, 0.045, 0.01], NAVY, { seg: 6 });
  b.ellipsoid([-0.13, -0.3, z + 0.006], [0.075, 0.04, 0.008], NAVY, { seg: 6, from: 0.5 });
  for (let i = 0; i < 3; i++)
    flatBox(b, [0.12, -0.12 - i * 0.07, z], [0.11 - i * 0.02, 0.012, 0.002], '#9aa3ad');
  rb(b, [0, -0.43, z], [0.26, 0.035, 0.006], 0.006, PINK, MATTE, 2);
  return b;
}

/** The NAO envelope: white body, pink flap, lime wax seal. */
function envelope() {
  const b = new MeshBuilder();
  rb(b, [0, 0, 0], [0.43, 0.3, 0.035], 0.03, '#fffaf0', GLOSSY, 5);
  // Folds of the bottom pocket.
  for (const s of [-1, 1])
    posed(b, rotZ(s * -0.6), [s * 0.2, -0.13, 0.036], () =>
      flatBox(b, [0, 0, 0], [0.26, 0.005, 0.002], '#e6dccb'),
    );
  // Flap, with a thin darker rim drawn behind it.
  tri(
    b,
    [
      [-0.43, 0.3],
      [0.43, 0.3],
      [0, -0.06],
    ],
    0.038,
    '#d93a7f',
  );
  tri(
    b,
    [
      [-0.41, 0.29],
      [0.41, 0.29],
      [0, -0.035],
    ],
    0.041,
    PINK,
    GLOSSY,
  );
  // Wax seal.
  disc(b, [0, -0.04, 0.05], 0.075, 0.024, LIME, EMISSIVE, 20);
  disc(b, [0, -0.04, 0.063], 0.045, 0.012, '#e9ff8a', EMISSIVE, 14);
  return b;
}

/** Cracked floor slab: 1 x 3.75 tiles, top face at y = 0. */
function loose() {
  const b = new MeshBuilder();
  rb(b, [0, -0.1, 0], [0.5, 0.0875, 1.875], 0.02, '#3b4458', MATTE, 3);
  const cuts = [-1.875, -0.95, 0.15, 1.0, 1.875];
  const tilt = [0.02, -0.03, 0.025, -0.015];
  for (let i = 0; i < 4; i++) {
    const z0 = cuts[i] + (i ? 0.025 : 0),
      z1 = cuts[i + 1] - (i < 3 ? 0.025 : 0);
    posed(b, rotX(tilt[i]), [0, -0.035, (z0 + z1) / 2], () =>
      rb(
        b,
        [0, 0, 0],
        [0.49, 0.035, (z1 - z0) / 2],
        0.015,
        i % 2 ? '#7e8ca6' : '#76849e',
        MATTE,
        3,
      ),
    );
  }
  // Zigzag cracks on the top, with a pale chipped edge so they read from afar.
  for (const [z, k] of [
    [1.45, 1],
    [0.55, -1],
    [-0.4, -1],
  ])
    for (let i = 0; i < 4; i++)
      posed(b, rotY(k * (i % 2 ? 0.6 : -0.6)), [-0.36 + i * 0.24, 0.002, z], () => {
        flatBox(b, [0, 0, 0], [0.145, 0.003, 0.016], '#1d2230');
        flatBox(b, [0, 0.001, 0.02], [0.12, 0.003, 0.004], '#94a2ba');
      });
  // Caution checker along the front edge: amber and graphite blocks.
  for (let i = 0; i < 6; i++)
    flatBox(
      b,
      [-0.4 + i * 0.16, -0.1, 1.877],
      [0.08, 0.04, 0.002],
      i % 2 ? '#1f2430' : '#ffb52e',
      i % 2 ? MATTE : EMISSIVE,
    );
  return b;
}

/** Ceiling tile: 1 x 1.6 tiles, 1/8 thick, speckled acoustic underside. */
function panel() {
  const b = new MeshBuilder();
  rb(b, [0, 0.0625, 0], [0.5, 0.0625, 0.8125], 0.02, ALU, MATTE, 3);
  rb(b, [0, 0.06, 0], [0.47, 0.06, 0.78], 0.03, '#f2efe8', MATTE, 3);
  flatBox(b, [0, -0.002, 0], [0.42, 0.002, 0.72], '#e3ded3');
  for (let i = 0; i < 5; i++)
    for (let j = 0; j < 11; j++) {
      const h = Math.sin(i * 12.9 + j * 78.2) * 43758.5;
      const f = h - Math.floor(h);
      flatBox(
        b,
        [-0.34 + i * 0.17 + (f - 0.5) * 0.08, -0.005, -0.65 + j * 0.13 + (f - 0.5) * 0.05],
        [0.018, 0.002, 0.018],
        '#c8c1b3',
      );
    }
  return b;
}

/** Water-cooler bottle lying along z (neck towards -z), rolling around z. */
function bottle() {
  const b = new MeshBuilder();
  const R = 0.3;
  // rotX(-PI/2) maps +y onto -z: the lathe runs from the base (+z) to the neck.
  posed(b, rotX(-Math.PI / 2), [0, 0, 0.5], () => {
    b.lathe(
      [0, 0, 0],
      [
        [0, 0],
        [0.2, 0],
        [0.26, 0.015],
        [R, 0.06],
        [R, 0.2],
        [R - 0.025, 0.23],
        [R, 0.26],
        [R, 0.48],
        [R - 0.025, 0.51],
        [R, 0.54],
        [R, 0.66],
        [0.27, 0.74],
        [0.19, 0.81],
        [0.11, 0.85],
        [0.095, 0.87],
      ],
      '#5fb4f5',
      { mat: GLOSSY, seg: 22 },
    );
    // Label band.
    b.lathe(
      [0, 0, 0],
      [
        [R + 0.006, 0.3],
        [R + 0.006, 0.43],
      ],
      '#ffffff',
      { seg: 22 },
    );
    b.lathe(
      [0, 0, 0],
      [
        [R + 0.008, 0.35],
        [R + 0.008, 0.38],
      ],
      '#2b6cb0',
      { seg: 22 },
    );
    // Cap.
    b.lathe(
      [0, 0, 0],
      [
        [0.105, 0.86],
        [0.115, 0.88],
        [0.115, 0.98],
        [0.09, 1.0],
        [0, 1.0],
      ],
      '#2b6cb0',
      { mat: GLOSSY, seg: 16 },
    );
  });
  // Base end, facing the camera: a pale ring and an off-centre dot so the roll reads.
  disc(b, [0, 0, 0.49], 0.17, 0.012, '#bfe6ff', GLOSSY, 20);
  disc(b, [0, 0, 0.496], 0.12, 0.012, '#5fb4f5', GLOSSY, 18);
  disc(b, [0.2, 0, 0.47], 0.045, 0.02, '#ffffff', MATTE, 10);
  disc(b, [-0.2, 0, 0.47], 0.03, 0.02, '#2b6cb0', MATTE, 10);
  return b;
}

/** Glass office door: aluminium frame, glass pane, frosted lime band, bar handles. */
function door() {
  const b = new MeshBuilder();
  const F = 0.09;
  rb(b, [0, 0.06, 0], [0.12, 0.06, 1.25], 0.025, ALU, GLOSSY, 3);
  rb(b, [0, 1.95, 0], [0.12, 0.05, 1.25], 0.025, ALU, GLOSSY, 3);
  for (const s of [-1, 1])
    rb(b, [0, 1, s * (1.25 - F / 2)], [0.12, 1, F / 2], 0.025, ALU, GLOSSY, 3);
  rb(b, [0, 1.01, 0], [0.025, 0.9, 1.25 - F], 0.01, '#9fd8ff', GLOSSY, 2);
  // Frosted privacy band with a lime accent, both faces.
  for (const s of [-1, 1]) {
    flatBox(b, [s * 0.028, 1.12, 0], [0.003, 0.09, 1.25 - F], '#e8f4fb');
    flatBox(b, [s * 0.032, 1.12, 0], [0.003, 0.018, 1.25 - F], LIME, EMISSIVE);
    // Glints on the glass.
    for (const [y, z] of [
      [1.6, -0.5],
      [0.55, 0.3],
    ])
      posed(b, rotX(0.7), [s * 0.028, y, z], () =>
        flatBox(b, [0, 0, 0], [0.003, 0.18, 0.025], '#e7f6ff', GLOSSY),
      );
  }
  // Bar handles on both sides, near the front edge.
  for (const s of [-1, 1]) {
    rb(b, [s * 0.09, 1, 0.9], [0.018, 0.28, 0.018], 0.018, '#e2e7ec', GLOSSY, 3);
    for (const y of [0.76, 1.24])
      rb(b, [s * 0.055, y, 0.9], [0.035, 0.012, 0.012], 0.012, '#e2e7ec', GLOSSY, 2);
  }
  return b;
}

/**
 * Wall badge reader: dark rounded box, LED bar on top, contactless pad below.
 * @param {string} led
 */
function reader(led) {
  const b = new MeshBuilder();
  rb(b, [0, 0.25, 0], [0.15, 0.25, 0.09], 0.05, GRAPHITE, MATTE, 5);
  rb(b, [0, 0.22, 0.075], [0.115, 0.14, 0.02], 0.02, '#3a4150', GLOSSY, 3);
  // Contactless waves.
  for (let i = 0; i < 3; i++) {
    const r = 0.03 + i * 0.025;
    for (let k = -1; k <= 1; k++) {
      const a = k * 0.45;
      posed(b, rotZ(-a), [Math.sin(a) * r - 0.03, 0.2 + Math.cos(a) * r - r * 0.6, 0.096], () =>
        flatBox(b, [0, 0, 0], [0.012, 0.004, 0.003], '#aeb6c4'),
      );
    }
  }
  rb(b, [0, 0.415, 0.08], [0.09, 0.03, 0.018], 0.016, led, EMISSIVE, 3);
  return b;
}

/**
 * Water shut-off valve on the wall, drawn 0.9 above the floor: a blue riser pipe
 * from the floor, a brass body and a big handwheel facing the camera, with a tag.
 * Open (idle): red wheel and an amber "!" tag. Shut (on): the wheel turned an
 * eighth, green, and a green tag with a tick.
 * @param {boolean} shut
 */
function valve(shut) {
  const b = new MeshBuilder();
  const PIPE = '#3a7bd5';
  // Riser from the floor (y = -0.9) into the ceiling void, with chrome collars.
  b.lathe(
    [0, -0.9, -0.02],
    [
      [0, 0],
      [0.055, 0],
      [0.055, 1.75],
      [0, 1.75],
    ],
    PIPE,
    { mat: GLOSSY, seg: 14 },
  );
  for (const y of [-0.86, 0.02, 0.58])
    b.lathe(
      [0, y, -0.02],
      [
        [0.07, 0],
        [0.07, 0.045],
      ],
      ALU,
      { mat: GLOSSY, seg: 14 },
    );
  // Wall bracket and brass body.
  rb(b, [0, 0.26, -0.07], [0.1, 0.14, 0.02], 0.02, '#6b7484', MATTE, 3);
  rb(b, [0, 0.26, 0.01], [0.085, 0.1, 0.075], 0.04, '#c9a046', GLOSSY, 4);
  // Stem out to the wheel.
  posed(b, rotX(Math.PI / 2), [0, 0.26, 0.08], () =>
    b.lathe(
      [0, 0, 0],
      [
        [0.025, 0],
        [0.025, 0.07],
      ],
      ALU,
      { mat: GLOSSY, seg: 10 },
    ),
  );
  // Handwheel: rim, hub and four spokes, facing +z.
  const wheel = shut ? '#2fbf62' : '#e8323c';
  posed(b, rotZ(shut ? Math.PI / 4 : 0), [0, 0.26, 0.15], () => {
    /** @type {number[][]} */
    const prof = [];
    for (let i = 0; i <= 8; i++) {
      const a = -Math.PI / 2 + (i / 8) * Math.PI * 2;
      prof.push([0.15 + Math.cos(a) * 0.022, Math.sin(a) * 0.022]);
    }
    posed(b, rotX(Math.PI / 2), [0, 0, 0], () =>
      b.lathe([0, 0, 0], prof, wheel, { mat: GLOSSY, seg: 22 }),
    );
    for (let k = 0; k < 2; k++)
      posed(b, rotZ((k * Math.PI) / 2), [0, 0, 0], () =>
        rb(b, [0, 0, 0], [0.14, 0.014, 0.012], 0.012, wheel, GLOSSY, 2),
      );
    disc(b, [0, 0, 0.005], 0.04, 0.03, '#f4f6f8', GLOSSY, 12);
  });
  // Tag on a little chain, hanging from the body.
  rb(b, [0.13, 0.06, 0.05], [0.004, 0.05, 0.004], 0.004, ALU, MATTE, 1);
  posed(b, rotZ(shut ? 0 : 0.12), [0.13, -0.07, 0.055], () => {
    rb(b, [0, 0, 0], [0.065, 0.085, 0.008], 0.015, shut ? '#58ff9a' : '#ffc53d', EMISSIVE, 2);
    if (shut)
      for (const [x, y, a, l] of [
        [-0.018, -0.01, 0.8, 0.022],
        [0.016, 0.006, -0.7, 0.04],
      ])
        posed(b, rotZ(a), [x, y, 0.01], () => flatBox(b, [0, 0, 0], [0.01, l, 0.002], '#0b5d2c'));
    else {
      flatBox(b, [0, 0.015, 0.01], [0.011, 0.04, 0.002], NAVY);
      flatBox(b, [0, -0.052, 0.01], [0.011, 0.011, 0.002], NAVY);
    }
  });
  // Blue "water" plate above: a drop on white.
  rb(b, [0, 0.62, -0.06], [0.09, 0.06, 0.012], 0.015, '#ffffff', MATTE, 2);
  b.ellipsoid([0, 0.605, -0.045], [0.026, 0.03, 0.006], PIPE, { seg: 8 });
  tri(
    b,
    [
      [-0.022, 0.615],
      [0.022, 0.615],
      [0, 0.66],
    ],
    -0.044,
    PIPE,
  );
  return b;
}

/**
 * Chronotime time clock on a post: screen, keypad and card slot.
 * @param {string} screen
 */
function checkpoint(screen) {
  const b = new MeshBuilder();
  b.lathe(
    [0, 0, 0],
    [
      [0, 0],
      [0.17, 0],
      [0.17, 0.03],
      [0.13, 0.05],
      [0, 0.05],
    ],
    '#6b7484',
    { mat: GLOSSY, seg: 20, scaleZ: 0.7 },
  );
  b.lathe(
    [0, 0, 0],
    [
      [0.04, 0.04],
      [0.035, 0.86],
    ],
    '#9aa3ad',
    { mat: GLOSSY, seg: 12 },
  );
  // Head.
  rb(b, [0, 1.1, -0.005], [0.185, 0.27, 0.115], 0.06, '#1e2433', MATTE, 5);
  rb(b, [0, 1.38 - 0.27, 0.1], [0.15, 0.25, 0.02], 0.03, '#2b3346', GLOSSY, 3);
  // Screen.
  rb(b, [0, 1.235, 0.125], [0.12, 0.08, 0.008], 0.012, screen, EMISSIVE, 2);
  flatBox(b, [-0.03, 1.25, 0.137], [0.06, 0.012, 0.002], '#ffffff', EMISSIVE);
  flatBox(b, [-0.05, 1.21, 0.137], [0.04, 0.008, 0.002], '#ffffff', EMISSIVE);
  // Keypad.
  for (let i = 0; i < 3; i++)
    for (let j = 0; j < 2; j++)
      rb(
        b,
        [-0.07 + i * 0.07, 1.085 - j * 0.05, 0.118],
        [0.022, 0.016, 0.01],
        0.008,
        '#9aa3ad',
        MATTE,
        2,
      );
  // Card slot with a pink badge half inserted.
  flatBox(b, [0, 0.92, 0.126], [0.1, 0.012, 0.004], '#07090d');
  rb(b, [0.0, 0.885, 0.127], [0.07, 0.035, 0.008], 0.008, PINK, GLOSSY, 2);
  // Brand strip.
  flatBox(b, [0, 1.335, 0.125], [0.08, 0.008, 0.003], LIME, EMISSIVE);
  return b;
}

/** Meeting report in flight: a sheet folded in two, typed lines on the front. */
function report() {
  const b = new MeshBuilder();
  for (const s of [-1, 1])
    posed(b, rotY(s * -0.14), [s * 0.105, 0, 0], () => {
      rb(b, [0, 0, 0], [0.105, 0.27, 0.01], 0.008, '#ffffff', MATTE, 2);
      for (let i = 0; i < 4; i++)
        flatBox(
          b,
          [s * -0.01, 0.12 - i * 0.08, 0.014],
          [0.07 - ((i * 3 + (s > 0 ? 1 : 0)) % 3) * 0.015, 0.01, 0.002],
          i === 0 && s < 0 ? PINK : INK,
        );
    });
  tri(
    b,
    [
      [0.21, 0.2],
      [0.21, 0.27],
      [0.14, 0.27],
    ],
    0.028,
    '#d9dee6',
  );
  return b;
}

/** Ream of paper: white stack, blue wrapper band with a label. */
function ream() {
  const b = new MeshBuilder();
  rb(b, [0, 0, 0], [0.27, 0.15, 0.18], 0.025, PAPER, MATTE, 4);
  // Sheet edges along the visible top and bottom strips.
  for (const y of [-0.13, -0.115, 0.115, 0.13])
    flatBox(b, [0, y, 0.182], [0.25, 0.002, 0.003], '#d8d8d0');
  rb(b, [0, 0, 0], [0.282, 0.095, 0.188], 0.02, '#3d8bfd', GLOSSY, 3);
  rb(b, [0.03, 0, 0.188], [0.15, 0.055, 0.006], 0.008, '#ffffff', MATTE, 2);
  flatBox(b, [0.0, 0.015, 0.198], [0.09, 0.01, 0.002], NAVY);
  flatBox(b, [0.02, -0.02, 0.198], [0.11, 0.007, 0.002], '#9aa3ad');
  rb(b, [-0.2, 0, 0.19], [0.035, 0.035, 0.005], 0.01, LIME, EMISSIVE, 2);
  return b;
}

/**
 * The way out: a lift doorway facing the camera, set back so characters stand in
 * front of it. Locked (no key item yet): steel doors shut, slate trims and an amber
 * padlock above. Open: doors slid aside on a lit car, lime glow strips, a lit
 * up arrow and threshold.
 * @param {boolean} open
 */
function exitDoor(open) {
  const b = new MeshBuilder();
  const z = -0.4,
    W = 0.62,
    H = 2.15;
  const TRIM = open ? LIME : '#56607a';
  const TRIM_MAT = open ? EMISSIVE : MATTE;
  // Lit lift car behind the opening.
  rb(
    b,
    [0, H / 2, z - 0.12],
    [W, H / 2, 0.05],
    0.02,
    open ? '#e9ffd0' : '#3c4658',
    open ? EMISSIVE : MATTE,
    2,
  );
  rb(b, [0, 0.01, z - 0.02], [W, 0.012, 0.12], 0.008, '#8f99a8', MATTE, 2);
  if (open) {
    // Inside the car: a kick plate, a handrail and a lime running-figure panel.
    rb(b, [0, 0.16, z - 0.065], [W - 0.02, 0.15, 0.008], 0.006, '#b8c2cf', GLOSSY, 2);
    rb(b, [0, 0.95, z - 0.045], [W - 0.12, 0.022, 0.022], 0.02, ALU, GLOSSY, 3);
    rb(b, [0, 1.45, z - 0.064], [0.16, 0.22, 0.008], 0.02, '#0f9d58', EMISSIVE, 2);
    b.ellipsoid([0.02, 1.56, z - 0.05], [0.028, 0.028, 0.008], '#ffffff', {
      mat: EMISSIVE,
      seg: 5,
    });
    for (const [x, y, a, l] of [
      [0, 1.46, 0.3, 0.07],
      [-0.04, 1.33, -0.5, 0.07],
      [0.05, 1.33, 0.5, 0.07],
      [-0.03, 1.48, 1.2, 0.05],
      [0.05, 1.47, -1.0, 0.05],
    ])
      posed(b, rotZ(a), [x, y, z - 0.052], () =>
        flatBox(b, [0, 0, 0], [0.016, l, 0.004], '#ffffff', EMISSIVE),
      );
  }
  // Brushed steel doors: slid aside, or shut with a dark seam down the middle.
  for (const s of [-1, 1]) {
    const cx = open ? s * (W - 0.12) : s * (W / 2),
      hw = open ? 0.11 : W / 2 - 0.004;
    rb(b, [cx, H / 2, z - 0.04], [hw, H / 2 - 0.02, 0.025], 0.01, '#d5dbe2', GLOSSY, 2);
    if (!open)
      for (const y of [0.55, 1.1, 1.65])
        flatBox(b, [cx, y, z - 0.013], [hw - 0.04, 0.004, 0.002], '#b3bcc7');
  }
  if (!open) flatBox(b, [0, H / 2, z - 0.012], [0.006, H / 2 - 0.03, 0.003], '#59626f');
  // Frame: posts and lintel.
  for (const s of [-1, 1]) {
    rb(
      b,
      [s * (W + 0.09), (H + 0.12) / 2, z],
      [0.09, (H + 0.12) / 2, 0.1],
      0.03,
      '#3a4458',
      MATTE,
      3,
    );
    flatBox(b, [s * (W + 0.012), H / 2, z + 0.06], [0.022, H / 2, 0.035], TRIM, TRIM_MAT);
  }
  rb(b, [0, H + 0.08, z], [W + 0.18, 0.1, 0.1], 0.03, '#3a4458', MATTE, 3);
  flatBox(b, [0, H - 0.005, z + 0.06], [W, 0.022, 0.035], TRIM, TRIM_MAT);
  // Call button on the right post.
  rb(b, [W + 0.09, 1.05, z + 0.105], [0.045, 0.08, 0.008], 0.012, '#1b212c', MATTE, 2);
  b.ellipsoid([W + 0.09, 1.05, z + 0.115], [0.022, 0.022, 0.008], open ? LIME : '#ffb02e', {
    mat: EMISSIVE,
    seg: 6,
  });
  // Indicator above the opening: a lit up arrow, or an amber padlock.
  rb(b, [0, H + 0.08, z + 0.1], [0.14, 0.06, 0.008], 0.01, '#10151f', MATTE, 2);
  if (open)
    tri(
      b,
      [
        [-0.05, H + 0.05],
        [0.05, H + 0.05],
        [0, H + 0.12],
      ],
      z + 0.112,
      LIME,
      EMISSIVE,
    );
  else {
    rb(b, [0, H + 0.065, z + 0.112], [0.04, 0.03, 0.004], 0.008, '#ffb02e', EMISSIVE, 2);
    for (const s of [-1, 1])
      flatBox(b, [s * 0.024, H + 0.11, z + 0.112], [0.007, 0.02, 0.003], '#ffb02e', EMISSIVE);
    flatBox(b, [0, H + 0.128, z + 0.112], [0.031, 0.007, 0.003], '#ffb02e', EMISSIVE);
  }
  // Threshold plate and a glowing strip on the floor in front.
  rb(b, [0, 0.012, z + 0.2], [W + 0.18, 0.012, 0.12], 0.008, '#c3cad3', GLOSSY, 2);
  flatBox(b, [0, 0.026, z + 0.3], [W, 0.003, 0.018], TRIM, TRIM_MAT);
  return b;
}

/**
 * @param {WebGL2RenderingContext} gl
 */
export function buildThings(gl) {
  /** @param {MeshBuilder} b */
  const mesh = (b) => new Mesh(gl, b.build());
  return {
    ticket: mesh(ticket()),
    key: mesh(purchaseOrder()),
    badge: mesh(badge()),
    envelope: mesh(envelope()),
    loose: mesh(loose()),
    panel: mesh(panel()),
    bottle: mesh(bottle()),
    door: mesh(door()),
    reader: mesh(reader('#ff5e5e')),
    readerOn: mesh(reader('#58ff9a')),
    checkpoint: mesh(checkpoint('#4fb3ff')),
    checkpointOn: mesh(checkpoint('#58ff9a')),
    cr: mesh(report()),
    ammo: mesh(ream()),
    exit: mesh(exitDoor(true)),
    exitLocked: mesh(exitDoor(false)),
    concert: mesh(concertTickets()),
    valve: mesh(valve(false)),
    valveOn: mesh(valve(true)),
  };
}

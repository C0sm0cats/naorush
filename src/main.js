import './style.css';
import { CAST } from './data/cast.js';
import { ROOM_H, ROOM_W, SLICE } from './data/slice.js';
import { buildCharacter, poseCharacter } from './gfx/characters.js';
import {
  chain,
  lookAt,
  multiply,
  perspective,
  rotationY,
  rotationZ,
  scaling,
  translation,
} from './gfx/mat4.js';
const scalingM = (k) => scaling(k, k, k);
import { Mesh, Renderer, Sprite } from './gfx/renderer.js';
import { buildThings } from './gfx/things.js';
import { MAT, Volume, meshVolume } from './gfx/voxels.js';
import { buildOffice, buildSkyline } from './gfx/world-builder.js';
import { DT, HERO, createSim, step } from './game/sim.js';

const ASSETS = /** @type {Record<string, string>} */ (
  import.meta.glob('../assets/**/*.{png,webp}', { eager: true, query: '?url', import: 'default' })
);
const asset = (path) => ASSETS[`../assets/${path}`];

const POSTER_FILES = {
  'inetum-lcp7': 'signage/inetum-lcp7.webp',
  'learning-academy': 'signage/learning-academy.webp',
  chronotime: 'signage/chronotime-2.webp',
  'global-service-center': 'signage/global-service-center.webp',
  'sap-concur': 'signage/sap-concur.webp',
  swile: 'signage/swile.webp',
  'bon-commande': 'signage/bon-commande.webp',
};
const WHITEBOARDS = {
  projectDirector: 'signage/Whiteboard02.webp',
  businessManager: 'signage/Whiteboard01.webp',
};
const DESKS = {
  projectDirector: { file: 'signage/bureau-directeur-projets.webp', crop: [137, 14, 1897, 679] },
  businessManager: { file: 'signage/bureau-business-manager.webp', crop: [399, 42, 1374, 636] },
};

/** @param {string} src */
const loadImage = (src) =>
  new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });

/** Crops an image into a canvas so sprites only show the artwork. */
function crop(img, [x, y, w, h]) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  /** @type {CanvasRenderingContext2D} */ (c.getContext('2d')).drawImage(
    img,
    x,
    y,
    w,
    h,
    0,
    0,
    w,
    h,
  );
  return c;
}

const params = new URLSearchParams(location.search);
const heroId = params.get('hero') === 'charline' ? 'charline' : 'kevin';

const canvas = /** @type {HTMLCanvasElement} */ (document.getElementById('game'));
const renderer = new Renderer(canvas);
const gl = renderer.gl;
let sim = createSim(SLICE, heroId);
const office = buildOffice(sim, SLICE.decor);
const officeMesh = new Mesh(gl, office.mesh);
const skyMesh = new Mesh(gl, buildSkyline(sim.w));
const things = buildThings(gl);
const heroParts = buildCharacter(gl, CAST[heroId]);
const partnerId = heroId === 'kevin' ? 'charline' : 'kevin';
const partnerParts = buildCharacter(gl, CAST[partnerId]);
const colleagueParts = buildCharacter(gl, CAST.mathis);
const IDENTITY = translation(0, 0, 0);

// Shared unit cube for particles (sparks, dust, confetti), tinted per particle.
const cube = (() => {
  const v = new Volume(1, 1, 1, 1, [-0.5, -0.5, -0.5]);
  v.set(0, 0, 0, 0xffffff, MAT.EMISSIVE);
  return new Mesh(gl, meshVolume(v));
})();
/** @type {Array<{x:number,y:number,z:number,vx:number,vy:number,vz:number,life:number,max:number,size:number,color:number[],gravity:number}>} */
const particles = [];
/**
 * @param {number} x @param {number} y @param {number} n
 * @param {{colors: number[][], speed?: number, up?: number, size?: number, life?: number, gravity?: number}} o
 */
function burst(x, y, n, o) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2;
    const sp = (o.speed ?? 3) * (0.4 + Math.random() * 0.6);
    const life = (o.life ?? 0.6) * (0.6 + Math.random() * 0.4);
    particles.push({
      x,
      y,
      z: (Math.random() - 0.5) * 0.6,
      vx: Math.cos(a) * sp,
      vy: Math.abs(Math.sin(a)) * sp + (o.up ?? 2),
      vz: (Math.random() - 0.5) * sp,
      life,
      max: life,
      size: (o.size ?? 0.09) * (0.6 + Math.random() * 0.8),
      color: o.colors[i % o.colors.length],
      gravity: o.gravity ?? 14,
    });
  }
}
const FX = {
  jump: (x, y) =>
    burst(x, y, 6, { colors: [[0.9, 0.9, 0.95]], speed: 1.5, up: 0.5, life: 0.35, gravity: 2 }),
  land: (x, y) =>
    burst(x, y, 10, { colors: [[0.85, 0.85, 0.9]], speed: 2.2, up: 0.4, life: 0.4, gravity: 3 }),
  ticket: (x, y) =>
    burst(x, y, 14, {
      colors: [
        [1, 0.3, 0.6],
        [1, 1, 1],
      ],
      speed: 3,
      up: 2,
      life: 0.6,
    }),
  checkpoint: (x, y) =>
    burst(x, y, 18, {
      colors: [
        [0.35, 1, 0.6],
        [1, 1, 1],
      ],
      speed: 3,
      up: 3,
      life: 0.8,
    }),
  zap: (x, y) =>
    burst(x, y, 30, {
      colors: [
        [1, 0.85, 0.2],
        [0.5, 0.9, 1],
        [1, 1, 1],
      ],
      speed: 6,
      up: 3,
      life: 0.5,
      size: 0.07,
    }),
  collapse: (x, y) =>
    burst(x, y, 16, {
      colors: [
        [0.5, 0.55, 0.65],
        [0.3, 0.33, 0.4],
      ],
      speed: 2.5,
      up: 1,
      life: 0.9,
      size: 0.14,
    }),
  smash: (x, y) =>
    burst(x, y, 20, { colors: [[0.95, 0.94, 0.9]], speed: 4, up: 2, life: 0.8, size: 0.12 }),
  splash: (x, y) =>
    burst(x, y, 40, {
      colors: [
        [0.5, 0.8, 1],
        [0.8, 0.95, 1],
      ],
      speed: 5,
      up: 3,
      life: 0.9,
      size: 0.08,
    }),
  key: (x, y) =>
    burst(x, y, 24, {
      colors: [
        [1, 0.82, 0.3],
        [1, 1, 1],
      ],
      speed: 4,
      up: 3,
      life: 0.9,
    }),
  door: (x, y) => burst(x, y, 16, { colors: [[0.78, 0.96, 0.2]], speed: 3, up: 2, life: 0.7 }),
  win: (x, y) =>
    burst(x, y, 80, {
      colors: [
        [1, 0.3, 0.6],
        [0.78, 0.96, 0.2],
        [0.35, 0.8, 1],
        [1, 0.82, 0.3],
      ],
      speed: 7,
      up: 5,
      life: 1.6,
    }),
};
/** @param {number} dt */
function updateParticles(dt) {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.vy -= p.gravity * dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.z += p.vz * dt;
    p.life -= dt;
    if (p.life <= 0) particles.splice(i, 1);
  }
}

/** @type {Sprite[]} */
const sprites = [];
(async () => {
  for (const d of SLICE.decor) {
    if (d.type === 'poster' && d.id) {
      const img = await loadImage(asset(POSTER_FILES[d.id]));
      if (!img) continue;
      const h = 1.9,
        w = (h * img.width) / img.height;
      sprites.push(new Sprite(gl, img, [d.x, d.y + 0.9, -2.55, w, h]));
    } else if (d.type === 'whiteboard' && d.id) {
      const img = await loadImage(asset(WHITEBOARDS[d.id]));
      if (img) sprites.push(new Sprite(gl, img, [d.x, d.y + 0.7, -2.55, 3.4, 2.55]));
    } else if (d.type === 'deskSet' && d.id) {
      const desk = DESKS[d.id];
      const img = await loadImage(asset(desk.file));
      if (img) {
        const art = crop(img, desk.crop);
        sprites.push(new Sprite(gl, art, [d.x, d.y, -1.9, 4.4, (4.4 * art.height) / art.width]));
      }
      const plaque = await loadImage(asset(`plaques/${d.id}.png`));
      if (plaque)
        sprites.push(
          new Sprite(gl, plaque, [
            d.x + 1.2,
            d.y + 3.3,
            -2.55,
            2,
            (2 * plaque.height) / plaque.width,
          ]),
        );
    }
  }
})();

const LIGHTING = {
  sunDir: normalize([-0.35, -0.55, 0.75]),
  sunColor: [1.55, 1.32, 1.0],
  sky: [0.66, 0.72, 0.86],
  ground: [0.34, 0.3, 0.3],
  fog: [0.72, 0.8, 0.9],
  fogRange: /** @type {[number, number]} */ ([45, 110]),
  backdrop: {
    top: [0.32, 0.55, 0.86],
    mid: [0.68, 0.82, 0.95],
    bottom: [0.98, 0.86, 0.7],
    sun: /** @type {[number, number]} */ ([0.78, 0.72]),
    glow: [1, 0.85, 0.55],
  },
  lights: office.lights,
};

/** @param {number[]} v */
function normalize(v) {
  const l = Math.hypot(...v);
  return v.map((x) => x / l);
}

// ---- Input --------------------------------------------------------------
const keys = new Set();
const KEYMAP = {
  ArrowLeft: 'left',
  KeyA: 'left',
  KeyQ: 'left',
  ArrowRight: 'right',
  KeyD: 'right',
  ArrowUp: 'up',
  KeyW: 'up',
  KeyZ: 'up',
  ArrowDown: 'down',
  KeyS: 'down',
  Space: 'jump',
  KeyX: 'jump',
};
addEventListener('keydown', (e) => {
  const k = KEYMAP[/** @type {keyof typeof KEYMAP} */ (e.code)];
  if (k) {
    keys.add(k);
    e.preventDefault();
  }
});
addEventListener('keyup', (e) => {
  const k = KEYMAP[/** @type {keyof typeof KEYMAP} */ (e.code)];
  if (k) keys.delete(k);
});
for (const b of document.querySelectorAll('[data-key]')) {
  const k = /** @type {HTMLElement} */ (b).dataset.key ?? '';
  b.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    keys.add(k);
    b.classList.add('down');
  });
  for (const ev of ['pointerup', 'pointercancel', 'pointerleave'])
    b.addEventListener(ev, () => {
      keys.delete(k);
      b.classList.remove('down');
    });
}
const input = () => ({
  left: keys.has('left'),
  right: keys.has('right'),
  up: keys.has('up'),
  down: keys.has('down'),
  jump: keys.has('jump') || keys.has('up'),
});

// ---- Camera ---------------------------------------------------------------
const cam = { x: 10, y: 6, dist: 30 };
const FOV = (30 * Math.PI) / 180;
function updateCamera(dt) {
  const aspect = renderer.width / renderer.height;
  const h = sim.hero;
  const hx = h.x + HERO.w / 2;
  const room = Math.max(0, Math.min(Math.floor(sim.w / ROOM_W) - 1, Math.floor(hx / ROOM_W)));
  const roomCx = room * ROOM_W + ROOM_W / 2;
  // Fit the room on wide screens; on narrow screens show 11 tiles and follow the hero.
  if (params.has('gallery')) {
    const eye = [5.4, 4.6, 6.5];
    return {
      viewProj: multiply(perspective(FOV, aspect, 0.5, 220), lookAt(eye, [5.4, 4, 0])),
      eye,
      focus: [5.4, 4],
    };
  }
  // Close follow camera: the hero stays big on every screen (≈ a quarter of the height),
  // clamped to the level so the framing never shows outside the building.
  const visH = params.has('closeup') ? 3 : aspect >= 1 ? 8.2 : 7;
  const visW = visH * aspect;
  const dist = visH / 2 / Math.tan(FOV / 2);
  const lead = h.facing * Math.min(2.5, visW * 0.12);
  const tx = Math.max(visW / 2 - 0.5, Math.min(sim.w - visW / 2 + 0.5, hx + lead));
  const ty = Math.max(visH / 2 + 0.6, Math.min(ROOM_H - visH / 2 + 0.3, h.y + 2.2));
  const k = 1 - Math.exp(-dt * 6);
  cam.x += (tx - cam.x) * k;
  cam.y += (ty - cam.y) * k;
  cam.dist += (dist - cam.dist) * k;
  const eye = [cam.x + 0.6, cam.y + 1.4, cam.dist];
  const target = [cam.x, cam.y, -0.8];
  const view = lookAt(eye, target);
  const proj = perspective(FOV, aspect, 0.5, 220);
  return { viewProj: multiply(proj, view), eye, focus: [cam.x, cam.y] };
}

// ---- Animation --------------------------------------------------------------
/** @returns {import('./gfx/characters.js').Pose} */
function heroPose() {
  const h = sim.hero;
  const t = performance.now() / 1000;
  if (h.state === 'hang')
    return {
      legL: 0.15,
      legR: -0.1,
      armL: Math.PI * 0.95,
      armR: Math.PI * 0.95,
      bob: 0,
      lean: 0.1,
    };
  if (h.state === 'climb') {
    const k = h.stateTime / sim.stats.climb;
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
  return {
    legL: 0,
    legR: 0,
    armL: Math.sin(t * 2) * 0.05,
    armR: -Math.sin(t * 2) * 0.05,
    bob: Math.sin(t * 3) * 0.25,
    head: Math.sin(t * 0.7) * 0.05,
  };
}

/** Character gallery (?gallery): every cast member posed in a row, for art review. */
function galleryItems() {
  const t = performance.now() / 1000;
  /** @type {import('./gfx/renderer.js').DrawItem[]} */
  const items = [{ mesh: officeMesh, model: IDENTITY }];
  galleryParts.forEach(([id, parts], i) => {
    const turn = params.get('gallery') === 'side' ? 1.05 : 0.35;
    items.push(
      ...poseCharacter(parts, 3 + i * 1.6, 3, 0, 1, idlePose(t + i), {
        scale: CAST[id].scale,
        turn,
        rim: 0.4,
      }),
    );
  });
  return items;
}
const galleryParts = params.has('gallery')
  ? Object.keys(CAST).map((id) => [id, buildCharacter(gl, CAST[id])])
  : [];

/** @returns {import('./gfx/renderer.js').DrawItem[]} */
function sceneItems() {
  if (params.has('gallery')) return galleryItems();
  /** @type {import('./gfx/renderer.js').DrawItem[]} */
  const items = [
    { mesh: skyMesh, model: IDENTITY, noShadow: true },
    { mesh: officeMesh, model: IDENTITY },
  ];
  const t = performance.now() / 1000;
  const h = sim.hero;
  // Hero, drawn at hang/climb positions with a small offset so hands meet the ledge.
  let hx = h.x + HERO.w / 2;
  let hy = h.y;
  if (h.state === 'climb') {
    const k = Math.min(1, h.stateTime / sim.stats.climb);
    const e = k * k * (3 - 2 * k);
    hy = h.y + (h.ledge.y - h.y) * e;
    hx += h.facing * 0.55 * Math.max(0, e - 0.5) * 2;
  }
  const blink = h.invuln > 0 && Math.floor(t * 14) % 2 === 0;
  if (!blink)
    items.push(
      ...poseCharacter(heroParts, hx, hy, 0, h.facing, heroPose(), {
        scale: CAST[heroId].scale,
        turn: h.state === 'hang' || h.state === 'climb' ? 1.45 : 1.0,
        rim: 0.55,
      }),
    );
  // Partner waiting at the exit, colleague in a meeting.
  for (const th of sim.things) {
    if (!th.alive) continue;
    const at = (mesh, x, y, z, ...extra) =>
      items.push({ mesh, model: chain(translation(x, y, z), ...extra) });
    switch (th.kind) {
      case 'ticket':
        at(things.ticket, th.x, th.y + Math.sin(t * 3 + th.x) * 0.08, 0, rotationY(t * 2.5 + th.x));
        break;
      case 'key':
        at(things.key, th.x, th.y + Math.sin(t * 2.5) * 0.1, 0, rotationY(Math.sin(t * 1.5) * 0.6));
        break;
      case 'loose': {
        if (th.state === 'gone') break;
        const shake = th.state === 'shaking' ? Math.sin(t * 90) * 0.04 : 0;
        at(things.loose, th.x + 0.5 + shake, th.y + 1, -0.53);
        break;
      }
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
        if (th.state !== 'burst') at(things.bottle, th.x, th.y + 0.31, 0, rollMatrix(th.x));
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
          ...poseCharacter(partnerParts, th.x + 0.35, th.y, -0.4, -1, idlePose(t + 1), {
            scale: CAST[partnerId].scale,
            rim: 0.4,
          }),
        );
        break;
      case 'colleague': {
        const ph = t * 6;
        items.push(
          ...poseCharacter(
            colleagueParts,
            th.x,
            th.y,
            -0.2,
            Math.sign(th.vx) || 1,
            {
              legL: Math.sin(ph) * 0.6,
              legR: -Math.sin(ph) * 0.6,
              armL: -Math.sin(ph) * 0.4,
              armR: 1.2,
              bob: Math.abs(Math.cos(ph)),
            },
            { scale: CAST.mathis.scale, rim: 0.3 },
          ),
        );
        break;
      }
      default:
        break;
    }
  }
  for (const p of particles) {
    const k = p.size * Math.min(1, (p.life / p.max) * 2);
    items.push({
      mesh: cube,
      model: chain(translation(p.x, p.y, p.z), scalingM(k)),
      tint: p.color,
      noShadow: true,
    });
  }
  // Doors: slide up into the ceiling once the badge reader is used.
  for (let c = 0; c < sim.w; c++)
    for (let r = 0; r < sim.h; r++)
      if (sim.tiles[c + r * sim.w] === 4 && (r === 0 || sim.tiles[c + (r - 1) * sim.w] !== 4)) {
        items.push({
          mesh: things.door,
          model: translation(c + 0.5, r + (sim.doorOpen ? doorOpenY() : 0), -0.6),
        });
      }
  return items;
}

let doorT = 0;
const doorOpenY = () => Math.min(2.2, doorT * 3);

/** Rolling rotation for the bottle, from its distance travelled. */
function rollMatrix(x) {
  return rotationZ(-x / 0.31);
}

/** @param {number} t */
function idlePose(t) {
  return {
    legL: 0,
    legR: 0,
    armL: Math.sin(t * 1.3) * 0.1,
    armR: 0.3 + Math.sin(t * 2) * 0.3,
    bob: Math.sin(t * 2.4) * 0.3,
    head: Math.sin(t) * 0.08,
  };
}

// ---- HUD ---------------------------------------------------------------------
const hud = {
  hearts: /** @type {HTMLElement} */ (document.getElementById('hearts')),
  tickets: /** @type {HTMLElement} */ (document.getElementById('tickets')),
  key: /** @type {HTMLElement} */ (document.getElementById('key')),
  toast: /** @type {HTMLElement} */ (document.getElementById('toast')),
  room: /** @type {HTMLElement} */ (document.getElementById('room')),
};
let toastTimer = 0;
/** @param {string} text */
function toast(text) {
  hud.toast.textContent = text;
  hud.toast.classList.add('show');
  toastTimer = 2.6;
}
const ROOMS = ['Bureau du Directeur de Projets', 'Couloir des imprimantes', 'Espace Business'];
const EVENT_TEXT = {
  checkpoint: 'Badgé ! Chronotime enregistre ta progression.',
  door: 'Badge accepté : la porte du fond est ouverte.',
  key: 'Bon de commande signé ! Attention à la bonbonne…',
  collapse: 'Le planning s’effondre !',
  win: 'Étape terminée. L’enveloppe est passée par la direction T&S…',
  bump: '« En réunion, là ! »',
  zap: 'Court-circuit ! Retour au dernier badge Chronotime.',
};

function updateHud(dt) {
  const s = sim;
  hud.hearts.innerHTML = '';
  for (let i = 0; i < s.stats.hearts; i++) {
    const el = document.createElement('span');
    el.className = i < s.hero.hearts ? 'heart' : 'heart empty';
    hud.hearts.append(el);
  }
  hud.tickets.textContent = String(s.tickets);
  hud.key.classList.toggle('have', s.hasKey);
  const room = Math.min(2, Math.floor((s.hero.x + HERO.w / 2) / ROOM_W));
  hud.room.textContent = ROOMS[room];
  if (toastTimer > 0 && (toastTimer -= dt) <= 0) hud.toast.classList.remove('show');
}

// ---- Intro and whiteboard reader -------------------------------------------------
const intro = /** @type {HTMLElement} */ (document.getElementById('intro'));
const reader = /** @type {HTMLElement} */ (document.getElementById('reader'));
const readerImg = /** @type {HTMLImageElement} */ (document.getElementById('readerImg'));
let paused = !params.has('hero') && !params.has('gallery');
if (!paused) intro.classList.add('hidden');
/** @type {HTMLButtonElement} */ (document.getElementById('go')).onclick = () => {
  intro.classList.add('hidden');
  paused = false;
};
/** @type {HTMLButtonElement} */ (document.getElementById('readerClose')).onclick = () => {
  reader.hidden = true;
  paused = false;
};
/** Opens the whiteboard in front of the hero at full resolution. */
function tryRead() {
  const hx = sim.hero.x + HERO.w / 2;
  const board = SLICE.decor.find(
    (d) =>
      d.type === 'whiteboard' && hx > d.x - 0.3 && hx < d.x + 3.7 && Math.abs(sim.hero.y - d.y) < 1,
  );
  if (!board || !board.id) return false;
  readerImg.src = asset(WHITEBOARDS[/** @type {keyof typeof WHITEBOARDS} */ (board.id)]);
  reader.hidden = false;
  paused = true;
  keys.clear();
  return true;
}
addEventListener('keydown', (e) => {
  if (e.code === 'Escape' && !reader.hidden) {
    reader.hidden = true;
    paused = false;
  } else if (
    (e.code === 'ArrowUp' || e.code === 'KeyW' || e.code === 'KeyZ') &&
    !paused &&
    sim.hero.state === 'ground'
  )
    tryRead();
});

// ---- Loop --------------------------------------------------------------------
let last = performance.now();
let acc = 0;
let flash = 0;
function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  acc += dt;
  while (acc >= DT) {
    if (!params.has('gallery') && !paused) step(sim, input());
    if (sim.doorOpen) doorT += DT;
    for (const e of sim.events) {
      const text = EVENT_TEXT[/** @type {keyof typeof EVENT_TEXT} */ (e.type)];
      if (text) toast(text);
      if (e.type === 'hurt' || e.type === 'hardland' || e.type === 'zap') flash = 0.35;
      FX[/** @type {keyof typeof FX} */ (e.type)]?.(e.x, e.y);
    }
    acc -= DT;
  }
  flash = Math.max(0, flash - dt * 1.5);
  updateParticles(dt);
  const camera = updateCamera(dt);
  renderer.render(camera, LIGHTING, sceneItems(), sprites, { flash });
  updateHud(dt);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

if (import.meta.env.DEV)
  Object.assign(globalThis, {
    __nao: {
      get sim() {
        return sim;
      },
      set sim(v) {
        sim = v;
      },
      keys,
    },
  });

import { Camera } from './app/camera.js';
import { assetUrl } from './app/assets.js';
import { Particles } from './app/fx.js';
import { Hud } from './app/hud.js';
import { Input } from './app/input.js';
import { LevelView } from './app/scene.js';
import { WHITEBOARDS } from './data/inetum.js';
import { LIGHTING, ROOM_W, SLICE } from './data/slice.js';
import { Renderer } from './gfx/renderer.js';
import { DT, HERO, createSim, step } from './game/sim.js';

/**
 * NAO Rush entry point: loading → title (hero choice) → play ⇄ pause / reading → stage won.
 * The level keeps rendering behind every screen.
 *
 * @typedef {'loading'|'title'|'play'|'pause'|'reading'|'won'} Screen
 */

/** @param {string} id */
const $ = (id) => /** @type {HTMLElement} */ (document.getElementById(id));
const canvas = /** @type {HTMLCanvasElement} */ ($('game'));
const renderer = new Renderer(canvas);
const input = new Input();
const hud = new Hud();
const camera = new Camera();
const particles = new Particles();

/** @type {'kevin'|'charline'} */
let heroId = 'kevin';
let sim = createSim(SLICE, heroId);
const view = new LevelView(renderer.gl, sim, SLICE.decor, SLICE.map);
const lighting = { ...LIGHTING, lights: view.lights };

/** @type {Screen} */
let screen = 'loading';
/** @param {Screen} next */
function show(next) {
  screen = next;
  document.body.dataset.screen = next;
  $('pause').hidden = next !== 'pause';
  $('reader').hidden = next !== 'reading';
  $('won').hidden = next !== 'won';
  input.clear();
  if (next === 'title') $('play').focus();
}

function newRun() {
  sim = createSim(SLICE, heroId);
  particles.clear();
  view.doorT = 0;
  camera.snap(sim.hero.x, sim.hero.y + 3);
  hud.lastHearts = -1;
}

// ---- Title: hero choice --------------------------------------------------------
for (const card of document.querySelectorAll('.hero-card')) {
  card.addEventListener('click', () => {
    heroId = /** @type {'kevin'|'charline'} */ (/** @type {HTMLElement} */ (card).dataset.hero);
    for (const c of document.querySelectorAll('.hero-card'))
      c.setAttribute('aria-checked', String(c === card));
    newRun();
  });
}
const startPlay = () => {
  newRun();
  show('play');
};
$('play').onclick = startPlay;
$('again').onclick = startPlay;
$('restart').onclick = startPlay;
$('resume').onclick = () => show('play');
$('quit').onclick = $('menu').onclick = () => {
  newRun();
  show('title');
};
$('pauseBtn').onclick = () => screen === 'play' && show('pause');
$('readerClose').onclick = () => show('play');

function openBoard() {
  const board = view.boardAt(sim);
  if (!board?.id) return false;
  /** @type {HTMLImageElement} */ ($('readerImg')).src = assetUrl(
    WHITEBOARDS[/** @type {keyof typeof WHITEBOARDS} */ (board.id)],
  );
  show('reading');
  return true;
}

// ---- Loop -------------------------------------------------------------------------
let last = performance.now();
let acc = 0;
let flash = 0;
let wonTimer = 0;

/** @param {number} now */
function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  const t = now / 1000;

  if (screen === 'play') {
    if (input.pressed('pause')) show('pause');
    else if (!(input.pressed('up') && sim.hero.state === 'ground' && openBoard())) {
      acc += dt;
      while (acc >= DT) {
        step(sim, input.state());
        if (sim.doorOpen) view.doorT += DT;
        for (const e of sim.events) {
          hud.event(e);
          particles.emit(e.type, e.x, e.y);
          if (e.type === 'hurt' || e.type === 'hardland' || e.type === 'zap') {
            flash = 0.35;
            camera.shake = 1;
          }
          if (e.type === 'collapse' || e.type === 'smash')
            camera.shake = Math.max(camera.shake, 0.5);
        }
        acc -= DT;
      }
      if (sim.won && (wonTimer += dt) > 1.2) {
        wonTimer = 0;
        $('wonText').textContent =
          `${sim.tickets} tickets Swile · ${sim.time.toFixed(1).replace('.', ',')} s. ` +
          'L’enveloppe est passée par la direction Technologies & Services : la suite au prochain étage.';
        show('won');
      }
    }
  } else {
    acc = 0;
    if ((screen === 'pause' || screen === 'reading') && input.pressed('pause')) show('play');
    else if (screen === 'title' && input.pressed('confirm')) startPlay();
  }

  flash = Math.max(0, flash - dt * 1.5);
  particles.update(dt);
  const h = sim.hero;
  // Behind the title screen the camera drifts slowly along the office.
  const focus = gallery
    ? { x: 3.5, y: 1.6, facing: 0 }
    : screen === 'title' || screen === 'loading'
      ? { x: 10 + Math.sin(t * 0.07) * 8, y: 3, facing: 1 }
      : { x: h.x + HERO.w / 2, y: h.y, facing: h.facing };
  const cam = camera.update(dt, renderer.width / renderer.height, focus, { w: sim.w, h: sim.h });
  renderer.render(cam, lighting, view.items(sim, t, particles.list), view.sprites, { flash });
  if (screen === 'play') {
    const poster = view.posterAt(sim);
    hud.update(
      dt,
      sim,
      { rooms: SLICE.rooms, roomW: ROOM_W },
      { poster: poster?.id, board: Boolean(view.boardAt(sim)) },
    );
  }
  input.endFrame();
  requestAnimationFrame(frame);
}

// Art review: ?gallery shows the cast close up on the title screen.
const gallery = new URLSearchParams(location.search).has('gallery');
view.gallery = gallery;

view.ready.then(() => {
  camera.snap(10, 6);
  show('title');
});
requestAnimationFrame(frame);

if (import.meta.env.DEV)
  Object.assign(globalThis, {
    __nao: {
      get sim() {
        return sim;
      },
      get screen() {
        return screen;
      },
      input,
    },
  });

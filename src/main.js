import { assetUrl } from './app/assets.js';
import { Audio } from './app/audio.js';
import { Camera } from './app/camera.js';
import { Particles } from './app/fx.js';
import { Hud } from './app/hud.js';
import { Input } from './app/input.js';
import { LevelView } from './app/scene.js';
import { CAST } from './data/cast.js';
import { WHITEBOARDS } from './data/inetum.js';
import { LEVELS, ROOM_W } from './data/levels/index.js';
import { Renderer } from './gfx/renderer.js';
import { DT, HERO, createSim, step } from './game/sim.js';

/**
 * NAO Rush entry point: loading → title (hero choice) → stage intro (dialogue) →
 * play ⇄ pause / reading / dialogue → stage won → next stage … → the end.
 * The level keeps rendering behind every screen.
 *
 * @typedef {'loading'|'title'|'play'|'pause'|'reading'|'talk'|'won'} Screen
 * @typedef {import('./data/levels/index.js').Line} Line
 */

/** @param {string} id */
const $ = (id) => /** @type {HTMLElement} */ (document.getElementById(id));
const canvas = /** @type {HTMLCanvasElement} */ ($('game'));
const renderer = new Renderer(canvas);
const input = new Input();
const hud = new Hud();
const camera = new Camera();
const particles = new Particles();
const audio = new Audio();
const SAVE_KEY = 'naorush.stage';

/** @type {'kevin'|'charline'} */
let heroId = 'kevin';
let stage = 0;
let level = LEVELS[0];
let sim = createSim(level, heroId);
let view = new LevelView(renderer.gl, sim, level);
/** Scene lighting for the current stage. @param {import('./data/levels/index.js').Level} l */
const lightingFor = (l) => {
  const d = l.lighting.sunDir;
  const n = Math.hypot(d[0], d[1], d[2]);
  return { ...l.lighting, sunDir: d.map((x) => x / n), lights: view.lights };
};
let lighting = lightingFor(level);
/** Totals over the whole run, for the final screen. */
const run = { tickets: 0, time: 0, deaths: 0 };

/** @type {Screen} */
let screen = 'loading';
/** @param {Screen} next */
function show(next) {
  screen = next;
  document.body.dataset.screen = next;
  $('pause').hidden = next !== 'pause';
  $('reader').hidden = next !== 'reading';
  $('won').hidden = next !== 'won';
  $('talk').hidden = next !== 'talk';
  input.clear();
  if (next === 'title') $('play').focus();
  if (next === 'won') $(stage < LEVELS.length - 1 ? 'next' : 'menu').focus();
}

/** Rebuilds the scene when the stage changes; restarts the simulation either way. @param {number} i */
async function loadStage(i) {
  if (i !== stage || view.levelId !== LEVELS[i].id) {
    stage = i;
    level = LEVELS[i];
    sim = createSim(level, heroId);
    view.dispose();
    view = new LevelView(renderer.gl, sim, level);
    lighting = lightingFor(level);
    await view.ready;
  }
  sim = createSim(level, heroId);
  particles.clear();
  view.doorT = 0;
  camera.snap(sim.hero.x, sim.hero.y + 3);
  hud.lastHearts = -1;
}

/** Stage title card, dialogue, then play. @param {number} i */
async function beginStage(i) {
  await loadStage(i);
  $('stageNum').textContent = `Étape ${i + 1} sur ${LEVELS.length}`;
  $('stageName').textContent = level.name;
  $('stageSub').textContent = level.subtitle;
  const banner = $('stage');
  banner.classList.remove('show');
  void banner.offsetWidth;
  banner.classList.add('show');
  audio.music(level.music);
  talk(level.intro, () => show('play'));
}

// ---- Dialogue ------------------------------------------------------------------
/** @type {{lines: Line[], i: number, shown: number, done: () => void}} */
const dialogue = { lines: [], i: 0, shown: 0, done: () => {} };

/** @param {Line[]} lines @param {() => void} done */
function talk(lines, done) {
  Object.assign(dialogue, { lines, i: 0, shown: 0, done });
  if (!lines.length) return done();
  setSpeaker();
  show('talk');
}

function setSpeaker() {
  const line = dialogue.lines[dialogue.i];
  const partner = heroId === 'kevin' ? 'charline' : 'kevin';
  const id =
    line.who === 'hero'
      ? heroId
      : line.who === 'partner'
        ? partner
        : line.who === 'boss'
          ? (level.boss?.id ?? partner)
          : '';
  const who = id ? CAST[id] : null;
  $('talkName').textContent = who?.name ?? 'Astuce';
  $('talkTitle').textContent = who?.title ?? '';
  $('talkWho').dataset.who = line.who === 'hint' ? 'hint' : id;
  $('talkText').textContent = '';
}

function advanceTalk() {
  const line = dialogue.lines[dialogue.i];
  if (!line || screen !== 'talk') return;
  if (dialogue.shown < line.text.length) {
    dialogue.shown = line.text.length;
    return;
  }
  audio.sfx('select');
  if (++dialogue.i >= dialogue.lines.length) return dialogue.done();
  dialogue.shown = 0;
  setSpeaker();
}

/** Typewriter effect. @param {number} dt */
function updateTalk(dt) {
  const line = dialogue.lines[dialogue.i];
  if (!line) return;
  const before = Math.floor(dialogue.shown);
  dialogue.shown = Math.min(line.text.length, dialogue.shown + dt * 55);
  const now = Math.floor(dialogue.shown);
  if (now !== before) {
    $('talkText').textContent = line.text.slice(0, now);
    if (now % 3 === 0 && line.text[now - 1] !== ' ') audio.sfx('talk');
  }
}

// ---- Title: hero choice --------------------------------------------------------
for (const card of document.querySelectorAll('.hero-card')) {
  card.addEventListener('click', () => {
    heroId = /** @type {'kevin'|'charline'} */ (/** @type {HTMLElement} */ (card).dataset.hero);
    for (const c of document.querySelectorAll('.hero-card'))
      c.setAttribute('aria-checked', String(c === card));
    audio.sfx('select');
    loadStage(stage);
  });
}

const saved = () => Math.min(LEVELS.length - 1, Number(localStorage.getItem(SAVE_KEY)) || 0);
function updateContinue() {
  const n = saved();
  $('continue').hidden = n === 0;
  $('continue').textContent = `Continuer · étape ${n + 1}`;
}

/** @param {number} i */
const startFrom = (i) => {
  audio.sfx('confirm');
  if (i === 0) Object.assign(run, { tickets: 0, time: 0, deaths: 0 });
  beginStage(i);
};
$('play').onclick = () => startFrom(0);
$('continue').onclick = () => startFrom(saved());
$('next').onclick = () => startFrom(stage + 1);
$('again').onclick = $('restart').onclick = () => startFrom(stage);
$('resume').onclick = () => show('play');
$('quit').onclick = $('menu').onclick = () => {
  updateContinue();
  audio.music('title');
  loadStage(stage).then(() => show('title'));
};
$('pauseBtn').onclick = () => screen === 'play' && show('pause');
$('readerClose').onclick = () => show('play');
$('talk').onclick = () => advanceTalk();
const muteBtn = $('muteBtn');
const syncMute = () => {
  muteBtn.textContent = audio.muted ? '♪̸' : '♪';
  muteBtn.setAttribute('aria-pressed', String(audio.muted));
};
muteBtn.onclick = () => {
  audio.setMuted(!audio.muted);
  syncMute();
};
syncMute();
// Browsers only allow sound after a user gesture.
for (const type of ['pointerdown', 'keydown'])
  addEventListener(type, () => audio.unlock(), { once: true, capture: true });

function openBoard() {
  const board = view.boardAt(sim);
  if (!board?.id) return false;
  /** @type {HTMLImageElement} */ ($('readerImg')).src = assetUrl(
    WHITEBOARDS[/** @type {keyof typeof WHITEBOARDS} */ (board.id)],
  );
  show('reading');
  return true;
}

// ---- Stage end -------------------------------------------------------------------
const STAGE_END = [
  {
    title: 'Bon de commande signé !',
    text: 'Direction la salle serveurs de Technologies & Services.',
  },
  {
    title: 'Enveloppe validée !',
    text: 'Plus qu’une signature : rendez-vous au Power UP Tour, sur le toit.',
  },
  {
    title: 'NAO sauvées !',
    text: 'L’enveloppe est signée, les négociations peuvent commencer jeudi. Et le buffet est ouvert.',
  },
];

function stageWon() {
  run.tickets += sim.tickets;
  run.time += sim.time;
  run.deaths += sim.deaths;
  const last = stage === LEVELS.length - 1;
  localStorage.setItem(SAVE_KEY, String(last ? 0 : stage + 1));
  $('wonKicker').textContent = last
    ? 'Fin de la partie'
    : `Étape ${stage + 1} sur ${LEVELS.length} terminée`;
  $('wonTitle').textContent = STAGE_END[stage].title;
  $('wonText').textContent = STAGE_END[stage].text;
  /** @param {number} s */
  const clock = (s) => `${Math.floor(s / 60)} min ${String(Math.floor(s % 60)).padStart(2, '0')} s`;
  const rows = last
    ? [
        ['Tickets Swile', run.tickets],
        ['Temps total', clock(run.time)],
        ['Retours au badge', run.deaths],
      ]
    : [
        ['Tickets Swile', sim.tickets],
        ['Temps', clock(sim.time)],
        ['Retours au badge', sim.deaths],
      ];
  $('wonStats').replaceChildren(
    ...rows.flatMap(([k, v]) => {
      const dt = document.createElement('dt');
      const dd = document.createElement('dd');
      dt.textContent = String(k);
      dd.textContent = String(v);
      return [dt, dd];
    }),
  );
  $('next').hidden = last;
  audio.music(last ? 'win' : null);
  audio.sfx('win');
  show('won');
}

// ---- Loop -------------------------------------------------------------------------
let last = performance.now();
let acc = 0;
let flash = 0;
let wonTimer = 0;
/** Lines to say once the current frame's events are handled. @type {{lines: Line[], then: () => void} | null} */
let pending = null;

/** @param {import('./game/sim.js').SimEvent} e */
function onEvent(e) {
  hud.event(e);
  particles.emit(e.type, e.x, e.y);
  audio.sfx(e.type === 'throw' ? 'fire' : e.type);
  if (e.type === 'hurt' || e.type === 'hardland' || e.type === 'zap') {
    flash = 0.35;
    camera.shake = 1;
  }
  if (e.type === 'collapse' || e.type === 'smash' || e.type === 'slam')
    camera.shake = Math.max(camera.shake, 0.5);
  if (e.type === 'bossStart') {
    audio.music('boss');
    pending = { lines: level.bossIntro ?? [], then: () => show('play') };
  }
  if (e.type === 'bossDone') {
    audio.music(level.music);
    pending = { lines: level.outro, then: () => show('play') };
  }
}

/** @param {number} now */
function frame(now) {
  // rAF timestamps can precede `last` on the first frame: never step backwards.
  const dt = Math.max(0, Math.min(0.1, (now - last) / 1000));
  last = now;
  const t = now / 1000;

  if (screen === 'play') {
    if (input.pressed('pause')) show('pause');
    else if (!(input.pressed('up') && sim.hero.state === 'ground' && openBoard())) {
      acc += dt;
      while (acc >= DT && !pending) {
        step(sim, input.state());
        if (sim.doorOpen) view.doorT += DT;
        for (const e of sim.events) onEvent(e);
        acc -= DT;
      }
      if (pending) {
        const p = pending;
        pending = null;
        talk(p.lines, p.then);
      } else if (sim.won && (wonTimer += dt) > 1.2) {
        wonTimer = 0;
        // Stages without a boss end on a word with your partner at the exit.
        if (level.boss) stageWon();
        else talk(level.outro, stageWon);
      }
    }
  } else {
    acc = 0;
    if ((screen === 'pause' || screen === 'reading') && input.pressed('pause')) show('play');
    else if (screen === 'title' && input.pressed('confirm')) startFrom(0);
    else if (screen === 'talk') {
      updateTalk(dt);
      if (input.pressed('confirm') || input.pressed('jump') || input.pressed('fire')) advanceTalk();
    }
  }

  flash = Math.max(0, flash - dt * 1.5);
  particles.update(dt);
  const h = sim.hero;
  // Behind the title screen the camera drifts slowly along the stage.
  const focus = gallery
    ? { x: 3.5, y: 1.6, facing: 0 }
    : screen === 'title' || screen === 'loading'
      ? { x: 10 + Math.sin(t * 0.07) * 8, y: 3, facing: 1 }
      : { x: h.x + HERO.w / 2, y: h.y, facing: h.facing };
  const cam = camera.update(dt, renderer.width / renderer.height, focus, { w: sim.w, h: sim.h });
  renderer.render(cam, lighting, view.items(sim, t, particles.list), view.sprites, { flash });
  if (screen === 'play' || screen === 'talk') {
    const poster = view.posterAt(sim);
    hud.update(
      dt,
      sim,
      { rooms: level.rooms, roomW: ROOM_W },
      { poster: screen === 'play' ? poster?.id : undefined, board: Boolean(view.boardAt(sim)) },
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
  updateContinue();
  audio.music('title');
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
      /** @param {number} i */
      stage: (i) => startFrom(i),
    },
  });

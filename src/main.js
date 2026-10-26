import { Audio, eventSfx, screenPan } from './app/audio.js';
import { Camera } from './app/camera.js';
import { applyTwist, dailyFor, dailyKicker, dailyMet, shareCard } from './app/daily.js';
import { Bubbles, Dialogue } from './app/dialogue.js';
import { Particles, landPower } from './app/fx.js';
import { Hud } from './app/hud.js';
import { Input, fillKeys, tipText } from './app/input.js';
import { Interlude, interludeFor } from './app/interlude.js';
import { Medals, applySansFilet, medalFor, medalTargets, modeOf } from './app/medals.js';
import {
  autoRoll,
  chapterRows,
  clearFloor,
  readingOrder,
  renderCast,
  renderChapters,
  renderCredits,
  renderTrophies,
} from './app/menus.js';
import { applyPrefs, caption, prefs, reducedMotion, setupOptions } from './app/options.js';
import { BEST_KEY, renderResults, secretsFound } from './app/results.js';
import { load, loadCount, store } from './app/storage.js';
import {
  DynamicResolution,
  PRIMO_PROMPT,
  bossLighting,
  fightFocus,
  primoCue,
} from './app/staging.js';
import { findSpot, heroRegion, title } from './app/title.js';
import { Trophies } from './app/trophies.js';
import { LevelView, boardUrl } from './app/scene.js';
import { drawPrefs, edgeCue, watchCamera } from './app/draw-things.js';
import { CREDITS, EPILOGUE, PROLOGUE } from './data/barks.js';
import { CAST } from './data/cast.js';
import { CAMPAIGN, LEVELS, ROOM_W } from './data/levels/index.js';
import { BOARD_ZOOM, renderReaderPage } from './gfx/boards.js';
import { POSTER_LIST, renderPoster } from './gfx/posters.js';
import { Renderer } from './gfx/renderer.js';
import { consultLength } from './game/boss.js';
import { DT, HERO, TILE, createSim, step, tileAt } from './game/sim.js';

/**
 * NAO Rush entry point: loading → title (hero choice) → stage intro (dialogue) →
 * play ⇄ pause / options / reading / dialogue / game over → stage won → … → credits.
 * The level keeps rendering behind every screen.
 *
 * @typedef {'loading'|'title'|'play'|'pause'|'options'|'reading'|'talk'|'won'|'gameover'|'credits'|'trophies'|'cast'|'posters'|'chapters'|'interlude'} Screen
 * @typedef {import('./data/levels/index.js').Line} Line
 */

/** @param {string} id */
const $ = (id) => /** @type {HTMLElement} */ (document.getElementById(id));
const canvas = /** @type {HTMLCanvasElement} */ ($('game'));
// Without WebGL2 there is no game: say so kindly instead of failing silently.
/** @param {unknown} why @returns {never} */
function unsupported(why) {
  $('loading').innerHTML =
    '<p>NAO Rush a besoin de WebGL2.<br />Essaie un navigateur récent (Chrome, Edge, Firefox, Safari 15+), ' +
    'ou active l’accélération matérielle.</p>';
  throw why instanceof Error ? why : new Error('WebGL2 unavailable');
}
if (!document.createElement('canvas').getContext('webgl2')) unsupported(null);
const renderer = (() => {
  try {
    return new Renderer(canvas);
  } catch (e) {
    return unsupported(e);
  }
})();
const input = new Input();
const hud = new Hud();
const camera = new Camera();
/** Stereo position of a world x on screen (camera centre, visible half-width). @param {number} x */
const panAt = (x) =>
  screenPan(x, camera.x, camera.dist * Math.tan(Math.PI / 12) * (renderer.width / renderer.height));
const particles = new Particles();
const audio = new Audio();
const resolution = new DynamicResolution();
/** Trophies with a sound of their own (the others ring the common bells). */
const TROPHY_SFX = /** @type {Record<string, string>} */ ({
  sansFilet: 'tightrope',
  stars: 'certified',
});
/** When the last trophy sound was due (ms): trophies won together ring one after the other. */
let trophyDue = 0;
const trophies = new Trophies((t) => {
  hud.trophy(t.name);
  const now = performance.now();
  trophyDue = Math.max(now, trophyDue + 600);
  audio.sfx(TROPHY_SFX[t.id] ?? 'trophy', { delay: (trophyDue - now) / 1000 });
});
const SAVE_KEY = 'naorush.stage';
/** Best medal and star per stage and hero (« Sans filet » apart). */
const medals = new Medals();
/**
 * How the current run started: the story (Jouer, Continuer), a stage picked in
 * « Chapitres », or one picked there in « Sans filet ». Next and Replay keep it.
 * @type {'story'|'chapter'|'sansFilet'}
 */
let runMode = 'story';
/**
 * Relaxed mode or a slower speed at any point of the run: a bronze at most, and the
 * results card says which one held the medal back.
 */
let helped = { relaxed: false, slow: false };

applyPrefs();

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
/** Totals over the whole run, for the credits. */
/** Best result of each story stage in this run (a replay overwrites it), for the credits. */
const runStages =
  /** @type {Record<number, {tickets: number, time: number, deaths: number, secrets: number}>} */ ({});
const run = {
  get tickets() {
    return Object.values(runStages).reduce((n, s) => n + s.tickets, 0);
  },
  get time() {
    return Object.values(runStages).reduce((n, s) => n + s.time, 0);
  },
  get deaths() {
    return Object.values(runStages).reduce((n, s) => n + s.deaths, 0);
  },
  get secrets() {
    return Object.values(runStages).reduce((n, s) => n + s.secrets, 0);
  },
};

/** @type {Screen} */
let screen = 'loading';
/** Screen to return to when options close. @type {Screen} */
let optionsFrom = 'title';
const OVERLAYS = /** @type {const} */ ([
  'pause',
  'options',
  'reader',
  'won',
  'talk',
  'gameover',
  'credits',
  'trophies',
  'cast',
  'posters',
  'chapters',
  'interlude',
]);
/** NA-2: the route, the clock and a line between two story stages (builds #interlude). */
const interlude = new Interlude();
interlude.onSound = (
  /** @type {string} */ type,
  /** @type {{ pitch?: number } | undefined} */ opts,
) => audio.sfx(type, opts);
/** Where focus lands when a screen opens, so keyboards, pads and screen readers start there. */
const FIRST_FOCUS = /** @type {Partial<Record<Screen, string>>} */ ({
  title: 'play',
  gameover: 'goResume',
  pause: 'resume',
  options: 'volMusic',
  trophies: 'trophiesClose',
  cast: 'castClose',
  posters: 'postersClose',
  credits: 'creditsClose',
  reading: 'readerClose',
  talk: 'talkNext',
  interlude: 'interludeSkip',
});
/** @param {Screen} next */
function show(next) {
  screen = next;
  document.body.dataset.screen = next;
  // Focus never lingers on a hidden screen's button: Enter or Space would press it.
  /** @type {HTMLElement | null} */ (document.activeElement)?.blur();
  for (const id of OVERLAYS) $(id).hidden = (id === 'reader' ? 'reading' : id) !== next;
  $('loading').setAttribute('aria-hidden', String(next !== 'loading'));
  input.clear();
  const first = next === 'won' ? ($('next').hidden ? 'menu' : 'next') : FIRST_FOCUS[next];
  // Long lists (cast, trophies) stay scrolled to the top.
  if (first) $(first).focus({ preventScroll: true });
}

/** Little lines shown while a stage loads. */
const LOADING_TIPS = [
  'Le saviez-vous ? Les CR de Kévin font tomber des piles entières de cartons.',
  'Astuce : quand un directeur consulte PRIMO, c’est le moment d’envoyer un compte rendu.',
  'Charline peut sauter une deuxième fois en l’air. Pratique pour les rebords très hauts.',
  'Chaque piège prévient : une secousse, un voyant, une goutte. Observe, puis passe.',
  'Les cafés rendent un cœur. Les ramettes de papier, trois comptes rendus.',
  'Le robot aspirateur fait un excellent tremplin.',
  'Badge aux bornes Chronotime : en cas de pépin, tu repars de là.',
  'Deux secrets par étape : un pour chaque héros. Un léger scintillement les trahit.',
  'Le défi du jour change à minuit. Partage ton score avec tes collègues !',
];

/** Rebuilds the scene when the stage changes; restarts the simulation either way. @param {number} i */
async function loadStage(i) {
  if (i !== stage || view.levelId !== LEVELS[i].id) {
    // Building a stage takes a moment: show the loading screen first, with a tip.
    $('loadingTip').textContent = LOADING_TIPS[Math.floor(Math.random() * LOADING_TIPS.length)];
    show('loading');
    await new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)));
    stage = i;
    level = LEVELS[i];
    sim = createSim(level, heroId);
    view.dispose();
    view = new LevelView(renderer.gl, sim, level);
    lighting = lightingFor(level);
    await view.ready;
  }
  sim = createSim(level, heroId);
  sim.assist = prefs.assist && !challenge && runMode !== 'sansFilet';
  if (challenge) applyTwist(sim, challenge);
  else if (runMode === 'sansFilet') applySansFilet(sim);
  helped = { relaxed: false, slow: false };
  particles.clear();
  view.doorT = 0;
  camera.snap(sim.hero.x, sim.hero.y + 3);
  hud.lastHearts = -1;
  hud.setStage({
    id: level.id,
    keyLabel: level.keyLabel,
    bottle: sim.things.some((t) => t.kind === 'bottle'),
  });
  pending = null;
  hitstop = 0;
  wonTimer = 0;
  hud.clearToast();
  bubbles.clear();
  bubbles.stage(level, partnerOf());
  gameOverTimer = 0;
}

/** Stage title card, dialogue, then play. @param {number} i @param {Line[]} [before] */
async function beginStage(i, before = []) {
  await loadStage(i);
  $('stageNum').textContent =
    (i < CAMPAIGN ? `Étape ${i + 1} sur ${CAMPAIGN}` : 'Étape bonus') +
    (sim.hardcore && !challenge ? ' · Sans filet' : '');
  $('stageName').textContent = level.name;
  $('stageSub').textContent = level.subtitle;
  const banner = $('stage');
  banner.classList.remove('show');
  void banner.offsetWidth;
  banner.classList.add('show');
  // The stage's music and a quiet bed of room sound under it: office hum, servers, wind…
  audio.stage(level, heroId);
  setIntensity(0.2);
  // While the intro plays, the camera glides from the exit back to the start
  // (unless the system asks for less motion).
  flyover = reducedMotion ? null : { t: 0, from: Math.max(sim.hero.x, sim.w - 12) };
  if (flyover) camera.snap(flyover.from, 6);
  talk([...before, ...level.intro], () => {
    flyover = null;
    show('play');
    say(heroId, 'start');
  });
}

// ---- Dialogue and speech bubbles ---------------------------------------------------
const partnerOf = () => (heroId === 'kevin' ? 'charline' : 'kevin');
const dialogue = new Dialogue(audio, (who) =>
  who === 'hero'
    ? heroId
    : who === 'partner'
      ? partnerOf()
      : who === 'boss'
        ? (level.boss?.id ?? partnerOf())
        : '',
);
const bubbles = new Bubbles();
// Queued lines (the set-piece teasers) get the same little voice as the others.
bubbles.onLine = (/** @type {string} */ who) => audio.sfx('bubble', { who });

/** @param {Line[]} lines @param {() => void} done */
function talk(lines, done) {
  hud.dialogue();
  if (dialogue.start(lines, done)) show('talk');
  else done();
}

/** @param {string} who @param {string} moment @param {boolean} [force] */
const say = (who, moment, force) => {
  const before = bubbles.time;
  bubbles.say(who, moment, force);
  if (bubbles.time > before) audio.sfx('bubble', { who: who === 'partner' ? partnerOf() : who });
};

/** Where a speech bubble sits: above the hero, the partner at the exit, or the boss. @param {string} who */
function bubbleAnchor(who) {
  if (who === heroId) return [sim.hero.x + HERO.w / 2, sim.hero.y + 2.1];
  if (who === 'colleague' || who === 'intern' || who === 'visio') {
    const kind = who;
    const near = sim.things
      .filter((t) => t.kind === kind && t.alive)
      .sort((a, b) => Math.abs(a.x - sim.hero.x) - Math.abs(b.x - sim.hero.x))[0];
    return near ? [near.x, near.y + 2] : null;
  }
  if (who === 'partner') {
    const exit = sim.things.find((t) => t.kind === 'exit');
    return exit ? [exit.x + 0.35, exit.y + 2.1] : null;
  }
  const boss = sim.things.find((t) => t.kind === 'boss');
  return boss ? [boss.x, boss.y + 2.7] : null;
}

// ---- Title, options, menus -----------------------------------------------------
const heroCards = /** @type {HTMLElement[]} */ ([...document.querySelectorAll('.hero-card')]);
/** Radio group: only the chosen hero is in the tab order. */
function markHero() {
  for (const c of heroCards) {
    c.setAttribute('aria-checked', String(c.dataset.hero === heroId));
    c.tabIndex = c.dataset.hero === heroId ? 0 : -1;
  }
}
for (const card of heroCards) {
  card.addEventListener('click', () => {
    heroId = /** @type {'kevin'|'charline'} */ (card.dataset.hero);
    markHero();
    audio.sfx('select');
    loadStage(stage).then(showcase);
  });
  // Left and right switch heroes, like any radio group.
  card.addEventListener('keydown', (e) => {
    if ((e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') || e.repeat) return;
    const other = heroCards[1 - heroCards.indexOf(card)];
    other.click();
    other.focus();
  });
}

const saved = () => Math.min(CAMPAIGN - 1, loadCount(SAVE_KEY));
function updateContinue() {
  const d = today();
  $('dailyBtn').textContent =
    `Défi du jour : ${LEVELS[d.stage].name} · ${CAST[d.hero].name} · ${d.twist.label}`;
  // Chapters: every stage cleared so far, and the bonus stages once the envelope is signed.
  $('chaptersBtn').hidden = !chapters('normal').some((c) => c.open);

  const got = trophies.list().filter((t) => t.got).length;
  $('trophiesBtn').textContent = `Trophées ${got}/${trophies.list().length}`;
  const n = saved();
  $('continue').hidden = n === 0;
  $('continue').textContent = `Continuer · étape ${n + 1} : ${LEVELS[n].name}`;
}

/** Today's challenge while it is being played. @type {import('./app/daily.js').Challenge | null} */
let challenge = null;
// Stages without a boss, bonus ones included: no spoiling Julien or Rodolphe on a fresh save.
const today = () => dailyFor(LEVELS);
$('dailyBtn').onclick = () =>
  leaveTitle(() => {
    runMode = 'story';
    challenge = today();
    updateContinue();
    heroId = challenge.hero;
    markHero();
    beginStage(challenge.stage);
  });
/** @param {number} i */
const startFrom = (i) => {
  const prologue = i === 0 && screen === 'title' ? PROLOGUE : [];
  leaveTitle(() => {
    challenge = null;
    if (i === 0) for (const k of Object.keys(runStages)) delete runStages[Number(k)];
    beginStage(i, prologue);
  });
};
const toMenu = () => {
  view.party = 0;
  audio.ambience(null);
  challenge = null;
  runMode = 'story';
  updateContinue();
  audio.music('title');
  setIntensity(0);
  loadStage(stage).then(() => {
    showcase();
    show('title');
  });
};
/** Jouer: a new story run from the parking. */
const newGame = () => {
  runMode = 'story';
  trophies.newRun();
  // A new game shows the first PRIMO's slow motion again.
  primoCue.reset();
  startFrom(0);
};
$('play').onclick = newGame;
$('continue').onclick = () => {
  runMode = 'story';
  trophies.newRun();
  startFrom(saved());
};
// NA-2: a short interlude on the way to the next story stage (skippable, never on bonus stages).
$('next').onclick = () => {
  const from = stage;
  const go = () => startFrom(from + 1);
  if (!interludeFor(LEVELS[from], LEVELS[from + 1], heroId)) return go();
  show('interlude');
  interlude.play(LEVELS[from], LEVELS[from + 1], heroId, reducedMotion).then(go);
};
// Replaying keeps the daily challenge going.
$('again').onclick =
  $('restart').onclick =
  $('goRestart').onclick =
    () => (challenge ? beginStage(stage) : startFrom(stage));
$('resume').onclick = () => {
  audio.sfx('resume');
  show('play');
};
$('goResume').onclick = () => {
  audio.stage(level, heroId);
  show('play');
};
$('quit').onclick = $('menu').onclick = $('goMenu').onclick = $('creditsClose').onclick = toMenu;
$('pauseBtn').onclick = () => screen === 'play' && pause();
$('readerClose').onclick = () => {
  audio.sfx('back');
  show('play');
};
$('talk').onclick = () => screen === 'talk' && dialogue.advance();
function pause() {
  $('pauseInfo').textContent =
    `${level.name} · ${count(sim.tickets, 'ticket')} · secrets ${sim.secrets}/${sim.secretTotal} · ` +
    `${clock(sim.time)}`;
  audio.sfx('pause');
  show('pause');
}

// Options.
const muteBtn = $('muteBtn');
const syncMute = () => {
  muteBtn.textContent = audio.muted ? '♪̸' : '♪';
  muteBtn.setAttribute('aria-pressed', String(audio.muted));
};
muteBtn.onclick = () => {
  audio.setMuted(!audio.muted);
  syncMute();
  // In play, Space and Enter belong to the hero, not to this button.
  if (screen === 'play') muteBtn.blur();
};
syncMute();
const refreshOptions = setupOptions(
  audio,
  input,
  () => (sim.assist = prefs.assist && !challenge && !sim.hardcore),
);
function openOptions() {
  optionsFrom = screen;
  refreshOptions();
  show('options');
}
$('optionsBtn').onclick = $('pauseOptions').onclick = $('goOptions').onclick = openOptions;
$('trophiesBtn').onclick = () => {
  renderTrophies($('trophyList'), trophies.list());
  audio.sfx('select');
  show('trophies');
};
$('trophiesClose').onclick = () => {
  audio.sfx('back');
  show('title');
};

// « Chapitres »: replay a cleared stage with either hero, in « Sans filet » after the credits.
/** Mode last picked on the screen. @type {import('./app/medals.js').Mode} */
let chapterMode = 'normal';
/** @param {import('./app/medals.js').Mode} mode */
const chapters = (mode) =>
  chapterRows({
    levels: LEVELS,
    campaign: CAMPAIGN,
    progress: loadCount(SAVE_KEY),
    finished: Boolean(trophies.data.got.nao),
    bests: load(BEST_KEY, {}),
    medals,
    secretsOf: secretsFound,
    mode,
  });
/** @param {number} i @param {'kevin'|'charline'} hero @param {import('./app/medals.js').Mode} mode */
const playChapter = (i, hero, mode) => {
  runMode = mode === 'sansFilet' ? 'sansFilet' : 'chapter';
  heroId = hero;
  markHero();
  startFrom(i);
};
$('chaptersBtn').onclick = () => {
  renderChapters({ modes: $('chapterModes'), list: $('chapterList') }, chapters, {
    mode: chapterMode,
    sansFilet: Boolean(trophies.data.got.nao),
    play: playChapter,
    onMode: (m) => (chapterMode = m),
  });
  audio.sfx('select');
  show('chapters');
  /** @type {HTMLElement | null} */ ($('chapterList').querySelector('button'))?.focus({
    preventScroll: true,
  });
};
$('chaptersClose').onclick = () => {
  audio.sfx('back');
  show('title');
};
/** Where the cast lines up on the loaded stage. */
let castX = 8.6;
/** Shares of the canvas width the cast card leaves free (the line-up stands there). */
const castFree = { left: 0, right: 1 };
/** Measures the cast card: on opening and on resizing, never per frame. */
function measureCast() {
  const card = $('cast').querySelector('.card');
  const w = canvas.clientWidth;
  if (screen !== 'cast' || !card || !w) return;
  const box = card.getBoundingClientRect();
  const x0 = canvas.getBoundingClientRect().left;
  const l = (box.left - x0) / w,
    r = (box.right - x0) / w;
  // The wider side of the card.
  castFree.left = 1 - r >= l ? Math.max(0, r) : 0;
  castFree.right = 1 - r >= l ? 1 : Math.min(1, l);
}
addEventListener('resize', measureCast);
$('castBtn').onclick = () => {
  castX = clearFloor(sim, tileAt, TILE);
  renderCast($('castList'));
  audio.sfx('select');
  show('cast');
  measureCast();
};
$('castClose').onclick = () => {
  audio.sfx('back');
  show('title');
};

// Poster gallery: every Inetum poster of the game, full screen.
let posterIndex = 0;
/** @type {Record<string, string>} */
const posterUrls = {};
/** @param {number} step */
function showPoster(step) {
  if (step) audio.sfx('page');
  posterIndex = (posterIndex + step + POSTER_LIST.length) % POSTER_LIST.length;
  const p = POSTER_LIST[posterIndex];
  posterUrls[p.id] ??= /** @type {HTMLCanvasElement} */ (renderPoster(p.id)).toDataURL(
    'image/webp',
    0.9,
  );
  const img = /** @type {HTMLImageElement} */ ($('posterImg'));
  img.src = posterUrls[p.id];
  img.alt = p.title;
  $('posterCaption').textContent = `${p.title} · ${posterIndex + 1} / ${POSTER_LIST.length}`;
}
$('postersBtn').onclick = () => {
  showPoster(0);
  audio.sfx('select');
  show('posters');
};
$('posterPrev').onclick = () => showPoster(-1);
$('posterNext').onclick = () => showPoster(1);
$('postersClose').onclick = () => {
  audio.sfx('back');
  show('cast');
};
function closeOptions() {
  audio.sfx('back');
  input.capture = null;
  show(optionsFrom === 'pause' || optionsFrom === 'gameover' ? optionsFrom : 'title');
}
$('optionsClose').onclick = closeOptions;
// Switching tabs or apps pauses the game and the sound.
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    if (screen === 'play') pause();
    audio.ctx?.suspend().catch(() => {});
  } else audio.ctx?.resume().catch(() => {});
});
// Phones may drop the GPU context in the background: the game pauses (nothing to see,
// nothing must hurt the hero), then reloads cleanly when the context comes back.
canvas.addEventListener('webglcontextlost', (e) => {
  e.preventDefault();
  if (screen === 'play') pause();
});
canvas.addEventListener('webglcontextrestored', () => location.reload());
// Browsers only allow sound after a user gesture.
for (const type of ['pointerdown', 'keydown'])
  addEventListener(type, () => audio.unlock(), { once: true, capture: true });
// Safari may refuse to resume the sound when the app comes back from the background
// (or leave it « interrupted » after a call): the next gesture brings it back.
for (const type of ['pointerdown', 'keydown'])
  addEventListener(
    type,
    () => {
      const ctx = audio.ctx;
      if (ctx && ctx.state !== 'running' && !document.hidden) ctx.resume().catch(() => {});
    },
    { capture: true },
  );

/** Whiteboards stay on the wall while a boss fight is on. */
const fighting = () => sim.bossActive && !sim.bossDone;
/** The signing scene, until the hero picks the envelope up: no board prompt over it. */
const signing = () =>
  !sim.hasKey &&
  sim.things.some((t) => t.kind === 'boss' && (t.state === 'convinced' || t.state === 'sign'));
/** « 1 ticket », « 2 tickets ». @param {number} n @param {string} word */
const count = (n, word) => `${n} ${word}${Math.abs(n) > 1 ? 's' : ''}`;

function openBoard() {
  if (fighting()) return false;
  const board = view.boardAt(sim);
  if (!board?.id) return false;
  const img = /** @type {HTMLImageElement} */ ($('readerImg'));
  const url = boardUrl(board.id);
  const zoom = BOARD_ZOOM[board.id];
  img.src = url;
  img.alt = zoom ? `Tableau blanc. ${zoom.text}` : 'Tableau blanc';
  // On a phone the whole board is too small to read: add a close-up of its key panel.
  if (zoom && Math.min(innerWidth, innerHeight) < 600) {
    const art = new Image();
    art.onload = () => {
      if (screen !== 'reading') return;
      const page = renderReaderPage(art, zoom, innerWidth / Math.max(1, innerHeight - 110));
      img.src = /** @type {HTMLCanvasElement} */ (page).toDataURL('image/webp', 0.9);
    };
    art.src = url;
  }
  audio.sfx('select');
  show('reading');
  return true;
}

// ---- Stage end and credits -------------------------------------------------------
const STAGE_END = [
  { title: 'Badge récupéré !', text: 'Les ascenseurs mènent à l’open space LCP7.' },
  {
    title: 'Bon de commande signé !',
    text: 'Direction la salle serveurs de Technologies & Services.',
  },
  {
    title: 'Enveloppe validée par Julien !',
    text: 'Demain, le comité de pilotage doit acter le dossier.',
  },
  { title: 'Compte rendu validé !', text: 'Ce soir, Rodolphe ouvre le Power UP Tour sur le toit.' },
  {
    title: 'NAO sauvées !',
    text: 'L’enveloppe est signée, les négociations peuvent commencer jeudi.',
  },
  {
    title: 'Ordre de mission signé !',
    text: 'Fin de l’intercontrat : départ en mission lundi. Bravo, et bon week-end !',
  },
  {
    title: 'Badge cafét’ récupéré !',
    text: 'Bonbonnes évitées, cafés offerts : une pause bien méritée.',
  },
  {
    title: 'Séminaire réussi !',
    text: 'Photo de groupe, petits-fours et standing ovation : rendez-vous l’an prochain.',
  },
];

/** Game speed: the daily challenge and « Sans filet » always run at full speed. */
const speed = () => (challenge || sim.hardcore ? 1 : prefs.speed);
/** The medal of the last stage won (for the shared score). @type {import('./app/medals.js').Medal | null} */
let lastMedal = null;

/** @param {number} s */
const clock = (s) => `${Math.floor(s / 60)} min ${String(Math.floor(s % 60)).padStart(2, '0')} s`;

function stageWon() {
  // The credits' totals only add up a story run.
  if (!challenge && stage < CAMPAIGN && runMode === 'story')
    runStages[stage] = {
      tickets: sim.tickets,
      time: sim.time,
      deaths: sim.deaths,
      secrets: sim.secrets,
    };
  const final = stage === CAMPAIGN - 1 && !challenge;
  const finished = Boolean(trophies.data.got.nao);
  // The credits roll at the end of the story, and the first time a chapter run gets there.
  const last = final && (runMode === 'story' || !finished);
  const bonus = stage >= CAMPAIGN || Boolean(challenge);
  // The story saves the next stage; a chapter run never sets it back (nor touches a
  // finished game); « Sans filet » leaves it alone.
  if (!bonus && (runMode === 'story' || (runMode === 'chapter' && !finished)))
    store(
      SAVE_KEY,
      last ? 0 : runMode === 'story' ? stage + 1 : Math.max(loadCount(SAVE_KEY), stage + 1),
    );
  // Gold and silver against the solver's time, a star without a return to the badge.
  // The daily's medal goes on its card and share, not into the stage's collection.
  const medal = medalFor(level.id, heroId, sim.time, sim.deaths, helped);
  if (!challenge) medals.record(level.id, heroId, medal, modeOf(sim));
  lastMedal = medal;
  // Only a story run moves « Unanimité » on (not Chapitres, « Sans filet » or the daily).
  trophies.stageWon(sim, level.id, last, medals, runMode === 'story' && !challenge);
  if (challenge && dailyMet(challenge, sim)) trophies.dailyDone(challenge.key);
  /** @type {Parameters<typeof renderResults>[1]} */
  const results = {
    sim,
    levelId: level.id,
    hero: heroId,
    daily: challenge?.key,
    medal,
    targets: medalTargets(level.id, heroId) ?? undefined,
  };
  // The story's last stage goes straight to the epilogue: its record and secrets are
  // still saved (the results card does that), on a card nobody sees.
  if (last) {
    renderResults(document.createElement('dl'), results);
    return talk(EPILOGUE, credits);
  }
  $('next').hidden = bonus || final;
  $('wonKicker').textContent = challenge
    ? dailyKicker(challenge, sim)
    : (sim.hardcore ? 'Sans filet · ' : '') +
      (bonus ? 'Étape bonus terminée' : `Étape ${stage + 1} sur ${CAMPAIGN} terminée`);
  $('wonTitle').textContent = STAGE_END[stage].title;
  $('wonText').textContent = STAGE_END[stage].text;
  // Medal, gap to the record, secrets per hero (the card saves the record itself).
  const { record, allSecrets, flawless } = renderResults($('wonStats'), results);
  $('share').textContent = 'Partager mon score';
  setIntensity(0.2);
  audio.music('win');
  audio.sfx('win');
  // The gold lines get their own flourish once the jingle has played.
  if (record) audio.sfx('record', { delay: 1.3 });
  else if (allSecrets || flawless) audio.sfx('gold', { delay: 1.3 });
  show('won');
}

function credits() {
  const hero = CAST[heroId];
  /** @type {import('./app/menus.js').CreditLine[]} */
  const lines = [
    ['NAO Rush', 't'],
    ['Les NAO sont sauvées !', 'h'],
    [`${hero.name}, ${hero.title}, a fait signer l’enveloppe.`],
    [
      `${count(run.tickets, 'ticket')} Swile · ${count(run.secrets, 'secret')} · ${clock(run.time)} · ${count(run.deaths, 'retour')} au badge`,
    ],
    ['Avec', 'h'],
    ...CREDITS.flatMap(
      (c) =>
        /** @type {import('./app/menus.js').CreditLine[]} */ ([
          [`${c.name} · ${c.role}`],
          [c.line, 's'],
        ]),
    ),
    ['Fabriqué avec', 'h'],
    ['Un moteur WebGL2 maison · des affiches dessinées en code'],
    ['Une musique et des bruitages synthétisés en direct'],
    ['Merci d’avoir joué. Bonnes NAO !', 'h'],
  ];
  renderCredits($('creditsRoll'), lines);
  setIntensity(0.2);
  audio.music('credits');
  audio.sfx('sign');
  view.party = (level.boss?.arena[0] ?? 80) + 8;
  show('credits');
  // The roll scrolls up by itself between the title and the buttons (stops on its own
  // when the screen closes, or as soon as the player scrolls).
  autoRoll($('creditsRoll'), { reduced: reducedMotion });
}

// ---- Sharing ------------------------------------------------------------------------
const GAME_URL = 'https://c0sm0cats.github.io/naorush/';

/** Shares a score with the system share sheet, or copies it. @param {string} text @param {HTMLElement} button */
async function share(text, button) {
  const message = `${text}\nÀ toi de jouer : ${GAME_URL}`;
  try {
    if (navigator.share) await navigator.share({ title: 'NAO Rush', text: message });
    else {
      await navigator.clipboard.writeText(message);
      button.textContent = 'Copié ! Colle-le dans Teams';
    }
  } catch {
    /* Sharing cancelled. */
  }
}
$('share').onclick = () => {
  const hero = CAST[heroId].name;
  // A little emoji card, like the word games: medal, hearts kept, secrets, time.
  const card = shareCard({
    medal: lastMedal?.tier,
    hearts: sim.hero.hearts,
    maxHearts: sim.maxHearts,
    secrets: sim.secrets,
    secretTotal: sim.secretTotal,
    time: sim.time,
  });
  share(
    (challenge
      ? `NAO Rush · Défi du ${challenge.key.split('-').reverse().join('/')} (${challenge.twist.label})\n`
      : `NAO Rush · ${level.name}${sim.hardcore ? ' · Sans filet' : ''}\n`) +
      `${card}\n${hero}, ${count(sim.tickets, 'ticket')} Swile, ${count(sim.deaths, 'retour')} au badge.`,
    $('share'),
  );
};
$('creditsShare').onclick = () =>
  share(
    `J’ai sauvé les NAO dans NAO Rush avec ${CAST[heroId].name} : ${count(run.tickets, 'ticket')} Swile, ` +
      `${count(run.secrets, 'secret')}, ${clock(run.time)}. Julien et Rodolphe ont signé !`,
    $('creditsShare'),
  );

// ---- Loop -------------------------------------------------------------------------
let last = performance.now();
let acc = 0;
let flash = 0;
let wonTimer = 0;
let idleTime = 0;
let gameOverTimer = 0;
/** Game overs this session (to suggest the relaxed mode). */
let gameOvers = 0;
/** Events from traps that run on their own, wherever the hero is. */
const AMBIENT = new Set([
  'telegraph',
  'drawerOut',
  'sprayOn',
  'paperShot',
  'poof',
  'invite',
  'bossThrow',
  'wake',
  'chairBump',
]);
/** Freeze time per event, in seconds. @type {Record<string, number>} */
const HITSTOP = {
  hurt: 0.12,
  zap: 0.15,
  hardland: 0.08,
  bossHit: 0.14,
  bossDone: 0.3,
  bossPhase: 0.25,
  meeting: 0.05,
  parry: 0.05,
  internStun: 0.05,
};
let hitstop = 0;
let dustTimer = 0;
let stepTimer = 0;
let consultTick = 0;
/** Lines to say once the current frame's events are handled. @type {{lines: Line[], then: () => void} | null} */
let pending = null;
const QUIPS = new Set([
  'checkpoint',
  'key',
  'ammo',
  'visioMute',
  'archive',
  'vacuumBounce',
  'heart',
  'secret',
]);

/** @param {number} amount */
const shake = (amount) => {
  if (prefs.shake) camera.shake = Math.max(camera.shake, amount);
};
/** @param {number | number[]} pattern */
const vibrate = (pattern) => {
  if (prefs.vibrate) navigator.vibrate?.(pattern);
};

/** @param {import('./game/sim.js').SimEvent} e */
function onEvent(e) {
  // Clockwork traps tick all over the stage: only the ones in view make noise.
  // During a duel, only the arena counts: the traps left behind stay silent.
  if (AMBIENT.has(e.type)) {
    const arena = sim.bossActive ? sim.boss?.arena : undefined;
    if (arena ? e.x < arena[0] - 1 || e.x > arena[1] + 1 : Math.abs(e.x - sim.hero.x) > 12) return;
  }
  hud.event(e);
  trophies.event(e, sim, level.id);
  view.event(e, sim.time);
  particles.emit(e.type, e.x, e.y, landPower(e));
  // Rodolphe's third phase is his grand finale: it gets its own sting.
  const finale = e.type === 'bossPhase' && sim.things.find((t) => t.kind === 'boss')?.phase === 3;
  audio.sfx(finale ? 'finale' : eventSfx(e), { pan: panAt(e.x) });
  // IN6: the warning sounds also get a bracketed caption, when the player wants them.
  caption(e, sim);
  // A few frames of freeze sell the impact.
  hitstop = Math.max(hitstop, HITSTOP[e.type] ?? 0);
  const boss = level.boss?.id ?? '';
  switch (e.type) {
    case 'hurt':
    case 'zap':
    case 'hardland':
      if (prefs.flash) flash = 0.35;
      shake(1);
      vibrate(e.type === 'zap' ? [40, 30, 60] : 50);
      if (sim.bossActive && !sim.bossDone && Math.random() < 0.5) say(boss, 'hurt');
      else say(heroId, 'hurt');
      break;
    case 'bossHit':
      shake(0.7);
      vibrate(30);
      say(Math.random() < 0.6 ? boss : heroId, 'bossHit', true);
      break;
    case 'collapse':
    case 'smash':
    case 'slam':
    case 'rackLand':
    case 'trapdoor':
      shake(0.5);
      break;
    case 'death':
      if (sim.gameOver) gameOverTimer = 1.1;
      break;
    case 'respawn': {
      // A quick dip to black hides the jump back to the badge.
      const fade = $('fade');
      fade.classList.remove('on');
      void fade.offsetWidth;
      fade.classList.add('on');
      say(heroId, 'respawn');
      break;
    }
    case 'bossStart':
      audio.music(boss === 'regionalDirector' ? 'bossRodolphe' : 'bossJulien');
      setIntensity(0.5);
      pending = { lines: level.bossIntro ?? [], then: () => show('play') };
      break;
    case 'bossPhase':
      // The boss's last phase brings in the finale layer (Rodolphe has three phases).
      setIntensity(boss === 'regionalDirector' && !finale ? 0.9 : 1);
      shake(0.8);
      // The finale (third phase) has its own line when the stage provides one.
      bubbles.line(
        boss,
        (sim.things.find((t) => t.kind === 'boss')?.phase === 3 && level.finaleLine) ||
          (level.phaseLine ?? ''),
      );
      break;
    case 'consult':
      say(boss, 'consult');
      break;
    case 'bossDone':
      audio.stage(level, heroId);
      setIntensity(0.3);
      pending = { lines: level.outro, then: () => show('play') };
      break;
    case 'sign':
      shake(0.4);
      break;
    case 'bump':
      say('colleague', 'bump');
      break;
    case 'concert':
      say(heroId, 'celine', true);
      break;
    case 'invite':
      if (Math.random() < 0.4) say('visio', 'invite');
      break;
    case 'meeting':
      if (Math.random() < 0.5) say('colleague', 'meeting');
      else say(heroId, 'meeting');
      break;
    case 'internStun':
      if (Math.random() < 0.5) say('intern', 'internStun');
      else say(heroId, 'internStun');
      break;
    case 'block':
      if (e.y - sim.hero.y < 2.5) say(heroId, 'block');
      break;
    default:
      if (e.type === 'checkpoint' && bubbles.teaser(heroId, e.x))
        audio.sfx('bubble', { who: heroId });
      else if (QUIPS.has(e.type)) say(heroId, e.type);
  }
}

/** Tutorial tip for where the hero stands, in the player's own controls (keys, gamepad or touch). */
function tipAt() {
  const x = sim.hero.x;
  const y = sim.hero.y;
  const tip = level.tips?.find(
    (t) => x >= t.x0 && x <= t.x1 && y >= (t.y0 ?? -Infinity) && y <= (t.y1 ?? Infinity),
  );
  return tip ? tipText(tip) : undefined;
}

/** Puts the heroes on a clear stretch of floor for the title (the run restarts from S anyway). */
function showcase() {
  const spot = findSpot(level, sim);
  title.place(spot);
  Object.assign(sim.hero, { x: spot.x - HERO.w / 2, y: spot.y, facing: -1, vx: 0 });
}
title.still = reducedMotion;
// The light and the line of the day follow the clock; the mouse leans the camera.
title.mount($('title'));
/** The heroes stand in whatever part of the screen the title menu leaves free. */
function frameTitle() {
  const panel = document.querySelector('.title-panel')?.getBoundingClientRect();
  const brand = document.querySelector('.title-brand')?.getBoundingClientRect();
  if (!panel || !brand || panel.width === 0) return;
  title.region = heroRegion(innerWidth, innerHeight, panel, brand);
}
new ResizeObserver(frameTitle).observe($('title'));
addEventListener('resize', frameTitle);
/** Frames left to draw behind the loading screen before the title shows. */
let titleWarmup = 0;
/** The title, and the menus opened from it, keep the heroes posing behind. */
const titleScene = () =>
  !view.gallery &&
  (titleWarmup > 0 ||
    screen === 'title' ||
    screen === 'trophies' ||
    screen === 'chapters' ||
    (screen === 'options' && optionsFrom === 'title'));
/**
 * Leaving the title: the menu steps aside for a moment, then the stage starts.
 * @param {() => void} go
 */
function leaveTitle(go) {
  if (document.body.classList.contains('title-out')) return;
  audio.sfx('confirm');
  if (screen !== 'title' || reducedMotion) return go();
  document.body.classList.add('title-out');
  title.leave();
  // The camera pushes in on the hero; the other one cheers.
  audio.sfx('titlePush', { who: heroId === 'kevin' ? 'charline' : 'kevin' });
  setTimeout(() => {
    const fade = $('fade');
    fade.classList.remove('on');
    void fade.offsetWidth;
    fade.classList.add('on');
    go();
  }, 300);
}

/** Current music intensity (dynamic layers). */
let musicLevel = 0.2;
/** @param {number} v */
function setIntensity(v) {
  musicLevel = v;
  audio.intensity(v);
}
/** Stage intro camera glide. @type {{t: number, from: number} | null} */
let flyover = null;

/** On touch screens the pads cover the bottom: frame the hero a little higher. */
const touchLift = matchMedia('(pointer: coarse)').matches ? 1.1 : 0;

/** @param {number} dt */
function flyoverFocus(dt) {
  const f = /** @type {{t: number, from: number}} */ (flyover);
  f.t += dt;
  const k = Math.min(1, f.t / 5);
  const e = k * k * (3 - 2 * k);
  return { x: f.from + (sim.hero.x - f.from) * e, y: 3, facing: 0.001 };
}

/**
 * Menus with keyboard and gamepad: up/down move between buttons, confirm presses the
 * focused one, Escape (or Start, or B) backs out. Returns true when it handled the input.
 */
function menuInput() {
  const overlay = screen === 'title' ? $('title') : screen === 'reading' ? $('reader') : $(screen);
  if (!overlay) return false;
  if (input.pressed('pause') || input.pressed('back')) {
    if (screen === 'options') closeOptions();
    else if (screen === 'trophies' || screen === 'cast' || screen === 'chapters') show('title');
    else if (screen === 'posters') show('cast');
    else if (screen === 'credits' || screen === 'gameover' || screen === 'won') toMenu();
    else return false;
    return true;
  }
  if (screen === 'posters' && (input.pressed('left') || input.pressed('right'))) {
    showPoster(input.pressed('right') ? 1 : -1);
    return true;
  }
  // Every press counts, even several within one slow frame.
  const step = input.presses('down') - input.presses('up');
  // Laying out the menu costs a reflow: only when a press needs it, never every frame.
  if (!step && !input.pressed('confirm')) return false;
  // In reading order (phones regrid some screens), list rows included so long lists scroll.
  const buttons = readingOrder(
    /** @type {HTMLElement[]} */ ([
      ...overlay.querySelectorAll('button, input, select, [data-nav]'),
    ]).filter((b) => b.offsetParent !== null),
  );
  const at = buttons.indexOf(/** @type {HTMLElement} */ (document.activeElement));
  if (step && buttons.length) {
    const n = buttons.length;
    // Nothing focused yet: down goes to the first element, up to the last.
    const from = at < 0 && step < 0 ? 0 : at;
    buttons[(((from + step) % n) + n) % n].focus();
    audio.sfx('menuMove');
    return true;
  }
  if (input.pressed('confirm') && at >= 0 && buttons[at].tagName !== 'LI') {
    buttons[at].click();
    return true;
  }
  return false;
}

/** @param {number} now */
function frame(now) {
  // rAF timestamps can precede `last` on the first frame: never step backwards.
  const dt = Math.max(0, Math.min(0.1, (now - last) / 1000));
  last = now;
  const t = now / 1000;
  resolution.update(dt, renderer);
  input.pollGamepad();

  if (screen === 'play') {
    if (input.pressed('pause')) pause();
    else if (!(input.pressed('up') && sim.hero.state === 'ground' && openBoard())) {
      if (hitstop > 0) {
        hitstop -= dt;
        acc = 0;
      } else {
        // The first PRIMO window of each director plays in slow motion for a beat.
        acc += dt * speed() * primoCue.update(sim, dt);
        if (primoCue.started) hud.toast(fillKeys(PRIMO_PROMPT), 'consult');
      }
      if (sim.assist) helped.relaxed = true;
      if (speed() < 1) helped.slow = true;
      while (acc >= DT && !pending && hitstop <= 0 && gameOverTimer <= 0) {
        step(sim, input.state());
        if (sim.doorOpen) view.doorT += DT;
        for (const e of sim.events) onEvent(e);
        acc -= DT;
      }
      // PRIMO countdown: a clock ticks through the last second of the consult window.
      const chief =
        sim.bossActive && sim.boss ? sim.things.find((t) => t.kind === 'boss') : undefined;
      if (chief?.state === 'consult' && sim.boss) {
        const length = consultLength(sim, chief);
        const slot = Math.ceil((length - (chief.t ?? 0)) / 0.25);
        if (slot > 0 && slot <= 4 && slot !== consultTick) {
          consultTick = slot;
          audio.sfx('consultTick', { pitch: 1 + (4 - slot) * 0.06 });
        }
      } else consultTick = 0;
      if (gameOverTimer > 0 && (gameOverTimer -= dt) <= 0) {
        // After a couple of game overs, point gently at the relaxed mode.
        gameOvers++;
        $('gameoverText').textContent =
          gameOvers >= 2 && !prefs.assist && !challenge && !sim.hardcore
            ? 'Pas de panique : dans Options, le mode détente retire la perte de cœurs. Ta progression jusqu’au dernier badge est gardée.'
            : 'Un café, une respiration, et on y retourne : ta progression jusqu’au dernier badge est gardée.';
        setIntensity(0.2);
        audio.music('gameover');
        show('gameover');
      } else if (pending) {
        const p = pending;
        pending = null;
        talk(p.lines, p.then);
      } else if (sim.won && (wonTimer += dt) > 1.2) {
        wonTimer = 0;
        // Stages without a boss end on a word with your partner at the exit.
        if (level.boss) stageWon();
        else talk(level.outro, stageWon);
      }
      // The music tenses up on the last heart (boss fights set their own level).
      if (!sim.bossActive || sim.bossDone) {
        const want = sim.hero.hearts <= 1 && sim.maxHearts > 1 ? 0.7 : 0.25;
        if (want !== musicLevel) setIntensity(want);
      }
      // In front of the Céline Dion poster, Kévin has something to say.
      if (view.posterAt(sim)?.id === 'celine-dion') say(heroId, 'celine');
      // The partner waiting at the exit reacts when you arrive.
      const exit = sim.things.find((t) => t.kind === 'exit');
      if (
        exit &&
        !fighting() &&
        sim.time > 4 &&
        Math.abs(sim.hero.x - exit.x) < 4 &&
        Math.abs(sim.hero.y - exit.y) < 2
      )
        say('partner', sim.hasKey ? 'welcome' : 'waiting');
      // Standing still for a while earns a quip.
      const h = sim.hero;
      idleTime = h.state === 'ground' && Math.abs(h.vx) < 0.1 ? idleTime + dt : 0;
      if (idleTime > 7 && !fighting()) {
        idleTime = -6;
        say(heroId, 'idle');
      }
    }
  } else {
    acc = 0;
    if (
      (screen === 'pause' || screen === 'reading') &&
      (input.pressed('pause') || input.pressed('back'))
    ) {
      audio.sfx(screen === 'pause' ? 'resume' : 'back');
      show('play');
    } else if (
      screen === 'interlude' &&
      (input.pressed('back') || input.pressed('pause') || input.pressed('jump'))
    ) {
      interlude.skip();
    } else if (screen !== 'talk' && menuInput()) {
      /* handled */
    } else if (screen === 'title' && input.pressed('confirm')) newGame();
    else if (screen === 'talk') {
      dialogue.update(dt);
      if (input.pressed('confirm') || input.pressed('jump') || input.pressed('fire'))
        dialogue.advance();
    }
  }

  flash = Math.max(0, flash - dt * 1.5);
  const h = sim.hero;
  if (screen === 'play' && hitstop <= 0) {
    // Running dust and paper trails behind thrown CRs.
    // Soft footsteps while running.
    if (h.state === 'ground' && Math.abs(h.vx) > 2.5 && (stepTimer -= dt) <= 0) {
      stepTimer = 0.27 * (sim.stats.run / Math.max(2.5, Math.abs(h.vx)));
      audio.sfx('step', {
        pan: panAt(h.x + HERO.w / 2),
        ...(sim.onLift ? { floor: 'metal' } : {}),
      });
    }
    if (h.state === 'ground' && Math.abs(h.vx) > 4 && (dustTimer -= dt) <= 0) {
      dustTimer = 0.09;
      particles.emit('dust', h.x + HERO.w / 2 - h.facing * 0.25, h.y + 0.05);
    }
    for (const th of sim.things)
      if (th.kind === 'cr' && th.alive) particles.emit('trail', th.x, th.y);
  }
  // The colleague on a call: the hold music leaks from their headset as the hero comes close.
  if (screen === 'play') {
    let near = Infinity;
    let nx = 0;
    for (const th of sim.things) {
      if (th.kind !== 'colleague' || !th.alive || th.state === 'meeting') continue;
      const d = Math.hypot(th.x - (h.x + HERO.w / 2), th.y - h.y);
      if (d < near) [near, nx] = [d, th.x];
    }
    audio.headset(near, panAt(nx));
  }
  // A little life in the air, around what the camera sees.
  if (screen === 'play' || screen === 'title') {
    const rate = level.theme === 'parking' ? 4 : 7;
    if (Math.random() < rate * dt)
      particles.emit(
        `air-${level.theme}`,
        h.x + (Math.random() - 0.4) * 16,
        h.y + Math.random() * 7,
      );
  }
  particles.update(dt);
  // The title shows the chosen hero up close; the credits drift along the stage.
  const drift = screen === 'loading';
  const castLike = screen === 'cast' || screen === 'posters';
  view.gallery = gallery || castLike;
  view.galleryX = castLike ? castX : 1.4;
  const focus = view.gallery
    ? castLike
      ? view.castFocus(renderer.width / renderer.height, castFree.left, castFree.right)
      : { x: 4.1, y: 1.6, facing: 0 }
    : screen === 'credits'
      ? { x: view.party - 3.2, y: 3, facing: 0.001 }
      : drift
        ? { x: 10 + Math.sin(t * 0.07) * 8, y: 3, facing: 1 }
        : flyover && screen === 'talk'
          ? flyoverFocus(dt)
          : (fightFocus(sim, touchLift, renderer.width / renderer.height) ?? {
              x: h.x + HERO.w / 2,
              y: h.y - touchLift,
              facing: h.facing,
              peek: h.peek,
            });
  view.showcase = titleScene();
  if (screen !== 'title') document.body.classList.remove('title-out');
  // On the title, its own camera frames both heroes beside the menu.
  const cam = view.showcase
    ? title.camera(renderer.width / renderer.height, t)
    : camera.update(dt, renderer.width / renderer.height, focus, {
        w: sim.w,
        h: sim.h,
        sky: level.theme === 'rooftop' ? 4 : 0,
      });
  if (!view.showcase)
    watchCamera(camera.x, camera.y, camera.dist, renderer.width / renderer.height);
  drawPrefs.cues = Boolean(prefs.cues);
  // A projectile about to come in from off-screen: a short warning on its side.
  if (edgeCue.fresh) {
    edgeCue.fresh = false;
    audio.sfx('telegraph', { pan: edgeCue.side });
    // IN6: the off-screen warning gets its caption too, on its side.
    caption({ type: 'incoming', x: sim.hero.x + edgeCue.side * 30, y: edgeCue.y }, sim);
  }
  // Key, rim and fill lights on the heroes posing behind the title menu.
  const lit = view.showcase
    ? title.lighting(lighting, t, heroId)
    : bossLighting(level, sim, t, lighting, prefs.flash);
  renderer.render(cam, lit, view.items(sim, t, particles.list), view.sprites, { flash });
  // Messages count down on every screen; first-time tips check this frame's camera.
  hud.tick(dt, cam.viewProj);
  if (titleWarmup > 0 && --titleWarmup === 0) {
    audio.music('title');
    show('title');
  }
  if (screen === 'play' || screen === 'talk') {
    const poster = view.posterAt(sim);
    hud.update(
      dt,
      sim,
      { rooms: level.rooms, roomW: ROOM_W, keyLabel: level.keyLabel, timer: Boolean(challenge) },
      {
        poster: screen === 'play' ? poster?.id : undefined,
        board: !fighting() && !signing() && Boolean(view.boardAt(sim)),
        tip: screen === 'play' ? tipAt() : undefined,
      },
    );
  }
  bubbles.update(dt, cam.viewProj, bubbleAnchor, screen === 'play');
  input.endFrame();
  requestAnimationFrame(frame);
}

const params = new URLSearchParams(location.search);
// Art review: ?gallery shows the cast close up on the title screen.
const gallery = params.has('gallery');
view.gallery = gallery;
// Sound review: ?sounds opens a panel with every track and sound effect.
if (params.has('sounds')) import('./app/soundtest.js').then((m) => m.mountSoundTest(audio));

view.ready.then(() => {
  showcase();
  camera.snap(sim.hero.x, sim.hero.y + 1);
  updateContinue();
  // The first frames of a stage are slow (shaders, uploads): draw them behind the
  // loading screen, so the title arrives smoothly.
  titleWarmup = 3;
});
requestAnimationFrame(frame);

// Installable and playable offline once loaded (production builds only).
if (import.meta.env.PROD && 'serviceWorker' in navigator)
  navigator.serviceWorker.register('./sw.js').catch(() => {});

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
      camera,
      /** @param {number} i */
      stage: (i) => startFrom(i),
      credits: () => credits(),
    },
  });

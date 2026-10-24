import { Audio } from './app/audio.js';
import { Camera } from './app/camera.js';
import { applyTwist, dailyChallenge } from './app/daily.js';
import { Bubbles, Dialogue } from './app/dialogue.js';
import { Particles } from './app/fx.js';
import { Hud } from './app/hud.js';
import { Input } from './app/input.js';
import { applyPrefs, prefs, setupOptions } from './app/options.js';
import { load, store } from './app/storage.js';
import { Trophies } from './app/trophies.js';
import { LevelView, boardUrl } from './app/scene.js';
import { PROLOGUE } from './data/barks.js';
import { CAST } from './data/cast.js';
import { CAMPAIGN, LEVELS, ROOM_W } from './data/levels/index.js';
import { Renderer } from './gfx/renderer.js';
import { DT, HERO, TILE, createSim, step, tileAt } from './game/sim.js';

/**
 * NAO Rush entry point: loading → title (hero choice) → stage intro (dialogue) →
 * play ⇄ pause / options / reading / dialogue / game over → stage won → … → credits.
 * The level keeps rendering behind every screen.
 *
 * @typedef {'loading'|'title'|'play'|'pause'|'options'|'reading'|'talk'|'won'|'gameover'|'credits'|'trophies'|'cast'} Screen
 * @typedef {import('./data/levels/index.js').Line} Line
 */

/** @param {string} id */
const $ = (id) => /** @type {HTMLElement} */ (document.getElementById(id));
const canvas = /** @type {HTMLCanvasElement} */ ($('game'));
// Without WebGL2 there is no game: say so kindly instead of failing silently.
if (!document.createElement('canvas').getContext('webgl2')) {
  $('loading').innerHTML =
    '<p>NAO Rush a besoin de WebGL2.<br />Essaie un navigateur récent (Chrome, Edge, Firefox, Safari 15+).</p>';
  throw new Error('WebGL2 unavailable');
}
// Phones may drop the GPU context in the background: reload cleanly when it comes back.
canvas.addEventListener('webglcontextlost', (e) => e.preventDefault());
canvas.addEventListener('webglcontextrestored', () => location.reload());
const renderer = new Renderer(canvas);
const input = new Input();
const hud = new Hud();
const camera = new Camera();
const particles = new Particles();
const audio = new Audio();
const trophies = new Trophies((t) => {
  hud.toast(`Trophée débloqué : ${t.name}`);
  audio.sfx('secret');
});
const SAVE_KEY = 'naorush.stage';
const BEST_KEY = 'naorush.best';

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
]);
/** @param {Screen} next */
function show(next) {
  screen = next;
  document.body.dataset.screen = next;
  // Focus never lingers on a hidden screen's button: Enter or Space would press it.
  /** @type {HTMLElement | null} */ (document.activeElement)?.blur();
  for (const id of OVERLAYS) $(id).hidden = (id === 'reader' ? 'reading' : id) !== next;
  input.clear();
  if (next === 'title') $('play').focus();
  if (next === 'won') $($('next').hidden ? 'menu' : 'next').focus();
  if (next === 'gameover') $('goResume').focus();
  if (next === 'pause') $('resume').focus();
}

/** Rebuilds the scene when the stage changes; restarts the simulation either way. @param {number} i */
async function loadStage(i) {
  if (i !== stage || view.levelId !== LEVELS[i].id) {
    // Building a stage takes a moment: show the loading screen first.
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
  sim.assist = prefs.assist && !challenge;
  if (challenge) applyTwist(sim, challenge);
  particles.clear();
  view.doorT = 0;
  camera.snap(sim.hero.x, sim.hero.y + 3);
  hud.lastHearts = -1;
  pending = null;
  hitstop = 0;
  wonTimer = 0;
  hud.clearToast();
  bubbles.clear();
  gameOverTimer = 0;
}

/** Stage title card, dialogue, then play. @param {number} i @param {Line[]} [before] */
async function beginStage(i, before = []) {
  await loadStage(i);
  $('stageNum').textContent = i < CAMPAIGN ? `Étape ${i + 1} sur ${CAMPAIGN}` : 'Étape bonus';
  $('stageName').textContent = level.name;
  $('stageSub').textContent = level.subtitle;
  const banner = $('stage');
  banner.classList.remove('show');
  void banner.offsetWidth;
  banner.classList.add('show');
  audio.music(level.music);
  setIntensity(0.2);
  // While the intro plays, the camera glides from the exit back to the start.
  flyover = { t: 0, from: Math.max(sim.hero.x, sim.w - 12) };
  camera.snap(flyover.from, 6);
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

/** @param {Line[]} lines @param {() => void} done */
function talk(lines, done) {
  if (dialogue.start(lines, done)) show('talk');
  else done();
}

/** @param {string} who @param {string} moment @param {boolean} [force] */
const say = (who, moment, force) => bubbles.say(who, moment, force);

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
for (const card of document.querySelectorAll('.hero-card')) {
  card.addEventListener('click', () => {
    heroId = /** @type {'kevin'|'charline'} */ (/** @type {HTMLElement} */ (card).dataset.hero);
    for (const c of document.querySelectorAll('.hero-card'))
      c.setAttribute('aria-checked', String(c === card));
    audio.sfx('select');
    loadStage(stage).then(showcase);
  });
}

const saved = () => Math.min(CAMPAIGN - 1, Number(load(SAVE_KEY, 0)) || 0);
function updateContinue() {
  const d = today();
  $('dailyBtn').textContent =
    `Défi du jour : ${LEVELS[d.stage].name} · ${CAST[d.hero].name} · ${d.twist.label}`;
  // Bonus stages, unlocked once the envelope is signed.
  const bonusRow = $('bonusRow');
  bonusRow.hidden = !trophies.data.got.nao;
  bonusRow.replaceChildren(
    ...LEVELS.slice(CAMPAIGN).map((l, k) => {
      const b = document.createElement('button');
      b.className = 'ghost';
      b.textContent = l.name;
      b.onclick = () => startFrom(CAMPAIGN + k);
      return b;
    }),
  );
  const got = trophies.list().filter((t) => t.got).length;
  $('trophiesBtn').textContent = `Trophées ${got}/${trophies.list().length}`;
  const n = saved();
  $('continue').hidden = n === 0;
  $('continue').textContent = `Continuer · étape ${n + 1} : ${LEVELS[n].name}`;
}

/** Today's challenge while it is being played. @type {import('./app/daily.js').Challenge | null} */
let challenge = null;
const today = () => dailyChallenge(CAMPAIGN);
$('dailyBtn').onclick = () => {
  challenge = today();
  updateContinue();
  heroId = challenge.hero;
  for (const c of document.querySelectorAll('.hero-card'))
    c.setAttribute('aria-checked', String(/** @type {HTMLElement} */ (c).dataset.hero === heroId));
  audio.sfx('confirm');
  beginStage(challenge.stage);
};
/** @param {number} i */
const startFrom = (i) => {
  challenge = null;
  audio.sfx('confirm');
  if (i === 0) for (const k of Object.keys(runStages)) delete runStages[Number(k)];
  beginStage(i, i === 0 && screen === 'title' ? PROLOGUE : []);
};
const toMenu = () => {
  view.party = 0;
  challenge = null;
  updateContinue();
  audio.music('title');
  setIntensity(0);
  loadStage(stage).then(() => {
    showcase();
    show('title');
  });
};
$('play').onclick = () => startFrom(0);
$('continue').onclick = () => startFrom(saved());
$('next').onclick = () => startFrom(stage + 1);
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
  audio.music(level.music);
  show('play');
};
$('quit').onclick = $('menu').onclick = $('goMenu').onclick = $('creditsClose').onclick = toMenu;
$('pauseBtn').onclick = () => screen === 'play' && pause();
$('readerClose').onclick = () => show('play');
$('talk').onclick = () => screen === 'talk' && dialogue.advance();
function pause() {
  $('pauseInfo').textContent =
    `${level.name} · ${sim.tickets} tickets · secrets ${sim.secrets}/${sim.secretTotal} · ` +
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
};
syncMute();
const refreshOptions = setupOptions(audio, input, () => (sim.assist = prefs.assist && !challenge));
function openOptions() {
  optionsFrom = screen;
  refreshOptions();
  show('options');
}
$('optionsBtn').onclick = $('pauseOptions').onclick = openOptions;
$('trophiesBtn').onclick = () => {
  $('trophyList').replaceChildren(
    ...trophies.list().map((t) => {
      const li = document.createElement('li');
      li.className = t.got ? 'got' : '';
      const name = document.createElement('b');
      name.textContent = t.name;
      const text = document.createElement('span');
      text.textContent = t.text;
      li.append(name, text);
      return li;
    }),
  );
  audio.sfx('select');
  show('trophies');
};
$('trophiesClose').onclick = () => show('title');
/** Where the cast lines up: the first stretch of clear floor on the loaded stage. */
let castX = 8.6;
function clearFloor() {
  const open = (/** @type {number} */ c) =>
    tileAt(sim, c, 2) === TILE.SOLID &&
    tileAt(sim, c, 3) === TILE.EMPTY &&
    tileAt(sim, c, 4) === TILE.EMPTY;
  for (let c = 6; c < sim.w - 8; c++) {
    let ok = true;
    for (let k = 0; k < 6 && ok; k++) ok = open(c + k);
    if (ok) return c + 0.6;
  }
  return 8.6;
}
$('castBtn').onclick = () => {
  castX = clearFloor();
  $('castList').replaceChildren(
    ...[
      'kevin',
      'charline',
      'techServicesDirector',
      'regionalDirector',
      'mathis',
      'intern',
      'visio',
    ].map((id) => {
      const c = CAST[id];
      const li = document.createElement('li');
      const name = document.createElement('b');
      name.textContent = c.title ? `${c.name} · ${c.title}` : c.name;
      const bio = document.createElement('span');
      bio.textContent = c.bio ?? '';
      li.append(name, bio);
      return li;
    }),
  );
  audio.sfx('select');
  show('cast');
};
$('castClose').onclick = () => show('title');
function closeOptions() {
  input.capture = null;
  show(optionsFrom === 'pause' ? 'pause' : 'title');
}
$('optionsClose').onclick = closeOptions;
// Switching tabs or apps pauses the game and the sound.
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    if (screen === 'play') pause();
    audio.ctx?.suspend();
  } else audio.ctx?.resume();
});
// Browsers only allow sound after a user gesture.
for (const type of ['pointerdown', 'keydown'])
  addEventListener(type, () => audio.unlock(), { once: true, capture: true });

/** Whiteboards stay on the wall while a boss fight is on. */
const fighting = () => sim.bossActive && !sim.bossDone;

function openBoard() {
  if (fighting()) return false;
  const board = view.boardAt(sim);
  if (!board?.id) return false;
  /** @type {HTMLImageElement} */ ($('readerImg')).src = boardUrl(board.id);
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
    text: 'Échappé aux bonbonnes, et les cafés sont offerts. Une pause bien méritée.',
  },
];

/** @param {number} s */
const clock = (s) => `${Math.floor(s / 60)} min ${String(Math.floor(s % 60)).padStart(2, '0')} s`;

function stageWon() {
  if (!challenge && stage < CAMPAIGN)
    runStages[stage] = {
      tickets: sim.tickets,
      time: sim.time,
      deaths: sim.deaths,
      secrets: sim.secrets,
    };
  const last = stage === CAMPAIGN - 1 && !challenge;
  const bonus = stage >= CAMPAIGN || Boolean(challenge);
  if (!bonus) store(SAVE_KEY, last ? 0 : stage + 1);
  trophies.stageWon(sim, level.id, last);
  if (last) return credits();
  $('next').hidden = bonus;
  $('wonKicker').textContent = challenge
    ? `Défi du jour · ${challenge.twist.label}`
    : bonus
      ? 'Étape bonus terminée'
      : `Étape ${stage + 1} sur ${CAMPAIGN} terminée`;
  $('wonTitle').textContent = STAGE_END[stage].title;
  $('wonText').textContent = STAGE_END[stage].text;
  // Best time per stage and hero.
  const bests = /** @type {Record<string, number>} */ (load(BEST_KEY, {}));
  const key = challenge ? `daily:${challenge.key}` : `${level.id}:${heroId}`;
  const record = !(bests[key] <= sim.time);
  if (record) {
    bests[key] = sim.time;
    store(BEST_KEY, bests);
  }
  const rows = [
    ['Tickets Swile', sim.tickets],
    ['Secrets', `${sim.secrets} / ${sim.secretTotal}`],
    ['Temps', clock(sim.time)],
    ['Record', record ? 'Nouveau record !' : clock(bests[key])],
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
  $('share').textContent = 'Partager mon score';
  setIntensity(0.2);
  audio.music('win');
  audio.sfx('win');
  show('won');
}

function credits() {
  const hero = CAST[heroId];
  /** @type {Array<[string, string?]>} */
  const lines = [
    ['NAO Rush', 't'],
    ['Les NAO sont sauvées !', 'h'],
    [`${hero.name}, ${hero.title}, a fait signer l’enveloppe.`],
    [
      `${run.tickets} tickets Swile · ${run.secrets} secrets · ${clock(run.time)} · ${run.deaths} retours au badge`,
    ],
    ['Avec', 'h'],
    ['Kévin · Directeur de Projets'],
    ['Charline · Business Manager'],
    ['Julien · Directeur Technologies & Services Pays de la Loire'],
    ['Rodolphe · Directeur Région Ouest'],
    ['Le stagiaire et ses dossiers · Le chef de projet en visio'],
    ['Le robot aspirateur · La bonbonne d’eau · Les fauteuils à roulettes'],
    ['Fabriqué avec', 'h'],
    ['Un moteur WebGL2 maison · des affiches dessinées en code'],
    ['Une musique et des bruitages synthétisés en direct'],
    ['Merci d’avoir joué. Bonnes NAO !', 'h'],
  ];
  $('creditsRoll').replaceChildren(
    ...lines.map(([text, kind]) => {
      const el = document.createElement(kind === 't' ? 'h2' : kind === 'h' ? 'h3' : 'p');
      el.textContent = text;
      return el;
    }),
  );
  setIntensity(0.2);
  audio.music('credits');
  audio.sfx('sign');
  view.party = (level.boss?.arena[0] ?? 80) + 8;
  show('credits');
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
  // A little emoji card, like the word games: hearts kept, secrets, badges used.
  const hearts =
    '❤️'.repeat(Math.max(0, sim.hero.hearts)) +
    '🖤'.repeat(Math.max(0, sim.maxHearts - sim.hero.hearts));
  const card = `${hearts}  ${'⭐'.repeat(sim.secrets)}${'▫️'.repeat(sim.secretTotal - sim.secrets)}  ⏱️ ${clock(sim.time)}`;
  share(
    (challenge
      ? `NAO Rush · Défi du ${challenge.key.split('-').reverse().join('/')} (${challenge.twist.label})\n`
      : `NAO Rush · ${level.name}\n`) +
      `${card}\n${hero}, ${sim.tickets} tickets Swile, ${sim.deaths} retour(s) au badge.`,
    $('share'),
  );
};
$('creditsShare').onclick = () =>
  share(
    `J’ai sauvé les NAO dans NAO Rush avec ${CAST[heroId].name} : ${run.tickets} tickets Swile, ` +
      `${run.secrets} secrets, ${clock(run.time)}. Julien et Rodolphe ont signé !`,
    $('creditsShare'),
  );

// ---- Loop -------------------------------------------------------------------------
let last = performance.now();
let acc = 0;
let flash = 0;
let wonTimer = 0;
let idleTime = 0;
let gameOverTimer = 0;
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
/** Events that reuse another event's sound. @type {Record<string, string>} */
const SFX_ALIAS = {
  throw: 'fire',
  archive: 'crack',
  switch: 'door',
  bonk: 'block',
  wake: 'talk',
  chairBump: 'bump',
};
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
  if (AMBIENT.has(e.type) && !sim.bossActive && Math.abs(e.x - sim.hero.x) > 12) return;
  hud.event(e);
  trophies.event(e, sim, level.id);
  view.event(e, sim.time);
  particles.emit(e.type, e.x, e.y);
  audio.sfx(SFX_ALIAS[e.type] ?? e.type);
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
      setIntensity(1);
      shake(0.8);
      bubbles.line(boss, level.phaseLine ?? '');
      break;
    case 'consult':
      say(boss, 'consult');
      break;
    case 'bossDone':
      audio.music(level.music);
      setIntensity(0.3);
      pending = { lines: level.outro, then: () => show('play') };
      break;
    case 'sign':
      shake(0.4);
      break;
    case 'bump':
      say('colleague', 'bump');
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
      if (QUIPS.has(e.type)) say(heroId, e.type);
  }
}

const touch = matchMedia('(pointer: coarse)').matches;
/** Tutorial tip for where the hero stands, worded for keyboard or touch. */
function tipAt() {
  const x = sim.hero.x;
  const tip = level.tips?.find((t) => x >= t.x0 && x <= t.x1);
  return tip ? (touch ? tip.touch : tip.keys) : undefined;
}

/** Where the hero poses behind the title card. */
const SHOWCASE = { x: 6.6, y: 3 };
const SHOWCASE_LIGHT = {
  pos: [SHOWCASE.x + 0.8, SHOWCASE.y + 2.2, 2],
  radius: 5,
  color: [0.9, 0.85, 0.8],
};
/** Puts the hero in the title-screen spot (the run restarts from S anyway). */
const showcase = () => Object.assign(sim.hero, { x: SHOWCASE.x, y: SHOWCASE.y, facing: -1, vx: 0 });

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

/** Rodolphe's show: coloured spotlights sweep the Espace VIP during the fight. @param {number} t */
function stageLights(t) {
  if (!level.boss || !sim.bossActive || sim.bossDone) return null;
  const boss = sim.things.find((b) => b.kind === 'boss');
  if (level.boss.id === 'techServicesDirector') {
    // Julien's failover: a red alarm beacon pulses over the server room in phase 2.
    if ((boss?.phase ?? 1) < 2) return null;
    const pulse = 0.5 + 0.5 * Math.sin(t * 7);
    const alarm = { pos: [boss?.x ?? 0, 8, 0], radius: 10, color: [2.2 * pulse, 0.2, 0.2] };
    return { ...lighting, lights: [alarm, ...lighting.lights] };
  }
  const [x0, x1] = level.boss.arena;
  const mid = (x0 + x1) / 2;
  const half = (x1 - x0) / 2 - 1;
  const spots = [
    { pos: [mid + Math.sin(t * 0.9) * half, 7, 0.5], radius: 8, color: [2.4, 0.6, 1.5] },
    { pos: [mid + Math.sin(t * 0.9 + 2.2) * half, 7, 0.5], radius: 8, color: [0.6, 1.2, 2.6] },
    { pos: [mid + Math.sin(t * 0.9 + 4.4) * half, 7, 0.5], radius: 8, color: [1.6, 2.2, 0.6] },
  ];
  return { ...lighting, lights: [...spots, ...lighting.lights] };
}

/** During a boss fight the camera frames both fighters. */
function fightFocus() {
  if (!sim.bossActive || sim.bossDone || screen === 'title') return null;
  const b = sim.things.find((t) => t.kind === 'boss');
  if (!b) return null;
  const hx = sim.hero.x + HERO.w / 2;
  return { x: (hx * 2 + b.x) / 3, y: sim.hero.y - touchLift, facing: Math.sign(b.x - hx) * 0.4 };
}

/** Dynamic resolution: drop the render scale when frames run long, raise it back when there is headroom. */
const perf = { avg: 1 / 60, slow: 0, fast: 0 };
/** @param {number} dt */
function adaptResolution(dt) {
  // Automated captures run on a software renderer: keep full resolution there.
  if (navigator.webdriver || dt <= 0 || dt >= 0.1) return;
  perf.avg += (dt - perf.avg) * 0.05;
  perf.slow = perf.avg > 1 / 50 ? perf.slow + dt : 0;
  perf.fast = perf.avg < 1 / 58 ? perf.fast + dt : 0;
  if (perf.slow > 2 && renderer.scale > 0.55) {
    renderer.scale = Math.max(0.55, renderer.scale * 0.85);
    perf.slow = 0;
  } else if (perf.fast > 6 && renderer.scale < 1) {
    renderer.scale = Math.min(1, renderer.scale * 1.08);
    perf.fast = 0;
  }
}

/**
 * Menus with keyboard and gamepad: up/down move between buttons, confirm presses the
 * focused one, Escape (or Start) backs out. Returns true when it handled the input.
 */
function menuInput() {
  const overlay = screen === 'title' ? $('title') : screen === 'reading' ? $('reader') : $(screen);
  if (!overlay) return false;
  if (input.pressed('pause')) {
    if (screen === 'options') closeOptions();
    else if (screen === 'trophies' || screen === 'cast') show('title');
    else if (screen === 'credits') toMenu();
    else return false;
    return true;
  }
  const buttons = /** @type {HTMLElement[]} */ ([
    ...overlay.querySelectorAll('button, input, select'),
  ]).filter((b) => b.offsetParent !== null);
  const at = buttons.indexOf(/** @type {HTMLElement} */ (document.activeElement));
  const step = input.pressed('down') ? 1 : input.pressed('up') ? -1 : 0;
  if (step && buttons.length) {
    buttons[(at + step + buttons.length) % buttons.length].focus();
    audio.sfx('menuMove');
    return true;
  }
  if (input.pressed('confirm') && at >= 0) {
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
  adaptResolution(dt);
  input.pollGamepad();

  if (screen === 'play') {
    if (input.pressed('pause')) pause();
    else if (!(input.pressed('up') && sim.hero.state === 'ground' && openBoard())) {
      if (hitstop > 0) {
        hitstop -= dt;
        acc = 0;
      } else acc += dt;
      while (acc >= DT && !pending && hitstop <= 0 && gameOverTimer <= 0) {
        step(sim, input.state());
        if (sim.doorOpen) view.doorT += DT;
        for (const e of sim.events) onEvent(e);
        acc -= DT;
      }
      if (gameOverTimer > 0 && (gameOverTimer -= dt) <= 0) {
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
      // The partner waiting at the exit reacts when you arrive.
      const exit = sim.things.find((t) => t.kind === 'exit');
      if (
        exit &&
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
    if ((screen === 'pause' || screen === 'reading') && input.pressed('pause')) show('play');
    else if (screen !== 'talk' && menuInput()) {
      /* handled */
    } else if (screen === 'title' && input.pressed('confirm')) startFrom(0);
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
    if (h.state === 'ground' && Math.abs(h.vx) > 4 && (dustTimer -= dt) <= 0) {
      dustTimer = 0.09;
      particles.emit('dust', h.x + HERO.w / 2 - h.facing * 0.25, h.y + 0.05);
    }
    for (const th of sim.things)
      if (th.kind === 'cr' && th.alive) particles.emit('trail', th.x, th.y);
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
  view.gallery = gallery || screen === 'cast';
  view.galleryX = screen === 'cast' ? castX : 1.4;
  const focus = view.gallery
    ? screen === 'cast'
      ? { x: castX + 0.7, y: 1.6, facing: 0.001, visH: 5.4 }
      : { x: 4.1, y: 1.6, facing: 0 }
    : screen === 'credits'
      ? { x: view.party - 3.2, y: 3, facing: 0.001 }
      : screen === 'title'
        ? { x: SHOWCASE.x - 0.8 + Math.sin(t * 0.25) * 0.15, y: SHOWCASE.y - 1.4, facing: 0 }
        : drift
          ? { x: 10 + Math.sin(t * 0.07) * 8, y: 3, facing: 1 }
          : flyover && screen === 'talk'
            ? flyoverFocus(dt)
            : (fightFocus() ?? { x: h.x + HERO.w / 2, y: h.y - touchLift, facing: h.facing });
  const cam = camera.update(dt, renderer.width / renderer.height, focus, { w: sim.w, h: sim.h });
  view.showcase = screen === 'title';
  // A soft key light on the hero posing behind the title card.
  const lit = view.showcase
    ? { ...lighting, lights: [SHOWCASE_LIGHT, ...lighting.lights] }
    : (stageLights(t) ?? lighting);
  renderer.render(cam, lit, view.items(sim, t, particles.list), view.sprites, { flash });
  if (screen === 'play' || screen === 'talk') {
    const poster = view.posterAt(sim);
    hud.update(
      dt,
      sim,
      { rooms: level.rooms, roomW: ROOM_W, keyLabel: level.keyLabel, timer: Boolean(challenge) },
      {
        poster: screen === 'play' ? poster?.id : undefined,
        board: !fighting() && Boolean(view.boardAt(sim)),
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
  camera.snap(SHOWCASE.x, SHOWCASE.y + 1);
  updateContinue();
  audio.music('title');
  show('title');
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
      /** @param {number} i */
      stage: (i) => startFrom(i),
      credits: () => credits(),
    },
  });

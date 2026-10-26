import { ACTIONS, keyName } from './input.js';
import { load, store } from './storage.js';
import { HERO } from '../game/world.js';

/**
 * Player preferences and the options screen: volumes, accessibility switches,
 * touch pad size and key bindings. Everything is saved in the browser.
 */

const PREFS_KEY = 'naorush.prefs';

/** @param {string} id */
const $ = (id) => /** @type {HTMLElement} */ (document.getElementById(id));
/** @param {string} id */
const field = (id) => /** @type {HTMLInputElement} */ ($(id));

/** The system asks for less motion: no shake, flashes or camera glides by default. */
export const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

/** The defaults, before the save: a damaged entry falls back to them. */
const DEFAULTS = {
  shake: !reducedMotion,
  flash: !reducedMotion,
  contrast: matchMedia('(prefers-contrast: more)').matches,
  // « Repères renforcés »: hatched outlines on live hazards, warnings told by shape
  // as well as colour. Read by the trap and boss visuals as `prefs.cues`.
  cues: false,
  // IN6: bracketed captions for the sounds that warn of something (see `caption`).
  captions: false,
  vibrate: true,
  assist: false,
  pad: 'm',
  speed: 1,
};

/** Allowed values of the settings that are not on/off switches. */
const CHOICES = { pad: ['s', 'm', 'l'], speed: [1, 0.8, 0.65] };

/**
 * The saved preferences over the defaults, keeping only well-formed values: a damaged
 * save must never freeze the game (an unknown speed) nor blank a setting.
 * @param {Record<string, unknown>} saved
 * @returns {typeof DEFAULTS}
 */
export function readPrefs(saved) {
  const out = { ...DEFAULTS };
  for (const [k, v] of Object.entries(saved)) {
    if (!(k in DEFAULTS)) continue;
    const key = /** @type {keyof typeof DEFAULTS} */ (k);
    const allowed = /** @type {Record<string, unknown[]>} */ (CHOICES)[key];
    if (allowed ? allowed.includes(v) : typeof v === typeof DEFAULTS[key])
      Object.assign(out, { [key]: v });
  }
  return out;
}

export const prefs = readPrefs(load(PREFS_KEY, {}));

/** Applies the preferences that live in the page (contrast, pad size). */
export function applyPrefs() {
  document.body.classList.toggle('contrast', prefs.contrast);
  if (!prefs.captions) document.getElementById('captions')?.replaceChildren();
  document.body.classList.toggle('cues', prefs.cues);
  document.body.dataset.pad = prefs.pad;
}

const save = () => store(PREFS_KEY, prefs);

/**
 * Marks a scroll box with .more-below / .more-above while part of it is out of view,
 * so the screen can show a scroll cue.
 * @param {Element | null} el
 */
function scrollCue(el) {
  if (!el) return;
  const update = () => {
    el.classList.toggle('more-below', el.scrollTop + el.clientHeight < el.scrollHeight - 4);
    el.classList.toggle('more-above', el.scrollTop > 4);
  };
  el.addEventListener('scroll', update, { passive: true });
  // Shown, resized or refilled (trophies, cast): measure again.
  if (typeof ResizeObserver !== 'undefined') new ResizeObserver(update).observe(el);
  new MutationObserver(update).observe(el, { childList: true, subtree: true });
}

const ACTION_LABELS = {
  left: 'Gauche',
  right: 'Droite',
  up: 'Grimper / lire',
  down: 'Lâcher',
  jump: 'Sauter',
  fire: 'Lancer un CR',
  pause: 'Pause',
};

/**
 * Wires the options screen.
 * @param {import('./audio.js').Audio} audio
 * @param {import('./input.js').Input} input
 * @param {() => void} changed Called after any preference changes.
 */
export function setupOptions(audio, input, changed) {
  for (const sel of ['#options .options', '#trophyList', '#chapterList', '#cast .card'])
    scrollCue(document.querySelector(sel));
  const padSelect = /** @type {HTMLSelectElement} */ ($('optPad'));
  const SWITCHES = /** @type {const} */ ([
    ['optShake', 'shake'],
    ['optFlash', 'flash'],
    ['optContrast', 'contrast'],
    ['optCues', 'cues'],
    ['optCaptions', 'captions'],
    ['optVibrate', 'vibrate'],
    ['optAssist', 'assist'],
  ]);
  const update = () => {
    save();
    applyPrefs();
    changed();
  };
  field('volMusic').oninput = () => audio.setVolume('music', Number(field('volMusic').value));
  field('volSfx').oninput = () => {
    audio.setVolume('sfx', Number(field('volSfx').value));
    audio.sfx('ticket');
  };
  for (const [id, k] of SWITCHES)
    field(id).onchange = () => {
      prefs[k] = field(id).checked;
      update();
    };
  padSelect.onchange = () => {
    prefs.pad = padSelect.value;
    update();
  };
  const speedSelect = /** @type {HTMLSelectElement} */ ($('optSpeed'));
  speedSelect.onchange = () => {
    prefs.speed = Number(speedSelect.value) || 1;
    update();
  };

  /** Every `<kbd data-action="jump">` on the page names the player's own control. */
  const relabel = () => {
    for (const el of document.querySelectorAll('kbd[data-action]')) {
      const k = /** @type {HTMLElement} */ (el);
      const action = /** @type {keyof typeof ACTIONS} */ (k.dataset.action);
      if (action in ACTIONS) k.textContent = input.label(action);
    }
  };
  input.deviceListeners.push(relabel);
  relabel();

  const renderKeys = () => {
    relabel();
    $('keyList').replaceChildren(
      ...Object.keys(ACTIONS).map((a) => {
        const action = /** @type {keyof typeof ACTIONS} */ (a);
        const row = document.createElement('button');
        row.className = 'keyrow';
        const label = document.createElement('span');
        label.textContent = ACTION_LABELS[action];
        const key = document.createElement('kbd');
        key.textContent = keyName(input.binding(action));
        row.append(label, key);
        row.onclick = () => {
          key.textContent = '…';
          input.capture = (code) => {
            if (code) input.bind(action, code);
            audio.sfx('select');
            renderKeys();
          };
        };
        return row;
      }),
    );
  };
  $('keysReset').onclick = () => {
    input.resetBindings();
    renderKeys();
  };

  /** Fills the form with the current settings before showing it. */
  return function refresh() {
    input.capture = null;
    field('volMusic').value = String(audio.getVolume('music'));
    field('volSfx').value = String(audio.getVolume('sfx'));
    for (const [id, k] of SWITCHES) field(id).checked = prefs[k];
    padSelect.value = prefs.pad;
    /** @type {HTMLSelectElement} */ ($('optSpeed')).value = String(prefs.speed);
    renderKeys();
  };
}

/**
 * IN6 « Sous-titres des sons » : the sounds that warn of something get a line on screen,
 * in brackets, with an arrow to where it comes from (readable without colour or sound).
 * Warnings (`telegraph`) are named after the thing that makes them.
 */
const TELEGRAPH_CAPTIONS = /** @type {Record<string, string>} */ ({
  printer: 'Imprimante qui chauffe',
  chair: 'Fauteuil qui grince',
  drawer: 'Tiroir qui cliquette',
  sprinkler: 'Sprinkler qui goutte',
  beamer: 'Vidéoprojecteur qui bourdonne',
  intern: 'Stagiaire qui s’élance',
  visio: 'Sonnerie de visio',
  panel: 'Classeurs qui vacillent',
  boss: 'Le directeur prépare son argument',
});
/** Other sounds worth a caption, by event type. */
export const EVENT_CAPTIONS = /** @type {Record<string, string>} */ ({
  crack: 'Dalle qui craque',
  paperShot: 'Feuille tirée',
  sprayOn: 'Douche du sprinkler',
  chairRoll: 'Fauteuil lancé',
  invite: 'Invitation visio lancée',
  bossThrow: 'Slide KPI lancée',
  binderFall: 'Classeurs qui tombent',
  rackDrop: 'Baie serveur qui tombe',
  cableWarn: 'Câbles qui grésillent',
  zoneWarn: 'Projecteurs qui s’allument',
  dash: 'Pas de course : la tournée arrive',
  door: 'Porte qui s’ouvre',
  fan: 'Slides KPI en éventail',
  slam: 'Onde de choc au sol',
  teleport: 'Le directeur bascule de côté',
  consult: 'Le directeur consulte PRIMO',
  incoming: 'Projectile qui arrive',
});
/** Captions of an event with a cause (`type:cause`), over the type's own. */
export const CAUSE_CAPTIONS = /** @type {Record<string, string>} */ ({
  'telegraph:tracking': 'La supervision te suit',
  'telegraph:encore': 'Le public en redemande',
  'cableWarn:maintenance': 'Maintenance : sol sous tension',
});
/** How far (tiles) a warning's source thing can be from the event. */
const SOURCE_RANGE = 2.5;

/**
 * The caption for a game event, or '' when its sound is not one that warns.
 * @param {{type: string, x: number, y: number, cause?: string}} e
 * @param {ReadonlyArray<{kind: string, x: number, y: number, alive?: boolean}>} things
 * @param {number} heroX Hero centre: the arrow points from the hero to the sound.
 */
export function captionFor(e, things, heroX) {
  const special = e.cause ? CAUSE_CAPTIONS[`${e.type}:${e.cause}`] : undefined;
  let text = special ?? EVENT_CAPTIONS[e.type] ?? '';
  if (e.type === 'telegraph' && !special) {
    let best = SOURCE_RANGE;
    text = 'Alerte';
    for (const t of things) {
      const d = Math.hypot(t.x - e.x, t.y - e.y);
      if (t.alive !== false && TELEGRAPH_CAPTIONS[t.kind] && d < best) {
        best = d;
        text = TELEGRAPH_CAPTIONS[t.kind];
      }
    }
  }
  if (!text) return '';
  const dx = e.x - heroX;
  return Math.abs(dx) < 1.5 ? `[${text}]` : dx > 0 ? `[${text} →]` : `[← ${text}]`;
}

/** Lines on show: text → timer. @type {Map<string, ReturnType<typeof setTimeout>>} */
const shown = new Map();
const CAPTION_TIME = 2.4;
const CAPTION_LINES = 3;

/**
 * Shows the caption of a game event (call it with every event, next to its sound effect).
 * Does nothing unless the player turned captions on.
 * @param {{type: string, x: number, y: number, cause?: string}} e
 * @param {{things: ReadonlyArray<{kind: string, x: number, y: number, alive?: boolean}>, hero: {x: number}}} sim
 */
export function caption(e, sim) {
  if (!prefs.captions) return;
  const box = document.getElementById('captions');
  if (!box) return;
  const text = captionFor(e, sim.things, sim.hero.x + HERO.w / 2);
  if (!text) return;
  let line = [...box.children].find((el) => el.textContent === text);
  if (line) clearTimeout(shown.get(text));
  else {
    line = document.createElement('p');
    line.textContent = text;
    box.append(line);
    while (box.children.length > CAPTION_LINES) {
      const old = /** @type {HTMLElement} */ (box.firstElementChild);
      clearTimeout(shown.get(old.textContent ?? ''));
      shown.delete(old.textContent ?? '');
      old.remove();
    }
  }
  const el = line;
  shown.set(
    text,
    setTimeout(
      () => {
        el.remove();
        shown.delete(text);
      },
      (CAPTION_TIME / prefs.speed) * 1000,
    ),
  );
}

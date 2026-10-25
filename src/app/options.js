import { ACTIONS, keyName } from './input.js';
import { load, store } from './storage.js';

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

export const prefs = {
  shake: !reducedMotion,
  flash: !reducedMotion,
  contrast: matchMedia('(prefers-contrast: more)').matches,
  // « Repères renforcés »: hatched outlines on live hazards, warnings told by shape
  // as well as colour. Read by the trap and boss visuals as `prefs.cues`.
  cues: false,
  vibrate: true,
  assist: false,
  pad: 'm',
  speed: 1,
  ...load(PREFS_KEY, {}),
};

// A damaged save must never freeze the game.
if (![1, 0.8, 0.65].includes(prefs.speed)) prefs.speed = 1;

/** Applies the preferences that live in the page (contrast, pad size). */
export function applyPrefs() {
  document.body.classList.toggle('contrast', prefs.contrast);
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

  const renderKeys = () => {
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

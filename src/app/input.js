/**
 * Keyboard, touch and gamepad controls merged into one {@link import('../game/sim.js').Input}.
 * `pressed()` reports one-shot actions (pause, read, confirm) for the menus.
 * Players can add their own key for each action; it is saved locally.
 * Texts that name a control write it `{jump}`, `{fire}`…: {@link fillKeys} puts in the key
 * the player really uses (their own binding, the gamepad button or the touch button).
 */
import { load, store } from './storage.js';

const KEYMAP = /** @type {Record<string, string>} */ ({
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
  KeyK: 'jump',
  KeyX: 'fire',
  KeyJ: 'fire',
  Escape: 'pause',
  KeyP: 'pause',
  Enter: 'confirm',
});

/** Actions a player can rebind, with the default key shown in the options. */
export const ACTIONS = /** @type {const} */ ({
  left: 'ArrowLeft',
  right: 'ArrowRight',
  up: 'ArrowUp',
  down: 'ArrowDown',
  jump: 'Space',
  fire: 'KeyX',
  pause: 'Escape',
});

const BIND_KEY = 'naorush.keys';

/**
 * What each physical key prints on this keyboard: `KeyQ` is « A » on a French AZERTY.
 * Filled from the browser's layout map when it has one, and from every key pressed.
 * @type {Map<string, string>}
 */
export const layout = new Map();
if (typeof navigator !== 'undefined')
  /** @type {any} */ (navigator).keyboard
    ?.getLayoutMap?.()
    .then((/** @type {Map<string, string>} */ map) => {
      for (const [code, key] of map) if (!layout.has(code)) layout.set(code, key);
    })
    .catch(() => {});

/** Learns what a key prints from a key press. @param {KeyboardEvent} e */
export function learnKey(e) {
  if (e.key && [...e.key].length === 1 && e.key !== ' ') layout.set(e.code, e.key);
}

/** Human-readable key name, as printed on the player's keyboard. @param {string} code */
export const keyName = (code) =>
  ({
    ArrowLeft: '←',
    ArrowRight: '→',
    ArrowUp: '↑',
    ArrowDown: '↓',
    Space: 'Espace',
    Escape: 'Échap',
    Enter: 'Entrée',
    NumpadEnter: 'Entrée',
    Tab: 'Tab',
    Backspace: 'Retour arrière',
    ShiftLeft: 'Maj',
    ShiftRight: 'Maj droite',
    ControlLeft: 'Ctrl',
    ControlRight: 'Ctrl droite',
    AltLeft: 'Alt',
    AltRight: 'Alt Gr',
  })[code] ??
  layout.get(code)?.toUpperCase() ??
  code.replace(/^Key|^Digit/, '').replace(/^Numpad/, 'Pavé ');

/** What the player last played with: tips and menus name its buttons. @typedef {'keys' | 'pad' | 'touch'} Device */
/** Gamepad face buttons differ by brand: Xbox-style letters or PlayStation symbols. @typedef {'xbox' | 'ps'} PadKind */

/** Standard-mapping gamepad buttons, Xbox-style letters (A bottom, X left). */
const PAD_NAMES = /** @type {Record<keyof typeof ACTIONS, string>} */ ({
  left: '◀',
  right: '▶',
  up: '▲',
  down: '▼',
  jump: 'A',
  fire: 'X',
  pause: 'Start',
});
/** The same buttons on a PlayStation pad. */
const PS_NAMES = /** @type {Record<keyof typeof ACTIONS, string>} */ ({
  ...PAD_NAMES,
  jump: '✕',
  fire: '□',
  pause: 'Options',
});
/** The on-screen touch buttons (index.html, `.touch`). */
const TOUCH_NAMES = /** @type {Record<keyof typeof ACTIONS, string>} */ ({
  left: '◀',
  right: '▶',
  up: '▲',
  down: '▼',
  jump: 'SAUT',
  fire: 'CR',
  pause: '❚❚',
});

/**
 * The name of the control for an action on a device.
 * @param {keyof typeof ACTIONS} action
 * @param {Device} device
 * @param {string} [code] Keyboard: the key bound to the action (default key otherwise).
 * @param {PadKind} [pad]
 */
export function controlName(action, device, code, pad = 'xbox') {
  if (device === 'touch') return TOUCH_NAMES[action];
  if (device === 'pad') return (pad === 'ps' ? PS_NAMES : PAD_NAMES)[action];
  return keyName(code || ACTIONS[action]);
}

const PLACEHOLDER = /\{(left|right|up|down|jump|fire|pause)\}/g;

/**
 * Replaces `{jump}`, `{fire}`, `{up}`… in a text with the controls' names.
 * @param {string} text
 * @param {(action: keyof typeof ACTIONS) => string} name
 */
export function fillControls(text, name) {
  return text.replace(PLACEHOLDER, (_, a) => name(/** @type {keyof typeof ACTIONS} */ (a)));
}

/** A PlayStation pad (Sony's USB vendor id, or its name). @param {string} id */
export const padKind = (id) =>
  /054c|playstation|dualshock|dualsense/i.test(id) ? /** @type {const} */ ('ps') : 'xbox';

/** The game's one Input, once built: {@link keyLabel} and {@link fillKeys} read it. @type {Input | null} */
let current = null;

/**
 * The name of the control the player uses for an action right now: their own key,
 * the gamepad button, or the touch button.
 * @param {keyof typeof ACTIONS} action
 */
export const keyLabel = (action) => current?.label(action) ?? keyName(ACTIONS[action]);

/**
 * A text with `{jump}`, `{fire}`, `{up}`… written with the player's own controls.
 * Texts without placeholders come back unchanged.
 * @param {string} text
 */
export const fillKeys = (text) => fillControls(text, keyLabel);

/**
 * A tutorial tip in the player's own controls: the touch wording on the touch pad,
 * the keyboard wording (placeholders filled) on a keyboard or a gamepad.
 * @param {{keys: string, touch: string}} tip
 */
export const tipText = (tip) =>
  fillKeys((current?.device ?? 'keys') === 'touch' ? tip.touch : tip.keys);

export class Input {
  constructor() {
    /** @type {Set<string>} */
    this.held = new Set();
    /** @type {Set<string>} */
    this.taps = new Set();
    /** Presses per action this frame: on a slow frame, two quick presses still count twice. @type {Map<string, number>} */
    this.counts = new Map();
    /** Keyboard keys held down since the last clear(). @type {Set<string>} */
    this.keys = new Set();
    /** Custom bindings: action → key code. @type {Record<string, string>} */
    this.custom = {};
    // Only bindings of known actions to key codes: a damaged save keeps the defaults.
    for (const [a, c] of Object.entries(load(BIND_KEY, {})))
      if (a in ACTIONS && typeof c === 'string' && c) this.custom[a] = c;
    /** Waiting for a key to bind. @type {((code: string) => void) | null} */
    this.capture = null;
    /** Gamepad buttons held last frame. @type {Set<string>} */
    this.padHeld = new Set();
    /** Gamepad buttons to ignore until released. @type {Set<string>} */
    this.padBlocked = new Set();
    /** What the player last used. @type {Device} */
    this.device =
      typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches
        ? 'touch'
        : 'keys';
    /** @type {PadKind} */
    this.pad = 'xbox';
    /** Called when the player switches device (keyboard, gamepad, touch). @type {Array<() => void>} */
    this.deviceListeners = [];
    current = this;
    if (typeof document !== 'undefined') document.body.dataset.device = this.device;

    addEventListener('keydown', (/** @type {KeyboardEvent} */ e) => {
      learnKey(e);
      if (this.capture) {
        e.preventDefault();
        const done = this.capture;
        this.capture = null;
        // Escape cancels the rebinding instead of taking Escape's place.
        done(e.code === 'Escape' ? '' : e.code);
        return;
      }
      document.body.classList.remove('padnav');
      const k = this.actionFor(e.code);
      if (k) this.setDevice('keys');
      if (!k) return;
      // On a focused menu button, Enter and Space press the button as usual
      // (in play they stay game keys, even if the mute button kept focus).
      const target = /** @type {HTMLElement | null} */ (e.target);
      if (
        (k === 'confirm' || k === 'jump') &&
        document.body.dataset.screen !== 'play' &&
        target?.closest?.('button, input, select, summary')
      ) {
        // A held key presses a button once, not on every auto-repeat.
        if (e.repeat) e.preventDefault();
        return;
      }
      // Sliders and lists keep their left/right arrows; up/down always move focus.
      if ((k === 'left' || k === 'right') && target?.closest?.('input, select')) return;
      e.preventDefault();
      // A key still held from before clear() (say, Space on the last dialogue
      // line) stays ignored until it is pressed again.
      if (e.repeat && !this.keys.has(e.code)) return;
      this.keys.add(e.code);
      if (!e.repeat) this.tap(k);
      this.held.add(k);
    });
    addEventListener('keyup', (/** @type {KeyboardEvent} */ e) => {
      this.keys.delete(e.code);
      const k = this.actionFor(e.code);
      // Two keys on one action (← and Q): releasing one keeps the other going.
      if (k && ![...this.keys].some((c) => this.actionFor(c) === k)) this.held.delete(k);
    });
    addEventListener('blur', () => {
      this.held.clear();
      this.keys.clear();
    });
    // The gamepad focus ring only shows until the mouse or a finger takes over.
    addEventListener('pointerdown', () => document.body.classList.remove('padnav'));
    this.bindTouch();
  }

  /** @param {string} code */
  actionFor(code) {
    for (const [action, c] of Object.entries(this.custom)) if (c === code) return action;
    return KEYMAP[code];
  }

  /** The key shown for an action. @param {keyof typeof ACTIONS} action */
  binding(action) {
    return this.custom[action] ?? ACTIONS[action];
  }

  /** The name of the control for an action on the device in use. @param {keyof typeof ACTIONS} action */
  label(action) {
    return controlName(action, this.device, this.binding(action), this.pad);
  }

  /** @param {Device} device */
  setDevice(device) {
    if (device === this.device) return;
    this.device = device;
    document.body.dataset.device = device;
    for (const f of this.deviceListeners) f();
  }

  /** @param {keyof typeof ACTIONS} action @param {string} code */
  bind(action, code) {
    for (const [a, c] of Object.entries(this.custom)) if (c === code) delete this.custom[a];
    this.custom[action] = code;
    store(BIND_KEY, this.custom);
  }

  resetBindings() {
    this.custom = {};
    store(BIND_KEY, {});
  }

  /**
   * Touch pads: a finger can slide from one button to the next (run → jump)
   * without lifting, like on a real pad.
   */
  bindTouch() {
    /** Button under each finger. @type {Map<number, HTMLElement>} */
    const fingers = new Map();
    const refresh = () => {
      const down = new Set([...fingers.values()]);
      for (const b of document.querySelectorAll('[data-key]')) {
        const el = /** @type {HTMLElement} */ (b);
        const k = el.dataset.key ?? '';
        const on = down.has(el);
        if (on && !el.classList.contains('down')) this.tap(k);
        el.classList.toggle('down', on);
        if (on) this.held.add(k);
      }
      for (const b of document.querySelectorAll('[data-key]:not(.down)')) {
        const k = /** @type {HTMLElement} */ (b).dataset.key ?? '';
        if (![...down].some((d) => d.dataset.key === k)) this.held.delete(k);
      }
    };
    /** @param {PointerEvent} e */
    const at = (e) => {
      const el = document.elementFromPoint(e.clientX, e.clientY)?.closest('[data-key]');
      return /** @type {HTMLElement | null} */ (el);
    };
    for (const pad of document.querySelectorAll('.touch .pad')) {
      pad.addEventListener('pointerdown', (ev) => {
        const e = /** @type {PointerEvent} */ (ev);
        const el = at(e);
        if (!el) return;
        e.preventDefault();
        this.setDevice('touch');
        /** @type {HTMLElement} */ (pad).setPointerCapture(e.pointerId);
        fingers.set(e.pointerId, el);
        refresh();
      });
      pad.addEventListener('pointermove', (ev) => {
        const e = /** @type {PointerEvent} */ (ev);
        if (!fingers.has(e.pointerId)) return;
        const el = at(e);
        if (el && el !== fingers.get(e.pointerId)) {
          fingers.set(e.pointerId, el);
          refresh();
        }
      });
      for (const type of ['pointerup', 'pointercancel'])
        pad.addEventListener(type, (ev) => {
          fingers.delete(/** @type {PointerEvent} */ (ev).pointerId);
          refresh();
        });
    }
  }

  /** Standard-mapping gamepads: stick or d-pad, A jump, X or Y fire, B back, Start pause. */
  pollGamepad() {
    const pad = [...(navigator.getGamepads?.() ?? [])].find(Boolean);
    if (!pad) return;
    const b = (/** @type {number} */ i) => Boolean(pad.buttons[i]?.pressed);
    const ax = pad.axes[0] ?? 0,
      ay = pad.axes[1] ?? 0;
    const now = new Set();
    if (ax < -0.4 || b(14)) now.add('left');
    if (ax > 0.4 || b(15)) now.add('right');
    if (ay < -0.5 || b(12)) now.add('up');
    if (ay > 0.5 || b(13)) now.add('down');
    if (b(0)) now.add('jump');
    if (b(2) || b(3)) now.add('fire');
    if (b(1)) now.add('back');
    if (b(9)) now.add('pause');
    if (b(0)) now.add('confirm');
    // Buttons still held across a screen change are ignored until released.
    for (const k of this.padBlocked) if (!now.has(k)) this.padBlocked.delete(k);
    for (const k of this.padBlocked) now.delete(k);
    for (const k of now)
      if (!this.padHeld.has(k)) {
        this.tap(k);
        document.body.classList.add('padnav');
        this.pad = padKind(pad.id);
        this.setDevice('pad');
      }
    for (const k of this.padHeld) if (!now.has(k)) this.held.delete(k);
    for (const k of now) this.held.add(k);
    this.padHeld = now;
  }

  /** @returns {import('../game/sim.js').Input} */
  state() {
    const h = this.held;
    return {
      left: h.has('left'),
      right: h.has('right'),
      up: h.has('up'),
      down: h.has('down'),
      jump: h.has('jump'),
      fire: h.has('fire'),
    };
  }

  /** @param {string} action */
  pressed(action) {
    return this.taps.has(action);
  }

  /** How many times an action was pressed this frame. @param {string} action */
  presses(action) {
    return this.counts.get(action) ?? 0;
  }

  /** @param {string} action */
  tap(action) {
    this.taps.add(action);
    this.counts.set(action, this.presses(action) + 1);
  }

  /** Call once per rendered frame, after reading taps. */
  endFrame() {
    this.taps.clear();
    this.counts.clear();
  }

  clear() {
    this.held.clear();
    this.taps.clear();
    this.counts.clear();
    this.keys.clear();
    this.padBlocked = new Set(this.padHeld);
  }
}

/**
 * Keyboard and touch controls merged into one {@link import('../game/sim.js').Input}.
 * `pressed()` reports one-shot actions (pause, read) for the menus.
 */
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

export class Input {
  constructor() {
    /** @type {Set<string>} */
    this.held = new Set();
    /** @type {Set<string>} */
    this.taps = new Set();
    addEventListener('keydown', (/** @type {KeyboardEvent} */ e) => {
      const k = KEYMAP[e.code];
      if (!k) return;
      e.preventDefault();
      if (!e.repeat) this.taps.add(k);
      this.held.add(k);
    });
    addEventListener('keyup', (/** @type {KeyboardEvent} */ e) => {
      const k = KEYMAP[e.code];
      if (k) this.held.delete(k);
    });
    addEventListener('blur', () => this.held.clear());
    for (const b of document.querySelectorAll('[data-key]')) {
      const k = /** @type {HTMLElement} */ (b).dataset.key ?? '';
      b.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        this.held.add(k);
        this.taps.add(k);
        b.classList.add('down');
      });
      for (const ev of ['pointerup', 'pointercancel', 'pointerleave'])
        b.addEventListener(ev, () => {
          this.held.delete(k);
          b.classList.remove('down');
        });
    }
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

  /** Call once per rendered frame, after reading taps. */
  endFrame() {
    this.taps.clear();
  }

  clear() {
    this.held.clear();
    this.taps.clear();
  }
}

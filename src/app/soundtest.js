// Developer sound test: a full-page panel to audition every track and sound effect.
import { SFX_TYPES, TRACKS } from './audio.js';

/** @typedef {import('./audio.js').Audio} Audio */

/**
 * Builds the sound-test panel and appends it to document.body.
 * @param {Audio} audio
 * @returns {HTMLElement} the panel (remove it to unmount)
 */
export function mountSoundTest(audio) {
  const doc = globalThis.document;
  const root = doc.createElement('div');
  root.style.cssText =
    'position:fixed;inset:0;z-index:9999;overflow:auto;padding:24px;box-sizing:border-box;' +
    'background:#14161c;color:#e8eaf0;font:15px/1.4 system-ui,sans-serif';
  root.addEventListener('pointerdown', () => audio.unlock(), { capture: true });
  root.addEventListener('keydown', () => audio.unlock(), { capture: true });

  /** @param {string} tag @param {string} [text] @param {string} [css] */
  const el = (tag, text = '', css = '') => {
    const e = doc.createElement(tag);
    e.textContent = text;
    if (css) e.style.cssText = css;
    return e;
  };
  const btnCss =
    'margin:4px;padding:8px 12px;border:1px solid #3a4152;border-radius:6px;cursor:pointer;' +
    'background:#232836;color:#e8eaf0;font:inherit';
  /** @param {string} label @param {() => void} onClick */
  const button = (label, onClick) => {
    const b = /** @type {HTMLButtonElement} */ (el('button', label, btnCss));
    b.type = 'button';
    b.addEventListener('click', () => {
      audio.unlock();
      onClick();
    });
    return b;
  };
  /** @param {string} title */
  const section = (title) => {
    root.append(el('h2', title, 'margin:20px 0 8px;font-size:18px;color:#ffd166'));
    const box = el('div', '', 'display:flex;flex-wrap:wrap');
    root.append(box);
    return box;
  };
  /** @param {HTMLElement} box @param {string} label @param {number} value @param {(v: number) => void} onInput */
  const slider = (box, label, value, onInput) => {
    const wrap = el('label', '', 'display:flex;align-items:center;gap:10px;margin:6px 16px 6px 0');
    const name = el('span', label, 'min-width:80px');
    const input = /** @type {HTMLInputElement} */ (el('input'));
    input.type = 'range';
    input.min = '0';
    input.max = '1';
    input.step = '0.01';
    input.value = String(value);
    const out = el('span', value.toFixed(2), 'min-width:40px;font-variant-numeric:tabular-nums');
    input.addEventListener('input', () => {
      const v = Number(input.value);
      out.textContent = v.toFixed(2);
      onInput(v);
    });
    wrap.append(name, input, out);
    box.append(wrap);
  };

  root.append(el('h1', 'NAO Rush — sound test', 'margin:0;font-size:24px'));
  root.append(el('p', 'Click anything to enable audio.', 'margin:4px 0 0;color:#9aa3b5'));

  const mix = section('Mix');
  slider(mix, 'Music', audio.getVolume('music'), (v) => audio.setVolume('music', v));
  slider(mix, 'SFX', audio.getVolume('sfx'), (v) => audio.setVolume('sfx', v));
  slider(mix, 'Intensity', 0, (v) => audio.intensity(v));
  mix.append(
    button(audio.muted ? 'Unmute' : 'Mute', () => {
      audio.setMuted(!audio.muted);
      muteBtn.textContent = audio.muted ? 'Unmute' : 'Mute';
    }),
  );
  const muteBtn = /** @type {HTMLButtonElement} */ (mix.lastElementChild);

  const music = section('Tracks');
  /** @type {HTMLButtonElement[]} */
  const trackBtns = [];
  const highlight = (/** @type {string | null} */ name) => {
    for (const b of trackBtns)
      b.style.background = b.dataset.track === name ? '#3d5a80' : '#232836';
  };
  for (const name of TRACKS) {
    const b = button(name, () => {
      audio.music(name);
      highlight(name);
    });
    b.dataset.track = name;
    trackBtns.push(b);
    music.append(b);
  }
  music.append(
    button('■ stop', () => {
      audio.music(null);
      highlight(null);
    }),
  );

  const sfx = section(`Sound effects (${SFX_TYPES.length})`);
  for (const type of SFX_TYPES) sfx.append(button(type, () => audio.sfx(type)));

  doc.body.append(root);
  return root;
}

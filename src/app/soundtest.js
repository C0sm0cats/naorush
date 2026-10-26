// Developer sound test: a full-page panel to audition every track and sound effect.
import { AMBIENCES, FLOORS, SFX_TYPES, STAGES, TRACKS, VOICE_IDS, trackInfo } from './audio.js';

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
    /** Moves the slider (and applies the value). @param {number} v */
    return (v) => {
      input.value = String(v);
      out.textContent = v.toFixed(2);
      onInput(v);
    };
  };

  root.append(el('h1', 'NAO Rush — sound test', 'margin:0;font-size:24px'));
  root.append(el('p', 'Click anything to enable audio.', 'margin:4px 0 0;color:#9aa3b5'));

  const mix = section('Mix');
  slider(mix, 'Music', audio.getVolume('music'), (v) => audio.setVolume('music', v));
  slider(mix, 'SFX', audio.getVolume('sfx'), (v) => audio.setVolume('sfx', v));
  const level = slider(mix, 'Intensity', 0, (v) => audio.intensity(v));
  mix.append(
    button(audio.muted ? 'Unmute' : 'Mute', () => {
      audio.setMuted(!audio.muted);
      muteBtn.textContent = audio.muted ? 'Unmute' : 'Mute';
    }),
  );
  const muteBtn = /** @type {HTMLButtonElement} */ (mix.lastElementChild);

  /** Buttons of one exclusive group, the playing one highlighted. */
  const group = () => {
    /** @type {HTMLButtonElement[]} */
    const list = [];
    return {
      /** @param {HTMLButtonElement} b @param {string} key */
      add(b, key) {
        b.dataset.key = key;
        list.push(b);
        return b;
      },
      /** @param {string | null} key */
      pick(key) {
        for (const b of list) b.style.background = b.dataset.key === key ? '#3d5a80' : '#232836';
      },
    };
  };
  const tracks = group();
  const beds = group();

  // The intensity levels main.js uses, so each layer can be heard as in game.
  const moments = section('Game moments (music intensity)');
  for (const [label, v] of /** @type {const} */ ([
    ['menu 0', 0],
    ['stage 0.25', 0.25],
    ['last heart 0.7', 0.7],
    ['boss 0.5', 0.5],
    ['boss phase 2 · 0.9', 0.9],
    ['boss finale · 1', 1],
  ])) {
    moments.append(button(label, () => level(v)));
  }

  const stages = section('Stages (music + ambience, as in game)');
  for (const id of STAGES) {
    stages.append(
      button(id, () => {
        audio.stage({ id });
        tracks.pick(audio.wanted);
        beds.pick(audio.ambWanted);
      }),
    );
  }

  const music = section(
    'Tracks (restart on click: the hero picked under Foley plays their variant)',
  );
  for (const name of TRACKS) {
    const { bpm, bars, seconds, loops } = trackInfo(name);
    const b = button(name, () => {
      audio.music(null);
      audio.music(name);
      tracks.pick(name);
    });
    b.title = `${bpm} bpm · ${bars} bars · ${seconds.toFixed(0)} s${loops ? ' loop' : ''}`;
    music.append(tracks.add(b, name));
  }
  music.append(
    button('■ stop', () => {
      audio.music(null);
      tracks.pick(null);
    }),
  );

  const amb = section('Ambience');
  for (const name of AMBIENCES) {
    amb.append(
      beds.add(
        button(name, () => {
          audio.ambience(name);
          beds.pick(name);
        }),
        name,
      ),
    );
  }
  amb.append(
    button('■ stop', () => {
      audio.ambience(null);
      beds.pick(null);
    }),
  );

  const foley = section('Foley (steps, landings and jumps follow the hero and the floor)');
  const heroes = group();
  const floors = group();
  for (const hero of /** @type {const} */ (['kevin', 'charline'])) {
    const b = button(hero, () => {
      audio.hero = hero;
      heroes.pick(hero);
    });
    foley.append(heroes.add(b, hero));
  }
  for (const floor of FLOORS) {
    const b = button(floor, () => {
      audio.floor = floor;
      floors.pick(floor);
    });
    foley.append(floors.add(b, floor));
  }
  heroes.pick(audio.hero);
  floors.pick(audio.floor);
  foley.append(
    button('▶ run', () => {
      for (let i = 0; i < 8; i++) audio.sfx('step', { delay: i * 0.27 });
    }),
    button('▶ jump + land', () => {
      audio.sfx('jump');
      audio.sfx('land', { delay: 0.55 });
    }),
    button('▶ hop + touchdown', () => {
      audio.sfx('jump');
      audio.sfx('touchdown', { delay: 0.3 });
    }),
    button('▶ PRIMO countdown', () => {
      for (let i = 0; i < 4; i++)
        audio.sfx('consultTick', { delay: i * 0.25, pitch: 1 + i * 0.06 });
    }),
  );

  // Music that reacts to the game: start a track above first (a boss track for the lift).
  const react = section('Music reactions (start a track first)');
  react.append(
    button('▶ stingers: key · door · checkpoint', () => {
      audio.sfx('key');
      audio.sfx('door', { delay: 2.2 });
      audio.sfx('checkpoint', { delay: 4.2 });
    }),
    button('▶ duck: hurt · boss hit', () => {
      audio.sfx('hurt');
      audio.sfx('bossHit', { delay: 1.6 });
    }),
    button('▶ boss phase (key up a tone, boss tracks)', () => audio.sfx('bossPhase')),
    button('▶ boss finale (another tone)', () => audio.sfx('finale')),
    button('▶ boss entrance', () => {
      audio.music(null);
      audio.music(audio.wanted === 'bossRodolphe' ? 'bossJulien' : 'bossRodolphe');
      tracks.pick(audio.wanted);
    }),
    button('▶ signature, then stage clear (victory variation)', () => {
      audio.sfx('sign');
      audio.music('win');
      tracks.pick(audio.wanted);
    }),
    button('▶ beat-synced switch (stage ↔ boss)', () => {
      audio.music(audio.wanted === 'bossJulien' ? 'datacenter' : 'bossJulien');
      tracks.pick(audio.wanted);
    }),
  );
  // Switchboard hold music: the pause line, and the colleague's headset walking past.
  const phone = section('Switchboard (hold music)');
  phone.append(
    button('▶ pause / resume (phone line)', () => audio.sfx(audio.held ? 'resume' : 'pause')),
    button('▶ walk past a colleague on a call (left → right)', () => {
      for (let i = 0; i <= 40; i++) {
        const x = -8 + i * 0.4;
        setTimeout(() => audio.headset(Math.abs(x), Math.max(-1, Math.min(1, x / 6))), i * 120);
      }
      setTimeout(() => audio.headset(Infinity), 41 * 120);
    }),
  );
  const space = section('Stereo and takes');
  space.append(
    button('▶ pan sweep (tickets left → right)', () => {
      for (let i = 0; i < 9; i++) audio.sfx('ticket', { delay: i * 0.3, pan: -1 + i * 0.25 });
    }),
    button('▶ 8 tickets (takes)', () => {
      for (let i = 0; i < 8; i++) audio.sfx('ticket', { delay: i * 0.35 });
    }),
    button('▶ 6 jumps + landings (takes)', () => {
      for (let i = 0; i < 6; i++) {
        audio.sfx('jump', { delay: i * 0.8 });
        audio.sfx('land', { delay: i * 0.8 + 0.5 });
      }
    }),
  );

  const voices = section('Voices (dialogue blips, then a speech bubble)');
  for (const who of VOICE_IDS) {
    voices.append(
      button(who, () => {
        for (let i = 0; i < 8; i++) audio.sfx('talk', { who, delay: i * 0.055 });
        audio.sfx('bubble', { who, delay: 0.7 });
      }),
    );
  }

  const sfx = section(`Sound effects (${SFX_TYPES.length})`);
  for (const type of SFX_TYPES) sfx.append(button(type, () => audio.sfx(type)));

  doc.body.append(root);
  return root;
}

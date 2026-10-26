import { describe, expect, it } from 'vitest';
import {
  ACTIONS,
  Input,
  controlName,
  fillControls,
  fillKeys,
  keyLabel,
  keyName,
  layout,
  padKind,
  tipText,
} from '../src/app/input.js';
import { LEVELS } from '../src/data/levels/index.js';

const PLACEHOLDER = /\{(\w+)\}/g;

describe('control names (AM-2)', () => {
  it('names each action on the keyboard, the gamepad and the touch pad', () => {
    expect(controlName('jump', 'keys')).toBe('Espace');
    expect(controlName('fire', 'keys')).toBe('X');
    expect(controlName('jump', 'keys', 'KeyL')).toBe('L');
    expect(controlName('jump', 'pad')).toBe('A');
    expect(controlName('jump', 'pad', 'Space', 'ps')).toBe('✕');
    expect(controlName('fire', 'touch')).toBe('CR');
    expect(controlName('jump', 'touch')).toBe('SAUT');
    for (const a of /** @type {(keyof typeof ACTIONS)[]} */ (Object.keys(ACTIONS)))
      for (const d of /** @type {const} */ (['keys', 'pad', 'touch']))
        expect(controlName(a, d)).toMatch(/\S/);
  });

  it('prints the key a French keyboard shows, not the QWERTY position', () => {
    expect(keyName('KeyQ')).toBe('Q');
    layout.set('KeyQ', 'a');
    expect(keyName('KeyQ')).toBe('A');
    layout.delete('KeyQ');
    expect(keyName('Numpad5')).toBe('Pavé 5');
    expect(keyName('ShiftLeft')).toBe('Maj');
  });

  it('tells a PlayStation pad from the others', () => {
    expect(padKind('DualSense Wireless Controller (STANDARD GAMEPAD Vendor: 054c)')).toBe('ps');
    expect(padKind('Xbox 360 Controller (XInput STANDARD GAMEPAD)')).toBe('xbox');
  });

  it('fills placeholders and leaves other text alone', () => {
    const name = (/** @type {string} */ a) => `<${a}>`;
    expect(fillControls('{jump} puis {fire}, {nope}', name)).toBe('<jump> puis <fire>, {nope}');
    expect(fillKeys('Sans touche.')).toBe('Sans touche.');
    expect(keyLabel('jump')).toBe('Espace');
  });

  it('words tips for the keyboard before any Input exists', () => {
    expect(tipText({ keys: '{fire} : un CR.', touch: 'CR : un CR.' })).toBe('X : un CR.');
  });

  it('only uses placeholders that name a real action in the stage tips', () => {
    for (const level of LEVELS)
      for (const tip of level.tips ?? [])
        for (const text of [tip.keys, tip.touch])
          for (const [, a] of text.matchAll(PLACEHOLDER)) expect(Object.keys(ACTIONS)).toContain(a);
  });

  it('never writes a fixed key in the keyboard tips: a rebound key or a gamepad would lie', () => {
    for (const level of LEVELS)
      for (const tip of level.tips ?? []) expect(tip.keys).not.toMatch(/Espace|\bX\b|[←→↑↓]/);
  });
});

describe('sound captions (IN6)', async () => {
  // options.js reads the system preferences when it loads.
  if (typeof globalThis.matchMedia !== 'function')
    Object.assign(globalThis, { matchMedia: () => ({ matches: false }) });
  const { captionFor, prefs } = await import('../src/app/options.js');
  it('is off by default and names a warning after the thing that makes it, with a direction', () => {
    expect(prefs.captions).toBe(false);
    const things = [
      { kind: 'printer', x: 20, y: 3 },
      { kind: 'ticket', x: 20.5, y: 3 },
    ];
    expect(captionFor({ type: 'telegraph', x: 20.2, y: 4 }, things, 10)).toBe(
      '[Imprimante qui chauffe →]',
    );
    expect(captionFor({ type: 'telegraph', x: 20.2, y: 4 }, things, 30)).toBe(
      '[← Imprimante qui chauffe]',
    );
    expect(captionFor({ type: 'crack', x: 10.5, y: 3 }, [], 10)).toBe('[Dalle qui craque]');
  });
  it('stays quiet for everyday sounds and says « Alerte » for an unknown source', () => {
    expect(captionFor({ type: 'jump', x: 1, y: 1 }, [], 1)).toBe('');
    expect(captionFor({ type: 'ticket', x: 1, y: 1 }, [], 1)).toBe('');
    expect(
      captionFor({ type: 'telegraph', x: 50, y: 3 }, [{ kind: 'printer', x: 20, y: 3 }], 10),
    ).toBe('[Alerte →]');
  });
});

describe('the device in use (AM-2)', () => {
  it('rewords tips when the player picks up a gamepad or the touch pad', () => {
    /** @type {Record<string, string>} */
    const dataset = {};
    Object.assign(globalThis, {
      addEventListener: () => {},
      matchMedia: () => ({ matches: false }),
      document: {
        body: { dataset, classList: { remove() {}, add() {} } },
        querySelectorAll: () => [],
      },
    });
    const input = new Input();
    input.custom = { jump: 'KeyL' };
    const tip = { keys: '{jump} : saute.', touch: 'SAUT : saute.' };
    expect(tipText(tip)).toBe('L : saute.');
    let told = 0;
    input.deviceListeners.push(() => told++);
    input.setDevice('pad');
    expect(dataset.device).toBe('pad');
    expect(tipText(tip)).toBe('A : saute.');
    input.pad = 'ps';
    expect(tipText(tip)).toBe('✕ : saute.');
    input.setDevice('touch');
    expect(tipText(tip)).toBe('SAUT : saute.');
    expect(told).toBe(2);
  });
});

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync(new URL('../src/style.css', import.meta.url), 'utf8');

/** The body of the first rule whose selector line is exactly `selector`. @param {string} selector */
const rule = (selector) => {
  const at = css.indexOf(`\n${selector} {`);
  expect(at).toBeGreaterThan(-1);
  return css.slice(at, css.indexOf('}', at));
};

describe('style sheet accessibility (audit a11y)', () => {
  it('keeps the stage banner visible when the system asks for less motion', () => {
    const reduced = css.slice(css.indexOf('@media (prefers-reduced-motion: reduce)'));
    expect(reduced).toMatch(/\.stage\.show \{\s*animation: stage-still[^;]*!important/);
    expect(css).toMatch(/@keyframes stage-still \{\s*0%,\s*99% \{\s*opacity: 1;/);
  });

  it('gives the dialogue button a 44 px target', () => {
    const next = rule('.talk-next');
    expect(next).toMatch(/width: 44px/);
    expect(next).toMatch(/height: 44px/);
    expect(next).toMatch(/background: var\(--pink-edge\)/);
  });

  it('keeps muted text dark enough for 4.5:1 on the cards', () => {
    expect(css).toMatch(/--muted: #505c76;/);
  });
});

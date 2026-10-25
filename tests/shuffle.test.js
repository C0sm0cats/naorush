import { describe, expect, it } from 'vitest';
import { BarkDeck, ShuffleBag, teaserCheckpoint } from '../src/app/dialogue.js';
import { BARKS, CREDITS, EPILOGUE, PROLOGUE, STAGE_BARKS } from '../src/data/barks.js';
import { CAST } from '../src/data/cast.js';
import { LEVELS } from '../src/data/levels/index.js';

/** A small deterministic generator so the test does not depend on luck. @param {number} seed */
const lcg = (seed) => () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32;

describe('Speech bubble shuffle bag', () => {
  it('deals every line once per round', () => {
    const bag = new ShuffleBag(lcg(7));
    for (let round = 0; round < 20; round++) {
      const dealt = Array.from({ length: 4 }, () => bag.next('kevin:block', 4));
      expect(dealt.sort()).toEqual([0, 1, 2, 3]);
    }
  });

  it('never says the same line twice in a row, even across rounds', () => {
    for (const seed of [1, 2, 3, 42, 99]) {
      const bag = new ShuffleBag(lcg(seed));
      let last = -1;
      for (let k = 0; k < 200; k++) {
        const i = bag.next('charline:hurt', 3);
        expect(i).not.toBe(last);
        last = i;
      }
    }
  });

  it('keeps one bag per speaker and moment, and copes with a single line', () => {
    const bag = new ShuffleBag(lcg(5));
    expect(bag.next('a:x', 1)).toBe(0);
    const a = Array.from({ length: 3 }, () => bag.next('a:y', 3));
    const b = Array.from({ length: 3 }, () => bag.next('b:y', 3));
    expect([...a].sort()).toEqual([0, 1, 2]);
    expect([...b].sort()).toEqual([0, 1, 2]);
  });
});

describe('Bubble lines per stage', () => {
  it('starts fresh bags after a reset', () => {
    const bag = new ShuffleBag(lcg(3));
    bag.next('k', 5);
    bag.next('k', 5);
    bag.reset();
    const dealt = Array.from({ length: 5 }, () => bag.next('k', 5));
    expect(dealt.sort()).toEqual([0, 1, 2, 3, 4]);
  });

  it('says the stage’s own lines first and repeats nothing within a stage', () => {
    for (const level of LEVELS) {
      const deck = new BarkDeck(lcg(11));
      const own = STAGE_BARKS[level.id]?.lines ?? {};
      deck.stage(own);
      for (const who of ['kevin', 'charline']) {
        for (const moment of Object.keys(BARKS[who])) {
          const local = own[who]?.[moment] ?? [];
          const total = local.length + BARKS[who][moment].length;
          const said = Array.from({ length: total }, () => deck.next(who, moment));
          expect(new Set(said).size).toBe(total);
          expect(new Set(said.slice(0, local.length))).toEqual(new Set(local));
        }
      }
    }
  });

  it('has at least ten lines for every moment (Kévin’s Céline Dion line stays unique)', () => {
    for (const [who, moments] of Object.entries(BARKS))
      for (const [moment, lines] of Object.entries(moments)) {
        if (who === 'kevin' && moment === 'celine') continue;
        expect(lines.length, `${who}.${moment}`).toBeGreaterThanOrEqual(10);
        expect(new Set(lines).size, `${who}.${moment} duplicates`).toBe(lines.length);
      }
    expect(BARKS.kevin.celine).toEqual(['Si c’est pour Céline Dion, on va faire le maximum !']);
  });

  it('teases every stage’s set piece from the checkpoint just before it', () => {
    for (const level of LEVELS) {
      const teaser = STAGE_BARKS[level.id]?.teaser;
      expect(teaser, level.id).toBeTruthy();
      const x = teaserCheckpoint(level.map, /** @type {{at: number}} */ (teaser).at);
      expect(x, `${level.id}: no checkpoint before the set piece`).not.toBeNull();
      for (const hero of ['kevin', 'charline']) expect(teaser?.lines[hero]).toHaveLength(2);
    }
  });
});

describe('Story text', () => {
  /** Every player-facing string the narration owns. */
  const texts = [
    ...Object.values(BARKS).flatMap((m) => Object.values(m).flat()),
    ...Object.values(STAGE_BARKS).flatMap((s) => [
      ...Object.values(s.teaser?.lines ?? {}).flat(),
      ...Object.values(s.lines ?? {}).flatMap((m) => Object.values(m).flat()),
    ]),
    ...[...PROLOGUE, ...EPILOGUE].map((l) => l.text),
    ...CREDITS.flatMap((c) => [c.name, c.role, c.line]),
    ...LEVELS.flatMap((l) => [
      l.name,
      l.subtitle,
      l.phaseLine ?? '',
      l.finaleLine ?? '',
      ...[...l.intro, ...(l.bossIntro ?? []), ...l.outro].map((x) => x.text),
      ...(l.tips ?? []).flatMap((t) => [t.keys, t.touch]),
    ]),
  ];

  it('follows French typography', () => {
    for (const t of texts) {
      expect(t, t).not.toMatch(/['"]/);
      expect(t, t).not.toMatch(/[^\s\u00a0\u202f!?][:;!?]/);
      expect(t, t).not.toMatch(/«(?![\s\u00a0\u202f])|[^\s\u00a0\u202f]»/);
    }
  });

  it('keeps the epilogue to four lines and credits the whole cast with a kind word', () => {
    expect(EPILOGUE).toHaveLength(4);
    const credited = new Set(CREDITS.map((c) => c.id));
    for (const id of Object.keys(CAST)) expect(credited.has(id), id).toBe(true);
    for (const c of CREDITS) expect(c.line.length).toBeGreaterThan(10);
  });

  it('drops the HUD compass hint and never mentions Whispli', () => {
    for (const t of texts) expect(t).not.toMatch(/boussole|whispli/i);
  });
});

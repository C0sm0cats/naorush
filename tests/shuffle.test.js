import { describe, expect, it } from 'vitest';
import { BarkDeck, ShuffleBag, lineText, teaserCheckpoint } from '../src/app/dialogue.js';
import {
  NAO_AT,
  clockAt,
  clockText,
  countdownText,
  interludeFor,
  readingTime,
  stageTime,
} from '../src/app/interlude.js';
import {
  BARKS,
  CREDITS,
  EPILOGUE,
  HERO_TAKES,
  INTERLUDES,
  PROLOGUE,
  STAGE_BARKS,
} from '../src/data/barks.js';
import { CAST } from '../src/data/cast.js';
import { CAMPAIGN, LEVELS } from '../src/data/levels/index.js';

/** Every story line the dialogue box can show. */
const storyLines = [
  ...PROLOGUE,
  ...EPILOGUE,
  ...LEVELS.flatMap((l) => [...l.intro, ...(l.bossIntro ?? []), ...l.outro]),
];

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
    ...Object.values(HERO_TAKES).flatMap((t) => Object.values(t)),
    ...Object.values(INTERLUDES).flatMap((t) => Object.values(t)),
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

describe('Each hero’s own voice', () => {
  it('words every take after a line that is really said', () => {
    const said = new Set(storyLines.map((l) => l.text));
    for (const text of Object.keys(HERO_TAKES)) expect(said.has(text), text).toBe(true);
  });

  it('gives Kévin and Charline different words in every stage they speak', () => {
    for (const level of LEVELS) {
      const lines = [...level.intro, ...level.outro].filter((l) => l.who === 'hero');
      if (!lines.length) continue;
      const differs = lines.some((l) => lineText(l.text, 'kevin') !== lineText(l.text, 'charline'));
      expect(differs, level.id).toBe(true);
    }
  });

  it('lets the partner at the exit speak in their own voice', () => {
    for (const moment of ['waiting', 'welcome']) {
      const k = new Set(BARKS.kevin[moment]);
      for (const line of BARKS.charline[moment]) expect(k.has(line), line).toBe(false);
    }
  });

  it('writes the player’s controls into the hints, never a fixed key', () => {
    for (const l of storyLines) expect(l.text, l.text).not.toMatch(/\bX\b|\bEspace\b(?! VIP)/);
    const hint = LEVELS.find((l) => l.id === 'ts')?.bossIntro?.find((l) => l.who === 'hint');
    expect(lineText(/** @type {{text: string}} */ (hint).text, '')).toMatch(/compte rendu \(X\)/);
  });

  it('keeps Kévin’s Céline Dion line word for word, whoever plays', () => {
    expect(BARKS.kevin.celine).toEqual(['Si c’est pour Céline Dion, on va faire le maximum !']);
    for (const take of Object.values(HERO_TAKES))
      for (const t of Object.values(take)) expect(t).not.toMatch(/Céline/);
  });
});

describe('Interlude between story stages (NA-2)', () => {
  it('reads each stage’s time from its subtitle and runs forward to Thursday', () => {
    expect(stageTime('Pays de la Loire · mardi, 14 h 03')).toBe(1440 + 14 * 60 + 3);
    expect(clockText(1440 + 14 * 60 + 3)).toBe('mardi, 14 h 03');
    expect(countdownText(NAO_AT - 61)).toBe('1 h 01 min');
    expect(countdownText(NAO_AT - 2 * 1440 - 5)).toBe('2 j 0 h 05 min');
    expect(countdownText(NAO_AT)).toBe('C’est l’heure !');
    expect(clockAt(0, 100, 0)).toBe(0);
    expect(clockAt(0, 100, 2)).toBe(100);
  });

  it('has an interlude for every step of the story, in both voices', () => {
    for (let i = 0; i + 1 < CAMPAIGN; i++) {
      const [a, b] = [LEVELS[i], LEVELS[i + 1]];
      const k = interludeFor(a, b, 'kevin');
      const c = interludeFor(a, b, 'charline');
      expect(k, `${a.id} → ${b.id}`).toBeTruthy();
      expect(c?.line).not.toBe(k?.line);
      expect(/** @type {{to: number}} */ (k).to).toBeLessThan(NAO_AT);
      expect(k?.stop).toBe(i);
    }
  });

  it('stays up long enough to read (or hear) everything it says', () => {
    for (let i = 0; i + 1 < CAMPAIGN; i++)
      for (const hero of /** @type {const} */ (['kevin', 'charline'])) {
        const it = /** @type {NonNullable<ReturnType<typeof interludeFor>>} */ (
          interludeFor(LEVELS[i], LEVELS[i + 1], hero)
        );
        const said = `${clockText(it.to)}. Avant les NAO : ${countdownText(it.to)}. ${it.who} : ${it.line}`;
        const words = said.split(/\s+/).filter((w) => /[\p{L}\d]/u.test(w)).length;
        // At least 150 words a minute, a screen reader's pace.
        expect(readingTime(said), said).toBeGreaterThanOrEqual(words * 0.4);
      }
    expect(readingTime('Bonjour')).toBeGreaterThanOrEqual(2);
  });

  it('stays out of the bonus stages and of any jump back', () => {
    expect(interludeFor(LEVELS[CAMPAIGN - 1], LEVELS[CAMPAIGN], 'kevin')).toBeNull();
    expect(interludeFor(LEVELS[2], LEVELS[1], 'kevin')).toBeNull();
  });
});

describe('Tips where they are needed', () => {
  /** What a tip talks about, and the map tiles that show it. */
  const SUBJECTS = /** @type {Array<[RegExp, string]>} */ ([
    [/voiture/, 'Q'],
    [/collègue/, 'n'],
    [/Câbles/, '^'],
    [/robot aspirateur/, 'v'],
    [/Dalle fragile/, '-'],
    [/stagiaire/, 'i'],
    [/Sprinkler/, 'w'],
    [/Vidéoprojecteur/, 'J'],
    [/vanne/, 'k'],
    [/bonbonnes/, 'R'],
  ]);

  it('shows each tip within a few tiles of the thing it names, after every map change', () => {
    for (const level of LEVELS)
      for (const tip of level.tips ?? []) {
        expect(tip.x1, `${level.id}: « ${tip.keys} » past the map`).toBeLessThan(
          level.map[0].length,
        );
        /** @type {number[]} */
        const xs = [];
        for (const [re, ch] of SUBJECTS)
          if (re.test(tip.keys))
            for (const row of level.map)
              for (let x = row.indexOf(ch); x >= 0; x = row.indexOf(ch, x + 1)) xs.push(x + 0.5);
        if (/acelle|Monte-charge/.test(tip.keys))
          for (const l of level.lifts ?? []) xs.push(l.x + (l.w ?? 2) / 2);
        if (!xs.length) continue;
        const gap = Math.min(...xs.map((x) => Math.max(0, tip.x0 - x, x - tip.x1)));
        expect(gap, `${level.id}: « ${tip.keys} » at ${tip.x0}`).toBeLessThanOrEqual(8);
      }
  });
});

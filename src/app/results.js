import { CAST } from '../data/cast.js';
import { LEVELS, ROOM_W } from '../data/levels/index.js';
import { load, store } from './storage.js';

/**
 * Stage results card: medal, time and gap to the record, and the secrets each hero
 * has found on this stage. Saves the record and the secrets as it goes. A medal held
 * at bronze by relaxed mode or a slower speed says so, kindly, with what the time
 * is worth without the help; a missed secret gets a hint (the room it hides in).
 *
 * @typedef {'kevin'|'charline'} HeroId
 * @typedef {'gold'|'silver'|'bronze'} MedalTier
 * @typedef {import('./medals.js').Held} Held
 * @typedef {{tier: MedalTier | null, star: boolean, held?: Held}} Medal
 * @typedef {[label: string, value: string, best?: boolean]} Row
 */

/** Best time per `stage:hero` (or `daily:<day>`), in seconds. */
export const BEST_KEY = 'naorush.best';
/** Secrets found per `stage:hero`: the column of each one. */
export const SECRETS_KEY = 'naorush.secrets';
/** @type {HeroId[]} */
const HEROES = ['kevin', 'charline'];
/** @type {Record<MedalTier, string>} */
const TIER_NAME = { gold: 'Or', silver: 'Argent', bronze: 'Bronze' };
/** What held the medal back, and how to play without it. @type {Record<Held['by'], [string, string]>} */
const HELP = {
  relaxed: ['Mode détente', 'sans le mode détente'],
  slow: ['Vitesse réduite', 'à vitesse normale'],
  both: ['Mode détente et vitesse réduite', 'sans aide'],
  any: ['Mode détente ou vitesse réduite', 'sans aide'],
};

/** @param {number} s */
export const clock = (s) =>
  `${Math.floor(s / 60)} min ${String(Math.floor(s % 60)).padStart(2, '0')} s`;

/** Signed gap in seconds, French style: « −1,2 s », « +3,4 s ». @param {number} gap */
export const gapText = (gap) =>
  `${gap < 0 ? '−' : '+'}${Math.abs(gap).toFixed(1).replace('.', ',')} s`;

/**
 * Reads whatever the medal API hands back: a tier name, or an object with a tier
 * (`tier`, `medal`, `rank` or `id`) and a `star` for a run without a checkpoint return.
 * @param {unknown} m
 * @returns {Medal | null}
 */
export function readMedal(m) {
  if (!m) return null;
  const o = /** @type {Record<string, unknown>} */ (typeof m === 'object' ? m : { tier: m });
  const raw = o.tier ?? o.medal ?? o.rank ?? o.id;
  const tier = raw === 'gold' || raw === 'silver' || raw === 'bronze' ? raw : null;
  const star = Boolean(o.star);
  const h = /** @type {Partial<Held> | undefined} */ (o.held);
  const held =
    h && h.by && h.by in HELP && (h.tier === 'gold' || h.tier === 'silver' || h.tier === 'bronze')
      ? { by: h.by, tier: h.tier, star: Boolean(h.star) }
      : undefined;
  if (!tier && !star) return null;
  return held ? { tier, star, held } : { tier, star };
}

/**
 * Why a medal stayed bronze, and what the same time is worth without the help.
 * @param {Held} held @param {{gold?: number, silver?: number}} [targets]
 */
export function heldText(held, targets) {
  const [what, undo] = HELP[held.by];
  const why = `${what} : la médaille s’arrête au bronze.`;
  if (held.tier !== 'bronze') {
    const prize = held.tier === 'gold' ? 'l’or' : 'l’argent';
    const both = held.star && held.tier === 'gold';
    return `${why} Ton temps vaut ${prize}${both ? ' et l’étoile' : ''}, rejoue ${undo} pour ${both ? 'les' : 'le'} décrocher !`;
  }
  const silver = targets?.silver;
  return silver === undefined
    ? `${why} Rejoue ${undo} pour viser l’argent !`
    : `${why} Rejoue ${undo} : l’argent t’attend sous ${clock(silver)} !`;
}

/**
 * The room where the first secret this hero hasn't found yet hides, if any.
 * @param {string} levelId @param {number[]} found Columns in the hero's notebook.
 * @param {number[]} secrets Columns of every secret of the stage.
 */
export function secretHint(levelId, found, secrets) {
  const rooms = LEVELS.find((l) => l.id === levelId)?.rooms;
  const missing = [...secrets].sort((a, b) => a - b).find((c) => !found.includes(c));
  return missing === undefined ? '' : (rooms?.[Math.floor(missing / ROOM_W)] ?? '');
}

/** The columns of the secrets a hero has found on a stage. @param {string} levelId @param {HeroId} hero */
function notebook(levelId, hero) {
  const all = /** @type {Record<string, number[]>} */ (load(SECRETS_KEY, {}));
  const list = all[`${levelId}:${hero}`];
  return Array.isArray(list) ? list : [];
}

/** @param {string} levelId @param {HeroId} hero */
export const secretsFound = (levelId, hero) => notebook(levelId, hero).length;

/**
 * Adds the secrets found in this run to the hero's notebook for the stage.
 * @param {string} levelId @param {HeroId} hero @param {number[]} columns
 */
export function noteSecrets(levelId, hero, columns) {
  const all = /** @type {Record<string, number[]>} */ (load(SECRETS_KEY, {}));
  const key = `${levelId}:${hero}`;
  const before = Array.isArray(all[key]) ? all[key] : [];
  const merged = [...new Set([...before, ...columns])].sort((a, b) => a - b);
  if (merged.length !== before.length) {
    all[key] = merged;
    store(SECRETS_KEY, all);
  }
}

/**
 * What the card shows, from a finished run and the record before it. Pure.
 * `hint`: the room of a secret the hero hasn't found yet, if any.
 * @param {{time: number, deaths: number, tickets: number, secrets: number, secretTotal: number,
 *   best?: number, perHero?: Record<HeroId, number>, medal?: Medal | null,
 *   targets?: {gold?: number, silver?: number}, hint?: string}} r
 */
export function buildResults(r) {
  const record = !(/** @type {number} */ (r.best) <= r.time);
  const gap = r.best === undefined ? null : r.time - r.best;
  const allSecrets = r.secretTotal > 0 && r.secrets >= r.secretTotal;
  /** @type {Row[]} */
  const rows = [
    ['Tickets Swile', String(r.tickets)],
    ['Secrets', `${r.secrets} / ${r.secretTotal}${allSecrets ? ' ✓' : ''}`, allSecrets],
    ['Temps', clock(r.time)],
    [
      'Record',
      record
        ? `Nouveau record !${gap === null ? '' : ` (${gapText(gap)})`}`
        : `${clock(/** @type {number} */ (r.best))} (${gapText(/** @type {number} */ (gap))})`,
      record,
    ],
    ['Retours au badge', r.deaths ? String(r.deaths) : 'Aucun, sans faute !', !r.deaths],
  ];
  if (r.perHero && r.secretTotal > 0) {
    const per = /** @type {Record<HeroId, number>} */ (r.perHero);
    const all = HEROES.every((h) => per[h] >= r.secretTotal);
    rows.push([
      'Secrets par héros',
      HEROES.map((h) => `${CAST[h].name} ${per[h]}/${r.secretTotal}`).join(' · '),
      all,
    ]);
  }
  const medal = r.medal ?? null;
  const why = medal?.held ? heldText(medal.held, r.targets) : '';
  const next = why ? '' : nextTarget(r);
  // A lead for the next run, while this hero's notebook still has a gap.
  const hint = r.hint && !allSecrets ? `Piste : « ${r.hint} »` : '';
  return { rows, record, gap, allSecrets, flawless: !r.deaths, medal, next, why, hint };
}

/**
 * The next medal to aim for and the seconds still to find, when the medal API
 * gives the target times.
 * @param {{time: number, medal?: Medal | null, targets?: {gold?: number, silver?: number}}} r
 */
function nextTarget(r) {
  const tier = r.medal?.tier;
  const t = r.targets;
  if (!t || tier === 'gold') return '';
  const aim = tier === 'silver' || t.silver === undefined ? 'gold' : 'silver';
  const limit = aim === 'gold' ? t.gold : t.silver;
  if (limit === undefined) return '';
  // Strictly under the limit: a tenth at least to find.
  const short = Math.max(0.1, r.time - limit);
  const seconds = `${short.toFixed(1).replace('.', ',')} s`;
  return `${TIER_NAME[aim]} sous ${clock(limit)} · ${seconds} à gagner`;
}

/**
 * Fills the results card and saves the record and the secrets.
 * @param {HTMLElement} stats The card's <dl>; the medal line is kept just above it.
 * @param {{sim: {time: number, deaths: number, tickets: number, secrets: number, secretTotal: number,
 *   hardcore?: boolean, things: Array<{kind: string, alive: boolean, x: number}>}, levelId: string,
 *   hero: HeroId, daily?: string, medal?: unknown, targets?: {gold?: number, silver?: number}}} ctx
 *   `medal`: what medals.js hands back for this run. « Sans filet » (`sim.hardcore`) keeps its own records.
 */
export function renderResults(stats, ctx) {
  const { sim, levelId, hero } = ctx;
  const bests = /** @type {Record<string, number>} */ (load(BEST_KEY, {}));
  const key = ctx.daily
    ? `daily:${ctx.daily}`
    : `${levelId}:${hero}${sim.hardcore ? ':sansfilet' : ''}`;
  const best = typeof bests[key] === 'number' ? bests[key] : undefined;
  // The secrets of this run go into the hero's notebook before counting.
  const secrets = sim.things.filter((t) => t.kind === 'secret');
  const columns = secrets.filter((t) => !t.alive).map((t) => Math.floor(t.x));
  noteSecrets(levelId, hero, columns);
  const all = secrets.map((t) => Math.floor(t.x));
  const r = buildResults({
    time: sim.time,
    deaths: sim.deaths,
    tickets: sim.tickets,
    secrets: sim.secrets,
    secretTotal: sim.secretTotal,
    best,
    perHero: { kevin: secretsFound(levelId, 'kevin'), charline: secretsFound(levelId, 'charline') },
    medal: readMedal(ctx.medal),
    targets: ctx.targets,
    hint: secretHint(levelId, notebook(levelId, hero), all),
  });
  if (r.record) {
    bests[key] = sim.time;
    store(BEST_KEY, bests);
  }
  stats.replaceChildren(
    ...r.rows.flatMap(([k, v, gold]) => {
      const dt = document.createElement('dt');
      const dd = document.createElement('dd');
      dt.textContent = k;
      dd.textContent = v;
      if (gold) dd.className = 'best';
      if (k === 'Secrets' && r.hint) {
        const hint = document.createElement('span');
        hint.className = 'secret-hint';
        hint.textContent = r.hint;
        dd.append(hint);
      }
      return [dt, dd];
    }),
  );
  renderMedal(stats, r.medal, r.next, r.why);
  return r;
}

/**
 * The medal line above the stats: a disc in the medal's colour, its name, the star,
 * then the next target or, for a helped run, why it stayed bronze.
 * @param {HTMLElement} stats @param {Medal | null} medal @param {string} next @param {string} why
 */
function renderMedal(stats, medal, next, why) {
  let el = /** @type {HTMLElement | null} */ (stats.previousElementSibling);
  if (!el || !el.classList.contains('medal')) {
    el = document.createElement('p');
    el.className = 'medal';
    stats.before(el);
  }
  el.hidden = !medal;
  if (!medal) return;
  el.className = `medal${medal.tier ? ` ${medal.tier}` : ''}${medal.star ? ' star' : ''}`;
  /** @param {string} tag @param {string} cls @param {string} text */
  const make = (tag, cls, text) => {
    const n = document.createElement(tag);
    n.className = cls;
    n.textContent = text;
    return n;
  };
  /** @type {Node[]} */
  const parts = [make('span', 'sr-only', 'Médaille : ')];
  if (medal.tier) {
    const disc = make('span', 'medal-disc', '');
    disc.setAttribute('aria-hidden', 'true');
    parts.push(disc, make('b', 'medal-name', TIER_NAME[medal.tier]));
  }
  if (medal.star) {
    const star = make('span', 'medal-star', '');
    const glyph = make('span', '', '★ ');
    glyph.setAttribute('aria-hidden', 'true');
    star.replaceChildren(glyph, document.createTextNode('Sans retour au badge'));
    parts.push(star);
  }
  if (next) parts.push(make('span', 'medal-next', next));
  if (why) parts.push(make('span', 'medal-why', why));
  el.replaceChildren(...parts);
}

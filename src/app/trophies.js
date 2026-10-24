import { load, store } from './storage.js';

/**
 * Trophies: small goals for replaying the stages, saved in the browser.
 *
 * @typedef {{id: string, name: string, text: string}} Trophy
 */

/** @type {Trophy[]} */
export const TROPHIES = [
  { id: 'badge', name: 'Premier badge', text: 'Finir le parking B2.' },
  { id: 'nao', name: 'NAO sauvées', text: 'Faire signer l’enveloppe.' },
  { id: 'kevin', name: 'Jalon validé', text: 'Finir le jeu avec Kévin.' },
  { id: 'charline', name: 'Deal conclu', text: 'Finir le jeu avec Charline.' },
  { id: 'clean', name: 'Zéro incident', text: 'Finir une étape sans retour au badge.' },
  { id: 'secrets', name: 'Fouineur', text: 'Trouver les deux secrets d’une même étape.' },
  { id: 'allSecrets', name: 'Rien ne m’échappe', text: 'Trouver 10 secrets au total.' },
  { id: 'julien', name: 'Haute disponibilité', text: 'Convaincre Julien sans être touché.' },
  { id: 'rodolphe', name: 'Tête d’affiche', text: 'Convaincre Rodolphe sans être touché.' },
  { id: 'parry', name: 'Contre-argument', text: 'Intercepter 15 projectiles avec des CR.' },
  { id: 'meetings', name: 'Agenda plein', text: 'Envoyer 20 collègues en réunion.' },
  { id: 'tickets', name: 'Repas offerts', text: 'Ramasser 150 tickets Swile au total.' },
  { id: 'bonus', name: 'Départ en mission', text: 'Finir l’étape bonus Intercontrat.' },
  { id: 'pause', name: 'Pause méritée', text: 'Échapper aux bonbonnes de la salle de pause.' },
  { id: 'daily', name: 'Habitué du défi', text: 'Réussir le défi du jour trois jours différents.' },
  { id: 'celine', name: 'Pour Céline', text: 'Réserver les places du concert de Céline Dion.' },
];

const KEY = 'naorush.trophies';

export class Trophies {
  /** @param {(t: Trophy) => void} onUnlock */
  constructor(onUnlock) {
    this.onUnlock = onUnlock;
    /** @type {{got: Record<string, boolean>, counts: Record<string, number>, secrets: string[], days: string[]}} */
    this.data = { got: {}, counts: {}, secrets: [], days: [] };
    const saved =
      /** @type {{got?: unknown, counts?: unknown, secrets?: unknown, days?: unknown}} */ (
        load(KEY, {})
      );
    // Keep only well-formed parts of an older or damaged save.
    if (saved.got && typeof saved.got === 'object')
      this.data.got = /** @type {Record<string, boolean>} */ (saved.got);
    if (saved.counts && typeof saved.counts === 'object')
      this.data.counts = /** @type {Record<string, number>} */ (saved.counts);
    if (Array.isArray(saved.secrets)) this.data.secrets = saved.secrets;
    if (Array.isArray(saved.days)) this.data.days = saved.days;
    /** Hits taken during the current boss fight. */
    this.bossHits = 0;
  }

  save() {
    store(KEY, this.data);
  }

  /** @param {string} id */
  unlock(id) {
    if (this.data.got[id]) return;
    this.data.got[id] = true;
    this.save();
    const t = TROPHIES.find((x) => x.id === id);
    if (t) this.onUnlock(t);
  }

  /** @param {string} name @param {number} goal @param {string} id */
  count(name, goal, id) {
    this.data.counts[name] = (this.data.counts[name] ?? 0) + 1;
    this.save();
    if (this.data.counts[name] >= goal) this.unlock(id);
  }

  /**
   * @param {import('../game/sim.js').SimEvent} e
   * @param {import('../game/sim.js').Sim} sim
   * @param {string} stageId
   */
  event(e, sim, stageId) {
    switch (e.type) {
      case 'concert':
        this.unlock('celine');
        break;
      case 'parry':
        this.count('parry', 15, 'parry');
        break;
      case 'meeting':
        this.count('meetings', 20, 'meetings');
        break;
      case 'ticket':
        this.count('tickets', 150, 'tickets');
        break;
      case 'bossStart':
        this.bossHits = 0;
        break;
      case 'hurt':
      case 'zap':
        if (sim.bossActive) this.bossHits++;
        break;
      case 'bossDone':
        if (this.bossHits === 0)
          this.unlock(sim.boss?.id === 'regionalDirector' ? 'rodolphe' : 'julien');
        break;
      case 'secret': {
        const key = `${stageId}:${Math.round(e.x)}`;
        if (!this.data.secrets.includes(key)) {
          this.data.secrets.push(key);
          this.save();
        }
        if (sim.secrets >= sim.secretTotal) this.unlock('secrets');
        if (this.data.secrets.length >= 10) this.unlock('allSecrets');
        break;
      }
      default:
        break;
    }
  }

  /**
   * @param {import('../game/sim.js').Sim} sim
   * @param {string} stageId
   * @param {boolean} last
   */
  stageWon(sim, stageId, last) {
    if (stageId === 'parking') this.unlock('badge');
    if (stageId === 'intercontrat') this.unlock('bonus');
    if (stageId === 'pause') this.unlock('pause');
    if (sim.deaths === 0) this.unlock('clean');
    if (last) {
      this.unlock('nao');
      this.unlock(sim.heroId);
    }
  }

  /** A daily challenge completed. @param {string} day */
  dailyDone(day) {
    if (!this.data.days.includes(day)) {
      this.data.days.push(day);
      this.save();
    }
    if (this.data.days.length >= 3) this.unlock('daily');
  }

  /** @returns {Array<Trophy & {got: boolean}>} */
  list() {
    return TROPHIES.map((t) => ({ ...t, got: Boolean(this.data.got[t.id]) }));
  }
}

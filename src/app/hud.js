import { POSTER_HINTS, posterTitle } from '../data/inetum.js';
import { HERO } from '../game/sim.js';

/** @param {string} id */
const $ = (id) => /** @type {HTMLElement} */ (document.getElementById(id));

/** Short lines shown for simulation events. */
const EVENT_TEXT = {
  checkpoint: 'Badgé ! Chronotime enregistre ta progression.',
  door: 'Badge accepté : la porte du fond s’ouvre.',
  key: 'Bon de commande signé ! Attention à la bonbonne…',
  collapse: 'Le planning s’effondre !',
  bump: '« Je suis en call, là ! » — un CR (X) l’enverra en réunion.',
  meeting: 'Parti en réunion. La voie est libre quelques secondes.',
  empty: 'Plus de CR : trouve une ramette de papier.',
  ammo: '+3 comptes rendus.',
  zap: 'Court-circuit ! Retour au dernier badge Chronotime.',
};

/** DOM heads-up display: hearts, Swile tickets, CR stock, purchase order, room name, hints. */
export class Hud {
  constructor() {
    this.hearts = $('hearts');
    this.tickets = $('tickets');
    this.ammo = $('ammo');
    this.key = $('key');
    this.room = $('room');
    this.toastEl = $('toast');
    this.hintEl = $('hint');
    this.toastTime = 0;
    this.lastHearts = -1;
    this.lastPoster = '';
  }

  /** @param {string} text */
  toast(text) {
    this.toastEl.textContent = text;
    this.toastEl.classList.add('show');
    this.toastTime = 2.8;
  }

  /** @param {import('../game/sim.js').SimEvent} e */
  event(e) {
    const text = EVENT_TEXT[/** @type {keyof typeof EVENT_TEXT} */ (e.type)];
    if (text) this.toast(text);
  }

  /**
   * @param {number} dt
   * @param {import('../game/sim.js').Sim} sim
   * @param {{rooms: string[], roomW: number}} level
   * @param {{poster?: string, board?: boolean}} near
   */
  update(dt, sim, level, near) {
    const max = sim.stats.hearts;
    if (sim.hero.hearts !== this.lastHearts) {
      this.lastHearts = sim.hero.hearts;
      this.hearts.replaceChildren(
        ...Array.from({ length: max }, (_, i) => {
          const el = document.createElement('span');
          el.className = i < sim.hero.hearts ? 'heart' : 'heart empty';
          return el;
        }),
      );
    }
    this.tickets.textContent = String(sim.tickets);
    this.ammo.textContent = String(sim.ammo);
    this.key.classList.toggle('have', sim.hasKey);
    const room = Math.min(
      level.rooms.length - 1,
      Math.floor((sim.hero.x + HERO.w / 2) / level.roomW),
    );
    this.room.textContent = level.rooms[room];
    if (this.toastTime > 0 && (this.toastTime -= dt) <= 0) this.toastEl.classList.remove('show');
    // Contextual hint: read a whiteboard, or what a poster means in play.
    const hint = near.board
      ? '↑ Lire le tableau'
      : near.poster
        ? (POSTER_HINTS[/** @type {keyof typeof POSTER_HINTS} */ (near.poster)] ?? '')
        : '';
    const title = near.poster && !near.board ? posterTitle(near.poster) : '';
    if (hint + title !== this.lastPoster) {
      this.lastPoster = hint + title;
      this.hintEl.innerHTML = '';
      if (hint) {
        if (title) {
          const b = document.createElement('b');
          b.textContent = title;
          this.hintEl.append(b);
        }
        this.hintEl.append(document.createTextNode(hint));
      }
      this.hintEl.classList.toggle('show', Boolean(hint));
    }
  }
}

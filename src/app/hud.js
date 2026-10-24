import { CAST } from '../data/cast.js';
import { load, store } from './storage.js';
import { POSTER_HINTS, posterTitle } from '../data/inetum.js';
import { HERO } from '../game/sim.js';

/** @param {string} id */
const $ = (id) => /** @type {HTMLElement} */ (document.getElementById(id));

/** Short lines shown for simulation events. */
const EVENT_TEXT = {
  checkpoint: 'Badgé ! Chronotime enregistre ta progression.',
  door: 'Badge accepté : la porte du fond s’ouvre.',
  collapse: 'Le planning s’effondre !',
  bump: '« Je suis en call, là ! » — un CR (X) l’enverra en réunion.',
  block: 'Il est concentré : attends qu’il consulte PRIMO.',
  concert: 'Deux places pour le concert de Céline Dion : réservées !',
  consult: 'Il consulte PRIMO… c’est le moment !',
  bossHit: 'Argument reçu !',
  parry: 'Slide KPI interceptée.',
  meeting: 'Parti en réunion. La voie est libre quelques secondes.',
  empty: 'Plus de CR : trouve une ramette de papier.',
  ammo: '+3 comptes rendus.',
  zap: 'Court-circuit ! Retour au dernier badge Chronotime.',
};

/** One-time tips the first time a mechanic shows up (remembered across sessions). */
const FIRST_TIME = {
  chairRoll: 'Les fauteuils foncent sur toi : saute par-dessus !',
  drawerOut: 'Le tiroir claque en rythme : passe juste après.',
  sprayOn: 'Le sprinkler goutte avant d’arroser : attends la pause.',
  paperShot: 'L’imprimante clignote puis tire : saute la feuille, ou renvoie un CR.',
  trapdoor: 'Une trappe cachée ! Au prochain passage, tu sauras où elle est.',
  invite: 'Une invitation en visio fonce sur toi : saute-la, ou réponds par un CR.',
  vacuumBounce: 'Le robot aspirateur fait un excellent tremplin.',
  internStun: 'Le stagiaire prend une pause café : passe vite !',
  archive: 'Les CR de Kévin font tomber les cartons d’archives.',
  rackDrop: 'Une ombre au sol : une baie serveur arrive, écarte-toi !',
  cableWarn: 'Les câbles qui s’allument vont passer sous tension : reste sur les zones éteintes.',
  zoneWarn: 'Les projecteurs vont frapper : file dans la zone restée sombre.',
  dash: 'La tournée régionale ! Monte sur une plateforme pour la laisser passer.',
  switch: 'Coupure d’eau : tous les sprinklers de l’étape sont arrêtés.',
  secret: 'Secret trouvé ! Il y en a un pour chaque héros dans chaque étape.',
};
const TIPS_KEY = 'naorush.tips';

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
    /** Mechanics already explained. @type {Set<string>} */
    this.seen = new Set(/** @type {string[]} */ (load(TIPS_KEY, [])));
    this.bossbar = $('bossbar');
    this.bossName = $('bossName');
    this.bossHp = $('bossHp');
  }

  clearToast() {
    this.toastTime = 0;
    this.toastEl.classList.remove('show');
  }

  /** @param {string} text */
  toast(text) {
    this.toastEl.textContent = text;
    this.toastEl.classList.add('show');
    this.toastTime = 2.8;
  }

  /** Stage-specific wording. @param {{keyLabel: string, bottle: boolean}} stage */
  setStage(stage) {
    this.stage = stage;
  }

  /** @param {import('../game/sim.js').SimEvent} e */
  event(e) {
    if (e.type === 'key' && this.stage) {
      this.toast(
        `${this.stage.keyLabel} récupéré !` +
          (this.stage.bottle ? ' Attention à la bonbonne…' : ''),
      );
      return;
    }
    const tip = FIRST_TIME[/** @type {keyof typeof FIRST_TIME} */ (e.type)];
    if (tip && !this.seen.has(e.type)) {
      this.seen.add(e.type);
      store(TIPS_KEY, [...this.seen]);
      this.toast(tip);
      return;
    }
    const text = EVENT_TEXT[/** @type {keyof typeof EVENT_TEXT} */ (e.type)];
    if (text) this.toast(text);
  }

  /**
   * @param {number} dt
   * @param {import('../game/sim.js').Sim} sim
   * @param {{rooms: string[], roomW: number, keyLabel: string, timer?: boolean}} level
   * @param {{poster?: string, board?: boolean, tip?: string}} near
   */
  update(dt, sim, level, near) {
    const max = sim.maxHearts;
    if (sim.hero.hearts !== this.lastHearts) {
      this.lastHearts = sim.hero.hearts;
      this.hearts.classList.toggle('low', sim.hero.hearts === 1 && max > 1);
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
    // A small compass: where the key item is, then where the exit is.
    const hx = sim.hero.x + HERO.w / 2;
    const find = (/** @type {string} */ kind) => sim.things.find((t) => t.alive && t.kind === kind);
    // Before the boss signs, the key item does not exist yet: point at the boss.
    const target = sim.hasKey ? find('exit') : (find('key') ?? find('boss'));
    const arrow = !target || Math.abs(target.x - hx) < 3 ? '' : target.x > hx ? ' ▶' : ' ◀';
    const label = sim.hasKey ? `${level.keyLabel} ✓ · Sortie${arrow}` : `${level.keyLabel}${arrow}`;
    if (this.key.textContent !== label) this.key.textContent = label;
    const room = Math.min(
      level.rooms.length - 1,
      Math.floor((sim.hero.x + HERO.w / 2) / level.roomW),
    );
    // Against the clock (daily challenge): the room label becomes a stopwatch.
    this.room.textContent = level.timer
      ? `${Math.floor(sim.time / 60)}:${String(Math.floor(sim.time % 60)).padStart(2, '0')}.${Math.floor((sim.time % 1) * 10)}`
      : level.rooms[room];
    this.room.classList.toggle('timer', Boolean(level.timer));
    // Boss fight: name and remaining conviction.
    const fight = Boolean(sim.boss && sim.bossActive && !sim.bossDone);
    this.bossbar.hidden = !fight;
    document.body.classList.toggle('boss', fight);
    if (fight && sim.boss) {
      const boss = sim.things.find((t) => t.kind === 'boss');
      this.bossName.textContent = `${CAST[sim.boss.id].name} · ${CAST[sim.boss.id].title}`;
      this.bossHp.style.width = `${(100 * (boss?.hp ?? 0)) / sim.boss.hp}%`;
    }
    if (this.toastTime > 0 && (this.toastTime -= dt) <= 0) this.toastEl.classList.remove('show');
    // Contextual hint: read a whiteboard, or what a poster means in play.
    const hint = near.tip
      ? near.tip
      : near.board
        ? '↑ Lire le tableau'
        : near.poster
          ? (POSTER_HINTS[/** @type {keyof typeof POSTER_HINTS} */ (near.poster)] ?? '')
          : '';
    const title = near.tip ? 'Astuce' : near.poster && !near.board ? posterTitle(near.poster) : '';
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

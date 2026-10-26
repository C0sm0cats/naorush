import { CAST } from '../data/cast.js';
import { load, store } from './storage.js';
import { POSTER_HINTS, posterTitle } from '../data/inetum.js';
import { HERO } from '../game/sim.js';
import { PATTERNS, consultLength } from '../game/boss.js';
import { prefs } from './options.js';
import { project } from '../gfx/mat4.js';
import { fillKeys } from './input.js';

/** @param {string} id */
const $ = (id) => /** @type {HTMLElement} */ (document.getElementById(id));

/** Short lines shown for simulation events. */
const EVENT_TEXT = {
  door: 'Badge accepté : la porte du fond s’ouvre.',
  collapse: 'Le planning s’effondre !',
  bump: '« Je suis en call, là ! » — un CR ({fire}) l’enverra en réunion.',
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
  checkpoint: 'Badgé ! Chronotime enregistre ta progression.',
  chairRoll: 'Les fauteuils foncent sur toi : saute par-dessus !',
  drawerOut: 'Le tiroir claque en rythme : passe juste après.',
  sprayOn: 'Le sprinkler goutte avant d’arroser : attends la pause.',
  puddle: 'Attention sol glissant ! Ça glisse : freine plus tôt. Les sauts, eux, ne changent pas.',
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

/** One-line versions for short screens (landscape phones), where a toast must stay on one line. */
const SHORT = {
  door: 'Badge accepté : porte ouverte.',
  bump: 'En call : un CR ({fire}) l’envoie en réunion.',
  block: 'Attends qu’il consulte PRIMO.',
  concert: 'Places pour Céline Dion réservées !',
  consult: 'Il consulte PRIMO : vas-y !',
  meeting: 'Parti en réunion : la voie est libre.',
  empty: 'Plus de CR : trouve une ramette.',
  zap: 'Court-circuit ! Retour au badge.',
  checkpoint: 'Badgé ! Progression enregistrée.',
  chairRoll: 'Fauteuil lancé : saute par-dessus !',
  drawerOut: 'Tiroir en rythme : passe juste après.',
  sprayOn: 'Ça goutte ? Attends la pause.',
  puddle: 'Sol glissant : freine plus tôt !',
  paperShot: 'L’imprimante tire : saute la feuille.',
  trapdoor: 'Trappe cachée ! Retiens où elle est.',
  invite: 'Invitation visio : saute-la, ou un CR.',
  vacuumBounce: 'Le robot aspirateur : un tremplin !',
  internStun: 'Pause café du stagiaire : passe vite !',
  archive: 'Les CR de Kévin font tomber les cartons.',
  rackDrop: 'Une ombre au sol : écarte-toi !',
  cableWarn: 'Câbles allumés : reste en zone éteinte.',
  zoneWarn: 'Projecteurs : file dans la zone sombre.',
  dash: 'Tournée régionale : grimpe en hauteur !',
  switch: 'Eau coupée : sprinklers arrêtés.',
  secret: 'Secret trouvé ! Un par héros et par étape.',
};

/**
 * Why a CR stopped, when it is worth a word (sim `block` events carry a `cause`).
 * Said once per game and per cause: after that, the bounce speaks for itself.
 */
const BLOCK_TEXT = {
  crate: 'Ces cartons sont trop lourds pour ce CR : seuls ceux de Kévin les font tomber.',
  vacuum: 'Le robot aspirateur encaisse les CR sans broncher. Saute dessus : c’est un tremplin !',
};
const BLOCK_SHORT = {
  crate: 'Cartons trop lourds : les CR de Kévin, oui.',
  vacuum: 'Le robot encaisse : saute dessus !',
};

/**
 * Key items named with a feminine noun (« Enveloppe signée »): messages agree with them.
 * Matched on the first word of `keyLabel`.
 */
const FEMININE = new Set([
  'enveloppe',
  'clé',
  'clef',
  'carte',
  'attestation',
  'feuille',
  'note',
  'convocation',
  'invitation',
  'signature',
  'validation',
  'fiche',
  'lettre',
]);

/**
 * The word agreed with a key item: `agree('Enveloppe signée', 'récupéré', 'récupérée')`.
 * @param {string} label @param {string} masculine @param {string} feminine
 */
export function agree(label, masculine, feminine) {
  const first = label
    .trim()
    .split(/[\s’']/)[0]
    .toLowerCase();
  return FEMININE.has(first) ? feminine : masculine;
}

/**
 * The toast when the key item is picked up, agreed with its gender.
 * @param {string} label @param {{bottle?: boolean, short?: boolean}} [o]
 */
export function keyLine(label, o = {}) {
  const got = `${label} ${agree(label, 'récupéré', 'récupérée')} !`;
  if (o.bottle) return got + (o.short ? ' Gare à la bonbonne…' : ' Attention à la bonbonne…');
  return o.short ? got : `${got} Direction la sortie.`;
}

/** A text with the player's own controls; « un CR (CR) » on the touch pad reads « un CR ». @param {string} text */
const withKeys = (text) => fillKeys(text).replace(' CR (CR)', ' CR');

/** During a boss fight only the fight speaks: the duel's own moves and the CR stock. */
const FIGHT_EVENTS = new Set([
  'key',
  'consult',
  'block',
  'bossHit',
  'parry',
  'empty',
  'ammo',
  'zap',
  'rackDrop',
  'cableWarn',
  'zoneWarn',
  'dash',
]);
/** Messages about the boss's PRIMO window: stale once he is hit, convinced, or talking. */
const PRIMO_EVENTS = new Set(['consult', 'block']);
/** A first-time tip only explains what the player can see: this close, and on screen. */
const TIP_RANGE = 10;
/** Short screens (landscape phones): one-line toasts, gone quickly. */
const SHORT_SCREEN = 500;
const SHORT_TOAST = 2.5;

/**
 * Once Chronotime is explained, later badges get a short line, in turn: never twice for
 * the same badge on a stage (a restart badges them again), never over a more useful
 * message, and only if no badge spoke in the last few seconds.
 */
const CHECKPOINT_GAP = 12;
const CHECKPOINT_TOAST = 2;
const CHECKPOINT_LINES = [
  'Badgé ! Pointage enregistré.',
  'Bip ! Chronotime a tout noté.',
  'Badge validé : on repart d’ici en cas de pépin.',
  'Pointé ! Même le tourniquet est fier de toi.',
];

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
    /** What the toast on show is about (an event type, 'trophy'…), to clear it when it goes stale. */
    this.toastKind = '';
    /** Set by tick(): update() then leaves the countdown alone. */
    this.ticked = false;
    /** A boss fight is on: only its own messages show. */
    this.fight = false;
    /** Hero centre, for the distance of first-time tips. @type {{x: number, y: number} | null} */
    this.heroAt = null;
    /** Camera of the last frame, for "is it on screen". @type {Float32Array | null} */
    this.viewProj = null;
    this.lastHearts = -1;
    this.lastPoster = '';
    this.checkpoints = 0;
    /** Badges already announced on this stage (`x,y`), and the stage they belong to. @type {Set<string>} */
    this.badged = new Set();
    this.badgedStage = '';
    /** Real seconds since a badge last spoke (counted in countdown()). */
    this.sinceBadge = Infinity;
    /** Mechanics already explained. @type {Set<string>} */
    this.seen = new Set(/** @type {string[]} */ (load(TIPS_KEY, [])));
    this.bossbar = $('bossbar');
    this.bossName = $('bossName');
    this.bossHp = $('bossHp');
    this.bossPhase = $('bossPhase');
    this.bossConsult = $('bossConsult');
    this.bossConsultBar = $('bossConsultBar');
    this.lastPhase = '';
  }

  clearToast() {
    this.toastTime = 0;
    this.toastKind = '';
    this.toastEl.classList.remove('show', 'trophy');
    document.body.classList.remove('toast-trophy');
    document.body.style.setProperty('--toast-h', '0px');
  }

  /** Landscape phones: toasts shrink to one short line. */
  get short() {
    return typeof innerHeight === 'number' && innerHeight < SHORT_SCREEN;
  }

  /**
   * @param {string} text @param {string} [kind] What it is about (see toastKind).
   * @param {number} [time] Seconds on screen, when shorter than the reading time.
   */
  toast(text, kind = '', time) {
    this.toastKind = kind;
    this.toastEl.textContent = text;
    this.toastEl.classList.add('show');
    this.toastEl.classList.toggle('trophy', kind === 'trophy');
    // Over a menu or a results card, the screen makes room under a trophy (style.css).
    document.body.classList.toggle('toast-trophy', kind === 'trophy');
    // Long tips stay long enough to read (about 14 characters a second), slower games longer;
    // on short screens they are one line and must leave the arena quickly.
    const read = this.short ? SHORT_TOAST : Math.max(2.8, text.length / 14);
    this.toastTime = Math.min(read, time ?? read) / prefs.speed;
    // On touch screens the hint sits under the toast: tell it how far down to go.
    document.body.style.setProperty('--toast-h', `${this.toastEl.offsetHeight + 8}px`);
  }

  /** A trophy is announced over any screen, menus included. @param {string} name */
  trophy(name) {
    this.toast(`Trophée débloqué : ${name}`, 'trophy');
  }

  /**
   * Counts the toast down. Call it every frame on every screen (menus, pauses and
   * dialogues included), so a message never outstays its welcome.
   * @param {number} dt Real seconds since the last frame.
   * @param {Float32Array} [viewProj] This frame's camera, so first-time tips only explain what is on screen.
   */
  tick(dt, viewProj) {
    this.ticked = true;
    if (viewProj) this.viewProj = viewProj;
    this.countdown(dt);
  }

  /** @param {number} dt */
  countdown(dt) {
    this.sinceBadge += dt;
    if (this.toastTime > 0 && (this.toastTime -= dt) <= 0) this.clearToast();
  }

  /** A dialogue starts: gameplay messages (the PRIMO window above all) make way. */
  dialogue() {
    if (this.toastKind !== 'trophy') this.clearToast();
  }

  /** Drops the PRIMO message once it no longer holds. */
  clearPrimo() {
    if (PRIMO_EVENTS.has(this.toastKind)) this.clearToast();
  }

  /**
   * Within reach and in view: first-time tips about a trap across the stage would explain nothing.
   * @param {{x: number, y: number}} e
   */
  inView(e) {
    if (this.heroAt && Math.hypot(e.x - this.heroAt.x, e.y - this.heroAt.y) > TIP_RANGE)
      return false;
    if (!this.viewProj) return true;
    const p = project(this.viewProj, e.x, e.y, 0);
    return Math.abs(p.x) <= 1 && Math.abs(p.y) <= 1;
  }

  /** @param {string} type @param {string} text */
  line(type, text) {
    return (this.short && SHORT[/** @type {keyof typeof SHORT} */ (type)]) || text;
  }

  /**
   * Stage-specific wording. Called on every (re)start: badges announced on the same
   * stage stay quiet the next time round.
   * @param {{keyLabel: string, bottle: boolean, id?: string}} stage
   */
  setStage(stage) {
    this.stage = stage;
    const id = stage.id ?? stage.keyLabel;
    if (id !== this.badgedStage) this.badged.clear();
    this.badgedStage = id;
    this.sinceBadge = Infinity;
  }

  /**
   * A badge at a Chronotime terminal: a short line, unless it would repeat itself.
   * @param {{x: number, y: number}} e
   */
  checkpoint(e) {
    const at = `${Math.round(e.x)},${Math.round(e.y)}`;
    const known = this.badged.has(at);
    this.badged.add(at);
    if (known || this.sinceBadge < CHECKPOINT_GAP) return;
    // A tip or a warning on show matters more than « Badgé ! ».
    if (this.toastTime > 0 && this.toastKind && this.toastKind !== 'checkpoint') return;
    this.sinceBadge = 0;
    this.toast(
      CHECKPOINT_LINES[this.checkpoints++ % CHECKPOINT_LINES.length],
      'checkpoint',
      CHECKPOINT_TOAST,
    );
  }

  /** @param {import('../game/sim.js').SimEvent} e */
  event(e) {
    if (e.type === 'bossStart') this.fight = true;
    if (e.type === 'bossDone') {
      this.fight = false;
      this.clearPrimo();
    }
    if (e.type === 'key' && this.stage) {
      // Agreed with the item: « Badge récupéré », « Enveloppe signée récupérée ».
      this.toast(
        keyLine(this.stage.keyLabel, { bottle: this.stage.bottle, short: this.short }),
        'key',
      );
      return;
    }
    // Every obstacle that stops a CR fires 'block': a boss on guard gets the PRIMO advice,
    // a few other causes a one-time word on why, the rest bounces in silence.
    if (e.type === 'block' && e.cause !== 'boss') {
      const why = BLOCK_TEXT[/** @type {keyof typeof BLOCK_TEXT} */ (e.cause ?? '')];
      const seen = `block:${e.cause}`;
      if (!why || this.fight || this.seen.has(seen) || !this.inView(e)) return;
      this.seen.add(seen);
      store(TIPS_KEY, [...this.seen]);
      const short = BLOCK_SHORT[/** @type {keyof typeof BLOCK_SHORT} */ (e.cause)];
      this.toast(this.short ? short : why, 'block');
      return;
    }
    if (e.type === 'bossHit') {
      this.flashBoss();
      this.clearPrimo();
    }
    // A boss fight is a highlight: background traps keep their tips for later.
    if (this.fight && !FIGHT_EVENTS.has(e.type)) return;
    const tip = FIRST_TIME[/** @type {keyof typeof FIRST_TIME} */ (e.type)];
    // Not marked as seen when out of view: the tip waits for the player to meet the thing.
    if (tip && !this.seen.has(e.type) && this.inView(e)) {
      this.seen.add(e.type);
      store(TIPS_KEY, [...this.seen]);
      if (e.type === 'checkpoint') {
        // The explanation counts as this badge's line.
        this.badged.add(`${Math.round(e.x)},${Math.round(e.y)}`);
        this.sinceBadge = 0;
      }
      this.toast(withKeys(this.line(e.type, tip)), e.type);
      return;
    }
    if (e.type === 'checkpoint') return this.checkpoint(e);
    const text = EVENT_TEXT[/** @type {keyof typeof EVENT_TEXT} */ (e.type)];
    if (text) this.toast(withKeys(this.line(e.type, text)), e.type);
  }

  /** The conviction bar jolts when an argument lands. */
  flashBoss() {
    this.bossbar.classList.remove('hit');
    void this.bossbar.offsetWidth;
    this.bossbar.classList.add('hit');
  }

  /**
   * Phase pips and the PRIMO consult countdown.
   * @param {import('../game/world.js').BossId} id @param {import('../game/world.js').Thing | undefined} boss
   * @param {import('../game/sim.js').Sim} sim
   */
  bossDetail(id, boss, sim) {
    const p = PATTERNS[id];
    const total = p.phases.length + 1;
    const phase = Math.min(total, boss?.phase ?? 1);
    const key = `${phase}/${total}`;
    if (key !== this.lastPhase) {
      this.lastPhase = key;
      this.bossPhase.setAttribute('aria-label', `Phase ${phase} sur ${total}`);
      this.bossPhase.replaceChildren(
        ...Array.from({ length: total }, (_, i) => {
          const el = document.createElement('span');
          el.className = i < phase - 1 ? 'pip done' : i === phase - 1 ? 'pip on' : 'pip';
          return el;
        }),
      );
    }
    const consult = boss?.state === 'consult';
    // The window has closed: « c'est le moment » would now be bad advice.
    if (!consult && this.toastKind === 'consult') this.clearPrimo();
    this.bossbar.classList.toggle('open', consult);
    // A class, not `hidden`: the row keeps its height so the toast below never jumps.
    this.bossConsult.classList.toggle('off', !consult);
    this.bossConsult.setAttribute('aria-hidden', String(!consult));
    if (consult && boss) {
      // Shorter in « Sans filet »: the bar follows the real window.
      const length = consultLength(sim, boss);
      const left = Math.max(0, 1 - (boss.t ?? 0) / length);
      this.bossConsultBar.style.transform = `scaleX(${left.toFixed(3)})`;
    }
  }

  /**
   * @param {number} dt
   * @param {import('../game/sim.js').Sim} sim
   * @param {{rooms: string[], roomW: number, keyLabel: string, timer?: boolean}} level
   * @param {{poster?: string, board?: boolean, tip?: string}} near
   */
  update(dt, sim, level, near) {
    const max = sim.maxHearts;
    this.heroAt = { x: sim.hero.x + HERO.w / 2, y: sim.hero.y + HERO.h / 2 };
    if (sim.hero.hearts !== this.lastHearts) {
      this.lastHearts = sim.hero.hearts;
      const n = sim.hero.hearts;
      this.hearts.setAttribute('aria-label', `${n} ${n > 1 ? 'cœurs' : 'cœur'} sur ${max}`);
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
    // Convinced (or never started): nothing left to say about his PRIMO window.
    if (!fight) this.clearPrimo();
    this.fight = fight;
    this.bossbar.hidden = !fight;
    document.body.classList.toggle('boss', fight);
    if (fight && sim.boss) {
      const boss = sim.things.find((t) => t.kind === 'boss');
      this.bossName.textContent = `${CAST[sim.boss.id].name} · ${CAST[sim.boss.id].title}`;
      this.bossHp.style.width = `${(100 * (boss?.hp ?? 0)) / sim.boss.hp}%`;
      this.bossDetail(sim.boss.id, boss, sim);
    }
    // Without a tick() since the last update, the countdown happens here.
    if (!this.ticked) this.countdown(dt);
    this.ticked = false;
    // Contextual hint: read a whiteboard, or what a poster means in play.
    const hint = near.tip
      ? near.tip
      : near.board
        ? fillKeys('{up} Lire le tableau')
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

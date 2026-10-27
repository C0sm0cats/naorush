import { beforeEach, describe, expect, it } from 'vitest';

/**
 * A small stand-in for the DOM: just what the HUD and the results card touch.
 * @typedef {ReturnType<typeof fakeEl>} FakeEl
 */
function fakeEl(tag = 'div') {
  /** @type {Record<string, string>} */
  const attrs = {};
  const node = {
    tagName: tag.toUpperCase(),
    className: '',
    textContent: '',
    innerHTML: '',
    hidden: false,
    tabIndex: 0,
    /** @type {Record<string, string>} */
    dataset: {},
    /** @type {Record<string, Function[]>} */
    listeners: {},
    /** @param {string} type @param {Function} f */
    addEventListener(type, f) {
      (node.listeners[type] ??= []).push(f);
    },
    /** @param {string} type @param {any} e */
    dispatch(type, e) {
      for (const f of node.listeners[type] ?? []) f(e);
    },
    focused: false,
    focus() {
      node.focused = true;
    },
    /** @type {(() => void) | null} */
    onclick: null,
    click() {
      node.onclick?.();
    },
    offsetHeight: 40,
    offsetWidth: 200,
    /** @type {any[]} */
    children: [],
    /** @type {any} */
    parent: null,
    style: { transform: '', width: '', setProperty() {} },
    get classList() {
      const list = () => node.className.split(/\s+/).filter(Boolean);
      const add = (/** @type {string[]} */ ...c) => {
        node.className = [...new Set([...list(), ...c])].join(' ');
      };
      const remove = (/** @type {string[]} */ ...c) => {
        node.className = list()
          .filter((x) => !c.includes(x))
          .join(' ');
      };
      return {
        add,
        remove,
        contains: (/** @type {string} */ c) => list().includes(c),
        toggle(/** @type {string} */ c, /** @type {boolean} */ force) {
          const on = force ?? !list().includes(c);
          if (on) add(c);
          else remove(c);
          return on;
        },
      };
    },
    /** @param {string} k @param {unknown} v */
    setAttribute(k, v) {
      attrs[k] = String(v);
    },
    /** @param {string} k */
    getAttribute(k) {
      return attrs[k] ?? null;
    },
    /** @param {any[]} c */
    replaceChildren(...c) {
      node.children = c;
      for (const x of c) x.parent = node;
    },
    /** @param {any[]} c */
    append(...c) {
      node.children.push(...c);
      for (const x of c) x.parent = node;
    },
    /** @param {any[]} c */
    prepend(...c) {
      node.children.unshift(...c);
      for (const x of c) x.parent = node;
    },
    /** @param {any} n */
    before(n) {
      const sibs = node.parent.children;
      sibs.splice(sibs.indexOf(node), 0, n);
      n.parent = node.parent;
    },
    get previousElementSibling() {
      const sibs = node.parent?.children ?? [];
      return sibs[sibs.indexOf(node) - 1] ?? null;
    },
    /** Visible text, children included. @returns {string} */
    get text() {
      return node.children.length
        ? node.children.map((c) => c.text ?? c.textContent).join('')
        : node.textContent;
    },
  };
  return node;
}

/** @type {Record<string, FakeEl>} */
let els = {};
/** @type {Record<string, string>} */
let saved = {};
Object.assign(globalThis, {
  matchMedia: () => ({ matches: false }),
  innerHeight: 800,
  localStorage: {
    getItem: (/** @type {string} */ k) => saved[k] ?? null,
    setItem: (/** @type {string} */ k, /** @type {string} */ v) => (saved[k] = v),
  },
  document: {
    body: fakeEl('body'),
    getElementById: (/** @type {string} */ id) => (els[id] ??= fakeEl()),
    createElement: (/** @type {string} */ tag) => fakeEl(tag),
    createTextNode: (/** @type {string} */ text) => ({ textContent: text }),
  },
});

const { Hud, agree, keyLine } = await import('../src/app/hud.js');
const { autoRoll, readingOrder, renderChapters, renderCredits, renderTrophies, trapTab } =
  await import('../src/app/menus.js');
const { buildResults, gapText, readMedal, renderResults, secretsFound } =
  await import('../src/app/results.js');

beforeEach(() => {
  els = {};
  saved = {};
  Object.assign(globalThis, { innerHeight: 800 });
});

/** A sim with just what the HUD reads. @param {Record<string, unknown>} [o] */
const sim = (o = {}) =>
  /** @type {import('../src/game/sim.js').Sim} */ (
    /** @type {unknown} */ ({
      maxHearts: 3,
      hero: { hearts: 3, x: 10, y: 1 },
      tickets: 0,
      ammo: 3,
      hasKey: false,
      things: [],
      time: 0,
      boss: null,
      bossActive: false,
      bossDone: false,
      ...o,
    })
  );
const LEVEL = { rooms: ['Hall'], roomW: 20, keyLabel: 'Badge' };
/** @param {string} type @param {number} [x] @param {number} [y] @param {string} [cause] */
const ev = (type, x = 10, y = 1, cause) => ({ type, x, y, cause });
/** @param {InstanceType<typeof Hud>} hud */
const showing = (hud) => hud.toastEl.classList.contains('show');
/** A boss fight in progress, the boss in a given state. @param {string} state */
const fightSim = (state) =>
  sim({
    boss: { id: 'techServicesDirector', hp: 6, arena: [80, 99] },
    bossActive: true,
    things: [{ kind: 'boss', alive: true, x: 90, y: 1, hp: 6, phase: 1, state, t: 0 }],
  });

describe('hud toasts', () => {
  it('count down with tick() on any screen, without update()', () => {
    const hud = new Hud();
    hud.trophy('Fouineur');
    expect(showing(hud)).toBe(true);
    expect(hud.toastEl.classList.contains('trophy')).toBe(true);
    for (let i = 0; i < 60; i++) hud.tick(0.05);
    expect(showing(hud)).toBe(false);
    expect(hud.toastEl.classList.contains('trophy')).toBe(false);
  });

  it('count once per frame when both tick() and update() run', () => {
    const hud = new Hud();
    hud.toast('Court');
    hud.tick(1.5);
    hud.update(1.5, sim(), LEVEL, {});
    expect(showing(hud)).toBe(true);
    hud.tick(1.5);
    expect(showing(hud)).toBe(false);
  });

  it('still count down in update() alone', () => {
    const hud = new Hud();
    hud.toast('Court');
    hud.update(3, sim(), LEVEL, {});
    expect(showing(hud)).toBe(false);
  });

  it('are one short line, gone within 2.5 s, on short screens', () => {
    Object.assign(globalThis, { innerHeight: 360 });
    const hud = new Hud();
    hud.event(ev('invite'));
    expect(hud.toastEl.textContent).toBe('Invitation visio : saute-la, ou un CR.');
    expect(hud.toastTime).toBeLessThanOrEqual(2.5);
    hud.event(ev('meeting'));
    expect(hud.toastEl.textContent.length).toBeLessThan(45);
  });
});

describe('hearts', () => {
  it('a lost heart is said aloud, not the full stock at the start', () => {
    const hud = new Hud();
    hud.update(0, sim({ maxHearts: 4, hero: { hearts: 4, x: 10, y: 1 } }), LEVEL, {});
    expect(hud.heartsLive.textContent).toBe('');
    expect(hud.heartsLive.getAttribute('aria-live')).toBe('polite');
    hud.update(0, sim({ maxHearts: 4, hero: { hearts: 3, x: 10, y: 1 } }), LEVEL, {});
    expect(hud.heartsLive.textContent).toBe('3 cœurs sur 4');
    hud.update(0, sim({ maxHearts: 4, hero: { hearts: 1, x: 10, y: 1 } }), LEVEL, {});
    expect(hud.heartsLive.textContent).toBe('1 cœur sur 4');
    // Outside the HUD (hidden off play): on the page itself.
    expect(/** @type {any} */ (hud.heartsLive).parent).toBe(document.body);
  });
});

describe('trophy toast', () => {
  it('asks the screen for room under it, and gives it back when it goes', () => {
    const hud = new Hud();
    hud.trophy('Fouineur');
    expect(document.body.classList.contains('toast-trophy')).toBe(true);
    hud.toast('Autre chose');
    expect(document.body.classList.contains('toast-trophy')).toBe(false);
    hud.trophy('Fouineur');
    for (let i = 0; i < 60; i++) hud.tick(0.05);
    expect(document.body.classList.contains('toast-trophy')).toBe(false);
  });
});

describe('badge messages', () => {
  /** A hud that already explained Chronotime. */
  const badged = () => {
    const hud = new Hud();
    hud.setStage({ id: 'parking', keyLabel: 'Badge', bottle: false });
    hud.seen.add('checkpoint');
    return hud;
  };

  it('the first badge explains Chronotime, the next ones get a short line', () => {
    const hud = new Hud();
    hud.setStage({ id: 'parking', keyLabel: 'Badge', bottle: false });
    hud.event(ev('checkpoint', 10));
    expect(hud.toastEl.textContent).toContain('Chronotime');
    hud.clearToast();
    hud.tick(20);
    hud.event(ev('checkpoint', 15));
    expect(showing(hud)).toBe(true);
    expect(hud.toastTime).toBeLessThanOrEqual(2);
  });

  it('never repeat for a badge already announced, even after a restart', () => {
    const hud = badged();
    hud.event(ev('checkpoint', 10));
    expect(showing(hud)).toBe(true);
    hud.clearToast();
    hud.setStage({ id: 'parking', keyLabel: 'Badge', bottle: false });
    hud.tick(30);
    hud.event(ev('checkpoint', 10));
    expect(showing(hud)).toBe(false);
    // Another stage starts afresh.
    hud.setStage({ id: 'lcp7', keyLabel: 'Bon de commande', bottle: false });
    hud.event(ev('checkpoint', 10));
    expect(showing(hud)).toBe(true);
  });

  it('stay quiet when badges come in quick succession', () => {
    const hud = badged();
    hud.event(ev('checkpoint', 10));
    hud.clearToast();
    hud.tick(4);
    hud.event(ev('checkpoint', 14));
    expect(showing(hud)).toBe(false);
    hud.tick(12);
    hud.event(ev('checkpoint', 30));
    expect(showing(hud)).toBe(true);
  });

  it('never cover a more useful message', () => {
    const hud = badged();
    hud.event(ev('meeting'));
    const text = hud.toastEl.textContent;
    hud.event(ev('checkpoint', 10));
    expect(hud.toastEl.textContent).toBe(text);
  });
});

describe('key item messages', () => {
  it('agree with the item', () => {
    expect(agree('Enveloppe signée', 'récupéré', 'récupérée')).toBe('récupérée');
    expect(agree('Enveloppe', 'récupéré', 'récupérée')).toBe('récupérée');
    expect(agree('Badge cafét’', 'récupéré', 'récupérée')).toBe('récupéré');
    expect(keyLine('Enveloppe signée')).toBe('Enveloppe signée récupérée ! Direction la sortie.');
    expect(keyLine('Bon de commande')).toBe('Bon de commande récupéré ! Direction la sortie.');
    expect(keyLine('CR validé', { bottle: true, short: true })).toBe(
      'CR validé récupéré ! Gare à la bonbonne…',
    );
  });

  it('use the stage’s item when picked up', () => {
    const hud = new Hud();
    hud.setStage({ id: 'ts', keyLabel: 'Enveloppe', bottle: false });
    hud.event(ev('key'));
    expect(hud.toastEl.textContent).toBe('Enveloppe récupérée ! Direction la sortie.');
  });
});

describe('blocked CRs', () => {
  it('say once why archive boxes stop the CR, and stay quiet otherwise', () => {
    const hud = new Hud();
    hud.event(ev('block'));
    expect(showing(hud)).toBe(false);
    hud.event(ev('block', 10, 1, 'crate'));
    expect(hud.toastEl.textContent).toContain('Kévin');
    hud.clearToast();
    hud.event(ev('block', 10, 1, 'crate'));
    expect(showing(hud)).toBe(false);
    hud.event(ev('block', 10, 1, 'vacuum'));
    expect(hud.toastEl.textContent).toContain('tremplin');
  });

  it('name the player’s own fire key, not a hard-coded X', () => {
    const hud = new Hud();
    hud.event(ev('bump'));
    expect(hud.toastEl.textContent).toMatch(/un CR \(\S+\)/);
    expect(hud.toastEl.textContent).not.toContain('{fire}');
  });
});

describe('menus', () => {
  /** @param {number} top @param {number} left @param {string} id */
  const box = (top, left, id, height = 40) => ({
    id,
    getBoundingClientRect: () => ({ top, left, height }),
  });

  it('move through elements in reading order, whatever the markup order', () => {
    const items = [
      box(300, 20, 'play'),
      box(100, 220, 'charline', 120),
      box(110, 20, 'kevin', 100),
      box(400, 220, 'options'),
      box(402, 20, 'chapters'),
    ];
    expect(readingOrder(items).map((b) => b.id)).toEqual([
      'kevin',
      'charline',
      'play',
      'chapters',
      'options',
    ]);
    // Every element exactly once.
    expect(new Set(readingOrder(items)).size).toBe(items.length);
  });

  it('keep a pinned « Fermer » at its place in the document, visited once', () => {
    // Scrolled list: the sticky button sits on screen in the middle of the rows.
    const items = [
      box(100, 20, 'row1'),
      box(200, 20, 'row2'),
      box(300, 20, 'row3'),
      box(150, 20, 'close'), // last in the markup, mid-screen once scrolled
    ];
    const order = readingOrder(items, (b) => b.id === 'close').map((b) => b.id);
    expect(order).toEqual(['row1', 'row2', 'row3', 'close']);
    // Pinned in the middle of the document: stays after what precedes it there.
    const mid = [box(100, 20, 'a'), box(900, 20, 'pin'), box(200, 20, 'b')];
    expect(readingOrder(mid, (b) => b.id === 'pin').map((b) => b.id)).toEqual(['a', 'pin', 'b']);
  });

  it('keep Tab inside an open modal screen', () => {
    const a = /** @type {any} */ ({ offsetParent: {}, tabIndex: 0, disabled: false, focus() {} });
    const b = /** @type {any} */ ({ offsetParent: {}, tabIndex: 0, disabled: false, focus() {} });
    const doc0 = /** @type {any} */ (document);
    for (const el of [a, b]) el.focus = () => (doc0.activeElement = el);
    const screen = /** @type {any} */ ({
      getAttribute: (/** @type {string} */ k) => (k === 'aria-modal' ? 'true' : null),
      querySelectorAll: () => [a, b],
      contains: (/** @type {any} */ el) => el === a || el === b,
    });
    const press = (/** @type {boolean} */ shiftKey) => {
      let prevented = false;
      const moved = trapTab(
        /** @type {any} */ ({ key: 'Tab', shiftKey, preventDefault: () => (prevented = true) }),
        screen,
      );
      return moved && prevented;
    };
    const doc = /** @type {any} */ (document);
    doc.activeElement = b;
    expect(press(false)).toBe(true);
    expect(doc.activeElement).toBe(a);
    expect(press(true)).toBe(true);
    expect(doc.activeElement).toBe(b);
    // In the middle, Tab goes its usual way.
    doc.activeElement = a;
    expect(press(false)).toBe(false);
    // Focus lost on the body comes back in.
    doc.activeElement = doc.body;
    expect(press(false)).toBe(true);
    expect(doc.activeElement).toBe(a);
    // Not a modal: left alone.
    expect(
      trapTab(
        /** @type {any} */ ({ key: 'Tab' }),
        /** @type {any} */ ({ getAttribute: () => null }),
      ),
    ).toBe(false);
    doc.activeElement = undefined;
  });

  it('let the arrows and the gamepad stop on trophy rows', () => {
    const list = /** @type {any} */ (document.createElement('ol'));
    renderTrophies(list, [{ name: 'Fouineur', text: 'Un secret', got: true }]);
    expect(list.children[0].dataset.nav).toBe('');
    expect(list.children[0].tabIndex).toBe(-1);
  });

  it('switch the chapter mode once per arrow press, not on auto-repeat', () => {
    const host = {
      modes: /** @type {any} */ (document.createElement('div')),
      list: /** @type {any} */ (document.createElement('ol')),
    };
    /** @type {string[]} */
    const heard = [];
    renderChapters(host, () => [], {
      sansFilet: true,
      play: () => {},
      onMode: (m) => heard.push(m),
    });
    const group = host.modes.children[0];
    const [normal, hard] = group.children;
    expect([normal.tabIndex, hard.tabIndex]).toEqual([0, -1]);
    const key = (/** @type {boolean} */ repeat) =>
      group.dispatch('keydown', { key: 'ArrowRight', repeat, preventDefault() {} });
    key(false);
    key(true);
    key(true);
    expect(heard).toEqual(['sansFilet']);
    expect(hard.focused).toBe(true);
    expect([normal.tabIndex, hard.tabIndex]).toEqual([-1, 0]);
  });

  it('render the credits and roll them up by themselves, then stop at the end', () => {
    const roll = /** @type {any} */ (document.createElement('div'));
    renderCredits(roll, [['NAO Rush', 't'], ['Avec', 'h'], ['Kévin'], ['Merci', 's']]);
    expect(roll.children.map((/** @type {any} */ c) => c.tagName)).toEqual(['H2', 'H3', 'P', 'P']);
    expect(roll.children[3].className).toBe('creditLine');
    Object.assign(roll, {
      scrollTop: 0,
      scrollHeight: 400,
      clientHeight: 300,
      isConnected: true,
      closest: () => null,
      removeEventListener() {},
    });
    /** @type {Array<(now: number) => void>} */
    let queue = [];
    const raf = (/** @type {(now: number) => void} */ f) => queue.push(f);
    autoRoll(roll, { raf, delay: 1, speed: 50 });
    let now = 0;
    for (let i = 0; i < 200 && queue.length; i++) {
      const next = queue;
      queue = [];
      for (const f of next) f((now += 50));
    }
    expect(roll.scrollTop).toBe(100);
    expect(queue.length).toBe(0);
  });

  it('hand the credits over to the player as soon as they scroll', () => {
    const roll = /** @type {any} */ (document.createElement('div'));
    Object.assign(roll, {
      scrollTop: 0,
      scrollHeight: 2000,
      clientHeight: 300,
      isConnected: true,
      closest: () => null,
      removeEventListener() {},
    });
    /** @type {Array<(now: number) => void>} */
    let queue = [];
    const raf = (/** @type {(now: number) => void} */ f) => queue.push(f);
    autoRoll(roll, { raf, delay: 0, speed: 50 });
    const run = (/** @type {number} */ n) => {
      for (let i = 0; i < n && queue.length; i++) {
        const next = queue;
        queue = [];
        for (const f of next) f(i * 50);
      }
    };
    run(5);
    roll.dispatch('wheel', {});
    const at = roll.scrollTop;
    run(5);
    expect(roll.scrollTop).toBe(at);
    // Reduced motion: nothing rolls at all.
    roll.scrollTop = 0;
    queue = [];
    autoRoll(roll, { raf, reduced: true });
    expect(queue.length).toBe(0);
  });
});

describe('PRIMO message', () => {
  it('goes when the boss is hit, convinced, or a dialogue starts', () => {
    const hud = new Hud();
    hud.event(ev('consult'));
    expect(hud.toastEl.textContent).toContain('PRIMO');
    hud.event(ev('bossDone'));
    expect(showing(hud)).toBe(false);

    hud.event(ev('block', 90, 1, 'boss'));
    expect(showing(hud)).toBe(true);
    hud.dialogue();
    expect(showing(hud)).toBe(false);

    hud.event(ev('consult'));
    hud.event(ev('bossHit'));
    expect(hud.toastEl.textContent).not.toContain('PRIMO');
  });

  it('goes when his consult window closes or the fight is over', () => {
    const hud = new Hud();
    hud.update(0, fightSim('consult'), LEVEL, {});
    hud.event(ev('consult'));
    hud.update(0.1, fightSim('consult'), LEVEL, {});
    expect(showing(hud)).toBe(true);
    hud.update(0.1, fightSim('volley'), LEVEL, {});
    expect(showing(hud)).toBe(false);

    hud.event(ev('consult'));
    hud.update(0.1, sim({ ...fightSim('consult'), bossDone: true }), LEVEL, {});
    expect(showing(hud)).toBe(false);
  });

  it('a dialogue leaves a trophy toast alone', () => {
    const hud = new Hud();
    hud.trophy('Fouineur');
    hud.dialogue();
    expect(showing(hud)).toBe(true);
  });
});

describe('first-time tips', () => {
  it('wait during a boss fight unless they explain the boss', () => {
    const hud = new Hud();
    hud.event(ev('bossStart'));
    hud.event(ev('drawerOut'));
    expect(showing(hud)).toBe(false);
    expect(hud.seen.has('drawerOut')).toBe(false);
    hud.event(ev('collapse'));
    expect(showing(hud)).toBe(false);
    hud.event(ev('rackDrop'));
    expect(hud.toastEl.textContent).toContain('baie serveur');
    hud.event(ev('bossDone'));
    hud.event(ev('drawerOut'));
    expect(hud.toastEl.textContent).toContain('tiroir');
  });

  it('only explain what is within 10 tiles', () => {
    const hud = new Hud();
    hud.update(0, sim(), LEVEL, {});
    hud.event(ev('sprayOn', 30, 1));
    expect(showing(hud)).toBe(false);
    expect(hud.seen.has('sprayOn')).toBe(false);
    hud.event(ev('sprayOn', 16, 3));
    expect(hud.toastEl.textContent).toContain('sprinkler');
    expect(hud.seen.has('sprayOn')).toBe(true);
  });

  it('only explain what is on screen', () => {
    const hud = new Hud();
    hud.update(0, sim(), LEVEL, {});
    // A camera showing x 6..14 and y -3..5 around the hero.
    const view = new Float32Array(16);
    view[0] = 0.25;
    view[5] = 0.25;
    view[12] = -2.5;
    view[13] = -0.25;
    view[15] = 1;
    hud.tick(0, view);
    hud.event(ev('chairRoll', 17, 1));
    expect(showing(hud)).toBe(false);
    hud.event(ev('chairRoll', 13, 1));
    expect(showing(hud)).toBe(true);
  });
});

describe('results card', () => {
  it('shows the gap to the record either way', () => {
    const base = { deaths: 0, tickets: 3, secrets: 1, secretTotal: 2 };
    const slower = buildResults({ ...base, time: 33.4, best: 30 });
    expect(slower.record).toBe(false);
    expect(slower.rows.find((r) => r[0] === 'Record')?.[1]).toBe('0 min 30 s (+3,4 s)');
    const faster = buildResults({ ...base, time: 28.8, best: 30 });
    expect(faster.record).toBe(true);
    expect(faster.rows.find((r) => r[0] === 'Record')?.[1]).toBe('Nouveau record ! (−1,2 s)');
    expect(buildResults({ ...base, time: 28 }).rows[3][1]).toBe('Nouveau record !');
    expect(gapText(-0.04)).toBe('−0,0 s');
  });

  it('lists the secrets of each hero', () => {
    const r = buildResults({
      time: 20,
      deaths: 1,
      tickets: 0,
      secrets: 2,
      secretTotal: 2,
      perHero: { kevin: 2, charline: 1 },
    });
    expect(r.rows.at(-1)).toEqual(['Secrets par héros', 'Kévin 2/2 · Charline 1/2', false]);
    expect(r.allSecrets).toBe(true);
    expect(r.flawless).toBe(false);
  });

  it('reads the medal API in its likely shapes', () => {
    expect(readMedal('gold')).toEqual({ tier: 'gold', star: false });
    expect(readMedal({ medal: 'silver', star: true })).toEqual({ tier: 'silver', star: true });
    expect(readMedal({ tier: null, star: true })).toEqual({ tier: null, star: true });
    expect(readMedal(null)).toBeNull();
    expect(readMedal({ tier: 'none' })).toBeNull();
  });

  it('saves the record and the secrets, and shows the medal above the stats', () => {
    const card = fakeEl('div');
    const stats = fakeEl('dl');
    card.append(stats);
    const run = {
      time: 41,
      deaths: 0,
      tickets: 5,
      secrets: 1,
      secretTotal: 2,
      things: [
        { kind: 'secret', alive: false, x: 12.5 },
        { kind: 'secret', alive: true, x: 70.5 },
      ],
    };
    const r = renderResults(/** @type {any} */ (stats), {
      sim: run,
      levelId: 'copil',
      hero: 'charline',
      medal: { medal: 'silver', star: true },
      targets: { gold: 32, silver: 50 },
    });
    expect(r.record).toBe(true);
    expect(JSON.parse(saved['naorush.best'])).toEqual({ 'copil:charline': 41 });
    expect(secretsFound('copil', 'charline')).toBe(1);
    expect(secretsFound('copil', 'kevin')).toBe(0);
    expect(stats.children).toHaveLength(12);
    const medal = card.children[0];
    expect(medal.className).toBe('medal silver star');
    // The gap to the next medal may follow (results.js, Difficulté).
    expect(medal.text).toMatch(/^Médaille : Argent★ Sans retour au badgeOr sous 0 min 32 s/);

    // Same secret again: no double count; no medal (daily): the line hides.
    renderResults(/** @type {any} */ (stats), { sim: run, levelId: 'copil', hero: 'charline' });
    expect(secretsFound('copil', 'charline')).toBe(1);
    expect(card.children[0]).toBe(medal);
    expect(medal.hidden).toBe(true);
  });
});

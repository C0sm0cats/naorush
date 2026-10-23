/**
 * Vertical slice: three rooms of the LCP7 open space.
 *
 * Rooms are 20 × 12 tiles, laid side by side; rows are written top to bottom.
 *   '#' structure     '-' loose floor tile (collapses)    '^' live cables
 *   'S' start          'C' Chronotime badge (checkpoint)   '$' Swile ticket
 *   'p' badge reader (opens the next door)                'D' door
 *   'F' ceiling panel that falls     'R' water-cooler bottle that rolls
 *   'n' colleague in a meeting        'K' signed purchase order
 *   'a' ream of paper (+3 CR)   'E' exit
 *
 * @typedef {Object} Decor
 * @property {'whiteboard'|'poster'|'desk'|'plant'|'cooler'|'printer'|'coffee'} type
 * @property {string} [id]
 * @property {number} x Tile column (left edge).
 * @property {number} y Tile row from the bottom (floor height).
 * @property {boolean} [front] Hung on the front face of a block instead of the back wall.
 */

export const ROOM_W = 20;
export const ROOM_H = 12;

export const SLICE = {
  name: 'Open space LCP7',
  rooms: ['Bureau du Directeur de Projets', 'Couloir des imprimantes', 'Espace Business'],
  subtitle: 'La Chapelle-sur-Erdre · lundi, 8 h 47',
  map: [
    '############################################################',
    '#                                 F F                      #',
    '#                        MMMMMM                      K  R  #',
    '#                        MMMMMM                      ##### #',
    '#                        MMMMMM                          # #',
    '#             $$$ a      MMMMMM                          # #',
    '#             #####      MMMMMM                   ###    # #',
    '#                                $ $ $                   D #',
    '# S      B           C a    n             $ $   p        DE ',
    '###########  ###################------######################',
    '###########^^###################^^^^^^######################',
    '############################################################',
  ],
  /** @type {Decor[]} */
  decor: [
    { type: 'poster', id: 'inetum-lcp7', x: 1.2, y: 6.6 },
    { type: 'whiteboard', id: 'projectDirector', x: 1, y: 3 },
    { type: 'desk', id: 'projectDirector', x: 4.5, y: 3 },
    { type: 'poster', id: 'learning-academy', x: 11, y: 3.9 },
    { type: 'plant', x: 13.2, y: 3 },
    { type: 'poster', id: 'chronotime', x: 20.2, y: 3.9 },
    { type: 'poster', id: 'ordre-mission', x: 22.6, y: 3.9 },
    { type: 'poster', id: 'mypeopledoc', x: 27.2, y: 5.4, front: true },
    { type: 'poster', id: 'global-service-center', x: 33.2, y: 5.2 },
    { type: 'poster', id: 'sap-concur', x: 38, y: 3.9 },
    { type: 'whiteboard', id: 'businessManager', x: 40.2, y: 3 },
    { type: 'desk', id: 'businessManager', x: 43.7, y: 3 },
    { type: 'poster', id: 'swile', x: 49.6, y: 6.5 },
    { type: 'poster', id: 'bon-commande', x: 54.3, y: 4.2 },
    { type: 'cooler', x: 58.2, y: 9 },
    { type: 'plant', x: 39.2, y: 3 },
  ],
};

/** Morning light through the façade of the LCP7 building. */
export const LIGHTING = {
  sunDir: normalize([-0.35, -0.55, 0.75]),
  sunColor: [1.7, 1.42, 1.05],
  sky: [0.55, 0.62, 0.78],
  ground: [0.26, 0.24, 0.26],
  fog: [0.72, 0.8, 0.9],
  fogRange: /** @type {[number, number]} */ ([45, 110]),
  backdrop: {
    top: [0.32, 0.55, 0.86],
    mid: [0.68, 0.82, 0.95],
    bottom: [0.98, 0.86, 0.7],
    sun: /** @type {[number, number]} */ ([0.78, 0.72]),
    glow: [1, 0.85, 0.55],
  },
};

/** @param {number[]} v */
function normalize(v) {
  const l = Math.hypot(...v);
  return v.map((x) => x / l);
}

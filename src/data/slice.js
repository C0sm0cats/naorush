/**
 * Vertical slice: three rooms of the LCP7 open space.
 *
 * Rooms are 20 × 12 tiles, laid side by side; rows are written top to bottom.
 *   '#' structure     '-' loose floor tile (collapses)    '^' live cables
 *   'S' start          'C' Chronotime badge (checkpoint)   '$' Swile ticket
 *   'p' badge reader (opens the next door)                'D' door
 *   'F' ceiling panel that falls     'R' water-cooler bottle that rolls
 *   'n' colleague in a meeting        'K' signed purchase order
 *   'E' exit
 *
 * @typedef {Object} Decor
 * @property {'whiteboard'|'poster'|'desk'|'plaque'|'deskSet'|'plant'|'cooler'|'printer'|'coffee'|'sofa'} type
 * @property {string} [id]
 * @property {number} x Tile column (left edge).
 * @property {number} y Tile row from the bottom (floor height).
 * @property {number} [w]
 */

export const ROOM_W = 20;
export const ROOM_H = 12;

export const SLICE = {
  name: 'Open space LCP7',
  subtitle: 'La Chapelle-sur-Erdre · lundi, 8 h 47',
  map: [
    '############################################################',
    '#                                  F F                     #',
    '#                                                 $ $ K R  #',
    '#                                             ###########  #',
    '#                                               ##         #',
    '#             $$$                               ##         #',
    '#         $  #####   ###         ######    #### ##         #',
    '#                         $ $ $                 ##       D #',
    '#  S   C              C             n     p  $  ##       DE ',
    '#########   #############-------############################',
    '#########^^^#############^^^^^^^############################',
    '############################################################',
  ],
  /** @type {Decor[]} */
  decor: [
    { type: 'whiteboard', id: 'projectDirector', x: 1.3, y: 3 },
    { type: 'deskSet', id: 'projectDirector', x: 4.6, y: 3 },
    { type: 'poster', id: 'inetum-lcp7', x: 13, y: 7.4 },
    { type: 'poster', id: 'learning-academy', x: 9.4, y: 5.2 },
    { type: 'coffee', x: 14.2, y: 3 },
    { type: 'plant', x: 18, y: 3 },
    { type: 'poster', id: 'chronotime', x: 20.5, y: 3 },
    { type: 'printer', x: 33, y: 7 },
    { type: 'poster', id: 'global-service-center', x: 28, y: 6 },
    { type: 'poster', id: 'sap-concur', x: 35, y: 3 },
    { type: 'whiteboard', id: 'businessManager', x: 40.3, y: 3 },
    { type: 'deskSet', id: 'businessManager', x: 51.5, y: 3 },
    { type: 'poster', id: 'swile', x: 47, y: 9.3 },
    { type: 'poster', id: 'bon-commande', x: 55.5, y: 5 },
    { type: 'cooler', x: 57.6, y: 9 },
    { type: 'plant', x: 39, y: 3 },
  ],
};

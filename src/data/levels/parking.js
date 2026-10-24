/**
 * Stage 0: parking B2, the tutorial. Car roofs to hop on, a ledge to grab, a
 * guard in a call, and a visitor badge to find. 'Q' are parked cars (solid).
 * @type {import('./index.js').Level}
 */
export const PARKING = {
  id: 'parking',
  theme: 'parking',
  music: 'parking',
  name: 'Parking B2',
  subtitle: 'La Chapelle-sur-Erdre · lundi, 8 h 40',
  keyModel: 'badge',
  keyLabel: 'Badge',
  rooms: ['Entrée B2', 'Allée des archives', 'Places visiteurs', 'Ascenseurs'],
  map: [
    '################################################################################',
    '################################################################################',
    '#                                                 $*$$                         #',
    '#                                                 ####                         #',
    '#                                                                              #',
    '#                a    $ $ $                                       $  K $       #',
    '#              #############                                    #########      #',
    '#        $$    ######    *AA              $                    ##########      #',
    '# S  C  QQQQ   ######$$$h$AA     n       QQQQ    QQQQ   C v   ###########   E   ',
    '#####################################  #######   ###############################',
    '#####################################^^#######^^^###############################',
    '################################################################################',
  ],
  tips: [
    {
      x0: 5.5,
      x1: 7.5,
      keys: 'Espace pour sauter sur le toit de la voiture.',
      touch: 'SAUT pour monter sur le toit de la voiture.',
    },
    {
      x0: 12,
      x1: 14.5,
      keys: 'Saute contre le mur : tu t’accroches au rebord. ↑ pour grimper, ↓ pour lâcher.',
      touch: 'Saute contre le mur : tu t’accroches au rebord. ▲ pour grimper, ▼ pour lâcher.',
    },
    {
      x0: 28.5,
      x1: 31.5,
      keys: 'X lance un compte rendu : le collègue en call partira en réunion.',
      touch: 'CR lance un compte rendu : le collègue en call partira en réunion.',
    },
    {
      x0: 34.5,
      x1: 36.5,
      keys: 'Câbles à nu : saute par-dessus la fosse.',
      touch: 'Câbles à nu : saute par-dessus la fosse.',
    },
    {
      x0: 54,
      x1: 57,
      keys: 'Le robot aspirateur fait tremplin : saute dessus !',
      touch: 'Le robot aspirateur fait tremplin : saute dessus !',
    },
  ],
  decor: [
    { type: 'poster', id: 'covoiturage', x: 3.2, y: 4 },
    { type: 'pillarSign', x: 13, y: 3 },
    { type: 'poster', id: 'your-digital-hub', x: 30, y: 4 },
    { type: 'pillarSign', x: 35.5, y: 3 },
    { type: 'barrier', x: 39.6, y: 3, z: -0.9 },
    { type: 'poster', id: 'note-de-frais', x: 54.4, y: 4 },
    { type: 'pillarSign', x: 60, y: 3 },
    { type: 'poster', id: 'my-way', x: 73.6, y: 6.6 },
  ],
  lighting: {
    sunDir: [-0.2, -0.8, 0.55],
    sunColor: [0.7, 0.76, 0.92],
    sky: [0.38, 0.42, 0.56],
    ground: [0.14, 0.15, 0.2],
    fog: [0.08, 0.1, 0.16],
    fogRange: [30, 90],
    backdrop: {
      top: [0.03, 0.04, 0.08],
      mid: [0.06, 0.08, 0.14],
      bottom: [0.1, 0.12, 0.2],
      sun: [0.5, 0.9],
      glow: [0.2, 0.3, 0.5],
    },
  },
  intro: [
    {
      who: 'partner',
      text: 'Te voilà ! Pas de temps à perdre : l’enveloppe doit être retrouvée et signée avant jeudi.',
    },
    {
      who: 'hero',
      text: 'Alors on monte la chercher. Il me faut juste un badge visiteur : j’ai oublié le mien.',
    },
    {
      who: 'partner',
      text: 'Il est vers les ascenseurs. Saute sur les toits des voitures, accroche-toi aux rebords, et badge sur Chronotime !',
    },
  ],
  outro: [
    {
      who: 'partner',
      text: 'Badge récupéré ! Direction l’open space : le bon de commande signé doit y être.',
    },
  ],
};

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
    sunColor: [0.55, 0.62, 0.78],
    sky: [0.3, 0.36, 0.48],
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
      text: 'Lundi, 8 h 40. L’enveloppe des NAO a disparu, et les négociations commencent jeudi !',
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

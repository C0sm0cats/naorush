/**
 * Stage 0: parking B2, the tutorial. Car roofs to hop on, a ledge to grab, a
 * guard in a call, and a visitor badge to find. 'Q' are parked cars (solid).
 * @type {import('./index.js').Level}
 */
export const PARKING = {
  id: 'parking',
  theme: 'parking',
  mood: 'dawn',
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
    '# S  C  QQQQ   ######$$$h$AA C   n       QQQQ    QQQQ   C v   ###########   E   ',
    '#####################################  #######   ########################---####',
    '#####################################^^#######^^^###############################',
    '################################################################################',
  ],
  tips: [
    {
      x0: 5.5,
      x1: 7.5,
      keys: 'Espace : saute sur le toit de la voiture.',
      touch: 'SAUT : monte sur le toit de la voiture.',
    },
    {
      x0: 12,
      x1: 14.5,
      keys: 'Saute contre le mur pour t’accrocher. ↑ grimpe, ↓ lâche.',
      touch: 'Saute contre le mur pour t’accrocher. ▲ grimpe, ▼ lâche.',
    },
    {
      x0: 28.5,
      x1: 31.5,
      keys: 'X : un compte rendu, et le collègue file en réunion.',
      touch: 'CR : un compte rendu, et le collègue file en réunion.',
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
    {
      x0: 71.5,
      x1: 75.5,
      keys: 'Dalle fragile : elle tremble, puis cède. Ici, la chute est courte !',
      touch: 'Dalle fragile : elle tremble, puis cède. Ici, la chute est courte !',
    },
  ],
  decor: [
    { type: 'poster', id: 'covoiturage', x: 3.2, y: 4 },
    { type: 'pillarSign', x: 13, y: 3 },
    { type: 'poster', id: 'your-digital-hub', x: 30, y: 4 },
    { type: 'pillarSign', x: 35.5, y: 3 },
    { type: 'barrier', x: 39.6, y: 3, z: -0.9 },
    { type: 'poster', id: 'note-de-frais', x: 54.4, y: 4 },
    { type: 'poster', id: 'inetum-et-moi', x: 45, y: 4 },
    { type: 'pillarSign', x: 60, y: 3 },
    { type: 'poster', id: 'my-way', x: 73.6, y: 6.6 },
  ],
  lighting: {
    sunDir: [0.1, -0.9, 0.4],
    sunColor: [0.45, 0.66, 0.85],
    sky: [0.28, 0.42, 0.52],
    ground: [0.1, 0.12, 0.18],
    fog: [0.04, 0.07, 0.11],
    fogRange: [26, 80],
    backdrop: {
      top: [0.02, 0.03, 0.06],
      mid: [0.04, 0.07, 0.11],
      bottom: [0.07, 0.11, 0.16],
      sun: [0.5, 1.2],
      glow: [0.1, 0.2, 0.3],
    },
  },
  intro: [
    {
      who: 'partner',
      text: 'Te voilà ! L’enveloppe des NAO a disparu, et elle doit être signée avant jeudi.',
    },
    {
      who: 'hero',
      text: 'Alors on monte la chercher. Seul souci : mon badge est resté sur mon bureau.',
    },
    {
      who: 'partner',
      text: 'Un badge visiteur t’attend près des ascenseurs. Toits des voitures, rebords… et pense à badger sur Chronotime !',
    },
  ],
  outro: [
    {
      who: 'partner',
      text: 'Badge récupéré ! Direction l’open space : le bon de commande nous dira où est partie l’enveloppe.',
    },
  ],
};

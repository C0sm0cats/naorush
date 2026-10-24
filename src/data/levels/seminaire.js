/**
 * Bonus stage, unlocked once the envelope is signed: the annual company
 * seminar. Tiered conference tables, a projector firing KPI slides over the
 * stage, backstage archive boxes and a cocktail bar where the seminar badge waits.
 * @type {import('./index.js').Level}
 */
export const SEMINAIRE = {
  id: 'seminaire',
  theme: 'office',
  music: 'copil',
  name: 'Bonus : Séminaire annuel',
  subtitle: 'Centre des congrès · jeudi, 18 h 00',
  keyModel: 'badge',
  keyLabel: 'Badge séminaire',
  rooms: [
    'Accueil des participants',
    'Plénière',
    'Sous le vidéoprojecteur',
    'Coulisses',
    'Cocktail',
  ],
  map: [
    '####################################################################################################',
    '#                                               w     w                    w                 w     #',
    '#                                                                                                  #',
    '#                                                 O               *$                               #',
    '#              $$$$                                               ##                   $$$ K       #',
    '#              ####             $h$                                                   #######      #',
    '#                          i$ YYYYYY                                     #####                     #',
    '#       $ $ $           $ YYYYYYYYYY           $   $i  $   $             A   #                     #',
    '# S  C  YYYYYv    a   YYYYYYYYYYYYYY     z C YYYYYYYYYYYYYJ   k c     C  A*$$#d a  P            E  #',
    '#####################################---###################LL#######################################',
    '#####################################^^^###################^^#######################################',
    '####################################################################################################',
  ],
  decor: [
    { type: 'poster', id: 'power-up', x: 3, y: 4.4 },
    { type: 'plant', x: 6.8, y: 3 },
    { type: 'poster', id: 'lets-connect', x: 10, y: 5.6 },
    { type: 'poster', id: 'success-factors', x: 19.6, y: 4 },
    { type: 'chair', x: 23.5, y: 4, z: -1.6 },
    { type: 'chair', x: 28.5, y: 5, z: -1.6 },
    { type: 'chair', x: 33.5, y: 6, z: -1.6 },
    { type: 'poster', id: 'gen-ai-hub', x: 37, y: 7 },
    { type: 'speaker', x: 42.5, y: 3, z: -1.8 },
    { type: 'truss', x: 51.5, y: 8.6, z: -2 },
    { type: 'spotlight', x: 47.5, y: 8.2, z: -1.6 },
    { type: 'spotlight', x: 55.5, y: 8.2, z: -1.6 },
    { type: 'projector', x: 51.5, y: 5.6, z: -2.2 },
    { type: 'monitor', x: 49, y: 4, z: -1 },
    { type: 'cup', x: 53.6, y: 4, z: -0.9 },
    { type: 'speaker', x: 60.5, y: 3, z: -1.8 },
    { type: 'poster', id: 'cooptation', x: 63, y: 4.4 },
    { type: 'poster', id: 'spark', x: 69.4, y: 7.9 },
    { type: 'plantSmall', x: 81.4, y: 3, z: -2 },
    { type: 'poster', id: 'charity-day', x: 83.6, y: 4.4 },
    { type: 'bistro', x: 89.5, y: 3, z: -1.4 },
    { type: 'cup', x: 89.5, y: 4.1, z: -1.4 },
    { type: 'coffee', x: 93.5, y: 3, z: -2 },
    { type: 'plant', x: 97.6, y: 3 },
  ],
  lighting: {
    sunDir: [0.55, -0.4, 0.75],
    sunColor: [1.9, 1.25, 0.85],
    sky: [0.55, 0.52, 0.7],
    ground: [0.28, 0.23, 0.23],
    fog: [0.86, 0.74, 0.7],
    fogRange: [45, 110],
    backdrop: {
      top: [0.26, 0.36, 0.74],
      mid: [0.88, 0.66, 0.68],
      bottom: [1, 0.8, 0.56],
      sun: [0.82, 0.5],
      glow: [1, 0.76, 0.5],
    },
  },
  intro: [
    {
      who: 'partner',
      text: 'Séminaire annuel ! L’enveloppe NAO est signée, ce soir on fête ça avec toute la boîte.',
    },
    {
      who: 'hero',
      text: 'Mon badge séminaire est resté au bar du cocktail. Juste derrière la plénière… et la scène.',
    },
    {
      who: 'partner',
      text: 'Attention au vidéoprojecteur : la keynote envoie ses KPI à la volée. Baisse la tête !',
    },
  ],
  outro: [
    {
      who: 'partner',
      text: 'Badge séminaire retrouvé ! Pile à temps pour la photo de groupe.',
    },
    {
      who: 'hero',
      text: 'Et pour le buffet. Les petits fours, eux, n’attendront pas le prochain COPIL.',
    },
  ],
};

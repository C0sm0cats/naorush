/**
 * Bonus stage, unlocked once the envelope is signed: the annual company
 * seminar. Tiered conference tables, a projector firing KPI slides over the
 * stage, backstage archive boxes and a cocktail bar where the seminar badge waits.
 * @type {import('./index.js').Level}
 */
export const SEMINAIRE = {
  id: 'seminaire',
  theme: 'office',
  mood: 'event',
  music: 'copil',
  name: 'Bonus : Séminaire annuel',
  subtitle: 'Centre des congrès · vendredi, 18 h 00',
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
    '#                                               w O   w                    w                 w     #',
    '#                                                                                                  #',
    '#                                                                 *$                               #',
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
    sunDir: [-0.25, -0.8, 0.5],
    sunColor: [0.45, 0.42, 0.7],
    sky: [0.26, 0.22, 0.38],
    ground: [0.3, 0.18, 0.14],
    fog: [0.06, 0.05, 0.14],
    fogRange: [28, 110],
    backdrop: {
      top: [0.02, 0.02, 0.08],
      mid: [0.08, 0.06, 0.2],
      bottom: [0.3, 0.14, 0.26],
      sun: [0.16, 0.82],
      glow: [0.45, 0.5, 0.7],
    },
  },
  intro: [
    {
      who: 'partner',
      text: 'Séminaire annuel ! L’enveloppe est signée, les NAO sont lancées : ce soir, on fête ça tous ensemble.',
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
    {
      who: 'partner',
      text: 'Julien et Rodolphe nous gardent une place au premier rang. Belle semaine, binôme.',
    },
  ],
};

/**
 * Stage 1: three rooms of the LCP7 open space.
 * @type {import('./index.js').Level}
 */
export const LCP7 = {
  id: 'lcp7',
  theme: 'office',
  music: 'office',
  name: 'Open space LCP7',
  subtitle: 'La Chapelle-sur-Erdre · lundi, 8 h 47',
  rooms: ['Bureau du Directeur de Projets', 'Couloir des imprimantes', 'Espace Business'],
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
  decor: [
    { type: 'poster', id: 'inetum-lcp7', x: 1.2, y: 6.6 },
    { type: 'whiteboard', id: 'projectDirector', x: 1, y: 3 },
    { type: 'desk', id: 'projectDirector', x: 4.5, y: 3 },
    { type: 'poster', id: 'learning-academy', x: 11, y: 3.9 },
    { type: 'plant', x: 13.2, y: 3 },
    { type: 'printer', x: 16.4, y: 3 },
    { type: 'poster', id: 'chronotime', x: 20.2, y: 3.9 },
    { type: 'poster', id: 'ordre-mission', x: 22.6, y: 3.9 },
    { type: 'poster', id: 'mypeopledoc', x: 27.2, y: 5.4, front: true },
    { type: 'poster', id: 'global-service-center', x: 33.2, y: 5.2 },
    { type: 'coffee', x: 36.4, y: 3 },
    { type: 'poster', id: 'sap-concur', x: 38, y: 3.9 },
    { type: 'whiteboard', id: 'businessManager', x: 40.2, y: 3 },
    { type: 'desk', id: 'businessManager', x: 43.7, y: 3 },
    { type: 'poster', id: 'swile', x: 49.6, y: 6.5 },
    { type: 'poster', id: 'bon-commande', x: 54.3, y: 4.2 },
    { type: 'cooler', x: 58.2, y: 9 },
    { type: 'plant', x: 39.4, y: 3 },
    { type: 'plantSmall', x: 13.4, y: 6, z: -1.6 },
    { type: 'chair', x: 25.2, y: 3, z: -1.3 },
  ],
  lighting: {
    sunDir: [-0.35, -0.55, 0.75],
    sunColor: [1.7, 1.42, 1.05],
    sky: [0.55, 0.62, 0.78],
    ground: [0.26, 0.24, 0.26],
    fog: [0.72, 0.8, 0.9],
    fogRange: [45, 110],
    backdrop: {
      top: [0.32, 0.55, 0.86],
      mid: [0.68, 0.82, 0.95],
      bottom: [0.98, 0.86, 0.7],
      sun: [0.78, 0.72],
      glow: [1, 0.85, 0.55],
    },
  },
  intro: [
    {
      who: 'partner',
      text: 'Alerte : l’enveloppe des NAO a disparu, et les négos commencent jeudi !',
    },
    {
      who: 'hero',
      text: 'Pas de panique. Sans bon de commande signé, rien ne bouge : il est forcément dans l’open space.',
    },
    {
      who: 'partner',
      text: 'Je t’attends à l’Espace Business. Et pense à badger sur Chronotime !',
    },
  ],
  outro: [
    {
      who: 'partner',
      text: 'Le bon de commande ! Par contre l’enveloppe est partie chez Julien, à Technologies & Services.',
    },
    { who: 'hero', text: 'Alors on descend en salle serveurs. Prends une polaire.' },
  ],
};

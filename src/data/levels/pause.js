/**
 * Bonus stage: the break room. Grab the cafeteria badge at the far end, then run
 * back to the door on the left with the water-cooler bottles rolling after you.
 * @type {import('./index.js').Level}
 */
export const PAUSE = {
  id: 'pause',
  theme: 'office',
  music: 'copil',
  name: 'Bonus : Salle de pause',
  subtitle: 'Espace détente · vendredi, 10 h 30',
  keyModel: 'badge',
  keyLabel: 'Badge cafét’',
  rooms: ['Porte de la cafét’', 'Coin café', 'Baby-foot', 'Fond de la salle'],
  map: [
    '################################################################################',
    '#                                                                              #',
    '#                                                                              #',
    '#                                             *$                               #',
    '#                                             ##                               #',
    '#         $$$$                $ $ $                                $$$ K       #',
    '#         ####                #####                               #######      #',
    '#         A  #                                                                 #',
    '# E   S C A*h#          n  a        $ $ $ $ i     C       a c              R  R#',
    '##################  ############################################################',
    '##################^^############################################################',
    '################################################################################',
  ],
  tips: [
    {
      x0: 68.5,
      x1: 73.5,
      y0: 5.5,
      keys: 'Dès que tu prends le badge, les bonbonnes dévalent : file vers la porte, à gauche !',
      touch: 'Dès que tu prends le badge, les bonbonnes dévalent : file vers la porte, à gauche !',
    },
  ],
  decor: [
    { type: 'poster', id: 'summer-party', x: 3.4, y: 4 },
    { type: 'coffee', x: 15.6, y: 3, z: -2 },
    { type: 'cooler', x: 16.8, y: 3 },
    { type: 'poster', id: 'charity-day', x: 21.4, y: 4 },
    { type: 'bistro', x: 28.6, y: 3, z: -1.4 },
    { type: 'plant', x: 35.2, y: 3 },
    { type: 'poster', id: 'swile', x: 39.4, y: 4.2 },
    { type: 'chair', x: 48.6, y: 3, z: -1.6 },
    { type: 'poster', id: 'spark', x: 56.6, y: 4 },
    { type: 'coffee', x: 63.6, y: 3, z: -2 },
    { type: 'poster', id: 'gcomp', x: 67.6, y: 7.2 },
    { type: 'plantSmall', x: 72.4, y: 6, z: -1.6 },
    { type: 'cooler', x: 76.6, y: 3, z: -2.1 },
  ],
  lighting: {
    sunDir: [0.35, -0.68, 0.64],
    sunColor: [1.75, 1.6, 1.3],
    sky: [0.6, 0.64, 0.74],
    ground: [0.36, 0.3, 0.26],
    fog: [0.84, 0.88, 0.92],
    fogRange: [48, 118],
    backdrop: {
      top: [0.34, 0.6, 0.9],
      mid: [0.7, 0.86, 0.97],
      bottom: [0.98, 0.94, 0.84],
      sun: [0.3, 0.86],
      glow: [1, 0.92, 0.7],
    },
  },
  intro: [
    {
      who: 'partner',
      text: 'Pause café ! Le badge de la cafétéria est resté au fond de la salle.',
    },
    { who: 'hero', text: 'Je le récupère et je reviens. Qu’est-ce qui pourrait mal tourner ?' },
    {
      who: 'partner',
      text: 'Les bonbonnes d’eau sont posées un peu en équilibre… Cours vite au retour !',
    },
  ],
  outro: [
    {
      who: 'partner',
      text: 'Badge cafét’ récupéré ! Les cafés sont pour moi. Les bonbonnes, pour le service technique.',
    },
  ],
};

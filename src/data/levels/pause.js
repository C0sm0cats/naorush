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
    '# E   S C A*h#          n  a        $ $ $ $ v     C       a c              R  R#',
    '##################  ############################################################',
    '##################^^############################################################',
    '################################################################################',
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
    { type: 'cooler', x: 76.6, y: 6.2, z: -2.1 },
  ],
  lighting: {
    sunDir: [-0.3, -0.6, 0.75],
    sunColor: [1.75, 1.45, 1.05],
    sky: [0.56, 0.6, 0.74],
    ground: [0.28, 0.25, 0.25],
    fog: [0.78, 0.8, 0.88],
    fogRange: [45, 110],
    backdrop: {
      top: [0.36, 0.55, 0.86],
      mid: [0.7, 0.82, 0.94],
      bottom: [0.98, 0.88, 0.72],
      sun: [0.7, 0.75],
      glow: [1, 0.85, 0.6],
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

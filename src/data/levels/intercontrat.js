/**
 * Bonus stage, unlocked once the envelope is signed: the inter-contract floor,
 * where consultants between two missions keep busy. A climbing course with
 * tickets everywhere, a springboard robot and a signed mission order to grab.
 * @type {import('./index.js').Level}
 */
export const INTERCONTRAT = {
  id: 'intercontrat',
  theme: 'office',
  music: 'office',
  name: 'Bonus : Intercontrat',
  subtitle: 'Plateau de l’intercontrat · vendredi, 16 h 30',
  keyLabel: 'Ordre de mission',
  rooms: ['Accueil', 'La fosse', 'Coin formation', 'L’escalier des étagères', 'Départ en mission'],
  map: [
    '####################################################################################################',
    '#                                        w                   $h$                                   #',
    '#                                                            ###                                   #',
    '#               $$$$$                        *$         $$$                                        #',
    '#               #####                        ##         ###       $      $                         #',
    '#                          $   $   $               $$$                                 $$$ K       #',
    '#                     #              #             ###                    #           ########     #',
    '#                     #              #                                    #           A *    #     #',
    '# S  C  $ $ $v        #d             #  c $$$$$ C                         # i   C  P  A$$$$  #  E  #',
    '##########################          #############################        ###########################',
    '##########################^^^^^^^^^^#############################^^^^^^^^###########################',
    '####################################################################################################',
  ],
  lifts: [
    { x: 27, y: 3, top: 5.5, w: 2, period: 4 },
    { x: 31.5, y: 4, top: 7, w: 2, period: 5 },
    { x: 66.5, y: 3, top: 7, w: 2, period: 4.5 },
    { x: 70.5, y: 4, top: 8, w: 2, period: 5.5 },
  ],
  decor: [
    { type: 'poster', id: 'learning-academy', x: 3, y: 4 },
    { type: 'poster', id: 'gofluent', x: 9.6, y: 4.6 },
    { type: 'poster', id: 'my-way', x: 16.8, y: 9 },
    { type: 'poster', id: 'spark', x: 29.6, y: 7.2 },
    { type: 'poster', id: 'ordre-mission', x: 49.6, y: 4 },
    { type: 'poster', id: 'cooptation', x: 66.6, y: 8 },
    { type: 'poster', id: 'your-digital-hub', x: 77, y: 4 },
    { type: 'plant', x: 7.2, y: 3 },
    { type: 'coffee', x: 38.6, y: 3, z: -2 },
    { type: 'chair', x: 54.5, y: 3, z: -1.6 },
    { type: 'monitor', x: 52, y: 6, z: -1.6 },
    { type: 'plantSmall', x: 57.2, y: 8, z: -1.6 },
    { type: 'cooler', x: 79, y: 3 },
  ],
  lighting: {
    sunDir: [0.5, -0.45, 0.75],
    sunColor: [1.85, 1.3, 0.9],
    sky: [0.55, 0.55, 0.72],
    ground: [0.28, 0.24, 0.24],
    fog: [0.85, 0.75, 0.72],
    fogRange: [45, 110],
    backdrop: {
      top: [0.28, 0.42, 0.78],
      mid: [0.85, 0.7, 0.72],
      bottom: [1, 0.85, 0.62],
      sun: [0.8, 0.55],
      glow: [1, 0.8, 0.55],
    },
  },
  intro: [
    {
      who: 'partner',
      text: 'Vendredi, 16 h 30 : l’intercontrat. Une nouvelle mission attend preneur au bout du plateau !',
    },
    {
      who: 'hero',
      text: 'Des étagères à escalader, des tickets partout… on appelle ça de la montée en compétences.',
    },
  ],
  outro: [
    {
      who: 'partner',
      text: 'Ordre de mission signé ! Départ lundi, et on a même gagné le pot de vendredi.',
    },
  ],
};

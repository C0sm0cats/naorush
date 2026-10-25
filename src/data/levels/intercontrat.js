/**
 * Bonus stage, unlocked once the envelope is signed: the inter-contract floor,
 * where consultants between two missions keep busy. A climbing course with
 * tickets everywhere, a springboard robot and a signed mission order to grab.
 * @type {import('./index.js').Level}
 */
export const INTERCONTRAT = {
  id: 'intercontrat',
  theme: 'office',
  mood: 'idle',
  music: 'office',
  name: 'Bonus : Intercontrat',
  subtitle: 'Plateau de l’intercontrat · jeudi, 9 h 30',
  keyLabel: 'Ordre de mission',
  rooms: [
    'Accueil',
    'La fosse',
    'Coin formation',
    'L’escalier des étagères',
    'Bibliothèque',
    'Départ en mission',
  ],
  map: [
    '########################################################################################################################',
    '#                                        w                   $h$                     w                                 #',
    '#                                                            ###                                                       #',
    '#               $$$$$                        *$         $$$                       $ $ a $ $                            #',
    '#               #####                        ##         ###       $      $      ###########                            #',
    '#                          $   $   $               $$$                          ###########                $$$ K       #',
    '#                     #              #             ###                    #     A         A               ########     #',
    '#                     #              #                                    #     A         A               A $    #     #',
    '# S  C  $ $ $v        #d             #  c $$$$$ C                         # C   A $$ * $$ A     i   C  P  A$$$$  #  E  #',
    '##########################          #############################        ###############################################',
    '##########################^^^^^^^^^^#############################^^^^^^^^###############################################',
    '########################################################################################################################',
  ],
  lifts: [
    { x: 27, y: 3, top: 5.5, w: 2, period: 4 },
    { x: 31.5, y: 4, top: 7, w: 2, period: 5 },
    { x: 66.5, y: 3, top: 7, w: 2, period: 4.5 },
    { x: 70.5, y: 4, top: 8, w: 2, period: 5.5 },
    { x: 78, y: 3, top: 8, w: 2, period: 4.5 },
  ],
  decor: [
    { type: 'poster', id: 'learning-academy', x: 3, y: 4 },
    { type: 'poster', id: 'gofluent', x: 9.6, y: 4.6 },
    { type: 'poster', id: 'my-way', x: 16.8, y: 7.9 },
    { type: 'poster', id: 'spark', x: 29.6, y: 7.2 },
    { type: 'poster', id: 'ordre-mission', x: 48.9, y: 4 },
    { type: 'poster', id: 'cooptation', x: 66.6, y: 8 },
    { type: 'plant', x: 7.2, y: 3 },
    { type: 'coffee', x: 38.6, y: 3, z: -2 },
    { type: 'chair', x: 54.5, y: 3, z: -1.6 },
    { type: 'monitor', x: 52, y: 6, z: -1.6 },
    { type: 'plantSmall', x: 57.2, y: 8, z: -1.6 },
    { type: 'plantSmall', x: 77.4, y: 3, z: -1.8 },
    { type: 'binders', x: 84.2, y: 3, z: -1.8 },
    { type: 'monitor', x: 87.4, y: 8, z: -1.8 },
    { type: 'plant', x: 92.6, y: 3 },
    { type: 'poster', id: 'your-digital-hub', x: 97, y: 4 },
    { type: 'cooler', x: 99, y: 3 },
  ],
  lighting: {
    sunDir: [-0.55, -0.42, 0.72],
    sunColor: [2, 1.4, 0.85],
    sky: [0.55, 0.5, 0.56],
    ground: [0.38, 0.28, 0.2],
    fog: [0.95, 0.74, 0.5],
    fogRange: [26, 100],
    backdrop: {
      top: [0.3, 0.48, 0.8],
      mid: [0.9, 0.76, 0.66],
      bottom: [1, 0.8, 0.5],
      sun: [0.86, 0.52],
      glow: [1, 0.8, 0.5],
    },
  },
  intro: [
    {
      who: 'partner',
      text: 'Jeudi, 9 h 30. Pendant que les NAO s’ouvrent, un ordre de mission attend au bout du plateau de l’intercontrat.',
    },
    {
      who: 'hero',
      text: 'Des étagères à escalader, des tickets partout… on appelle ça de la montée en compétences.',
    },
    {
      who: 'partner',
      text: 'Ramène-le vite : quelqu’un a hâte de repartir en mission, et côté staffing, chaque jour compte !',
    },
  ],
  outro: [
    {
      who: 'partner',
      text: 'Ordre de mission signé ! Départ lundi chez le client, au bon TJM.',
    },
    { who: 'hero', text: 'Fin de l’intercontrat, client ravi. Ça, c’est un staffing réussi.' },
  ],
};

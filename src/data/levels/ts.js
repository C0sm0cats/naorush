/**
 * Stage 2: the Technologies & Services Pays de la Loire floor — server room,
 * window-cleaning lifts over a cable pit, and the director's office.
 * 'V' are server racks (solid).
 * @type {import('./index.js').Level}
 */
export const TS = {
  id: 'ts',
  theme: 'datacenter',
  music: 'datacenter',
  name: 'Technologies & Services',
  subtitle: 'Pays de la Loire · mardi, 14 h 03',
  rooms: ['Accueil T&S', 'Salle serveurs', 'Passerelle', 'Bureau du Directeur T&S'],
  map: [
    '################################################################################',
    '#                                         MMMMMM        F     G                #',
    '#                                         MMMMMM              G                #',
    '#                                                             G                #',
    '#             $$                      $ $ $ n   a             G                #',
    '#                                #################-----###    G                #',
    '#             VV                            VV                G     ##         #',
    '#         $$  VV                            VV                G                #',
    '# S   C   VV  VV  a                  $ $ $  VV             C  G   a      X   E  ',
    '######################            ##############################################',
    '######################^^^^^^^^^^^^##############################################',
    '################################################################################',
  ],
  lifts: [
    { x: 23, y: 3, top: 5, w: 2, period: 4 },
    { x: 28, y: 4, top: 7.2, w: 2, period: 5 },
  ],
  boss: { id: 'techServicesDirector', hp: 3, arena: [63, 78] },
  decor: [
    { type: 'poster', id: 'success-factors', x: 3.4, y: 3.9 },
    { type: 'plant', x: 7.6, y: 3 },
    { type: 'poster', id: 'power-up', x: 18.6, y: 4.6 },
    { type: 'poster', id: 'gen-ai', x: 35.4, y: 7.3 },
    { type: 'poster', id: 'lets-connect', x: 48.6, y: 7.3 },
    { type: 'poster', id: 'gcomp', x: 57.6, y: 3.9 },
    { type: 'whiteboard', id: 'techServicesDirector', x: 64, y: 3 },
    { type: 'desk', id: 'techServicesDirector', x: 70.5, y: 3 },
    { type: 'cooler', x: 60.8, y: 3 },
    { type: 'rack', x: 12.5, y: 3 },
    { type: 'rack', x: 38.6, y: 3 },
    { type: 'rack', x: 40.4, y: 3 },
    { type: 'rack', x: 47.5, y: 3 },
    { type: 'chair', x: 7.2, y: 3, z: -1.2 },
    { type: 'monitor', x: 52.5, y: 7, z: -2 },
    { type: 'plantSmall', x: 53.3, y: 7, z: -2 },
  ],
  lighting: {
    sunDir: [-0.25, -0.7, 0.65],
    sunColor: [0.9, 1.05, 1.3],
    sky: [0.35, 0.5, 0.7],
    ground: [0.16, 0.2, 0.26],
    fog: [0.2, 0.3, 0.42],
    fogRange: [40, 100],
    backdrop: {
      top: [0.08, 0.14, 0.3],
      mid: [0.16, 0.3, 0.5],
      bottom: [0.3, 0.55, 0.7],
      sun: [0.3, 0.8],
      glow: [0.5, 0.8, 1],
    },
  },
  intro: [
    {
      who: 'partner',
      text: 'Salle serveurs : 19 °C et des kilomètres de câbles. Garde des CR sous la main.',
    },
    { who: 'hero', text: 'Le Directeur Technologies & Services a l’enveloppe ?' },
    { who: 'partner', text: 'Oui. Il la validera… si on lui apporte des arguments. Avec des KPI.' },
  ],
  bossIntro: [
    { who: 'boss', text: 'Une enveloppe NAO ? Très bien. Mais d’abord : vos KPI !' },
    { who: 'hint', text: 'Quand il consulte PRIMO, il baisse sa garde : lance-lui un CR (X).' },
  ],
  outro: [
    {
      who: 'boss',
      text: 'Ces comptes rendus sont impeccables. Je valide ! Pour la signature finale, voyez le Directeur Région Grand Ouest.',
    },
    {
      who: 'boss',
      text: 'Il est au Power UP Tour… sur le toit. Prenez l’escalier, l’ascenseur est en mise à jour.',
    },
  ],
};

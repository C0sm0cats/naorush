/**
 * Stage 2: the Technologies & Services floor — server room,
 * window-cleaning lifts over a cable pit, and the director's office.
 * 'V' are server racks (solid).
 * @type {import('./index.js').Level}
 */
export const TS = {
  id: 'ts',
  theme: 'datacenter',
  mood: 'night',
  music: 'datacenter',
  name: 'Technologies & Services',
  subtitle: 'Pays de la Loire · mardi, 14 h 03',
  keyModel: 'envelope',
  keyLabel: 'Enveloppe',
  rooms: ['Accueil T&S', 'Salle serveurs', 'Passerelle', 'Supervision', 'Bureau de Julien'],
  map: [
    '####################################################################################################',
    '#                                         MMMMMM  w       F                      G                 #',
    '#                                         MMMMMM                             *   G                 #',
    '#                                                                           $$   G                 #',
    '#                                    $ $ $   n  a                           ##   G                 #',
    '#             $$                 ###################-----###                     G                 #',
    '#             VV                            VV     A              V              G     ##          #',
    '#         $$  VV                            AA    *A              V              G                 #',
    '# S   C   VV  VV  a C              $  v    $AA$$h$$A          C   Vd    z        G  a     h  X   E #',
    '######################            #############################LL###################################',
    '######################^^^^^^^^^^^^#############################^^###################################',
    '####################################################################################################',
  ],
  lifts: [
    { x: 23, y: 3, top: 5, w: 2, period: 4 },
    { x: 28, y: 4, top: 7.2, w: 2, period: 5 },
  ],
  boss: { id: 'techServicesDirector', hp: 4, arena: [82, 98] },
  decor: [
    { type: 'poster', id: 'success-factors', x: 3.4, y: 3.9 },
    { type: 'plant', x: 7.8, y: 3 },
    { type: 'rack', x: 12.5, y: 3 },
    { type: 'poster', id: 'power-up', x: 17.8, y: 4.4 },
    { type: 'poster', id: 'gen-ai', x: 34.4, y: 7.3 },
    { type: 'poster', id: 'gen-ai-hub', x: 25.6, y: 7.6 },
    { type: 'rack', x: 39.5, y: 3 },
    { type: 'poster', id: 'lets-connect', x: 48.6, y: 7.3 },
    { type: 'monitor', x: 57.6, y: 7, z: -2 },
    { type: 'plantSmall', x: 58.6, y: 7, z: -2 },
    { type: 'rack', x: 57.5, y: 3 },
    { type: 'poster', id: 'gcomp', x: 60.4, y: 4 },
    { type: 'poster', id: 'primo', x: 72.4, y: 4.4 },
    { type: 'chair', x: 78.4, y: 3, z: -1.2 },
    { type: 'cooler', x: 80.2, y: 3 },
    { type: 'whiteboard', id: 'techServicesDirector', x: 83, y: 3 },
    { type: 'desk', id: 'techServicesDirector', x: 90.6, y: 3 },
  ],
  lighting: {
    sunDir: [-0.15, -0.85, 0.5],
    sunColor: [0.65, 0.85, 1.2],
    sky: [0.3, 0.42, 0.62],
    ground: [0.1, 0.14, 0.22],
    fog: [0.05, 0.1, 0.18],
    fogRange: [36, 95],
    backdrop: {
      top: [0.02, 0.05, 0.12],
      mid: [0.05, 0.12, 0.24],
      bottom: [0.1, 0.24, 0.38],
      sun: [0.3, 1.2],
      glow: [0.2, 0.5, 0.8],
    },
  },
  intro: [
    {
      who: 'partner',
      text: 'Salle serveurs, 19 °C. Julien a l’enveloppe, et chez lui, rien ne passe sans une architecture irréprochable.',
    },
    { who: 'hero', text: 'Ça tombe bien : nos comptes rendus sont en haute disponibilité.' },
  ],
  bossIntro: [
    {
      who: 'boss',
      text: 'Bienvenue chez Technologies & Services. Ici, tout est redondé, sécurisé, supervisé.',
    },
    {
      who: 'boss',
      text: 'L’enveloppe des NAO ne quittera ce bureau qu’avec un dossier qui tient la charge. Montrez-moi le vôtre.',
    },
    {
      who: 'hint',
      text: 'Quand il consulte PRIMO, sa garde tombe : lance un CR (X ou CR). Évite les ombres au sol et les câbles allumés.',
    },
  ],
  outro: [
    {
      who: 'boss',
      text: 'Dossier robuste, arguments tracés, aucun point de défaillance unique. Je valide.',
    },
    {
      who: 'boss',
      text: 'Je signe l’enveloppe pour Technologies & Services. Reste la signature de Rodolphe, après l’avis du comité de pilotage, demain.',
    },
    { who: 'partner', text: 'Merci, Julien ! Vous ne serez pas déçu.' },
    {
      who: 'boss',
      text: 'Merci à vous. Ce dossier, nous l’avons construit ensemble. Bon déploiement !',
    },
  ],
  phaseLine: 'Bascule sur le site de secours !',
};

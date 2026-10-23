/**
 * Stage 2: the Technologies & Services floor — server room,
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
  keyLabel: 'Enveloppe',
  rooms: ['Accueil T&S', 'Salle serveurs', 'Passerelle', 'Supervision', 'Bureau de Julien'],
  map: [
    '####################################################################################################',
    '#                                         MMMMMM  w       F                      G                 #',
    '#                                         MMMMMM                       *         G                 #',
    '#                                                                     $$         G                 #',
    '#                                    $ $ $   n  a                     ##         G                 #',
    '#             $$                 ###################-----###                     G                 #',
    '#             VV                            VV     V              V              G     ##          #',
    '#         $$  VV                            AA    *V              V              G                 #',
    '# S   C   VV  VV  a                $  v    $AA$$h$$V          C   Vd        z    G  a     h  X   E #',
    '######################            ##################################################################',
    '######################^^^^^^^^^^^^##################################################################',
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
    { type: 'rack', x: 39.5, y: 3 },
    { type: 'poster', id: 'lets-connect', x: 48.6, y: 7.3 },
    { type: 'monitor', x: 54, y: 7, z: -2 },
    { type: 'plantSmall', x: 55, y: 7, z: -2 },
    { type: 'rack', x: 57.5, y: 3 },
    { type: 'poster', id: 'gcomp', x: 60.4, y: 4 },
    { type: 'poster', id: 'primo', x: 72.4, y: 4.4 },
    { type: 'chair', x: 78.4, y: 3, z: -1.2 },
    { type: 'cooler', x: 80.2, y: 3 },
    { type: 'whiteboard', id: 'techServicesDirector', x: 83, y: 3 },
    { type: 'desk', id: 'techServicesDirector', x: 90.6, y: 3 },
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
      text: 'Salle serveurs, 19 °C. Julien a l’enveloppe, et il ne valide rien sans une architecture irréprochable.',
    },
    { who: 'hero', text: 'Ça tombe bien : nos comptes rendus sont en haute disponibilité.' },
  ],
  bossIntro: [
    {
      who: 'boss',
      text: 'Bienvenue chez Technologies & Services. Ici, tout est redondé, sécurisé, supervisé.',
    },
    { who: 'boss', text: 'Une enveloppe NAO ? Montrez-moi que votre dossier tient la charge.' },
    {
      who: 'hint',
      text: 'Quand il consulte PRIMO, sa garde tombe : lance un CR (X). Surveille les ombres au sol et les câbles qui s’allument.',
    },
  ],
  outro: [
    {
      who: 'boss',
      text: 'Dossier robuste, arguments tracés, aucun point de défaillance. Je valide.',
    },
    {
      who: 'boss',
      text: 'Pour la signature finale, voyez Rodolphe. Mais d’abord, le comité de pilotage de demain doit acter le dossier.',
    },
    { who: 'partner', text: 'Merci Julien !' },
    { who: 'boss', text: 'Merci à vous. Bon déploiement !' },
  ],
  phaseLine: 'Bascule sur le site de secours !',
};

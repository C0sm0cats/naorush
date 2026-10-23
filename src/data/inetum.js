/**
 * The Inetum artwork kept from the original game: posters, the four whiteboards,
 * the four desks and the four name plaques.
 *
 * @typedef {Object} PosterDef
 * @property {string} file Path under assets/.
 * @property {number} aspect Width / height.
 * @property {string} title
 * @property {string} hint Shown when the hero walks past.
 */

/** @type {Record<string, PosterDef>} */
export const POSTERS = {
  'inetum-lcp7': {
    file: 'signage/inetum-lcp7.webp',
    aspect: 4 / 3,
    title: 'Inetum LCP7',
    hint: 'La Chapelle-sur-Erdre. Ici commence la mission.',
  },
  'learning-academy': {
    file: 'signage/learning-academy.webp',
    aspect: 1122 / 1402,
    title: 'Learning Academy',
    hint: 'Module 1 : saute vers un rebord, tu t’y accroches. ↑ pour grimper.',
  },
  chronotime: {
    file: 'signage/chronotime-2.webp',
    aspect: 3 / 4,
    title: 'Chronotime',
    hint: 'Badge aux bornes : en cas de pépin, tu repars d’ici.',
  },
  'global-service-center': {
    file: 'signage/global-service-center.webp',
    aspect: 4 / 3,
    title: 'Global Service Center',
    hint: 'Câbles à nu : le GSC est prévenu. Ne marche pas dessus.',
  },
  'sap-concur': {
    file: 'signage/sap-concur.webp',
    aspect: 3 / 4,
    title: 'SAP Concur',
    hint: 'Les tickets Swile se déclarent. Ramasse-les tous.',
  },
  swile: {
    file: 'signage/swile.webp',
    aspect: 3 / 4,
    title: 'Swile',
    hint: 'Chaque ticket compte pour le score final.',
  },
  'bon-commande': {
    file: 'signage/bon-commande.webp',
    aspect: 3 / 4,
    title: 'Bon de commande',
    hint: 'Sans bon de commande signé, pas de sortie. Il est tout en haut.',
  },
  'ordre-mission': {
    file: 'signage/ordre-mission.webp',
    aspect: 3 / 4,
    title: 'Ordre de mission',
    hint: 'Les ramettes rechargent tes comptes rendus.',
  },
  mypeopledoc: {
    file: 'signage/mypeopledoc.webp',
    aspect: 3 / 4,
    title: 'MyPeopleDoc',
    hint: 'Les collègues en appel bloquent le passage : un CR (X) et ils partent en réunion.',
  },
};

export const WHITEBOARDS = {
  projectDirector: 'signage/Whiteboard02.webp',
  businessManager: 'signage/Whiteboard01.webp',
  techServicesDirector: 'signage/Whiteboard03.webp',
  regionalDirector: 'signage/Whiteboard04.webp',
};

/** Desk artwork with the crop of the visible drawing. */
export const DESKS = {
  projectDirector: { file: 'signage/bureau-directeur-projets.webp', crop: [137, 14, 1897, 679] },
  businessManager: { file: 'signage/bureau-business-manager.webp', crop: [399, 42, 1374, 636] },
  techServicesDirector: {
    file: 'signage/bureau-directeur-technologies-services.webp',
    crop: [0, 0, 2093, 705],
  },
  regionalDirector: {
    file: 'signage/bureau-directeur-region-pays-loire.webp',
    crop: [203, 4, 1766, 704],
  },
};

export const PLAQUES = {
  projectDirector: 'plaques/projectDirector.png',
  businessManager: 'plaques/businessManager.png',
  techServicesDirector: 'plaques/techServicesDirector.png',
  regionalDirector: 'plaques/regionalDirector.png',
};

/** Poster display height in tiles; width follows the artwork. */
export const POSTER_H = 2.1;
export const WHITEBOARD_W = 3.4;

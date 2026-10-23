import { POSTER_LIST } from '../gfx/posters.js';

/**
 * Inetum content: poster hints, and the four whiteboards, desks and name plaques
 * kept from the original game.
 */

/** In-game hint for each poster: what it means for play. Artwork comes from gfx/posters.js. */
export const POSTER_HINTS = {
  'inetum-lcp7': 'La Chapelle-sur-Erdre. Ici commence la mission.',
  'learning-academy': 'Module 1 : saute vers un rebord, tu t’y accroches. ↑ pour grimper.',
  chronotime: 'Badge aux bornes Chronotime : en cas de pépin, tu repars de là.',
  'global-service-center': 'Câbles à nu : le GSC est prévenu. Ne marche pas dessus.',
  'sap-concur': 'Les tickets Swile se ramassent… et se déclarent.',
  mypeopledoc: 'Un collègue en call bloque le passage : un CR (X) l’envoie en réunion.',
  swile: 'Chaque ticket Swile compte pour le score.',
  'bon-commande': 'Sans bon de commande signé, pas de sortie.',
  'ordre-mission': 'Les ramettes de papier rechargent tes comptes rendus.',
  'success-factors': 'Objectif du jour : arriver au rooftop.',
  gcomp: 'La rémunération se négocie… avec des arguments.',
  'power-up': 'Les ascenseurs montent et descendent : saute au bon moment.',
  'power-up-tour': 'Le séminaire du Grand Ouest, sur le toit. Tout le monde y est.',
  'lets-connect': 'Les collègues en call sont partout. Garde des CR.',
  'gen-ai': 'Astuce IA : un CR lancé détruit les slides KPI en vol.',
  'charity-day': 'Des petits gestes, de grands impacts.',
  'summer-party': 'Le buffet attendra la fin des négociations.',
  cooptation: 'Ton binôme t’attend au bout de chaque étage.',
  'espace-vip': 'Le Directeur Région Grand Ouest négocie ici. Vise pendant qu’il consulte.',
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

/** Poster display height in tiles; width follows the artwork shape. */
export const POSTER_H = 2.1;
export const POSTER_ASPECT = { portrait: 0.75, landscape: 4 / 3, banner: 3 };
export const WHITEBOARD_W = 3.4;

/** Width in tiles of a poster on the wall. @param {string} id */
export function posterWidth(id) {
  const shape = POSTER_LIST.find((p) => p.id === id)?.shape ?? 'portrait';
  return POSTER_H * POSTER_ASPECT[shape];
}

/** Poster title. @param {string} id */
export const posterTitle = (id) => POSTER_LIST.find((p) => p.id === id)?.title ?? id;

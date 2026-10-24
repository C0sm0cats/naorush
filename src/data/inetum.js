import { POSTER_LIST } from '../gfx/posters.js';

/**
 * Inetum content: poster hints, and the four whiteboards, desks and name plaques
 * kept from the original game.
 */

/** In-game hint for each poster: what it means for play. Artwork comes from gfx/posters.js. */
export const POSTER_HINTS = {
  'inetum-lcp7': 'La Chapelle-sur-Erdre. C’est ici que commence la mission.',
  'learning-academy': 'Module 1 : saute vers un rebord pour t’y accrocher, puis grimpe.',
  chronotime: 'Badge aux bornes Chronotime : en cas de pépin, tu repars de là.',
  'global-service-center': 'Câbles à nu : le GSC est prévenu. En attendant, ne marche pas dessus.',
  'sap-concur': 'Les tickets Swile se ramassent… et se déclarent.',
  mypeopledoc: 'Un collègue en call bloque le passage ? Un CR l’envoie en réunion, ravi.',
  swile: 'Chaque ticket Swile compte pour le score.',
  'bon-commande': 'Sans bon de commande signé, pas de sortie.',
  'ordre-mission': 'Chaque ramette de papier recharge trois comptes rendus.',
  'success-factors': 'Un objectif par étape : la boussole du HUD te l’indique.',
  gcomp: 'La rémunération se négocie… avec des arguments.',
  'power-up': 'Les ascenseurs montent et descendent : saute au bon moment.',
  'power-up-tour': 'Le grand rendez-vous de la Région Ouest, sur le toit. Tout le monde y est.',
  'lets-connect': 'Les collègues en call sont partout. Garde des CR.',
  'gen-ai': 'Astuce IA : un CR lancé détruit les slides KPI en vol.',
  'charity-day': 'Des petits gestes, de grands impacts.',
  'summer-party': 'Le buffet se mérite : d’abord, la sortie.',
  cooptation: 'Ton binôme t’attend au bout de chaque étape.',
  'your-digital-hub': 'Le portail de tout. À retenir : les bornes Chronotime sont tes amies.',
  'my-way': 'Chaque étape compte : la suivante est juste au bout du couloir.',
  spark: 'Une idée lumineuse ? Les imprimantes, elles, clignotent avant de tirer.',
  gofluent: 'Les invitations en visio volent bas : saute-les, ou réponds par un CR.',
  primo: 'Les directeurs consultent PRIMO : c’est là qu’ils baissent la garde.',
  copil: 'En COPIL, tout est planifié… même les pièges. Observe, puis passe.',
  covoiturage: 'Le toit des voitures fait un excellent trottoir.',
  'note-de-frais': 'Les cafés rendent un cœur. Les notes de frais, plus tard.',
  'inetum-et-moi': 'Tes infos, tes congés… et ton badge visiteur, si tu l’avais pris.',
  'adopt-tools': 'Un outil s’adopte : la coupure d’eau, par exemple, calme les sprinklers.',
  'gen-ai-hub':
    'Astuce IA : les nacelles montent et descendent en rythme. Observe avant de sauter.',
  annuaire: 'Julien, Rodolphe, Mathis… tout le monde est dans l’annuaire. Même le stagiaire.',
  'celine-dion':
    'Billetterie CSE : deux places dorées attendent quelqu’un, tout près, sur les armoires…',
  'espace-vip': 'Rodolphe, le Directeur Région Ouest, reçoit ici. Vise quand il consulte PRIMO.',
};

/** Whiteboard artwork for the two heroes; the bosses' boards are drawn in code. */
export const WHITEBOARDS = {
  projectDirector: 'signage/Whiteboard02.webp',
  businessManager: 'signage/Whiteboard01.webp',
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
    file: 'signage/bureau-directeur-region-ouest.webp',
    crop: [203, 4, 1766, 704],
  },
};

/** Door plaques: image files for the heroes, text drawn in code for the bosses. */
export const PLAQUES = {
  projectDirector: 'plaques/projectDirector.png',
  businessManager: 'plaques/businessManager.png',
  techServicesDirector: ['DIRECTEUR TECHNOLOGIES SERVICES', 'PAYS DE LA LOIRE'],
  regionalDirector: ['DIRECTEUR', 'RÉGION OUEST'],
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

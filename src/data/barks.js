/**
 * Short speech bubbles, keyed by speaker then by moment. One line is picked at
 * random; the same moment does not repeat for a few seconds.
 * @type {Record<string, Record<string, string[]>>}
 */
export const BARKS = {
  kevin: {
    start: ['C’est parti. Jalon 1 : l’enveloppe.', 'Planning serré, on y va.'],
    checkpoint: ['Jalon atteint.', 'Badgé, tracé, planifié.', 'Point d’étape validé.'],
    hurt: ['Risque identifié… un peu tard.', 'Je note ça dans le REX.', 'Aïe. Plan B.'],
    key: ['Livrable récupéré !', 'Ça, c’est un jalon.'],
    ammo: ['Trois CR de plus au planning.', 'Du papier frais !'],
    meeting: ['Je t’envoie l’invitation.', 'On en parle en réunion ?'],
    internStun: ['Pause café méritée.', 'Pose les dossiers, on reprend après.'],
    visioMute: ['Micro coupé, on avance.', 'On se rappelle ?'],
    crack: ['Archivage express.', 'Ces cartons n’étaient pas dans le planning.'],
    secret: ['Personne n’avait vu ça dans le planning !', 'Un raccourci hors planning !'],
    vacuumBounce: ['Ce robot a de l’avenir.'],
    heart: ['Un café, et ça repart.'],
    idle: ['Le planning n’attend pas…', 'Je relis le Gantt.', 'On avance ?'],
    respawn: ['On reprend au dernier jalon.', 'Retour au badge. Deuxième essai, meilleur essai.'],
    bossHit: ['Argument livré !', 'Et un compte rendu de plus !'],
    block: ['Pas maintenant : attendons qu’il consulte PRIMO.'],
  },
  charline: {
    start: ['Allez, on a une enveloppe à signer !', 'Objectif du jour : closer.'],
    checkpoint: ['Badgée !', 'Point de passage signé.', 'Check !'],
    hurt: ['Oups, pas dans le forecast.', 'Je rebondis, c’est mon métier.', 'Aïe !'],
    key: ['Deal conclu !', 'Signé, scellé !'],
    ammo: ['De quoi convaincre tout un comité.', 'Rechargée !'],
    meeting: ['Je te cale un créneau !', 'On se fait un point après ?'],
    internStun: ['Respire, je t’apporte un café !'],
    visioMute: ['Je te rappelle après le COPIL !'],
    block: [
      'Trop lourd pour moi… Kévin en ferait des confettis.',
      'Pas encore : il ne consulte pas PRIMO.',
    ],
    vacuumBounce: ['Hop ! Merci le robot !'],
    secret: ['Une opportunité cachée !', 'Tout là-haut, il y avait un deal !'],
    heart: ['Un café, et c’est reparti !'],
    idle: ['Le client attend !', 'Allez, on y va ?', 'Je checke mes mails…'],
    respawn: ['On repart sur de bonnes bases.', 'Nouvel essai, nouvelle opportunité.'],
    bossHit: ['Argument imparable !', 'Proposition envoyée !'],
  },
  techServicesDirector: {
    consult: ['Je consulte PRIMO…', 'Voyons les indicateurs…'],
    bossHit: ['Intéressant. Continuez.', 'Argument tracé.', 'Ça tient la charge.'],
    hurt: ['Il faut que ça tienne la charge !', 'Pas de mise en prod sans tests !'],
  },
  regionalDirector: {
    consult: ['Un œil sur PRIMO…', 'Laissez-moi regarder les chiffres…'],
    bossHit: ['Ah, ça me plaît !', 'Voilà de l’énergie !', 'Bravo, continuez !'],
    hurt: ['Allez, la Région Ouest ne lâche rien !', 'Plus d’énergie !'],
  },
};

/** Opening lines before the first stage. @type {import('./levels/index.js').Line[]} */
export const PROLOGUE = [
  { who: 'narrator', text: 'Inetum, La Chapelle-sur-Erdre. Lundi matin.' },
  {
    who: 'narrator',
    text: 'Jeudi commencent les NAO, les négociations annuelles. Tout est prêt… sauf l’enveloppe des augmentations, introuvable.',
  },
  {
    who: 'narrator',
    text: 'Pour la retrouver et la faire signer, il faudra traverser cinq étapes et convaincre deux directeurs.',
  },
];

/**
 * Short speech bubbles, keyed by speaker then by moment. One line is picked at
 * random; the same moment does not repeat for a few seconds.
 * @type {Record<string, Record<string, string[]>>}
 */
export const BARKS = {
  kevin: {
    start: [
      'C’est parti. Jalon 1 : l’enveloppe.',
      'Planning serré, on y va.',
      'Kick-off lancé, chacun à son jalon !',
      'Le Gantt est prêt, moi aussi.',
      'Objectif : livrer avant jeudi.',
    ],
    checkpoint: [
      'Jalon atteint.',
      'Badgé, tracé, planifié.',
      'Point d’étape validé.',
      'Chronotime est content.',
      'Jalon vert au tableau de bord !',
    ],
    hurt: [
      'Risque identifié… un peu tard.',
      'Je note ça dans le REX.',
      'Aïe. Plan B.',
      'Ça, c’était pas dans le RAID.',
      'Petit glissement de planning.',
    ],
    key: [
      'Livrable récupéré !',
      'Ça, c’est un jalon.',
      'Livrable en main, je coche !',
      'Objectif de l’étape : atteint.',
    ],
    ammo: [
      'Trois CR de plus au planning.',
      'Du papier frais !',
      'De quoi documenter tout un comité.',
      'Comptes rendus rechargés.',
    ],
    meeting: [
      'Je t’envoie l’invitation.',
      'On en parle en réunion ?',
      'Ordre du jour en pièce jointe !',
      'Je te mets au prochain comité.',
    ],
    internStun: [
      'Pause café méritée.',
      'Pose les dossiers, on reprend après.',
      'Prends ton temps, le planning suit.',
      'On fera un point mentorat après !',
    ],
    visioMute: [
      'Micro coupé, on avance.',
      'On se rappelle ?',
      'Je reprends la parole, merci !',
      'Le reste, on le voit en COPIL.',
    ],
    archive: [
      'Archivage express.',
      'Ces cartons n’étaient pas dans le planning.',
      'Dossier clos, REX classé.',
      'Un compte rendu, et ça déblaie !',
    ],
    secret: [
      'Personne n’avait vu ça dans le planning !',
      'Un raccourci hors planning !',
      'Ça, c’est un gain de délai.',
      'Opportunité notée dans le RAID.',
    ],
    celine: ['Si c’est pour Céline Dion, on va faire le maximum !'],
    vacuumBounce: [
      'Ce robot a de l’avenir.',
      'Merci, collègue autonome !',
      'Un rebond pas prévu… mais efficace.',
    ],
    heart: [
      'Un café, et ça repart.',
      'Batterie rechargée, jalon suivant.',
      'Le café, mon meilleur sponsor.',
    ],
    idle: [
      'Le planning n’attend pas…',
      'Je relis le Gantt.',
      'On avance ?',
      'Prochain comité dans… oh là.',
      'Je mets à jour le RAID…',
    ],
    respawn: [
      'On reprend au dernier jalon.',
      'Retour au badge. Deuxième essai, meilleur essai.',
      'REX fait, on repart.',
      'Replanification express !',
    ],
    bossHit: [
      'Argument livré !',
      'Et un compte rendu de plus !',
      'Tout est tracé, chiffré, daté.',
      'Jalon tenu, comme promis.',
    ],
    block: [
      'Pas maintenant : attendons qu’il consulte PRIMO.',
      'Patience : son œil est sur PRIMO bientôt.',
      'On attend le bon créneau : PRIMO.',
    ],
  },
  charline: {
    start: [
      'Allez, on a une enveloppe à signer !',
      'Objectif du jour : closer.',
      'Café, sourire, c’est parti !',
      'Une belle affaire nous attend !',
    ],
    checkpoint: [
      'Badgée !',
      'Point de passage signé.',
      'Check !',
      'Et hop, badgée !',
      'Étape sécurisée, on continue !',
    ],
    hurt: [
      'Oups, pas dans le forecast.',
      'Je rebondis, c’est mon métier.',
      'Aïe !',
      'On ne lâche rien !',
      'Une objection ? Je gère.',
    ],
    key: ['Deal conclu !', 'Signé, scellé !', 'Celui-là, je le close !', 'Le forecast remonte !'],
    ammo: [
      'De quoi convaincre tout un comité.',
      'Rechargée !',
      'Propositions prêtes à partir !',
      'Pitch rechargé à bloc !',
    ],
    meeting: [
      'Je te cale un créneau !',
      'On se fait un point après ?',
      'Je te mets en copie !',
      'On en reparle autour d’un café ?',
    ],
    internStun: [
      'Respire, je t’apporte un café !',
      'Tout va bien, on fait une pause !',
      'Tu gères, prends ton souffle !',
    ],
    visioMute: [
      'Je te rappelle après le COPIL !',
      'On se recale ça très vite !',
      'Je t’envoie un récap par mail !',
    ],
    block: [
      'Trop lourd pour moi… Kévin en ferait des confettis.',
      'Pas encore : il ne consulte pas PRIMO.',
      'J’attends qu’il regarde PRIMO…',
    ],
    vacuumBounce: ['Hop ! Merci le robot !', 'Super partenariat, le robot !', 'Rebond gagnant !'],
    secret: [
      'Une opportunité cachée !',
      'Tout là-haut, il y avait un deal !',
      'Un lead caché, je prends !',
      'Personne ne grimpe aussi haut !',
    ],
    celine: [
      'Des places pour Céline Dion ? Kévin va être aux anges !',
      'Céline Dion ! Je garde ça pour Kévin.',
      'Kévin va chanter tout l’après-midi !',
    ],
    heart: [
      'Un café, et c’est reparti !',
      'Plein d’énergie, on fonce !',
      'Café pris, objections bienvenues !',
    ],
    idle: [
      'Le client attend !',
      'Allez, on y va ?',
      'Je checke mes mails…',
      'Trois rappels clients en attente…',
      'Le forecast ne se fait pas tout seul !',
    ],
    respawn: [
      'On repart sur de bonnes bases.',
      'Nouvel essai, nouvelle opportunité.',
      'Un « non » ? Juste un « pas encore ».',
      'On relance, avec le sourire !',
    ],
    bossHit: [
      'Argument imparable !',
      'Proposition envoyée !',
      'Et ça, c’est de la valeur !',
      'Offre sur mesure, rien que pour vous !',
    ],
  },
  colleague: {
    bump: [
      'Tu m’entends ? Je partage mon écran…',
      'Attends, je suis en call !',
      'Je te rappelle après mon point !',
      'Non mais là je suis en réunion…',
      'Tu es sur mute, je crois !',
    ],
    meeting: [
      'Ah, une réunion ? J’y vais !',
      'Oh, un compte rendu ! Merci !',
      'Super, j’adore les ordres du jour !',
      'Un CR ? Je le lis tout de suite !',
    ],
    wake: [
      'Bon, où en étais-je ?',
      'Je reprends mon call !',
      'Pardon, j’étais en réunion !',
      'Excellente réunion, ça !',
    ],
  },
  visio: {
    invite: [
      'Je t’envoie une invitation !',
      'On se cale un point ?',
      'Tu as reçu mon invit’ ?',
      'Réunion dans 5 minutes !',
      'J’ai un créneau entre deux créneaux !',
    ],
  },
  intern: {
    internStun: [
      'Une pause café ? Avec plaisir !',
      'Ouf, mes dossiers…',
      'Merci ! Je reprends dans deux minutes.',
      'J’ai appris un truc, là !',
    ],
  },
  partner: {
    waiting: [
      'Il manque encore l’objet clé : regarde dans le HUD !',
      'Sans l’objet clé, on ne passe pas. Il est derrière toi !',
      'Suis la boussole du HUD : l’objet clé t’attend.',
    ],
    welcome: [
      'Bien joué, binôme !',
      'On y est ! Suis-moi.',
      'Quelle équipe ! On continue.',
      'Parfait, étape bouclée !',
    ],
  },
  techServicesDirector: {
    consult: [
      'Je consulte PRIMO…',
      'Voyons les indicateurs…',
      'Vérifions la supervision…',
      'Un œil sur le SLA…',
    ],
    bossHit: [
      'Intéressant. Continuez.',
      'Argument tracé.',
      'Ça tient la charge.',
      'Solide. Je valide ce point.',
      'Bien documenté. J’apprécie.',
    ],
    hurt: [
      'Il faut que ça tienne la charge !',
      'Pas de mise en prod sans tests !',
      'Tout est redondé ici.',
      'Mon infra ne tombe jamais.',
      'Bascule prévue. Rien ne m’arrête.',
    ],
  },
  regionalDirector: {
    consult: [
      'Un œil sur PRIMO…',
      'Laissez-moi regarder les chiffres…',
      'Voyons la dynamique de la Région…',
      'Les résultats de l’Ouest, voyons…',
    ],
    bossHit: [
      'Ah, ça me plaît !',
      'Voilà de l’énergie !',
      'Bravo, continuez !',
      'Ça, c’est l’esprit Région Ouest !',
      'Vous avez du talent, vous !',
    ],
    hurt: [
      'Allez, la Région Ouest ne lâche rien !',
      'Plus d’énergie !',
      'Le show ne fait que commencer !',
      'Toute la Région vous regarde !',
      'Montrez-moi ce que vous valez !',
    ],
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
    text: 'Pour la retrouver et la faire signer à temps, il faudra traverser cinq étapes et convaincre deux directeurs.',
  },
];

/**
 * Short speech bubbles, keyed by speaker then by moment. One line is picked at
 * random; the same moment does not repeat for a few seconds.
 *
 * Voices: Kévin is methodical and dry (jalons, Gantt, RAID, REX, CR); Charline is
 * quick and warm (client, closing, forecast, staffing, propale). Lines said at
 * the start of a stage must fit every stage, bonus ones included.
 * @type {Record<string, Record<string, string[]>>}
 */
export const BARKS = {
  kevin: {
    start: [
      'Kick-off. Chacun à son jalon !',
      'Le Gantt est prêt. Moi aussi.',
      'Chemin critique repéré. On y va.',
      'Livrable identifié. Go.',
      'Reste à faire : tout. Allons-y.',
      'Réunion de lancement : terminée. Go !',
      'Tâche 1 : avancer. Tâche 2 : ne pas tomber.',
      'Ordre du jour : traverser. Simple.',
    ],
    checkpoint: [
      'Jalon atteint.',
      'Badgé, tracé, daté.',
      'Point d’étape validé.',
      'Temps saisi dans Chronotime.',
      'Jalon vert au tableau de bord !',
      'On consolide, et on avance.',
    ],
    hurt: [
      'Risque identifié… un peu tard.',
      'Je note ça dans le REX.',
      'Aïe. Plan B.',
      'Ça, c’était pas dans le RAID.',
      'Écart constaté. Je corrige.',
      'Impact délai : modéré.',
      'Point de vigilance, noté.',
      'Aïe. J’escalade en COPIL.',
    ],
    key: [
      'Livrable récupéré !',
      'Ça, c’est un jalon.',
      'Livrable en main, je coche !',
      'Critère d’acceptation : rempli.',
      'Recette validée du premier coup.',
    ],
    ammo: [
      'Trois CR de plus. Paré.',
      'Du papier frais !',
      'De quoi documenter tout un COPIL.',
      'Comptes rendus rechargés.',
    ],
    meeting: [
      'Salle réservée, café prévu.',
      'Ordre du jour en pièce jointe !',
      'Je te mets au prochain comité.',
      'Le CR suivra, promis.',
    ],
    internStun: [
      'Pause café méritée.',
      'Pose les dossiers, on reprend après.',
      'On fera un point mentorat !',
      'Respire. Le jalon attendra.',
    ],
    visioMute: [
      'Micro coupé, on avance.',
      'On se rappelle ?',
      'Je reprends la parole, merci !',
      'Le reste, on le voit en COPIL.',
    ],
    archive: [
      'Archivage express.',
      'Dossier clos, REX classé.',
      'Un compte rendu, et ça déblaie !',
      'Archives 2019 : classées.',
    ],
    secret: [
      'Un raccourci hors planning !',
      'Ça, c’est un gain de délai.',
      'Opportunité notée dans le RAID.',
      'Personne ne l’avait mis au Gantt.',
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
      'Je relis le Gantt.',
      'On avance ?',
      'Prochain comité dans… oh là.',
      'Je mets à jour le RAID…',
      'Le reste à faire ne baisse pas seul.',
      'Mes temps Chronotime… ce soir.',
    ],
    respawn: [
      'On reprend au dernier jalon.',
      'Deuxième essai, meilleur essai.',
      'REX fait, on repart.',
      'Replanification express !',
    ],
    bossHit: [
      'Argument livré !',
      'Et un compte rendu de plus !',
      'Tout est tracé, chiffré, daté.',
      'Jalon tenu, comme promis.',
    ],
    // Said when a CR bounces off (a boss on guard, a robot vacuum…): keep it generic.
    block: ['Pas le bon créneau.', 'Bloqué. Je replanifie.', 'Ça ne passe pas… pas encore.'],
  },
  charline: {
    start: [
      'Café, sourire, c’est parti !',
      'Objectif du jour : closer.',
      'Une belle affaire nous attend !',
      'On fonce, le client n’attend pas !',
      'Agenda bouclé, on y va !',
      'Allez, on transforme l’essai !',
      'Pipe rempli, énergie au max !',
    ],
    checkpoint: [
      'Badgée !',
      'Point de passage signé.',
      'Check !',
      'Étape sécurisée, on continue !',
      'Temps saisi, je file !',
    ],
    hurt: [
      'Oups, pas dans le forecast.',
      'Je rebondis, c’est mon métier.',
      'Aïe !',
      'On ne lâche rien !',
      'Une objection ? Je gère.',
      'Je renégocie avec le sol.',
    ],
    key: ['Deal conclu !', 'Signé, scellé !', 'Celui-là, je le close !', 'Le forecast remonte !'],
    ammo: [
      'Trois propales prêtes à partir !',
      'Rechargée !',
      'Des arguments en stock !',
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
      'Super énergie ! On la canalise ?',
    ],
    visioMute: [
      'Je te rappelle après le COPIL !',
      'On se recale ça très vite !',
      'Je t’envoie un récap par mail !',
    ],
    block: [
      'Pas encore le bon moment !',
      'Objection notée, je reviens !',
      'Ça ne passe pas… pour l’instant !',
    ],
    vacuumBounce: ['Hop ! Merci le robot !', 'Super partenariat, le robot !', 'Rebond gagnant !'],
    secret: [
      'Une opportunité cachée !',
      'Tout là-haut, il y avait un deal !',
      'Un lead caché, je prends !',
      'Personne ne grimpe aussi haut !',
    ],
    celine: [
      'Céline Dion ? Kévin va être aux anges !',
      'Céline Dion ! Je garde ça pour Kévin.',
      'Kévin va chanter tout l’après-midi !',
    ],
    heart: [
      'Café serré, énergie maxi !',
      'Plein d’énergie, on fonce !',
      'Café pris, objections bienvenues !',
    ],
    idle: [
      'Le client attend !',
      'Allez, on y va ?',
      'Je checke mes mails…',
      'Trois rappels clients en attente…',
      'Le forecast ne se fait pas tout seul !',
      'Un consultant à staffer, moi…',
      'Je relance la propale ?',
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
      'TJM justifié, ligne par ligne !',
    ],
  },
  colleague: {
    bump: [
      'Tu m’entends ? Je partage mon écran…',
      'Attends, je suis en call !',
      'Je te rappelle après mon point !',
      'Non mais là je suis en réunion…',
      'Tu es sur mute, je crois !',
      'Deux secondes, je suis en visio !',
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
      'La boussole du HUD te montre le chemin.',
      'On ne sort pas les mains vides !',
      'Il nous manque encore le livrable !',
    ],
    welcome: [
      'Bien joué, binôme !',
      'On y est ! Suis-moi.',
      'Quelle équipe ! On continue.',
      'Parfait, étape bouclée !',
      'Livré dans les temps !',
    ],
  },
  techServicesDirector: {
    consult: [
      'Je consulte PRIMO…',
      'Voyons les indicateurs…',
      'Vérifions la supervision…',
      'Un œil sur le SLA…',
      'Les sondes sont au vert…',
    ],
    bossHit: [
      'Intéressant. Continuez.',
      'Argument tracé.',
      'Ça tient la charge.',
      'Solide. Je valide ce point.',
      'Bien documenté. J’apprécie.',
      'Propre. Aucune dette technique.',
    ],
    hurt: [
      'Il faut que ça tienne la charge !',
      'Pas de mise en prod sans tests !',
      'Tout est redondé ici.',
      'Bascule prévue. Rien ne m’arrête.',
      'Incident clos. On reprend ?',
      'Relevez-vous : on refait le test.',
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
      'Debout ! L’Ouest se relève toujours.',
    ],
  },
};

/** Opening lines before the first stage. @type {import('./levels/index.js').Line[]} */
export const PROLOGUE = [
  { who: 'narrator', text: 'Inetum, La Chapelle-sur-Erdre. Lundi, 8 h 38.' },
  {
    who: 'narrator',
    text: 'Jeudi s’ouvrent les NAO, les négociations annuelles. Tout est prêt… sauf l’enveloppe des augmentations, partie en circuit de validation.',
  },
  {
    who: 'narrator',
    text: 'Kévin a un planning. Charline a un plan. À eux deux : cinq étapes, deux directeurs à convaincre, et trois jours.',
  },
];

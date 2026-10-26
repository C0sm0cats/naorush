import { CAST } from './cast.js';

/**
 * Short speech bubbles, keyed by speaker then by moment. Lines are dealt from a
 * shuffle bag: nothing repeats within a stage until every line has been said.
 *
 * Voices: Kévin is methodical and dry (jalons, Gantt, RAID, REX, CR); Charline is
 * quick and warm (client, closing, forecast, staffing, propale). These shared
 * lines must fit every stage, bonus ones included; a stage's own lines live in
 * STAGE_BARKS. The partner at the exit speaks in their own voice (`waiting`,
 * `welcome`); `partner` holds neutral lines for when the speaker is unknown.
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
      'Planning validé. Exécution.',
      'Objectif clair, périmètre clair. Go.',
      'Premier jalon dans vingt mètres.',
    ],
    checkpoint: [
      'Jalon atteint.',
      'Badgé, tracé, daté.',
      'Point d’étape validé.',
      'Temps saisi dans Chronotime.',
      'Jalon vert au tableau de bord !',
      'On consolide, et on avance.',
      'Sauvegarde du planning : faite.',
      'Jalon franchi, on garde le rythme.',
      'Avancement : conforme.',
      'Je coche la case.',
      'Point de reprise sécurisé.',
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
      'Hypothèse invalidée. Je recadre.',
      'Retard absorbé par la marge.',
      'Écart de trajectoire, je rectifie.',
    ],
    key: [
      'Livrable récupéré !',
      'Ça, c’est un jalon.',
      'Livrable en main, je coche !',
      'Critère d’acceptation : rempli.',
      'Recette validée du premier coup.',
      'Livrable sécurisé. Suite du plan.',
      'Validé, archivé, sauvegardé.',
      'Objectif principal : atteint.',
      'Ça, c’est du concret.',
      'Je l’ajoute au CR de la semaine.',
    ],
    ammo: [
      'Trois CR de plus. Paré.',
      'Du papier frais !',
      'De quoi documenter tout un COPIL.',
      'Comptes rendus rechargés.',
      'Ramette pleine, CR prêts.',
      'Assez de papier pour un REX complet.',
      'Comptes rendus : stock reconstitué.',
      'Le papier, c’est ma matière première.',
      'Plus un CR ne manque à l’appel.',
      'Imprimé recto verso, bien sûr.',
    ],
    meeting: [
      'Salle réservée, café prévu.',
      'Ordre du jour en pièce jointe !',
      'Je te mets au prochain comité.',
      'Le CR suivra, promis.',
      'Créneau bloqué dans ton agenda.',
      'Trente minutes, pas une de plus.',
      'Invitation envoyée, salle confirmée.',
      'Pense à prendre des notes !',
      'Je t’ai mis en participant obligatoire.',
      'Bonne séance ! Relevé de décisions à suivre.',
    ],
    internStun: [
      'Pause café méritée.',
      'Pose les dossiers, on reprend après.',
      'On fera un point mentorat !',
      'Respire. Le jalon attendra.',
      'Une pause, et on repart sereinement.',
      'Prends ton temps, je t’attends au jalon.',
      'Bon réflexe, la pause.',
      'Tes dossiers sont entre de bonnes mains.',
      'On classera ensemble, promis.',
      'Belle énergie. On la planifie ?',
    ],
    visioMute: [
      'Micro coupé, on avance.',
      'On se rappelle ?',
      'Je reprends la parole, merci !',
      'Le reste, on le voit en COPIL.',
      'Coupure propre. Merci.',
      'Je te fais un résumé par écrit.',
      'On garde ça pour le point de jeudi.',
      'Réunion écourtée, ordre du jour tenu.',
      'Le CR te dira tout.',
      'Silence radio, avancement maximal.',
    ],
    archive: [
      'Archivage express.',
      'Dossier clos, REX classé.',
      'Un compte rendu, et ça déblaie !',
      'Archives 2019 : classées.',
      'Les archives retrouvent leur place.',
      'Un carton de moins sur le chemin critique.',
      'Rangement par lot, efficace.',
      'Archives tombées, passage dégagé.',
      'Classement vertical… terminé.',
      'Ce carton datait d’avant le Gantt.',
    ],
    secret: [
      'Un raccourci hors planning !',
      'Ça, c’est un gain de délai.',
      'Opportunité notée dans le RAID.',
      'Personne ne l’avait mis au Gantt.',
      'Variante de planning découverte.',
      'Le chemin critique a un raccourci.',
      'Bonus non planifié, je prends.',
      'Hors périmètre… mais bienvenu.',
      'Celle-là, je la garde pour le REX.',
      'Trois minutes de gagnées. Au moins.',
    ],
    // His line, word for word: it is the only one.
    celine: ['Si c’est pour Céline Dion, on va faire le maximum !'],
    vacuumBounce: [
      'Ce robot a de l’avenir.',
      'Merci, collègue autonome !',
      'Un rebond pas prévu… mais efficace.',
      'Tremplin homologué.',
      'Rebond calculé. Enfin, presque.',
      'Merci pour le coup de pouce !',
      'Ce robot mérite une prime.',
      'Collaboration homme-machine réussie.',
      'Trajectoire optimisée par un aspirateur.',
      'Le sol est propre, et moi en l’air.',
    ],
    heart: [
      'Un café, et ça repart.',
      'Batterie rechargée, jalon suivant.',
      'Le café, mon meilleur sponsor.',
      'Café validé, énergie conforme.',
      'Pause café validée en séance.',
      'Recharge complète. On reprend.',
      'Un expresso, zéro dette d’énergie.',
      'Le café, c’est de la gestion des risques.',
      'Café noir, idées claires.',
      'Une tasse, et le planning tient.',
    ],
    idle: [
      'Je relis le Gantt.',
      'On avance ?',
      'Prochain comité dans… oh là.',
      'Je mets à jour le RAID…',
      'Le reste à faire ne baisse pas seul.',
      'Mes temps Chronotime… ce soir.',
      'Je reprends les CR de la semaine…',
      'Prochain jalon : quelque part devant.',
      'Le chemin critique m’appelle.',
      'Une seconde, je recale le planning.',
    ],
    respawn: [
      'On reprend au dernier jalon.',
      'Deuxième essai, meilleur essai.',
      'REX fait, on repart.',
      'Replanification express !',
      'Retour au jalon. Rien de perdu.',
      'Leçon apprise, je documente.',
      'Nouvelle itération.',
      'On rejoue la séquence, corrigée.',
      'Plan de reprise activé.',
      'Même jalon, meilleure approche.',
    ],
    bossHit: [
      'Argument livré !',
      'Et un compte rendu de plus !',
      'Tout est tracé, chiffré, daté.',
      'Jalon tenu, comme promis.',
      'Point suivant de l’ordre du jour !',
      'Indicateurs à l’appui.',
      'Chiffres vérifiés, sources citées.',
      'Planning tenu, budget tenu.',
      'Le REX parle pour nous.',
      'Jalon après jalon, dossier après dossier.',
    ],
    // Said when a CR bounces off (a boss on guard, a robot vacuum…): keep it generic.
    block: [
      'Pas le bon créneau.',
      'Bloqué. Je replanifie.',
      'Ça ne passe pas… pas encore.',
      'Créneau occupé. Je repasse.',
      'Prérequis non rempli.',
      'Dépendance bloquante. Patience.',
      'Je reformule et je reviens.',
      'Mauvais timing, bon dossier.',
      'J’attends la bonne fenêtre.',
      'Refusé… pour cette version.',
    ],
    // At the exit, as the partner (Charline's run): without the key item, then with it.
    waiting: [
      'Livrable manquant. On ne clôture pas sans lui.',
      'Critère de sortie non rempli : il manque le livrable.',
      'Je tiens la porte. Le livrable, c’est pour toi.',
      'Pas de go sans le livrable.',
      'Check-list de sortie : il manque une ligne.',
      'Reviens avec le livrable, je valide la sortie.',
      'Statut : presque. Il manque l’essentiel.',
      'Pas de clôture sans livrable. C’est la méthode.',
      'Regarde en hauteur, j’ai un pressentiment documenté.',
      'Je t’attends ici. Le livrable, lui, n’attend que toi.',
    ],
    welcome: [
      'Bien joué. Étape clôturée.',
      'Livré dans les temps. Je note.',
      'Jalon atteint à deux. Suivant.',
      'Parfait. Je mets à jour le Gantt.',
      'Étape bouclée, rien à redire.',
      'Mission accomplie. Le CR suit.',
      'Quelle exécution. Bravo, binôme.',
      'Tout est conforme. On enchaîne.',
      'Pile dans le planning !',
      'Excellent travail. Je le garde pour le REX.',
    ],
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
      'Prête à signer, prête à courir !',
      'Je sens une belle opportunité !',
      'Rendez-vous pris avec le succès !',
    ],
    checkpoint: [
      'Badgée !',
      'Point de passage signé.',
      'Check !',
      'Étape sécurisée, on continue !',
      'Temps saisi, je file !',
      'Une étape de plus dans le pipe !',
      'Hop, sécurisé !',
      'Je badge et je repars !',
      'On avance, on avance !',
      'Étape validée, client ravi !',
    ],
    hurt: [
      'Oups, pas dans le forecast.',
      'Je rebondis, c’est mon métier.',
      'Aïe !',
      'On ne lâche rien !',
      'Une objection ? Je gère.',
      'Je renégocie avec le sol.',
      'Petit contretemps, grand sourire !',
      'Ça, je ne l’avais pas vu venir !',
      'On recadre et on repart !',
      'Même pas mal… presque !',
    ],
    key: [
      'Deal conclu !',
      'Signé, scellé !',
      'Celui-là, je le close !',
      'Le forecast remonte !',
      'Affaire signée !',
      'Et un closing de plus !',
      'Je l’avais dans mon forecast !',
      'Ça, c’est du pipe qui convertit !',
      'Dans la poche, avec le sourire !',
      'Objectif atteint, on célèbre après !',
    ],
    ammo: [
      'Trois propales prêtes à partir !',
      'Rechargée !',
      'Des arguments en stock !',
      'Pitch rechargé à bloc !',
      'Nouvelles propales en stock !',
      'Plaquettes commerciales chargées !',
      'J’ai réponse à tout !',
      'Trois offres, trois sourires !',
      'Ma mallette est pleine !',
      'De quoi convaincre tout un comité !',
    ],
    meeting: [
      'Je te cale un créneau !',
      'On se fait un point après ?',
      'Je te mets en copie !',
      'On en reparle autour d’un café ?',
      'Bonne réunion, je te laisse !',
      'Un point rapide, promis !',
      'Invitation envoyée !',
      'Je te bloque trente minutes !',
      'Agenda partagé, à tout de suite !',
      'Tiens-moi au courant !',
    ],
    internStun: [
      'Respire, je t’apporte un café !',
      'Tout va bien, on fait une pause !',
      'Tu gères, prends ton souffle !',
      'Super énergie ! On la canalise ?',
      'On fait une pause ensemble ?',
      'Tu fais du super boulot !',
      'Je t’aide à ranger après !',
      'Un café, et tu repars en forme !',
      'Pas de stress, tout va bien !',
      'Tu as l’étoffe d’un consultant !',
    ],
    visioMute: [
      'Je te rappelle après le COPIL !',
      'On se recale ça très vite !',
      'Je t’envoie un récap par mail !',
      'On se cale un créneau demain ?',
      'Je te fais un point en direct !',
      'À très vite, on en reparle !',
      'Je reviens vers toi, promis !',
      'Je te laisse, on se rappelle !',
      'Merci pour ton temps !',
      'Super échange, à plus tard !',
    ],
    block: [
      'Pas encore le bon moment !',
      'Objection notée, je reviens !',
      'Ça ne passe pas… pour l’instant !',
      'Timing pas encore idéal !',
      'Je retente dans une seconde !',
      'Je reformule et je reviens !',
      'Patience, j’ai d’autres arguments !',
      'Pas grave, je relance !',
      'J’attends la bonne ouverture !',
      'Ça viendra, je reste souriante !',
    ],
    vacuumBounce: [
      'Hop ! Merci le robot !',
      'Super partenariat, le robot !',
      'Rebond gagnant !',
      'Merci, collègue à roulettes !',
      'Ça, c’est du travail d’équipe !',
      'Envol réussi !',
      'Robot partenaire, deal gagnant !',
      'Hop, au-dessus des objections !',
      'Quel coup de pouce !',
      'On le recrute, ce robot !',
    ],
    secret: [
      'Une opportunité cachée !',
      'Tout là-haut, il y avait un deal !',
      'Un lead caché, je prends !',
      'Personne ne grimpe aussi haut !',
      'Personne ne l’avait vu, celui-là !',
      'Un deal hors catalogue !',
      'Une pépite dans le pipe !',
      'Ça, c’est un lead qualifié !',
      'Bien caché, mais pas pour moi !',
      'Jackpot, en toute discrétion !',
    ],
    celine: [
      'Céline Dion ? Kévin va être aux anges !',
      'Céline Dion ! Je garde ça pour Kévin.',
      'Kévin va chanter tout l’après-midi !',
      'Kévin, viens voir ça !',
      'Je fais une photo pour Kévin !',
      'Celle-là, Kévin la connaît par cœur !',
      'Une affiche de Céline ? Kévin va fondre !',
      'Je l’envoie direct à Kévin !',
      'Kévin ferait le maximum pour ça !',
      'Céline ici ? La journée de Kévin est faite !',
    ],
    heart: [
      'Café serré, énergie maxi !',
      'Plein d’énergie, on fonce !',
      'Café pris, objections bienvenues !',
      'Un café, et je relance tout le monde !',
      'Pause express, sourire rechargé !',
      'Café avalé, client rappelé !',
      'Énergie au top, on y retourne !',
      'Rien de tel qu’un bon café !',
      'Recharge express, je repars !',
      'Ça, c’est du carburant !',
    ],
    idle: [
      'Le client attend !',
      'Allez, on y va ?',
      'Je checke mes mails…',
      'Trois rappels clients en attente…',
      'Le forecast ne se fait pas tout seul !',
      'Un consultant à staffer, moi…',
      'Je relance la propale ?',
      'J’ai un rendez-vous à caler…',
      'Un lead à rappeler, vite !',
      'On ne fait pas attendre le client !',
    ],
    respawn: [
      'On repart sur de bonnes bases.',
      'Nouvel essai, nouvelle opportunité.',
      'Un « non » ? Juste un « pas encore ».',
      'On relance, avec le sourire !',
      'On rebondit !',
      'Deuxième chance, même énergie !',
      'Je reprends mon pitch du début !',
      'Allez, on y retourne !',
      'Ça ira mieux cette fois !',
      'Le meilleur reste à venir !',
    ],
    bossHit: [
      'Argument imparable !',
      'Proposition envoyée !',
      'Et ça, c’est de la valeur !',
      'Offre sur mesure, rien que pour vous !',
      'TJM justifié, ligne par ligne !',
      'Rapport qualité-prix imbattable !',
      'Et ce n’est que l’introduction !',
      'Votre succès, notre priorité !',
      'Une solution clé en main !',
      'Une offre qui tient toutes ses promesses !',
    ],
    // At the exit, as the partner (Kévin's run): without the key item, then with it.
    waiting: [
      'Il nous manque l’essentiel, retourne le chercher !',
      'Presque ! Sans l’objet de la mission, on ne signe rien.',
      'Je garde la porte, file le chercher !',
      'On ne part pas sans le principal !',
      'Fouille encore, je suis sûre qu’il est là !',
      'Regarde en hauteur, c’est souvent tout là-haut !',
      'Les mains vides ? Même mon meilleur pitch ne suffira pas !',
      'Tu y es presque, va le chercher !',
      'Je t’attends ici, avec un grand sourire !',
      'Pas si vite : il manque le plus important !',
    ],
    welcome: [
      'Bravo, binôme !',
      'Quelle équipe ! On enchaîne !',
      'Trop fort, on file !',
      'Deal bouclé, suis-moi !',
      'Superbe, je savais que tu y arriverais !',
      'Livré avec le sourire !',
      'Pile à l’heure, j’adore !',
      'Tu assures, vraiment !',
      'Mission accomplie, prochaine étape !',
      'Équipe de choc, on continue !',
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
      'Oups, je t’entends mal !',
      'On peut se voir en présentiel après ?',
      'Je finis ma visio et je suis à toi !',
      'Attends, j’ai une coupure réseau !',
    ],
    meeting: [
      'Ah, une réunion ? J’y vais !',
      'Oh, un compte rendu ! Merci !',
      'Super, j’adore les ordres du jour !',
      'Un CR ? Je le lis tout de suite !',
      'Un comité ? J’arrive !',
      'Merci, je file en salle !',
      'Parfait, j’avais un créneau !',
      'J’y vais, je prends un café en passant !',
      'Une réunion bien préparée, j’adore !',
      'Je prends des notes, promis !',
    ],
    wake: [
      'Bon, où en étais-je ?',
      'Je reprends mon call !',
      'Pardon, j’étais en réunion !',
      'Excellente réunion, ça !',
      'Réunion efficace, je reprends !',
      'Retour au bureau !',
      'J’ai tout noté, je reprends !',
      'Ça, c’était un bon point !',
      'Merci pour le CR, très clair !',
      'Bien reposé, je reprends !',
    ],
  },
  visio: {
    invite: [
      'Je t’envoie une invitation !',
      'On se cale un point ?',
      'Tu as reçu mon invit’ ?',
      'Réunion dans cinq minutes !',
      'J’ai un créneau entre deux créneaux !',
      'Tu as une minute ?',
      'Je t’ajoute au fil de discussion !',
      'Petit point synchro ?',
      'Un call rapide, promis !',
      'Tu es dispo à 17 h 45 ?',
    ],
  },
  intern: {
    internStun: [
      'Une pause café ? Avec plaisir !',
      'Ouf, mes dossiers…',
      'Merci ! Je reprends dans deux minutes.',
      'J’ai appris un truc, là !',
      'Merci, j’en avais besoin !',
      'Une pause et je reviens à fond !',
      'Je range tout ça, promis !',
      'C’est mon premier café de la journée !',
      'Trop gentil, merci !',
      'Je note : la pause, ça aide !',
    ],
  },
  partner: {
    waiting: [
      'On ne sort pas les mains vides !',
      'Il nous manque encore le livrable !',
      'Reviens avec l’objet de la mission !',
      'Pas si vite : il manque le principal !',
      'Je t’attends ici, avec le livrable !',
      'Fouille encore, il est forcément là !',
      'Sans le livrable, la porte reste close !',
      'Presque ! Il ne manque que l’essentiel.',
      'Regarde en hauteur, c’est souvent là-haut !',
      'Je garde la porte, va le chercher !',
    ],
    welcome: [
      'Bien joué, binôme !',
      'On y est ! Suis-moi.',
      'Quelle équipe ! On continue.',
      'Parfait, étape bouclée !',
      'Livré dans les temps !',
      'Superbe binôme !',
      'Mission accomplie, on file !',
      'Tu assures, vraiment !',
      'Pile à l’heure !',
      'Je savais que tu y arriverais !',
    ],
  },
  techServicesDirector: {
    consult: [
      'Je consulte PRIMO…',
      'Voyons les indicateurs…',
      'Vérifions la supervision…',
      'Un œil sur le SLA…',
      'Les sondes sont au vert…',
      'Contrôle des sauvegardes…',
      'Analyse des logs en cours…',
      'Je vérifie la redondance…',
      'Les alertes sont sous contrôle…',
      'Taux de disponibilité, voyons…',
    ],
    bossHit: [
      'Intéressant. Continuez.',
      'Argument tracé.',
      'Ça tient la charge.',
      'Solide. Je valide ce point.',
      'Bien documenté. J’apprécie.',
      'Propre. Aucune dette technique.',
      'Argument recevable.',
      'Le dossier gagne en solidité.',
      'Bonne réponse. Suivante.',
      'Vous avez fait vos devoirs.',
    ],
    hurt: [
      'Il faut que ça tienne la charge !',
      'Pas de mise en prod sans tests !',
      'Tout est redondé ici.',
      'Bascule prévue. Rien ne m’arrête.',
      'Incident clos. On reprend ?',
      'Relevez-vous : on refait le test.',
      'Ici, chaque détail compte.',
      'Revoyez l’architecture.',
      'Une faille ? Corrigez-la.',
      'Le système tient. À vous de tenir.',
    ],
  },
  regionalDirector: {
    consult: [
      'Un œil sur PRIMO…',
      'Laissez-moi regarder les chiffres…',
      'Voyons la dynamique de la Région…',
      'Les résultats de l’Ouest, voyons…',
      'Le tableau de bord de la Région…',
      'Voyons l’état du carnet de commandes…',
      'Les équipes de l’Ouest, voyons…',
      'Un coup d’œil aux indicateurs…',
      'PRIMO me dit tout…',
      'Les chiffres du trimestre, voyons…',
    ],
    bossHit: [
      'Ah, ça me plaît !',
      'Voilà de l’énergie !',
      'Bravo, continuez !',
      'Ça, c’est l’esprit Région Ouest !',
      'Vous avez du talent, vous !',
      'Superbe ! La salle est conquise !',
      'Voilà ce que j’appelle un pitch !',
      'Encore ! Le public en redemande !',
      'Ça, c’est une performance !',
      'Vous avez l’étoffe d’un leader !',
    ],
    hurt: [
      'Allez, la Région Ouest ne lâche rien !',
      'Plus d’énergie !',
      'Le show ne fait que commencer !',
      'Toute la Région vous regarde !',
      'Debout ! L’Ouest se relève toujours.',
      'On ne baisse jamais les bras à l’Ouest !',
      'Le show doit continuer !',
      'Allez, encore un effort !',
      'Je veux voir plus d’ambition !',
      'La Région mérite le meilleur de vous !',
    ],
  },
};

/**
 * Each stage's own bubbles, said before the shared ones, and its set-piece
 * teaser: two bubbles when the hero badges at the last checkpoint before tile
 * column `at` (where the set piece starts).
 * @type {Record<string, {
 *   teaser?: {at: number, lines: Record<string, string[]>},
 *   lines?: Record<string, Record<string, string[]>>,
 * }>}
 */
export const STAGE_BARKS = {
  parking: {
    teaser: {
      at: 38,
      lines: {
        kevin: [
          'Places visiteurs droit devant : des fosses entre les voitures.',
          'Plan : sauter de toit en toit. Sans rayer la carrosserie.',
        ],
        charline: [
          'Les places visiteurs ! Je vois des fosses entre les voitures.',
          'On saute de toit en toit, en douceur !',
        ],
      },
    },
    lines: {
      kevin: {
        start: [
          'Parking B2, 8 h 40. Dans les temps.',
          'Badge oublié, planning maintenu.',
          'Objectif : les ascenseurs. Itinéraire : les toits.',
        ],
        checkpoint: ['Premier jalon de la semaine.', 'Badgé avant 9 h. Parfait.'],
        idle: ['Je compte les places visiteurs…', 'Le badge, lui, est déjà là-haut.'],
      },
      charline: {
        start: [
          'Lundi matin, on démarre fort !',
          'Garée, café en main, c’est parti !',
          'Direction les ascenseurs, en beauté !',
        ],
        checkpoint: ['Premier badge de la semaine !', 'Lundi : coché !'],
        idle: ['Ces voitures sont bien garées, au moins !', 'Le lundi n’attend personne !'],
      },
    },
  },
  lcp7: {
    teaser: {
      at: 103,
      lines: {
        kevin: [
          'Coin imprimantes droit devant. Elles tirent en rafale.',
          'Je compte les feuilles, et je passe entre deux.',
        ],
        charline: [
          'Le coin imprimantes ! Elles impriment à toute vitesse.',
          'Je passe entre deux rafales, tranquille !',
        ],
      },
    },
    lines: {
      kevin: {
        start: [
          'Open space LCP7. Mon terrain.',
          'Bon de commande localisé : quelque part ici.',
          'Retour au bureau, version parcours.',
        ],
        checkpoint: ['Point de passage entre deux bureaux.', 'Badgé. Le Gantt est content.'],
        idle: ['Mon bureau n’est pas loin…', 'Ce fauteuil roule mieux que mon planning.'],
      },
      charline: {
        start: [
          'L’open space, mon deuxième salon !',
          'Le bon de commande, on le trouve !',
          'Bonjour tout le monde ! Je passe !',
        ],
        checkpoint: ['Badgée entre deux calls !', 'Encore un open space conquis !'],
        idle: ['Qui a laissé ce fauteuil ici ?', 'Je salue l’équipe et je file !'],
      },
    },
  },
  ts: {
    teaser: {
      at: 22,
      lines: {
        kevin: [
          'Passerelle au-dessus des câbles : les nacelles font le trajet.',
          'On monte au bon moment, et on reste au centre.',
        ],
        charline: [
          'Des nacelles au-dessus des câbles ! Ça va être sportif !',
          'On saute quand elles montent, et on garde le rythme !',
        ],
      },
    },
    lines: {
      kevin: {
        start: [
          'Salle serveurs, 19 °C. Idéal pour réfléchir.',
          'Architecture irréprochable exigée. Noté.',
          'Mardi, 14 h. Julien nous attend.',
        ],
        checkpoint: ['Jalon redondé.', 'Point de reprise, comme un bon PRA.'],
        idle: ['Ces racks ronronnent comme un Gantt bien tenu.', 'Tout est supervisé. Même moi.'],
      },
      charline: {
        start: [
          'Brr, il fait frais chez T&S !',
          'Julien a l’enveloppe, on y va !',
          'Une salle serveurs, quelle ambiance !',
        ],
        checkpoint: ['Badgée, et sauvegardée !', 'Même les badges sont redondés ici !'],
        idle: ['Ça clignote de partout, j’adore !', 'Je me demande ce que dit PRIMO…'],
      },
    },
  },
  copil: {
    teaser: {
      at: 71,
      lines: {
        kevin: [
          'Grande salle du COPIL : le vidéoprojecteur envoie ses KPI.',
          'Je baisse la tête, et je regarde où je pose les pieds.',
        ],
        charline: [
          'La grande salle ! Le projecteur tire des KPI en rafale !',
          'Je me baisse, et attention au sol qui s’ouvre !',
        ],
      },
    },
    lines: {
      kevin: {
        start: [
          'Mercredi, 10 h. Le COPIL, mon élément.',
          'Ordre du jour : faire valider le CR.',
          'Comité de pilotage. J’ai mes slides.',
        ],
        checkpoint: ['Jalon validé en séance.', 'Point d’avancement : vert.'],
        idle: ['Le relevé de décisions attend.', 'Je relis mes slides une dernière fois.'],
      },
      charline: {
        start: [
          'Le COPIL ! On va les convaincre !',
          'Un comité, ça se gagne !',
          'Mercredi, objectif validation !',
        ],
        checkpoint: ['Validé en comité !', 'Badgée, approuvée !'],
        idle: ['Le comité ne va pas attendre !', 'J’entends des visios sonner partout !'],
      },
    },
  },
  rooftop: {
    teaser: {
      at: 77,
      lines: {
        kevin: [
          'Trois nacelles au-dessus du vide. Je planifie.',
          'On saute de l’une à l’autre quand elles se croisent. Méthode.',
        ],
        charline: [
          'Trois nacelles qui se croisent au-dessus du vide !',
          'On passe de l’une à l’autre au bon moment. Facile !',
        ],
      },
    },
    lines: {
      kevin: {
        start: [
          'Le Power UP Tour. Grand jalon ce soir.',
          'Rooftop, 18 h 30. Signature en vue.',
          'Dernière étape du planning.',
        ],
        checkpoint: ['Point d’étape, vue imprenable.', 'Badgé sur le toit. Une première.'],
        idle: ['J’entends la musique de l’Espace VIP.', 'Le vent ne figure pas au planning.'],
      },
      charline: {
        start: [
          'Le Power UP Tour, j’adore !',
          'Quelle vue sur Nantes !',
          'Ce soir, on fait signer Rodolphe !',
        ],
        checkpoint: ['Badgée avec vue sur Nantes !', 'Point de passage, version rooftop !'],
        idle: ['Ça sent le buffet par ici !', 'Toute la Région Ouest est là !'],
      },
    },
  },
  intercontrat: {
    teaser: {
      at: 86,
      lines: {
        kevin: [
          'L’escalier des étagères : des plateaux mobiles au-dessus de la fosse.',
          'Montée progressive, un niveau à la fois.',
        ],
        charline: [
          'L’escalier des étagères ! Les plateaux montent et descendent !',
          'On grimpe en rythme, la mission est en haut !',
        ],
      },
    },
    lines: {
      kevin: {
        start: [
          'Intercontrat : le temps idéal pour progresser.',
          'Ordre de mission en vue. Go.',
          'Montée en compétences, version parcours.',
        ],
        checkpoint: ['Compétence validée.', 'Jalon de formation atteint.'],
        idle: ['Je pourrais passer une certification…', 'Le plateau est calme. Trop calme.'],
      },
      charline: {
        start: [
          'Un ordre de mission, ça se ramène !',
          'Allez, on staffe tout le monde !',
          'Jeudi, 9 h 30 : à nous le plateau !',
        ],
        checkpoint: ['Badgée, formée, prête !', 'Un pas de plus vers la mission !'],
        idle: ['Quelqu’un attend sa mission !', 'J’ai déjà le client idéal en tête !'],
      },
    },
  },
  pause: {
    teaser: {
      at: 148,
      lines: {
        kevin: [
          'Le badge est là-bas, sous les bonbonnes en équilibre.',
          'Je le prends, et je cours jusqu’à la porte. Sans détour.',
        ],
        charline: [
          'Le badge, là-bas ! Juste sous les bonbonnes d’eau…',
          'Je l’attrape, et je file à la porte en courant !',
        ],
      },
    },
    lines: {
      kevin: {
        start: [
          'Pause café : objectif badge.',
          'Aller simple, retour rapide.',
          'Opération cafét’, lancée.',
        ],
        checkpoint: ['Jalon café atteint.', 'Badgé près du baby-foot.'],
        idle: ['Une partie de baby-foot ? Plus tard.', 'Le café refroidit, lui aussi.'],
      },
      charline: {
        start: [
          'Une pause café bien méritée !',
          'Je récupère le badge, et c’est ma tournée !',
          'Vendredi, 10 h 30 : café time !',
        ],
        checkpoint: ['Badgée, café en vue !', 'Une étape avant le café !'],
        idle: ['Ça sent bon le café !', 'Qui veut un croissant ?'],
      },
    },
  },
  seminaire: {
    teaser: {
      at: 78,
      lines: {
        kevin: [
          'Sous le vidéoprojecteur : la keynote envoie ses KPI.',
          'Je baisse la tête au bon moment. Comme en plénière.',
        ],
        charline: [
          'Sous le vidéoprojecteur ! Les KPI volent bas !',
          'Je me baisse, je souris, et je passe !',
        ],
      },
    },
    lines: {
      kevin: {
        start: [
          'Séminaire annuel. Je connais le programme.',
          'Objectif : le badge, puis le buffet.',
          'Plénière, coulisses, cocktail. Dans l’ordre.',
        ],
        checkpoint: ['Jalon séminaire.', 'Badgé, programme respecté.'],
        idle: ['La keynote dure, elle aussi.', 'Je prends des notes pour le REX.'],
      },
      charline: {
        start: [
          'Le séminaire, j’adore !',
          'On fête la semaine !',
          'Je salue tout le monde en passant !',
        ],
        checkpoint: ['Badgée pour la fête !', 'Encore un peu et c’est le cocktail !'],
        idle: ['J’entends le cocktail d’ici !', 'La photo de groupe, c’est bientôt !'],
      },
    },
  },
};

/**
 * Each hero's own wording of the story lines. Stage dialogue names a role (hero,
 * partner) and either hero may hold it: a line written in one voice reads in the
 * other's when the other one says it. Keyed by the line's text in the stage file,
 * then by the CAST id actually speaking; a missing entry keeps the text as is.
 * @type {Record<string, Partial<Record<'kevin'|'charline', string>>>}
 */
export const HERO_TAKES = {
  // Parking B2
  'Te voilà ! L’enveloppe des NAO s’est perdue en circuit de validation, et elle doit être signée avant jeudi.':
    {
      kevin:
        'Bonjour. Point de situation : l’enveloppe des NAO s’est perdue en circuit de validation. Échéance de signature : jeudi.',
    },
  'Alors on monte la chercher. Seul souci : mon badge est resté sur mon bureau.': {
    kevin:
      'Alors on monte la chercher. Seul risque identifié : mon badge est resté sur mon bureau.',
    charline: 'Alors on fonce la chercher ! Seul hic : mon badge est resté sur mon bureau.',
  },
  'Un badge visiteur t’attend près des ascenseurs. Toits des voitures, rebords… et pense à badger sur Chronotime !':
    {
      kevin:
        'Un badge visiteur t’attend près des ascenseurs. Itinéraire : toits des voitures, rebords. Et on badge sur Chronotime à chaque borne.',
    },
  'Badge récupéré ! Direction l’open space : le bon de commande nous dira où est partie l’enveloppe.':
    {
      kevin:
        'Badge récupéré. Prochaine étape : l’open space. Le bon de commande nous dira où est partie l’enveloppe.',
    },
  // Open space LCP7
  'Open space LCP7. Le bon de commande signé est quelque part par ici.': {
    charline: 'L’open space LCP7 ! Le bon de commande signé se cache quelque part par ici.',
  },
  'Prudence : les fauteuils roulent seuls, les tiroirs claquent, et le stagiaire court avec ses dossiers.':
    {
      charline:
        'Attention : les fauteuils roulent tout seuls, les tiroirs claquent, et le stagiaire court avec ses dossiers !',
    },
  'Et regarde bien le sol : certaines dalles ne tiennent qu’à un fil.': {
    kevin: 'Et surveille le sol : certaines dalles ne tiennent qu’à un fil. C’est noté au RAID.',
  },
  'Le bon de commande ! Regarde le circuit de visa : l’enveloppe est partie chez Julien, à Technologies & Services.':
    {
      kevin:
        'Le bon de commande. D’après le circuit de visa, l’enveloppe est chez Julien, à Technologies & Services.',
    },
  'Julien ne valide rien sans une architecture solide. Préparons nos arguments.': {
    charline:
      'Julien ne valide rien sans une architecture solide. J’ai déjà mes arguments en tête !',
  },
  // Technologies & Services
  'Salle serveurs, 19 °C. Julien a l’enveloppe, et chez lui, rien ne passe sans une architecture irréprochable.':
    {
      charline:
        'Salle serveurs, 19 °C, brr ! Julien a l’enveloppe, et chez lui, rien ne passe sans une architecture irréprochable.',
    },
  'Ça tombe bien : nos comptes rendus sont en haute disponibilité.': {
    charline: 'Ça tombe bien : mes arguments sont en haute disponibilité !',
  },
  'Merci, Julien ! Vous ne serez pas déçu.': {
    kevin: 'Merci, Julien. Le plan de déploiement suit, jalon par jalon.',
  },
  // Comité de pilotage
  'Mercredi, 10 h : comité de pilotage. Sans CR validé, Rodolphe ne pourra pas signer.': {
    charline: 'Mercredi, 10 h : le COPIL ! Sans CR validé, Rodolphe ne pourra pas signer ce soir.',
  },
  'Visios qui sonnent, sprinklers capricieux, imprimantes en rafale… un COPIL classique.': {
    charline:
      'Visios qui sonnent, sprinklers capricieux, imprimantes en rafale… un mercredi comme je les aime !',
  },
  'Astuce : la vanne de la Régie coupe tous les sprinklers. Et le CR validé attend pile sous l’un d’eux.':
    {
      kevin:
        'Information utile : la vanne de la Régie coupe tous les sprinklers. Le CR validé attend pile sous l’un d’eux.',
      charline:
        'Petit tuyau : la vanne de la Régie coupe tous les sprinklers. Et le CR validé attend pile sous l’un d’eux !',
    },
  'Compte rendu validé à l’unanimité ! Rodolphe nous attend ce soir au Power UP Tour, sur le toit.':
    {
      kevin: 'CR validé à l’unanimité. Rodolphe nous attend ce soir au Power UP Tour, sur le toit.',
    },
  'Dernière ligne droite. Cap sur l’Espace VIP !': {
    kevin: 'Dernier jalon avant jeudi. Cap sur l’Espace VIP.',
  },
  // Power UP Tour
  'Le Power UP Tour… toute la Région Ouest est là !': {
    kevin: 'Le Power UP Tour. Toute la Région Ouest est là… et moi, j’ai mes slides.',
  },
  'Rodolphe ouvre la soirée à l’Espace VIP. Gare aux trous dans la toiture, et prends la nacelle vers la terrasse haute.':
    {
      charline:
        'Rodolphe ouvre la soirée à l’Espace VIP ! Attention aux trous dans la toiture, et prends la nacelle vers la terrasse haute.',
    },
  'On l’a fait !': { kevin: 'On l’a fait. Et dans les temps !' },
  // Intercontrat
  'Des étagères à escalader, des tickets partout… on appelle ça de la montée en compétences.': {
    charline: 'Des étagères à escalader, des tickets partout… moi, j’appelle ça du team building !',
  },
  'Ramène-le vite : quelqu’un a hâte de repartir en mission, et côté staffing, chaque jour compte !':
    {
      kevin:
        'Ramène-le vite : quelqu’un a hâte de repartir en mission. Le planning de démarrage est prêt.',
    },
  'Ordre de mission signé ! Départ lundi chez le client, au bon TJM.': {
    kevin: 'Ordre de mission signé. Démarrage lundi chez le client, kick-off à 9 h.',
  },
  'Fin de l’intercontrat, client ravi. Ça, c’est un staffing réussi.': {
    kevin: 'Fin de l’intercontrat, client ravi. Je l’ajoute au REX, rubrique réussites.',
  },
  // Salle de pause
  'Je le récupère et je reviens. Qu’est-ce qui pourrait mal tourner ?': {
    kevin: 'Je le récupère et je reviens. Risque estimé : faible. Très faible. Normalement.',
  },
  'Les bonbonnes d’eau tiennent en équilibre… Au retour, cours !': {
    kevin: 'Les bonbonnes d’eau tiennent en équilibre. Au retour : sprint, sans détour.',
  },
  'Un café, et on attaque les comptes rendus de la semaine.': {
    charline: 'Un café, et j’appelle trois clients avant midi !',
  },
  // Séminaire annuel
  'Attention au vidéoprojecteur : la keynote envoie ses KPI à la volée. Baisse la tête !': {
    kevin:
      'Point de vigilance : le vidéoprojecteur. La keynote envoie ses KPI à la volée. Tête baissée.',
  },
  'Et pour le buffet. Les petits-fours, eux, n’attendront pas le prochain COPIL.': {
    charline: 'Et pour le buffet ! Les petits-fours, eux, n’attendront pas le prochain COPIL.',
  },
  // Epilogue
  'Trois jours, deux signatures, et pas une minute de retard.': {
    charline: 'Trois jours, deux signatures, et le sourire jusqu’au bout !',
  },
  'Merci, binôme. On refait équipe l’an prochain ?': {
    kevin: 'Merci, binôme. Je bloque déjà le créneau pour l’an prochain.',
    charline: 'Merci, binôme ! On refait équipe l’an prochain ?',
  },
};

/**
 * The interlude between two story stages, keyed by the stage it leads to: the
 * hero's one line on the way (the clock and the route come from the stages).
 * @type {Record<string, Record<'kevin'|'charline', string>>}
 */
export const INTERLUDES = {
  lcp7: {
    kevin: 'Sept minutes d’ascenseur. Je les avais prévues au planning.',
    charline: 'Ascenseur, miroir, sourire. L’open space ne sait pas ce qui l’attend !',
  },
  ts: {
    kevin: 'Lundi : CR rédigé. Mardi matin : CR relu. Mardi, 14 h : CR prêt pour Julien.',
    charline: 'Créneau calé avec Julien : mardi, 14 h. On lui apporte un dossier en béton !',
  },
  copil: {
    kevin: 'Une signature sur deux. Mon Gantt n’a jamais été aussi vert.',
    charline: 'Une signature en poche ! Pitch du COPIL répété trois fois devant la machine à café.',
  },
  rooftop: {
    kevin:
      'Huit heures et demie avant le Power UP Tour. J’ai prévu une marge… et une chemise propre.',
    charline: 'Ce soir, le toit ! Tenue prête, arguments prêts, sourire déjà en place.',
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

/** Closing lines after the last story stage, before the credits. @type {import('./levels/index.js').Line[]} */
export const EPILOGUE = [
  {
    who: 'narrator',
    text: 'Jeudi, 9 h 00. Salle Erdre. Les NAO s’ouvrent à l’heure, l’enveloppe signée posée sur la table.',
  },
  { who: 'hero', text: 'Trois jours, deux signatures, et pas une minute de retard.' },
  { who: 'partner', text: 'Merci, binôme. On refait équipe l’an prochain ?' },
  {
    who: 'narrator',
    text: 'Dans le couloir, quelqu’un fredonne du Céline Dion. Personne ne dit qui. Tout le monde sourit.',
  },
];

/**
 * The cast for the scrolling credits, in order of appearance on the roll, each
 * with a kind word.
 * @type {Array<{id?: string, name: string, role: string, line: string}>}
 */
export const CREDITS = [
  {
    id: 'kevin',
    name: CAST.kevin.name,
    role: CAST.kevin.title ?? '',
    line: 'Chaque jalon tenu, chaque CR envoyé. Et pour Céline Dion, toujours le maximum.',
  },
  {
    id: 'charline',
    name: CAST.charline.name,
    role: CAST.charline.title ?? '',
    line: 'A transformé chaque objection en opportunité, et chaque obstacle en tremplin.',
  },
  {
    id: 'techServicesDirector',
    name: CAST.techServicesDirector.name,
    role: CAST.techServicesDirector.title ?? '',
    line: 'Chez lui, un dossier passe s’il tient la charge. Merci pour cette exigence, et pour la confiance.',
  },
  {
    id: 'regionalDirector',
    name: CAST.regionalDirector.name,
    role: CAST.regionalDirector.title ?? '',
    line: 'Merci pour l’énergie, le show et la signature. La Région Ouest tient son capitaine.',
  },
  {
    id: 'mathis',
    name: CAST.mathis.name,
    role: 'Collègue en call',
    line: 'Toujours en réunion, toujours de bonne humeur. Merci d’avoir libéré le passage.',
  },
  {
    id: 'intern',
    name: CAST.intern.name,
    role: 'Porteur de dossiers',
    line: 'Plus de dossiers que de bras, et jamais un sourire en moins. L’avenir de la maison.',
  },
  {
    id: 'visio',
    name: CAST.visio.name,
    role: 'Maître des agendas',
    line: 'Merci pour toutes ces invitations. Promis, on se cale un point.',
  },
  {
    name: 'Le robot aspirateur',
    role: 'Tremplin officiel',
    line: 'Meilleur rebond de l’open space, et le sol impeccable en prime.',
  },
  {
    name: 'Les bonbonnes d’eau',
    role: 'Cascadeuses',
    line: 'Elles ont beaucoup roulé pour nous. Restez hydratés !',
  },
  {
    name: 'Les fauteuils à roulettes',
    role: 'Pilotes d’essai',
    line: 'Plus de kilomètres cette semaine que toute l’équipe réunie.',
  },
];

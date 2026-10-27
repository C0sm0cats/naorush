# Créer une étape

Une étape est un fichier de `src/data/levels/`, enregistré dans `LEVELS` de `src/data/levels/index.js` (les `CAMPAIGN` premières forment l’histoire, les suivantes sont des étapes bonus). Les tests la reprennent automatiquement : le solveur vérifie qu’elle est finissable avec Kévin et avec Charline, et le test de non-blocage qu’aucun héros ne peut y rester coincé.

## 1. La carte

Des lignes de même longueur, écrites de haut en bas : **12 lignes**, ou davantage pour une étape à ciel ouvert (`open: true`, le toit du Power UP Tour en a 22). Une case fait un mètre et une salle fait 20 cases de large : il faut **au moins 7 salles**, chacune nommée dans `rooms`. Les trois dernières lignes sont le sol du bâtiment : les héros s’y tiennent à la hauteur 3 (les hauteurs se comptent depuis le bas). Sur une étape ouverte, un trou dans le sol donne sur le vide.

| Caractère | Rôle |
| --- | --- |
| `#` | Structure (mur, sol, plafond, armoires) |
| `M` `B` `V` `H` `Q` `Y` | Blocs solides habillés : salle vitrée, ramettes, baie serveur, clim, voiture, table de réunion |
| `A` | Cartons d’archives : solides, les CR de Kévin les cassent |
| `-` / `L` | Dalle qui s’effondre (visible) / trappe cachée |
| `^` | Câbles à nu (retour au badge) |
| `~` | Flaque : une suite de `~` posée sur le sol forme une seule flaque, précédée d’un panneau jaune « Attention sol glissant » |
| `D` `p` | Porte et lecteur de badge qui l’ouvre |
| `G` | Grille d’arène, fermée pendant un combat de boss |
| `S` `C` `E` | Départ, borne Chronotime, sortie (il faut l’objet clé) |
| `K` | Objet clé de l’étape (badge, bon de commande, enveloppe…) |
| `$` `a` `h` | Ticket Swile, ramette (+3 CR), café (+1 cœur) |
| `T` | Places pour le concert de Céline Dion (trophée « Pour Céline ») |
| `F` `O` | Dalle de plafond, classeurs qui tombent quand on passe dessous |
| `R` | Bonbonne d’eau qui roule quand on prend la clé |
| `c` `d` `w` `P` | Fauteuil roulant, tiroir (posé contre un mur), sprinkler (sous le plafond), imprimante |
| `n` `i` `v` `z` | Collègue en call, stagiaire, robot aspirateur (tremplin), chef de projet en visio |
| `X` | Boss (avec `boss` dans la définition) |
| `*` | Secret (invisible, un léger scintillement le trahit) |
| `k` | Coupure d’eau : arrête tous les sprinklers de l’étape |
| `J` | Vidéoprojecteur : tire des slides KPI en cloche vers la gauche |

### Règles de level design

- Un mur fait **1 case** (on saute) ou **au moins 3 cases** (on s’accroche) : 2 cases sont infranchissables pour Kévin, et un test le vérifie.
- Le saut simple monte d’environ 1,7 case et porte à environ 3,5 cases. Kévin attrape un rebord jusqu’à environ 4,5 cases au-dessus de ses pieds, Charline encore plus haut grâce au double saut. Un mur de 5 cases reste hors de portée de Kévin.
- **Le robot aspirateur est un tremplin** (`src/game/enemies.js`, `SPRING`) : sauter sur son couvercle propulse Kévin d’environ 4,35 cases vers le haut, Charline de 4,7 (5,8 avec son double saut). Il s’arrête 0,4 s pendant que le ressort se détend. Il fait demi-tour aux murs et aux bords : enfermé entre deux murs, il sert de sortie fiable ; libre de partir, c’est un bonus, jamais le seul chemin.
- **Sol mouillé** (`src/game/traps.js`, `WET`) : sur une flaque `~`, ou sous un sprinkler pendant 1,5 s après chaque arrosage, le héros garde 30 % de son adhérence (il freine et accélère mal, ses sauts ne changent pas). Une flaque ne se forme que sur un sol sûr, sans vide, câbles ni dalle fragile sur 3 cases de chaque côté : ailleurs, l’eau s’écoule.
- Deux secrets `*` par étape : un pour Charline (un rebord à 5 cases au-dessus du sol), un pour Kévin (une niche fermée par des cartons `A`, toute la pile tombe d’un seul CR). Un test vérifie que chaque héros atteint le sien.
- Chaque piège doit se voir venir. Les pièges périodiques (tiroir, sprinkler, imprimante, vidéoprojecteur) se décalent selon leur colonne.
- **Apprendre, puis tester** : un piège apparaît d’abord sans conséquence grave, puis combiné ou mortel plus loin. Exemple : la trappe cachée de LCP7 tombe dans un trou d’une case, celle de Technologies & Services au-dessus des câbles.
- **Bornes Chronotime** : une avant chaque passage mortel (câbles, vide), pour qu’une chute ne renvoie jamais avant une longue section déjà réussie, mais **au moins une salle (20 cases) entre deux bornes**. Jamais dans la ronde d’un ennemi ni dans une ligne de tir : un test laisse un héros immobile 4 s au départ et sur chaque borne, aussi en mode Sans filet, et il ne doit prendre aucun coup. Le premier pas à droite depuis le départ est sûr lui aussi.
- **Nacelles** (`lifts`) : de la place au-dessus d’elles en haut de course, pour un héros debout (testé).
- **Secrets** : ils récompensent (tickets, café avant un boss), jamais un objet indispensable.
- **Souplesse des commandes** (`src/game/sim.js`) : saut accepté 0,1 s après avoir quitté un bord, saut appuyé 0,13 s avant d’atterrir conservé, pieds qui accrochent un rebord à moins d’un quart de case montent dessus, saut rappuyé au moment de s’accrocher fait grimper. Une trappe cachée cède en 0,55 s, une dalle visible en 0,45 s.
- **Stagiaire** : il repère un héros à moins de 4,5 cases devant lui sur son étage, s’arrête net 0,4 s, puis fonce sans quitter un rayon de 4,5 cases autour de sa place. Une borne posée hors de ce rayon permet de voir la charge sans risque.
- **Parking (tutoriel)** : on sort de chaque sol sûr par une marche de 3 cases au plus, sans nacelle ni tremplin (testé).

### Cohérence : ce que l’on voit est ce que fait le jeu

La simulation (`src/game/`) applique ces règles partout ; une étape ne doit jamais compter sur l’inverse.

- **Hitbox = modèle** : fauteuil lancé (l’assise, 0,7 de haut), bonbonne (0,6 de diamètre), stagiaire (1,2 : un saut franc le passe), chef de projet en visio (1,3), collègue (1,75 : seul le double saut le passe), aspirateur (son couvercle est un tremplin).
- **Rien à travers un plancher** : ni personne, ni borne, lecteur, vanne, sortie ou secret ne réagit à un héros à l’étage du dessous ; une dalle de plafond ou des classeurs ne tombent que si rien ne les sépare du héros.
- **Le poids fissure les dalles** (`-`, `L`) : le héros, debout ou suspendu au bord, mais aussi un collègue, un stagiaire, l’aspirateur ou un fauteuil. Ce qui est dessus tombe quand elle cède ; dans les câbles ou le vide, c’est perdu (de retour à la réapparition). Une dalle se brise sur le sol du dessous et blesse qui s’y trouve.
- **Un CR s’arrête sur ce qu’il touche** : mur, carton (Kévin le fait tomber), fauteuil, bonbonne (elle éclate, même posée), personne (même déjà en réunion, en pause ou coupée), directeur hors duel, plancher d’une nacelle. Il passe au-dessus de ce qui est plus bas que la poitrine (aspirateur, tiroir, imprimante).
- **Ce qui roule s’arrête** : la bonbonne éclate contre un mur ou quelqu’un, le fauteuil s’arrête contre un mur, un bord ou quelqu’un.
- **Les câbles** tuent au contact, par les pieds comme par les côtés ; l’eau d’un sprinkler tombe jusqu’au premier obstacle solide (cartons et dalles compris).
- **Une nacelle ne coince personne** : elle ne porte jamais le héros dans un mur ou un plafond (il reste sur le rebord ou tombe), et ne le prend pas là où il resterait bloqué.
- **Un coup** projette le héros à l’opposé de ce qui l’a frappé.
- **À la réapparition tout se réarme** : dalles, dalles de plafond et classeurs, fauteuils, bonbonnes, et ceux qui sont tombés. Cartons cassés, portes ouvertes et vanne fermée restent acquis.

## 2. La définition

Les champs sont typés par `Level` (`src/data/levels/index.js`) et `LevelDef` (`src/game/world.js`).

```js
/** @type {import('./index.js').Level} */
export const MON_ETAPE = {
  id: 'mon-etape',
  theme: 'office', // 'office' | 'datacenter' | 'rooftop' | 'parking'
  mood: 'morning', // optionnel : 'dawn' | 'morning' | 'night' | 'corporate' | 'dusk' | 'idle' | 'lounge' | 'event'
  music: 'office', // 'office' | 'datacenter' | 'rooftop' | 'parking' | 'copil'
  name: 'Mon étape',
  subtitle: 'Lieu · jour, heure', // aussi l’heure de l’horloge de l’interlude
  keyLabel: 'Badge', // nom de l’objet clé dans le HUD
  keyModel: 'badge', // optionnel : 'key' | 'badge' | 'envelope'
  rooms: ['Salle 1', 'Salle 2' /* … */], // une par tranche de 20 cases, 7 au moins
  map: [/* 12 lignes (plus avec open: true) */],
  open: false, // optionnel : pas de plafond, le vide sous les trous (toits)
  lifts: [{ x: 23, y: 3, top: 6, w: 2, period: 4 }], // optionnel : nacelles verticales
  tips: [
    // optionnel : astuce affichée quand le héros passe entre x0 et x1 (et y0–y1)
    { x0: 5, x1: 8, keys: '{jump} : saute sur le toit.', touch: 'SAUT : saute sur le toit.' },
  ],
  boss: { id: 'techServicesDirector', hp: 4, arena: [182, 198] }, // optionnel
  decor: [
    { type: 'poster', id: 'spark', x: 10, y: 4 },
    { type: 'plant', x: 14, y: 3 },
  ],
  lighting: {/* soleil, ciel, brouillard, fond : copier une étape existante */},
  intro: [{ who: 'partner', text: '…' }],
  outro: [{ who: 'hero', text: '…' }],
  bossIntro: [{ who: 'boss', text: '…' }], // avec un boss
  phaseLine: '…', // réplique du boss au passage en deuxième phase
  finaleLine: '…', // optionnel : réplique du grand final (troisième phase)
};
```

- **Astuces** : `{left}`, `{right}`, `{up}`, `{down}`, `{jump}`, `{fire}` et `{pause}` sont remplacés par la touche réelle du joueur (ou le bouton de sa manette) ; `touch` est le texte affiché sur écran tactile.
- **Décor** : affiches (`id` parmi `POSTER_LIST` de `src/gfx/posters.js`), tableaux blancs (`whiteboard`), bureaux (`desk`) et accessoires (`PROP_IDS` de `src/gfx/props.js`). `y` est la hauteur depuis le bas, `front: true` accroche l’objet sur la face avant d’un bloc. Un test vérifie que chaque affiche et chaque tableau se voient en entier depuis un endroit en dessous.
- **Répliques** : `hero`, `partner` (l’autre héros), `boss`, `hint` (astuce) ou `narrator`.
- **Lumière** : copier les valeurs d’une étape au thème proche, puis ajuster.
- **Arène** : `arena` donne les colonnes du combat ; l’entrée est fermée par une colonne de `G`, le boss part de son `X`.

## 3. Vérifier

```sh
npm run lint && npm run typecheck && npm run test
```

- `tests/level.test.js` : le solveur finit l’étape avec les deux héros, un boss se convainc sans prendre un seul coup, chaque héros trouve son secret, pas de mur de 2 cases, bornes espacées et sûres, de la place au-dessus des nacelles. Si le solveur échoue, il indique où il est resté bloqué (`closest` dans `src/game/solver.js`) : c’est presque toujours un saut trop long ou un mur de 2 cases.
- `tests/softlock.test.js` : depuis chaque endroit où un héros peut s’arrêter (debout ou suspendu), l’objectif reste atteignable, ou bien une chute mortelle le renvoie à une borne. Une fosse sûre sans issue échoue, en indiquant sa colonne et sa ligne.
- `tests/medals.test.js` : les temps de référence des médailles (`REFERENCE` de `src/app/medals.js`) suivent la route du solveur. Après une modification de carte, il échoue en imprimant la nouvelle table à recopier.

# Créer une étape

Une étape est un fichier de `src/data/levels/`, enregistré dans `LEVELS` de `src/data/levels/index.js`. Les tests la reprennent automatiquement : le solveur vérifie qu’elle est finissable avec Kévin et avec Charline.

## 1. La carte

12 lignes de même longueur, écrites de haut en bas. Une case fait un mètre et une salle fait 20 cases de large. Les lignes 10 et 11 (en bas) sont le sol du bâtiment, la ligne 9 est le sol où l’on marche, donc les héros se tiennent à la hauteur 3.

| Caractère | Rôle |
| --- | --- |
| `#` | Structure (mur, sol, plafond, armoires) |
| `M` `B` `V` `H` `Q` `Y` | Blocs solides habillés : salle vitrée, ramettes, baie serveur, clim, voiture, table de réunion |
| `A` | Cartons d’archives : solides, les CR de Kévin les cassent |
| `-` / `L` | Dalle qui s’effondre (visible) / trappe cachée |
| `^` | Câbles à nu (retour au badge) |
| `D` `p` | Porte et lecteur de badge qui l’ouvre |
| `G` | Grille d’arène, fermée pendant un combat de boss |
| `S` `C` `E` | Départ, borne Chronotime, sortie (il faut l’objet clé) |
| `K` | Objet clé de l’étape (badge, bon de commande…) |
| `$` `a` `h` | Ticket Swile, ramette (+3 CR), café (+1 cœur) |
| `F` `O` | Dalle de plafond, classeurs qui tombent quand on passe dessous |
| `R` | Bonbonne d’eau qui roule quand on prend la clé |
| `c` `d` `w` `P` | Fauteuil roulant, tiroir (posé contre un mur), sprinkler (sous le plafond), imprimante |
| `n` `i` `v` `z` | Collègue en call, stagiaire, robot aspirateur, chef de projet en visio |
| `X` | Boss (avec `boss` dans la définition) |
| `*` | Secret (invisible, un léger scintillement le trahit) |
| `k` | Coupure d’eau : arrête tous les sprinklers de l’étape |
| `J` | Vidéoprojecteur : tire des slides KPI en cloche vers la gauche |

### Règles de level design

- Un mur fait **1 case** (on saute) ou **au moins 3 cases** (on s’accroche) : 2 cases sont infranchissables pour Kévin, et un test le vérifie.
- Le saut simple monte d’environ 1,7 case et porte à environ 3,5 cases. Kévin attrape un rebord jusqu’à environ 4,5 cases au-dessus de ses pieds, Charline encore plus haut grâce au double saut.
- Deux secrets `*` par étape : un pour Charline (un rebord à 5 cases au-dessus du sol), un pour Kévin (une niche fermée par des cartons `A`, toute la pile tombe d’un seul CR). Un test vérifie que chaque héros en atteint au moins un.
- Chaque piège doit se voir venir. Les pièges périodiques (tiroir, sprinkler, imprimante) se décalent selon leur colonne.
- **Apprendre, puis tester** : un piège apparaît d’abord sans conséquence grave, puis combiné ou mortel plus loin. Exemple : la trappe cachée de LCP7 tombe dans un trou d’une case, celle de Technologies & Services au-dessus des câbles.
- **Bornes Chronotime** : une avant chaque passage mortel (câbles, vide) : une chute ne doit pas renvoyer avant une longue section déjà réussie. Jamais dans la ronde d’un ennemi : on réapparaît dessus.
- **Secrets** : ils récompensent (tickets, café avant un boss), jamais un objet indispensable.
- **Souplesse des commandes** (`src/game/sim.js`) : saut accepté 0,1 s après avoir quitté un bord, saut appuyé 0,13 s avant d’atterrir conservé, pieds qui accrochent un rebord à moins d’un quart de case montent dessus, saut rappuyé au moment de s’accrocher fait grimper. Une trappe cachée cède en 0,55 s, une dalle visible en 0,45 s.
- **Stagiaire** : il repère un héros à moins de 4,5 cases devant lui sur son étage, s’arrête net 0,4 s, puis fonce sans quitter un rayon de 4,5 cases autour de sa place. Une borne posée hors de ce rayon permet de voir la charge sans risque.

## 2. La définition

```js
/** @type {import('./index.js').Level} */
export const MON_ETAPE = {
  id: 'mon-etape',
  theme: 'office', // 'office' | 'datacenter' | 'rooftop' | 'parking'
  music: 'office', // voir TRACKS dans src/app/audio.js
  name: 'Mon étape',
  subtitle: 'Lieu · jour, heure',
  keyLabel: 'Badge', // nom de l’objet clé dans le HUD
  rooms: ['Salle 1', 'Salle 2'], // une par tranche de 20 cases
  map: [/* 12 lignes */],
  lifts: [{ x: 23, y: 3, top: 6, w: 2, period: 4 }], // optionnel : nacelles verticales
  tips: [{ x0: 5, x1: 8, keys: 'Espace pour sauter', touch: 'SAUT pour sauter' }], // optionnel
  boss: { id: 'techServicesDirector', hp: 4, arena: [82, 98] }, // optionnel
  decor: [
    { type: 'poster', id: 'spark', x: 10, y: 4 },
    { type: 'plant', x: 14, y: 3 },
  ],
  lighting: {/* soleil, ciel, brouillard, fond : copier une étape existante */},
  intro: [{ who: 'partner', text: '…' }],
  outro: [{ who: 'hero', text: '…' }],
  bossIntro: [{ who: 'boss', text: '…' }], // avec un boss
  phaseLine: '…', // réplique du boss au passage en deuxième phase
};
```

- **Décor** : affiches (`id` parmi `POSTER_LIST` de `src/gfx/posters.js`), tableaux blancs, bureaux et accessoires (`PROP_IDS` de `src/gfx/props.js`).
- **Répliques** : `hero`, `partner` (l’autre héros), `boss`, `hint` (astuce) ou `narrator`.
- **Lumière** : copier les valeurs d’une étape au thème proche, puis ajuster.

## 3. Vérifier

```sh
npm run check
```

Les tests vérifient aussi les secrets et, pour une étape à boss, qu’il est possible de le convaincre sans prendre un seul coup. Si le solveur échoue, il indique où il est resté bloqué (`closest` dans `src/game/solver.js`). C’est presque toujours un saut trop long ou un mur de 2 cases.

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

### Règles de level design

- Un mur fait **1 case** (on saute) ou **au moins 3 cases** (on s’accroche) : 2 cases sont infranchissables pour Kévin, et un test le vérifie.
- Le saut simple monte d’environ 1,7 case et porte à environ 3,5 cases. Kévin attrape un rebord jusqu’à environ 4,5 cases au-dessus de ses pieds, Charline encore plus haut grâce au double saut.
- Un secret pour Charline : un rebord à 5 cases au-dessus du sol. Un secret pour Kévin : une niche fermée par des cartons `A`.
- Chaque piège doit se voir venir. Les pièges périodiques (tiroir, sprinkler, imprimante) se décalent selon leur colonne.

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
  lifts: [{ x: 23, y: 3, top: 6, w: 2, period: 4 }], // optionnel
  boss: { id: 'techServicesDirector', hp: 4, arena: [82, 98] }, // optionnel
  decor: [
    { type: 'poster', id: 'spark', x: 10, y: 4 },
    { type: 'plant', x: 14, y: 3 },
  ],
  lighting: {/* soleil, ciel, brouillard, fond : copier une étape existante */},
  intro: [{ who: 'partner', text: '…' }],
  outro: [{ who: 'hero', text: '…' }],
};
```

- **Décor** : affiches (`id` parmi `POSTER_LIST` de `src/gfx/posters.js`), tableaux blancs, bureaux et accessoires (`PROP_IDS` de `src/gfx/props.js`).
- **Répliques** : `hero`, `partner` (l’autre héros), `boss`, `hint` (astuce) ou `narrator`.
- **Lumière** : copier les valeurs d’une étape au thème proche, puis ajuster.

## 3. Vérifier

```sh
npm run check
```

Si le solveur échoue, il indique où il est resté bloqué (`closest` dans `src/game/solver.js`). C’est presque toujours un saut trop long ou un mur de 2 cases.

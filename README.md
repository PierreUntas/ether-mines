# Mines d'Éther

Un monde en blocs aux couleurs d'Ethereum, à construire entre amis dans le navigateur. On mine, on fabrique, on bâtit, et chaque bloc et chaque objet se comporte comme un jeton : miner frappe, poser brûle, et chaque bloc posé porte le nom de son auteur. Le monde est infini : le terrain se génère au fur et à mesure qu'on avance.

## Ce qu'il y a dedans

- **Monde** : généré à partir d'une graine fixe (plaines, forêts roses, dunes, sommets, lacs, océans, îles flottantes entre 43 et 57 de haut, grottes profondes avec géodes d'éther pur sous la couche 20), chargé par tronçons de 16 × 16 colonnes autour de chaque joueur, sur 64 blocs de haut.
- **Monde infini** : on peut marcher dans n'importe quelle direction jusqu'à 100 000 blocs du centre (bornes des règles de la base). La position et la distance au sanctuaire s'affichent en haut à gauche.
- **Parcelles** : dans le chat, `/parcelle` revendique le tronçon (16 × 16) où l'on se trouve pour 2 cristaux (16 au plus). Seuls le propriétaire et ses invités (`/inviter pseudo`, `/exclure pseudo`) peuvent y miner, construire et ouvrir les portes. `/liberer` rend la parcelle, `/parcelles` les liste. Des poteaux verts (les tiennes) ou roses (celles des autres) marquent les coins. Le sanctuaire est intouchable.
- **Se retrouver** : dans le chat, `/rejoindre pseudo` téléporte près d'un ami en ligne, `/sanctuaire` ramène au point de départ.
- **Construction** : béton pastel (8 couleurs), vitraux (4), dalles, escaliers orientés selon le regard, portes sur deux blocs (clic droit pour ouvrir). On monte sur les dalles et les marches sans sauter.
- **Contrats en blocs** : levier et plaque de pression (sources), câble d'éther, lampe et porte alimentées. Le courant est recalculé en continu autour du joueur et n'est jamais enregistré : seul l'état des leviers l'est. Une plaque s'active sous n'importe quel joueur, y compris un ami.
- **Progression** : un fil d'objectifs (bouton en haut de l'écran, touche O ou onglet Objectifs) et quatre paliers d'outils. La main ne taille pas la pierre ; la pioche en bois taille la pierre et le minerai ; la pioche de cristal (objet unique) ouvre les géodes ; la pioche d'éther pur (objet unique) taille la roche de genèse, au fond du monde, qui donne des fragments de genèse. Avec un fragment, des éclats et des cristaux, on forge un cœur de validateur.
- **Validateurs anciens** : une ruine avec un validateur éteint par région de 80 × 80 blocs (la première à une quarantaine de mètres du sanctuaire). La boussole de l'objectif mène à la plus proche. Le rallumer avec un cœur le met à ton nom : 3 cristaux par slot de 12 s, et un sceau de validateur (objet unique) en souvenir.
- **Animaux** : moutons d'éther (plaines), lapins (dunes, plaines, forêts), renards roses (forêts), poissons prisme (océans), méduses célestes (autour des îles flottantes). Clic droit ou toucher bref pour les caresser : une fois par jour, un mouton offre de la laine d'éther (bloc), un renard une fleur, une méduse un éclat pur. Ils sont placés et déplacés à partir de la graine et de l'heure : tous les joueurs les voient au même endroit, sans échange réseau.
- **Rendu** : Three.js r128, textures pixel art générées en code, ombres portées (désactivées sur mobile), cycle jour et nuit de 8 minutes, blocs lumineux la nuit, eau qui ondule, lucioles la nuit, effet de pose, avatars qui respirent et se balancent en marchant.
- **Son** : entièrement synthétisé dans `src/audio.js` (Web Audio, aucun fichier) : pas et coups selon la matière, cassures, poses, déclics des contrats, nappe musicale, oiseaux le jour, grillons la nuit, gouttes sous terre. Touche M ou bouton ♪ pour couper ; le choix est gardé dans le navigateur (`ether-mines:son`).
- **Multijoueur** : les autres joueurs apparaissent avec leur pseudo, les blocs se synchronisent en direct, un chat (Entrée) et la liste des joueurs en ligne.
- **Jetons (simulés)** : coffre avec fiches de jetons (ERC-1155 pour les ressources, ERC-721 pour la Pioche de cristal), atelier, registre des frappes et brûlages, vue registre (T) qui surligne tes blocs.

Rien n'est inscrit sur une vraie blockchain pour l'instant.

## Stack

- HTML, CSS et JavaScript natifs, sans framework ni étape de build.
- [Supabase](https://supabase.com) : Auth (comptes invités), Realtime (présence, positions, changements de blocs et de parcelles), Postgres (monde, coffres, règles, fonctions d'arbitrage) et une fonction Edge (`figer`).
- Hébergement statique sur Vercel.

### Le serveur fait autorité

Les joueurs ne peuvent rien écrire directement : ni blocs, ni terrain, ni coffre. Chaque action passe par une fonction SQL `act_*` qui vérifie les règles puis applique :

| Action | Ce que le serveur vérifie |
| --- | --- |
| `act_mine` | bloc réel à cet endroit, outil possédé et de palier suffisant, rythme de minage plausible, zone non protégée ; tire le butin lui-même |
| `act_place` | objet présent dans le coffre, transformation autorisée (escalier orienté, porte), case libre, support correct, zone non protégée |
| `act_toggle` | porte ou levier réel, zone non protégée |
| `act_craft` | recette connue du serveur, ingrédients présents |
| `act_relight` | validateur éteint réel, cœur de validateur dans le coffre |
| `act_gift` | une fois par jour et par animal, 15 cadeaux par jour au plus |
| `act_rewards` | validateurs signés par le joueur, temps écoulé (30 minutes rattrapées au plus) |
| `act_claim`, `act_unclaim`, `act_member` | parcelles : coût, limite, propriétaire |

Le terrain d'origine d'un tronçon est généré **côté serveur** par la fonction Edge `figer`, avec le même générateur que le jeu (`supabase/functions/_shared/world.js`) : impossible d'inventer du terrain. Les règles (blocs, outils, recettes) viennent de `supabase/functions/_shared/rules.js`, partagé par le jeu ; `node tools/regles.mjs > supabase/regles.sql` les transforme en tables SQL.

Le jeu montre le résultat tout de suite et le serveur confirme : en cas de refus, le bloc revient et le coffre est relu depuis le serveur.

```
index.html              structure de la page
src/style.css           interface
src/config.js           URL et clé publique Supabase (vide = mode solo)
src/net.js              couche réseau (Supabase)
src/game.js             rendu, joueur, interface, jetons, contrats, animaux, parcelles, joueurs distants, chat
src/audio.js            sons génératifs (Web Audio)
supabase/functions/_shared/world.js   générateur du monde (jeu et serveur)
supabase/functions/_shared/rules.js   blocs, objets, paliers, recettes (jeu et serveur)
supabase/functions/figer/             fonction Edge : génère et fige le terrain d'un tronçon
supabase/migrations/    schéma de la base, fonctions d'arbitrage act_*
supabase/regles.sql     règles du jeu en SQL (généré par tools/regles.mjs)
supabase/reset.sql      remise à zéro complète (monde, parties, comptes invités)
tools/regles.mjs        génère supabase/regles.sql
```

## Mise en ligne

1. **Supabase** : crée un projet gratuit sur supabase.com.
2. **Comptes invités** : dans *Authentication → Sign In / Providers*, active *Allow anonymous sign-ins*. Chaque joueur reçoit un compte automatiquement, sans email ni mot de passe.
3. **Base** : dans *SQL Editor*, lance `supabase/migrations/001_schema.sql`, puis `supabase/regles.sql`.
4. **Fonction `figer`** (une fois, puis à chaque changement du générateur) :
   ```
   npx supabase login
   npx supabase functions deploy figer --project-ref <identifiant du projet> --use-api
   ```
   Ou automatiquement : ajoute au dépôt GitHub les secrets `SUPABASE_ACCESS_TOKEN` (supabase.com → *Account → Access Tokens*) et `SUPABASE_PROJECT_REF` ; le workflow `.github/workflows/supabase-functions.yml` redéploie la fonction à chaque push qui la touche.
5. **Clés** : dans *Project Settings → API*, copie l'URL du projet et la clé `anon` publique dans `src/config.js`. Cette clé est faite pour être publique : ce sont les règles des migrations qui protègent la base.
6. **Vercel** : importe le dépôt (*Add New → Project*), sans réglage particulier (site statique). Chaque push sur `main` redéploie.
7. **Jouer** : ouvre le site, choisis un pseudo. Le lien contient le nom du monde (`?monde=principal`) ; envoie-le à tes amis. Un autre nom de monde donne un monde vierge séparé.

Sans clés dans `src/config.js`, le jeu tourne en solo et sauvegarde dans le navigateur.

Pour tout effacer et repartir de zéro :
1. lancer `supabase/reset.sql`, puis `001_schema.sql` et `regles.sql` ;
2. augmenter `SAISON` dans `src/game.js` et publier : les parties gardées dans les navigateurs sont effacées au prochain chargement (pseudo et réglage du son conservés).

## Ce qui est sauvegardé où

| Donnée | Où |
| --- | --- |
| Terrain d'origine des tronçons touchés | Supabase, table `chunks` (généré et écrit par la fonction `figer`, jamais modifié) |
| Blocs modifiés (x, y, z), auteur et numéro de série | Supabase, table `blocks` (écrite par les fonctions `act_*`) |
| Parcelles | Supabase, table `claims` |
| Coffre | Supabase, table `inventory` (lecture seule pour le joueur) |
| Objets uniques (pioches, sceaux) | Supabase, table `uniques` (lecture seule pour le joueur) |
| Règles du jeu | Supabase, tables `rule_*` (depuis `regles.sql`) |
| Préférences de partie : barre, position, objectifs vus, registre | Supabase, table `players`, colonne `state` (seule partie modifiable par le joueur) ; copie dans le navigateur (`ether-mines:<monde>`) |
| Positions, chat, présence | Supabase Realtime (rien n'est gardé) |
| Compte invité | Supabase Auth ; la session est gardée par le navigateur (`ether-mines:session`) |
| Codes de sauvegarde | Supabase, table `recovery` (empreinte SHA-256 seulement, jamais le code) |
| Pseudo, couleur, identifiant | Navigateur (`ether-mines:profil`) |
| Son activé ou coupé | Navigateur (`ether-mines:son`) |
| Courant dans les câbles, lampes et portes | Nulle part : recalculé à partir des leviers et des plaques |

## Faire évoluer le jeu sans perdre les parties

Le monde d'un joueur, c'est trois couches superposées :

1. **Le générateur** (`genChunk()` dans `supabase/functions/_shared/world.js`), qui dessine un tronçon à partir de la graine et de ses coordonnées.
2. **Les tronçons figés** (table `chunks`) : dès qu'un bloc est modifié dans un tronçon, son terrain d'origine est enregistré tel quel. Il ne dépend plus jamais du générateur.
3. **Les modifications** (table `blocks`), en coordonnées x, y, z, par-dessus.

Au chargement d'un tronçon : terrain figé s'il existe, sinon générateur ; puis modifications. Les zones construites ne bougent jamais, et les zones vierges profitent du générateur le plus récent, comme les chunks de Minecraft.

### Ce qu'on peut changer librement

- **Le générateur** (relief, biomes, arbres, grottes, minerais) : augmenter `GEN` à chaque changement de terrain, puis redéployer la fonction `figer` (automatique avec le workflow GitHub). Seuls les tronçons jamais touchés changent. Un raccord peut apparaître entre un tronçon figé et un tronçon régénéré (petite marche, demi-arbre).
- Nouveaux blocs, objets, recettes (dans `rules.js`) : relancer `node tools/regles.mjs > supabase/regles.sql` puis exécuter `regles.sql` dans Supabase, sinon le serveur refusera les nouveautés.
- Mécaniques, interface, rendu.

### Ce qu'il ne faut jamais faire

- **Renuméroter ou supprimer un type de bloc** (les numéros de `B` et `ITEM`) : seulement en ajouter.
- **Déplacer l'origine** ou le point d'apparition (`SPAWN`) : les coordonnées enregistrées en dépendent.
- **Changer la taille des tronçons** (`CH = 16`) ou la hauteur (`SY`) sans convertir la table `chunks`.
- **Réécrire ou supprimer des lignes** de `chunks` ou `blocks` dans une migration.
- **Renommer les clés `localStorage`** (`ether-mines:<monde>`, `ether-mines:profil`).

### Faire une mise à jour

1. **Base** : si la base change, ajouter `supabase/migrations/00N_description.sql`, uniquement additif (nouvelles tables, nouvelles colonnes avec valeur par défaut). Exporter les tables en CSV depuis le *Table Editor* avant une grosse migration.
2. **Sauvegarde locale** : si la forme de l'état `S` change, augmenter `SAVE_V` et ajouter une étape dans `migrateSave()`. Les champs nouveaux peuvent simplement être ajoutés à `S0()`.
3. **Tester** : pousser sur une branche. Vercel donne une URL de prévisualisation, à tester sur un monde jetable (`?monde=test`). La base est la même que la production : ne jamais tester sur `principal`.
4. **Publier** : lancer la migration SQL s'il y en a une, puis fusionner dans `main`. Les joueurs déjà connectés doivent recharger la page.

## Comptes et codes de sauvegarde

- Au premier passage, le jeu crée un compte invité et y enregistre la partie toutes les 5 secondes, à la pause et quand on quitte la page.
- Sur l'écran titre, *Compte → Afficher mon code de sauvegarde* donne un code du type `4FC0-B18D-A98D-75EF`. Sur un autre appareil (ou après avoir vidé le navigateur), le saisir dans *Récupérer ma partie* rattache la partie et les blocs signés à ce nouvel appareil.
- Le code rattache tout ce que possède l'ancien compte : parties, coffres, objets uniques, blocs signés, parcelles.

## Tester

Les tests tournent automatiquement sur GitHub à chaque push (onglet *Actions*, workflow *Tests*). Un push qui casse quelque chose apparaît en rouge.

- **Générateur et règles** (sans base) : `node --test tests/*.test.mjs`. Vérifie que le monde est déterministe, l'encodage des tronçons, le sanctuaire et la première ruine, la cohérence des recettes, et que `supabase/regles.sql` est à jour avec `rules.js`.
- **Schéma et arbitrage** : `PGHOST=… PGUSER=postgres tests/sql/run.sh` sur un Postgres 16 vide (une base `mines_test` est recréée). Installe le schéma deux fois, les règles, des tronçons générés par le vrai générateur, puis joue une quarantaine de scénarios : lecture du terrain par le serveur identique au générateur, minage, paliers d'outils, rythme, pose, portes, fabrication, parcelles, invitations, ruines, cadeaux, récompenses, récupération de partie, et toutes les tentatives de triche directe (écrire un bloc, se donner des objets, inventer du terrain…). Vérifie enfin que `reset.sql` efface tout.
- **Dans le navigateur** : ouvrir `index.html#debug` expose `window.mines` dans la console (dont `serverAct(nom, arguments)`, `syncInventory()`, `get(x, y, z)`, `P` le joueur, `S.day` l'heure).

## Limites connues

- Le serveur ne connaît pas la position des joueurs : il ne vérifie pas qu'un bloc miné est à portée de main. Un tricheur peut miner à distance (au rythme normal, avec ses outils, hors des parcelles des autres).
- Les objectifs sont suivis dans le navigateur ; ils ne donnent aucune récompense, donc rien à y gagner en trichant.
- Les animaux et les cadeaux ne sont pas vérifiés un par un (le serveur limite à 15 cadeaux par jour).
- Le chat n'est pas modéré.
- Pour aller vers de vrais jetons : ne frapper onchain que les objets qui ont de la valeur ou une histoire (objets uniques, parcelles), à partir des tables `uniques` et `claims`, qui sont déjà la source de vérité.
- Offre gratuite de Supabase : projet mis en pause après une semaine sans activité, 2 millions de messages temps réel par mois (les positions sont limitées à 5 envois par seconde et par joueur, seulement quand il bouge).

## Commandes

- ZQSD ou flèches : marcher · Maj : courir · Espace : sauter
- Clic gauche maintenu : miner · clic droit : poser
- Clic droit sur une porte ou un levier : l'actionner
- 1 à 9, molette : barre d'objets · E : coffre et atelier · T : vue registre · M : son · Entrée : chat (`/rejoindre pseudo`, `/sanctuaire`, `/parcelle`, `/liberer`, `/inviter pseudo`, `/exclure pseudo`, `/parcelles`)
- Mobile (disposition de Minecraft mobile) : croix à gauche pour marcher, glisser pour regarder, toucher long pour miner, toucher bref pour poser ou actionner ; à droite, sauter (↑), courir (», reste actif jusqu'à l'arrêt) et s'accroupir (↓ : plus lent, ne tombe pas des bords, descend dans l'eau) ; en haut, coffre, chat et menu ; « … » au bout de la barre ouvre le coffre
- Clavier : C ou Ctrl pour s'accroupir

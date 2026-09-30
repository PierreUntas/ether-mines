# Mines d'Éther

Un monde en blocs aux couleurs d'Ethereum, à construire entre amis dans le navigateur. On mine, on fabrique, on bâtit, et chaque bloc et chaque objet se comporte comme un jeton : miner frappe, poser brûle, et chaque bloc posé porte le nom de son auteur. Le monde est infini : le terrain se génère au fur et à mesure qu'on avance.

## Ce qu'il y a dedans

- **Monde** : généré à partir d'une graine fixe (plaines, forêts roses, dunes, sommets, lacs, océans, îles flottantes entre 31 et 45 de haut, grottes profondes avec géodes d'éther pur), chargé par tronçons de 16 × 16 colonnes autour de chaque joueur, sur 48 blocs de haut.
- **Monde infini** : on peut marcher dans n'importe quelle direction jusqu'à 100 000 blocs du centre (limite fixée par les règles de la base). La position et la distance au sanctuaire s'affichent en haut à gauche.
- **Se retrouver** : dans le chat, `/rejoindre pseudo` téléporte près d'un ami en ligne, `/sanctuaire` ramène au point de départ.
- **Frontière (désactivée)** : option `FRONTIERE` dans `src/game.js`. Le monde démarre à 7 × 7 tronçons et chaque palier de blocs posés par la communauté ajoute un anneau (300, 900, 1 800… blocs). Le compteur tourne déjà côté base, dans la table `worlds`.
- **Construction** : béton pastel (8 couleurs), vitraux (4), dalles, escaliers orientés selon le regard, portes sur deux blocs (clic droit pour ouvrir). On monte sur les dalles et les marches sans sauter.
- **Contrats en blocs** : levier et plaque de pression (sources), câble d'éther, lampe et porte alimentées. Le courant est recalculé en continu autour du joueur et n'est jamais enregistré : seul l'état des leviers l'est. Une plaque s'active sous n'importe quel joueur, y compris un ami.
- **Rendu** : Three.js r128, textures pixel art générées en code, ombres portées (désactivées sur mobile), cycle jour et nuit de 8 minutes, blocs lumineux la nuit, eau qui ondule, lucioles la nuit, effet de pose, avatars qui respirent et se balancent en marchant.
- **Son** : entièrement synthétisé dans `src/audio.js` (Web Audio, aucun fichier) : pas et coups selon la matière, cassures, poses, déclics des contrats, nappe musicale, oiseaux le jour, grillons la nuit, gouttes sous terre. Touche M ou bouton ♪ pour couper ; le choix est gardé dans le navigateur (`ether-mines:son`).
- **Multijoueur** : les autres joueurs apparaissent avec leur pseudo, les blocs se synchronisent en direct, un chat (Entrée) et la liste des joueurs en ligne.
- **Jetons (simulés)** : coffre avec fiches de jetons (ERC-1155 pour les ressources, ERC-721 pour la Pioche de cristal), atelier, registre des frappes et brûlages, vue registre (T) qui surligne tes blocs.

Rien n'est inscrit sur une vraie blockchain pour l'instant.

## Stack

- HTML, CSS et JavaScript natifs, sans framework ni étape de build.
- [Supabase](https://supabase.com) : Realtime (présence, diffusion, changements de la table `worlds`) et trois tables.
- Hébergement statique sur Vercel.

```
index.html              structure de la page
src/style.css           interface
src/config.js           URL et clé publique Supabase (vide = mode solo)
src/net.js              couche réseau (Supabase)
src/game.js             monde, génération, rendu, joueur, jetons, contrats, joueurs distants, chat
src/audio.js            sons génératifs (Web Audio)
supabase/migrations/    schéma de la base, en migrations numérotées
supabase/reset.sql      remise à zéro complète (supprime tout)
```

## Mise en ligne

1. **Supabase** : crée un projet gratuit sur supabase.com.
2. **Base** : dans *SQL Editor*, lance les fichiers de `supabase/migrations/` dans l'ordre (001, puis les suivants).
3. **Clés** : dans *Project Settings → API*, copie l'URL du projet et la clé `anon` publique dans `src/config.js`. Cette clé est faite pour être publique : ce sont les règles des migrations qui protègent la base.
4. **Vercel** : importe le dépôt (*Add New → Project*), sans réglage particulier (site statique). Chaque push sur `main` redéploie.
5. **Jouer** : ouvre le site, choisis un pseudo. Le lien contient le nom du monde (`?monde=principal`) ; envoie-le à tes amis. Un autre nom de monde donne un monde vierge séparé.

Sans clés dans `src/config.js`, le jeu tourne en solo et sauvegarde dans le navigateur.

Pour tout effacer et repartir de zéro : lancer `supabase/reset.sql`, puis les migrations.

## Ce qui est sauvegardé où

| Donnée | Où |
| --- | --- |
| Total de blocs posés (et rayon de frontière, si l'option est activée) | Supabase, table `worlds` (mise à jour par un déclencheur, jamais par les clients) |
| Terrain d'origine des tronçons touchés | Supabase, table `chunks` (écrit une fois, jamais modifié) |
| Blocs modifiés (x, y, z), auteur et numéro de série | Supabase, table `blocks` |
| Positions, chat, présence | Supabase Realtime (rien n'est gardé) |
| Inventaire, registre, objets uniques, position | Navigateur de chaque joueur (`localStorage`, clé `ether-mines:<monde>`) |
| Pseudo, couleur, identifiant | Navigateur (`ether-mines:profil`) |
| Son activé ou coupé | Navigateur (`ether-mines:son`) |
| Courant dans les câbles, lampes et portes | Nulle part : recalculé à partir des leviers et des plaques |

## Faire évoluer le jeu sans perdre les parties

Le monde d'un joueur, c'est trois couches superposées :

1. **Le générateur** (`genChunk()` dans `src/game.js`), qui dessine un tronçon à partir de la graine et de ses coordonnées.
2. **Les tronçons figés** (table `chunks`) : dès qu'un bloc est modifié dans un tronçon, son terrain d'origine est enregistré tel quel. Il ne dépend plus jamais du générateur.
3. **Les modifications** (table `blocks`), en coordonnées x, y, z, par-dessus.

Au chargement d'un tronçon : terrain figé s'il existe, sinon générateur ; puis modifications. Les zones construites ne bougent jamais, et les zones vierges profitent du générateur le plus récent, comme les chunks de Minecraft.

### Ce qu'on peut changer librement

- **Le générateur** (relief, biomes, arbres, grottes, minerais) : augmenter `GEN` à chaque changement de terrain. Seuls les tronçons jamais touchés changent. Un raccord peut apparaître entre un tronçon figé et un tronçon régénéré (petite marche, demi-arbre).
- **La frontière** : `FRONTIERE` dans `src/game.js`. Paliers dans `on_block_placed()` (migration SQL) et dans `radiusFor()` côté client, à garder identiques.
- Nouveaux blocs, objets, recettes, mécaniques, interface, rendu.

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

## Tester

Ouvrir `index.html#debug` expose `window.mines` dans la console : `get(x, y, z)`, `CHK` (tronçons chargés), `frozen`, `genChunk(cx, cz)`, `commit(...)`, `P` (le joueur, déplaçable : `mines.P.x = 500`), `R` (rayon de la frontière, `Infinity` en monde infini), `S.day` (heure : `mines.S.day = .9` pour la nuit), `POWERED` (blocs alimentés), `islandTop(x, z)`.

## Limites connues

- Chaque client fait autorité : n'importe qui ayant le lien peut modifier le monde. C'est fait pour jouer entre amis, pas pour un serveur public.
- Les inventaires sont locaux : changer de navigateur fait repartir d'un coffre vide.
- Pour aller vers de vrais jetons, il faudra d'abord déplacer les inventaires côté serveur (source de vérité), puis ne frapper onchain que les objets qui ont de la valeur ou une histoire (objets uniques, constructions, parcelles), pas chaque bloc.

## Commandes

- ZQSD ou flèches : marcher · Maj : courir · Espace : sauter
- Clic gauche maintenu : miner · clic droit : poser
- Clic droit sur une porte ou un levier : l'actionner
- 1 à 9, molette : barre d'objets · E : coffre et atelier · T : vue registre · M : son · Entrée : chat (`/rejoindre pseudo`, `/sanctuaire`)
- Mobile : pouce en bas à gauche pour marcher, glisser pour regarder, toucher long pour miner (là où touche le doigt), toucher bref pour poser, ouvrir une porte ou actionner un levier, bouton Saut à gauche, boutons Coffre et Chat à droite

# Mines d'Éther

Un monde en blocs aux couleurs d'Ethereum, à construire entre amis dans le navigateur. On mine, on fabrique, on bâtit, et chaque bloc et chaque objet se comporte comme un jeton : miner frappe, poser brûle, et chaque bloc posé porte le nom de son auteur. Le monde démarre petit : sa frontière recule à mesure que la communauté construit.

## Ce qu'il y a dedans

- **Monde** : généré à partir d'une graine fixe (plaines, forêts roses, dunes, sommets, grottes, lacs), chargé par tronçons de 16 × 16 colonnes autour de chaque joueur, sur 48 blocs de haut.
- **Frontière** : le monde fait d'abord 7 × 7 tronçons autour du sanctuaire. Chaque palier de blocs posés par l'ensemble des joueurs ajoute un anneau (300, 900, 1 800, 3 000… blocs), jusqu'à 121 × 121 tronçons. Un mur de lumière marque la limite, et une jauge indique le prochain palier.
- **Rendu** : Three.js r128, textures pixel art générées en code, ombres portées (désactivées sur mobile), cycle jour et nuit de 8 minutes, blocs lumineux la nuit.
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
src/game.js             monde, génération, rendu, joueur, jetons, frontière, joueurs distants, chat
supabase/migrations/    schéma de la base, en migrations numérotées
supabase/reset.sql      remise à zéro complète (supprime tout)
```

## Mise en ligne

1. **Supabase** : crée un projet gratuit sur supabase.com.
2. **Base** : dans *SQL Editor*, lance les fichiers de `supabase/migrations/` dans l'ordre (001, puis les suivants).
3. **Clés** : dans *Project Settings → API*, copie l'URL du projet et la clé `anon` publique dans `src/config.js`. Cette clé est faite pour être publique : ce sont les règles des migrations qui protègent la base.
4. **Vercel** : importe le dépôt (*Add New → Project*), sans réglage particulier (site statique). Chaque push sur `main` redéploie.
5. **Jouer** : ouvre le site, choisis un pseudo. Le lien contient le nom du monde (`?monde=principal`) ; envoie-le à tes amis. Un autre nom de monde donne un monde vierge séparé, avec sa propre frontière.

Sans clés dans `src/config.js`, le jeu tourne en solo et sauvegarde dans le navigateur.

Pour tout effacer et repartir de zéro : lancer `supabase/reset.sql`, puis les migrations.

## Ce qui est sauvegardé où

| Donnée | Où |
| --- | --- |
| Taille de la frontière, total de blocs posés | Supabase, table `worlds` (mise à jour par un déclencheur, jamais par les clients) |
| Terrain d'origine des tronçons touchés | Supabase, table `chunks` (écrit une fois, jamais modifié) |
| Blocs modifiés (x, y, z), auteur et numéro de série | Supabase, table `blocks` |
| Positions, chat, présence | Supabase Realtime (rien n'est gardé) |
| Inventaire, registre, objets uniques, position | Navigateur de chaque joueur (`localStorage`, clé `ether-mines:<monde>`) |
| Pseudo, couleur, identifiant | Navigateur (`ether-mines:profil`) |

## Faire évoluer le jeu sans perdre les parties

Le monde d'un joueur, c'est trois couches superposées :

1. **Le générateur** (`genChunk()` dans `src/game.js`), qui dessine un tronçon à partir de la graine et de ses coordonnées.
2. **Les tronçons figés** (table `chunks`) : dès qu'un bloc est modifié dans un tronçon, son terrain d'origine est enregistré tel quel. Il ne dépend plus jamais du générateur.
3. **Les modifications** (table `blocks`), en coordonnées x, y, z, par-dessus.

Au chargement d'un tronçon : terrain figé s'il existe, sinon générateur ; puis modifications. Les zones construites ne bougent jamais, et les zones vierges profitent du générateur le plus récent, comme les chunks de Minecraft.

### Ce qu'on peut changer librement

- **Le générateur** (relief, biomes, arbres, grottes, minerais) : augmenter `GEN` à chaque changement de terrain. Seuls les tronçons jamais touchés changent. Un raccord peut apparaître entre un tronçon figé et un tronçon régénéré (petite marche, demi-arbre).
- **Les règles de la frontière** : paliers dans `on_block_placed()` (migration SQL) et dans `radiusFor()` côté client, à garder identiques.
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

Ouvrir `index.html#debug` expose `window.mines` dans la console : `get(x, y, z)`, `CHK` (tronçons chargés), `frozen`, `genChunk(cx, cz)`, `commit(...)`, `P` (le joueur), `R` (rayon de la frontière).

## Limites connues

- Chaque client fait autorité : n'importe qui ayant le lien peut modifier le monde (et faire avancer la frontière en posant des blocs). C'est fait pour jouer entre amis, pas pour un serveur public.
- Les inventaires sont locaux : changer de navigateur fait repartir d'un coffre vide.
- Pour aller vers de vrais jetons, il faudra d'abord déplacer les inventaires côté serveur (source de vérité), puis ne frapper onchain que les objets qui ont de la valeur ou une histoire (objets uniques, constructions, parcelles), pas chaque bloc.

## Commandes

- ZQSD ou flèches : marcher · Maj : courir · Espace : sauter
- Clic gauche maintenu : miner · clic droit : poser
- 1 à 9, molette : barre d'objets · E : coffre et atelier · T : vue registre · Entrée : chat
- Mobile : pouce gauche pour marcher, glisser à droite pour regarder, boutons Miner, Poser, Saut, Coffre, Chat

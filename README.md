# Mines d'Éther

Un monde en blocs aux couleurs d'Ethereum, à construire entre amis dans le navigateur. On mine, on fabrique, on bâtit, et chaque bloc et chaque objet se comporte comme un jeton : miner frappe, poser brûle, et chaque bloc posé porte le nom de son auteur.

## Ce qu'il y a dedans

- **Monde** : 96 × 48 × 96 blocs générés à partir d'une graine fixe (plaines, forêts roses, dunes, sommets, grottes, lacs). Tous les joueurs ont le même terrain ; seules les modifications sont stockées.
- **Rendu** : Three.js r128, textures pixel art générées en code, ombres portées (désactivées sur mobile), cycle jour et nuit de 8 minutes, blocs lumineux la nuit.
- **Multijoueur** : les autres joueurs apparaissent avec leur pseudo, les blocs cassés ou posés se synchronisent en direct, un chat (touche Entrée) et la liste des joueurs en ligne.
- **Jetons (simulés)** : coffre avec fiches de jetons (ERC-1155 pour les ressources, ERC-721 pour la Pioche de cristal), atelier, registre des frappes et brûlages, vue registre (touche T) qui surligne tes blocs.

Rien n'est inscrit sur une vraie blockchain pour l'instant.

## Stack

- HTML, CSS et JavaScript natifs, sans framework ni étape de build.
- [Supabase](https://supabase.com) : Realtime (présence et diffusion) pour les positions, les blocs et le chat ; une table `blocks` pour garder le monde.
- Hébergement statique sur Vercel.

```
index.html            structure de la page
src/style.css         interface
src/config.js         URL et clé publique Supabase (vide = mode solo)
src/net.js            couche réseau (Supabase)
src/game.js           monde, rendu, joueur, jetons, joueurs distants, chat
supabase/migrations/  schéma de la base, en migrations numérotées
```

## Mise en ligne

1. **Supabase** : crée un projet gratuit sur supabase.com.
2. **Base** : dans *SQL Editor*, lance les fichiers de `supabase/migrations/` dans l'ordre (001, 002…).
3. **Clés** : dans *Project Settings → API*, copie l'URL du projet et la clé `anon` publique dans `src/config.js`. Cette clé est faite pour être publique : ce sont les règles du schéma qui protègent la base.
4. **Vercel** : importe le dépôt (*Add New → Project*), sans réglage particulier (site statique). Chaque push sur `main` redéploie.
5. **Jouer** : ouvre le site, choisis un pseudo. Le lien contient le nom du monde (`?monde=principal`) ; envoie-le à tes amis. Un autre nom de monde donne un monde vierge séparé.

Sans clés dans `src/config.js`, le jeu tourne en solo et sauvegarde dans le navigateur.

## Ce qui est sauvegardé où

| Donnée | Où |
| --- | --- |
| Terrain d'origine des tronçons touchés (16 × 16 colonnes) | Supabase, table `chunks` (écrit une fois, jamais modifié) |
| Blocs modifiés (x, y, z), auteur et numéro de série | Supabase, table `blocks` (partagée) |
| Positions, chat, présence | Supabase Realtime (rien n'est gardé) |
| Inventaire, registre, objets uniques, position | Navigateur de chaque joueur (`localStorage`, clé `mines-ether:<monde>`) |
| Pseudo, couleur, identifiant | Navigateur (`mines-ether:profil`) |

## Faire évoluer le jeu sans perdre les parties

Le monde d'un joueur, c'est trois couches superposées :

1. **Le générateur** (`generate()` dans `src/game.js`), qui dessine le terrain à partir d'une graine.
2. **Les tronçons figés** (table `chunks`) : dès qu'un bloc est modifié dans un tronçon de 16 × 16 colonnes, son terrain d'origine est enregistré tel quel. Il ne dépend plus jamais du générateur.
3. **Les modifications** (table `blocks`), en coordonnées x, y, z, par-dessus.

Au chargement : on génère, on remplace par les tronçons figés, puis on applique les modifications. Les zones construites ne bougent donc jamais, et les zones vierges profitent du générateur le plus récent (comme les chunks de Minecraft).

### Ce qu'on peut changer librement

- **Le générateur** (relief, biomes, arbres, grottes, minerais) : augmenter `GEN` dans `src/game.js` à chaque changement de terrain. Seuls les tronçons jamais touchés changent. Un raccord peut apparaître entre un tronçon figé et un tronçon régénéré (petite falaise, demi-arbre).
- **Agrandir le monde** : les coordonnées ne dépendent plus de la taille. Garder l'origine (0, 0) et le point d'apparition au même endroit.
- Nouveaux blocs, objets, recettes, mécaniques, interface, rendu.

### Ce qu'il ne faut jamais faire

- **Renuméroter ou supprimer un type de bloc** (les numéros de `B` et `ITEM`) : seulement en ajouter. Un bloc retiré du jeu garde son numéro et devient au pire décoratif.
- **Réécrire ou supprimer des lignes** de `chunks` ou `blocks` dans une migration.
- **Renommer les clés `localStorage`** (`mines-ether:<monde>`, `mines-ether:profil`).
- **Changer la taille des tronçons** (`CH = 16`) ou la hauteur sans convertir `chunks`.

### Faire une mise à jour

1. **Base** : si la base change, ajouter un fichier `supabase/migrations/00N_description.sql`, uniquement additif (nouvelles tables, nouvelles colonnes avec valeur par défaut). L'exporter en CSV depuis le *Table Editor* avant une grosse migration.
2. **Sauvegarde locale** : si la forme de l'état `S` change, augmenter `SAVE_V` et ajouter une étape dans `migrateSave()`, qui convertit l'ancienne forme. Les champs nouveaux peuvent simplement être ajoutés à `S0()` : les anciennes sauvegardes les reçoivent avec leur valeur par défaut.
3. **Tester** : pousser sur une branche. Vercel donne une URL de prévisualisation, à tester sur un monde jetable (`?monde=test`). La base est la même que la production : ne jamais tester sur `principal`.
4. **Publier** : lancer la migration SQL s'il y en a une, puis fusionner la branche dans `main` (Vercel redéploie). Les joueurs déjà connectés doivent recharger la page.

## Limites connues

- Chaque client fait autorité : n'importe qui ayant le lien peut modifier le monde. C'est fait pour jouer entre amis, pas pour un serveur public.
- Les inventaires sont locaux : changer de navigateur fait repartir d'un coffre vide.
- Pour aller vers de vrais jetons, il faudra d'abord déplacer les inventaires côté serveur (source de vérité), puis ne frapper onchain que les objets qui ont de la valeur ou une histoire (objets uniques, constructions, parcelles), pas chaque bloc.

## Commandes

- ZQSD ou flèches : marcher · Maj : courir · Espace : sauter
- Clic gauche maintenu : miner · clic droit : poser
- 1 à 9, molette : barre d'objets · E : coffre et atelier · T : vue registre · Entrée : chat
- Mobile : pouce gauche pour marcher, glisser à droite pour regarder, boutons Miner, Poser, Saut, Coffre, Chat

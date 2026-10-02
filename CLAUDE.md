# Mines d'Éther — repères pour Claude Code

Jeu de blocs façon Minecraft dans l'univers Ethereum. Site statique (ether-mines.vercel.app) + Supabase. Le README décrit tout le jeu ; ce fichier ne garde que les règles de travail.

## Architecture
- **Client** : aucun build. Three.js r128, scripts classiques `src/jeu/NN-*.js` chargés dans l'ordre par `index.html` et partageant la portée globale (un test vérifie l'ordre). Modules partagés client/serveur : `supabase/functions/_shared/world.js` (générateur), `rules.js` (blocs, objets, recettes), `src/maillage.js`.
- **Serveur** : Supabase. Auth anonyme, RLS, fonctions `act_*` (security definer) qui arbitrent tout ; les fonctions `_*` sont internes. Edge Function `figer` (terrain), déployée par GitHub Actions.
- **Identité** : un pseudo unique par monde, lié à un compte anonyme Supabase (code de sauvegarde pour changer d'appareil). Pas de wallet obligatoire.

## Règles à ne jamais casser
- Les numéros de blocs sont **ajoutés à la fin, jamais réutilisés**, et un numéro de bloc ne doit jamais être celui d'un objet (objets : 101–105, 201–203).
- Ne jamais renommer une clé `localStorage`.
- Migrations SQL dans `supabase/migrations/NNN_*.sql` : **additives et rejouables** (create or replace, if not exists). Ne pas modifier une migration déjà publiée : en ajouter une.
- Après tout changement de règles ou de migration : `node tools/regles.mjs > supabase/regles.sql` puis `node tools/installation.mjs > supabase/installation.sql`. Toute nouvelle table doit aussi être effacée par `supabase/reset.sql`.
- Changer le terrain : augmenter `GEN` dans `world.js`. Changer `GRAINE` ou `SAISON` (`src/jeu/03-etat.js`) seulement avec une remise à zéro de la base.
- Le serveur ne fait jamais confiance au client : toute action qui donne ou déplace de la valeur passe par une fonction `act_*` avec `_rate` et les vérifications de position.
- Textes du jeu, commentaires et messages de commit en français. Réponses à Pierre en français, simples, sans jargon interne.

## Tests (tous doivent passer avant de pousser)
- `node --test tests/*.test.mjs`
- `tests/sql/run.sh` (Postgres 16 local ; variables PGHOST, PGPORT, PGUSER)
- `node tests/navigateur.mjs` (Playwright + Chromium, mode solo)
- `npx prettier@3 --check "src/jeu/*.js" "src/*.js" "supabase/functions/_shared/*.js"`

## Déploiement
- Pousser sur `main` déploie le site (Vercel) et la fonction `figer` (GitHub Actions).
- La base n'est pas déployée automatiquement : Pierre lance `supabase/installation.sql` dans le SQL Editor de Supabase.
- Ne jamais mettre de clé privée, de clé `service_role` ni de secret dans le dépôt. `src/config.js` ne contient que l'URL et la clé publique `anon`.

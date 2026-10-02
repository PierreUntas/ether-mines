-- 013 : identifiant du jeton Sceau une fois frappé. Calculé par le contrat au moment de la frappe
--   (uint256, dérivé de (monde, x, y, z)) ; gardé en texte côté base pour éviter toute perte de précision
--   en JavaScript, et pour que le jeu n'ait pas besoin de recalculer un hash pour lire l'état onchain.
--   Rempli par l'Edge Function « chaine » juste après une frappe réussie. Rejouable sans erreur.
alter table public.uniques add column if not exists token_id text;

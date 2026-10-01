-- REMISE À ZÉRO COMPLÈTE : supprime tous les mondes, tous les blocs, toutes les parties et les comptes invités.
-- Couvre aussi les tables des anciennes versions. Ensuite : lancer les migrations dans l'ordre puis regles.sql.

drop table if exists public.players, public.inventory, public.uniques, public.claims, public.recovery,
  public.legacy_claims, public.blocks, public.chunks, public.worlds,
  public.rule_blocks, public.rule_place, public.rule_items, public.rule_recipes, public.rate_limits,
  public.chat, public.reports, public.client_errors, public.chat_mots_bannis,
  public.daily, public.rule_defis cascade;

-- fonctions du jeu : act_*, outils internes _*, codes de sauvegarde, anciennes versions
do $$ declare f record; begin
  for f in select p.oid::regprocedure as sig from pg_proc p join pg_namespace s on s.oid = p.pronamespace
           where s.nspname = 'public' and (left(p.proname, 1) = '_' or left(p.proname, 4) = 'act_'
             or p.proname in ('set_recovery_code', 'claim_recovery', 'claim_legacy', 'on_block_placed', 'log_error')) loop
    execute format('drop function if exists %s cascade', f.sig);
  end loop;
end $$;

-- comptes invités (sans email) : ils n'ont plus de partie
delete from auth.users where is_anonymous;

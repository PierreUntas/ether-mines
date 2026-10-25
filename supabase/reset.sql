-- FULL RESET: deletes every world, every block, every game, and every guest account.
-- Also covers tables from older versions. The purchases paid with real money (billing.purchases,
-- 050_purchases.sql) are kept on purpose: each row keeps its nickname and email, to be handed back by hand. Next: run installation.sql (all migrations and rules in one file).

drop table if exists public.players, public.inventory, public.uniques, public.claims, public.recovery,
  public.legacy_claims, public.blocks, public.chunks, public.worlds,
  public.rule_blocks, public.rule_place, public.rule_items, public.rule_recipes, public.rate_limits,
  public.chat, public.reports, public.client_errors, public.chat_banned_words, public.chat_mots_bannis,
  public.daily, public.rule_defis, public.chests, public.offers,
  public.wallets, public.wallet_nonces, -- removed: the game no longer uses a real blockchain (see legacy/)
  public.validators, public.rule_cosmetics, public.rule_sets, public.cosmetics_owned,
  public.network_events, public.network_score, public.signs, public.sign_reports, public.block_history, public.game_servers, public.world_restores, public.logins, public.moved_accounts cascade; -- daily, rule_defis: removed challenge feature, dropped if still present

-- game functions: act_*, internal _* tools, recovery codes, older versions
do $$ declare f record; begin
  for f in select p.oid::regprocedure as sig from pg_proc p join pg_namespace s on s.oid = p.pronamespace
           where s.nspname = 'public' and (left(p.proname, 1) = '_' or left(p.proname, 4) = 'act_' or left(p.proname, 4) = 'srv_' or left(p.proname, 6) = 'admin_'
             or p.proname in ('set_recovery_code', 'claim_recovery', 'claim_legacy', 'on_block_placed', 'log_error',
               'pseudo_pris', 'is_username_taken', 'block_info')) loop
    execute format('drop function if exists %s cascade', f.sig);
  end loop;
end $$;

-- guest accounts (no email): they have no game left
delete from auth.users where is_anonymous;

-- 056: delete your account, from the game itself (the App Store and Google Play ask for it). Typing your
-- nickname confirms it. Your validators go back to dark ruins for anyone (their seals with them, whoever holds
-- them); the blocks you placed stay in the world but no longer carry your name, nor does the block history;
-- your days played and your error reports lose you; then the account itself goes, and with it, by cascade,
-- everything else that is yours in every world: your saves, bag, uniques, Gwei cosmetics, plots, chests'
-- ownership, chat lines, signs, trades, reports, nickname and password, recovery code. What the law keeps:
-- the purchases paid in euros (billing.purchases, 10 years, accounting), with the nickname and the old account
-- id they were bought with; that id is never given again, so no one else gets the pieces back.
-- Requires 046_logins.sql, 053_play_days.sql. Replayable without error.

create or replace function public.act_delete_account(confirm text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); lk text; v record; nv int := 0;
begin
  if me is null then raise exception 'not signed in'; end if;
  if not _rate(me, 'delete_account', 0.1, 2) then return _no('too many actions'); end if;
  select login_key into lk from logins where user_id = me;
  -- your nickname (any case), or "delete" for a guest game that never had one
  if lower(trim(coalesce(confirm, ''))) <> coalesce(lk, 'delete') then
    return _no('type your nickname to confirm');
  end if;
  for v in select id, world, x, y, z from validators where owner = me loop
    delete from uniques u where u.item = 203 and u.validator_id = v.id;
    update blocks b set id = 73, placed_by = null, placed_name = null
      where b.world = v.world and b.x = v.x and b.y = v.y and b.z = v.z and b.id in (13, 74);
    delete from validators where id = v.id;
    nv := nv + 1;
  end loop;
  update blocks set placed_by = null, placed_name = null where placed_by = me::text;
  update block_history set actor = null, actor_name = null where actor = me;
  update client_errors set user_id = null where user_id = me;
  delete from play_days where who = coalesce(lk, me::text) or who = me::text;
  delete from moved_accounts where old_id = me or lower(login) = lk;
  delete from auth.users where id = me;
  return jsonb_build_object('ok', true, 'validators', nv);
end $$;

do $$ declare f record; begin
  for f in select p.oid::regprocedure as sig, p.proname as name from pg_proc p join pg_namespace s on s.oid = p.pronamespace
           where s.nspname = 'public' and (left(p.proname, 1) = '_' or left(p.proname, 4) = 'act_') loop
    execute format('revoke all on function %s from public, anon, authenticated', f.sig);
    if left(f.name, 1) <> '_' then execute format('grant execute on function %s to authenticated', f.sig); end if;
  end loop;
end $$;

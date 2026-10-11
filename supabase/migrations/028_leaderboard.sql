-- 028: a world-visible leaderboard — Gwei earned, validators kept active, attacks repelled — rendered
-- on a monument in the City (src/game/04-render.js) instead of buried in a tab. Same poll-and-render
-- shape as the network's own shared-goal panel; the three numbers below are just new angles on data
-- that already exists (Gwei, validators, 027_network_attack.sql's defenses) plus one new cumulative
-- counter (gwei_earned: spending never lowers your rank, only earning raises it).
-- Requires 001_schema.sql, 002_security.sql, 007_network.sql, 019_gwei_currency.sql,
-- 020_validators.sql, 027_network_attack.sql. Replayable without error.

alter table public.players add column if not exists gwei_earned bigint not null default 0;
alter table public.players add column if not exists defenses_won int not null default 0;

-- gwei_earned only ever grows: spending (d < 0) still updates the live balance, never the rank.
create or replace function public._gwei(me uuid, w text, d bigint) returns bigint
language plpgsql security definer set search_path = public as $$
declare v bigint;
begin
  update players set gwei = gwei + d, gwei_earned = gwei_earned + greatest(d, 0)
    where user_id = me and world = w returning gwei into v;
  if v is null or v < 0 then raise exception 'not enough gwei'; end if;
  return v;
end $$;

-- a successful defense also counts toward each contributor's own tally, not just the Gwei/cosmetic payout.
create or replace function public._resolve_attack_windows(w text) returns void
language plpgsql security definer set search_path = public as $$
declare cur bigint; from_w bigint; wid bigint; ev network_events; uid text; cid smallint;
begin
  select (_attack_window()).window_id into cur;
  insert into network_score (world) values (w) on conflict do nothing;
  select last_resolved_window into from_w from network_score where world = w for update;
  from_w := greatest(from_w, cur - 24);
  for wid in from_w + 1 .. cur - 1 loop
    select * into ev from network_events where world = w and window_id = wid;
    if found and not ev.resolved then
      if ev.kills >= 20 then
        update network_score set score = score + 10 where world = w;
        for uid in select jsonb_object_keys(ev.participants) loop
          perform _gwei(uid::uuid, w, 50);
          update players set defenses_won = defenses_won + 1 where user_id = uid::uuid and world = w;
          select id into cid from rule_cosmetics where category = 'event' limit 1;
          if cid is not null then
            insert into cosmetics_owned (user_id, world, cosmetic_id) values (uid::uuid, w, cid) on conflict do nothing;
          end if;
        end loop;
      else
        update network_score set score = score + 1 where world = w;
      end if;
      update network_events set resolved = true where world = w and window_id = wid;
    elsif not found then
      update network_score set score = score + 1 where world = w;
    end if;
  end loop;
  update network_score set last_resolved_window = cur - 1 where world = w and cur - 1 > last_resolved_window;
end $$;

create or replace function public.act_leaderboard(w text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := _me_or_fail(w); gwei_top jsonb; validators_top jsonb; defenses_top jsonb;
begin
  if not _rate(me, 'leaderboard', 0.1, 3) then return _no('too many actions'); end if;
  select coalesce(jsonb_agg(jsonb_build_object('name', t.name, 'n', t.gwei_earned) order by t.gwei_earned desc), '[]'::jsonb) into gwei_top
    from (select coalesce(name, 'anonymous') as name, gwei_earned from players
          where world = w and gwei_earned > 0 order by gwei_earned desc limit 5) t;
  select coalesce(jsonb_agg(jsonb_build_object('name', t.name, 'n', t.c) order by t.c desc, t.name), '[]'::jsonb) into validators_top
    from (select coalesce(max(owner_name), 'anonymous') as name, count(*) as c from validators
          where world = w and owner is not null and state in ('active', 'damaged') group by owner order by count(*) desc limit 5) t;
  select coalesce(jsonb_agg(jsonb_build_object('name', t.name, 'n', t.defenses_won) order by t.defenses_won desc), '[]'::jsonb) into defenses_top
    from (select coalesce(name, 'anonymous') as name, defenses_won from players
          where world = w and defenses_won > 0 order by defenses_won desc limit 5) t;
  return jsonb_build_object('ok', true, 'gwei', gwei_top, 'validators', validators_top, 'defenses', defenses_top);
end $$;

do $$ declare f record; begin
  for f in select p.oid::regprocedure as sig, p.proname as name from pg_proc p join pg_namespace s on s.oid = p.pronamespace
           where s.nspname = 'public' and (left(p.proname, 1) = '_' or left(p.proname, 4) = 'act_') loop
    execute format('revoke all on function %s from public, anon, authenticated', f.sig);
    if left(f.name, 1) <> '_' then execute format('grant execute on function %s to authenticated', f.sig); end if;
  end loop;
end $$;

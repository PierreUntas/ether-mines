-- 004 : défis du jour, comptés et récompensés par le serveur.
--   Chaque action réussie (002 appelle _hook) fait avancer les compteurs du jour du joueur.
--   Trois défis par jour UTC, les mêmes pour tout le monde (liste dans rules.js → regles.sql, table rule_defis).
--   act_daily lit les défis du jour et la progression ; act_daily_claim verse la récompense, une fois par défi.
-- Rejouable sans erreur. Nécessite 002_securite.sql. Relancer regles.sql ensuite (il remplit rule_defis).

create table if not exists public.rule_defis (
  id      int  primary key,
  counter text not null,
  n       int  not null,
  title   text not null,
  reward  int  not null
);
alter table public.rule_defis enable row level security;
drop policy if exists "lire les défis" on public.rule_defis;
create policy "lire les défis" on public.rule_defis for select using (true);
revoke insert, update, delete on public.rule_defis from anon, authenticated;

create table if not exists public.daily (
  user_id uuid  not null references auth.users (id) on delete cascade,
  world   text  not null,
  day     date  not null,
  counts  jsonb not null default '{}'::jsonb,
  claimed int[] not null default '{}',
  primary key (user_id, world, day)
);
alter table public.daily enable row level security;
drop policy if exists "lire ses défis" on public.daily;
create policy "lire ses défis" on public.daily for select to authenticated using (auth.uid() = user_id);
revoke insert, update, delete on public.daily from anon, authenticated;

-- jour des défis : jours UTC écoulés depuis le 1er janvier 2026 (comme jourDefis() dans rules.js)
create or replace function public._jour_defis() returns int language sql stable as $$
  select ((now() at time zone 'utc')::date - date '2026-01-01')::int $$;

-- identifiants des trois défis du jour (comme defisDuJour() dans rules.js)
create or replace function public._defis_du_jour() returns int[]
language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(((((_jour_defis() * 7 + j * 5) % n.c) + n.c) % n.c) + 1 order by j), '{}')
  from (select count(*)::int as c from rule_defis) n, generate_series(0, 2) j
  where n.c > 0 $$;

-- Compteurs du jour : appelé après chaque action réussie.
create or replace function public._hook(me uuid, w text, kind text, res jsonb, args jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare d date := (now() at time zone 'utc')::date; inc jsonb := '{}'::jsonb;
begin
  case kind
    when 'mine' then
      inc := jsonb_build_object('mine', 1);
      if (res -> 'got' ->> 'n')::int > 0 then
        inc := inc || jsonb_build_object('got:' || (res -> 'got' ->> 'item'), (res -> 'got' ->> 'n')::int);
      end if;
    when 'place' then inc := jsonb_build_object('place', 1, 'place:' || (args ->> 'bid'), 1);
    when 'craft' then inc := jsonb_build_object('craft', 1, 'craft:' || (args ->> 'out'), 1);
    when 'gift' then inc := jsonb_build_object('gift', 1);
    when 'toggle' then inc := jsonb_build_object('toggle', 1);
    when 'relight' then inc := jsonb_build_object('relight', 1);
    else return;
  end case;
  insert into daily (user_id, world, day, counts) values (me, w, d, inc)
  on conflict (user_id, world, day) do update
    set counts = daily.counts || (select jsonb_object_agg(k, coalesce((daily.counts ->> k)::int, 0) + v::int) from jsonb_each_text(inc) e(k, v));
  if random() < 0.01 then delete from daily where day < d - 7; end if;
end $$;

-- Les défis du jour avec la progression du joueur.
create or replace function public.act_daily(w text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := _me_or_fail(w); dl daily; ids int[] := _defis_du_jour();
begin
  if not _rate(me, 'daily', 1, 6) then return _no('trop d''actions'); end if;
  select * into dl from daily where user_id = me and world = w and day = (now() at time zone 'utc')::date;
  return jsonb_build_object('ok', true, 'day', _jour_defis(), 'defis', coalesce((
    select jsonb_agg(jsonb_build_object('id', r.id, 'c', r.counter, 'n', r.n, 't', r.title, 'r', r.reward,
             'have', coalesce((dl.counts ->> r.counter)::int, 0), 'claimed', r.id = any (coalesce(dl.claimed, '{}')))
           order by array_position(ids, r.id))
    from rule_defis r where r.id = any (ids)), '[]'::jsonb));
end $$;

-- Toucher la récompense d'un défi du jour terminé.
create or replace function public.act_daily_claim(w text, defi int) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := _me_or_fail(w); r rule_defis; dl daily; inv jsonb := '{}'::jsonb;
begin
  if not _rate(me, 'daily', 1, 6) then return _no('trop d''actions'); end if;
  if not defi = any (_defis_du_jour()) then return _no('pas un défi du jour'); end if;
  select * into r from rule_defis where id = defi;
  select * into dl from daily where user_id = me and world = w and day = (now() at time zone 'utc')::date for update;
  if dl.user_id is null or coalesce((dl.counts ->> r.counter)::int, 0) < r.n then return _no('défi pas terminé'); end if;
  if defi = any (dl.claimed) then return _no('déjà touché'); end if;
  update daily set claimed = claimed || defi where user_id = me and world = w and day = dl.day;
  inv := _give(me, w, 101, r.reward, inv);
  return jsonb_build_object('ok', true, 'inv', inv, 'reward', r.reward);
end $$;

-- droits : seules les act_* sont appelables par les joueurs
do $$ declare f record; begin
  for f in select p.oid::regprocedure as sig, p.proname as name from pg_proc p join pg_namespace s on s.oid = p.pronamespace
           where s.nspname = 'public' and (left(p.proname, 1) = '_' or left(p.proname, 4) = 'act_') loop
    execute format('revoke all on function %s from public, anon, authenticated', f.sig);
    if left(f.name, 1) <> '_' then execute format('grant execute on function %s to authenticated', f.sig); end if;
  end loop;
end $$;

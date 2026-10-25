-- 053: who comes back. Each day a player enters a world, one row (act_seen, called by the game when you
-- enter: the web, the apps), keyed by their nickname so a game moved to another device stays one player.
-- The views below answer the launch's only question: of the players who came for the first time on a
-- day, how many came back the next day (D1) and a week later (D7), by platform. They are read by hand in
-- Supabase's SQL Editor (select * from public.retention_summary), never by the game: no access for anon or
-- authenticated. Nothing here moves value. Wiped by reset.sql. Replayable.

create table if not exists public.play_days (
  world    text not null,
  who      text not null,            -- the nickname, lowercased (or the account id before one is chosen)
  day      date not null,            -- UTC
  platform text not null,            -- web, web-mobile, ios, android, mac, pc, editor, other
  primary key (world, who, day)
);
alter table public.play_days enable row level security; -- no policy: only the functions below write it

create or replace function public.act_seen(w text, platform text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  nm text;
  p text := case when platform in ('web', 'web-mobile', 'ios', 'android', 'mac', 'pc', 'editor') then platform else 'other' end;
begin
  if me is null or w is null then return jsonb_build_object('ok', false); end if;
  if not _rate(me, 'seen', 0.2, 5) then return jsonb_build_object('ok', false); end if;
  select lower(name) into nm from players where user_id = me and world = w;
  insert into play_days (world, who, day, platform)
  values (w, coalesce(nm, me::text), (now() at time zone 'utc')::date, p)
  on conflict (world, who, day) do nothing;
  return jsonb_build_object('ok', true);
end $$;
revoke all on function public.act_seen(text, text) from public;
grant execute on function public.act_seen(text, text) to authenticated, anon;

-- by first day and platform (the one they first came on): how many, and how many came back on day 1 and day 7
create or replace view public.retention as
with firsts as (
  select distinct on (world, who) world, who, day as d0, platform
  from play_days order by world, who, day
)
select f.world, f.d0 as first_day, f.platform, count(*) as players,
  count(*) filter (where exists (select 1 from play_days x where x.world = f.world and x.who = f.who and x.day = f.d0 + 1)) as came_back_d1,
  count(*) filter (where exists (select 1 from play_days x where x.world = f.world and x.who = f.who and x.day = f.d0 + 7)) as came_back_d7
from firsts f
group by f.world, f.d0, f.platform;

-- everything at once, by platform, in percent: only the first days old enough to count (D1 needs a day
-- after, D7 a week after)
create or replace view public.retention_summary as
select world, platform, sum(players) as players,
  round(100.0 * sum(came_back_d1) filter (where first_day <= current_date - 1) / nullif(sum(players) filter (where first_day <= current_date - 1), 0), 1) as d1_percent,
  round(100.0 * sum(came_back_d7) filter (where first_day <= current_date - 7) / nullif(sum(players) filter (where first_day <= current_date - 7), 0), 1) as d7_percent
from public.retention
group by world, platform
order by world, players desc;

revoke all on public.retention, public.retention_summary from anon, authenticated;

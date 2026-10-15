-- 036: reporting a sign. Right-click someone else's sign, then "Report": three different players within
-- 24 hours take its text down (the board itself stays), and its author is muted the same way as for the
-- chat (003_moderation.sql: 1 hour, doubling each time, 16 hours at most): no chat, no new sign text.
-- The same safeguards as act_report: only a player who has genuinely played in this world can report,
-- one report per sign and per player, rate limited. Requires 003_moderation.sql, 034_signs.sql.
-- By hand, for the game's owner (SQL Editor): the signs reported lately
--   select s.x, s.y, s.z, s.text, s.author_name, count(r.*) from signs s join sign_reports r using (world, x, y, z)
--     where s.world = 'principal' group by 1, 2, 3, 4, 5 order by 6 desc;
-- and to take one down at once: delete from signs where world = 'principal' and x = … and y = … and z = …;
-- Replayable without error.

create table if not exists public.sign_reports (
  world    text        not null,
  x        integer     not null,
  y        integer     not null,
  z        integer     not null,
  reporter uuid        not null references auth.users (id) on delete cascade,
  at       timestamptz not null default now(),
  primary key (world, x, y, z, reporter)
);
alter table public.sign_reports enable row level security; -- no policy: functions only

create or replace function public._core_report_sign(w text, px int, py int, pz int) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); s signs; n int; d interval; author players;
begin
  -- against throwaway accounts made to silence someone: must have genuinely played in this world
  if not exists (select 1 from players where user_id = me and world = w and serial >= 20
                 and created_at < now() - interval '2 hours') then
    return _no('must have played a little');
  end if;
  select * into s from signs where world = w and x = px and y = py and z = pz;
  if s.text is null then return _no('no sign here'); end if;
  if s.author = me then return _no('your own sign'); end if;
  insert into sign_reports (world, x, y, z, reporter) values (w, px, py, pz, me)
    on conflict (world, x, y, z, reporter) do update set at = now();
  select count(*) into n from sign_reports where world = w and x = px and y = py and z = pz and at > now() - interval '24 hours';
  if n < 3 then return jsonb_build_object('ok', true, 'removed', false); end if;
  delete from signs where world = w and x = px and y = py and z = pz;
  delete from sign_reports where world = w and x = px and y = py and z = pz;   -- start over for whatever comes next
  select * into author from players where user_id = s.author and world = w;
  if author.user_id is not null and coalesce(author.muted_until, '-infinity') < now() then
    d := interval '1 hour' * power(2, least(author.mutes, 4));
    update players set muted_until = now() + d, mutes = mutes + 1 where user_id = author.user_id and world = w;
  end if;
  return jsonb_build_object('ok', true, 'removed', true);
end $$;

create or replace function public.act_report_sign(w text, px int, py int, pz int) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := _me_or_fail(w);
begin
  if not _rate(me, 'report', 0.1, 5) then return _no('too many actions'); end if;
  return _core_report_sign(w, px, py, pz);
end $$;

do $$ declare f record; begin
  for f in select p.oid::regprocedure as sig, p.proname as name from pg_proc p join pg_namespace s on s.oid = p.pronamespace
           where s.nspname = 'public' and (left(p.proname, 1) = '_' or left(p.proname, 4) = 'act_') loop
    execute format('revoke all on function %s from public, anon, authenticated', f.sig);
    if left(f.name, 1) <> '_' then execute format('grant execute on function %s to authenticated', f.sig); end if;
  end loop;
end $$;

-- 034: signs. A sign block (rules.js ids 160 to 163) can carry one line of text that every player
-- reads. Only whoever placed the sign writes on it; the text goes through the chat's own filter (_mask,
-- 003_moderation.sql), muted players can't write, 60 characters at most. An empty text clears it. A
-- row whose sign was broken is simply not shown (the client only draws text on a standing sign) and is
-- replaced when someone places a new sign there and writes on it. Furniture needs nothing server-side:
-- its blocks go through the usual place/mine rules. Requires 001_schema.sql, 003_moderation.sql.
-- Replayable without error.

create table if not exists public.signs (
  world       text        not null,
  x           integer     not null,
  y           integer     not null,
  z           integer     not null,
  text        text        not null,
  author      uuid        references auth.users (id) on delete cascade,
  author_name text,
  updated_at  timestamptz not null default now(),
  primary key (world, x, y, z)
);
alter table public.signs enable row level security;
drop policy if exists "read signs" on public.signs;
create policy "read signs" on public.signs for select using (true);

create or replace function public._core_sign(w text, px int, py int, pz int, msg text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); p players; t text; c int;
begin
  p := _player(me, w);
  if p.muted_until > now() then return _no('muted'); end if;
  c := _cell(w, px, py, pz);
  if c is null or c not between 160 and 163 then return _no('not a sign', jsonb_build_object('cell', c)); end if;
  if not exists (select 1 from blocks where world = w and x = px and y = py and z = pz and placed_by = me::text) then
    return _no('not your sign');
  end if;
  t := left(btrim(regexp_replace(regexp_replace(coalesce(msg, ''), '[[:cntrl:]]', ' ', 'g'), '\s+', ' ', 'g')), 60);
  if t = '' then
    delete from signs where world = w and x = px and y = py and z = pz;
    return jsonb_build_object('ok', true, 'text', '');
  end if;
  t := _mask(t);
  insert into signs (world, x, y, z, text, author, author_name) values (w, px, py, pz, t, me, p.name)
    on conflict (world, x, y, z) do update set text = excluded.text, author = excluded.author,
      author_name = excluded.author_name, updated_at = now();
  return jsonb_build_object('ok', true, 'text', t);
end $$;

create or replace function public.act_sign(w text, px int, py int, pz int, msg text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := _me_or_fail(w);
begin
  if octet_length(coalesce(msg, '')) > 1000 then return _no('text too long'); end if;
  if not _rate(me, 'sign', 0.5, 4) then return _no('too many actions'); end if;
  return _core_sign(w, px, py, pz, msg);
end $$;

do $$ begin
  begin alter publication supabase_realtime add table public.signs; exception when duplicate_object then null; when undefined_object then null; end;
end $$;

do $$ declare f record; begin
  for f in select p.oid::regprocedure as sig, p.proname as name from pg_proc p join pg_namespace s on s.oid = p.pronamespace
           where s.nspname = 'public' and (left(p.proname, 1) = '_' or left(p.proname, 4) = 'act_') loop
    execute format('revoke all on function %s from public, anon, authenticated', f.sig);
    if left(f.name, 1) <> '_' then execute format('grant execute on function %s to authenticated', f.sig); end if;
  end loop;
end $$;

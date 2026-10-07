-- 008: trading between players. A player proposes an offer to another, by username:
--   "give" and "want" can contain resources, unique items, and claims.
--   give: { "items": { "101": 5 }, "uniques": [serial numbers from the proposer], "parcels": [[cx, cz], ...] }
--   want: { "items": { ... },       "uniques": [item types: 201, 202],            "parcels": [[cx, cz], ...] }
--   Nothing is locked at creation: everything is re-checked on acceptance, and the trade then happens
--   all at once (all or nothing). Validator seals (203) can't be traded: they prove an achievement.
-- Requires 001_schema.sql, 002_security.sql, 005_usernames.sql. Replayable without error.

create table if not exists public.offers (
  id         bigint generated always as identity primary key,
  world      text        not null,
  from_user  uuid        not null references auth.users (id) on delete cascade,
  from_name  text        not null,
  to_user    uuid        not null references auth.users (id) on delete cascade,
  to_name    text        not null,
  give       jsonb       not null,
  want       jsonb       not null,
  status     text        not null default 'open' check (status in ('open', 'accepted', 'declined', 'canceled')),
  created_at timestamptz not null default now(),
  closed_at  timestamptz
);
create index if not exists offers_from on public.offers (world, from_user) where status = 'open';
create index if not exists offers_to on public.offers (world, to_user) where status = 'open';
alter table public.offers enable row level security;
drop policy if exists "read own offers" on public.offers;
create policy "read own offers" on public.offers for select to authenticated using (auth.uid() in (from_user, to_user));
revoke insert, update, delete on public.offers from anon, authenticated;

-- Normalizes one side of an offer (or raises an error if malformed): nothing but the three lists,
-- positive integer quantities, no duplicates, bounded sizes.
create or replace function public._offer_shape(p jsonb) returns jsonb
language plpgsql immutable as $$
declare items jsonb := '{}'; uni jsonb := '[]'; par jsonb := '[]'; k text; v jsonb; e jsonb;
begin
  if p is null or jsonb_typeof(p) <> 'object' then return jsonb_build_object('items', items, 'uniques', uni, 'parcels', par); end if;
  if jsonb_typeof(p -> 'items') = 'object' then
    for k, v in select * from jsonb_each(p -> 'items') loop
      if k !~ '^[0-9]{1,4}$' or jsonb_typeof(v) <> 'number' or (v #>> '{}') !~ '^[0-9]{1,6}$' or (v #>> '{}')::int < 1 then
        raise exception 'invalid offer';
      end if;
      if k::int >= 200 then raise exception 'invalid offer'; end if;  -- unique items go in "uniques"
      items := items || jsonb_build_object(k::int::text, (v #>> '{}')::int);
    end loop;
  end if;
  if jsonb_typeof(p -> 'uniques') = 'array' then
    for e in select * from jsonb_array_elements(p -> 'uniques') loop
      if jsonb_typeof(e) <> 'number' or (e #>> '{}') !~ '^[0-9]{1,9}$' then raise exception 'invalid offer'; end if;
      if not exists (select 1 from jsonb_array_elements(uni) x(v) where x.v = e) then uni := uni || e; end if;
    end loop;
  end if;
  if jsonb_typeof(p -> 'parcels') = 'array' then
    for e in select * from jsonb_array_elements(p -> 'parcels') loop
      if jsonb_typeof(e) <> 'array' or jsonb_array_length(e) <> 2
         or (e ->> 0) !~ '^-?[0-9]{1,6}$' or (e ->> 1) !~ '^-?[0-9]{1,6}$' then raise exception 'invalid offer'; end if;
      e := jsonb_build_array((e ->> 0)::int, (e ->> 1)::int);
      if not exists (select 1 from jsonb_array_elements(par) x(v) where x.v = e) then par := par || jsonb_build_array(e); end if;
    end loop;
  end if;
  if (select count(*) from jsonb_object_keys(items)) > 8 or jsonb_array_length(uni) > 4 or jsonb_array_length(par) > 4 then
    raise exception 'offer too long';
  end if;
  return jsonb_build_object('items', items, 'uniques', uni, 'parcels', par);
end $$;

create or replace function public._offer_empty(p jsonb) returns boolean language sql immutable as $$
  select p -> 'items' = '{}'::jsonb and p -> 'uniques' = '[]'::jsonb and p -> 'parcels' = '[]'::jsonb $$;

-- Does this player have everything on this side of the offer? Returns null, or what's missing.
--   by_type = false: "uniques" lists serial numbers (proposer's side);
--   by_type = true  : "uniques" lists item types (recipient's side), a different item per requested type.
create or replace function public._offer_missing(who uuid, w text, p jsonb, by_type boolean) returns text
language plpgsql stable security definer set search_path = public as $$
declare k text; v text; e jsonb; n int;
begin
  for k, v in select * from jsonb_each_text(p -> 'items') loop
    if _count(who, w, k::int) < v::int then return 'resources'; end if;
  end loop;
  if by_type then
    for k, v in select t.x, count(*)::text from jsonb_array_elements_text(p -> 'uniques') t(x) group by t.x loop
      select count(*) into n from uniques where user_id = who and world = w and item = k::int and item <> 203;
      if n < v::int then return 'unique item'; end if;
    end loop;
  else
    for e in select * from jsonb_array_elements(p -> 'uniques') loop
      if not exists (select 1 from uniques where user_id = who and world = w and serial = (e #>> '{}')::int and item <> 203) then
        return 'unique item';
      end if;
    end loop;
  end if;
  for e in select * from jsonb_array_elements(p -> 'parcels') loop
    if not exists (select 1 from claims where world = w and cx = (e ->> 0)::int and cz = (e ->> 1)::int and owner = who) then
      return 'claim';
    end if;
  end loop;
  return null;
end $$;

-- Moves one side of the offer from a to b (everything already checked beforehand).
create or replace function public._offer_transfer(a uuid, b uuid, bname text, w text, p jsonb, by_type boolean) returns void
language plpgsql security definer set search_path = public as $$
declare k text; v text; e jsonb; u uniques; s int; mem uuid[];
begin
  for k, v in select * from jsonb_each_text(p -> 'items') loop
    perform _give(a, w, k::int, -v::int, '{}'::jsonb);
    perform _give(b, w, k::int, v::int, '{}'::jsonb);
  end loop;
  for e in select * from jsonb_array_elements(p -> 'uniques') loop
    if by_type then
      select * into u from uniques where user_id = a and world = w and item = (e #>> '{}')::int and item <> 203 order by serial limit 1;
    else
      select * into u from uniques where user_id = a and world = w and serial = (e #>> '{}')::int and item <> 203;
    end if;
    if u.user_id is null then raise exception 'unique item not found'; end if;
    delete from uniques where user_id = a and world = w and serial = u.serial;
    -- the item keeps its history (forge place, blocks mined, date); it gets a new number under its new owner
    select coalesce(max(serial), 0) + 1 into s from uniques where user_id = b and world = w;
    insert into uniques (user_id, world, serial, item, place, mined, created_at) values (b, w, s, u.item, u.place, u.mined, u.created_at);
  end loop;
  select members into mem from claims where world = w and owner = b limit 1;
  for e in select * from jsonb_array_elements(p -> 'parcels') loop
    update claims set owner = b, owner_name = bname, members = coalesce(mem, '{}')
     where world = w and cx = (e ->> 0)::int and cz = (e ->> 1)::int and owner = a;
    if not found then raise exception 'claim not found'; end if;
  end loop;
end $$;

-- Propose a trade to a player, by username.
create or replace function public.act_offer(w text, username text, give jsonb, want jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := _me_or_fail(w); mine players; them players; g jsonb; q jsonb; m text; oid bigint;
begin
  if not _rate(me, 'offer', 0.1, 4) then return _no('too many actions'); end if;
  select * into mine from players where user_id = me and world = w;
  if coalesce(btrim(mine.name), '') = '' then return _no('you need a username'); end if;
  select * into them from players where world = w and lower(name) = lower(btrim(username)) and user_id <> me limit 1;
  if them.user_id is null then return _no('unknown player in this world'); end if;
  begin
    g := _offer_shape(give);
    q := _offer_shape(want);
  exception when others then return _no('invalid offer'); end;
  if _offer_empty(g) then return _no('you must give something'); end if;
  m := _offer_missing(me, w, g, false);
  if m is not null then return _no('you don''t have everything you''re offering', jsonb_build_object('missing', m)); end if;
  m := _offer_missing(them.user_id, w, q, true);
  if m is not null then return _no('that player doesn''t have what you''re asking for', jsonb_build_object('missing', m)); end if;
  update offers set status = 'canceled', closed_at = now() where status = 'open' and created_at < now() - interval '3 days';
  if (select count(*) from offers where world = w and from_user = me and status = 'open') >= 5 then
    return _no('5 pending offers at most');
  end if;
  insert into offers (world, from_user, from_name, to_user, to_name, give, want)
    values (w, me, mine.name, them.user_id, them.name, g, q) returning id into oid;
  if random() < 0.05 then delete from offers where status <> 'open' and closed_at < now() - interval '14 days'; end if;
  return jsonb_build_object('ok', true, 'id', oid, 'name', them.name);
end $$;

-- Accept a received offer: both sides are re-checked, then everything changes hands at once.
create or replace function public.act_offer_accept(w text, oid bigint) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := _me_or_fail(w); o offers; m text; na int; nb int; mine players;
begin
  if not _rate(me, 'offer_accept', 0.5, 4) then return _no('too many actions'); end if;
  select * into o from offers where id = oid and world = w for update;
  if o.id is null or o.to_user <> me then return _no('offer not found'); end if;
  if o.status <> 'open' or o.created_at < now() - interval '3 days' then return _no('this offer is no longer open'); end if;
  -- both records are locked, always in the same order
  perform 1 from players where world = w and user_id in (o.from_user, o.to_user) order by user_id for update;
  perform 1 from claims where world = w and owner in (o.from_user, o.to_user) order by cx, cz for update;
  m := _offer_missing(o.from_user, w, o.give, false);
  if m is not null then return _no('the other player no longer has what they offered', jsonb_build_object('missing', m)); end if;
  m := _offer_missing(me, w, o.want, true);
  if m is not null then return _no('you don''t have what''s requested', jsonb_build_object('missing', m)); end if;
  -- 16 claims at most, after the trade, for each side
  select count(*) into na from claims where world = w and owner = o.from_user;
  select count(*) into nb from claims where world = w and owner = me;
  if na - jsonb_array_length(o.give -> 'parcels') + jsonb_array_length(o.want -> 'parcels') > 16
     or nb - jsonb_array_length(o.want -> 'parcels') + jsonb_array_length(o.give -> 'parcels') > 16 then
    return _no('16 claims at most');
  end if;
  select * into mine from players where user_id = me and world = w;
  perform _offer_transfer(o.from_user, me, coalesce(mine.name, o.to_name), w, o.give, false);
  perform _offer_transfer(me, o.from_user, o.from_name, w, o.want, true);
  update offers set status = 'accepted', closed_at = now() where id = oid;
  return jsonb_build_object('ok', true, 'name', o.from_name);
end $$;

-- Decline a received offer, or cancel a sent one.
create or replace function public.act_offer_close(w text, oid bigint) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := _me_or_fail(w); o offers;
begin
  select * into o from offers where id = oid and world = w for update;
  if o.id is null or me not in (o.from_user, o.to_user) then return _no('offer not found'); end if;
  if o.status <> 'open' then return _no('this offer is no longer open'); end if;
  update offers set status = case when me = o.from_user then 'canceled' else 'declined' end, closed_at = now() where id = oid;
  return jsonb_build_object('ok', true);
end $$;

-- This player's pending offers, received and sent.
create or replace function public.act_offers(w text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := _me_or_fail(w);
begin
  if not _rate(me, 'offers', 0.5, 8) then return _no('too many actions'); end if;
  return jsonb_build_object('ok', true, 'offers', coalesce((
    select jsonb_agg(jsonb_build_object('id', id, 'from', from_name, 'to', to_name, 'mine', from_user = me,
                                        'give', give, 'want', want, 'at', created_at,
                                        -- the unique items offered, described (the recipient can't see the other's inventory)
                                        'uniqueDetails', coalesce((select jsonb_agg(jsonb_build_object('serial', u.serial, 'item', u.item, 'mined', u.mined) order by u.serial)
                                                              from uniques u where u.user_id = o.from_user and u.world = w
                                                               and u.serial in (select (x.v #>> '{}')::int from jsonb_array_elements(o.give -> 'uniques') x(v))), '[]'::jsonb))
                             order by created_at desc)
      from offers o where world = w and status = 'open' and me in (from_user, to_user)
       and created_at > now() - interval '3 days'), '[]'::jsonb));
end $$;

do $$ declare f record; begin
  for f in select p.oid::regprocedure as sig, p.proname as name from pg_proc p join pg_namespace s on s.oid = p.pronamespace
           where s.nspname = 'public' and (left(p.proname, 1) = '_' or left(p.proname, 4) = 'act_') loop
    execute format('revoke all on function %s from public, anon, authenticated', f.sig);
    if left(f.name, 1) <> '_' then execute format('grant execute on function %s to authenticated', f.sig); end if;
  end loop;
end $$;
grant execute on function public._rate(uuid, text, real, real) to service_role;
do $$ begin
  begin alter publication supabase_realtime add table public.offers; exception when duplicate_object then null; when undefined_object then null; end;
end $$;

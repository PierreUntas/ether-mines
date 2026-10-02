-- 011 : échanges entre joueurs. Un joueur propose une offre à un autre, par son pseudo :
--   « je donne » et « je demande » peuvent contenir des ressources, des objets uniques et des parcelles.
--   give : { "items": { "101": 5 }, "uniques": [numéros de série du proposeur], "parcels": [[cx, cz], …] }
--   want : { "items": { … },       "uniques": [types d'objet : 201, 202],       "parcels": [[cx, cz], …] }
--   Rien n'est bloqué à la création : tout est revérifié à l'acceptation, et l'échange se fait alors en une seule fois
--   (tout passe ou rien ne passe). Les sceaux de validateur (203) ne s'échangent pas : ils prouvent un accomplissement.
-- Rejouable sans erreur. Nécessite 001, 002 (_rate, _me_or_fail) et 008.

create table if not exists public.offers (
  id         bigint generated always as identity primary key,
  world      text        not null,
  from_user  uuid        not null references auth.users (id) on delete cascade,
  from_name  text        not null,
  to_user    uuid        not null references auth.users (id) on delete cascade,
  to_name    text        not null,
  give       jsonb       not null,
  want       jsonb       not null,
  status     text        not null default 'ouverte' check (status in ('ouverte', 'acceptee', 'refusee', 'annulee')),
  created_at timestamptz not null default now(),
  closed_at  timestamptz
);
create index if not exists offers_from on public.offers (world, from_user) where status = 'ouverte';
create index if not exists offers_to on public.offers (world, to_user) where status = 'ouverte';
alter table public.offers enable row level security;
drop policy if exists "lire ses offres" on public.offers;
create policy "lire ses offres" on public.offers for select to authenticated using (auth.uid() in (from_user, to_user));
revoke insert, update, delete on public.offers from anon, authenticated;

-- Remet un côté d'offre en forme (ou lève une erreur si la forme est mauvaise) : rien d'autre que les trois listes,
-- des quantités entières positives, pas de doublon, des tailles bornées.
create or replace function public._offre_forme(p jsonb) returns jsonb
language plpgsql immutable as $$
declare items jsonb := '{}'; uni jsonb := '[]'; par jsonb := '[]'; k text; v jsonb; e jsonb;
begin
  if p is null or jsonb_typeof(p) <> 'object' then return jsonb_build_object('items', items, 'uniques', uni, 'parcels', par); end if;
  if jsonb_typeof(p -> 'items') = 'object' then
    for k, v in select * from jsonb_each(p -> 'items') loop
      if k !~ '^[0-9]{1,4}$' or jsonb_typeof(v) <> 'number' or (v #>> '{}') !~ '^[0-9]{1,6}$' or (v #>> '{}')::int < 1 then
        raise exception 'offre invalide';
      end if;
      if k::int >= 200 then raise exception 'offre invalide'; end if;  -- les objets uniques vont dans « uniques »
      items := items || jsonb_build_object(k::int::text, (v #>> '{}')::int);
    end loop;
  end if;
  if jsonb_typeof(p -> 'uniques') = 'array' then
    for e in select * from jsonb_array_elements(p -> 'uniques') loop
      if jsonb_typeof(e) <> 'number' or (e #>> '{}') !~ '^[0-9]{1,9}$' then raise exception 'offre invalide'; end if;
      if not exists (select 1 from jsonb_array_elements(uni) x(v) where x.v = e) then uni := uni || e; end if;
    end loop;
  end if;
  if jsonb_typeof(p -> 'parcels') = 'array' then
    for e in select * from jsonb_array_elements(p -> 'parcels') loop
      if jsonb_typeof(e) <> 'array' or jsonb_array_length(e) <> 2
         or (e ->> 0) !~ '^-?[0-9]{1,6}$' or (e ->> 1) !~ '^-?[0-9]{1,6}$' then raise exception 'offre invalide'; end if;
      e := jsonb_build_array((e ->> 0)::int, (e ->> 1)::int);
      if not exists (select 1 from jsonb_array_elements(par) x(v) where x.v = e) then par := par || jsonb_build_array(e); end if;
    end loop;
  end if;
  if (select count(*) from jsonb_object_keys(items)) > 8 or jsonb_array_length(uni) > 4 or jsonb_array_length(par) > 4 then
    raise exception 'offre trop longue';
  end if;
  return jsonb_build_object('items', items, 'uniques', uni, 'parcels', par);
end $$;

create or replace function public._offre_vide(p jsonb) returns boolean language sql immutable as $$
  select p -> 'items' = '{}'::jsonb and p -> 'uniques' = '[]'::jsonb and p -> 'parcels' = '[]'::jsonb $$;

-- Ce joueur possède-t-il tout ce côté de l'offre ? Renvoie null, ou ce qui manque.
--   par_type = false : « uniques » liste des numéros de série (côté proposeur) ;
--   par_type = true  : « uniques » liste des types d'objet (côté destinataire), un objet différent par type demandé.
create or replace function public._offre_manque(who uuid, w text, p jsonb, par_type boolean) returns text
language plpgsql stable security definer set search_path = public as $$
declare k text; v text; e jsonb; n int;
begin
  for k, v in select * from jsonb_each_text(p -> 'items') loop
    if _count(who, w, k::int) < v::int then return 'ressources'; end if;
  end loop;
  if par_type then
    for k, v in select t.x, count(*)::text from jsonb_array_elements_text(p -> 'uniques') t(x) group by t.x loop
      select count(*) into n from uniques where user_id = who and world = w and item = k::int and item <> 203;
      if n < v::int then return 'objet unique'; end if;
    end loop;
  else
    for e in select * from jsonb_array_elements(p -> 'uniques') loop
      if not exists (select 1 from uniques where user_id = who and world = w and serial = (e #>> '{}')::int and item <> 203) then
        return 'objet unique';
      end if;
    end loop;
  end if;
  for e in select * from jsonb_array_elements(p -> 'parcels') loop
    if not exists (select 1 from claims where world = w and cx = (e ->> 0)::int and cz = (e ->> 1)::int and owner = who) then
      return 'parcelle';
    end if;
  end loop;
  return null;
end $$;

-- Fait passer un côté de l'offre de a vers b (tout a été vérifié avant).
create or replace function public._offre_passe(a uuid, b uuid, bname text, w text, p jsonb, par_type boolean) returns void
language plpgsql security definer set search_path = public as $$
declare k text; v text; e jsonb; u uniques; s int; mem uuid[];
begin
  for k, v in select * from jsonb_each_text(p -> 'items') loop
    perform _give(a, w, k::int, -v::int, '{}'::jsonb);
    perform _give(b, w, k::int, v::int, '{}'::jsonb);
  end loop;
  for e in select * from jsonb_array_elements(p -> 'uniques') loop
    if par_type then
      select * into u from uniques where user_id = a and world = w and item = (e #>> '{}')::int and item <> 203 order by serial limit 1;
    else
      select * into u from uniques where user_id = a and world = w and serial = (e #>> '{}')::int and item <> 203;
    end if;
    if u.user_id is null then raise exception 'objet unique introuvable'; end if;
    delete from uniques where user_id = a and world = w and serial = u.serial;
    -- l'objet garde son histoire (lieu de forge, blocs minés, date) ; il prend un numéro chez son nouveau propriétaire
    select coalesce(max(serial), 0) + 1 into s from uniques where user_id = b and world = w;
    insert into uniques (user_id, world, serial, item, place, mined, created_at) values (b, w, s, u.item, u.place, u.mined, u.created_at);
  end loop;
  select members into mem from claims where world = w and owner = b limit 1;
  for e in select * from jsonb_array_elements(p -> 'parcels') loop
    update claims set owner = b, owner_name = bname, members = coalesce(mem, '{}')
     where world = w and cx = (e ->> 0)::int and cz = (e ->> 1)::int and owner = a;
    if not found then raise exception 'parcelle introuvable'; end if;
  end loop;
end $$;

-- Proposer un échange à un joueur, par son pseudo.
create or replace function public.act_offer(w text, pseudo text, give jsonb, want jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := _me_or_fail(w); moi players; lui players; g jsonb; q jsonb; m text; oid bigint;
begin
  if not _rate(me, 'offer', 0.1, 4) then return _no('trop d''actions'); end if;
  select * into moi from players where user_id = me and world = w;
  if coalesce(btrim(moi.name), '') = '' then return _no('il te faut un pseudo'); end if;
  select * into lui from players where world = w and lower(name) = lower(btrim(pseudo)) and user_id <> me limit 1;
  if lui.user_id is null then return _no('joueur inconnu dans ce monde'); end if;
  begin
    g := _offre_forme(give);
    q := _offre_forme(want);
  exception when others then return _no('offre invalide'); end;
  if _offre_vide(g) then return _no('il faut donner quelque chose'); end if;
  m := _offre_manque(me, w, g, false);
  if m is not null then return _no('tu n''as pas tout ce que tu donnes', jsonb_build_object('manque', m)); end if;
  m := _offre_manque(lui.user_id, w, q, true);
  if m is not null then return _no('ce joueur n''a pas ce que tu demandes', jsonb_build_object('manque', m)); end if;
  update offers set status = 'annulee', closed_at = now() where status = 'ouverte' and created_at < now() - interval '3 days';
  if (select count(*) from offers where world = w and from_user = me and status = 'ouverte') >= 5 then
    return _no('5 offres en attente au plus');
  end if;
  insert into offers (world, from_user, from_name, to_user, to_name, give, want)
    values (w, me, moi.name, lui.user_id, lui.name, g, q) returning id into oid;
  if random() < 0.05 then delete from offers where status <> 'ouverte' and closed_at < now() - interval '14 days'; end if;
  return jsonb_build_object('ok', true, 'id', oid, 'name', lui.name);
end $$;

-- Accepter une offre reçue : les deux côtés sont revérifiés, puis tout change de main d'un seul coup.
create or replace function public.act_offer_accept(w text, oid bigint) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := _me_or_fail(w); o offers; m text; na int; nb int; moi players;
begin
  if not _rate(me, 'offer_accept', 0.5, 4) then return _no('trop d''actions'); end if;
  select * into o from offers where id = oid and world = w for update;
  if o.id is null or o.to_user <> me then return _no('offre introuvable'); end if;
  if o.status <> 'ouverte' or o.created_at < now() - interval '3 days' then return _no('cette offre n''est plus ouverte'); end if;
  -- les deux fiches sont verrouillées, toujours dans le même ordre
  perform 1 from players where world = w and user_id in (o.from_user, o.to_user) order by user_id for update;
  perform 1 from claims where world = w and owner in (o.from_user, o.to_user) order by cx, cz for update;
  m := _offre_manque(o.from_user, w, o.give, false);
  if m is not null then return _no('l''autre joueur n''a plus ce qu''il proposait', jsonb_build_object('manque', m)); end if;
  m := _offre_manque(me, w, o.want, true);
  if m is not null then return _no('tu n''as pas ce qui est demandé', jsonb_build_object('manque', m)); end if;
  -- 16 parcelles au plus, après l'échange, pour chacun
  select count(*) into na from claims where world = w and owner = o.from_user;
  select count(*) into nb from claims where world = w and owner = me;
  if na - jsonb_array_length(o.give -> 'parcels') + jsonb_array_length(o.want -> 'parcels') > 16
     or nb - jsonb_array_length(o.want -> 'parcels') + jsonb_array_length(o.give -> 'parcels') > 16 then
    return _no('16 parcelles au plus');
  end if;
  select * into moi from players where user_id = me and world = w;
  perform _offre_passe(o.from_user, me, coalesce(moi.name, o.to_name), w, o.give, false);
  perform _offre_passe(me, o.from_user, o.from_name, w, o.want, true);
  update offers set status = 'acceptee', closed_at = now() where id = oid;
  return jsonb_build_object('ok', true, 'name', o.from_name);
end $$;

-- Refuser une offre reçue, ou annuler une offre envoyée.
create or replace function public.act_offer_close(w text, oid bigint) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := _me_or_fail(w); o offers;
begin
  select * into o from offers where id = oid and world = w for update;
  if o.id is null or me not in (o.from_user, o.to_user) then return _no('offre introuvable'); end if;
  if o.status <> 'ouverte' then return _no('cette offre n''est plus ouverte'); end if;
  update offers set status = case when me = o.from_user then 'annulee' else 'refusee' end, closed_at = now() where id = oid;
  return jsonb_build_object('ok', true);
end $$;

-- Ses offres en attente, reçues et envoyées.
create or replace function public.act_offers(w text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := _me_or_fail(w);
begin
  if not _rate(me, 'offers', 0.5, 8) then return _no('trop d''actions'); end if;
  return jsonb_build_object('ok', true, 'offers', coalesce((
    select jsonb_agg(jsonb_build_object('id', id, 'from', from_name, 'to', to_name, 'mine', from_user = me,
                                        'give', give, 'want', want, 'at', created_at,
                                        -- les objets uniques proposés, décrits (le destinataire ne voit pas le coffre de l'autre)
                                        'objets', coalesce((select jsonb_agg(jsonb_build_object('serial', u.serial, 'item', u.item, 'mined', u.mined) order by u.serial)
                                                              from uniques u where u.user_id = o.from_user and u.world = w
                                                               and u.serial in (select (x.v #>> '{}')::int from jsonb_array_elements(o.give -> 'uniques') x(v))), '[]'::jsonb))
                             order by created_at desc)
      from offers o where world = w and status = 'ouverte' and me in (from_user, to_user)
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

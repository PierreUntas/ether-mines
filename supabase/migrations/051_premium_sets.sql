-- 051: a premium collection bought whole, for less than its pieces (rules.js SET_EUR, setPrice). Owning
-- some pieces already, you pay the same share of the set's price as the share of the pieces you're missing.
-- One Stripe session, one purchases row listing its pieces (pieces); a refund takes them all back. 050's
-- single pieces now also count as owned when they came in a set. Requires 050_purchases.sql. Replayable.

alter table public.rule_cosmetics add column if not exists set_id text; -- premium pieces only
create table if not exists public.rule_sets (
  id  text    primary key,
  eur integer not null -- the whole set, euro cents
);
alter table public.rule_sets enable row level security;
drop policy if exists "read rule_sets" on public.rule_sets;
create policy "read rule_sets" on public.rule_sets for select using (true);

alter table billing.purchases alter column cosmetic_id drop not null;   -- null for a set
alter table billing.purchases add column if not exists set_id text;
alter table billing.purchases add column if not exists pieces smallint[]; -- a set's pieces, as bought

-- the premium pieces an account has paid for (live ones only, or test ones too)
create or replace function public._premium_has(p_user uuid, with_test boolean) returns smallint[]
language sql security definer set search_path = public, billing stable as $$
  select coalesce(array_agg(distinct c order by c), '{}')
  from billing.purchases p, unnest(coalesce(p.pieces, array[p.cosmetic_id])) c
  where p.user_id = p_user and p.status = 'paid' and (p.livemode or with_test)
$$;

create or replace function public.act_premium_owned(w text) returns smallint[]
language sql security definer set search_path = public, billing stable as $$
  select _premium_has(auth.uid(), w <> 'principal')
$$;

-- one piece: as in 050, but a piece that came in a set is owned too (a test purchase only counts for test)
create or replace function public.srv_premium_quote(p_user uuid, cid int, live boolean, w text) returns jsonb
language plpgsql security definer set search_path = public, billing as $$
declare rc rule_cosmetics; nk text;
begin
  if not _rate(p_user, 'premium_checkout', 0.1, 5) then return _no('too many actions'); end if;
  select * into rc from rule_cosmetics where id = cid;
  if not found or rc.category <> 'premium' or coalesce(rc.eur, 0) <= 0 then return _no('not for sale'); end if;
  if not live and w = 'principal' then return _no('test payments only in test worlds'); end if;
  select login into nk from logins where user_id = p_user;
  if nk is null then return _no('set a password first'); end if;
  if cid = any (_premium_has(p_user, not live)) then return _no('already owned'); end if;
  return jsonb_build_object('ok', true, 'eur', rc.eur, 'name', rc.name, 'nick', nk);
end $$;

-- a whole set: the pieces still missing, and the share of the set's price they're worth
create or replace function public.srv_premium_quote_set(p_user uuid, set_ text, live boolean, w text) returns jsonb
language plpgsql security definer set search_path = public, billing as $$
declare rs rule_sets; nk text; have smallint[]; missing smallint[]; full_ int; part int;
begin
  if not _rate(p_user, 'premium_checkout', 0.1, 5) then return _no('too many actions'); end if;
  select * into rs from rule_sets where id = set_;
  if not found then return _no('not for sale'); end if;
  if not live and w = 'principal' then return _no('test payments only in test worlds'); end if;
  select login into nk from logins where user_id = p_user;
  if nk is null then return _no('set a password first'); end if;
  have := _premium_has(p_user, not live);
  select coalesce(sum(eur), 0), coalesce(sum(eur) filter (where not (id = any (have))), 0),
         coalesce(array_agg(id order by id) filter (where not (id = any (have))), '{}')
    into full_, part, missing
    from rule_cosmetics where set_id = set_ and category = 'premium';
  if full_ = 0 then return _no('not for sale'); end if;
  if cardinality(missing) = 0 then return _no('already owned'); end if;
  return jsonb_build_object('ok', true, 'eur', round(rs.eur::numeric * part / full_)::int, 'pieces', to_jsonb(missing), 'nick', nk);
end $$;

create or replace function public.srv_premium_pending_set(p_user uuid, set_ text, pieces_ smallint[], eur_ int, live boolean, session text) returns void
language sql security definer set search_path = public, billing as $$
  insert into billing.purchases (user_id, nick, set_id, pieces, eur, livemode, stripe_session)
  values (p_user, coalesce((select login from logins where user_id = p_user), '?'), set_, pieces_, eur_, live, session)
  on conflict (stripe_session) do nothing
$$;

-- 050's, plus a set rebuilt from the session's metadata when we never recorded it (lost reply)
drop function if exists public.srv_premium_paid(text, text, text, int, boolean, uuid, int);
create or replace function public.srv_premium_paid(session text, payment text, mail text, amount int, live boolean, p_user uuid, cid int,
  set_ text default null, pieces_ smallint[] default null) returns jsonb
language plpgsql security definer set search_path = public, billing as $$
declare p billing.purchases;
begin
  select * into p from billing.purchases where stripe_session = session for update;
  if not found then
    if p_user is null or (cid is null and pieces_ is null) then return _no('unknown session'); end if;
    insert into billing.purchases (user_id, nick, cosmetic_id, set_id, pieces, eur, livemode, stripe_session)
    values (p_user, coalesce((select login from logins where user_id = p_user), '?'), case when pieces_ is null then cid end,
            set_, pieces_, amount, live, session)
    returning * into p;
  end if;
  if p.status = 'paid' then return jsonb_build_object('ok', true, 'already', true); end if;
  if p.status = 'refunded' then return _no('refunded'); end if;
  if amount is distinct from p.eur then return _no('wrong amount'); end if;
  update billing.purchases set status = 'paid', paid_at = now(), stripe_payment = payment, email = mail, livemode = live
  where id = p.id;
  return jsonb_build_object('ok', true, 'cosmetic', p.cosmetic_id, 'pieces', p.pieces, 'user', p.user_id);
end $$;

revoke all on function public._premium_has(uuid, boolean) from public, anon, authenticated;
revoke all on function public.act_premium_owned(text) from public, anon, authenticated;
grant execute on function public.act_premium_owned(text) to authenticated;
revoke all on function public.srv_premium_quote(uuid, int, boolean, text) from public, anon, authenticated;
revoke all on function public.srv_premium_quote_set(uuid, text, boolean, text) from public, anon, authenticated;
revoke all on function public.srv_premium_pending_set(uuid, text, smallint[], int, boolean, text) from public, anon, authenticated;
revoke all on function public.srv_premium_paid(text, text, text, int, boolean, uuid, int, text, smallint[]) from public, anon, authenticated;
grant execute on function public.srv_premium_quote(uuid, int, boolean, text) to service_role;
grant execute on function public.srv_premium_quote_set(uuid, text, boolean, text) to service_role;
grant execute on function public.srv_premium_pending_set(uuid, text, smallint[], int, boolean, text) to service_role;
grant execute on function public.srv_premium_paid(text, text, text, int, boolean, uuid, int, text, smallint[]) to service_role;

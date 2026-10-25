-- 050: buying the premium pieces with real money, through Stripe (the "checkout" and "stripe-webhook" Edge
-- Functions). The player asks for a piece (srv_premium_quote: a premium piece, not owned yet, and an account
-- with a password, so the purchase can follow them to another device); Stripe Checkout takes the payment;
-- Stripe's signed webhook tells us it went through (srv_premium_paid) or was refunded (srv_premium_refunded).
-- A paid piece belongs to the account in every world (act_premium_owned), unlike the Gwei pieces, which
-- belong to one world.
-- The purchases live in their own schema, billing, which reset.sql leaves alone: real money is never wiped
-- with a season. Each row keeps the nickname and the buyer's email, so a purchase can be found again by hand
-- after a reset. Stripe's test mode (livemode false) only counts outside the players' world, 'principal'.
-- Only the service key (the Edge Functions) writes here. Requires 022, 046, 047. Replayable without error.

alter table public.rule_cosmetics add column if not exists eur integer; -- price in euro cents, premium only

create schema if not exists billing;
revoke all on schema billing from public, anon, authenticated;

create table if not exists billing.purchases (
  id             bigserial   primary key,
  user_id        uuid        not null,               -- no foreign key: the row outlives the account
  nick           text        not null,
  cosmetic_id    smallint    not null,
  eur            integer     not null,               -- cents, as charged
  livemode       boolean     not null default false, -- false: Stripe's test mode
  status         text        not null default 'pending' check (status in ('pending', 'paid', 'refunded')),
  stripe_session text        not null unique,
  stripe_payment text,                               -- the payment intent, what a refund points to
  email          text,
  created_at     timestamptz not null default now(),
  paid_at        timestamptz,
  refunded_at    timestamptz
);
create index if not exists purchases_user on billing.purchases (user_id);
create index if not exists purchases_payment on billing.purchases (stripe_payment);

-- the premium pieces an account owns, for one world (test purchases only count outside 'principal')
create or replace function public.act_premium_owned(w text) returns smallint[]
language sql security definer set search_path = public, billing stable as $$
  select coalesce(array_agg(distinct cosmetic_id order by cosmetic_id), '{}')
  from billing.purchases where user_id = auth.uid() and status = 'paid' and (livemode or w <> 'principal')
$$;

-- before opening a payment: what to charge, or why not
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
  if exists (select 1 from billing.purchases where user_id = p_user and cosmetic_id = cid and status = 'paid' and livemode = live) then
    return _no('already owned');
  end if;
  return jsonb_build_object('ok', true, 'eur', rc.eur, 'name', rc.name, 'nick', nk);
end $$;

-- the Checkout session is open: remember it, so the webhook can match it
create or replace function public.srv_premium_pending(p_user uuid, cid int, eur_ int, live boolean, session text) returns void
language sql security definer set search_path = public, billing as $$
  insert into billing.purchases (user_id, nick, cosmetic_id, eur, livemode, stripe_session)
  values (p_user, coalesce((select login from logins where user_id = p_user), '?'), cid, eur_, live, session)
  on conflict (stripe_session) do nothing
$$;

-- Stripe says the session was paid (signed webhook). Safe to receive twice. The amount must be the one asked
-- for; a session we never recorded (lost reply) is taken from the session's own metadata.
create or replace function public.srv_premium_paid(session text, payment text, mail text, amount int, live boolean, p_user uuid, cid int) returns jsonb
language plpgsql security definer set search_path = public, billing as $$
declare p billing.purchases;
begin
  select * into p from billing.purchases where stripe_session = session for update;
  if not found then
    if p_user is null or cid is null then return _no('unknown session'); end if;
    insert into billing.purchases (user_id, nick, cosmetic_id, eur, livemode, stripe_session)
    values (p_user, coalesce((select login from logins where user_id = p_user), '?'), cid, amount, live, session)
    returning * into p;
  end if;
  if p.status = 'paid' then return jsonb_build_object('ok', true, 'already', true); end if;
  if p.status = 'refunded' then return _no('refunded'); end if;
  if amount is distinct from p.eur then return _no('wrong amount'); end if;
  update billing.purchases set status = 'paid', paid_at = now(), stripe_payment = payment, email = mail, livemode = live
  where id = p.id;
  return jsonb_build_object('ok', true, 'cosmetic', p.cosmetic_id, 'user', p.user_id);
end $$;

-- a full refund (or a lost dispute) takes the piece back
create or replace function public.srv_premium_refunded(payment text) returns jsonb
language plpgsql security definer set search_path = public, billing as $$
declare n int;
begin
  update billing.purchases set status = 'refunded', refunded_at = now() where stripe_payment = payment and status = 'paid';
  get diagnostics n = row_count;
  return jsonb_build_object('ok', true, 'refunded', n);
end $$;

-- 046's account move (entering with your nickname on another device) now also carries the purchases.
-- Same function as 046, plus the billing line.
create or replace function public._move_account(old uuid, me uuid) returns integer
language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  if old is null or me is null or old = me then return 0; end if;
  delete from public.inventory i where i.user_id = me and exists (select 1 from public.players o where o.user_id = old and o.world = i.world);
  delete from public.uniques u where u.user_id = me and exists (select 1 from public.players o where o.user_id = old and o.world = u.world);
  delete from public.cosmetics_owned c where c.user_id = me and exists (select 1 from public.players o where o.user_id = old and o.world = c.world);
  delete from public.players p where p.user_id = me and exists (select 1 from public.players o where o.user_id = old and o.world = p.world);
  update public.players set user_id = me where user_id = old;
  get diagnostics n = row_count;
  update public.inventory set user_id = me where user_id = old;
  update public.uniques set user_id = me where user_id = old;
  update public.cosmetics_owned set user_id = me where user_id = old;
  update billing.purchases set user_id = me where user_id = old;
  update public.blocks set placed_by = me::text where placed_by = old::text;
  update public.claims set owner = me where owner = old;
  update public.claims set members = array_replace(members, old, me) where old = any (members);
  update public.validators set owner = me where owner = old;
  update public.offers set from_user = me where from_user = old;
  update public.offers set to_user = me where to_user = old;
  update public.signs set author = me where author = old;
  update public.block_history set actor = me where actor = old;
  delete from public.recovery where user_id = me and exists (select 1 from public.recovery r where r.user_id = old);
  update public.recovery set user_id = me where user_id = old;
  delete from public.logins where user_id = me and exists (select 1 from public.logins l where l.user_id = old);
  update public.logins set user_id = me, updated_at = now() where user_id = old;
  insert into public.moved_accounts (old_id, login, at) values (old, (select login from public.logins where user_id = me), now())
    on conflict (old_id) do update set login = excluded.login, at = now();
  delete from public.moved_accounts where old_id = me; -- this device has a game again
  return n;
end $$;

-- rights: act_premium_owned for the players, the srv_ ones for the service key only, _move_account for nobody
revoke all on function public.act_premium_owned(text) from public, anon, authenticated;
grant execute on function public.act_premium_owned(text) to authenticated;
revoke all on function public._move_account(uuid, uuid) from public, anon, authenticated;
revoke all on function public.srv_premium_quote(uuid, int, boolean, text) from public, anon, authenticated;
revoke all on function public.srv_premium_pending(uuid, int, int, boolean, text) from public, anon, authenticated;
revoke all on function public.srv_premium_paid(text, text, text, int, boolean, uuid, int) from public, anon, authenticated;
revoke all on function public.srv_premium_refunded(text) from public, anon, authenticated;
grant execute on function public.srv_premium_quote(uuid, int, boolean, text) to service_role;
grant execute on function public.srv_premium_pending(uuid, int, int, boolean, text) to service_role;
grant execute on function public.srv_premium_paid(text, text, text, int, boolean, uuid, int) to service_role;
grant execute on function public.srv_premium_refunded(text) to service_role;

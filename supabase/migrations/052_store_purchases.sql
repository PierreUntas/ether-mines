-- 052: the premium pieces and sets bought in the apps, through the App Store or Google Play (the "iap-verify"
-- Edge Function checks each purchase with Apple's or Google's own server first). They land in 050's
-- billing.purchases, beside Stripe's, and count the same (act_premium_owned): bought anywhere, worn
-- everywhere. A store purchase is keyed by its store and transaction ('apple:<originalTransactionId>',
-- 'google:<orderId>') in stripe_session, the column that keeps each purchase once; refunds point to the same
-- key through stripe_payment. In the apps a set is sold whole, at its full price. Requires 050, 051. Replayable.

alter table billing.purchases add column if not exists store text not null default 'stripe' check (store in ('stripe', 'apple', 'google'));

-- a store purchase Apple or Google confirmed. Safe to receive twice (restoring purchases on a new device sends
-- them all again): already recorded for this account, nothing changes; recorded for another account, it stays
-- theirs (one Apple or Google account shared by two players doesn't hand over what one of them paid for).
create or replace function public.srv_store_paid(p_user uuid, store_ text, tx text, cid int, set_ text, live boolean, w text) returns jsonb
language plpgsql security definer set search_path = public, billing as $$
declare key text := store_ || ':' || tx; p billing.purchases; rc rule_cosmetics; rs rule_sets; pcs smallint[]; nk text;
begin
  if store_ not in ('apple', 'google') or coalesce(tx, '') = '' then return _no('invalid purchase'); end if;
  if not _rate(p_user, 'premium_store', 0.5, 20) then return _no('too many actions'); end if;
  if not live and w = 'principal' then return _no('test payments only in test worlds'); end if;
  select login into nk from logins where user_id = p_user;
  if nk is null then return _no('set a password first'); end if;
  select * into p from billing.purchases where stripe_session = key;
  if found then
    if p.user_id <> p_user then return _no('bought by another account'); end if;
    if p.status = 'refunded' then return _no('refunded'); end if;
    return jsonb_build_object('ok', true, 'already', true, 'pieces', to_jsonb(coalesce(p.pieces, array[p.cosmetic_id])));
  end if;
  if set_ is not null then
    select * into rs from rule_sets where id = set_;
    if not found then return _no('not for sale'); end if;
    select coalesce(array_agg(id order by id), '{}') into pcs from rule_cosmetics where set_id = set_ and category = 'premium';
    if cardinality(pcs) = 0 then return _no('not for sale'); end if;
    insert into billing.purchases (user_id, nick, set_id, pieces, eur, livemode, status, stripe_session, stripe_payment, store, paid_at)
    values (p_user, nk, set_, pcs, rs.eur, live, 'paid', key, key, store_, now());
  else
    select * into rc from rule_cosmetics where id = cid;
    if not found or rc.category <> 'premium' or coalesce(rc.eur, 0) <= 0 then return _no('not for sale'); end if;
    pcs := array[rc.id];
    insert into billing.purchases (user_id, nick, cosmetic_id, eur, livemode, status, stripe_session, stripe_payment, store, paid_at)
    values (p_user, nk, rc.id, rc.eur, live, 'paid', key, key, store_, now());
  end if;
  return jsonb_build_object('ok', true, 'pieces', to_jsonb(pcs));
end $$;

-- Apple or Google says a purchase was refunded: the piece (or the set) goes, as with Stripe
create or replace function public.srv_store_refunded(store_ text, tx text) returns jsonb
language sql security definer set search_path = public, billing as $$
  select srv_premium_refunded(store_ || ':' || tx)
$$;

revoke all on function public.srv_store_paid(uuid, text, text, int, text, boolean, text) from public, anon, authenticated;
revoke all on function public.srv_store_refunded(text, text) from public, anon, authenticated;
grant execute on function public.srv_store_paid(uuid, text, text, int, text, boolean, text) to service_role;
grant execute on function public.srv_store_refunded(text, text) to service_role;

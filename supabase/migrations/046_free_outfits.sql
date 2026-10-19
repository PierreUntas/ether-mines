-- 046: the plain outfits are free for everyone (rules.js: price 0, free), and each has two variants with
-- details sewn on, sold in the shop. Whoever paid for a plain outfit gets its first variant, free.
-- The catalog itself is rules.sql (rule_cosmetics). Requires 022_cosmetics.sql. Replayable without error.

insert into public.cosmetics_owned (user_id, world, cosmetic_id)
select o.user_id, o.world, m.variant
from public.cosmetics_owned o
join (values (1, 46), (2, 48), (3, 50), (21, 52), (24, 54), (27, 56), (31, 58), (35, 60), (45, 62)) as m(plain, variant)
  on o.cosmetic_id = m.plain
on conflict do nothing;

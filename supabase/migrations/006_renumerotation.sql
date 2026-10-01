-- 006 : portes logiques renumérotées (99–110 → 112–123).
-- Elles avaient d'abord reçu les numéros 99 à 110, alors que 101 à 105 sont des objets (cristal d'éther, pioche en bois,
-- éclat pur, fragment de genèse, cœur de validateur). Cette migration convertit ce qui existe déjà.
-- Rejouable sans erreur (une deuxième passe ne trouve plus rien à convertir). Relancer regles.sql ensuite.

-- portes posées dans le monde
update public.blocks set id = id + 13 where id between 99 and 110;

-- portes dans les sacs : ET (99) → 112, NON (107) → 120.
-- La porte OU portait le numéro de l'éclat pur (103) : impossible à distinguer, elle reste un éclat.
insert into public.inventory (user_id, world, item, n)
  select user_id, world, item + 13, n from public.inventory where item in (99, 107)
  on conflict (user_id, world, item) do update set n = public.inventory.n + excluded.n;
delete from public.inventory where item in (99, 107);

-- portes rangées dans des malles (si 005_coffres.sql a été lancé)
do $$ begin
  if to_regclass('public.chests') is not null then
    update public.chests c set items = (
      select coalesce(jsonb_object_agg(k, v), '{}'::jsonb) from (
        select case e.key when '99' then '112' when '107' then '120' else e.key end as k, sum(e.value::int) as v
        from jsonb_each_text(c.items) e group by 1) t)
    where items ? '99' or items ? '107';
  end if;
end $$;

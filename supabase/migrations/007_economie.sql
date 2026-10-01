-- 007 : récompenses des validateurs rééquilibrées.
-- Avant : 1 cristal par slot de 12 s par validateur posé (300 par heure) et 3 par validateur ancien rallumé (900 par heure),
-- sans limite de nombre : un validateur (8 cristaux) se remboursait en deux minutes et la production s'emballait.
-- Maintenant, en « parts » par slot de 12 s, 25 parts = 1 cristal :
--   validateur posé : 1 part (1 cristal toutes les 5 minutes), 5 validateurs posés comptent au plus ;
--   validateur ancien rallumé : 5 parts (1 cristal par minute).
-- Les parts non converties ne sont pas perdues (le temps restant est reporté). 30 minutes rattrapées au plus.
-- Rejouable sans erreur. Nécessite 002_securite.sql (act_rewards y appelle _core_rewards).

create or replace function public._core_rewards(w text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); pl players; poses int; anciens int; parts int; slots int; gain int; pris int;
        depart timestamptz; inv jsonb := '{}';
begin
  pl := _player(me, w);
  select count(*) filter (where id = 13), count(*) filter (where id = 74) into poses, anciens
    from blocks where world = w and placed_by = me::text and id in (13, 74);
  parts := least(poses, 5) + 5 * anciens;
  if pl.rewards_at is null or parts = 0 then
    update players set rewards_at = now() where user_id = me and world = w;
    return jsonb_build_object('ok', true, 'inv', inv, 'slots', 0, 'weight', parts, 'n', 0);
  end if;
  depart := greatest(pl.rewards_at, now() - interval '30 minutes');      -- rattrapage limité
  slots := floor(extract(epoch from now() - depart) / 12)::int;
  gain := floor(slots * parts / 25.0)::int;
  if gain < 1 then
    if depart <> pl.rewards_at then update players set rewards_at = depart where user_id = me and world = w; end if;
    return jsonb_build_object('ok', true, 'inv', inv, 'slots', 0, 'weight', parts, 'n', 0);
  end if;
  pris := ceil(gain * 25.0 / parts)::int;                                -- slots consommés ; le reste attend
  update players set rewards_at = depart + make_interval(secs => pris * 12) where user_id = me and world = w;
  inv := _give(me, w, 101, gain, inv);
  return jsonb_build_object('ok', true, 'inv', inv, 'slots', pris, 'weight', parts, 'n', gain);
end $$;

do $$ declare f record; begin
  for f in select p.oid::regprocedure as sig from pg_proc p join pg_namespace s on s.oid = p.pronamespace
           where s.nspname = 'public' and left(p.proname, 1) = '_' loop
    execute format('revoke all on function %s from public, anon, authenticated', f.sig);
  end loop;
end $$;

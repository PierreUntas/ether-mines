-- Scénarios de jeu et de triche contre le schéma (001_schema.sql + regles.sql).
-- Lancé par tests/sql/run.sh. Chaque vérification qui échoue arrête tout avec un message clair.
\set ON_ERROR_STOP on
\set QUIET on
\pset tuples_only on
\pset format unaligned

create function pg_temp.ok(label text, cond boolean) returns void language plpgsql as $$
begin
  if cond is distinct from true then raise exception 'ÉCHEC : %', label; end if;
  raise notice 'ok : %', label;
end $$;
-- une action interdite doit être refusée par Postgres (droits ou règles RLS)
create function pg_temp.refused(label text, stmt text) returns void language plpgsql as $$
begin
  execute stmt;
  raise exception 'ÉCHEC : % (accepté alors que ça devait être refusé)', label;
exception when insufficient_privilege then raise notice 'ok : % (refusé)', label;
end $$;
grant execute on all functions in schema pg_temp to authenticated;

select v as gy from fixtures where k = 'gy' \gset
select v as gid from fixtures where k = 'gid' \gset
select v as s1 from fixtures where k = 's1' \gset
select v as s2 from fixtures where k = 's2' \gset
select v as s3 from fixtures where k = 's3' \gset
select v as rx from fixtures where k = 'rx' \gset
select v as ry from fixtures where k = 'ry' \gset
select v as rz from fixtures where k = 'rz' \gset
grant select on fixtures, samples to authenticated;

insert into auth.users values ('aaaaaaaa-0000-0000-0000-000000000001'), ('bbbbbbbb-0000-0000-0000-000000000002');

-- ---------- le serveur lit le terrain exactement comme le générateur ----------
select pg_temp.ok('décodage SQL du terrain = générateur JS (' || count(*) || ' cases)', bool_and(public._cell('w', x, y, z) = v)) from samples;

-- ---------- joueur A ----------
set role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000001', false) \g /dev/null
select pg_temp.ok('miner de l''herbe à la main', (act_mine('w', 20, :gy, 3, null, 20.5, :gy + 1, 6.5) ->> 'ok')::boolean);
select pg_temp.ok('l''herbe donne de la terre', (select n from inventory where item = 2) = 1);
select pg_temp.ok('granite refusé à la main', act_mine('w', 20, :s1, 3, null, 20.5, :s1 + 1, 4.5) ->> 'err' = 'outil');
reset role;
update players set pos_at = now() - interval '1 hour';
set role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000001', false) \g /dev/null
do $$ begin perform act_mine('w', 500, 30, 500, null, 500.5, 31, 502.5); raise exception 'ÉCHEC : tronçon non figé accepté';
exception when raise_exception then if sqlerrm not like 'figer:%' then raise; end if; raise notice 'ok : tronçon non figé → demande « figer »'; end $$;

reset role;
update players set name = 'Pierre', pos_x = 20.5, pos_y = :s1 + 1, pos_z = 4.5, pos_at = now() where user_id = 'aaaaaaaa-0000-0000-0000-000000000001';
insert into inventory values ('aaaaaaaa-0000-0000-0000-000000000001', 'w', 9, 5), ('aaaaaaaa-0000-0000-0000-000000000001', 'w', 101, 10),
  ('aaaaaaaa-0000-0000-0000-000000000001', 'w', 48, 1), ('aaaaaaaa-0000-0000-0000-000000000001', 'w', 13, 1), ('aaaaaaaa-0000-0000-0000-000000000001', 'w', 105, 1);
set role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000001', false) \g /dev/null

select pg_temp.ok('fabriquer une pioche en bois', act_craft('w', 102) -> 'inv' ->> '102' = '1');
select pg_temp.ok('fabriquer la pioche de cristal (objet unique n°1)', act_craft('w', 201) -> 'unique' ->> 'serial' = '1');
select pg_temp.ok('recette inconnue refusée', act_craft('w', 999) ->> 'err' = 'recette inconnue');
select pg_sleep(1.2);
select pg_temp.ok('granite avec la pioche de cristal', (act_mine('w', 20, :s1, 3, 'nft1', 20.5, :s1 + 1, 4.5) ->> 'ok')::boolean);
select pg_temp.ok('granite aussitôt après : trop vite', act_mine('w', 20, :s2, 3, '102', 20.5, :s1 + 1, 4.5) ->> 'err' = 'trop vite');
select pg_temp.ok('pioche unique d''un autre (nft9) : palier main', (select act_mine('w', 20, :s3, 3, 'nft9', 20.5, :s1 + 1, 4.5) ->> 'err') in ('outil', 'trop vite'));
select pg_temp.ok('compteur de minage de la pioche unique', (select mined from uniques where serial = 1) = 1);

select pg_temp.ok('poser une porte (deux moitiés)', jsonb_array_length(act_place('w', 20, :gy, 3, 48, 52, 20.5, :gy + 1, 6.5) -> 'changes') = 2);
select pg_temp.ok('ouvrir la porte', act_toggle('w', 20, :gy, 3, 20.5, :gy + 1, 6.5) -> 'changes' -> 0 ->> 'id' = '54');
select pg_temp.ok('poser un objet absent du coffre', act_place('w', 21, :gy + 1, 3, 70, 70, 20.5, :gy + 1, 6.5) ->> 'err' = 'coffre vide');
select pg_temp.ok('transformer un objet en autre chose', act_place('w', 21, :gy + 1, 3, 48, 13, 20.5, :gy + 1, 6.5) ->> 'err' = 'objet non posable');
select pg_temp.ok('bloc hors de portée', act_mine('w', 30, :gy, 3, null, 20.5, :gy + 1, 6.5) ->> 'err' = 'trop loin');
select pg_temp.ok('téléportation refusée', act_mine('w', 300, 30, 300, null, 300.5, 31, 302.5) ->> 'err' = 'déplacement impossible');
select pg_temp.ok('retour au sanctuaire permis', act_mine('w', 8, 32, 8, null, 8.5, 33, 10.5) ->> 'err' = 'protégé');
select pg_temp.ok('signal de position', (act_pos('w', 10.5, 33, 10.5) ->> 'ok')::boolean);
select pg_temp.ok('ancienne fonction sans position fermée', not exists (select 1 from pg_proc where proname = 'act_mine' and pronargs = 5));
reset role;
update players set pos_at = now() - interval '1 minute';
set role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000001', false) \g /dev/null
select pg_temp.ok('revendiquer une parcelle à distance', act_claim('w', 2, 0, 20.5, :gy + 1, 6.5) ->> 'err' = 'il faut se trouver dans la parcelle');
select pg_temp.ok('revendiquer une parcelle', (act_claim('w', 1, 0, 20.5, :gy + 1, 6.5) ->> 'ok')::boolean);
select pg_temp.ok('la parcelle coûte 2 cristaux', (select n from inventory where item = 101) = 5);
select pg_temp.ok('revendiquer le sanctuaire', act_claim('w', 0, 0, 8.5, 33, 10.5) ->> 'ok' = 'false');
reset role;
update players set pos_at = now() - interval '1 minute';
set role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000001', false) \g /dev/null
select pg_temp.ok('rallumer la ruine', act_relight('w', :rx, :ry, :rz, :rx + 0.5, :ry, :rz + 2.5) -> 'unique' ->> 'id' = '203');
select pg_temp.ok('le réseau compte le validateur rallumé', (act_reseau('w') ->> 'n')::int = 1 and act_reseau('w') -> 'top' -> 0 ->> 'n' = '1');
select pg_temp.ok('le validateur ancien est signé', (select placed_by from blocks where x = :rx and y = :ry and z = :rz) = 'aaaaaaaa-0000-0000-0000-000000000001');
select pg_temp.ok('compte tout neuf : pas de cadeau', act_gift('w', '3,4:0', 'mouton') ->> 'err' = 'les animaux ne te connaissent pas encore');
reset role;
update players set created_at = now() - interval '1 day';
set role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000001', false) \g /dev/null
select pg_temp.ok('cadeau du mouton', act_gift('w', '3,4:0', 'mouton') -> 'inv' ->> '71' = '1');
select pg_temp.ok('même cadeau deux fois', act_gift('w', '3,4:0', 'mouton') ->> 'ok' = 'false');

-- ---------- triche directe : tout doit être refusé ----------
select pg_temp.refused('écrire un bloc', $q$insert into blocks (world, x, y, z, id) values ('w', 0, 40, 0, 70)$q$);
select pg_temp.refused('se donner des objets', $q$insert into inventory values ('aaaaaaaa-0000-0000-0000-000000000001', 'w', 70, 999)$q$);
select pg_temp.refused('modifier son compteur de série', $q$update players set serial = 0$q$);
select pg_temp.refused('inventer du terrain', $q$insert into chunks (world, cx, cz, gen, sy, data) values ('w', 9, 9, 1, 64, 'x')$q$);
select pg_temp.refused('appeler une fonction interne', $q$select _give('aaaaaaaa-0000-0000-0000-000000000001', 'w', 70, 999, '{}')$q$);
select pg_temp.refused('se créer un objet unique', $q$insert into uniques (user_id, world, serial, item) values ('aaaaaaaa-0000-0000-0000-000000000001', 'w', 99, 202)$q$);
update players set state = '{"barre": 1}';
select pg_temp.ok('les préférences restent modifiables', (select state ->> 'barre' from players) = '1');
select set_recovery_code() as code \gset

-- ---------- récompenses de validateur ----------
reset role;
update players set rewards_at = now() - interval '60 seconds';
update blocks set updated_at = now() - interval '1 hour' where id = 74; -- rallumé avant la période payée
set role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000001', false) \g /dev/null
select pg_temp.ok('récompenses : un validateur ancien, 1 minute → 1 cristal', act_rewards('w') ->> 'n' = '1');
select pg_temp.ok('récompense versée', (select n from inventory where item = 101) = 6);
reset role;
-- 8 validateurs posés : seuls 5 comptent ; 10 minutes → (5 + 5) parts × 50 slots / 25 = 20 cristaux
insert into blocks (world, x, y, z, id, placed_by, updated_at) select 'w', 100 + k, 40, 100, 13, 'aaaaaaaa-0000-0000-0000-000000000001', now() - interval '1 day' from generate_series(1, 8) k;
update players set rewards_at = now() - interval '10 minutes' where user_id = 'aaaaaaaa-0000-0000-0000-000000000001';
set role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000001', false) \g /dev/null
select pg_temp.ok('5 validateurs posés comptent au plus', (act_rewards('w') ->> 'n')::int = 20);
reset role;
update players set rewards_at = now() - interval '5 hours' where user_id = 'aaaaaaaa-0000-0000-0000-000000000001';
delete from rate_limits where kind = 'rewards'; -- l'appel précédent a vidé la réserve
set role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000001', false) \g /dev/null
select pg_temp.ok('30 minutes rattrapées au plus : 150 slots × 10 parts / 25 = 60', (act_rewards('w') ->> 'n')::int = 60);
select pg_temp.ok('coffre : 6 + 20 + 60', (select n from inventory where item = 101) = 86);
reset role;
delete from blocks where world = 'w' and x between 101 and 108 and y = 40 and z = 100;
set role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000001', false) \g /dev/null

-- ---------- joueur B ----------
select set_config('request.jwt.claim.sub', 'bbbbbbbb-0000-0000-0000-000000000002', false) \g /dev/null
select pg_temp.ok('B ne voit pas le coffre de A', (select count(*) from inventory) = 0);
select pg_temp.ok('B mine dans la parcelle de A', act_mine('w', 21, :gy, 4, null, 20.5, :gy + 1, 6.5) ->> 'err' = 'protégé');
select pg_temp.ok('B ouvre la porte de A', act_toggle('w', 20, :gy, 3, 20.5, :gy + 1, 6.5) ->> 'err' = 'protégé');
reset role;
insert into players (user_id, world, name) values ('bbbbbbbb-0000-0000-0000-000000000002', 'w', 'Lea') on conflict (user_id, world) do update set name = 'Lea';
set role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000001', false) \g /dev/null
select pg_temp.ok('A invite Lea', (act_member('w', 'lea', true) ->> 'ok')::boolean);
select set_config('request.jwt.claim.sub', 'bbbbbbbb-0000-0000-0000-000000000002', false) \g /dev/null
select pg_temp.ok('B mine chez A après invitation', (act_mine('w', 21, :gy, 4, null, 20.5, :gy + 1, 6.5) ->> 'ok')::boolean);

-- ---------- récupération de partie par code ----------
select pg_temp.ok('code inconnu refusé', claim_recovery('0000-0000-0000-0000') = -1);
select pg_temp.ok('B récupère la partie de A', claim_recovery(:'code') = 1);
select pg_temp.ok('le coffre a déménagé, sans doublon', (select n from inventory where item = 101) = 86 and (select count(*) from inventory where item = 2) = 1);
select pg_temp.ok('les objets uniques ont suivi', (select count(*) from uniques) = 2);
reset role;
select pg_temp.ok('A n''a plus rien', (select count(*) from inventory where user_id = 'aaaaaaaa-0000-0000-0000-000000000001') = 0);
select pg_temp.ok('les blocs signés ont suivi', (select placed_by from blocks where x = :rx and y = :ry and z = :rz) = 'bbbbbbbb-0000-0000-0000-000000000002');
select pg_temp.ok('la parcelle a suivi', (select owner from claims where cx = 1 and cz = 0) = 'bbbbbbbb-0000-0000-0000-000000000002');
set role authenticated;
select set_config('request.jwt.claim.sub', 'bbbbbbbb-0000-0000-0000-000000000002', false) \g /dev/null
select pg_temp.ok('rythme : 20 fabrications d''affilée, une partie refusée', (select count(*) filter (where act_craft('w', 999) ->> 'err' = 'trop d''actions') from generate_series(1, 20)) >= 5);
do $$ declare i int; n int := 0; begin
  for i in 1..6 loop
    begin
      if claim_recovery('0000-0000-0000-000' || i) <> -1 then raise exception 'ÉCHEC : code inventé accepté'; end if;
    exception when raise_exception then
      if sqlerrm like 'ÉCHEC%' then raise; end if;
      if sqlerrm like 'trop d''essais%' then n := n + 1; end if;
    end;
  end loop;
  if n < 3 then raise exception 'ÉCHEC : pas de limite sur les codes (% refus)', n; end if;
  raise notice 'ok : essais de codes en masse freinés';
end $$;
reset role;
-- ---------- chat, signalements, erreurs (003) ----------
set role authenticated;
select set_config('request.jwt.claim.sub', 'bbbbbbbb-0000-0000-0000-000000000002', false) \g /dev/null
select pg_temp.ok('chat : message accepté', (act_chat('w', '  salut   tout le monde ') ->> 'text') = 'salut tout le monde');
select pg_temp.ok('chat : pseudo pris dans la partie', (select name from chat order by id desc limit 1) = 'Pierre');
select pg_temp.ok('chat : insulte masquée', act_chat('w', 'Espèce de CONNARD !') ->> 'text' = 'Espèce de ******* !');
select pg_temp.ok('chat : mot qui contient une insulte laissé tel quel', act_chat('w', 'connardise') ->> 'text' = 'connardise');
select pg_temp.refused('écrire dans le chat sans passer par le serveur', $q$insert into chat (world, user_id, name, color, text) values ('w', 'bbbbbbbb-0000-0000-0000-000000000002', 'Admin', '#fff', 'x')$q$);
select pg_temp.ok('chat : rafale freinée', (select count(*) filter (where act_chat('w', 'spam') ->> 'err' = 'trop d''actions') from generate_series(1, 10)) >= 8);
select pg_temp.refused('se rendre la parole soi-même', $q$update players set muted_until = null where user_id = 'bbbbbbbb-0000-0000-0000-000000000002'$q$);
reset role;
insert into auth.users values ('cccccccc-0000-0000-0000-000000000003'), ('dddddddd-0000-0000-0000-000000000004'), ('eeeeeeee-0000-0000-0000-000000000005');
set role authenticated;
select set_config('request.jwt.claim.sub', 'cccccccc-0000-0000-0000-000000000003', false) \g /dev/null
select pg_temp.ok('compte neuf : signalement refusé', act_report('w', 'pierre') ->> 'err' = 'il faut avoir joué un peu');
reset role;
update players set mine_at = now(), serial = 20, created_at = now() - interval '1 day' where user_id in ('cccccccc-0000-0000-0000-000000000003', 'dddddddd-0000-0000-0000-000000000004', 'eeeeeeee-0000-0000-0000-000000000005');
insert into players (user_id, world, mine_at, serial, created_at) values ('dddddddd-0000-0000-0000-000000000004', 'w', now(), 20, now() - interval '1 day'), ('eeeeeeee-0000-0000-0000-000000000005', 'w', now(), 20, now() - interval '1 day') on conflict do nothing;
set role authenticated;
select pg_temp.ok('signaler un inconnu', act_report('w', 'personne') ->> 'err' = 'joueur inconnu');
select pg_temp.ok('premier signalement', act_report('w', 'pierre') ->> 'muted' = 'false');
select pg_temp.ok('signaler deux fois ne compte qu''une', act_report('w', 'pierre') ->> 'muted' = 'false');
select set_config('request.jwt.claim.sub', 'dddddddd-0000-0000-0000-000000000004', false) \g /dev/null
select pg_temp.ok('deuxième signalement', act_report('w', 'Pierre') ->> 'muted' = 'false');
select set_config('request.jwt.claim.sub', 'eeeeeeee-0000-0000-0000-000000000005', false) \g /dev/null
select pg_temp.ok('troisième signalement : muet', act_report('w', 'Pierre') ->> 'muted' = 'true');
select set_config('request.jwt.claim.sub', 'bbbbbbbb-0000-0000-0000-000000000002', false) \g /dev/null
select pg_temp.ok('un joueur muet ne parle plus', act_chat('w', 'coucou') ->> 'err' = 'muet');
select log_error('w', 'TypeError: x is undefined', 'at f (src/jeu/05-joueur.js:1)', '/src/jeu/05-joueur.js', 'test');
select log_error('w', 'TypeError: x is undefined', null, null, 'test');
select pg_temp.ok('erreurs illisibles par les joueurs', (select count(*) from client_errors) = 0);
reset role;
select pg_temp.ok('erreur répétée comptée une fois', (select n from client_errors where msg = 'TypeError: x is undefined') = 2);
select pg_temp.ok('muet pour une heure', (select muted_until between now() + interval '59 minutes' and now() + interval '61 minutes' from players where name = 'Pierre'));
-- ---------- malles (005) ----------
reset role;
update players set pos_at = now() - interval '1 minute', mine_at = now() - interval '1 minute';
insert into inventory (user_id, world, item, n) values ('bbbbbbbb-0000-0000-0000-000000000002', 'w', 98, 1), ('bbbbbbbb-0000-0000-0000-000000000002', 'w', 3, 10)
  on conflict (user_id, world, item) do update set n = excluded.n;
set role authenticated;
select set_config('request.jwt.claim.sub', 'bbbbbbbb-0000-0000-0000-000000000002', false) \g /dev/null
select pg_temp.ok('poser une malle', (act_place('w', 21, :gy, 4, 98, 98, 20.5, :gy + 1, 6.5) ->> 'ok')::boolean);
select pg_temp.ok('malle neuve vide', act_chest('w', 21, :gy, 4, 20.5, :gy + 1, 6.5) -> 'items' = '{}'::jsonb);
select pg_temp.ok('déposer 3 granites', act_chest_move('w', 21, :gy, 4, 3, 3, 20.5, :gy + 1, 6.5) -> 'items' ->> '3' = '3');
select pg_temp.ok('le sac a perdu 3 granites', (select n from inventory where item = 3) = 7);
select pg_temp.ok('déposer plus qu''on n''a', act_chest_move('w', 21, :gy, 4, 3, 50, 20.5, :gy + 1, 6.5) ->> 'err' = 'pas assez dans ton sac');
select pg_temp.ok('reprendre 2 granites', act_chest_move('w', 21, :gy, 4, 3, -2, 20.5, :gy + 1, 6.5) -> 'items' ->> '3' = '1');
select pg_temp.ok('reprendre plus qu''il n''y a : seulement le reste', act_chest_move('w', 21, :gy, 4, 3, -9, 20.5, :gy + 1, 6.5) -> 'items' = '{}'::jsonb);
select pg_temp.ok('déposer à nouveau', act_chest_move('w', 21, :gy, 4, 3, 4, 20.5, :gy + 1, 6.5) -> 'items' ->> '3' = '4');
select pg_temp.ok('ouvrir une malle qui n''existe pas', act_chest('w', 20, :gy, 4, 20.5, :gy + 1, 6.5) ->> 'err' = 'pas de malle ici');
select pg_temp.ok('malle hors de portée', act_chest('w', 21, :gy, 4, 20.5, :gy + 1, 12.5) ->> 'err' = 'trop loin');
select pg_temp.ok('les malles ne se lisent pas directement', (select count(*) from chests) = 0);
select set_config('request.jwt.claim.sub', 'dddddddd-0000-0000-0000-000000000004', false) \g /dev/null
select pg_temp.ok('malle dans la parcelle d''un autre : fermée', act_chest('w', 21, :gy, 4, 20.5, :gy + 1, 6.5) ->> 'err' = 'protégé');
select set_config('request.jwt.claim.sub', 'bbbbbbbb-0000-0000-0000-000000000002', false) \g /dev/null
select pg_temp.ok('casser la malle', (act_mine('w', 21, :gy, 4, null, 20.5, :gy + 1, 6.5) ->> 'ok')::boolean);
select pg_temp.ok('son contenu revient dans le sac', (select n from inventory where item = 3) = 10);
select pg_temp.ok('la malle cassée revient aussi', (select n from inventory where item = 98) = 1);
reset role;
select pg_temp.ok('plus de malle enregistrée', (select count(*) from chests) = 0);
-- ---------- durcissement (008) ----------
set role authenticated;
select set_config('request.jwt.claim.sub', 'bbbbbbbb-0000-0000-0000-000000000002', false) \g /dev/null
select pg_temp.refused('effacer sa fiche pour remettre ses compteurs à zéro', $q$delete from players where user_id = 'bbbbbbbb-0000-0000-0000-000000000002'$q$);
do $$ begin
  update players set world = 'ailleurs' where user_id = 'bbbbbbbb-0000-0000-0000-000000000002' and world = 'w';
  raise exception 'ÉCHEC : fiche déplacée dans un autre monde';
exception when raise_exception then
  if sqlerrm like 'ÉCHEC%' then raise; end if;
  raise notice 'ok : déplacer sa fiche (refusé)';
end $$;
select set_config('request.jwt.claim.sub', 'cccccccc-0000-0000-0000-000000000003', false) \g /dev/null
do $$ begin
  update players set name = 'pierre' where user_id = 'cccccccc-0000-0000-0000-000000000003' and world = 'w';
  raise exception 'ÉCHEC : pseudo d''un autre accepté';
exception when raise_exception then
  if sqlerrm like 'ÉCHEC%' then raise; end if;
  raise notice 'ok : prendre le pseudo d''un autre (refusé)';
end $$;
select set_config('request.jwt.claim.sub', 'cccccccc-0000-0000-0000-000000000003', false) \g /dev/null
update players set name = '  ' || repeat('x', 500) || chr(8203) || '  ', color = 'javascript:alert(1)' where user_id = 'cccccccc-0000-0000-0000-000000000003' and world = 'w';
select pg_temp.ok('pseudo coupé à 20 caractères, couleur corrigée', (select char_length(name) = 20 and color = '#8a7bef' from players where world = 'w'));
select pg_temp.ok('nouvelle partie sans effacer la fiche', (act_new_game('w') ->> 'ok')::boolean and (select state = '{}'::jsonb and serial = 20 from players where world = 'w'));
select pg_temp.ok('la méduse offre un cristal', act_gift('w', '9,9:1', 'meduse') ->> 'item' = '101');
select pg_temp.ok('message de chat énorme refusé', act_chat('w', repeat('a', 5000)) ->> 'err' = 'message trop long');
reset role;
-- un validateur posé à l'instant ne compte pas pour le temps passé
insert into blocks (world, x, y, z, id, placed_by) values ('w', 120, 40, 120, 13, 'cccccccc-0000-0000-0000-000000000003');
update players set rewards_at = now() - interval '20 minutes' where user_id = 'cccccccc-0000-0000-0000-000000000003';
delete from rate_limits where kind = 'rewards';
set role authenticated;
select set_config('request.jwt.claim.sub', 'cccccccc-0000-0000-0000-000000000003', false) \g /dev/null
select pg_temp.ok('validateur posé après coup : rien pour le passé', (act_rewards('w') ->> 'n')::int = 0);
reset role;
-- ---------- zones publiques (009) ----------
reset role;
update players set pos_at = now() - interval '1 hour', mine_at = now() - interval '1 minute';
delete from rate_limits;
set role authenticated;
select set_config('request.jwt.claim.sub', 'bbbbbbbb-0000-0000-0000-000000000002', false) \g /dev/null
select pg_temp.ok('miner une colonne de l''Atrium', act_mine('w', 14, 34, 10, null, 12.5, 33, 8.5) ->> 'err' = 'protégé');
select pg_temp.ok('revendiquer un tronçon de l''Atrium', act_claim('w', 0, 0, 12.5, 33, 8.5) ->> 'ok' = 'false');
reset role;
select pg_temp.ok('zone de la Cité protégée', _zone_publique(8, -56) and _zone_publique(30, -56) and not _zone_publique(8, -20) and not _zone_publique(20, 3));
\echo Tous les scénarios SQL passent.

-- ---------- échanges entre joueurs (011_echanges.sql) ----------
reset role;
insert into auth.users values ('f0000000-0000-0000-0000-000000000006'), ('f0000000-0000-0000-0000-000000000007');
insert into players (user_id, world, name) values ('f0000000-0000-0000-0000-000000000006', 'w', 'Fanny'), ('f0000000-0000-0000-0000-000000000007', 'w', 'Gus');
insert into inventory values ('f0000000-0000-0000-0000-000000000006', 'w', 101, 10), ('f0000000-0000-0000-0000-000000000007', 'w', 9, 30);
insert into uniques (user_id, world, serial, item, place, mined) values
  ('f0000000-0000-0000-0000-000000000006', 'w', 1, 201, 'forge de Fanny', 42),
  ('f0000000-0000-0000-0000-000000000006', 'w', 2, 203, '1, 2, 3', 0),
  ('f0000000-0000-0000-0000-000000000007', 'w', 1, 202, 'forge de Gus', 7);
insert into claims (world, cx, cz, owner, owner_name) values ('w', 40, 40, 'f0000000-0000-0000-0000-000000000006', 'Fanny'), ('w', 41, 40, 'f0000000-0000-0000-0000-000000000007', 'Gus');
delete from rate_limits;
set role authenticated;
select set_config('request.jwt.claim.sub', 'f0000000-0000-0000-0000-000000000006', false) \g /dev/null
select pg_temp.ok('offre à un inconnu', act_offer('w', 'Personne', '{"items":{"101":1}}', '{}') ->> 'err' = 'joueur inconnu dans ce monde');
select pg_temp.ok('offre sans rien donner', act_offer('w', 'Gus', '{}', '{"items":{"9":1}}') ->> 'err' = 'il faut donner quelque chose');
select pg_temp.ok('donner plus que ce qu''on a', act_offer('w', 'gus', '{"items":{"101":11}}', '{}') ->> 'manque' = 'ressources');
select pg_temp.ok('quantité négative', act_offer('w', 'Gus', '{"items":{"101":-5}}', '{}') ->> 'err' = 'offre invalide');
reset role;
delete from rate_limits;
set role authenticated;
select pg_temp.ok('un sceau ne s''échange pas', act_offer('w', 'Gus', '{"uniques":[2]}', '{}') ->> 'manque' = 'objet unique');
select pg_temp.ok('donner la parcelle d''un autre', act_offer('w', 'Gus', '{"parcels":[[41,40]]}', '{}') ->> 'manque' = 'parcelle');
select pg_temp.ok('demander ce que l''autre n''a pas', act_offer('w', 'Gus', '{"items":{"101":1}}', '{"uniques":[201]}') ->> 'err' = 'ce joueur n''a pas ce que tu demandes');
reset role;
delete from rate_limits;
set role authenticated;
select (act_offer('w', 'Gus', '{"items":{"101":4},"uniques":[1],"parcels":[[40,40]]}', '{"items":{"9":20},"uniques":[202],"parcels":[[41,40]]}') ->> 'id') as oid \gset
select pg_temp.ok('offre créée', :oid > 0);
select pg_temp.ok('accepter sa propre offre', act_offer_accept('w', :oid) ->> 'err' = 'offre introuvable');
select pg_temp.ok('l''offre figure dans mes offres', jsonb_array_length(act_offers('w') -> 'offers') = 1);
select pg_temp.refused('modifier une offre à la main', $q$update offers set status = 'acceptee'$q$);
select (act_offer('w', 'Gus', '{"items":{"101":10}}', '{}') ->> 'id') as oid2 \gset
select set_config('request.jwt.claim.sub', 'f0000000-0000-0000-0000-000000000007', false) \g /dev/null
select pg_temp.ok('Gus voit ses deux offres', jsonb_array_length(act_offers('w') -> 'offers') = 2);
select pg_temp.ok('échange accepté', (act_offer_accept('w', :oid) ->> 'ok')::boolean);
select pg_temp.ok('accepter deux fois', act_offer_accept('w', :oid) ->> 'err' = 'cette offre n''est plus ouverte');
select pg_temp.ok('le don promis deux fois ne passe plus', act_offer_accept('w', :oid2) ->> 'manque' = 'ressources');
select pg_temp.ok('refuser une offre', (act_offer_close('w', :oid2) ->> 'ok')::boolean);
reset role;
select pg_temp.ok('ressources échangées', (select array_agg(right(user_id::text, 1) || ':' || item || ':' || n order by user_id, item) from inventory where user_id::text like 'f0%' and n > 0)
  = array['6:9:20', '6:101:6', '7:9:10', '7:101:4']);
select pg_temp.ok('objets uniques échangés, avec leur histoire', (select array_agg(right(user_id::text, 1) || ':' || item || ':' || mined order by user_id, item) from uniques where user_id::text like 'f0%')
  = array['6:202:7', '6:203:0', '7:201:42']);
select pg_temp.ok('parcelles échangées', (select owner_name from claims where world = 'w' and cx = 40 and cz = 40) = 'Gus' and (select owner_name from claims where world = 'w' and cx = 41 and cz = 40) = 'Fanny');
select pg_temp.ok('offres closes', (select array_agg(status order by id) from offers) = array['acceptee', 'refusee']);

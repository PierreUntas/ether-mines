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
select pg_temp.ok('miner de l''herbe à la main', (act_mine('w', 20, :gy, 3, null) ->> 'ok')::boolean);
select pg_temp.ok('l''herbe donne de la terre', (select n from inventory where item = 2) = 1);
select pg_temp.ok('granite refusé à la main', act_mine('w', 20, :s1, 3, null) ->> 'err' = 'outil');
do $$ begin perform act_mine('w', 500, 30, 500, null); raise exception 'ÉCHEC : tronçon non figé accepté';
exception when raise_exception then if sqlerrm not like 'figer:%' then raise; end if; raise notice 'ok : tronçon non figé → demande « figer »'; end $$;

reset role;
update players set name = 'Pierre' where user_id = 'aaaaaaaa-0000-0000-0000-000000000001';
insert into inventory values ('aaaaaaaa-0000-0000-0000-000000000001', 'w', 9, 5), ('aaaaaaaa-0000-0000-0000-000000000001', 'w', 101, 10),
  ('aaaaaaaa-0000-0000-0000-000000000001', 'w', 48, 1), ('aaaaaaaa-0000-0000-0000-000000000001', 'w', 13, 1), ('aaaaaaaa-0000-0000-0000-000000000001', 'w', 105, 1);
set role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000001', false) \g /dev/null

select pg_temp.ok('fabriquer une pioche en bois', act_craft('w', 102) -> 'inv' ->> '102' = '1');
select pg_temp.ok('fabriquer la pioche de cristal (objet unique n°1)', act_craft('w', 201) -> 'unique' ->> 'serial' = '1');
select pg_temp.ok('recette inconnue refusée', act_craft('w', 999) ->> 'err' = 'recette inconnue');
select pg_sleep(1.2);
select pg_temp.ok('granite avec la pioche de cristal', (act_mine('w', 20, :s1, 3, 'nft1') ->> 'ok')::boolean);
select pg_temp.ok('granite aussitôt après : trop vite', act_mine('w', 20, :s2, 3, '102') ->> 'err' = 'trop vite');
select pg_temp.ok('pioche unique d''un autre (nft9) : palier main', (select act_mine('w', 20, :s3, 3, 'nft9') ->> 'err') in ('outil', 'trop vite'));
select pg_temp.ok('compteur de minage de la pioche unique', (select mined from uniques where serial = 1) = 1);

select pg_temp.ok('poser une porte (deux moitiés)', jsonb_array_length(act_place('w', 20, :gy, 3, 48, 52) -> 'changes') = 2);
select pg_temp.ok('ouvrir la porte', act_toggle('w', 20, :gy, 3) -> 'changes' -> 0 ->> 'id' = '54');
select pg_temp.ok('poser un objet absent du coffre', act_place('w', 21, :gy + 1, 3, 70, 70) ->> 'err' = 'coffre vide');
select pg_temp.ok('transformer un objet en autre chose', act_place('w', 21, :gy + 1, 3, 48, 13) ->> 'err' = 'objet non posable');
select pg_temp.ok('miner le sanctuaire', act_mine('w', 8, 32, 8, null) ->> 'err' = 'protégé');
select pg_temp.ok('revendiquer une parcelle', (act_claim('w', 1, 0) ->> 'ok')::boolean);
select pg_temp.ok('la parcelle coûte 2 cristaux', (select n from inventory where item = 101) = 5);
select pg_temp.ok('revendiquer le sanctuaire', act_claim('w', 0, 0) ->> 'ok' = 'false');
select pg_temp.ok('rallumer la ruine', act_relight('w', :rx, :ry, :rz) -> 'unique' ->> 'id' = '203');
select pg_temp.ok('le validateur ancien est signé', (select placed_by from blocks where x = :rx and y = :ry and z = :rz) = 'aaaaaaaa-0000-0000-0000-000000000001');
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
set role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000001', false) \g /dev/null
select pg_temp.ok('récompenses : 5 slots × poids 3', act_rewards('w') ->> 'slots' = '5');
select pg_temp.ok('récompenses versées : 15 cristaux', (select n from inventory where item = 101) = 20);

-- ---------- joueur B ----------
select set_config('request.jwt.claim.sub', 'bbbbbbbb-0000-0000-0000-000000000002', false) \g /dev/null
select pg_temp.ok('B ne voit pas le coffre de A', (select count(*) from inventory) = 0);
select pg_temp.ok('B mine dans la parcelle de A', act_mine('w', 21, :gy, 4, null) ->> 'err' = 'protégé');
select pg_temp.ok('B ouvre la porte de A', act_toggle('w', 20, :gy, 3) ->> 'err' = 'protégé');
reset role;
insert into players (user_id, world, name) values ('bbbbbbbb-0000-0000-0000-000000000002', 'w', 'Lea') on conflict (user_id, world) do update set name = 'Lea';
set role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000001', false) \g /dev/null
select pg_temp.ok('A invite Lea', (act_member('w', 'lea', true) ->> 'ok')::boolean);
select set_config('request.jwt.claim.sub', 'bbbbbbbb-0000-0000-0000-000000000002', false) \g /dev/null
select pg_temp.ok('B mine chez A après invitation', (act_mine('w', 21, :gy, 4, null) ->> 'ok')::boolean);

-- ---------- récupération de partie par code ----------
do $$ begin perform claim_recovery('0000-0000-0000-0000'); raise exception 'ÉCHEC : code inconnu accepté';
exception when raise_exception then if sqlerrm <> 'code inconnu' then raise; end if; raise notice 'ok : code inconnu refusé'; end $$;
select pg_temp.ok('B récupère la partie de A', claim_recovery(:'code') = 1);
select pg_temp.ok('le coffre a déménagé, sans doublon', (select n from inventory where item = 101) = 20 and (select count(*) from inventory where item = 2) = 1);
select pg_temp.ok('les objets uniques ont suivi', (select count(*) from uniques) = 2);
reset role;
select pg_temp.ok('A n''a plus rien', (select count(*) from inventory where user_id = 'aaaaaaaa-0000-0000-0000-000000000001') = 0);
select pg_temp.ok('les blocs signés ont suivi', (select placed_by from blocks where x = :rx and y = :ry and z = :rz) = 'bbbbbbbb-0000-0000-0000-000000000002');
select pg_temp.ok('la parcelle a suivi', (select owner from claims where cx = 1 and cz = 0) = 'bbbbbbbb-0000-0000-0000-000000000002');
\echo Tous les scénarios SQL passent.

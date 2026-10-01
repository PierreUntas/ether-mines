#!/usr/bin/env bash
# Rejoue le schéma complet sur un Postgres vide puis les scénarios de jeu et de triche.
# Usage : PGHOST=… PGPORT=… PGUSER=postgres tests/sql/run.sh   (base « mines_test » recréée à chaque fois)
set -euo pipefail
cd "$(dirname "$0")/../.."
DB=mines_test
quiet() { grep -v -E "NOTICE|WARNING|HINT|wal_level|^$" || true; }
run() { local out; out=$(psql -q -v ON_ERROR_STOP=1 -d $DB -f "$1" 2>&1) || { echo "$out"; echo "ÉCHEC dans $1"; exit 1; }; echo "$out" | quiet; }
psql -q -v ON_ERROR_STOP=1 -d postgres -c "drop database if exists $DB" -c "create database $DB" 2>&1 | quiet
run tests/sql/supabase-shim.sql
for m in supabase/migrations/*.sql; do run "$m"; done
for m in supabase/migrations/*.sql; do run "$m"; done   # les migrations doivent être rejouables sans erreur
run supabase/regles.sql
node tests/fixtures.mjs > /tmp/mines_fixtures.sql
run /tmp/mines_fixtures.sql
psql -v ON_ERROR_STOP=1 -d $DB -f tests/sql/scenarios.sql 2>&1 | sed -e 's/^psql:[^ ]* NOTICE:  /  /' -e 's/^NOTICE:  /  /' | grep -v '^$'
# la remise à zéro doit tout effacer, puis le schéma doit se réinstaller
psql -q -d $DB -c "drop table fixtures, samples"
run supabase/reset.sql
test "$(psql -Atq -d $DB -c "select count(*) from pg_tables where schemaname = 'public'")" = "0" || { echo "ÉCHEC : reset.sql laisse des tables"; exit 1; }
for m in supabase/migrations/*.sql; do run "$m"; done
echo "Remise à zéro puis réinstallation : ok"

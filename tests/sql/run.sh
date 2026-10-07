#!/usr/bin/env bash
# Replays the full schema on an empty Postgres, then the game and cheating scenarios.
# Usage: PGHOST=... PGPORT=... PGUSER=postgres tests/sql/run.sh   (the "mines_test" database is recreated each time)
set -euo pipefail
cd "$(dirname "$0")/../.."
DB=mines_test
quiet() { grep -v -E "NOTICE|WARNING|HINT|wal_level|^$" || true; }
run() { local out; out=$(psql -q -v ON_ERROR_STOP=1 -d $DB -f "$1" 2>&1) || { echo "$out"; echo "FAILED in $1"; exit 1; }; echo "$out" | quiet; }
psql -q -v ON_ERROR_STOP=1 -d postgres -c "drop database if exists $DB" -c "create database $DB" 2>&1 | quiet
run tests/sql/supabase-shim.sql
for m in supabase/migrations/*.sql; do run "$m"; done
for m in supabase/migrations/*.sql; do run "$m"; done   # migrations must be replayable without error
run supabase/rules.sql
node tests/fixtures.mjs > /tmp/mines_fixtures.sql
run /tmp/mines_fixtures.sql
psql -v ON_ERROR_STOP=1 -d $DB -f tests/sql/scenarios.sql 2>&1 | sed -e 's/^psql:[^ ]* NOTICE:  /  /' -e 's/^NOTICE:  /  /' | grep -v '^$'
# the reset must wipe everything, then the schema must reinstall
psql -q -d $DB -c "drop table fixtures, samples"
run supabase/reset.sql
test "$(psql -Atq -d $DB -c "select count(*) from pg_tables where schemaname = 'public'")" = "0" || { echo "FAILED: reset.sql leaves tables behind"; exit 1; }
run supabase/installation.sql   # the single file must be enough after a reset
run supabase/installation.sql   # ... and replay without error
test "$(psql -Atq -d $DB -c "select count(*) from rule_blocks")" -gt 100 || { echo "FAILED: rules missing after installation.sql"; exit 1; }
echo "Reset then reinstall: ok"

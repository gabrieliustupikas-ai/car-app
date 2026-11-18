#!/usr/bin/env bash
# Applies every Supabase migration + seed to a throwaway Postgres 16/PostGIS cluster and runs db tests.
# Requirements: postgresql-16 and postgresql-16-postgis-3 (apt), or set PG_BIN to their bin dir.
# With the Supabase CLI + Docker you can instead run: supabase db reset && psql -f supabase/tests/db_test.sql
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PG_BIN="${PG_BIN:-/usr/lib/postgresql/16/bin}"
WORK="$(mktemp -d)"
PORT="${PORT:-54329}"
RUN_AS=""
if [ "$(id -u)" = "0" ]; then RUN_AS="runuser -u postgres --"; chown postgres "$WORK"; fi
cleanup() { $RUN_AS "$PG_BIN/pg_ctl" -D "$WORK/data" -m immediate stop >/dev/null 2>&1 || true; rm -rf "$WORK"; }
trap cleanup EXIT

$RUN_AS "$PG_BIN/initdb" -D "$WORK/data" -U postgres -A trust >/dev/null
$RUN_AS "$PG_BIN/pg_ctl" -D "$WORK/data" -o "-p $PORT -k $WORK -c listen_addresses=''" -l "$WORK/log" start >/dev/null
PSQL=(psql -X -h "$WORK" -p "$PORT" -U postgres -v ON_ERROR_STOP=1 -q -t -A)
"${PSQL[@]}" -d postgres -c "create database roadclub"
"${PSQL[@]}" -d roadclub -c "alter database roadclub set search_path = \"\$user\", public, extensions"
"${PSQL[@]}" -d roadclub -f "$ROOT/supabase/tests/supabase_stub.sql"
for f in "$ROOT"/supabase/migrations/*.sql; do
  echo "→ $(basename "$f")"
  "${PSQL[@]}" -d roadclub -f "$f"
done
for f in seed.sql seed_klaipeda.sql; do
  echo "→ $f"
  "${PSQL[@]}" -d roadclub -f "$ROOT/supabase/$f"
done
echo "→ db_test.sql"
"${PSQL[@]}" -d roadclub -f "$ROOT/supabase/tests/db_test.sql"

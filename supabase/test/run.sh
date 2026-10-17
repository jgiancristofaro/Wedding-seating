#!/usr/bin/env bash
# Runs the migration + access-policy tests against a throwaway local Postgres (no Supabase needed).
set -euo pipefail
PGBIN=${PGBIN:-$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)}
DIR=$(mktemp -d)
PORT=${PGPORT_TEST:-54329}
cleanup() { "$PGBIN/pg_ctl" -D "$DIR/data" -m immediate stop >/dev/null 2>&1 || true; rm -rf "$DIR"; }
trap cleanup EXIT
RUNAS=""
if [ "$(id -u)" = "0" ]; then chown -R postgres "$DIR"; RUNAS="sudo -u postgres"; command -v sudo >/dev/null || RUNAS="su postgres -c"; fi
run() { if [ "$RUNAS" = "su postgres -c" ]; then su postgres -c "$*"; elif [ -n "$RUNAS" ]; then $RUNAS "$@"; else "$@"; fi; }
run "$PGBIN/initdb" -D "$DIR/data" -U postgres >/dev/null
run "$PGBIN/pg_ctl" -D "$DIR/data" -o "-p $PORT -k $DIR -c listen_addresses=''" -w start >/dev/null
PSQL="$PGBIN/psql -h $DIR -p $PORT -U postgres -v ON_ERROR_STOP=1 -q"
HERE=$(cd "$(dirname "$0")" && pwd)
run $PSQL -f "$HERE/bootstrap.sql"
run $PSQL -f "$HERE/../migrations/0001_init.sql"
run $PSQL -f "$HERE/policies.test.sql"
echo "SQL policy tests passed"

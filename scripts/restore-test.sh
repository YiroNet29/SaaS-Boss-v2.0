#!/usr/bin/env bash
# Rehearses a backup and a restore on this project's LOCAL Supabase stack only, never a real database:
#   1. counts the rows in every table;
#   2. makes an encrypted backup with scripts/backup-db.sh (the nightly backup's script);
#   3. wipes the tables;
#   4. restores the backup the way README → Backups → Restore says, then re-runs the migrations;
#   5. checks every count matches, row-level security is on everywhere, and the API still answers.
#
#   bash scripts/restore-test.sh
#
# Needs the local stack running (npm run local:start), psql, gpg, and a pg_dump at least as new as the
# local database (PostgreSQL 17). GitHub's "Checks" runs it after the browser tests.
set -euo pipefail
cd "$(dirname "$0")/.."

CONTAINER=supabase_db_stacktrack_local
export PGOPTIONS='--client-min-messages=warning' # no "already exists, skipping" notices
DB_URL="postgresql://postgres:postgres@127.0.0.1:55622/postgres"

# Safety: only this project's local database, on its own port.
docker ps --format '{{.Names}}' | grep -qx "$CONTAINER" || { echo "The local stack isn't running (npm run local:start)."; exit 1; }
docker port "$CONTAINER" 5432 | grep -q ':55622$' || { echo "Port 55622 isn't this project's local database; refusing to wipe anything."; exit 1; }

q() { psql "$DB_URL" -v ON_ERROR_STOP=1 -qtAX -c "$1"; }
counts() {
  q "select string_agg(format('%s=%s', c.relname,
        (xpath('/row/n/text()', query_to_xml(format('select count(*) as n from public.%I', c.relname), false, true, '')))[1]::text),
        ' ' order by c.relname)
     from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind = 'r'"
}

before=$(counts)
[ -n "$before" ] || { echo "No tables in the local database."; exit 1; }
echo "Before: $before"

work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
# A throwaway passphrase: this backup never leaves the machine.
BACKUP_PASSPHRASE="restore-test-$(od -An -N12 -tx1 /dev/urandom | tr -d ' \n')"
export BACKUP_PASSPHRASE
SUPABASE_DB_URL="$DB_URL" bash scripts/backup-db.sh "$work"
file=$(ls "$work"/*.gpg)

# Wipe: drop the tables (the public schema) and put back the access Supabase gives that schema.
q "drop schema public cascade;
   create schema public;
   grant usage on schema public to postgres, anon, authenticated, service_role;
   grant all on schema public to postgres, service_role;
   alter default privileges in schema public grant all on tables to postgres, anon, authenticated, service_role;
   alter default privileges in schema public grant all on functions to postgres, anon, authenticated, service_role;
   alter default privileges in schema public grant all on sequences to postgres, anon, authenticated, service_role;"
[ "$(q "select count(*) from pg_tables where schemaname = 'public'")" = "0" ] || { echo "The wipe didn't empty the database."; exit 1; }
echo "Wiped."

# Restore, as in README → Backups → Restore.
gpg --batch --quiet --pinentry-mode loopback --passphrase-fd 3 --decrypt "$file" 3<<<"$BACKUP_PASSPHRASE" | gunzip > "$work/restore.sql"
psql "$DB_URL" -v ON_ERROR_STOP=1 -q -f "$work/restore.sql" > /dev/null
for m in supabase/migrations/0*.sql; do psql "$DB_URL" -v ON_ERROR_STOP=1 -q -f "$m" > /dev/null; done
q "notify pgrst, 'reload schema';" > /dev/null
echo "Restored, migrations re-run."

after=$(counts)
echo "After:  $after"
problems=0
if [ "$before" != "$after" ]; then echo "PROBLEM: the row counts differ."; problems=1; fi

no_rls=$(q "select coalesce(string_agg(c.relname, ', '), '') from pg_class c join pg_namespace n on n.oid = c.relnamespace
            where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity")
if [ -n "$no_rls" ]; then echo "PROBLEM: row-level security is off on: $no_rls"; problems=1; fi

KEY=$(grep '^NEXT_PUBLIC_SUPABASE_ANON_KEY=' .env.development.local | cut -d= -f2-)
code=000
for _ in $(seq 1 20); do
  code=$(curl -s -o /dev/null -w '%{http_code}' -H "apikey: $KEY" 'http://127.0.0.1:55621/rest/v1/workspaces?select=id&limit=1')
  [ "$code" = "200" ] && break
  sleep 1
done
if [ "$code" != "200" ]; then echo "PROBLEM: the API answered HTTP $code after the restore."; problems=1; fi

if [ "$problems" = 0 ]; then
  echo "Backup and restore OK: $(echo "$after" | wc -w) tables, every row count matches, row-level security on, API answers."
fi
exit "$problems"

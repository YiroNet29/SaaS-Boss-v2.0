#!/usr/bin/env bash
# Dumps the StackTrack tables (public schema) and encrypts the dump with a passphrase.
#
#   SUPABASE_DB_URL="postgresql://..." BACKUP_PASSPHRASE="..." scripts/backup-db.sh [output_dir]
#
# Restore: see "Backups" in README.md.
set -euo pipefail

out_dir="${1:-backup}"
: "${SUPABASE_DB_URL:?SUPABASE_DB_URL is not set}"
: "${BACKUP_PASSPHRASE:?BACKUP_PASSPHRASE is not set}"
if [ "${#BACKUP_PASSPHRASE}" -lt 16 ]; then
  echo "BACKUP_PASSPHRASE must be at least 16 characters." >&2
  exit 1
fi

mkdir -p "$out_dir"
file="$out_dir/stacktrack-$(date -u +%Y-%m-%d).sql.gz.gpg"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

pg_dump "$SUPABASE_DB_URL" \
  --schema=public --no-owner --no-privileges --quote-all-identifiers \
  --file="$tmp/dump.sql"

# Refuse to store a dump that clearly isn't ours (wrong database, empty schema, ...).
if ! grep -q 'CREATE TABLE "public"."workspaces"' "$tmp/dump.sql"; then
  echo "Dump looks wrong: the workspaces table is missing. Is SUPABASE_DB_URL the right project?" >&2
  exit 1
fi

# A fresh database (or new Supabase project) already has the public schema.
sed -i 's/^CREATE SCHEMA "public";$/CREATE SCHEMA IF NOT EXISTS "public";/' "$tmp/dump.sql"

gzip -9 "$tmp/dump.sql"
# Passphrase goes in on file descriptor 3, never on the command line.
gpg --batch --yes --quiet --pinentry-mode loopback --passphrase-fd 3 \
  --symmetric --cipher-algo AES256 --output "$file" "$tmp/dump.sql.gz" 3<<<"$BACKUP_PASSPHRASE"

echo "Encrypted backup written: $file ($(du -h "$file" | cut -f1))"

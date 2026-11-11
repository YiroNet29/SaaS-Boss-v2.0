#!/usr/bin/env bash
# Starts what the app and its browser tests need inside a Claude cloud session: a Linux sandbox where you
# are root and the Docker engine isn't running yet. Run it again after the sandbox restarts (the stack
# stops with it; the local data is kept).
#
# On your own computer you don't need this: use `npm run local:start` and `npm run dev:local`.
#
#   bash scripts/cloud-up.sh            # Docker engine + local Supabase + the app on http://localhost:3210
#   bash scripts/cloud-up.sh --no-dev   # the same without the app (before `npm run test:e2e`, which starts its own)
set -u
cd "$(dirname "$0")/.."
LOG="${LOG_DIR:-/tmp/stacktrack-local}"
mkdir -p "$LOG"

[ -d node_modules ] || npm ci --no-audit --no-fund > "$LOG/npm-ci.log" 2>&1 || { echo "npm ci failed; see $LOG/npm-ci.log"; exit 1; }

# 1. Docker engine. After a sandbox restart its lock files still name processes that are gone.
if ! docker info >/dev/null 2>&1; then
  for f in /var/run/docker.pid /var/run/docker/containerd/containerd.pid; do
    if [ -f "$f" ] && ! ps -p "$(cat "$f")" >/dev/null 2>&1; then rm -f "$f"; fi
  done
  (nohup dockerd > "$LOG/dockerd.log" 2>&1 &)
  for _ in $(seq 1 30); do docker info >/dev/null 2>&1 && break; sleep 1; done
fi
docker info >/dev/null 2>&1 || { echo "The Docker engine didn't start; see $LOG/dockerd.log"; exit 1; }

# 2. This project's local Supabase. Images come from Docker Hub (the default registry is often out of reach here).
if [ "$(docker ps -q --filter name=supabase_kong_stacktrack_local | wc -l)" = "0" ] || ! node scripts/local-env.mjs >/dev/null 2>&1; then
  started=0
  for _ in 1 2 3; do
    if SUPABASE_INTERNAL_IMAGE_REGISTRY=docker.io timeout 900 npm run local:start > "$LOG/supabase-start.log" 2>&1; then started=1; break; fi
    sleep 20 # usually the database is still recovering after a hard stop
  done
  [ "$started" = 1 ] || { echo "The local Supabase didn't start; see $LOG/supabase-start.log"; exit 1; }
fi

# 3. Wait until the API answers real queries.
KEY=$(grep '^NEXT_PUBLIC_SUPABASE_ANON_KEY=' .env.development.local | cut -d= -f2-)
ready=0
for _ in $(seq 1 60); do
  if [ "$(curl -s -o /dev/null -w '%{http_code}' -H "apikey: $KEY" 'http://127.0.0.1:55621/rest/v1/workspaces?limit=1')" = "200" ]; then ready=1; break; fi
  sleep 2
done
[ "$ready" = 1 ] || { echo "The local Supabase API isn't answering yet; try again in a minute."; exit 1; }
echo "local Supabase ready ($(docker ps -q --filter name=stacktrack_local | wc -l) containers)"

# 4. The app.
if [ "${1:-}" != "--no-dev" ]; then
  pgrep -f "next dev" >/dev/null || (nohup npm run dev:local > "$LOG/dev.log" 2>&1 &)
  for _ in $(seq 1 40); do [ "$(curl -s -o /dev/null -w '%{http_code}' http://localhost:3210/)" = "200" ] && break; sleep 1; done
  echo "app http://localhost:3210 → $(curl -s -o /dev/null -w '%{http_code}' http://localhost:3210/)"
fi

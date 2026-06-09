#!/usr/bin/env bash
# Dev helper for environments without Docker: starts local Postgres 16, API (:4000) and Vite (:5173).
set -e
pg_isready -q || pg_ctlcluster 16 main start
sleep 2
cd "$(dirname "$0")"
(cd server && setsid nohup npx tsx src/index.ts > /tmp/server.log 2>&1 &)
(cd client && setsid nohup npx vite --host 127.0.0.1 > /tmp/vite.log 2>&1 &)
sleep 10; curl -s localhost:4000/api/v1/meta | head -c 80; echo

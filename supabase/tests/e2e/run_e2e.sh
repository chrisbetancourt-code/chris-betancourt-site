#!/bin/bash
# Full browser test run. Needs: Postgres 16 server binaries, a PostgREST binary, Node, Playwright (python).
# Usage: sudo PGREST=/path/to/postgrest ./run_e2e.sh [screenshot_dir]
set -e
H="$(cd "$(dirname "$0")" && pwd)"
PGREST=${PGREST:-/tmp/pgt/postgrest}
pkill -x postgrest 2>/dev/null || true; pkill -x node 2>/dev/null || true
"$H/setup_db.sh"
(nohup "$PGREST" "$H/postgrest.conf" >/tmp/pgrest.log 2>&1 &)
(nohup node "$H/fake_supabase.js" >/tmp/fake_supabase.log 2>&1 &)
sleep 2
python3 "$H/e2e.py" "${1:-/tmp}"

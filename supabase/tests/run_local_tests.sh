#!/bin/bash
# Runs the privacy tests on a throwaway local Postgres (needs Postgres 16 server binaries).
# Usage: sudo ./run_local_tests.sh      (starts its own temporary database on port 54329)
set -e
HERE="$(cd "$(dirname "$0")" && pwd)"
PGBIN=${PGBIN:-/usr/lib/postgresql/16/bin}
PSQL="psql -h /tmp -p 54329 -U postgres -v ON_ERROR_STOP=1 -q -P pager=off"
$PSQL -d postgres -c "drop database if exists portal_test" -c "create database portal_test"
$PSQL -d portal_test -f "$HERE/local_stubs.sql"
$PSQL -d portal_test -f "$HERE/../migrations/001_portal.sql"
$PSQL -d portal_test -f "$HERE/../seed.sql"
$PSQL -d portal_test -f "$HERE/rls_test.sql"

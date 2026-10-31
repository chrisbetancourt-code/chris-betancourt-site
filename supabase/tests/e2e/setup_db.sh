#!/bin/bash
# fresh e2e database: stubs + migration + seed + three login users
set -e
H="$(cd "$(dirname "$0")" && pwd)"; S="$H/../.."
P="psql -h /tmp -p 54329 -U postgres -v ON_ERROR_STOP=1 -q"
$P -d postgres -c "drop database if exists portal_e2e with (force)" -c "create database portal_e2e"
$P -d portal_e2e -f "$S/tests/local_stubs.sql" >/dev/null 2>&1
$P -d portal_e2e -f "$S/migrations/001_portal.sql"
$P -d portal_e2e -f "$S/seed.sql"
$P -d portal_e2e <<SQL
insert into auth.users (id, email) values
 ('00000000-0000-0000-0000-0000000000a1','chris@test.local'),
 ('00000000-0000-0000-0000-0000000000b1','michael@test.local'),
 ('00000000-0000-0000-0000-0000000000c1','bea@test.local');
update public.profiles set role='teacher', full_name='Chris Betancourt' where email='chris@test.local';
update public.profiles set full_name='Michael Delgado' where email='michael@test.local';
update public.profiles set full_name='Bea Student' where email='bea@test.local';
update public.students set user_id='00000000-0000-0000-0000-0000000000b1', email='michael@test.local' where full_name='Michael Delgado';
insert into public.students (full_name, email, user_id, stage) values ('Bea Student','bea@test.local','00000000-0000-0000-0000-0000000000c1','Beginner acoustic');
SQL
echo "e2e db ready"

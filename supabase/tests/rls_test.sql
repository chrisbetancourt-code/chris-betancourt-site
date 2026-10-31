-- Automated privacy / authorization tests for the portal database.
-- Runs against a LOCAL throwaway Postgres (see run_local_tests.sh), with the
-- real migration + seed loaded. Each check prints PASS or FAIL.
create schema t;
create table t.results (n serial, name text, ok boolean, detail text);

-- helpers: run a statement "as" a given user (null = anonymous visitor)
create function t.run(uid uuid, stmt text, as_role text default 'authenticated') returns bigint
language plpgsql as $$
declare c bigint;
begin
  perform set_config('request.jwt.claim.sub', coalesce(uid::text, ''), true);
  execute 'set local role ' || as_role;
  begin
    execute stmt;
    get diagnostics c = row_count;
  exception when others then
    c := -1;                            -- -1 means the database refused with an error
  end;
  execute 'reset role';
  return c;
end $$;

create function t.cnt(uid uuid, q text) returns bigint
language plpgsql as $$
declare c bigint;
begin
  perform set_config('request.jwt.claim.sub', coalesce(uid::text, ''), true);
  execute 'set local role authenticated';
  begin
    execute 'select count(*) from (' || q || ') x' into c;
  exception when others then c := -1; end;
  execute 'reset role';
  return c;
end $$;

create function t.check(name text, ok boolean, detail text default '') returns void
language sql as $$ insert into t.results (name, ok, detail) values (name, ok, detail) $$;

do $fx$
declare
  teacher uuid := gen_random_uuid(); michael uuid := gen_random_uuid();
  bea uuid := gen_random_uuid();     stranger uuid := gen_random_uuid();
  sm uuid; sb uuid; l2 uuid; lb uuid; ld uuid; am uuid; ab uuid; ad uuid;
  exm uuid; exb uuid; subm uuid; subb uuid; r bigint; evil uuid := gen_random_uuid();
begin
  insert into auth.users (id, email) values
    (teacher, 'teacher@x.test'), (michael, 'michael@x.test'), (bea, 'bea@x.test'), (stranger, 'nobody@x.test');
  update public.profiles set role = 'teacher' where id = teacher;      -- done by the owner in the SQL editor
  select id into sm from public.students where full_name = 'Michael Delgado';
  update public.students set user_id = michael, email = 'michael@x.test' where id = sm;
  insert into public.students (full_name, email, user_id) values ('Bea Student', 'bea@x.test', bea) returning id into sb;
  select lesson_id, id into l2, am from public.assignments where student_id = sm;
  insert into public.lessons (title) values ('Bea lesson') returning id into lb;
  insert into public.lessons (title) values ('Unpublished draft lesson') returning id into ld;
  insert into public.exercises (lesson_id, title, requires_video) values (lb, 'Bea exercise', true) returning id into exb;
  insert into public.exercises (lesson_id, title) values (ld, 'Draft exercise');
  select id into exm from public.exercises where lesson_id = l2 and position = 3;
  insert into public.assignments (student_id, lesson_id, status) values (sb, lb, 'published') returning id into ab;
  insert into public.assignments (student_id, lesson_id, status) values (sm, ld, 'draft') returning id into ad;
  insert into public.lesson_objectives (lesson_id, text) values (lb, 'Bea objective');
  insert into public.teacher_notes (student_id, body) values (sb, 'private note about Bea');
  insert into public.exercise_completions (assignment_id, exercise_id, student_id) values (ab, exb, sb);
  insert into public.submissions (student_id, assignment_id, exercise_id, storage_path, size_bytes)
    values (sb, ab, exb, sb || '/' || ab || '/b.mp4', 1000) returning id into subb;
  insert into public.feedback (submission_id, body) values (subb, 'Bea feedback');
  insert into storage.objects (bucket_id, name) values ('submissions', sb || '/' || ab || '/b.mp4');

  -- ===== visibility: students only see their own world =====
  perform t.check('Teacher sees both students', t.cnt(teacher, 'select 1 from public.students') = 2);
  perform t.check('Michael sees only his own student row', t.cnt(michael, 'select 1 from public.students') = 1
    and t.cnt(michael, format('select 1 from public.students where id=%L', sb)) = 0);
  perform t.check('Bea cannot open Michael''s student row by ID', t.cnt(bea, format('select 1 from public.students where id=%L', sm)) = 0);
  perform t.check('Michael cannot see Bea''s assignment by ID', t.cnt(michael, format('select 1 from public.assignments where id=%L', ab)) = 0);
  perform t.check('Michael cannot see Bea''s lesson by ID', t.cnt(michael, format('select 1 from public.lessons where id=%L', lb)) = 0);
  perform t.check('Michael cannot see Bea''s exercises', t.cnt(michael, format('select 1 from public.exercises where lesson_id=%L', lb)) = 0);
  perform t.check('Michael cannot see Bea''s objectives', t.cnt(michael, format('select 1 from public.lesson_objectives where lesson_id=%L', lb)) = 0);
  perform t.check('Michael cannot see Bea''s video submission', t.cnt(michael, format('select 1 from public.submissions where id=%L', subb)) = 0);
  perform t.check('Michael cannot see Bea''s feedback', t.cnt(michael, format('select 1 from public.feedback where submission_id=%L', subb)) = 0);
  perform t.check('Michael cannot see Bea''s completions', t.cnt(michael, 'select 1 from public.exercise_completions') = 0);
  perform t.check('Michael sees only his published assignment (draft hidden)', t.cnt(michael, 'select 1 from public.assignments') = 1
    and t.cnt(michael, format('select 1 from public.assignments where id=%L', ad)) = 0);
  perform t.check('Draft lesson content hidden from its own student', t.cnt(michael, format('select 1 from public.lessons where id=%L', ld)) = 0
    and t.cnt(michael, format('select 1 from public.exercises where lesson_id=%L', ld)) = 0);
  perform t.check('Michael can see his own published lesson + exercises', t.cnt(michael, format('select 1 from public.lessons where id=%L', l2)) = 1
    and t.cnt(michael, format('select 1 from public.exercises where lesson_id=%L', l2)) = 5);
  perform t.check('Private teacher notes invisible to students', t.cnt(michael, 'select 1 from public.teacher_notes') = 0
    and t.cnt(bea, 'select 1 from public.teacher_notes') = 0);
  perform t.check('Teacher can read private notes', t.cnt(teacher, 'select 1 from public.teacher_notes') = 2);
  perform t.check('Students cannot read other profiles', t.cnt(michael, 'select 1 from public.profiles') = 1);
  perform t.check('Unlinked login sees nothing', t.cnt(stranger, 'select 1 from public.students') = 0
    and t.cnt(stranger, 'select 1 from public.lessons') = 0 and t.cnt(stranger, 'select 1 from public.assignments') = 0);
  perform t.check('Anonymous visitor gets an error on students', t.run(null, 'select * from public.students', 'anon') = -1);
  perform t.check('Anonymous visitor gets an error on lessons', t.run(null, 'select * from public.lessons', 'anon') = -1);

  -- ===== no privilege escalation =====
  perform t.check('Student cannot promote self to teacher', t.run(michael, format('update public.profiles set role=%L where id=%L', 'teacher', michael)) <> 1);
  perform t.check('Role is still student afterwards', (select role from public.profiles where id = michael) = 'student');
  perform t.check('Student cannot insert a teacher profile', t.run(michael, format('insert into public.profiles (id, role) values (%L, %L)', gen_random_uuid(), 'teacher')) = -1);
  insert into auth.users (id, email, raw_user_meta_data) values (evil, 'evil@x.test', '{"role":"teacher","full_name":"Evil"}');
  perform t.check('Signup metadata cannot grant teacher role', (select role from public.profiles where id = evil) = 'student');
  perform t.check('Student cannot edit own student record', t.run(michael, format('update public.students set stage=%L where id=%L', 'hacked', sm)) <> 1);
  perform t.check('Student cannot create students', t.run(michael, format('insert into public.students (full_name) values (%L)', 'x')) = -1);
  perform t.check('Student cannot create lessons', t.run(michael, format('insert into public.lessons (title) values (%L)', 'x')) = -1);
  perform t.check('Student cannot edit lesson content', t.run(michael, format('update public.lessons set title=%L where id=%L', 'hacked', l2)) <> 1);
  perform t.check('Student cannot edit exercises', t.run(michael, format('update public.exercises set title=%L where lesson_id=%L', 'hacked', l2)) <> 1);
  perform t.check('Student cannot change assignments (mark lesson complete / publish)', t.run(michael, format('update public.assignments set completed_at=now() where id=%L', am)) <> 1);
  perform t.check('Student cannot create assignments for himself', t.run(michael, format('insert into public.assignments (student_id, lesson_id, status) values (%L,%L,%L)', sm, lb, 'published')) = -1);
  perform t.check('Student cannot write teacher notes', t.run(michael, format('insert into public.teacher_notes (student_id, body) values (%L,%L)', sm, 'x')) = -1);
  perform t.check('Student cannot write feedback', t.run(michael, format('insert into public.feedback (submission_id, body) values (%L,%L)', subb, 'x')) = -1);
  perform t.check('Student cannot mark objectives achieved', t.run(michael, format('insert into public.objective_achievements (assignment_id, objective_id) select %L, id from public.lesson_objectives limit 1', am)) <> 1);

  -- ===== exercise completions =====
  perform t.check('Michael can mark his own exercise complete', t.run(michael, format('insert into public.exercise_completions (assignment_id, exercise_id, student_id) values (%L,%L,%L)', am, exm, sm)) = 1);
  perform t.check('Michael cannot mark complete on Bea''s assignment', t.run(michael, format('insert into public.exercise_completions (assignment_id, exercise_id, student_id) values (%L,%L,%L)', ab, exb, sm)) = -1);
  perform t.check('Michael cannot complete as Bea', t.run(michael, format('insert into public.exercise_completions (assignment_id, exercise_id, student_id) values (%L,%L,%L)', am, exm, sb)) = -1);
  perform t.check('Cannot complete an exercise from another lesson', t.run(michael, format('insert into public.exercise_completions (assignment_id, exercise_id, student_id) values (%L,%L,%L)', am, exb, sm)) = -1);
  perform t.check('Cannot complete on an unpublished assignment', t.run(michael, format('insert into public.exercise_completions (assignment_id, exercise_id, student_id) values (%L,%L,%L)', ad, (select id from public.exercises where lesson_id = ld), sm)) = -1);
  perform t.check('Michael cannot undo Bea''s completion', t.run(michael, format('delete from public.exercise_completions where assignment_id=%L', ab)) = 0);
  perform t.check('Teacher can see completions', t.cnt(teacher, 'select 1 from public.exercise_completions') = 2);
  perform t.check('Michael can un-complete his own', t.run(michael, format('delete from public.exercise_completions where assignment_id=%L', am)) = 1);

  -- ===== video submissions =====
  perform t.check('Michael can submit a video to his own exercise', t.run(michael, format('insert into public.submissions (student_id, assignment_id, exercise_id, storage_path, size_bytes) values (%L,%L,%L,%L,5000)', sm, am, exm, sm || '/' || am || '/m1.mp4')) = 1);
  perform t.check('Cannot submit as another student', t.run(michael, format('insert into public.submissions (student_id, assignment_id, storage_path, size_bytes) values (%L,%L,%L,5000)', sb, am, sb || '/' || am || '/x.mp4')) = -1);
  perform t.check('Cannot submit to another student''s assignment', t.run(michael, format('insert into public.submissions (student_id, assignment_id, storage_path, size_bytes) values (%L,%L,%L,5000)', sm, ab, sm || '/' || ab || '/x.mp4')) = -1);
  perform t.check('Cannot submit to an unpublished assignment', t.run(michael, format('insert into public.submissions (student_id, assignment_id, storage_path, size_bytes) values (%L,%L,%L,5000)', sm, ad, sm || '/' || ad || '/x.mp4')) = -1);
  perform t.check('Storage path must sit in own folder', t.run(michael, format('insert into public.submissions (student_id, assignment_id, storage_path, size_bytes) values (%L,%L,%L,5000)', sm, am, sb || '/' || am || '/x.mp4')) = -1);
  perform t.check('Cannot fake a reviewed status on upload', t.run(michael, format('insert into public.submissions (student_id, assignment_id, storage_path, size_bytes, status) values (%L,%L,%L,5000,%L)', sm, am, sm || '/' || am || '/y.mp4', 'feedback_provided')) = -1);
  perform t.check('Over-size file rejected (>50 MB)', t.run(michael, format('insert into public.submissions (student_id, assignment_id, storage_path, size_bytes) values (%L,%L,%L,52428801)', sm, am, sm || '/' || am || '/z.mp4')) = -1);
  perform t.check('Student cannot change submission status', t.run(michael, format('update public.submissions set status=%L where student_id=%L', 'feedback_provided', sm)) <> 1);
  perform t.check('Student cannot touch Bea''s submission', t.run(michael, format('delete from public.submissions where id=%L', subb)) = 0);
  perform t.check('Teacher sees all submissions', t.cnt(teacher, 'select 1 from public.submissions') = 2);

  -- ===== feedback flow =====
  subm := (select id from public.submissions where student_id = sm);
  perform t.check('Teacher can leave feedback', t.run(teacher, format('insert into public.feedback (submission_id, author_id, body, suggestions) values (%L,%L,%L,%L)', subm, teacher, 'Nice and steady', 'Relax the wrist')) = 1);
  perform t.check('Feedback flips submission to feedback_provided', (select status from public.submissions where id = subm) = 'feedback_provided');
  perform t.check('Michael can read feedback on his own video', t.cnt(michael, format('select 1 from public.feedback where submission_id=%L', subm)) = 1);
  perform t.check('Bea cannot read feedback on Michael''s video', t.cnt(bea, format('select 1 from public.feedback where submission_id=%L', subm)) = 0);
  perform t.check('Michael cannot delete a reviewed submission', t.run(michael, format('delete from public.submissions where id=%L', subm)) = 0);
  perform t.check('Teacher can mark in review', t.run(teacher, format('update public.submissions set status=%L where id=%L', 'in_review', subm)) = 1);

  -- ===== private storage =====
  perform t.check('Michael can upload into his own folder', t.run(michael, format('insert into storage.objects (bucket_id, name) values (%L,%L)', 'submissions', sm || '/' || am || '/m1.mp4')) = 1);
  perform t.check('Michael cannot upload into Bea''s folder', t.run(michael, format('insert into storage.objects (bucket_id, name) values (%L,%L)', 'submissions', sb || '/' || ab || '/evil.mp4')) = -1);
  perform t.check('Michael cannot upload to another student''s assignment path', t.run(michael, format('insert into storage.objects (bucket_id, name) values (%L,%L)', 'submissions', sm || '/' || ab || '/evil.mp4')) = -1);
  perform t.check('Cannot upload to an unpublished assignment', t.run(michael, format('insert into storage.objects (bucket_id, name) values (%L,%L)', 'submissions', sm || '/' || ad || '/x.mp4')) = -1);
  perform t.check('Cannot upload outside the submissions bucket', t.run(michael, format('insert into storage.objects (bucket_id, name) values (%L,%L)', 'other', sm || '/' || am || '/x.mp4')) = -1);
  perform t.check('Michael can read only his own videos', t.cnt(michael, 'select 1 from storage.objects') = 1);
  perform t.check('Bea cannot read Michael''s video file', t.cnt(bea, format('select 1 from storage.objects where name like %L', sm || '/%')) = 0);
  perform t.check('Teacher can read every video file', t.cnt(teacher, 'select 1 from storage.objects') = 2);
  perform t.check('Michael cannot delete Bea''s video file', t.run(michael, format('delete from storage.objects where name like %L', sb || '/%')) = 0);
  perform t.check('Stranger (unlinked) cannot upload', t.run(stranger, format('insert into storage.objects (bucket_id, name) values (%L,%L)', 'submissions', sm || '/' || am || '/s.mp4')) = -1);
  perform t.check('Anonymous cannot read videos', t.run(null, 'select * from storage.objects', 'anon') = -1);
  perform t.check('Bucket is private with a 50 MB limit and video-only types',
    (select not public and file_size_limit = 52428800 and 'video/mp4' = any(allowed_mime_types) and not ('text/html' = any(allowed_mime_types)) from storage.buckets where id = 'submissions'));

  -- ===== teacher workflow: draft -> publish =====
  perform t.check('Teacher can publish a draft; student then sees it',
    t.run(teacher, format('update public.assignments set status=%L, published_at=now() where id=%L', 'published', ad)) = 1
    and t.cnt(michael, format('select 1 from public.lessons where id=%L', ld)) = 1);
  perform t.check('Teacher can mark objectives achieved; student sees them',
    t.run(teacher, format('insert into public.objective_achievements (assignment_id, objective_id) select %L, id from public.lesson_objectives where lesson_id=%L limit 1', am, l2)) = 1
    and t.cnt(michael, 'select 1 from public.objective_achievements') = 1 and t.cnt(bea, 'select 1 from public.objective_achievements') = 0);
  perform t.check('Cannot hard-delete an exercise that has completions',
    t.run(teacher, format('delete from public.exercises where id=%L', exb)) = -1);
end $fx$;

select case when ok then 'PASS' else 'FAIL' end as result, name from t.results order by n;
select count(*) filter (where ok) as passed, count(*) filter (where not ok) as failed from t.results;

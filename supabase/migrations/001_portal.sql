-- =====================================================================
-- Guitar Lessons portal: schema, row level security, storage policies
-- Run once in Supabase: SQL Editor -> New query -> paste -> Run.
-- Safe to read top to bottom. Nothing here contains secrets.
-- =====================================================================

-- ---------- Tables ----------

-- One row per signed-in account. Role is ALWAYS 'student' on creation.
-- Only someone with database access (you, in the SQL editor) can make a teacher.
create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  email       text,
  full_name   text,
  role        text not null default 'student' check (role in ('teacher', 'student')),
  created_at  timestamptz not null default now()
);

-- A student you teach. Created by the teacher; linked to a login when invited.
create table public.students (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid unique references public.profiles (id) on delete set null,
  full_name      text not null check (length(trim(full_name)) > 0),
  email          text,
  stage          text,                -- current learning stage (student can see)
  progress_notes text,                -- general progress notes (student can see)
  joined_at      date not null default current_date,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create unique index students_email_key on public.students (lower(email)) where email is not null;

-- Reusable lesson content (a template). Each student gets their own assignment of it.
create table public.lessons (
  id            uuid primary key default gen_random_uuid(),
  title         text not null check (length(trim(title)) > 0),
  objective     text,
  key_concepts  text[] not null default '{}',
  skills        text[] not null default '{}',
  content       jsonb not null default '[]'::jsonb,   -- ordered content blocks
  agenda        jsonb not null default '[]'::jsonb,   -- [{minutes, activity}]
  created_by    uuid references public.profiles (id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- Objectives are archived, never deleted, so history stays intact.
create table public.lesson_objectives (
  id          uuid primary key default gen_random_uuid(),
  lesson_id   uuid not null references public.lessons (id) on delete cascade,
  position    int not null default 0,
  text        text not null,
  archived_at timestamptz
);

create table public.exercises (
  id               uuid primary key default gen_random_uuid(),
  lesson_id        uuid not null references public.lessons (id) on delete cascade,
  position         int not null default 0,
  title            text not null,
  instructions     text,
  tab              text,                         -- optional tablature, shown monospaced
  duration_minutes int check (duration_minutes between 0 and 600),
  tempo_bpm        int check (tempo_bpm between 20 and 400),
  schedule         text,                         -- e.g. "Daily, Oct 31 to Nov 5"
  due_date         date,
  reference_links  jsonb not null default '[]'::jsonb,  -- [{label, url}]
  requires_video   boolean not null default false,
  archived_at      timestamptz,
  created_at       timestamptz not null default now()
);

-- A lesson given to ONE student. Students only see 'published' ones.
create table public.assignments (
  id              uuid primary key default gen_random_uuid(),
  student_id      uuid not null references public.students (id) on delete cascade,
  lesson_id       uuid not null references public.lessons (id) on delete restrict,
  lesson_number   int,
  lesson_date     date,
  homework_start  date,
  homework_due    date,
  status          text not null default 'draft' check (status in ('draft', 'published')),
  published_at    timestamptz,
  completed_at    timestamptz,                   -- teacher marks the lesson complete
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (student_id, lesson_id)
);

create table public.exercise_completions (
  id            uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references public.assignments (id) on delete cascade,
  exercise_id   uuid not null references public.exercises (id) on delete restrict,
  student_id    uuid not null references public.students (id) on delete cascade,
  completed_at  timestamptz not null default now(),
  unique (assignment_id, exercise_id)
);

create table public.objective_achievements (
  assignment_id uuid not null references public.assignments (id) on delete cascade,
  objective_id  uuid not null references public.lesson_objectives (id) on delete restrict,
  achieved_at   timestamptz not null default now(),
  primary key (assignment_id, objective_id)
);

-- PRIVATE. Students have no policy on this table, so they can never read it.
create table public.teacher_notes (
  id            uuid primary key default gen_random_uuid(),
  student_id    uuid not null references public.students (id) on delete cascade,
  assignment_id uuid references public.assignments (id) on delete cascade,
  body          text not null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table public.submissions (
  id            uuid primary key default gen_random_uuid(),
  student_id    uuid not null references public.students (id) on delete cascade,
  assignment_id uuid not null references public.assignments (id) on delete cascade,
  exercise_id   uuid references public.exercises (id) on delete restrict,
  storage_path  text not null unique,
  original_name text,
  mime_type     text,
  size_bytes    bigint not null check (size_bytes > 0 and size_bytes <= 52428800),
  status        text not null default 'submitted'
                check (status in ('submitted', 'in_review', 'feedback_provided')),
  submitted_at  timestamptz not null default now(),
  -- the file must live in this student's own folder for this assignment
  check (storage_path like student_id::text || '/' || assignment_id::text || '/%')
);

create table public.feedback (
  id                uuid primary key default gen_random_uuid(),
  submission_id     uuid not null references public.submissions (id) on delete cascade,
  author_id         uuid references public.profiles (id) on delete set null,
  body              text not null check (length(trim(body)) > 0),
  suggestions       text,
  timestamp_seconds int check (timestamp_seconds >= 0),  -- reserved for moment-in-video notes
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- Indexes on foreign keys / common lookups
create index on public.assignments (student_id);
create index on public.assignments (lesson_id);
create index on public.exercises (lesson_id);
create index on public.lesson_objectives (lesson_id);
create index on public.exercise_completions (assignment_id);
create index on public.exercise_completions (student_id);
create index on public.teacher_notes (student_id);
create index on public.submissions (student_id);
create index on public.submissions (assignment_id);
create index on public.submissions (status);
create index on public.feedback (submission_id);

-- ---------- Triggers ----------

create function public.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin new.updated_at = now(); return new; end $$;

create trigger touch before update on public.students   for each row execute function public.touch_updated_at();
create trigger touch before update on public.lessons    for each row execute function public.touch_updated_at();
create trigger touch before update on public.assignments for each row execute function public.touch_updated_at();
create trigger touch before update on public.teacher_notes for each row execute function public.touch_updated_at();
create trigger touch before update on public.feedback   for each row execute function public.touch_updated_at();

-- Every new login gets a profile. The role is hard-coded to 'student': it is
-- never read from anything a user can supply (like signup metadata).
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, email, full_name, role)
  values (new.id, new.email, nullif(new.raw_user_meta_data ->> 'full_name', ''), 'student');
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Posting feedback marks the submission "feedback provided".
create function public.feedback_marks_submission() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.submissions set status = 'feedback_provided' where id = new.submission_id;
  return new;
end $$;

create trigger feedback_status after insert on public.feedback
  for each row execute function public.feedback_marks_submission();

-- ---------- Authorization helpers (used by the policies) ----------

create function public.is_teacher() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'teacher')
$$;

create function public.my_student_id() returns uuid
language sql stable security definer set search_path = '' as $$
  select s.id from public.students s where s.user_id = auth.uid() limit 1
$$;

-- Can the current user see this lesson's content? Only if it is published to them.
create function public.can_view_lesson(_lesson uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.assignments a
    where a.lesson_id = _lesson and a.status = 'published' and a.student_id = public.my_student_id()
  )
$$;

-- Is this a published assignment belonging to the current student?
create function public.owns_published_assignment(_assignment uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.assignments a
    where a.id = _assignment and a.status = 'published' and a.student_id = public.my_student_id()
  )
$$;

-- Does this exercise belong to the lesson of this assignment?
create function public.exercise_in_assignment(_exercise uuid, _assignment uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.exercises e join public.assignments a on a.lesson_id = e.lesson_id
    where e.id = _exercise and a.id = _assignment
  )
$$;

revoke all on function public.is_teacher(), public.my_student_id(), public.can_view_lesson(uuid),
  public.owns_published_assignment(uuid), public.exercise_in_assignment(uuid, uuid),
  public.handle_new_user(), public.feedback_marks_submission() from public, anon, authenticated;
grant execute on function public.is_teacher(), public.my_student_id(), public.can_view_lesson(uuid),
  public.owns_published_assignment(uuid), public.exercise_in_assignment(uuid, uuid) to authenticated;

-- ---------- Table privileges ----------
revoke all on all tables in schema public from anon, authenticated;
grant select on public.profiles to authenticated;
grant select, insert, update, delete on
  public.students, public.lessons, public.lesson_objectives, public.exercises, public.assignments,
  public.exercise_completions, public.objective_achievements, public.teacher_notes,
  public.submissions, public.feedback to authenticated;
grant all on all tables in schema public to service_role;

-- ---------- Row level security ----------
alter table public.profiles              enable row level security;
alter table public.students              enable row level security;
alter table public.lessons               enable row level security;
alter table public.lesson_objectives     enable row level security;
alter table public.exercises             enable row level security;
alter table public.assignments           enable row level security;
alter table public.exercise_completions  enable row level security;
alter table public.objective_achievements enable row level security;
alter table public.teacher_notes         enable row level security;
alter table public.submissions           enable row level security;
alter table public.feedback              enable row level security;

-- profiles: read your own (teacher reads all). Nobody can update roles through the API.
create policy profiles_select on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_teacher());

-- students
create policy students_select on public.students for select to authenticated
  using (public.is_teacher() or id = public.my_student_id());
create policy students_teacher_write on public.students for all to authenticated
  using (public.is_teacher()) with check (public.is_teacher());

-- lessons and their parts: students see only what is published to them
create policy lessons_select on public.lessons for select to authenticated
  using (public.is_teacher() or public.can_view_lesson(id));
create policy lessons_teacher_write on public.lessons for all to authenticated
  using (public.is_teacher()) with check (public.is_teacher());

create policy objectives_select on public.lesson_objectives for select to authenticated
  using (public.is_teacher() or public.can_view_lesson(lesson_id));
create policy objectives_teacher_write on public.lesson_objectives for all to authenticated
  using (public.is_teacher()) with check (public.is_teacher());

create policy exercises_select on public.exercises for select to authenticated
  using (public.is_teacher() or public.can_view_lesson(lesson_id));
create policy exercises_teacher_write on public.exercises for all to authenticated
  using (public.is_teacher()) with check (public.is_teacher());

-- assignments: a student sees only their own published ones
create policy assignments_select on public.assignments for select to authenticated
  using (public.is_teacher() or (student_id = public.my_student_id() and status = 'published'));
create policy assignments_teacher_write on public.assignments for all to authenticated
  using (public.is_teacher()) with check (public.is_teacher());

-- completions: students mark/unmark their own exercises; teacher can read
create policy completions_select on public.exercise_completions for select to authenticated
  using (public.is_teacher() or student_id = public.my_student_id());
create policy completions_student_insert on public.exercise_completions for insert to authenticated
  with check (
    student_id = public.my_student_id()
    and public.owns_published_assignment(assignment_id)
    and public.exercise_in_assignment(exercise_id, assignment_id)
  );
create policy completions_student_delete on public.exercise_completions for delete to authenticated
  using (student_id = public.my_student_id() and public.owns_published_assignment(assignment_id));

-- objectives achieved: teacher writes, student reads their own
create policy achievements_select on public.objective_achievements for select to authenticated
  using (public.is_teacher() or public.owns_published_assignment(assignment_id));
create policy achievements_teacher_write on public.objective_achievements for all to authenticated
  using (public.is_teacher()) with check (public.is_teacher());

-- private teacher notes: teacher only (no student policy exists)
create policy notes_teacher_only on public.teacher_notes for all to authenticated
  using (public.is_teacher()) with check (public.is_teacher());

-- submissions: students create and read only their own; only the teacher changes status
create policy submissions_select on public.submissions for select to authenticated
  using (public.is_teacher() or student_id = public.my_student_id());
create policy submissions_student_insert on public.submissions for insert to authenticated
  with check (
    student_id = public.my_student_id()
    and status = 'submitted'
    and public.owns_published_assignment(assignment_id)
    and (exercise_id is null or public.exercise_in_assignment(exercise_id, assignment_id))
  );
create policy submissions_student_delete on public.submissions for delete to authenticated
  using (student_id = public.my_student_id() and status = 'submitted');
create policy submissions_teacher_write on public.submissions for all to authenticated
  using (public.is_teacher()) with check (public.is_teacher());

-- feedback: students read feedback on their own submissions; only the teacher writes
create policy feedback_select on public.feedback for select to authenticated
  using (
    public.is_teacher()
    or exists (select 1 from public.submissions s
               where s.id = feedback.submission_id and s.student_id = public.my_student_id())
  );
create policy feedback_teacher_write on public.feedback for all to authenticated
  using (public.is_teacher()) with check (public.is_teacher());

-- ---------- Private video storage ----------
-- Bucket is private. 50 MB per file matches the Supabase free plan limit.
-- If you move to a paid plan, raise file_size_limit here AND the size check on
-- public.submissions, AND MAX_VIDEO_MB in lessons/config.js.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('submissions', 'submissions', false, 52428800,
        array['video/mp4', 'video/quicktime', 'video/webm', 'video/x-m4v', 'video/3gpp'])
on conflict (id) do update
  set public = false, file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Files live at  <student_id>/<assignment_id>/<random>.<ext>
-- A student may upload only into their own folder, for a published assignment of theirs.
create policy "students upload to own folder" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'submissions'
    and (storage.foldername(name))[1] = public.my_student_id()::text
    and public.owns_published_assignment(((storage.foldername(name))[2])::uuid)
  );
create policy "students read own files, teacher reads all" on storage.objects for select to authenticated
  using (
    bucket_id = 'submissions'
    and (public.is_teacher() or (storage.foldername(name))[1] = public.my_student_id()::text)
  );
create policy "students delete own files, teacher deletes any" on storage.objects for delete to authenticated
  using (
    bucket_id = 'submissions'
    and (public.is_teacher() or (storage.foldername(name))[1] = public.my_student_id()::text)
  );

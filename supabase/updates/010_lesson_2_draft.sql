-- Creates Lesson 2 for Michael Delgado as a DRAFT (he cannot see it until you publish it).
-- Edit anything in the Teacher Dashboard afterwards. Safe to run twice: it skips if the lesson already exists.
do $$
declare
  v_student uuid;
  v_lesson uuid;
  v_title text := 'Expanding Your Chords and the Minor Pentatonic';
begin
  select id into v_student from public.students where full_name ilike '%Delgado%' order by created_at limit 1;
  if v_student is null then raise exception 'Student not found'; end if;
  if exists (select 1 from public.lessons l join public.assignments a on a.lesson_id = l.id
             where a.student_id = v_student and l.title = v_title) then
    raise notice 'Lesson 2 already exists, skipped.'; return;
  end if;

  insert into public.lessons (title, objective, key_concepts, skills, content, agenda)
  values (
    v_title,
    'Sharpen the Lesson 1 exercises, add the Am, Bm and D/F# chords, introduce the minor pentatonic scale, and start working out where the chords go in a real worship song.',
    array['Clean new chord shapes','Smooth chord transitions','Steady rhythm at a faster tempo','Minor pentatonic scale','Hearing chord changes in a song'],
    array['Barre and bass-note chords','Timing with a metronome','Single-note lead playing','Learning a song by ear'],
    $json$[{"type": "heading", "text": "Where you are now"}, {"type": "paragraph", "text": "You have been working on G, Em, D and C. This week you add three more chords from \"Oh the Cross\": Am, Bm and D/F#. We keep sharpening the exercises from Lesson 1, and you meet a second scale, the minor pentatonic."}, {"type": "chords", "caption": "Your new chords", "text": "  Am          Bm          D/F#\ne|--0--     e|--2--     e|--2--\nB|--1--     B|--3--     B|--3--\nG|--2--     G|--4--     G|--2--\nD|--2--     D|--4--     D|--0--\nA|--0--     A|--2--     A|-----\nE|-----     E|-----     E|--2--"}, {"type": "paragraph", "text": "Bm is a barre chord, so be patient with it. D/F# is a D chord with an F# in the bass: the low E string is played on the 2nd fret."}, {"type": "heading", "text": "What we are working on"}, {"type": "bullets", "items": ["Clean shapes and smooth changes, now including Am, Bm and D/F#", "Steady rhythm at a slightly faster tempo", "The E minor pentatonic scale", "Working out where the chords go in \"Oh the Cross\""]}, {"type": "heading", "text": "The minor pentatonic scale"}, {"type": "paragraph", "text": "The minor pentatonic is a five-note scale with a darker, more emotional sound than the major pentatonic. The E minor pentatonic uses E, G, A, B and D (1, b3, 4, 5, b7 of E minor)."}, {"type": "paragraph", "text": "These are the same five notes as the G major pentatonic from the Lesson 1 sneak peek. Start on G and it sounds major; start on E and it sounds minor. One shape, two uses."}, {"type": "tab", "caption": "E minor pentatonic, first position (open). Play low to high, slowly, with alternate picking.", "text": "e|------------------------------0--3--\nB|------------------------0--3--------\nG|------------------0--2--------------\nD|------------0--2--------------------\nA|------0--2--------------------------\nE|0--3--------------------------------"}, {"type": "paragraph", "text": "There are two notes on every string. The open low E is the home note, so it is the one to land on when you finish a phrase. Try it over an Em chord."}, {"type": "heading", "text": "How to practice"}, {"type": "bullets", "items": ["Rhythm and timing come first.", "Clean technique matters more than speed.", "Keep playing through mistakes. Do not stop and restart.", "We add one new idea at a time."]}]$json$::jsonb,
    $json$[{"minutes": 10, "activity": "Review chord shapes, including Am, Bm and D/F#"}, {"minutes": 10, "activity": "Chord changes from the song"}, {"minutes": 10, "activity": "Rhythm and timing at a faster tempo"}, {"minutes": 10, "activity": "Introduce the E minor pentatonic"}, {"minutes": 15, "activity": "Map the chords of \"Oh the Cross\" together"}, {"minutes": 5, "activity": "Review progress and assign the next week's homework"}]$json$::jsonb
  ) returning id into v_lesson;

  insert into public.lesson_objectives (lesson_id, position, text) values
    (v_lesson, 1, 'Play Am, Bm and D/F# cleanly'),
    (v_lesson, 2, 'Make smoother chord changes'),
    (v_lesson, 3, 'Keep a steady rhythm at a slightly faster tempo'),
    (v_lesson, 4, 'Learn the E minor pentatonic scale'),
    (v_lesson, 5, 'Work out where the chords go in "Oh the Cross"');

  insert into public.exercises (lesson_id, position, title, instructions, tab, duration_minutes, tempo_bpm, schedule, reference_links, requires_video) values
    (v_lesson, 1, 'Chord Cleanliness', 'Practice G, Em, D and C, plus the new Am, Bm and D/F#. For each chord:
1. Form the chord.
2. Play the strings individually.
3. Listen for buzzing or muted notes.
4. Adjust your finger placement.
5. Release the chord and form it again.
Go slowly with Bm. A clean barre takes time.', null, 3, null, 'Daily until our next lesson', '[]', false),
    (v_lesson, 2, 'Chord Transitions', 'Practice these changes, all from "Oh the Cross":
- Em to C
- C to G
- G to Bm
- Bm to Em
- Em to Am
- D to D/F#
Focus on smooth transitions rather than speed.', null, 5, null, 'Daily until our next lesson', '[]', true),
    (v_lesson, 3, 'Rhythm and Timing', 'Set a metronome to 60 BPM.
Play G, D, Em, C with down-up strumming.
When it is clean, raise the metronome by 5 BPM.
Then try Em, Am, C, D at the same tempo.
Focus on steady timing and keeping the progression moving.', null, 5, 60, 'Daily until our next lesson', '[]', true),
    (v_lesson, 4, 'E Minor Pentatonic', 'Play the E minor pentatonic scale from the lesson, low to high and back down.
Use alternate picking, starting with a downstroke.
Metronome at 60 BPM, one note per click.
Warm up with last week''s high E string exercise: e|---0---1---3---1---0---|
Focus on clean notes and a relaxed fretting hand.', 'e|------------------------------0--3--
B|------------------------0--3--------
G|------------------0--2--------------
D|------------0--2--------------------
A|------0--2--------------------------
E|0--3--------------------------------', 5, 60, 'Daily until our next lesson', '[]', true),
    (v_lesson, 5, 'Map the Song', 'Listen to the Spotify recording of "Oh the Cross" (key of G, no capo).
1. Find each section: intro, verse, pre-chorus, chorus and bridge.
2. For each section, write the chords you hear in the order they come, using the chord bank.
3. Mark where in the line each chord change happens.
4. Bring it to our next lesson and we will check it together.', 'CHORD BANK:  Em   C   G   Bm   D   D/F#   Am

INTRO       ___  ___  ___  ___
VERSE       ___  ___  ___  ___
PRE-CHORUS  ___  ___  ___  ___
CHORUS      ___  ___  ___  ___
BRIDGE      ___  ___  ___  ___  ___', null, null, 'Daily until our next lesson', '[]', false);

  insert into public.assignments (student_id, lesson_id, lesson_number, status)
  values (v_student, v_lesson, 2, 'draft');
  raise notice 'Created draft Lesson 2 for Michael.';
end $$;

select a.lesson_number, l.title, a.status, (select count(*) from public.exercises e where e.lesson_id = l.id) as exercises
from public.assignments a join public.lessons l on l.id = a.lesson_id
join public.students s on s.id = a.student_id
where s.full_name ilike '%Delgado%'
order by a.lesson_number;

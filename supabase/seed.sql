-- =====================================================================
-- Starter data: your first student and Lesson 1.
-- Run AFTER 001_portal.sql. Safe to run once; it skips if Michael already exists.
-- Everything here can be edited later from the Teacher Dashboard.
-- =====================================================================
do $seed$
declare
  v_student uuid;
  v_lesson  uuid;
  v_assign  uuid;
  v_ex      uuid;
begin
  if exists (select 1 from public.students where full_name = 'Michael Delgado') then
    raise notice 'Seed skipped: Michael Delgado already exists.';
    return;
  end if;

  insert into public.students (full_name, stage, progress_notes)
  values ('Michael Delgado', 'Beginner electric guitar',
          E'Current chords: G major, E minor, D major, C major.\nGoal: play rhythm or lead guitar confidently in a modern worship setting on Sunday mornings.')
  returning id into v_student;

  insert into public.lessons (title, objective, key_concepts, skills, content, agenda)
  values (
    'Building the Foundation for Worship Guitar',
    'Improve chord transitions, establish consistent rhythm, introduce electric guitar techniques, and begin working toward a real worship song.',
    array['Clean chord shapes','Smooth chord transitions','Steady rhythm and timing','Alternate picking','Rhythm and lead roles in worship'],
    array['Rhythm guitar','Timing with a metronome','Single-note lead playing','Learning a song by ear'],
    jsonb_build_array(
      jsonb_build_object('type','heading','text','Where you are now'),
      jsonb_build_object('type','paragraph','text','You already know four chords: G major, E minor, D major and C major. This lesson builds on them so you can play rhythm or lead electric guitar in a modern worship setting.'),
      jsonb_build_object('type','chords','caption','Your four chords','text',
        E'  G           Em          D           C\ne|--3--     e|--0--     e|--2--     e|--0--\nB|--0--     B|--0--     B|--3--     B|--1--\nG|--0--     G|--0--     G|--2--     G|--0--\nD|--0--     D|--2--     D|--0--     D|--2--\nA|--2--     A|--2--     A|-----     A|--3--\nE|--3--     E|--0--     E|-----     E|-----'),
      jsonb_build_object('type','chords','caption','Full voicings from the Key of G video (use these alongside your four chords)','text',
        E'  G           C           Em\ne|--3--     e|--3--     e|--3--\nB|--3--     B|--3--     B|--3--\nG|--0--     G|--0--     G|--0--\nD|--0--     D|--2--     D|--2--\nA|--2--     A|--3--     A|--2--\nE|--3--     E|--x--     E|--0--'),
      jsonb_build_object('type','heading','text','What we are working on'),
      jsonb_build_object('type','bullets','items',jsonb_build_array(
        'Cleaner chord shapes and smoother transitions',
        'Steady rhythm and timing with a metronome',
        'Your first single-note lead exercise',
        'Starting a real worship song: "Oh the Cross" by UPPERROOM')),
      jsonb_build_object('type','heading','text','How to practice'),
      jsonb_build_object('type','bullets','items',jsonb_build_array(
        'Rhythm and timing come first.',
        'Clean technique matters more than speed.',
        'Keep playing through mistakes. Do not stop and restart.',
        'We add one new idea at a time.',
        'The goal: learn songs on your own and confidently play rhythm or lead on a worship team.')),
      jsonb_build_object('type','video','url','https://youtu.be/JXFh--1GmGM','caption','Capo note: this YouTube tutorial is in Ab, not G. Put a capo on fret 1 and play G-position shapes along with it. The Spotify recording and the chord chart are in G, so no capo for those. Lead guitar tutorial for "Oh the Cross". It may be advanced for now. Use it to get familiar with the lead phrases, not to master the whole arrangement.'),
      jsonb_build_object('type','video','url','https://youtu.be/Aq3NqBgcKXU','caption','Beginner guide to playing in the key of G. It covers G, C and Em, the same chords from your chart. Watch it for deeper, step-by-step instruction.')
    ) || $json$[{"type": "heading", "text": "Song chart: Oh the Cross (UPPERROOM), chords only"}, {"type": "paragraph", "text": "This chart matches the Spotify recording, which is in the key of G. Play these chords as written, with no capo. Below is the order of the chords in each section. Listen to the recording to hear where each change lands."}, {"type": "bullets", "items": ["Spotify recording and this chart: key of G. No capo.", "YouTube lead guitar tutorial: key of Ab. Put a capo on fret 1 and play the same G-position shapes."]}, {"type": "paragraph", "text": "New chords for you: Bm and Am. We will learn them together. D/F# is a D with an F# in the bass; for now you can play a normal D there."}, {"type": "link", "url": "https://tabs.ultimate-guitar.com/tab/upperroom/oh-the-cross-chords-3036729", "label": "Full chord and lyric chart for Oh the Cross (Ultimate Guitar)"}, {"type": "chords", "caption": "Play-through chart: the chords in the order you play them", "text": "1  INTRO (play twice)\n   | Em | C | G | Bm |\n\n2  VERSE 1\n   Em  C  G  Bm  Em  C  G  Bm  Em\n\n3  PRE-CHORUS\n   C  G  Bm  Em  C  G  Bm  C\n\n4  CHORUS\n   D  C  G  D  C  G\n\n5  VERSE 2 (play it twice)\n   Em  C  G  Bm  Em  C  G  Bm  Em\n   (the second time, end on Bm  C)\n\n6  CHORUS (add the Em)\n   D  C  G  D  C  G  Em\n   D  C  G  D  C  G\n\n7  BRIDGE (play twice)\n   G  D  Am  Em  C\n\n8  CHORUS (add the Em, and D/F# on the third line)\n   D  C  G  D  C  G  Em\n   D/F#  C  G  D  C  G\n\n9  SPONTANEOUS SECTION\n   D  Am  Em  C\n   G  D  Am  Em  C\n\n10 BRIDGE (play three times)\n   G  D  Am  Em  C\n\n11 CHORUS (same as step 8)\n\n12 OUTRO\n   Am  Em  C"}]$json$::jsonb || $json$[{"type": "heading", "text": "Sneak peek: the G major pentatonic scale"}, {"type": "paragraph", "text": "This is not homework. It is a preview of where we are heading in future lessons. Read it, and try it if you are curious."}, {"type": "heading", "text": "What is it?"}, {"type": "paragraph", "text": "A pentatonic scale is a scale with five notes (\"penta\" means five). The G major pentatonic uses G, A, B, D and E, which are numbers 1, 2, 3, 5 and 6 of the G major scale. It is the full G major scale with two notes left out: C and F#. Those are the notes most likely to clash with the chords underneath, so what is left sounds clean, bright and hard to get wrong."}, {"type": "heading", "text": "How it is used"}, {"type": "bullets", "items": ["Lead lines and fills: it is a go-to scale for melodies, fills and solos in songs in the key of G.", "It fits the chords you already know. The five notes sound good over G, Em, C and D, so one pattern can carry you through a whole progression.", "Same notes as the E minor pentatonic (E, G, A, B, D). Start on E and it sounds minor; start on G and it sounds major. One shape, two uses.", "Easy to find: the lowest G is on the 3rd fret of the low E string, and the pattern starts there.", "With a capo (like capo 1 for the YouTube \"Oh the Cross\" tutorial in Ab) the shape stays the same. Count the frets from the capo."]}, {"type": "heading", "text": "The first position"}, {"type": "tab", "caption": "G major pentatonic, first position. Play low to high, slowly, with alternate picking.", "text": "e|------------------------------3--5--\nB|------------------------3--5--------\nG|------------------2--4--------------\nD|------------2--5--------------------\nA|------2--5--------------------------\nE|3--5--------------------------------"}, {"type": "paragraph", "text": "There are two notes on every string. The G on the 3rd fret of the low E string is the home note, so it is the one to land on when you finish a phrase. We will go through this together in a future lesson."}]$json$::jsonb,
    jsonb_build_array(
      jsonb_build_object('minutes',10,'activity','Review chord shapes and transitions'),
      jsonb_build_object('minutes',10,'activity','Work on rhythm guitar and timing'),
      jsonb_build_object('minutes',10,'activity','Refine strumming and dynamics'),
      jsonb_build_object('minutes',10,'activity','Introduce a simple lead guitar phrase'),
      jsonb_build_object('minutes',15,'activity','Apply the material to "Oh the Cross"'),
      jsonb_build_object('minutes',5,'activity','Review progress and assign the next week''s homework')
    )
  ) returning id into v_lesson;

  insert into public.lesson_objectives (lesson_id, position, text) values
    (v_lesson, 1, 'Improve chord transitions'),
    (v_lesson, 2, 'Establish consistent rhythm'),
    (v_lesson, 3, 'Introduce electric guitar techniques'),
    (v_lesson, 4, 'Begin working toward a real worship song');

  insert into public.exercises (lesson_id, position, title, instructions, tab, duration_minutes, tempo_bpm, schedule, due_date, reference_links, requires_video) values
    (v_lesson, 1, 'Chord Cleanliness',
      E'Practice G, Em, D and C. For each chord:\n1. Form the chord.\n2. Play the strings individually.\n3. Listen for buzzing or muted notes.\n4. Adjust your finger placement.\n5. Release the chord and form it again.',
      null, 3, null, 'Daily, Oct 31 to Nov 5', date '2026-11-05', '[]', false),
    (v_lesson, 2, 'Chord Transitions',
      E'Practice these combinations:\n- G to Em\n- Em to C\n- C to G\n- G to D\n- D to Em\nOn the final practice day, combine the chords into a progression.\nFocus on smooth transitions rather than speed.',
      null, 4, null, 'Daily, Oct 31 to Nov 5', date '2026-11-05', '[]', true),
    (v_lesson, 3, 'Rhythm and Timing',
      E'Set a metronome to 60 BPM.\nStart by playing four downstrokes per chord.\nPractice the progression: G, D, Em, C.\nOnce you are comfortable, introduce down-up strumming.\nFocus on consistent timing and keeping the progression moving.',
      null, 5, 60, 'Daily, Oct 31 to Nov 5', date '2026-11-05', '[]', true),
    (v_lesson, 4, 'First Lead Guitar Exercise',
      E'Practice single-note picking on the high E string. Use alternate picking, beginning with a downstroke.\nFocus on:\n- Clean notes\n- Controlled picking\n- Relaxed fretting-hand movement\n- Consistent timing\nIf you are comfortable, repeat the exercise on the B string.',
      'e|---0---1---3---1---0---|', 5, null, 'Daily, Oct 31 to Nov 5', date '2026-11-05', '[]', true),
    (v_lesson, 5, 'Learn the Song',
      E'Song: "Oh the Cross" by UPPERROOM.\n1. Listen to the recording.\n2. Identify the major song sections.\n3. Listen for the rhythm guitar and lead guitar parts.\n4. Pay attention to how the guitar contributes to the arrangement.\n5. Begin practicing the song''s rhythm part using the chord chart.\nYou do not need to learn the whole song before our next lesson. We will go through the key sections together.\nThe lead guitar tutorial may be advanced for now. Use it to get familiar with the lead phrases rather than trying to master the full arrangement.',
      null, null, null, 'Daily, Oct 31 to Nov 5', date '2026-11-05',
      '[{"label":"Lead guitar tutorial (YouTube)","url":"https://youtu.be/JXFh--1GmGM"},{"label": "Full chord chart (Ultimate Guitar)", "url": "https://tabs.ultimate-guitar.com/tab/upperroom/oh-the-cross-chords-3036729"}]', false);

  insert into public.assignments (student_id, lesson_id, lesson_number, lesson_date, homework_start, homework_due, status, published_at)
  values (v_student, v_lesson, 1, date '2026-11-06', date '2026-10-31', date '2026-11-05', 'published', now())
  returning id into v_assign;

  insert into public.teacher_notes (student_id, assignment_id, body) values
    (v_student, v_assign,
     E'TO VERIFY before assigning exact chords: "Oh the Cross" (UPPERROOM). The Spotify recording is believed to be in G major. Check the specific recording and arrangement first.\n\nTeaching principles:\n- Rhythm and timing are foundational.\n- Teach practical skills that apply to real worship songs.\n- Introduce lead guitar progressively.\n- Prioritize clean technique over speed.\n- Encourage him to keep playing through mistakes.\n- Do not introduce too many new concepts at once.\n\nLong-term goal: he learns songs independently and confidently contributes as a rhythm or lead guitarist on a worship team.\n\nThe agenda totals 60 minutes and can be adjusted to his progress.');
end
$seed$;

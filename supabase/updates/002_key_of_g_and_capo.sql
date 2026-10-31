-- Lesson 1 update: Key of G video, full-voicing chord chart, capo note for "Oh the Cross".
-- Safe to run once in the Supabase SQL Editor. It skips itself if already applied.
do $$
declare
  v_lesson uuid;
  v_content jsonb;
  v_new jsonb := '[]'::jsonb;
  b jsonb;
begin
  select id, content into v_lesson, v_content
  from public.lessons
  where title = 'Building the Foundation for Worship Guitar'
  limit 1;

  if v_lesson is null then
    raise exception 'Lesson not found';
  end if;

  if v_content::text like '%Aq3NqBgcKXU%' then
    raise notice 'Already applied, nothing changed.';
    return;
  end if;

  for b in select value from jsonb_array_elements(v_content) loop
    -- Capo note on the existing "Oh the Cross" video
    if b->>'type' = 'video' and b->>'url' like '%JXFh--1GmGM%' then
      b := jsonb_set(b, '{caption}', to_jsonb(
        'Capo note: this YouTube tutorial is in Ab, not G. Put a capo on fret 1 and play G-position shapes along with it. The Spotify recording and the chord chart are in G, so no capo for those. ' || coalesce(b->>'caption','')));
    end if;

    v_new := v_new || jsonb_build_array(b);

    -- New voicings right after your existing four-chord chart
    if b->>'type' = 'chords' then
      v_new := v_new || jsonb_build_array(
        jsonb_build_object('type','chords',
          'caption','Full voicings from the Key of G video (use these alongside your four chords)',
          'text', E'  G           C           Em\ne|--3--     e|--3--     e|--3--\nB|--3--     B|--3--     B|--3--\nG|--0--     G|--0--     G|--0--\nD|--0--     D|--2--     D|--2--\nA|--2--     A|--3--     A|--2--\nE|--3--     E|--x--     E|--0--'));
    end if;
  end loop;

  -- Key of G guided video at the end
  v_new := v_new || jsonb_build_array(
    jsonb_build_object('type','video','url','https://youtu.be/Aq3NqBgcKXU',
      'caption','Beginner guide to playing in the key of G. It covers G, C and Em, the same chords from your chart. Watch it for deeper, step-by-step instruction.'));

  update public.lessons set content = v_new where id = v_lesson;
end $$;

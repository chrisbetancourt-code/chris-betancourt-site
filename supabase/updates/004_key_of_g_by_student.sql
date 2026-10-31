-- Adds the Key of G video, full-voicing chart and capo note to every lesson assigned to Michael Delgado,
-- no matter what the lesson is titled. Skips lessons that already have it. Shows what it did at the end.
do $$
declare
  r record;
  v_new jsonb;
  b jsonb;
  v_chart jsonb := jsonb_build_object('type','chords',
    'caption','Full voicings from the Key of G video (use these alongside your four chords)',
    'text', E'  G           C           Em\ne|--3--     e|--3--     e|--3--\nB|--3--     B|--3--     B|--3--\nG|--0--     G|--0--     G|--0--\nD|--0--     D|--2--     D|--2--\nA|--2--     A|--3--     A|--2--\nE|--3--     E|--x--     E|--0--');
  v_video jsonb := jsonb_build_object('type','video','url','https://youtu.be/Aq3NqBgcKXU',
    'caption','Beginner guide to playing in the key of G. It covers G, C and Em, the same chords from your chart. Watch it for deeper, step-by-step instruction.');
  v_placed boolean;
begin
  for r in
    select distinct l.id, l.title, l.content
    from public.lessons l
    join public.assignments a on a.lesson_id = l.id
    join public.students s on s.id = a.student_id
    where s.full_name ilike '%Delgado%'
  loop
    if r.content::text like '%Aq3NqBgcKXU%' then
      raise notice 'Lesson "%" (%) already has the video, skipped.', r.title, r.id;
      continue;
    end if;
    v_new := '[]'::jsonb; v_placed := false;
    for b in select value from jsonb_array_elements(r.content) loop
      if b->>'type' = 'video' and b->>'url' like '%JXFh--1GmGM%' and (b->>'caption') not like 'Capo note:%' then
        b := jsonb_set(b, '{caption}', to_jsonb(
          'Capo note: this "Oh the Cross" video is in Ab. Put a capo on fret 1 and play the G-position shapes you already know. ' || coalesce(b->>'caption','')));
      end if;
      v_new := v_new || jsonb_build_array(b);
      if b->>'type' = 'chords' and not v_placed then
        v_new := v_new || jsonb_build_array(v_chart); v_placed := true;
      end if;
    end loop;
    if not v_placed then v_new := v_new || jsonb_build_array(v_chart); end if;
    v_new := v_new || jsonb_build_array(v_video);
    update public.lessons set content = v_new where id = r.id;
    raise notice 'Updated lesson "%" (%).', r.title, r.id;
  end loop;
end $$;

select l.id, l.title,
       (l.content::text like '%Aq3NqBgcKXU%') as has_key_of_g_video,
       jsonb_array_length(l.content) as blocks,
       (select string_agg(a.lesson_number::text, ',') from public.assignments a where a.lesson_id = l.id) as lesson_numbers
from public.lessons l
order by l.created_at;

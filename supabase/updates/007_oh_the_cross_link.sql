-- Adds a link to the full "Oh the Cross" chord chart on Ultimate Guitar:
-- once in the lesson content (under the chords-only chart) and once on the "Learn the Song" exercise.
do $$
declare
  r record;
  v_link jsonb := $json${"type": "link", "url": "https://tabs.ultimate-guitar.com/tab/upperroom/oh-the-cross-chords-3036729", "label": "Full chord and lyric chart for Oh the Cross (Ultimate Guitar)"}$json$::jsonb;
  v_ref jsonb := $json${"label": "Full chord chart (Ultimate Guitar)", "url": "https://tabs.ultimate-guitar.com/tab/upperroom/oh-the-cross-chords-3036729"}$json$::jsonb;
  v_new jsonb; b jsonb; v_done boolean;
begin
  for r in
    select distinct l.id, l.title, l.content
    from public.lessons l
    join public.assignments a on a.lesson_id = l.id
    join public.students s on s.id = a.student_id
    where s.full_name ilike '%Delgado%'
  loop
    if r.content::text like '%oh-the-cross-chords-3036729%' then
      raise notice 'Lesson "%" (%) already has the link, skipped.', r.title, r.id;
    else
      v_new := '[]'::jsonb; v_done := false;
      for b in select value from jsonb_array_elements(r.content) loop
        v_new := v_new || jsonb_build_array(b);
        if not v_done and b->>'type' = 'paragraph' and b->>'text' like 'New chords for you:%' then
          v_new := v_new || jsonb_build_array(v_link); v_done := true;
        end if;
      end loop;
      if not v_done then v_new := v_new || jsonb_build_array(v_link); end if;
      update public.lessons set content = v_new where id = r.id;
      raise notice 'Added link to lesson "%" (%).', r.title, r.id;
    end if;

    update public.exercises e
    set reference_links = coalesce(e.reference_links, '[]'::jsonb) || jsonb_build_array(v_ref)
    where e.lesson_id = r.id
      and e.title = 'Learn the Song'
      and coalesce(e.reference_links::text, '') not like '%oh-the-cross-chords-3036729%';
  end loop;
end $$;

select l.id, l.title,
       (l.content::text like '%oh-the-cross-chords-3036729%') as has_chart_link,
       (select bool_or(e.reference_links::text like '%oh-the-cross-chords-3036729%') from public.exercises e where e.lesson_id = l.id and e.title = 'Learn the Song') as exercise_has_link
from public.lessons l
order by l.created_at;

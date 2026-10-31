-- Makes the capo guidance consistent. Safe to run any time, and run it LAST (after any other lesson updates).
--   Spotify recording + chord chart = key of G, no capo.
--   YouTube lead guitar tutorial   = key of Ab, capo on fret 1.
do $$
declare
  r record;
  b jsonb;
  v_new jsonb;
  v_has_clear boolean;
  v_cap text;
  v_rest text;
  c_video text := 'Capo note: this YouTube tutorial is in Ab, not G. Put a capo on fret 1 and play G-position shapes along with it. The Spotify recording and the chord chart are in G, so no capo for those.';
  c_para  text := 'This chart matches the Spotify recording, which is in the key of G. Play these chords as written, with no capo. Below is the order of the chords in each section. Listen to the recording to hear where each change lands.';
  c_bul   jsonb := '{"type":"bullets","items":["Spotify recording and this chart: key of G. No capo.","YouTube lead guitar tutorial: key of Ab. Put a capo on fret 1 and play the same G-position shapes."]}'::jsonb;
  c_ex    text := 'Capo note: the YouTube lead guitar tutorial is in Ab, so use a capo on fret 1 and play G-position shapes with it. The Spotify recording and the chord chart are in G, so no capo for those.';
begin
  for r in
    select distinct l.id, l.title, l.content
    from public.lessons l
    join public.assignments a on a.lesson_id = l.id
    join public.students s on s.id = a.student_id
    where s.full_name ilike '%Delgado%'
  loop
    v_has_clear := r.content::text like '%Spotify recording and this chart%';
    v_new := '[]'::jsonb;
    for b in select value from jsonb_array_elements(r.content) loop
      -- chart intro paragraph
      if b->>'type' = 'paragraph' and b->>'text' like 'This chart is in the key of G.%' then
        b := jsonb_set(b, '{text}', to_jsonb(c_para));
        v_new := v_new || jsonb_build_array(b);
        if not v_has_clear then v_new := v_new || jsonb_build_array(c_bul); end if;
        continue;
      end if;
      -- YouTube tutorial caption
      if b->>'type' = 'video' and b->>'url' like '%JXFh--1GmGM%' then
        v_cap := coalesce(b->>'caption','');
        if v_cap like 'Capo note:%' then
          v_rest := substr(v_cap, position('Lead guitar tutorial' in v_cap));
        else
          v_rest := v_cap;
        end if;
        b := jsonb_set(b, '{caption}', to_jsonb(c_video || ' ' || v_rest));
      end if;
      -- pentatonic capo bullet
      if b->>'type' = 'bullets' and b::text like '%With a capo (like capo 1 for%' then
        b := jsonb_set(b, '{items}', (
          select jsonb_agg(case when i like 'With a capo%'
            then to_jsonb('With a capo (like capo 1 for the YouTube "Oh the Cross" tutorial in Ab) the shape stays the same. Count the frets from the capo.'::text)
            else to_jsonb(i) end)
          from jsonb_array_elements_text(b->'items') i));
      end if;
      v_new := v_new || jsonb_build_array(b);
    end loop;
    update public.lessons set content = v_new where id = r.id;

    -- Learn the Song exercise: drop any old capo line, then add the correct one at the end
    update public.exercises e
    set instructions = rtrim(regexp_replace(e.instructions, 'Capo note:[^\n]*\n?', '', 'g'), E'\n ') || E'\n' || c_ex
    where e.lesson_id = r.id and e.title = 'Learn the Song';
    raise notice 'Fixed capo wording in lesson "%" (%).', r.title, r.id;
  end loop;
end $$;

select l.id, l.title,
       (l.content::text like '%Spotify recording and this chart%') as has_clear_key_note,
       (l.content::text like '%recording is in Ab%') as still_has_old_wording
from public.lessons l
order by l.created_at;

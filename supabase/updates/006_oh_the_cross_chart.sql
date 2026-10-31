-- Adds a chords-only "Oh the Cross" song chart to every lesson assigned to Michael Delgado,
-- placed before the pentatonic sneak peek if that section exists (otherwise at the end).
do $$
declare
  r record;
  v_blocks jsonb := $json$[{"type": "heading", "text": "Song chart: Oh the Cross (UPPERROOM), chords only"}, {"type": "paragraph", "text": "This chart matches the Spotify recording, which is in the key of G. Play these chords as written, with no capo. Below is the order of the chords in each section. Listen to the recording to hear where each change lands."}, {"type": "bullets", "items": ["Spotify recording and this chart: key of G. No capo.", "YouTube lead guitar tutorial: key of Ab. Put a capo on fret 1 and play the same G-position shapes."]}, {"type": "paragraph", "text": "New chords for you: Bm and Am. We will learn them together. D/F# is a D with an F# in the bass; for now you can play a normal D there."}, {"type": "link", "url": "https://tabs.ultimate-guitar.com/tab/upperroom/oh-the-cross-chords-3036729", "label": "Full chord and lyric chart for Oh the Cross (Ultimate Guitar)"}, {"type": "chords", "caption": "Play-through chart: the chords in the order you play them", "text": "1  INTRO (play twice)\n   | Em | C | G | Bm |\n\n2  VERSE 1\n   Em  C  G  Bm  Em  C  G  Bm  Em\n\n3  PRE-CHORUS\n   C  G  Bm  Em  C  G  Bm  C\n\n4  CHORUS\n   D  C  G  D  C  G\n\n5  VERSE 2 (play it twice)\n   Em  C  G  Bm  Em  C  G  Bm  Em\n   (the second time, end on Bm  C)\n\n6  CHORUS (add the Em)\n   D  C  G  D  C  G  Em\n   D  C  G  D  C  G\n\n7  BRIDGE (play twice)\n   G  D  Am  Em  C\n\n8  CHORUS (add the Em, and D/F# on the third line)\n   D  C  G  D  C  G  Em\n   D/F#  C  G  D  C  G\n\n9  SPONTANEOUS SECTION\n   D  Am  Em  C\n   G  D  Am  Em  C\n\n10 BRIDGE (play three times)\n   G  D  Am  Em  C\n\n11 CHORUS (same as step 8)\n\n12 OUTRO\n   Am  Em  C"}]$json$::jsonb;
  v_new jsonb; b jsonb; v_done boolean;
begin
  for r in
    select distinct l.id, l.title, l.content
    from public.lessons l
    join public.assignments a on a.lesson_id = l.id
    join public.students s on s.id = a.student_id
    where s.full_name ilike '%Delgado%'
  loop
    if r.content::text like '%Song chart: Oh the Cross%' then
      raise notice 'Lesson "%" (%) already has the song chart, skipped.', r.title, r.id;
      continue;
    end if;
    v_new := '[]'::jsonb; v_done := false;
    for b in select value from jsonb_array_elements(r.content) loop
      if not v_done and b->>'type' = 'heading' and b->>'text' like 'Sneak peek:%' then
        v_new := v_new || v_blocks; v_done := true;
      end if;
      v_new := v_new || jsonb_build_array(b);
    end loop;
    if not v_done then v_new := v_new || v_blocks; end if;
    update public.lessons set content = v_new where id = r.id;
    raise notice 'Updated lesson "%" (%).', r.title, r.id;
  end loop;
end $$;

select l.id, l.title,
       (l.content::text like '%Song chart: Oh the Cross%') as has_song_chart,
       jsonb_array_length(l.content) as blocks
from public.lessons l
order by l.created_at;

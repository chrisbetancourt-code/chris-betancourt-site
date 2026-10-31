-- Replaces the song map and the separate section charts with ONE play-through chart.
-- Works whether or not the earlier song-chart queries were run. Safe to run twice.
do $$
declare
  r record;
  b jsonb;
  v_new jsonb;
  v_sec jsonb := $json$[{"type": "heading", "text": "Song chart: Oh the Cross (UPPERROOM), chords only"}, {"type": "paragraph", "text": "This chart matches the Spotify recording, which is in the key of G. Play these chords as written, with no capo. Below is the order of the chords in each section. Listen to the recording to hear where each change lands."}, {"type": "bullets", "items": ["Spotify recording and this chart: key of G. No capo.", "YouTube lead guitar tutorial: key of Ab. Put a capo on fret 1 and play the same G-position shapes."]}, {"type": "paragraph", "text": "New chords for you: Bm and Am. We will learn them together. D/F# is a D with an F# in the bass; for now you can play a normal D there."}, {"type": "link", "url": "https://tabs.ultimate-guitar.com/tab/upperroom/oh-the-cross-chords-3036729", "label": "Full chord and lyric chart for Oh the Cross (Ultimate Guitar)"}, {"type": "chords", "caption": "Play-through chart: the chords in the order you play them", "text": "1  INTRO (play twice)\n   | Em | C | G | Bm |\n\n2  VERSE 1\n   Em  C  G  Bm  Em  C  G  Bm  Em\n\n3  PRE-CHORUS\n   C  G  Bm  Em  C  G  Bm  C\n\n4  CHORUS\n   D  C  G  D  C  G\n\n5  VERSE 2 (play it twice)\n   Em  C  G  Bm  Em  C  G  Bm  Em\n   (the second time, end on Bm  C)\n\n6  CHORUS (add the Em)\n   D  C  G  D  C  G  Em\n   D  C  G  D  C  G\n\n7  BRIDGE (play twice)\n   G  D  Am  Em  C\n\n8  CHORUS (add the Em, and D/F# on the third line)\n   D  C  G  D  C  G  Em\n   D/F#  C  G  D  C  G\n\n9  SPONTANEOUS SECTION\n   D  Am  Em  C\n   G  D  Am  Em  C\n\n10 BRIDGE (play three times)\n   G  D  Am  Em  C\n\n11 CHORUS (same as step 8)\n\n12 OUTRO\n   Am  Em  C"}]$json$::jsonb;
  v_in boolean;
  v_placed boolean;
begin
  for r in
    select distinct l.id, l.title, l.content
    from public.lessons l
    join public.assignments a on a.lesson_id = l.id
    join public.students s on s.id = a.student_id
    where s.full_name ilike '%Delgado%'
  loop
    v_new := '[]'::jsonb; v_in := false; v_placed := false;
    for b in select value from jsonb_array_elements(r.content) loop
      if b->>'type' = 'link' and b->>'url' like '%oh-the-cross-chords-3036729%' then
        continue;
      end if;
      if b->>'type' = 'heading' and b->>'text' like 'Song chart: Oh the Cross%' then
        v_new := v_new || v_sec; v_in := true; v_placed := true;
        continue;
      end if;
      if v_in then
        if b->>'type' = 'heading' and b->>'text' like 'Sneak peek:%' then
          v_in := false;
        else
          continue;
        end if;
      end if;
      if not v_placed and b->>'type' = 'heading' and b->>'text' like 'Sneak peek:%' then
        v_new := v_new || v_sec; v_placed := true;
      end if;
      v_new := v_new || jsonb_build_array(b);
    end loop;
    if not v_placed then v_new := v_new || v_sec; end if;
    update public.lessons set content = v_new where id = r.id;
    raise notice 'Updated lesson "%" (%).', r.title, r.id;
  end loop;
end $$;

select l.id, l.title,
       (l.content::text like '%Play-through chart%') as has_play_through,
       (l.content::text like '%Song map%') as still_has_song_map,
       jsonb_array_length(l.content) as blocks
from public.lessons l
order by l.created_at;

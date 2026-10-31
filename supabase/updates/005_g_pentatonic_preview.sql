-- Adds the "Sneak peek: G major pentatonic" section to the end of every lesson assigned to Michael Delgado.
-- Skips lessons that already have it, and shows the result at the end.
do $$
declare
  r record;
  v_blocks jsonb := $json$[{"type": "heading", "text": "Sneak peek: the G major pentatonic scale"}, {"type": "paragraph", "text": "This is not homework. It is a preview of where we are heading in future lessons. Read it, and try it if you are curious."}, {"type": "heading", "text": "What is it?"}, {"type": "paragraph", "text": "A pentatonic scale is a scale with five notes (\"penta\" means five). The G major pentatonic uses G, A, B, D and E, which are numbers 1, 2, 3, 5 and 6 of the G major scale. It is the full G major scale with two notes left out: C and F#. Those are the notes most likely to clash with the chords underneath, so what is left sounds clean, bright and hard to get wrong."}, {"type": "heading", "text": "How it is used"}, {"type": "bullets", "items": ["Lead lines and fills: it is a go-to scale for melodies, fills and solos in songs in the key of G.", "It fits the chords you already know. The five notes sound good over G, Em, C and D, so one pattern can carry you through a whole progression.", "Same notes as the E minor pentatonic (E, G, A, B, D). Start on E and it sounds minor; start on G and it sounds major. One shape, two uses.", "Easy to find: the lowest G is on the 3rd fret of the low E string, and the pattern starts there.", "With a capo (like capo 1 for \"Oh the Cross\" in Ab) the shape stays the same. Count the frets from the capo."]}, {"type": "heading", "text": "The first position"}, {"type": "tab", "caption": "G major pentatonic, first position. Play low to high, slowly, with alternate picking.", "text": "e|------------------------------3--5--\nB|------------------------3--5--------\nG|------------------2--4--------------\nD|------------2--5--------------------\nA|------2--5--------------------------\nE|3--5--------------------------------"}, {"type": "paragraph", "text": "There are two notes on every string. The G on the 3rd fret of the low E string is the home note, so it is the one to land on when you finish a phrase. We will go through this together in a future lesson."}]$json$::jsonb;
begin
  for r in
    select distinct l.id, l.title, l.content
    from public.lessons l
    join public.assignments a on a.lesson_id = l.id
    join public.students s on s.id = a.student_id
    where s.full_name ilike '%Delgado%'
  loop
    if r.content::text like '%Sneak peek: the G major pentatonic%' then
      raise notice 'Lesson "%" (%) already has the pentatonic preview, skipped.', r.title, r.id;
      continue;
    end if;
    update public.lessons set content = r.content || v_blocks where id = r.id;
    raise notice 'Updated lesson "%" (%).', r.title, r.id;
  end loop;
end $$;

select l.id, l.title,
       (l.content::text like '%Sneak peek: the G major pentatonic%') as has_pentatonic_preview,
       jsonb_array_length(l.content) as blocks
from public.lessons l
order by l.created_at;

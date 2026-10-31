-- Michael's first tracked lesson is Lesson 1 (was numbered 2).
update public.assignments a
set lesson_number = 1
from public.lessons l
where a.lesson_id = l.id
  and l.title = 'Building the Foundation for Worship Guitar'
  and a.lesson_number = 2;

update public.exercises e
set instructions = replace(e.instructions, 'before Lesson 2', 'before our next lesson')
from public.lessons l
where e.lesson_id = l.id
  and l.title = 'Building the Foundation for Worship Guitar'
  and e.instructions like '%before Lesson 2%';

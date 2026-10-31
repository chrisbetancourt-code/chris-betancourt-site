import { db, enc } from './api.js';
import { ctx } from './ctx.js';
import { h, chip, fmtDay, fmtWhen, empty, statusChip } from './ui.js';
import { progressFor } from './teacher.js';

const inList = (ids) => '(' + ids.map(enc).join(',') + ')';

export async function studentHome() {
  const stu = ctx.student;
  const assignments = await db.select('assignments', 'select=*,lessons(id,title,objective)&order=lesson_date.desc.nullslast,created_at.desc');
  const lessonIds = [...new Set(assignments.map((a) => a.lesson_id))];
  const [exercises, completions, subs] = await Promise.all([
    lessonIds.length ? db.select('exercises', `select=id,lesson_id,title,instructions,duration_minutes,requires_video,position&archived_at=is.null&lesson_id=in.${inList(lessonIds)}&order=position`) : [],
    db.select('exercise_completions', 'select=assignment_id,exercise_id'),
    db.select('submissions', 'select=*&order=submitted_at.desc'),
  ]);
  const fbs = subs.length ? await db.select('feedback', `select=*&submission_id=in.${inList(subs.map((s) => s.id))}&order=created_at.desc`) : [];
  const prog = progressFor(assignments, exercises, completions);
  const first = (stu.full_name || '').split(' ')[0] || 'there';

  const active = assignments.filter((a) => !a.completed_at);
  const current = active[0] || assignments[0];
  const doneSet = new Set(completions.map((c) => c.assignment_id + ':' + c.exercise_id));

  const open = active.reduce((n, a) => n + prog[a.id].open, 0);
  const total = active.reduce((n, a) => n + prog[a.id].total, 0);
  const finished = total - open;

  const welcome = h('section', { class: 'card hero-card' },
    h('p', { class: 'mono ember' }, stu.stage || 'Guitar lessons'),
    h('h1', { class: 'page-h', tabindex: '-1' }, 'Hi, ' + first),
    assignments.length
      ? h('div', {}, h('p', { class: 'muted' }, total ? `${finished} of ${total} exercises done in your current lessons.` : 'Your lessons are ready.'),
          total ? h('progress', { max: String(total), value: String(finished), class: 'bar slim', 'aria-label': 'Overall practice progress' }) : null)
      : h('p', { class: 'muted' }, 'Chris has not shared a lesson yet. When he does, it will show up here.'),
    stu.progress_notes ? h('p', { class: 'pre note-line' }, stu.progress_notes) : null);

  if (!assignments.length) return h('div', { class: 'page narrow' }, welcome, h('section', { class: 'card' }, empty('No lessons yet', 'Check back soon.')));

  const cont = h('section', { class: 'card' },
    h('h2', { class: 'card-h' }, 'Continue learning'),
    h('div', { class: 'cont' },
      h('div', {}, h('p', { class: 'mono' }, `Lesson ${current.lesson_number || ''}${current.lesson_date ? ' · ' + fmtDay(current.lesson_date) : ''}`),
        h('h3', { class: 'cont-t' }, current.lessons.title),
        current.lessons.objective ? h('p', { class: 'muted' }, current.lessons.objective) : null),
      h('a', { class: 'btn', href: `#/s/${stu.id}/l/${current.id}` }, 'Open lesson')));

  const practice = active.flatMap((a) => exercises.filter((e) => e.lesson_id === a.lesson_id).map((e) => ({ a, e })));
  const practiceCard = h('section', { class: 'card' },
    h('h2', { class: 'card-h' }, 'This week\'s practice'),
    practice.length ? h('ul', { class: 'plain' }, practice.map(({ a, e }) => {
      const isDone = doneSet.has(a.id + ':' + e.id);
      const first = (e.instructions || '').split('\n')[0];
      return h('li', {}, h('a', { class: 'row-link ex-link', href: `#/s/${stu.id}/l/${a.id}?ex=${e.id}` },
        h('span', {}, h('strong', {}, e.title), h('span', { class: 'muted block' }, first.length > 90 ? first.slice(0, 87) + '…' : first),
          e.duration_minutes ? h('span', { class: 'muted small' }, `About ${e.duration_minutes} min a day`) : null),
        h('span', { class: 'chips-row' }, isDone ? chip('Done', 'good') : chip('To do', 'warm'), h('span', { class: 'mini' }, 'Open'))));
    })) : empty('Nothing to practice right now', 'Enjoy the break.'));

  const withFb = [];
  const subById = Object.fromEntries(subs.map((s) => [s.id, s]));
  const seen = new Set();
  fbs.forEach((f) => { if (!seen.has(f.submission_id) && subById[f.submission_id]) { seen.add(f.submission_id); withFb.push({ f, s: subById[f.submission_id] }); } });
  const exName = Object.fromEntries(exercises.map((e) => [e.id, e.title]));
  const feedbackCard = h('section', { class: 'card' },
    h('h2', { class: 'card-h' }, 'Video feedback'),
    withFb.length ? h('ul', { class: 'plain' }, withFb.slice(0, 6).map(({ f, s }) =>
      h('li', {}, h('a', { class: 'row-link', href: `#/s/${stu.id}/l/${s.assignment_id}` + (s.exercise_id ? '?ex=' + s.exercise_id : '') },
        h('span', {}, h('strong', {}, exName[s.exercise_id] || 'Lesson video'), h('span', { class: 'muted block' }, f.body.length > 110 ? f.body.slice(0, 107) + '…' : f.body)),
        h('span', { class: 'muted small' }, fmtWhen(f.created_at))))))
      : empty('No feedback yet', subs.length ? 'Chris will review your videos soon.' : 'Upload a practice video from any exercise.'));

  const history = assignments.filter((a) => a.completed_at).sort((a, b) => b.completed_at.localeCompare(a.completed_at));
  const historyCard = h('section', { class: 'card' },
    h('h2', { class: 'card-h' }, 'Learning history'),
    history.length ? h('ul', { class: 'plain' }, history.map((a) => h('li', {}, h('a', { class: 'row-link', href: `#/s/${stu.id}/l/${a.id}` },
      h('span', {}, h('strong', {}, `Lesson ${a.lesson_number || ''}: ${a.lessons.title}`)), h('span', { class: 'muted small' }, 'Completed ' + fmtWhen(a.completed_at))))))
      : empty('Nothing completed yet', 'Finished lessons will appear here.'));

  return h('div', { class: 'page narrow' }, welcome, cont, practiceCard, feedbackCard, historyCard);
}

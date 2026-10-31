import { db, enc, inviteStudent } from './api.js';
import { h, field, modal, toast, chip, statusChip, fmtDay, fmtWhen, fmtRange, initials, empty } from './ui.js';
import { go } from './ctx.js';

const inList = (ids) => '(' + ids.map(enc).join(',') + ')';

/* Work out, per assignment, how many exercises are still open. */
export function progressFor(assignments, exercises, completions) {
  const byLesson = {}; exercises.forEach((e) => (byLesson[e.lesson_id] = byLesson[e.lesson_id] || []).push(e.id));
  const doneBy = {}; completions.forEach((c) => (doneBy[c.assignment_id] = doneBy[c.assignment_id] || new Set()).add(c.exercise_id));
  const out = {};
  assignments.forEach((a) => {
    const ids = byLesson[a.lesson_id] || [];
    const done = ids.filter((i) => doneBy[a.id] && doneBy[a.id].has(i)).length;
    out[a.id] = { total: ids.length, done, open: ids.length - done };
  });
  return out;
}

/* ---------------- dashboard ---------------- */
export async function teacherHome() {
  const [students, assignments, exercises, completions, subs] = await Promise.all([
    db.select('students', 'select=*&order=full_name'),
    db.select('assignments', 'select=id,student_id,lesson_id,lesson_number,lesson_date,status,completed_at,lessons(title)&order=lesson_date.desc.nullslast'),
    db.select('exercises', 'select=id,lesson_id&archived_at=is.null'),
    db.select('exercise_completions', 'select=assignment_id,exercise_id'),
    db.select('submissions', 'select=id,student_id,assignment_id,exercise_id,status,submitted_at,original_name&order=submitted_at.desc'),
  ]);
  const name = Object.fromEntries(students.map((s) => [s.id, s.full_name]));
  const prog = progressFor(assignments, exercises, completions);
  const published = assignments.filter((a) => a.status === 'published');
  const awaiting = subs.filter((s) => s.status !== 'feedback_provided');
  const outstandingBy = {};
  published.filter((a) => !a.completed_at).forEach((a) => { outstandingBy[a.student_id] = (outstandingBy[a.student_id] || 0) + prog[a.id].open; });
  const latestAsg = {}; assignments.forEach((a) => { if (!latestAsg[a.student_id]) latestAsg[a.student_id] = a; });
  const latestSub = {}; subs.forEach((s) => { if (!latestSub[s.student_id]) latestSub[s.student_id] = s; });
  const recentDone = assignments.filter((a) => a.completed_at).sort((a, b) => b.completed_at.localeCompare(a.completed_at)).slice(0, 5);

  const mkAdd = () => h('button', { class: 'btn', type: 'button', onclick: () => addStudent() }, 'Add student');
  const addBtn = mkAdd();

  const stat = (n, label) => h('div', { class: 'stat' }, h('p', { class: 'stat-n' }, String(n)), h('p', { class: 'mono' }, label));

  const reviewList = awaiting.length
    ? h('ul', { class: 'plain' }, awaiting.slice(0, 6).map((s) =>
        h('li', {}, h('a', { class: 'row-link', href: `#/s/${s.student_id}/l/${s.assignment_id}` },
          h('span', {}, h('strong', {}, name[s.student_id] || 'Student'), h('span', { class: 'muted' }, ' · ' + fmtWhen(s.submitted_at))),
          statusChip(s.status)))))
    : empty('Nothing waiting', 'New student videos will appear here.');

  const owing = students.filter((s) => outstandingBy[s.id] > 0);
  const owingList = owing.length
    ? h('ul', { class: 'plain' }, owing.map((s) => h('li', {}, h('a', { class: 'row-link', href: '#/s/' + s.id },
        h('strong', {}, s.full_name), h('span', { class: 'muted' }, outstandingBy[s.id] + ' open exercise' + (outstandingBy[s.id] === 1 ? '' : 's'))))))
    : empty('All caught up', 'No open homework right now.');

  const studentRows = students.length
    ? h('div', { class: 'tbl', role: 'list' }, students.map((s) => {
        const la = latestAsg[s.id], ls = latestSub[s.id];
        return h('a', { class: 'tbl-row', role: 'listitem', href: '#/s/' + s.id },
          h('span', { class: 'avatar', 'aria-hidden': 'true' }, initials(s.full_name)),
          h('span', { class: 'cell main' }, h('strong', {}, s.full_name), h('span', { class: 'muted' }, s.stage || 'No stage set')),
          h('span', { class: 'cell' }, h('span', { class: 'mono' }, 'Latest lesson'), la ? `Lesson ${la.lesson_number || '–'}: ${la.lessons ? la.lessons.title : ''}` : 'None yet'),
          h('span', { class: 'cell' }, h('span', { class: 'mono' }, 'Open homework'), outstandingBy[s.id] ? chip(outstandingBy[s.id] + ' open', 'warm') : chip('None', 'good')),
          h('span', { class: 'cell' }, h('span', { class: 'mono' }, 'Latest video'), ls ? fmtWhen(ls.submitted_at) : 'None yet'));
      }))
    : empty('No students yet', 'Add your first student to start building lessons.', mkAdd());

  const doneList = recentDone.length
    ? h('ul', { class: 'plain' }, recentDone.map((a) => h('li', {}, h('a', { class: 'row-link', href: `#/s/${a.student_id}/l/${a.id}` },
        h('span', {}, h('strong', {}, name[a.student_id] || ''), h('span', { class: 'muted' }, ` · Lesson ${a.lesson_number || ''}: ${a.lessons ? a.lessons.title : ''}`)),
        h('span', { class: 'muted' }, fmtWhen(a.completed_at))))))
    : empty('No completed lessons yet');

  return h('div', { class: 'page' },
    h('header', { class: 'page-head' }, h('div', {}, h('p', { class: 'mono ember' }, 'Teacher dashboard'), h('h1', { class: 'page-h', tabindex: '-1' }, 'Your students')), addBtn),
    h('div', { class: 'stats' }, stat(students.length, 'Students'), stat(published.length, 'Lessons assigned'), stat(awaiting.length, 'Videos to review')),
    h('div', { class: 'grid2' },
      h('section', { class: 'card' }, h('h2', { class: 'card-h' }, 'Videos waiting for you'), reviewList),
      h('section', { class: 'card' }, h('h2', { class: 'card-h' }, 'Open homework'), owingList)),
    h('section', { class: 'card' }, h('h2', { class: 'card-h' }, 'Students'), studentRows),
    h('section', { class: 'card' }, h('h2', { class: 'card-h' }, 'Recently completed lessons'), doneList));
}

async function addStudent() {
  const name = h('input', { type: 'text', autocomplete: 'off', required: true, maxlength: '120' });
  const email = h('input', { type: 'email', autocomplete: 'off', inputmode: 'email' });
  const stage = h('input', { type: 'text', autocomplete: 'off', maxlength: '120', placeholder: 'Beginner electric guitar' });
  let createdId = null;
  await modal({
    title: 'Add a student', confirmText: 'Add student',
    body: h('div', {}, field('Full name', name), field('Email', email, 'Needed to send their invitation. You can add it later.'), field('Current stage (optional)', stage)),
    onConfirm: async () => {
      if (!name.value.trim()) throw new Error('Please enter the student\'s name.');
      if (email.value.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.value.trim())) throw new Error('That email address looks incomplete.');
      const [row] = await db.insert('students', { full_name: name.value.trim(), email: email.value.trim() || null, stage: stage.value.trim() || null });
      createdId = row.id;
    },
  });
  if (createdId) { toast('Student added.'); go('#/s/' + createdId); }
}

/* ---------------- one student ---------------- */
export async function studentProfile(sid) {
  const [stuRows, assignments, subs, notes] = await Promise.all([
    db.select('students', 'select=*&id=eq.' + enc(sid)),
    db.select('assignments', `select=*,lessons(id,title)&student_id=eq.${enc(sid)}&order=lesson_date.desc.nullslast,created_at.desc`),
    db.select('submissions', `select=*&student_id=eq.${enc(sid)}&order=submitted_at.desc`),
    db.select('teacher_notes', `select=*&student_id=eq.${enc(sid)}&assignment_id=is.null&order=created_at.desc`),
  ]);
  const stu = stuRows[0];
  if (!stu) return null;
  const lessonIds = [...new Set(assignments.map((a) => a.lesson_id))];
  const [exercises, completions] = await Promise.all([
    lessonIds.length ? db.select('exercises', `select=id,lesson_id&archived_at=is.null&lesson_id=in.${inList(lessonIds)}`) : [],
    db.select('exercise_completions', `select=assignment_id,exercise_id&student_id=eq.${enc(sid)}`),
  ]);
  const prog = progressFor(assignments, exercises, completions);
  const awaiting = subs.filter((s) => s.status !== 'feedback_provided');
  const rerender = () => go(location.hash);

  const accountState = stu.user_id ? chip('Account created', 'good') : chip('No account yet', 'warm');
  const inviteBtn = h('button', { class: 'btn ghost', type: 'button' }, stu.user_id ? 'Send sign-in link again' : 'Send invitation');
  inviteBtn.addEventListener('click', async () => {
    if (!stu.email) { toast('Add the student\'s email first (Edit details).', 'error'); return; }
    inviteBtn.disabled = true; inviteBtn.textContent = 'Sending…';
    try { const r = await inviteStudent(sid); toast(r.message || 'Invitation sent.'); rerender(); }
    catch (e) { toast(e.message, 'error'); inviteBtn.disabled = false; inviteBtn.textContent = stu.user_id ? 'Send sign-in link again' : 'Send invitation'; }
  });

  const lessonList = assignments.length
    ? h('ul', { class: 'plain' }, assignments.map((a) => {
        const p = prog[a.id] || { total: 0, done: 0 };
        return h('li', { class: 'lesson-li' },
          h('a', { class: 'row-link', href: `#/s/${sid}/l/${a.id}` },
            h('span', {}, h('strong', {}, `Lesson ${a.lesson_number || '–'}: ${a.lessons ? a.lessons.title : ''}`),
              h('span', { class: 'muted' }, ' · ' + (fmtDay(a.lesson_date) || 'No date'))),
            h('span', { class: 'chips-row' },
              a.completed_at ? chip('Completed', 'good') : a.status === 'draft' ? chip('Draft', '') : chip('Published', 'warm'),
              h('span', { class: 'muted' }, `${p.done}/${p.total} exercises`))),
          h('a', { class: 'mini', href: `#/s/${sid}/l/${a.id}/edit` }, 'Edit'));
      }))
    : empty('No lessons yet', 'Create the first lesson for ' + stu.full_name + '.');

  const subList = subs.length
    ? h('ul', { class: 'plain' }, subs.slice(0, 12).map((s) => h('li', {}, h('a', { class: 'row-link', href: `#/s/${sid}/l/${s.assignment_id}` },
        h('span', {}, h('strong', {}, s.original_name || 'Video'), h('span', { class: 'muted' }, ' · ' + fmtWhen(s.submitted_at))), statusChip(s.status)))))
    : empty('No videos yet');

  const noteBox = h('textarea', { rows: '3', maxlength: '4000', placeholder: 'Private note (only you can see this)' });
  const addNote = h('button', { class: 'btn ghost', type: 'button' }, 'Add note');
  addNote.addEventListener('click', async () => {
    if (!noteBox.value.trim()) return;
    addNote.disabled = true;
    try { await db.insert('teacher_notes', { student_id: sid, body: noteBox.value.trim() }); toast('Note saved.'); rerender(); }
    catch (e) { toast(e.message, 'error'); addNote.disabled = false; }
  });
  const noteList = notes.length ? h('ul', { class: 'plain notes' }, notes.map((n) => h('li', {},
    h('p', { class: 'pre' }, n.body), h('p', { class: 'muted small' }, fmtWhen(n.created_at) + ' · ',
      h('button', { class: 'linkish', type: 'button', onclick: async () => { if (!confirm('Delete this note?')) return; try { await db.remove('teacher_notes', 'id=eq.' + enc(n.id)); rerender(); } catch (e) { toast(e.message, 'error'); } } }, 'Delete')))))
    : null;

  return h('div', { class: 'page' },
    h('a', { class: 'back', href: '#/' }, '← All students'),
    h('header', { class: 'page-head' },
      h('div', { class: 'who' }, h('span', { class: 'avatar big', 'aria-hidden': 'true' }, initials(stu.full_name)),
        h('div', {}, h('p', { class: 'mono ember' }, 'Student'), h('h1', { class: 'page-h', tabindex: '-1' }, stu.full_name),
          h('p', { class: 'muted' }, [stu.stage, stu.email, 'Joined ' + fmtDay(stu.joined_at)].filter(Boolean).join(' · ')))),
      h('div', { class: 'head-actions' },
        h('a', { class: 'btn', href: `#/s/${sid}/new` }, 'New lesson'),
        h('button', { class: 'btn ghost', type: 'button', onclick: () => editStudent(stu, rerender) }, 'Edit details'))),
    h('div', { class: 'grid2' },
      h('section', { class: 'card' }, h('h2', { class: 'card-h' }, 'Progress notes'),
        stu.progress_notes ? h('p', { class: 'pre' }, stu.progress_notes) : h('p', { class: 'muted' }, 'No notes yet. Use Edit details to add some. Students can see these.')),
      h('section', { class: 'card' }, h('h2', { class: 'card-h' }, 'Account'),
        h('p', { class: 'row-between' }, accountState, inviteBtn),
        h('p', { class: 'fine' }, stu.email ? 'Invitations go to ' + stu.email + '.' : 'Add an email address to invite this student.'))),
    h('section', { class: 'card' }, h('h2', { class: 'card-h' }, 'Lessons'), lessonList),
    h('div', { class: 'grid2' },
      h('section', { class: 'card' }, h('h2', { class: 'card-h' }, 'Video submissions', awaiting.length ? chip(awaiting.length + ' to review', 'warm') : null), subList),
      h('section', { class: 'card' }, h('h2', { class: 'card-h' }, 'Private teacher notes'), h('p', { class: 'fine' }, 'Never visible to the student.'), noteBox, h('div', { class: 'row-actions' }, addNote), noteList)));
}

async function editStudent(stu, done) {
  const name = h('input', { type: 'text', value: stu.full_name, required: true, maxlength: '120' });
  const email = h('input', { type: 'email', value: stu.email || '', inputmode: 'email' });
  const stage = h('input', { type: 'text', value: stu.stage || '', maxlength: '120' });
  const notes = h('textarea', { rows: '4', maxlength: '4000' }, stu.progress_notes || '');
  await modal({
    title: 'Edit student', confirmText: 'Save',
    body: h('div', {}, field('Full name', name), field('Email', email, 'Used for invitations.'), field('Current stage', stage),
      field('Progress notes', notes, 'The student can see these. Use private notes for anything else.')),
    onConfirm: async () => {
      if (!name.value.trim()) throw new Error('Please enter a name.');
      if (email.value.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.value.trim())) throw new Error('That email address looks incomplete.');
      await db.update('students', 'id=eq.' + enc(stu.id), { full_name: name.value.trim(), email: email.value.trim() || null, stage: stage.value.trim() || null, progress_notes: notes.value.trim() || null });
      toast('Saved.'); done();
    },
  });
}

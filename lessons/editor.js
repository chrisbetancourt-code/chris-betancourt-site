import { db, enc } from './api.js';
import { ctx, go } from './ctx.js';
import { h, field, toast, safeUrl } from './ui.js';

const BLOCK_TYPES = [
  ['heading', 'Heading'], ['paragraph', 'Paragraph'], ['bullets', 'Bullet list'], ['numbered', 'Numbered steps'],
  ['chords', 'Chord chart'], ['tab', 'Guitar tab'], ['video', 'Video (YouTube or link)'], ['image', 'Image'], ['link', 'Link'],
];
const lines = (t) => String(t || '').split('\n').map((s) => s.trim()).filter(Boolean);
const inList = (ids) => '(' + ids.map(enc).join(',') + ')';

const linksToText = (arr) => (arr || []).map((l) => (l.label ? l.label + ' | ' : '') + l.url).join('\n');
function textToLinks(t) {
  return lines(t).map((ln) => {
    const i = ln.lastIndexOf('|');
    const label = i >= 0 ? ln.slice(0, i).trim() : '';
    const url = (i >= 0 ? ln.slice(i + 1) : ln).trim();
    if (!safeUrl(url)) throw new Error('Check this reference link: "' + ln + '". Use the form  Label | https://…');
    return { label: label || url, url: safeUrl(url) };
  });
}

export async function lessonEditor(sid, aid) {
  const [students, lessonsList] = await Promise.all([
    db.select('students', 'select=id,full_name&order=full_name'),
    aid ? [] : db.select('lessons', 'select=id,title&order=created_at.desc&limit=50'),
  ]);
  if (!students.find((s) => s.id === sid)) return null;

  const st = {
    assignmentId: aid || null, lessonId: null, studentId: sid, status: 'draft', hadPublished: false,
    number: '', date: '', hwStart: '', hwDue: '',
    title: '', objective: '', concepts: '', skills: '',
    objectives: [], removedObjectives: [], blocks: [], agenda: [], exercises: [], removedExercises: [],
    note: '', noteId: null,
  };

  async function fillFromLesson(lessonId, keepIds) {
    const [[l], exs, objs] = await Promise.all([
      db.select('lessons', 'select=*&id=eq.' + enc(lessonId)),
      db.select('exercises', `select=*&lesson_id=eq.${enc(lessonId)}&archived_at=is.null&order=position`),
      db.select('lesson_objectives', `select=*&lesson_id=eq.${enc(lessonId)}&archived_at=is.null&order=position`),
    ]);
    if (keepIds) st.lessonId = l.id;
    st.title = l.title; st.objective = l.objective || '';
    st.concepts = (l.key_concepts || []).join('\n'); st.skills = (l.skills || []).join('\n');
    st.blocks = JSON.parse(JSON.stringify(l.content || []));
    st.agenda = JSON.parse(JSON.stringify(l.agenda || []));
    st.objectives = objs.map((o) => ({ id: keepIds ? o.id : null, text: o.text }));
    st.exercises = exs.map((e) => ({
      id: keepIds ? e.id : null, title: e.title, instructions: e.instructions || '', tab: e.tab || '',
      duration: e.duration_minutes ?? '', tempo: e.tempo_bpm ?? '', schedule: e.schedule || '', due: e.due_date || '',
      links: linksToText(e.reference_links), requires: !!e.requires_video,
    }));
  }

  if (aid) {
    const [a] = await db.select('assignments', `select=*&id=eq.${enc(aid)}`);
    if (!a || a.student_id !== sid) return null;
    await fillFromLesson(a.lesson_id, true);
    Object.assign(st, { status: a.status, hadPublished: a.status === 'published', number: a.lesson_number ?? '', date: a.lesson_date || '', hwStart: a.homework_start || '', hwDue: a.homework_due || '' });
    const [n] = await db.select('teacher_notes', `select=*&assignment_id=eq.${enc(aid)}&order=created_at&limit=1`);
    if (n) { st.noteId = n.id; st.note = n.body; }
  } else {
    // sensible defaults for a brand-new lesson
    const mine = await db.select('assignments', `select=lesson_number&student_id=eq.${enc(sid)}&order=lesson_number.desc.nullslast&limit=1`);
    st.number = ((mine[0] && mine[0].lesson_number) || 0) + 1;
    st.exercises = [blankExercise()]; st.objectives = [{ id: null, text: '' }];
  }
  function blankExercise() { return { id: null, title: '', instructions: '', tab: '', duration: '', tempo: '', schedule: '', due: '', links: '', requires: false }; }

  /* ---------- small bound inputs ---------- */
  const bind = (obj, key, el) => { el.addEventListener('input', () => { obj[key] = el.type === 'checkbox' ? el.checked : el.value; }); return el; };
  const input = (obj, key, attrs) => bind(obj, key, h('input', { type: 'text', value: obj[key] ?? '', ...(attrs || {}) }));
  const area = (obj, key, rows, attrs) => { const t = h('textarea', { rows: String(rows || 3), ...(attrs || {}) }); t.value = obj[key] ?? ''; return bind(obj, key, t); };
  const move = (arr, i, d) => { const j = i + d; if (j < 0 || j >= arr.length) return; [arr[i], arr[j]] = [arr[j], arr[i]]; };
  const rowTools = (arr, i, redraw, onRemove) => h('div', { class: 'row-tools' },
    h('button', { class: 'mini', type: 'button', 'aria-label': 'Move up', onclick: () => { move(arr, i, -1); redraw(); } }, '↑'),
    h('button', { class: 'mini', type: 'button', 'aria-label': 'Move down', onclick: () => { move(arr, i, 1); redraw(); } }, '↓'),
    h('button', { class: 'mini danger', type: 'button', onclick: () => { const [r] = arr.splice(i, 1); if (onRemove) onRemove(r); redraw(); } }, 'Remove'));

  /* ---------- objectives ---------- */
  const objBox = h('div', { class: 'stack' });
  function drawObjectives() {
    objBox.replaceChildren(...st.objectives.map((o, i) => h('div', { class: 'row-edit' },
      field('Objective ' + (i + 1), input(o, 'text', { maxlength: '200' })),
      rowTools(st.objectives, i, drawObjectives, (r) => r.id && st.removedObjectives.push(r.id)))),
      h('button', { class: 'btn ghost', type: 'button', onclick: () => { st.objectives.push({ id: null, text: '' }); drawObjectives(); } }, 'Add objective'));
  }

  /* ---------- content blocks ---------- */
  const blockBox = h('div', { class: 'stack' });
  const newType = h('select', { 'aria-label': 'Type of block to add' }, BLOCK_TYPES.map(([v, l]) => h('option', { value: v }, l)));
  function blockRow(b, i) {
    const label = (BLOCK_TYPES.find((t) => t[0] === b.type) || [0, b.type])[1];
    let body;
    switch (b.type) {
      case 'heading': body = field('Heading', input(b, 'text', { maxlength: '160' })); break;
      case 'paragraph': body = field('Text', area(b, 'text', 4)); break;
      case 'bullets': case 'numbered': {
        const t = h('textarea', { rows: '4' }); t.value = (b.items || []).join('\n');
        t.addEventListener('input', () => { b.items = lines(t.value); });
        body = field('One item per line', t); break;
      }
      case 'chords': case 'tab': {
        const t = area(b, 'text', 7, { class: 'mono-in', spellcheck: 'false', wrap: 'off' });
        body = h('div', {}, field('Caption (optional)', input(b, 'caption', { maxlength: '120' })), field('Spacing is kept exactly as you type it', t)); break;
      }
      case 'video': body = h('div', {}, field('YouTube or video link', input(b, 'url', { inputmode: 'url', placeholder: 'https://youtu.be/…' })), field('Caption (optional)', input(b, 'caption', { maxlength: '200' }))); break;
      case 'image': body = h('div', {}, field('Image link', input(b, 'url', { inputmode: 'url', placeholder: 'https://…' })), field('Describe the image', input(b, 'alt', { maxlength: '200' }))); break;
      case 'link': body = h('div', {}, field('Link', input(b, 'url', { inputmode: 'url', placeholder: 'https://…' })), field('Link text', input(b, 'label', { maxlength: '120' }))); break;
      default: body = h('p', { class: 'muted' }, 'Unknown block');
    }
    return h('div', { class: 'row-edit block-edit' }, h('p', { class: 'mono' }, `${i + 1}. ${label}`), body, rowTools(st.blocks, i, drawBlocks));
  }
  function drawBlocks() {
    blockBox.replaceChildren(...st.blocks.map(blockRow),
      h('div', { class: 'row-actions' }, newType,
        h('button', { class: 'btn ghost', type: 'button', onclick: () => {
          const t = newType.value; const b = { type: t };
          if (t === 'bullets' || t === 'numbered') b.items = []; else if (t === 'video' || t === 'image' || t === 'link') b.url = ''; else b.text = '';
          st.blocks.push(b); drawBlocks();
        } }, 'Add block')));
  }

  /* ---------- agenda ---------- */
  const agendaBox = h('div', { class: 'stack' });
  const agendaTotal = h('p', { class: 'muted' });
  function drawAgenda() {
    const sum = () => { agendaTotal.textContent = 'Total: ' + st.agenda.reduce((n, r) => n + (+r.minutes || 0), 0) + ' minutes'; };
    agendaBox.replaceChildren(...st.agenda.map((r, i) => {
      const mins = h('input', { type: 'number', min: '0', max: '600', value: r.minutes ?? '', class: 'short', inputmode: 'numeric' });
      mins.addEventListener('input', () => { r.minutes = mins.value; sum(); });
      return h('div', { class: 'row-edit agenda-edit' }, field('Minutes', mins), field('Activity', input(r, 'activity', { maxlength: '200' })), rowTools(st.agenda, i, drawAgenda));
    }), agendaTotal, h('button', { class: 'btn ghost', type: 'button', onclick: () => { st.agenda.push({ minutes: '', activity: '' }); drawAgenda(); } }, 'Add agenda item'));
    sum();
  }

  /* ---------- exercises ---------- */
  const exBox = h('div', { class: 'stack' });
  function drawExercises() {
    exBox.replaceChildren(...st.exercises.map((e, i) => {
      const req = h('input', { type: 'checkbox', checked: e.requires }); req.addEventListener('change', () => { e.requires = req.checked; });
      const num = (k, max) => bind(e, k, h('input', { type: 'number', min: '0', max: String(max), value: e[k] ?? '', inputmode: 'numeric', class: 'short' }));
      return h('div', { class: 'row-edit ex-edit' },
        h('p', { class: 'mono' }, 'Exercise ' + (i + 1)),
        field('Title', input(e, 'title', { maxlength: '160' })),
        field('Instructions', area(e, 'instructions', 6)),
        field('Guitar tab (optional)', area(e, 'tab', 3, { class: 'mono-in', spellcheck: 'false', wrap: 'off' })),
        h('div', { class: 'grid3' },
          field('Practice minutes', num('duration', 600)),
          field('Tempo (BPM)', num('tempo', 400)),
          field('Due date', bind(e, 'due', h('input', { type: 'date', value: e.due || '' })))),
        field('When to practice', input(e, 'schedule', { maxlength: '160', placeholder: 'Daily, Oct 31 to Nov 5' })),
        field('Reference links (one per line: Label | https://…)', area(e, 'links', 2, { spellcheck: 'false' })),
        h('label', { class: 'check' }, req, h('span', {}, 'Ask the student to upload a practice video')),
        rowTools(st.exercises, i, drawExercises, (r) => r.id && st.removedExercises.push(r.id)));
    }), h('button', { class: 'btn ghost', type: 'button', onclick: () => { st.exercises.push(blankExercise()); drawExercises(); } }, 'Add exercise'));
  }

  /* ---------- top fields ---------- */
  const studentSel = h('select', { disabled: !!aid }, students.map((s) => h('option', { value: s.id, selected: s.id === st.studentId }, s.full_name)));
  studentSel.addEventListener('change', () => { st.studentId = studentSel.value; });
  const copySel = h('select', {}, h('option', { value: '' }, 'Start blank'), lessonsList.map((l) => h('option', { value: l.id }, l.title)));
  copySel.addEventListener('change', async () => {
    if (!copySel.value) return;
    if (!confirm('Copy this lesson into the form? It replaces what you have typed so far.')) { copySel.value = ''; return; }
    try { await fillFromLesson(copySel.value, false); redrawAll(); toast('Copied. It is saved as a new lesson, so edits will not change the original.'); }
    catch (e) { toast(e.message, 'error'); }
  });
  const titleIn = input(st, 'title', { maxlength: '160', required: true });
  const objIn = area(st, 'objective', 3);
  const conceptsIn = area(st, 'concepts', 3);
  const skillsIn = area(st, 'skills', 3);
  const numIn = bind(st, 'number', h('input', { type: 'number', min: '1', max: '999', value: st.number, class: 'short', inputmode: 'numeric' }));
  const dateIn = bind(st, 'date', h('input', { type: 'date', value: st.date }));
  const hwStartIn = bind(st, 'hwStart', h('input', { type: 'date', value: st.hwStart }));
  const hwDueIn = bind(st, 'hwDue', h('input', { type: 'date', value: st.hwDue }));
  const noteIn = area(st, 'note', 4, { maxlength: '8000', placeholder: 'Private. Students cannot see this.' });

  function redrawAll() {
    titleIn.value = st.title; objIn.value = st.objective; conceptsIn.value = st.concepts; skillsIn.value = st.skills;
    drawObjectives(); drawBlocks(); drawAgenda(); drawExercises();
  }

  /* ---------- save ---------- */
  const err = h('p', { class: 'form-err', role: 'alert' });
  const mk = (cls, text) => h('button', { class: 'btn ' + cls, type: 'button' }, text);
  const bDraft = mk('ghost', st.hadPublished ? 'Save changes' : 'Save draft');
  const bPublish = st.hadPublished ? null : mk('', 'Publish to student');
  const allBtns = [bDraft, bPublish].filter(Boolean);

  async function save(publish) {
    err.textContent = '';
    try {
      if (!st.title.trim()) { titleIn.focus(); throw new Error('Give the lesson a title.'); }
      if (!st.studentId) throw new Error('Choose a student.');
      const exercises = st.exercises.filter((e) => e.title.trim());
      const exLinks = exercises.map((e) => textToLinks(e.links));
      const blocks = st.blocks.filter((b) => (b.items ? b.items.length : (b.text || b.url || '').trim()));
      for (const b of blocks) if (b.url && !safeUrl(b.url)) throw new Error('A link in the lesson content is not a valid web address (it must start with https://).');
      const agenda = st.agenda.filter((r) => String(r.activity || '').trim()).map((r) => ({ minutes: Math.max(0, +r.minutes || 0), activity: r.activity.trim() }));
      const payload = {
        title: st.title.trim(), objective: st.objective.trim() || null,
        key_concepts: lines(st.concepts), skills: lines(st.skills), content: blocks, agenda,
      };
      allBtns.forEach((b) => (b.disabled = true));

      if (!st.lessonId) { const [l] = await db.insert('lessons', { ...payload, created_by: ctx.profile.id }); st.lessonId = l.id; }
      else await db.update('lessons', 'id=eq.' + enc(st.lessonId), payload);

      // objectives: edit or add; removed ones are archived (never deleted) so history stays intact
      const objs = st.objectives.filter((o) => o.text.trim());
      for (let i = 0; i < objs.length; i++) if (objs[i].id) await db.update('lesson_objectives', 'id=eq.' + enc(objs[i].id), { text: objs[i].text.trim(), position: i + 1 });
      const newObjs = objs.map((o, i) => [o, i]).filter(([o]) => !o.id);
      if (newObjs.length) {
        const rows = await db.insert('lesson_objectives', newObjs.map(([o, i]) => ({ lesson_id: st.lessonId, position: i + 1, text: o.text.trim() })));
        rows.forEach((r, k) => (newObjs[k][0].id = r.id));
      }
      if (st.removedObjectives.length) { await db.update('lesson_objectives', 'id=in.' + inList(st.removedObjectives), { archived_at: new Date().toISOString() }); st.removedObjectives = []; }

      // exercises: same idea
      const rowOf = (e, i, k) => ({
        lesson_id: st.lessonId, position: i + 1, title: e.title.trim(), instructions: e.instructions.trim() || null, tab: e.tab.replace(/\s+$/, '') || null,
        duration_minutes: e.duration === '' ? null : +e.duration, tempo_bpm: e.tempo === '' ? null : +e.tempo,
        schedule: e.schedule.trim() || null, due_date: e.due || null, reference_links: exLinks[k], requires_video: !!e.requires,
      });
      for (let k = 0; k < exercises.length; k++) if (exercises[k].id) await db.update('exercises', 'id=eq.' + enc(exercises[k].id), rowOf(exercises[k], k, k));
      const newEx = exercises.map((e, k) => [e, k]).filter(([e]) => !e.id);
      if (newEx.length) {
        const rows = await db.insert('exercises', newEx.map(([e, k]) => rowOf(e, k, k)));
        rows.forEach((r, j) => (newEx[j][0].id = r.id));
      }
      if (st.removedExercises.length) { await db.update('exercises', 'id=in.' + inList(st.removedExercises), { archived_at: new Date().toISOString() }); st.removedExercises = []; }

      // the assignment (this lesson, for this student)
      const wantPublished = publish || st.status === 'published';
      const aPayload = {
        lesson_number: st.number === '' ? null : +st.number, lesson_date: st.date || null,
        homework_start: st.hwStart || null, homework_due: st.hwDue || null,
        status: wantPublished ? 'published' : 'draft',
      };
      if (wantPublished && st.status !== 'published') aPayload.published_at = new Date().toISOString();
      if (!st.assignmentId) { const [a] = await db.insert('assignments', { ...aPayload, student_id: st.studentId, lesson_id: st.lessonId }); st.assignmentId = a.id; }
      else await db.update('assignments', 'id=eq.' + enc(st.assignmentId), aPayload);
      st.status = aPayload.status;

      // private note
      const text = st.note.trim();
      if (st.noteId && !text) { await db.remove('teacher_notes', 'id=eq.' + enc(st.noteId)); st.noteId = null; }
      else if (st.noteId) await db.update('teacher_notes', 'id=eq.' + enc(st.noteId), { body: text });
      else if (text) { const [n] = await db.insert('teacher_notes', { student_id: st.studentId, assignment_id: st.assignmentId, body: text }); st.noteId = n.id; }

      toast(wantPublished ? 'Saved. The student can see this lesson.' : 'Draft saved.');
      go(`#/s/${st.studentId}/l/${st.assignmentId}`);
    } catch (e) {
      err.textContent = e.message || 'Could not save. Your changes are still on this page. Try again.';
      allBtns.forEach((b) => (b.disabled = false));
      err.scrollIntoView({ block: 'center' });
    }
  }
  bDraft.addEventListener('click', () => save(false));
  if (bPublish) bPublish.addEventListener('click', () => save(true));

  const section = (title, hint, ...kids) => h('section', { class: 'card' }, h('h2', { class: 'card-h' }, title), hint ? h('p', { class: 'fine' }, hint) : null, ...kids);
  redrawAll();

  return h('form', { class: 'page narrow editor', novalidate: true, onsubmit: (e) => e.preventDefault() },
    h('a', { class: 'back', href: aid ? `#/s/${sid}/l/${aid}` : '#/s/' + sid }, '← Cancel'),
    h('header', { class: 'page-head' }, h('div', {}, h('p', { class: 'mono ember' }, aid ? 'Edit lesson' : 'New lesson'), h('h1', { class: 'page-h', tabindex: '-1' }, aid ? 'Edit lesson' : 'Create a lesson'))),
    st.hadPublished ? h('p', { class: 'banner' }, 'This lesson is published. Changes appear for the student right away. Their completed exercises are kept.') : null,
    section('Basics', null,
      field('Student', studentSel),
      aid ? null : field('Start from an existing lesson (optional)', copySel, 'Copies the content so you can reuse it for another student.'),
      field('Lesson title', titleIn),
      h('div', { class: 'grid3' }, field('Lesson number', numIn), field('Lesson date', dateIn), h('span', {})),
      field('Main objective', objIn),
      field('Key concepts (one per line)', conceptsIn), field('Skills being developed (one per line)', skillsIn)),
    section('Objectives to achieve', 'You can tick these off on the lesson page as the student reaches them.', objBox),
    section('Lesson content', 'Build the lesson with blocks: headings, text, lists, chord charts, tabs, videos and links.', blockBox),
    section('Agenda', null, agendaBox),
    section('Homework', 'Dates and exercises for the week.',
      h('div', { class: 'grid3' }, field('Homework starts', hwStartIn), field('Homework due', hwDueIn), h('span', {})), exBox),
    section('Private teacher notes', 'Only you can see this.', noteIn),
    err,
    h('div', { class: 'row-actions sticky-actions' }, ...allBtns, h('a', { class: 'btn ghost', href: aid ? `#/s/${sid}/l/${aid}` : '#/s/' + sid }, 'Cancel')));
}

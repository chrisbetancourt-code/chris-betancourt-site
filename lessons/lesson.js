import { db, enc, uploadVideo, signedVideoUrl, deleteVideoFile } from './api.js';
import { MAX_VIDEO_MB } from './config.js';
import { ctx, isTeacher, go } from './ctx.js';
import { h, renderBlocks, chip, statusChip, toast, fmtDay, fmtRange, fmtWhen, fmtBytes, fmtClock, parseClock, ext, empty, field } from './ui.js';

const OK_EXT = { mp4: 'video/mp4', mov: 'video/quicktime', m4v: 'video/x-m4v', webm: 'video/webm', '3gp': 'video/3gpp' };
const OK_TYPES = Object.values(OK_EXT);
const inList = (ids) => '(' + ids.map(enc).join(',') + ')';

export async function lessonPage(sid, aid, focusExercise) {
  const [asg] = await db.select('assignments', `select=*,lessons(*),students(id,full_name)&id=eq.${enc(aid)}`);
  // The ID in the address bar proves nothing. The database already filtered by who you are;
  // we also make sure the page belongs to the student named in the address.
  if (!asg || asg.student_id !== sid || !asg.lessons) return null;
  const lid = asg.lesson_id;
  const teacher = isTeacher();
  const [exs, objs, ach, comps, subs] = await Promise.all([
    db.select('exercises', `select=*&lesson_id=eq.${enc(lid)}&archived_at=is.null&order=position`),
    db.select('lesson_objectives', `select=*&lesson_id=eq.${enc(lid)}&archived_at=is.null&order=position`),
    db.select('objective_achievements', `select=*&assignment_id=eq.${enc(aid)}`),
    db.select('exercise_completions', `select=*&assignment_id=eq.${enc(aid)}`),
    db.select('submissions', `select=*&assignment_id=eq.${enc(aid)}&order=submitted_at.desc`),
  ]);
  const [fbs, notes] = await Promise.all([
    subs.length ? db.select('feedback', `select=*&submission_id=in.${inList(subs.map((s) => s.id))}&order=created_at`) : [],
    teacher ? db.select('teacher_notes', `select=*&assignment_id=eq.${enc(aid)}&order=created_at`) : [],
  ]);

  const lesson = asg.lessons;
  const done = new Set(comps.map((c) => c.exercise_id));
  const achieved = new Set(ach.map((a) => a.objective_id));
  const reload = () => { const y = window.scrollY; go(location.hash); setTimeout(() => window.scrollTo(0, y), 60); };
  const fbBySub = {}; fbs.forEach((f) => (fbBySub[f.submission_id] = fbBySub[f.submission_id] || []).push(f));
  const subsFor = (exId) => subs.filter((s) => (s.exercise_id || null) === exId);

  /* ----- overview ----- */
  const overview = h('section', { class: 'card hero-card' },
    h('p', { class: 'mono ember' }, `Lesson ${asg.lesson_number || ''}${asg.lesson_date ? ' · ' + fmtDay(asg.lesson_date, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }) : ''}`),
    h('h1', { class: 'page-h', tabindex: '-1' }, lesson.title),
    teacher && asg.status === 'draft' ? h('p', { class: 'banner' }, 'Draft. ' + asg.students.full_name + ' cannot see this lesson yet.') : null,
    lesson.objective ? h('div', { class: 'objective' }, h('p', { class: 'mono' }, 'Main objective'), h('p', {}, lesson.objective)) : null,
    objs.length ? h('div', {}, h('p', { class: 'mono' }, 'Objectives'),
      h('ul', { class: 'checks' }, objs.map((o) => {
        const box = h('input', { type: 'checkbox', checked: achieved.has(o.id), disabled: !teacher, 'aria-label': 'Achieved: ' + o.text });
        if (teacher) box.addEventListener('change', async () => {
          box.disabled = true;
          try {
            if (box.checked) await db.insert('objective_achievements', { assignment_id: aid, objective_id: o.id });
            else await db.remove('objective_achievements', `assignment_id=eq.${enc(aid)}&objective_id=eq.${enc(o.id)}`);
          } catch (e) { box.checked = !box.checked; toast(e.message, 'error'); }
          box.disabled = false;
        });
        return h('li', {}, h('label', { class: 'check' }, box, h('span', {}, o.text)));
      }))) : null,
    (lesson.key_concepts || []).length ? h('div', {}, h('p', { class: 'mono' }, 'Key concepts'), h('p', { class: 'chips-row' }, lesson.key_concepts.map((k) => chip(k)))) : null,
    (lesson.skills || []).length ? h('div', {}, h('p', { class: 'mono' }, 'Skills you are building'), h('p', { class: 'chips-row' }, lesson.skills.map((k) => chip(k)))) : null);

  const content = (lesson.content || []).length ? h('section', { class: 'card' }, h('h2', { class: 'card-h' }, 'Lesson'), renderBlocks(lesson.content)) : null;

  const agenda = (lesson.agenda || []).length ? (() => {
    const total = lesson.agenda.reduce((n, r) => n + (+r.minutes || 0), 0);
    return h('section', { class: 'card' }, h('h2', { class: 'card-h' }, 'Lesson agenda'),
      h('table', { class: 'agenda' },
        h('thead', {}, h('tr', {}, h('th', { scope: 'col' }, 'Duration'), h('th', { scope: 'col' }, 'Activity'))),
        h('tbody', {}, lesson.agenda.map((r) => h('tr', {}, h('td', {}, (+r.minutes || 0) + ' min'), h('td', {}, String(r.activity || ''))))),
        h('tfoot', {}, h('tr', {}, h('td', {}, total + ' min'), h('td', {}, 'Total')))));
  })() : null;

  /* ----- exercises ----- */
  const doneCount = exs.filter((e) => done.has(e.id)).length;
  const exCards = exs.map((e, i) => exerciseCard(e, i));

  function exerciseCard(e, i) {
    const isDone = done.has(e.id);
    const mine = subsFor(e.id);
    const meta = [e.duration_minutes ? `About ${e.duration_minutes} min` : null, e.tempo_bpm ? `${e.tempo_bpm} BPM` : null, e.schedule, e.due_date ? 'Due ' + fmtDay(e.due_date) : null].filter(Boolean);
    const toggle = h('button', { class: 'btn ' + (isDone ? 'ghost' : ''), type: 'button' }, isDone ? 'Completed ✓ (tap to undo)' : 'Mark as completed');
    if (!teacher) toggle.addEventListener('click', async () => {
      toggle.disabled = true;
      try {
        if (isDone) await db.remove('exercise_completions', `assignment_id=eq.${enc(aid)}&exercise_id=eq.${enc(e.id)}`);
        else await db.insert('exercise_completions', { assignment_id: aid, exercise_id: e.id, student_id: ctx.student.id });
        reload();
      } catch (err) { toast(err.message, 'error'); toggle.disabled = false; }
    });
    return h('article', { class: 'ex' + (isDone ? ' is-done' : ''), id: 'ex-' + e.id },
      h('header', { class: 'ex-head' },
        h('span', { class: 'ex-n' }, String(i + 1)),
        h('div', {}, h('h3', { class: 'ex-t' }, e.title),
          h('p', { class: 'chips-row' }, isDone ? chip('Completed', 'good') : chip('Not completed yet'),
            e.requires_video ? chip('Video requested', 'warm') : null))),
      meta.length ? h('p', { class: 'muted ex-meta' }, meta.join(' · ')) : null,
      e.instructions ? h('p', { class: 'pre' }, e.instructions) : null,
      e.tab ? h('figure', { class: 'tabfig' }, h('pre', { class: 'tab', tabindex: '0', 'aria-label': 'Guitar tablature' }, e.tab)) : null,
      (e.reference_links || []).length ? h('p', { class: 'refs' }, h('span', { class: 'mono' }, 'Reference '), (e.reference_links || []).map((l) => ext(l.url, l.label || l.url))) : null,
      !teacher ? h('div', { class: 'row-actions' }, toggle) : null,
      h('div', { class: 'vids' },
        h('h4', { class: 'vids-h' }, 'Practice videos'),
        mine.length ? mine.map((s) => submissionCard(s)) : h('p', { class: 'muted' }, teacher ? 'No videos submitted for this exercise.' : 'No videos yet.'),
        !teacher ? uploader(e.id) : null));
  }

  /* ----- submissions ----- */
  function submissionCard(s) {
    const fb = fbBySub[s.id] || [];
    const slot = h('div', { class: 'player' });
    let video = null, loading = null;
    const ensurePlayer = () => {
      if (video) return Promise.resolve(video);
      if (loading) return loading;
      loading = signedVideoUrl(s.storage_path, 600).then((url) => {
        video = h('video', { controls: true, playsinline: true, preload: 'metadata', src: url, 'aria-label': 'Practice video' });
        slot.replaceChildren(video);
        return video;
      }).catch((err) => { loading = null; toast(err.message, 'error'); throw err; });
      return loading;
    };
    const playBtn = h('button', { class: 'btn ghost', type: 'button' }, '▶ Watch video');
    playBtn.addEventListener('click', async () => { playBtn.disabled = true; try { const v = await ensurePlayer(); playBtn.remove(); v.play().catch(() => {}); } catch (e) { playBtn.disabled = false; } });
    slot.append(playBtn);

    const actions = h('div', { class: 'row-actions' });
    if (teacher && s.status === 'submitted') {
      actions.append(h('button', { class: 'btn ghost', type: 'button', onclick: async (ev) => { ev.target.disabled = true; try { await db.update('submissions', 'id=eq.' + enc(s.id), { status: 'in_review' }); reload(); } catch (e) { toast(e.message, 'error'); ev.target.disabled = false; } } }, 'Mark in review'));
    }
    if (!teacher && s.status === 'submitted') {
      actions.append(h('button', { class: 'linkish', type: 'button', onclick: async () => {
        if (!confirm('Delete this video? You can upload a new one.')) return;
        try { await db.remove('submissions', 'id=eq.' + enc(s.id)); await deleteVideoFile(s.storage_path); reload(); } catch (e) { toast(e.message, 'error'); }
      } }, 'Delete this video'));
    }

    const fbList = fb.map((f) => h('div', { class: 'fb' },
      h('p', { class: 'mono ember' }, 'Feedback from Chris · ' + fmtWhen(f.created_at)),
      f.timestamp_seconds != null ? h('button', { class: 'linkish', type: 'button', onclick: async () => { const v = await ensurePlayer().catch(() => null); if (v) { playBtn.remove(); v.currentTime = f.timestamp_seconds; v.play().catch(() => {}); } } }, 'At ' + fmtClock(f.timestamp_seconds) + ' (jump to this moment)') : null,
      h('p', { class: 'pre' }, f.body),
      f.suggestions ? h('div', { class: 'sugg' }, h('p', { class: 'mono' }, 'To work on'), h('p', { class: 'pre' }, f.suggestions)) : null,
      teacher ? h('button', { class: 'linkish', type: 'button', onclick: async () => { if (!confirm('Delete this feedback?')) return; try { await db.remove('feedback', 'id=eq.' + enc(f.id)); reload(); } catch (e) { toast(e.message, 'error'); } } }, 'Delete feedback') : null));

    return h('div', { class: 'sub' },
      h('div', { class: 'sub-head' }, h('span', {}, h('strong', {}, s.original_name || 'Video'), h('span', { class: 'muted' }, ` · ${fmtWhen(s.submitted_at)} · ${fmtBytes(s.size_bytes)}`)), statusChip(s.status)),
      slot, actions, fbList,
      teacher ? feedbackForm(s) : null);
  }

  function feedbackForm(s) {
    const body = h('textarea', { rows: '3', maxlength: '4000', placeholder: 'What went well?' });
    const sugg = h('textarea', { rows: '2', maxlength: '4000', placeholder: 'What to improve (optional)' });
    const at = h('input', { type: 'text', inputmode: 'numeric', placeholder: 'm:ss', maxlength: '8', class: 'short' });
    const err = h('p', { class: 'form-err', role: 'alert' });
    const btn = h('button', { class: 'btn', type: 'submit' }, 'Send feedback');
    const f = h('form', { class: 'fbform', novalidate: true },
      h('p', { class: 'mono' }, 'Leave feedback'), body, sugg,
      field('Moment in the video (optional)', at, 'For example 1:25'), err, h('div', { class: 'row-actions' }, btn));
    f.addEventListener('submit', async (ev) => {
      ev.preventDefault(); err.textContent = '';
      if (!body.value.trim()) { err.textContent = 'Write a comment first.'; body.focus(); return; }
      const ts = parseClock(at.value);
      if (Number.isNaN(ts)) { err.textContent = 'Use a time like 1:25.'; at.focus(); return; }
      btn.disabled = true;
      try {
        await db.insert('feedback', { submission_id: s.id, author_id: ctx.profile.id, body: body.value.trim(), suggestions: sugg.value.trim() || null, timestamp_seconds: ts });
        toast('Feedback sent.'); reload();
      } catch (e) { err.textContent = e.message; btn.disabled = false; }
    });
    return f;
  }

  /* ----- student upload ----- */
  function uploader(exId) {
    const input = h('input', { type: 'file', accept: 'video/mp4,video/quicktime,video/webm,video/x-m4v,video/3gpp,.mp4,.mov,.m4v,.webm,.3gp', class: 'file' });
    const msg = h('p', { class: 'upl-msg', role: 'status', 'aria-live': 'polite' });
    const bar = h('progress', { max: '100', value: '0', class: 'bar', hidden: true, 'aria-label': 'Upload progress' });
    const cancel = h('button', { class: 'linkish', type: 'button', hidden: true }, 'Cancel upload');
    const label = h('label', { class: 'btn ghost upl-btn' }, exId ? 'Choose a video to upload' : 'Upload a video for this lesson', input);
    let job = null;

    input.addEventListener('change', async () => {
      const file = input.files && input.files[0];
      input.value = '';
      msg.className = 'upl-msg'; msg.textContent = '';
      if (!file) return;
      const e = (file.name.split('.').pop() || '').toLowerCase();
      const type = OK_TYPES.includes(file.type) ? file.type : OK_EXT[e];
      if (!type) { msg.className = 'upl-msg bad'; msg.textContent = 'That file type is not supported. Please choose an MP4 or MOV video.'; return; }
      if (file.size > MAX_VIDEO_MB * 1024 * 1024) {
        msg.className = 'upl-msg bad';
        msg.textContent = `That video is ${fmtBytes(file.size)}. The limit is ${MAX_VIDEO_MB} MB. Try a shorter clip, or lower the video quality in your camera settings.`;
        return;
      }
      const ex = OK_EXT[e] ? e : type === 'video/quicktime' ? 'mov' : 'mp4';
      const path = `${ctx.student.id}/${aid}/${crypto.randomUUID()}.${ex}`;
      const blob = file.type === type ? file : new File([file], file.name, { type });
      label.classList.add('is-busy'); input.disabled = true;
      bar.hidden = false; bar.value = 0; cancel.hidden = false;
      msg.textContent = 'Uploading… keep this page open.';
      job = uploadVideo(path, blob, (p) => { bar.value = Math.round(p * 100); msg.textContent = `Uploading… ${Math.round(p * 100)}%`; });
      cancel.onclick = () => job && job.cancel();
      try {
        await job.promise;
        try {
          await db.insert('submissions', { student_id: ctx.student.id, assignment_id: aid, exercise_id: exId, storage_path: path, original_name: file.name.slice(0, 120), mime_type: type, size_bytes: file.size });
        } catch (dbErr) { await deleteVideoFile(path); throw dbErr; }
        toast('Video uploaded. Chris will review it.'); reload();
      } catch (err) {
        msg.className = 'upl-msg ' + (err.cancelled ? '' : 'bad');
        msg.textContent = err.message;
        bar.hidden = true; cancel.hidden = true; label.classList.remove('is-busy'); input.disabled = false;
      }
    });
    return h('div', { class: 'upl' }, label, bar, cancel, msg,
      h('p', { class: 'fine' }, `MP4 or MOV, up to ${MAX_VIDEO_MB} MB. Short clips of the exercise work best.`));
  }

  const homework = exs.length ? h('section', { class: 'card', id: 'homework' },
    h('div', { class: 'row-between' },
      h('h2', { class: 'card-h' }, 'Homework' + (asg.homework_start || asg.homework_due ? ' · ' + fmtRange(asg.homework_start, asg.homework_due) : '')),
      h('span', { class: 'muted' }, `${doneCount} of ${exs.length} completed`)),
    (() => { const p = h('progress', { max: String(exs.length), value: String(doneCount), class: 'bar slim', 'aria-label': 'Exercises completed' }); return p; })(),
    h('div', { class: 'ex-list' }, exCards)) : null;

  const generalSubs = subsFor(null);
  const general = h('section', { class: 'card' }, h('h2', { class: 'card-h' }, 'Other videos for this lesson'),
    generalSubs.length ? generalSubs.map((s) => submissionCard(s)) : h('p', { class: 'muted' }, 'Nothing here yet.'),
    !teacher ? uploader(null) : null);

  /* ----- teacher tools ----- */
  let tools = null;
  if (teacher) {
    const note = notes[0];
    const box = h('textarea', { rows: '5', maxlength: '8000', placeholder: 'Private notes for this lesson. Students cannot see these.' }, note ? note.body : '');
    const save = h('button', { class: 'btn ghost', type: 'button' }, 'Save note');
    save.addEventListener('click', async () => {
      save.disabled = true;
      try {
        const text = box.value.trim();
        if (note && !text) await db.remove('teacher_notes', 'id=eq.' + enc(note.id));
        else if (note) await db.update('teacher_notes', 'id=eq.' + enc(note.id), { body: text });
        else if (text) await db.insert('teacher_notes', { student_id: sid, assignment_id: aid, body: text });
        toast('Note saved.'); reload();
      } catch (e) { toast(e.message, 'error'); save.disabled = false; }
    });
    const setStatus = (patch, okMsg) => async (ev) => { ev.target.disabled = true; try { await db.update('assignments', 'id=eq.' + enc(aid), patch); toast(okMsg); reload(); } catch (e) { toast(e.message, 'error'); ev.target.disabled = false; } };
    tools = h('section', { class: 'card teacher-tools' },
      h('h2', { class: 'card-h' }, 'Teacher tools'),
      h('div', { class: 'row-actions' },
        h('a', { class: 'btn', href: `#/s/${sid}/l/${aid}/edit` }, 'Edit lesson'),
        asg.status === 'published'
          ? h('button', { class: 'btn ghost', type: 'button', onclick: setStatus({ status: 'draft' }, 'Lesson hidden from the student.') }, 'Unpublish')
          : h('button', { class: 'btn', type: 'button', onclick: setStatus({ status: 'published', published_at: new Date().toISOString() }, 'Published. The student can see it now.') }, 'Publish to student'),
        asg.completed_at
          ? h('button', { class: 'btn ghost', type: 'button', onclick: setStatus({ completed_at: null }, 'Lesson reopened.') }, 'Reopen lesson')
          : h('button', { class: 'btn ghost', type: 'button', onclick: setStatus({ completed_at: new Date().toISOString() }, 'Marked complete.') }, 'Mark lesson complete')),
      h('div', {}, h('p', { class: 'mono' }, 'Private teacher notes'), box, h('div', { class: 'row-actions' }, save)));
  }

  const back = teacher ? h('a', { class: 'back', href: '#/s/' + sid }, '← ' + asg.students.full_name) : h('a', { class: 'back', href: '#/' }, '← My dashboard');
  const page = h('div', { class: 'page narrow' }, back, overview, content, agenda, homework, general, tools);
  if (focusExercise) setTimeout(() => { const el = document.getElementById('ex-' + focusExercise); if (el) el.scrollIntoView({ block: 'start' }); }, 80);
  return page;
}

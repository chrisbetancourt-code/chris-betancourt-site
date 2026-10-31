import * as api from './api.js';
import { ctx, isTeacher, go } from './ctx.js';
import { h, spinner, empty, isUuid } from './ui.js';
import { loginView, setPasswordView, unlinkedView, deniedView } from './auth-view.js';
import { teacherHome, studentProfile } from './teacher.js';
import { studentHome } from './student.js';
import { lessonPage } from './lesson.js';
import { lessonEditor } from './editor.js';

const root = document.getElementById('app');
const navRight = document.getElementById('navRight');

function mount(node) {
  root.replaceChildren(node);
  const f = root.querySelector('h1');
  if (f) { f.setAttribute('tabindex', '-1'); f.focus({ preventScroll: true }); }
  window.scrollTo(0, 0);
}
function drawNav() {
  navRight.replaceChildren();
  if (!ctx.profile) return;
  navRight.append(
    h('a', { class: 'navlink', href: '#/' }, 'Dashboard'),
    h('span', { class: 'who-name' }, ctx.profile.full_name || ctx.profile.email || ''),
    h('button', { class: 'btn ghost small', type: 'button', onclick: signOut }, 'Sign out'));
}

async function signOut() {
  await api.signOut();
  ctx.profile = null; ctx.student = null;
  drawNav(); showLogin();
}
function showLogin(message) { drawNav(); mount(loginView({ message, onDone: afterSignIn })); }

async function loadIdentity() {
  const s = api.getSession();
  const uid = s && s.user && s.user.id;
  if (!uid) throw new api.AuthError('Please sign in.');
  const [p] = await api.db.select('profiles', 'select=*&id=eq.' + api.enc(uid));
  if (!p) throw new Error('Your account is still being set up. Please try again in a moment.');
  ctx.profile = p;
  ctx.student = null;
  if (p.role !== 'teacher') {
    const [stu] = await api.db.select('students', 'select=*');
    ctx.student = stu || null;
  }
  drawNav();
}

async function afterSignIn() {
  try { await loadIdentity(); } catch (e) { return showLogin(e.message); }
  route();
}

/* ---------- routing ---------- */
function parse() {
  const [path, query = ''] = location.hash.replace(/^#\/?/, '').split('?');
  return { parts: path.split('/').filter(Boolean), q: new URLSearchParams(query) };
}

async function route() {
  if (!ctx.profile) return;
  const { parts, q } = parse();
  mount(spinner());
  try {
    let node = null;
    const teacher = isTeacher();
    if (!parts.length) {
      if (teacher) node = await teacherHome();
      else if (!ctx.student) node = unlinkedView({ onSignOut: signOut, email: ctx.profile.email });
      else node = await studentHome();
    } else if (parts[0] === 's' && isUuid(parts[1])) {
      const sid = parts[1];
      if (parts.length === 2) {
        if (!teacher) return go('#/');
        node = await studentProfile(sid);
      } else if (parts[2] === 'new' && parts.length === 3) {
        if (!teacher) return mount(deniedView({ onHome: () => go('#/') }));
        node = await lessonEditor(sid, null);
      } else if (parts[2] === 'l' && isUuid(parts[3]) && parts.length === 4) {
        node = await lessonPage(sid, parts[3], isUuid(q.get('ex')) ? q.get('ex') : null);
      } else if (parts[2] === 'l' && isUuid(parts[3]) && parts[4] === 'edit' && parts.length === 5) {
        if (!teacher) return mount(deniedView({ onHome: () => go('#/') }));
        node = await lessonEditor(sid, parts[3]);
      } else node = notFound();
    } else node = notFound();
    mount(node || notFound());
  } catch (e) {
    if (e instanceof api.AuthError) { ctx.profile = null; return showLogin(e.message); }
    mount(h('div', { class: 'page narrow' }, h('section', { class: 'card' },
      h('h1', { class: 'page-h' }, 'Something went wrong'), h('p', { class: 'muted' }, e.message || 'Please try again.'),
      h('div', { class: 'row-actions' }, h('button', { class: 'btn', type: 'button', onclick: () => go(location.hash) }, 'Try again')))));
  }
}

function notFound() {
  return h('div', { class: 'page narrow' }, h('section', { class: 'card' },
    h('h1', { class: 'page-h' }, 'Page not found'),
    h('p', { class: 'muted' }, 'This page does not exist, or it is not available to your account.'),
    h('div', { class: 'row-actions' }, h('a', { class: 'btn', href: '#/' }, 'Go to my dashboard'))));
}

window.addEventListener('hashchange', route);

/* ---------- start ---------- */
(async function boot() {
  mount(spinner());
  const fromLink = await api.adoptHashSession();
  if (!api.getSession()) return showLogin(fromLink && fromLink.error);
  try { await loadIdentity(); }
  catch (e) { return showLogin(e instanceof api.AuthError ? e.message : e.message); }
  if (fromLink && (fromLink.type === 'invite' || fromLink.type === 'recovery' || fromLink.type === 'signup')) {
    drawNav();
    return mount(setPasswordView({
      title: fromLink.type === 'recovery' ? 'Choose a new password' : 'Welcome. Create your password',
      onDone: async () => { go('#/'); },
    }));
  }
  route();
})();

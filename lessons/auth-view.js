import * as api from './api.js';
import { h, field, spinner } from './ui.js';

const MIN_PW = 8;

export function loginView({ message, onDone }) {
  const email = h('input', { type: 'email', autocomplete: 'username', inputmode: 'email', required: true });
  const pw = h('input', { type: 'password', autocomplete: 'current-password', required: true });
  const err = h('p', { class: 'form-err', role: 'alert' }, message || '');
  const ok = h('p', { class: 'form-ok', role: 'status' });
  const btn = h('button', { class: 'btn', type: 'submit' }, 'Sign in');
  const forgot = h('button', { class: 'linkish', type: 'button' }, 'Forgot your password?');

  const form = h('form', { class: 'auth-card', novalidate: true },
    h('p', { class: 'mono ember' }, 'Guitar Lessons'),
    h('h1', { class: 'auth-h' }, 'Sign in'),
    h('p', { class: 'muted' }, 'Lessons, homework and video feedback. Accounts are by invitation from Chris.'),
    field('Email', email), field('Password', pw),
    err, ok,
    h('div', { class: 'row-actions' }, btn, forgot),
    h('p', { class: 'fine' }, 'Not a student yet? ', h('a', { href: '/#book' }, 'Ask Chris about lessons'), '.'));

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    err.textContent = ''; ok.textContent = '';
    if (!email.value.trim() || !pw.value) { err.textContent = 'Enter your email and password.'; (email.value.trim() ? pw : email).focus(); return; }
    btn.disabled = true; btn.textContent = 'Signing in…';
    try { await api.signIn(email.value.trim(), pw.value); await onDone(); }
    catch (e2) { err.textContent = e2.message; btn.disabled = false; btn.textContent = 'Sign in'; }
  });

  forgot.addEventListener('click', async () => {
    err.textContent = ''; ok.textContent = '';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.value.trim())) { err.textContent = 'Type your email above first, then press "Forgot your password?".'; email.focus(); return; }
    forgot.disabled = true;
    try { await api.sendRecovery(email.value.trim()); ok.textContent = 'If that email has an account, a reset link is on its way.'; }
    catch (e2) { err.textContent = e2.message; }
    forgot.disabled = false;
  });
  return form;
}

export function setPasswordView({ title, onDone }) {
  const p1 = h('input', { type: 'password', autocomplete: 'new-password', required: true, minlength: String(MIN_PW) });
  const p2 = h('input', { type: 'password', autocomplete: 'new-password', required: true });
  const err = h('p', { class: 'form-err', role: 'alert' });
  const btn = h('button', { class: 'btn', type: 'submit' }, 'Save password');
  const form = h('form', { class: 'auth-card', novalidate: true },
    h('p', { class: 'mono ember' }, 'Guitar Lessons'),
    h('h1', { class: 'auth-h' }, title),
    h('p', { class: 'muted' }, 'Choose a password with at least ' + MIN_PW + ' characters.'),
    field('New password', p1), field('Confirm password', p2), err,
    h('div', { class: 'row-actions' }, btn));
  form.addEventListener('submit', async (e) => {
    e.preventDefault(); err.textContent = '';
    if (p1.value.length < MIN_PW) { err.textContent = 'Use at least ' + MIN_PW + ' characters.'; p1.focus(); return; }
    if (p1.value !== p2.value) { err.textContent = 'The two passwords do not match.'; p2.focus(); return; }
    btn.disabled = true; btn.textContent = 'Saving…';
    try { await api.setPassword(p1.value); await onDone(); }
    catch (e2) { err.textContent = e2.message; btn.disabled = false; btn.textContent = 'Save password'; }
  });
  return form;
}

export function unlinkedView({ onSignOut, email }) {
  return h('div', { class: 'auth-card' },
    h('p', { class: 'mono ember' }, 'Almost there'),
    h('h1', { class: 'auth-h' }, 'Your account is not set up yet'),
    h('p', { class: 'muted' }, (email ? email + ' is signed in, but ' : 'You are signed in, but ') + 'it is not connected to a student profile. Please message Chris and he will fix it.'),
    h('div', { class: 'row-actions' }, h('button', { class: 'btn ghost', type: 'button', onclick: onSignOut }, 'Sign out')));
}

export function deniedView({ onHome }) {
  return h('div', { class: 'auth-card' },
    h('p', { class: 'mono ember' }, 'Private'),
    h('h1', { class: 'auth-h' }, 'You do not have access to this page'),
    h('p', { class: 'muted' }, 'This area is private. If you think this is a mistake, message Chris.'),
    h('div', { class: 'row-actions' }, h('button', { class: 'btn', type: 'button', onclick: onHome }, 'Back to my dashboard')));
}

export { spinner };

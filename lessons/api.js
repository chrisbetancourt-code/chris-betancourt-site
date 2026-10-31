// Tiny Supabase client (auth, database, storage) using plain fetch. No dependencies.
import { SUPABASE_URL, SUPABASE_KEY } from './config.js';

const SESSION_KEY = 'cb_lessons_session';
const BUCKET = 'submissions';
let session = null;
try { session = JSON.parse(localStorage.getItem(SESSION_KEY)); } catch (e) { session = null; }

export class AuthError extends Error {}

function save(s) {
  session = s;
  try { s ? localStorage.setItem(SESSION_KEY, JSON.stringify(s)) : localStorage.removeItem(SESSION_KEY); } catch (e) {}
}
export const getSession = () => session;
const now = () => Math.floor(Date.now() / 1000);

function friendly(j, status) {
  const m = (j && (j.msg || j.message || j.error_description || j.error)) || '';
  if (/invalid login/i.test(m)) return 'That email and password do not match.';
  if (/email not confirmed/i.test(m)) return 'Please use the invitation link in your email first.';
  if (/rate limit|too many/i.test(m) || status === 429) return 'Too many attempts. Please wait a minute and try again.';
  return m || 'Something went wrong. Please try again.';
}

async function authCall(path, { method = 'POST', body, bearer } = {}) {
  const headers = { apikey: SUPABASE_KEY, 'Content-Type': 'application/json' };
  if (bearer) headers.Authorization = 'Bearer ' + bearer;
  let res;
  try { res = await fetch(SUPABASE_URL + '/auth/v1' + path, { method, headers, body: body ? JSON.stringify(body) : undefined }); }
  catch (e) { throw new Error('Could not reach the server. Check your connection and try again.'); }
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(friendly(j, res.status));
  return j;
}

function fromToken(j) {
  return { access_token: j.access_token, refresh_token: j.refresh_token, expires_at: now() + (j.expires_in || 3600), user: j.user || null };
}

export async function signIn(email, password) {
  const j = await authCall('/token?grant_type=password', { body: { email, password } });
  save(fromToken(j));
  return session;
}

async function refresh() {
  if (!session || !session.refresh_token) throw new AuthError('Please sign in again.');
  try {
    const j = await authCall('/token?grant_type=refresh_token', { body: { refresh_token: session.refresh_token } });
    save(fromToken(j));
  } catch (e) { save(null); throw new AuthError('Your session ended. Please sign in again.'); }
}

export async function signOut() {
  const t = session && session.access_token;
  save(null);
  if (t) { try { await authCall('/logout', { bearer: t }); } catch (e) {} }
}

export async function sendRecovery(email) {
  const redirect = encodeURIComponent(location.origin + '/lessons/');
  await authCall('/recover?redirect_to=' + redirect, { body: { email } });
}

export async function setPassword(password) {
  const t = await token();
  await authCall('/user', { method: 'PUT', bearer: t, body: { password } });
}

/* Invite and recovery emails land back here with tokens in the URL fragment. */
export async function adoptHashSession() {
  const raw = location.hash.startsWith('#') ? location.hash.slice(1) : '';
  if (!raw || (!raw.includes('access_token=') && !raw.includes('error='))) return null;
  const p = new URLSearchParams(raw);
  history.replaceState(null, '', location.pathname + location.search);
  if (p.get('error')) return { error: p.get('error_description') || 'That link has expired. Ask for a new one.' };
  const at = p.get('access_token');
  try {
    const user = await authCall('/user', { method: 'GET', bearer: at });
    save({ access_token: at, refresh_token: p.get('refresh_token'), expires_at: now() + (+p.get('expires_in') || 3600), user });
    return { type: p.get('type') || 'signin' };
  } catch (e) { return { error: 'That link has expired. Ask for a new one.' }; }
}

export async function token() {
  if (!session) throw new AuthError('Please sign in.');
  if (session.expires_at - now() < 60) await refresh();
  return session.access_token;
}

/* ---------- database (PostgREST) ---------- */
async function rest(path, { method = 'GET', body, prefer, retry = true } = {}) {
  const t = await token();
  const headers = { apikey: SUPABASE_KEY, Authorization: 'Bearer ' + t };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (prefer) headers.Prefer = prefer;
  let res;
  try { res = await fetch(SUPABASE_URL + '/rest/v1/' + path, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined }); }
  catch (e) { throw new Error('Could not reach the server. Check your connection and try again.'); }
  if (res.status === 401 && retry) { await refresh(); return rest(path, { method, body, prefer, retry: false }); }
  if (res.status === 401) { save(null); throw new AuthError('Your session ended. Please sign in again.'); }
  const text = await res.text();
  let j = null; try { j = text ? JSON.parse(text) : null; } catch (e) {}
  if (!res.ok) {
    const m = (j && j.message) || '';
    if (res.status === 403 || /row-level security|permission denied/i.test(m)) throw new Error('You do not have permission to do that.');
    throw new Error(m || 'Something went wrong. Please try again.');
  }
  return j;
}

export const enc = encodeURIComponent;
export const db = {
  select: (table, query = '') => rest(table + (query ? '?' + query : '')),
  insert: (table, rows) => rest(table, { method: 'POST', body: rows, prefer: 'return=representation' }),
  update: (table, filter, patch) => rest(table + '?' + filter, { method: 'PATCH', body: patch, prefer: 'return=representation' }),
  upsert: (table, rows, onConflict) => rest(table + '?on_conflict=' + onConflict, { method: 'POST', body: rows, prefer: 'resolution=merge-duplicates,return=representation' }),
  remove: (table, filter) => rest(table + '?' + filter, { method: 'DELETE', prefer: 'return=representation' }),
};

/* ---------- private video storage ---------- */
const storagePath = (p) => p.split('/').map(enc).join('/');

/* Upload with progress. Returns { promise, cancel }. Uses the signed-in user's own
   token, so the storage rules (their own folder only) decide whether it is allowed. */
export function uploadVideo(path, file, onProgress) {
  const xhr = new XMLHttpRequest();
  const promise = (async () => {
    const t = await token();
    return new Promise((resolve, reject) => {
      xhr.open('POST', SUPABASE_URL + '/storage/v1/object/' + BUCKET + '/' + storagePath(path));
      xhr.setRequestHeader('apikey', SUPABASE_KEY);
      xhr.setRequestHeader('Authorization', 'Bearer ' + t);
      xhr.setRequestHeader('x-upsert', 'false');
      xhr.upload.onprogress = (e) => { if (e.lengthComputable && onProgress) onProgress(e.loaded / e.total); };
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) return resolve();
        let m = ''; try { m = JSON.parse(xhr.responseText).message; } catch (e) {}
        reject(new Error(/exceeded|too large|maximum/i.test(m || '') ? 'That video is larger than the allowed size.' :
          /mime|not supported/i.test(m || '') ? 'That file type is not supported. Please upload an MP4 or MOV video.' :
          'The upload did not finish. Please try again.'));
      };
      xhr.onerror = () => reject(new Error('The upload was interrupted. Check your connection and try again.'));
      xhr.onabort = () => { const e = new Error('Upload cancelled.'); e.cancelled = true; reject(e); };
      const body = new FormData();
      body.append('cacheControl', '3600');
      body.append('', file);
      xhr.send(body);
    });
  })();
  return { promise, cancel: () => xhr.abort() };
}

/* A short-lived link, created only when someone presses play. */
export async function signedVideoUrl(path, seconds = 300) {
  const t = await token();
  const res = await fetch(SUPABASE_URL + '/storage/v1/object/sign/' + BUCKET + '/' + storagePath(path), {
    method: 'POST',
    headers: { apikey: SUPABASE_KEY, Authorization: 'Bearer ' + t, 'Content-Type': 'application/json' },
    body: JSON.stringify({ expiresIn: seconds }),
  });
  if (!res.ok) throw new Error('You do not have access to that video.');
  const j = await res.json();
  return encodeURI(SUPABASE_URL + '/storage/v1' + j.signedURL);
}

export async function deleteVideoFile(path) {
  const t = await token();
  await fetch(SUPABASE_URL + '/storage/v1/object/' + BUCKET, {
    method: 'DELETE',
    headers: { apikey: SUPABASE_KEY, Authorization: 'Bearer ' + t, 'Content-Type': 'application/json' },
    body: JSON.stringify({ prefixes: [path] }),
  }).catch(() => {});
}

/* Ask our own server function (which holds the secret key) to invite a student. */
export async function inviteStudent(studentId) {
  const t = await token();
  const res = await fetch('/api/invite', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + t, 'Content-Type': 'application/json' },
    body: JSON.stringify({ studentId }),
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j.error || 'The invitation could not be sent.');
  return j;
}

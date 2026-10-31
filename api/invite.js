// Vercel serverless function: invite a student by email.
// This is the ONLY place the Supabase secret ("service role") key is used. It lives in a
// Vercel environment variable, never in the website's files and never in the browser.
//
// Required env vars (Vercel -> Project -> Settings -> Environment Variables):
//   SUPABASE_SERVICE_ROLE_KEY   the secret key from Supabase (Project Settings -> API)
// Optional:
//   SUPABASE_URL, SUPABASE_ANON_KEY, SITE_URL   (defaults below match this site)

const DEFAULT_URL = 'https://ltjegtsprbvbkmxczftg.supabase.co';
const DEFAULT_ANON = 'sb_publishable_--jiJvESX7bEZoqT_JfMLg_ZtYdAqTh';
const DEFAULT_SITE = 'https://chrisbetancourt.vercel.app';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const send = (code, body) => res.status(code).json(body);
  if (req.method !== 'POST') return send(405, { error: 'Method not allowed.' });

  const url = (process.env.SUPABASE_URL || DEFAULT_URL).replace(/\/$/, '');
  const anon = process.env.SUPABASE_ANON_KEY || DEFAULT_ANON;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const site = (process.env.SITE_URL || DEFAULT_SITE).replace(/\/$/, '');
  if (!service) return send(500, { error: 'Invitations are not switched on yet. The server secret key has not been added in Vercel.' });

  const bearer = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!bearer) return send(401, { error: 'Please sign in.' });

  const body = typeof req.body === 'string' ? safeJson(req.body) : req.body || {};
  const studentId = body && body.studentId;
  if (!UUID.test(String(studentId || ''))) return send(400, { error: 'Missing student.' });

  const j = async (r) => { try { return await r.json(); } catch (e) { return {}; } };
  // New-style secret keys ("sb_secret_...") go in the apikey header only; the older JWT-style
  // service_role key is sent both ways. Either kind works if you paste it into Vercel.
  const asService = { apikey: service, 'Content-Type': 'application/json' };
  if (!service.startsWith('sb_')) asService.Authorization = 'Bearer ' + service;

  try {
    // 1. Who is calling? Ask Supabase to verify their token.
    const who = await fetch(url + '/auth/v1/user', { headers: { apikey: anon, Authorization: 'Bearer ' + bearer } });
    if (!who.ok) return send(401, { error: 'Your session ended. Please sign in again.' });
    const user = await who.json();

    // 2. Are they a teacher? Read their own profile with THEIR token (database rules apply).
    const pr = await fetch(url + '/rest/v1/profiles?select=role&id=eq.' + encodeURIComponent(user.id), { headers: { apikey: anon, Authorization: 'Bearer ' + bearer } });
    const rows = pr.ok ? await pr.json() : [];
    if (!rows[0] || rows[0].role !== 'teacher') return send(403, { error: 'Only the teacher can send invitations.' });

    // 3. Load the student (service key, because we have verified the caller above).
    const sr = await fetch(url + '/rest/v1/students?select=id,full_name,email,user_id&id=eq.' + studentId, { headers: asService });
    const student = (await j(sr))[0];
    if (!student) return send(404, { error: 'Student not found.' });
    if (!student.email) return send(400, { error: 'Add an email address for this student first.' });

    const redirect = encodeURIComponent(site + '/lessons/');
    const recover = async () => {
      const r = await fetch(url + '/auth/v1/recover?redirect_to=' + redirect, { method: 'POST', headers: { apikey: anon, 'Content-Type': 'application/json' }, body: JSON.stringify({ email: student.email }) });
      if (!r.ok) throw new Error((await j(r)).msg || 'Could not send the email.');
    };
    const link = async (uid) => {
      const r = await fetch(url + '/rest/v1/students?id=eq.' + studentId + '&user_id=is.null', { method: 'PATCH', headers: { ...asService, Prefer: 'return=minimal' }, body: JSON.stringify({ user_id: uid }) });
      if (!r.ok) throw new Error('Could not link the account.');
    };

    // Already linked: just send a fresh sign-in (password reset) link.
    if (student.user_id) { await recover(); return send(200, { ok: true, message: 'Sent a fresh sign-in link to ' + student.email + '.' }); }

    // 4. Create the account by invitation.
    const inv = await fetch(url + '/auth/v1/invite?redirect_to=' + redirect, { method: 'POST', headers: asService, body: JSON.stringify({ email: student.email, data: { full_name: student.full_name } }) });
    const created = await j(inv);
    if (inv.ok && created.id) { await link(created.id); return send(200, { ok: true, message: 'Invitation sent to ' + student.email + '.' }); }

    // That email already has a login (for example from an earlier attempt): connect it and send a link.
    if (inv.status === 422 || /already/i.test(String(created.msg || created.message || ''))) {
      const list = await fetch(url + '/auth/v1/admin/users?per_page=1000', { headers: asService });
      const users = ((await j(list)).users) || [];
      const found = users.find((u) => String(u.email || '').toLowerCase() === student.email.toLowerCase());
      if (found) { await link(found.id); await recover(); return send(200, { ok: true, message: 'That email already had an account. It is now connected, and a sign-in link was sent.' }); }
    }
    return send(502, { error: 'The invitation could not be sent. ' + (created.msg || created.message || '') });
  } catch (e) {
    return send(502, { error: 'The invitation could not be sent. Please try again.' });
  }
};

function safeJson(s) { try { return JSON.parse(s); } catch (e) { return {}; } }

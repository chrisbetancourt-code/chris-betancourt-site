// LOCAL TEST DOUBLE for Supabase's auth + storage services (PostgREST and Postgres are the real thing).
// Not used in production. Listens on :54331 and also serves the site + /api/invite on :54332.
const http = require('http'), crypto = require('crypto'), fs = require('fs'), path = require('path'), { execFileSync } = require('child_process');
const SECRET = 'test-jwt-secret-test-jwt-secret-1234567890';
const SERVICE = 'sb_secret_test_service_key';
const PG = ['-h', '/tmp', '-p', '54329', '-U', 'postgres', '-d', process.env.E2E_DB || 'portal_e2e', '-v', 'ON_ERROR_STOP=1', '-qAt'];
const REPO = path.resolve(__dirname, '../../..');
const UUID = /^[0-9a-f-]{36}$/i;
const b64 = (b) => Buffer.from(b).toString('base64url');
const jwt = (claims) => { const h = b64(JSON.stringify({ alg: 'HS256', typ: 'JWT' })), p = b64(JSON.stringify(claims)); return h + '.' + p + '.' + crypto.createHmac('sha256', SECRET).update(h + '.' + p).digest('base64url'); };
function verify(t) { try { const [h, p, s] = t.split('.'); if (crypto.createHmac('sha256', SECRET).update(h + '.' + p).digest('base64url') !== s) return null; const c = JSON.parse(Buffer.from(p, 'base64url')); return c.exp > Date.now() / 1000 ? c : null; } catch (e) { return null; } }
const psql = (sql) => execFileSync('psql', [...PG, '-c', sql], { encoding: 'utf8' }).trim();
const asUser = (uid, sql) => psql(`select set_config('request.jwt.claim.sub','${uid}',true); set local role authenticated; ${sql}`);
const users = {}; // email -> {id, password}
const files = {}; // path -> Buffer
const log = [];

function loadUsers() { psql("select id||'|'||coalesce(email,'') from auth.users").split('\n').filter(Boolean).forEach((r) => { const [id, email] = r.split('|'); users[email] = users[email] || { id, password: 'password123' }; users[email].id = id; }); }
function tokenFor(u, email) { const exp = Math.floor(Date.now() / 1000) + 3600; return { access_token: jwt({ sub: u.id, role: 'authenticated', email, exp }), refresh_token: 'r-' + u.id, expires_in: 3600, token_type: 'bearer', user: { id: u.id, email } }; }
const body = (req) => new Promise((r) => { const c = []; req.on('data', (d) => c.push(d)); req.on('end', () => r(Buffer.concat(c))); });
const send = (res, code, obj, headers) => { res.writeHead(code, { 'Content-Type': 'application/json', ...(headers || {}) }); res.end(obj == null ? '' : JSON.stringify(obj)); };
const bearerOf = (req) => String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
const isService = (req) => bearerOf(req) === SERVICE || req.headers.apikey === SERVICE;

function parseMultipartFile(buf, ctype) {
  const b = '--' + /boundary=(.+)$/.exec(ctype)[1];
  for (const part of buf.toString('binary').split(b)) {
    if (!/filename=/.test(part)) continue;
    const i = part.indexOf('\r\n\r\n'); const data = part.slice(i + 4, part.lastIndexOf('\r\n'));
    return Buffer.from(data, 'binary');
  }
  return null;
}

const fake = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x'); const p = url.pathname; const raw = await body(req);
  const j = () => { try { return JSON.parse(raw.toString() || '{}'); } catch (e) { return {}; } };
  log.push(req.method + ' ' + p);
  try {
    if (p === '/__users') { loadUsers(); return send(res, 200, users); }
    if (p === '/__log') return send(res, 200, log);
    if (p === '/auth/v1/token') {
      loadUsers();
      if (url.searchParams.get('grant_type') === 'password') {
        const { email, password } = j(); const u = users[email];
        if (!u || u.password !== password) return send(res, 400, { error: 'invalid_grant', error_description: 'Invalid login credentials' });
        return send(res, 200, tokenFor(u, email));
      }
      const id = (j().refresh_token || '').replace('r-', ''); const email = Object.keys(users).find((e) => users[e].id === id);
      return email ? send(res, 200, tokenFor(users[email], email)) : send(res, 400, { error: 'invalid_grant', error_description: 'bad refresh' });
    }
    if (p === '/auth/v1/user') {
      const c = verify(bearerOf(req)); if (!c) return send(res, 401, { msg: 'invalid JWT' });
      if (req.method === 'PUT') { const pw = j().password; Object.values(users).forEach((u) => { if (u.id === c.sub) u.password = pw; }); }
      return send(res, 200, { id: c.sub, email: c.email });
    }
    if (p === '/auth/v1/logout') return send(res, 204, null);
    if (p === '/auth/v1/recover') return send(res, 200, {});
    if (p === '/auth/v1/invite') {
      if (!isService(req)) return send(res, 401, { msg: 'not allowed' });
      const { email } = j(); loadUsers();
      if (users[email]) return send(res, 422, { msg: 'A user with this email address has already been registered' });
      const id = crypto.randomUUID(); psql(`insert into auth.users (id, email) values ('${id}', '${email.replace(/'/g, '')}')`); loadUsers();
      return send(res, 200, { id, email });
    }
    if (p === '/auth/v1/admin/users') { if (!isService(req)) return send(res, 401, {}); loadUsers(); return send(res, 200, { users: Object.entries(users).map(([email, u]) => ({ id: u.id, email })) }); }

    if (p.startsWith('/rest/v1/')) {
      let tok = bearerOf(req);
      if (isService(req)) tok = jwt({ role: 'service_role', exp: Math.floor(Date.now() / 1000) + 600 });
      const headers = { ...req.headers, host: '127.0.0.1:54330' }; delete headers['content-length'];
      if (tok) headers.authorization = 'Bearer ' + tok; else delete headers.authorization;
      const pr = http.request({ host: '127.0.0.1', port: 54330, path: p.replace('/rest/v1', '') + url.search, method: req.method, headers: { ...headers, 'content-length': raw.length } }, (r) => { res.writeHead(r.statusCode, r.headers); r.pipe(res); });
      pr.on('error', () => send(res, 502, { message: 'postgrest down' })); pr.end(raw); return;
    }

    if (p.startsWith('/storage/v1/')) {
      const c = verify(bearerOf(req)); if (!c) return send(res, 401, { message: 'Invalid JWT' });
      let rest = decodeURIComponent(p.replace('/storage/v1/', ''));
      if (req.method === 'POST' && rest.startsWith('object/sign/submissions/')) {
        const name = rest.slice('object/sign/submissions/'.length);
        if (!/^[0-9a-f-]{36}\/[0-9a-f-]{36}\/[\w.-]+$/i.test(name)) return send(res, 400, { message: 'bad path' });
        const n = asUser(c.sub, `select count(*) from storage.objects where bucket_id='submissions' and name='${name}'`).split('\n').pop();
        if (n !== '1') return send(res, 400, { message: 'Object not found' });
        return send(res, 200, { signedURL: '/object/sign/submissions/' + name + '?token=t' });
      }
      if (req.method === 'POST' && rest.startsWith('object/submissions/')) {
        const name = rest.slice('object/submissions/'.length);
        if (!/^[0-9a-f-]{36}\/[0-9a-f-]{36}\/[\w.-]+$/i.test(name)) return send(res, 400, { message: 'bad path' });
        const data = parseMultipartFile(raw, req.headers['content-type'] || '');
        if (!data) return send(res, 400, { message: 'no file' });
        if (data.length > 52428800) return send(res, 413, { message: 'The object exceeded the maximum allowed size' });
        try { asUser(c.sub, `insert into storage.objects (bucket_id, name, owner) values ('submissions','${name}','${c.sub}')`); }
        catch (e) { return send(res, 403, { message: 'new row violates row-level security policy' }); }
        files[name] = data; return send(res, 200, { Key: 'submissions/' + name });
      }
      if (req.method === 'DELETE' && rest === 'object/submissions') {
        for (const name of j().prefixes || []) { if (/^[0-9a-f-]{36}\/[0-9a-f-]{36}\/[\w.-]+$/i.test(name)) { try { asUser(c.sub, `delete from storage.objects where bucket_id='submissions' and name='${name}'`); delete files[name]; } catch (e) {} } }
        return send(res, 200, []);
      }
    }
    if (p.startsWith('/object/sign/submissions/')) { const name = decodeURIComponent(p.replace('/object/sign/submissions/', '')); const f = files[name]; if (!f) return send(res, 404, {}); res.writeHead(200, { 'Content-Type': 'video/mp4', 'Content-Length': f.length }); return res.end(f); }
    send(res, 404, { message: 'not found: ' + p });
  } catch (e) { send(res, 500, { message: String(e.message).slice(0, 300) }); }
});
fake.listen(54331, '127.0.0.1');

/* static site + the real /api/invite handler */
process.env.SUPABASE_URL = 'http://127.0.0.1:54331'; process.env.SUPABASE_SERVICE_ROLE_KEY = SERVICE; process.env.SUPABASE_ANON_KEY = 'anon-test';
const invite = require(path.join(REPO, 'api/invite.js'));
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.jpg': 'image/jpeg', '.mp4': 'video/mp4', '.png': 'image/png' };
http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname === '/api/invite') {
    const raw = await body(req); let parsed = {}; try { parsed = JSON.parse(raw.toString()); } catch (e) {}
    const r = { setHeader() {}, status(c) { this.c = c; return this; }, json(o) { res.writeHead(this.c || 200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(o)); } };
    return invite({ method: req.method, headers: req.headers, body: parsed }, r);
  }
  let f = path.join(REPO, decodeURIComponent(url.pathname)); if (!f.startsWith(REPO)) { res.writeHead(403); return res.end(); }
  if (fs.existsSync(f) && fs.statSync(f).isDirectory()) f = path.join(f, 'index.html');
  if (!fs.existsSync(f)) { res.writeHead(404); return res.end('nf'); }
  res.writeHead(200, { 'Content-Type': mime[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res);
}).listen(54332, '127.0.0.1');
console.log('fake supabase :54331, site :54332');

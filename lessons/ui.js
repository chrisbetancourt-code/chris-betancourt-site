// Small UI helpers. Everything is built with createElement/textContent (never innerHTML),
// so text typed by students or the teacher can never run as code.

export function h(tag, props, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'text') el.textContent = v;
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, v);
  }
  append(el, kids);
  return el;
}
export function append(el, kids) {
  for (const k of kids.flat(Infinity)) {
    if (k == null || k === false) continue;
    el.append(k.nodeType ? k : document.createTextNode(String(k)));
  }
  return el;
}
export const clear = (el) => { while (el.firstChild) el.removeChild(el.firstChild); return el; };

/* ---------- formatting ---------- */
const parseDay = (s) => { const [y, m, d] = String(s).slice(0, 10).split('-').map(Number); return new Date(y, m - 1, d); };
export function fmtDay(s, opts) {
  if (!s) return '';
  return parseDay(s).toLocaleDateString('en-US', opts || { month: 'short', day: 'numeric', year: 'numeric' });
}
export function fmtRange(a, b) {
  if (a && b) return fmtDay(a, { month: 'short', day: 'numeric' }) + ' to ' + fmtDay(b, { month: 'short', day: 'numeric' });
  return a ? 'From ' + fmtDay(a) : b ? 'Due ' + fmtDay(b) : '';
}
export function fmtWhen(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
export function fmtBytes(n) {
  if (n < 1024 * 1024) return Math.max(1, Math.round(n / 1024)) + ' KB';
  return (n / 1024 / 1024).toFixed(n > 100 * 1024 * 1024 ? 0 : 1) + ' MB';
}
export const fmtClock = (s) => Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
export function parseClock(v) {
  v = String(v || '').trim();
  if (!v) return null;
  const m = v.match(/^(\d+):([0-5]?\d)$/) || v.match(/^(\d+)$/);
  if (!m) return NaN;
  return m[2] !== undefined ? (+m[1]) * 60 + (+m[2]) : +m[1];
}
export const initials = (n) => String(n || '?').trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
export const isUuid = (s) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(s));

export const STATUS_LABEL = { submitted: 'Submitted', in_review: 'In review', feedback_provided: 'Feedback ready' };
export const chip = (text, tone) => h('span', { class: 'chip-s' + (tone ? ' ' + tone : '') }, text);
export const statusChip = (s) => chip(STATUS_LABEL[s] || s, s === 'feedback_provided' ? 'good' : s === 'in_review' ? 'warm' : '');

/* ---------- links ---------- */
export function safeUrl(u) {
  try {
    const x = new URL(String(u).trim());
    return x.protocol === 'https:' || x.protocol === 'http:' ? x.href : null;
  } catch (e) { return null; }
}
export function youtubeId(u) {
  const s = safeUrl(u); if (!s) return null;
  const x = new URL(s);
  const host = x.hostname.replace(/^www\./, '');
  let id = null;
  if (host === 'youtu.be') id = x.pathname.slice(1);
  else if (host === 'youtube.com' || host === 'm.youtube.com') {
    id = x.searchParams.get('v') || (x.pathname.match(/^\/(?:embed|shorts|live)\/([^/]+)/) || [])[1];
  }
  return id && /^[\w-]{11}$/.test(id) ? id : null;
}
export const ext = (url, label) => {
  const s = safeUrl(url);
  return s ? h('a', { href: s, target: '_blank', rel: 'noopener noreferrer', class: 'ext' }, label || s) : null;
};

/* ---------- lesson content ---------- */
export function renderBlocks(blocks) {
  const out = h('div', { class: 'blocks' });
  for (const b of Array.isArray(blocks) ? blocks : []) {
    const el = renderBlock(b);
    if (el) out.append(el);
  }
  return out;
}
function renderBlock(b) {
  if (!b || typeof b !== 'object') return null;
  switch (b.type) {
    case 'heading': return h('h3', { class: 'blk-h' }, String(b.text || ''));
    case 'paragraph': return h('p', { class: 'blk-p' }, String(b.text || ''));
    case 'bullets': return h('ul', { class: 'blk-list' }, (b.items || []).map((i) => h('li', {}, String(i))));
    case 'numbered': return h('ol', { class: 'blk-list' }, (b.items || []).map((i) => h('li', {}, String(i))));
    case 'chords':
    case 'tab':
      return h('figure', { class: 'tabfig' },
        b.caption ? h('figcaption', { class: 'mono' }, String(b.caption)) : null,
        h('pre', { class: 'tab', tabindex: '0', 'aria-label': b.type === 'tab' ? 'Guitar tablature' : 'Chord chart' }, String(b.text || '')));
    case 'video': {
      const id = youtubeId(b.url);
      const cap = b.caption ? h('figcaption', {}, String(b.caption)) : null;
      if (id) {
        return h('figure', { class: 'embed' },
          h('div', { class: 'embed-box' }, h('iframe', { src: 'https://www.youtube-nocookie.com/embed/' + id, title: b.caption || 'Reference video', loading: 'lazy', allowfullscreen: true, referrerpolicy: 'strict-origin-when-cross-origin' })),
          cap, h('p', { class: 'fine' }, ext(b.url, 'Open on YouTube')));
      }
      const a = ext(b.url, b.caption || b.url);
      return a ? h('p', { class: 'blk-p' }, a) : null;
    }
    case 'image': {
      const s = safeUrl(b.url);
      return s ? h('figure', { class: 'imgfig' }, h('img', { src: s, alt: String(b.alt || ''), loading: 'lazy' })) : null;
    }
    case 'link': {
      const a = ext(b.url, b.label || b.url);
      return a ? h('p', { class: 'blk-p' }, a) : null;
    }
    default: return null;
  }
}

/* ---------- feedback to the person using the page ---------- */
export function toast(msg, kind) {
  const box = document.getElementById('toasts');
  const t = h('div', { class: 'toast ' + (kind || '') }, msg);
  box.append(t);
  setTimeout(() => t.remove(), kind === 'error' ? 7000 : 3500);
}

export function modal({ title, body, confirmText = 'Save', onConfirm, cancelText = 'Cancel' }) {
  return new Promise((resolve) => {
    const prev = document.activeElement;
    const errBox = h('p', { class: 'form-err', role: 'alert' });
    const confirmBtn = h('button', { class: 'btn', type: 'submit' }, confirmText);
    const form = h('form', { class: 'modal-card', novalidate: true, role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
      h('h2', { class: 'modal-h' }, title), body, errBox,
      h('div', { class: 'row-actions' },
        confirmBtn,
        h('button', { class: 'btn ghost', type: 'button', onclick: () => close(false) }, cancelText)));
    const overlay = h('div', { class: 'overlay' }, form);
    const close = (ok) => { overlay.remove(); document.removeEventListener('keydown', esc); if (prev && prev.focus) prev.focus(); resolve(ok); };
    const esc = (e) => { if (e.key === 'Escape') close(false); };
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      errBox.textContent = ''; confirmBtn.disabled = true;
      try { const keep = await onConfirm(form, errBox); if (keep !== false) close(true); }
      catch (err) { errBox.textContent = err.message || 'Something went wrong.'; }
      confirmBtn.disabled = false;
    });
    document.addEventListener('keydown', esc);
    document.body.append(overlay);
    const first = form.querySelector('input,textarea,select'); if (first) first.focus();
  });
}

export function field(label, control, hint, id) {
  id = id || 'f' + Math.random().toString(36).slice(2, 8);
  control.id = id;
  return h('div', { class: 'fld' }, h('label', { for: id, class: 'lab' }, label), control, hint ? h('p', { class: 'fine' }, hint) : null);
}
export const spinner = (text) => h('div', { class: 'loading', role: 'status' }, h('span', { class: 'spin', 'aria-hidden': 'true' }), text || 'Loading…');
export const empty = (title, text, action) => h('div', { class: 'empty' }, h('p', { class: 'empty-t' }, title), text ? h('p', { class: 'muted' }, text) : null, action);

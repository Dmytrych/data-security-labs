'use strict';

// All server data is rendered with textContent (never innerHTML) to rule out XSS.

const RIGHTS = ['own', 'read', 'write', 'control'];
const TOKEN_KEY = 'hru.token';

const state = {
  token: null,
  me: null,
  objects: [],
  commands: [],
  editing: null,
};

const $ = (id) => document.getElementById(id);

function el(tag, text, attrs) {
  const node = document.createElement(tag);
  if (text !== undefined && text !== null) node.textContent = String(text);
  if (attrs) for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  return node;
}

function clear(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
}

function readToken() {
  try {
    return sessionStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

function writeToken(token) {
  try {
    if (token) sessionStorage.setItem(TOKEN_KEY, token);
    else sessionStorage.removeItem(TOKEN_KEY);
  } catch {
    // storage unavailable: the session just won't survive a reload
  }
}

class ApiError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

async function api(method, path, body) {
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (state.token) headers.Authorization = `Bearer ${state.token}`;
  const res = await fetch(`/api${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (res.status === 204) return null;
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const err = data && data.error ? data.error : { code: 'HTTP_' + res.status, message: res.statusText };
    if (res.status === 401 && state.token && path !== '/auth/login') {
      // Session gone (expired, logged out elsewhere, or subject destroyed).
      logoutLocal();
    }
    throw new ApiError(res.status, err.code, err.message);
  }
  return data;
}

function formatError(err) {
  return err instanceof ApiError ? `${err.status} ${err.code}: ${err.message}` : String(err);
}

/* ---------- views ---------- */

function showAuth() {
  $('auth-view').hidden = false;
  $('main-view').hidden = true;
}

function showMain() {
  $('auth-view').hidden = true;
  $('main-view').hidden = false;
}

function logoutLocal() {
  state.token = null;
  state.me = null;
  writeToken(null);
  showAuth();
}

/* ---------- auth ---------- */

$('login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.currentTarget;
  const errorBox = form.querySelector('[data-error]');
  errorBox.textContent = '';
  const fd = new FormData(form);
  try {
    const result = await api('POST', '/auth/login', { name: fd.get('name'), password: fd.get('password') });
    state.token = result.token;
    writeToken(result.token);
    form.reset();
    await enterMain();
  } catch (err) {
    errorBox.textContent = formatError(err);
  }
});

$('register-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.currentTarget;
  const errorBox = form.querySelector('[data-error]');
  const okBox = form.querySelector('[data-ok]');
  errorBox.textContent = '';
  okBox.textContent = '';
  const fd = new FormData(form);
  try {
    const result = await api('POST', '/auth/register', { name: fd.get('name'), password: fd.get('password') });
    okBox.textContent = `Subject "${result.subject.name}" registered. You can log in now.`;
    form.reset();
  } catch (err) {
    errorBox.textContent = formatError(err);
  }
});

$('logout-btn').addEventListener('click', async () => {
  try {
    await api('POST', '/auth/logout');
  } catch {
    // already invalid; drop it locally anyway
  }
  logoutLocal();
});

async function enterMain() {
  state.commands = await api('GET', '/commands');
  renderCommandSelect();
  await refreshAll();
  showMain();
  // Admin views are audited (view_matrix/view_audit), so they load once here and then only on Refresh.
  if (state.me.isAdmin) await refreshAdmin();
}

async function refreshAll() {
  const [me, objects] = await Promise.all([api('GET', '/me'), api('GET', '/objects')]);
  state.me = me;
  state.objects = objects;
  renderMe();
  renderObjects();
  renderCapabilities();
}

/* ---------- me / capabilities ---------- */

function renderMe() {
  $('me-name').textContent = state.me.subject.name;
  $('admin-badge').hidden = !state.me.isAdmin;
  $('admin-section').hidden = !state.me.isAdmin;
}

function renderCapabilities() {
  const body = $('caps-body');
  clear(body);
  if (state.me.capabilities.length === 0) {
    const tr = el('tr');
    tr.appendChild(el('td', 'No rights yet.', { colspan: '3', class: 'muted' }));
    body.appendChild(tr);
    return;
  }
  for (const cap of state.me.capabilities) {
    const tr = el('tr');
    tr.appendChild(el('td', cap.object));
    tr.appendChild(el('td', cap.kind));
    tr.appendChild(el('td', cap.rights.join(', ')));
    body.appendChild(tr);
  }
}

/* ---------- objects ---------- */

function renderObjects() {
  const body = $('objects-body');
  clear(body);
  for (const obj of state.objects) {
    const tr = el('tr');
    tr.appendChild(el('td', obj.name));
    tr.appendChild(el('td', obj.kind));
    tr.appendChild(el('td', obj.myRights.length ? obj.myRights.join(', ') : '—'));
    const actions = el('td');
    if (obj.kind === 'file') {
      // Shown regardless of rights, so a click demonstrates the kernel's 403.
      const readBtn = el('button', 'Read', { type: 'button', class: 'small' });
      readBtn.addEventListener('click', () => readObject(obj.name));
      const editBtn = el('button', 'Edit', { type: 'button', class: 'small secondary' });
      editBtn.addEventListener('click', () => editObject(obj.name));
      actions.appendChild(readBtn);
      actions.appendChild(editBtn);
    }
    tr.appendChild(actions);
    body.appendChild(tr);
  }
}

function openPanel(title) {
  $('object-panel').hidden = false;
  $('object-panel-title').textContent = title;
  $('object-error').textContent = '';
}

async function readObject(name) {
  openPanel(`Read: ${name}`);
  $('object-editor').hidden = true;
  $('object-content').hidden = false;
  $('object-content').textContent = '';
  try {
    const result = await api('GET', `/objects/${encodeURIComponent(name)}`);
    $('object-content').textContent = result.content === '' ? '(empty)' : result.content;
  } catch (err) {
    $('object-content').hidden = true;
    $('object-error').textContent = formatError(err);
  }
}

function editObject(name) {
  // Pre-fill only from what is already on screen; editing needs write, not read.
  const shown = $('object-panel-title').textContent === `Read: ${name}` && !$('object-content').hidden
    ? $('object-content').textContent
    : '';
  state.editing = name;
  openPanel(`Edit: ${name}`);
  $('object-content').hidden = true;
  $('object-editor').hidden = false;
  $('object-textarea').value = shown === '(empty)' ? '' : shown;
  $('object-textarea').focus();
}

$('object-save').addEventListener('click', async () => {
  $('object-error').textContent = '';
  try {
    await api('PUT', `/objects/${encodeURIComponent(state.editing)}`, { content: $('object-textarea').value });
    const name = state.editing;
    state.editing = null;
    $('object-editor').hidden = true;
    $('object-panel-title').textContent = `Saved: ${name}`;
  } catch (err) {
    $('object-error').textContent = formatError(err);
  }
});

$('object-cancel').addEventListener('click', () => {
  state.editing = null;
  $('object-panel').hidden = true;
});

/* ---------- commands ---------- */

function renderCommandSelect() {
  const select = $('command-select');
  clear(select);
  for (const cmd of state.commands) select.appendChild(el('option', cmd.name, { value: cmd.name }));
  renderCommandParams();
}

function namesOfKind(type) {
  return state.objects
    .filter((o) => type === 'object' || o.kind === type)
    .map((o) => o.name);
}

function renderCommandParams() {
  const cmd = state.commands.find((c) => c.name === $('command-select').value);
  const container = $('command-params');
  clear(container);
  $('command-description').textContent = cmd ? cmd.description : '';
  if (!cmd) return;
  for (const param of cmd.params) {
    const label = el('label', `${param.name} (${param.type}) `);
    let input;
    if (param.type === 'right') {
      input = el('select');
      for (const r of RIGHTS) input.appendChild(el('option', r, { value: r }));
    } else {
      input = el('input', null, { required: '' });
      if (param.type !== 'newName') {
        const listId = `list-${param.name}`;
        input.setAttribute('list', listId);
        const list = el('datalist', null, { id: listId });
        for (const n of namesOfKind(param.type)) list.appendChild(el('option', null, { value: n }));
        label.appendChild(list);
      }
    }
    input.name = param.name;
    label.appendChild(input);
    container.appendChild(label);
  }
}

$('command-select').addEventListener('change', () => {
  $('command-error').textContent = '';
  clear($('command-changes'));
  renderCommandParams();
});

$('command-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  $('command-error').textContent = '';
  clear($('command-changes'));
  const command = $('command-select').value;
  const args = {};
  for (const input of $('command-params').querySelectorAll('input, select')) args[input.name] = input.value;
  try {
    const result = await api('POST', '/commands', { command, args });
    for (const change of result.changes) $('command-changes').appendChild(el('li', change));
    await refreshAll();
    renderCommandParams();
  } catch (err) {
    $('command-error').textContent = formatError(err);
  }
});

/* ---------- admin ---------- */

async function refreshAdmin() {
  $('admin-error').textContent = '';
  try {
    const outcome = $('audit-outcome').value;
    const query = outcome ? `?outcome=${encodeURIComponent(outcome)}` : '';
    const [matrix, audit] = await Promise.all([api('GET', '/admin/matrix'), api('GET', `/admin/audit${query}`)]);
    renderMatrix(matrix);
    renderAudit(audit);
  } catch (err) {
    $('admin-error').textContent = formatError(err);
  }
}

function renderMatrix(m) {
  const table = $('matrix-table');
  clear(table);
  const head = el('tr');
  head.appendChild(el('th', 'S \\ O'));
  for (const o of m.objects) head.appendChild(el('th', o));
  const thead = el('thead');
  thead.appendChild(head);
  table.appendChild(thead);
  const tbody = el('tbody');
  for (const s of m.subjects) {
    const tr = el('tr');
    tr.appendChild(el('th', s));
    const row = m.cells[s] || {};
    for (const o of m.objects) tr.appendChild(el('td', (row[o] || []).join(', ')));
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);
}

function renderAudit(entries) {
  const body = $('audit-body');
  clear(body);
  for (const e of entries) {
    const tr = el('tr', null, e.outcome === 'DENIED' ? { class: 'denied' } : undefined);
    tr.appendChild(el('td', e.ts));
    tr.appendChild(el('td', e.actor ?? ''));
    tr.appendChild(el('td', e.event));
    tr.appendChild(el('td', e.action));
    tr.appendChild(el('td', e.args === null ? '' : JSON.stringify(e.args), { class: 'args' }));
    tr.appendChild(el('td', e.outcome));
    tr.appendChild(el('td', e.reason ?? ''));
    body.appendChild(tr);
  }
}

$('admin-refresh').addEventListener('click', refreshAdmin);
$('audit-outcome').addEventListener('change', refreshAdmin);

/* ---------- boot ---------- */

(async function boot() {
  state.token = readToken();
  if (!state.token) {
    showAuth();
    return;
  }
  try {
    await enterMain();
  } catch {
    logoutLocal();
  }
})();

// ═══════════════════════════════════════════════════════
// ReelMatch Editing Room — settings.js
// ═══════════════════════════════════════════════════════
console.log('[Settings] ▶ INITIALIZED'); // DEBUG

/* ─── THEME SYSTEM ───────────────────────────────────────────────────── */
function applyTheme(id) {
  const t = THEMES.find(x => x.id === id) || THEMES[0];
  const r = document.documentElement.style;
  r.setProperty('--bg-primary',  t.bg);
  r.setProperty('--bg-surface',  t.surface);
  r.setProperty('--bg-hover',    lighten(t.surface, 8));
  r.setProperty('--text-primary',t.text);
  r.setProperty('--text-muted',  t.muted);
  r.setProperty('--accent',      t.accent);
  r.setProperty('--accent-dim',  hexToRgba(t.accent, .15));
  r.setProperty('--border',      t.border);
  state.activeTheme = id;
  localStorage.setItem('admin_theme', id);
  document.querySelectorAll('.theme-dot, .theme-swatch').forEach(el => {
    el.classList.toggle('active', el.dataset.tid === id);
  });
}

function lighten(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.min(255, ((n >> 16) & 0xff) + amt);
  const g = Math.min(255, ((n >> 8)  & 0xff) + amt);
  const b = Math.min(255, ((n)       & 0xff) + amt);
  return '#' + [r,g,b].map(v => v.toString(16).padStart(2,'0')).join('');
}

function hexToRgba(hex, a) {
  const n = parseInt(hex.replace('#',''), 16);
  return `rgba(${(n>>16)&255},${(n>>8)&255},${n&255},${a})`;
}

function buildThemeGrid(containerId) {
  const c = document.getElementById(containerId);
  if (!c) return;
  c.innerHTML = THEMES.map(t => `
    <div class="theme-swatch${t.id===state.activeTheme?' active':''}" data-tid="${t.id}" onclick="applyTheme('${t.id}')">
      <div class="theme-swatch-circle" style="background:linear-gradient(135deg,${t.bg} 50%,${t.accent} 50%)"></div>
      <div class="theme-swatch-name">${t.name}</div>
    </div>
  `).join('');
}

/* ─── TIMEZONE SETTINGS ──────────────────────────────────────────────── */
function initTimezoneSettings() {
  const wrap = document.getElementById('settings-tz-wrap');
  if (!wrap || wrap.dataset.init) return;
  wrap.dataset.init = '1';
  wrap.innerHTML = buildTimezoneSelectHtml('settings-tz-select', getAdminTimezone());
  document.getElementById('settings-tz-select').addEventListener('change', e => {
    localStorage.setItem('admin_timezone', e.target.value);
    // Re-render visible content with new timezone
    switch (state.section) {
      case 'users':     if (state._currentPageData) renderUsersTable(state._currentPageData, state.usersTotal); break;
      case 'banned':    loadBannedUsers(); break;
      case 'reports':   loadReports();     break;
      case 'dashboard': loadDashboard();   break;
    }
    if (_panelUser) renderUserPanel(_panelUser);
  });
}

/* ─── EMAIL TEMPLATES ────────────────────────────────────────────────── */
const EMAIL_TEMPLATES = [
  {
    code: 'verification',
    name: 'Email Verification',
    subject: 'Verify your ReelMatch account',
    variables: ['{{username}}', '{{verification_url}}', '{{app_name}}'],
    file: 'verification.html',
    desc: 'Sent when a new user registers',
  },
  {
    code: 'welcome',
    name: 'Welcome Email',
    subject: 'Welcome to ReelMatch, {{username}}!',
    variables: ['{{username}}', '{{app_name}}'],
    file: 'welcome.html',
    desc: 'Sent after email is verified',
  },
  {
    code: 'reset_password',
    name: 'Password Reset',
    subject: 'Reset your ReelMatch password',
    variables: ['{{username}}', '{{reset_url}}', '{{app_name}}'],
    file: 'reset_password.html',
    desc: 'Sent when a user requests a password reset',
  },
];

function renderEmailTemplateList() {
  const list = document.getElementById('email-template-list');
  if (!list) return;
  list.innerHTML = EMAIL_TEMPLATES.map(t => `
    <div class="card-item">
      <div class="card-item-info">
        <h3>${t.name}</h3>
        <p>Subject: <em>${esc(t.subject)}</em> &nbsp;·&nbsp; ${t.desc}</p>
        <p style="margin-top:4px">Variables: ${t.variables.map(v => `<code style="font-size:11px;background:var(--bg-hover);padding:1px 5px;border-radius:3px;color:var(--text-muted)">${v}</code>`).join(' ')}</p>
      </div>
      <div class="card-item-actions">
        <button class="btn btn-ghost" onclick="openEditor('${t.code}')">Edit</button>
      </div>
    </div>
  `).join('');
}

async function openEditor(code) {
  const tpl = EMAIL_TEMPLATES.find(t => t.code === code);
  if (!tpl) return;
  state.editingTemplate = tpl;

  document.getElementById('editor-title').textContent = `Edit: ${tpl.name}`;
  document.getElementById('editor-subject').value = tpl.subject;

  // Build variable chips
  document.getElementById('var-chips').innerHTML = tpl.variables.map(v => `
    <span class="var-chip" onclick="insertVar('${v}')">${v}</span>
  `).join('');

  // Try to load template HTML from GitHub Pages path
  const htmlArea = document.getElementById('editor-html');
  htmlArea.value = '<!-- Loading template… -->';

  // Try fetching from relative path (works on GitHub Pages at /editingroom/)
  try {
    const basePath = window.location.pathname.replace(/\/[^/]*$/, '');
    const r = await fetch(`${basePath}/../templates/email/${tpl.file}`);
    if (r.ok) {
      htmlArea.value = await r.text();
    } else {
      htmlArea.value = `<!-- Could not load ${tpl.file} from server -->\n<!-- Paste your template HTML here -->\n`;
    }
  } catch {
    htmlArea.value = `<!-- Paste your ${tpl.name} template HTML here -->\n<!-- Variables: ${tpl.variables.join(', ')} -->\n`;
  }

  updatePreview();
  htmlArea.addEventListener('input', updatePreview);
  document.getElementById('editor-modal').classList.add('open');
}

function updatePreview() {
  const html = document.getElementById('editor-html').value;
  const iframe = document.getElementById('editor-preview');
  try {
    const doc = iframe.contentDocument || iframe.contentWindow.document;
    doc.open(); doc.write(html); doc.close();
  } catch {}
}

function insertVar(v) {
  const ta = document.getElementById('editor-html');
  const s = ta.selectionStart, e = ta.selectionEnd;
  ta.value = ta.value.slice(0, s) + v + ta.value.slice(e);
  ta.selectionStart = ta.selectionEnd = s + v.length;
  ta.focus();
  updatePreview();
}

function closeEditor() {
  document.getElementById('editor-modal').classList.remove('open');
  document.getElementById('editor-html').removeEventListener('input', updatePreview);
  state.editingTemplate = null;
}

async function saveTemplate() {
  if (!state.editingTemplate) return;
  const tpl  = state.editingTemplate;
  const subj = document.getElementById('editor-subject').value.trim();
  const html = document.getElementById('editor-html').value;
  try {
    await api(`/admin/email-templates/${tpl.code}`, {
      method: 'PUT',
      body: JSON.stringify({ code: tpl.code, subject: subj, html_body: html }),
    });
    toast(`${tpl.name} saved successfully`, 'success');
    closeEditor();
  } catch (e) {
    toast(`Save failed: ${e.message}`, 'error');
  }
}

/* ─── DATA OPERATIONS ────────────────────────────────────────────────── */
async function triggerPrecache() {
  showConfirm('Pre-cache Trending', 'Fetch and cache current trending movies from TMDB?', async () => {
    try {
      const data = await api('/movies/trending');
      toast(`Fetched ${Array.isArray(data) ? data.length : 0} trending movies`, 'success');
    } catch (e) {
      toast(e.message, 'error');
    }
  });
}

async function loadImportStatus() {
  const el = document.getElementById('import-job-status');
  el.textContent = 'Checking…';
  try {
    const jobs = await api('/imports/jobs?page_size=1');
    const latest = Array.isArray(jobs) ? jobs[0] : null;
    if (latest) {
      el.textContent = `${latest.source} — ${latest.status} — ${latest.imported_records || latest.processed_records || 0} imported (${formatDate(latest.completed_at || latest.created_at)})`;
    } else {
      el.textContent = 'No import jobs found';
    }
  } catch (e) {
    el.textContent = `Error: ${e.message}`;
  }
}

/* ─── APP DEV ─────────────────────────────────────────────────────────── */
let _devPillValue = 'admins_only';

function setDevPillOption(value) {
  _devPillValue = value;
  document.querySelectorAll('#dev-pill-toggle button').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.value === value);
  });
}

async function loadAppDev() {
  try {
    const data = await api('/admin/app-settings');
    if (!data) return;
    const v = data['dev_pill_visibility'] ?? 'admins_only';
    setDevPillOption(v);
  } catch (e) {
    toast('Failed to load app settings: ' + e.message, 'error');
  }
}

async function saveDevPillVisibility() {
  const btn = document.getElementById('dev-pill-save-btn');
  btn.disabled = true;
  btn.textContent = 'Saving…';
  try {
    await api('/admin/app-settings/dev_pill_visibility', {
      method: 'PUT',
      body: JSON.stringify({ value: _devPillValue }),
    });
    toast('Dev pill visibility saved', 'success');
  } catch (e) {
    toast('Save failed: ' + e.message, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Save';
  }
}

/* ─── Update analytics subtitle when range changes ─────────────────── */
(function _patchAnalyticsSubtitle() {
  const _orig = setAnalyticsRange;
  // subtitle updates are handled inline; no patch needed
})();

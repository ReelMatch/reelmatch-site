// ═══════════════════════════════════════════════════════
// ReelMatch Editing Room — utils.js
// ═══════════════════════════════════════════════════════

/* ─── CONFIGURATION ─────────────────────────────────────────────────── */
const API_BASE     = 'https://web-production-d11a6.up.railway.app';
const BUILD_VERSION = '0.1.3';
const BUILD_DATE    = '2026-03-22';

const CHANGELOG = [
  { version: 'v0.1.3', date: '2026-03-22', changes: [
    'Clean-slate recommendation engine with pre-computation',
    'Genre affinity backfill for movies with no neighbor coverage',
    'Editing Room split into separate CSS/JS files',
    'Rec engine console log window with copy button',
    'Pull-to-refresh on all app screens',
    'Rate tab navigates to movie detail instead of drawer',
    'False rating save error toast fixed',
  ]},
  { version: 'v0.1.2', date: '2026-03-20', changes: [
    'Bulk recommendations refresh with real-time progress bar',
    'Predicted ratings in Rate tab drawer',
    'For You page with 25 recs and Suggest More',
    'Ratings count accuracy fixes (1272 now shows correctly)',
    'Seed ratings toggle in analytics',
  ]},
];

/* ─── THEMES ─────────────────────────────────────────────────────────── */
const THEMES = [
  { id:'reelmatch',   name:'ReelMatch',   bg:'#0e0c0a', surface:'#1a1612', text:'#f5f0e8', muted:'#6b6560', accent:'#c0392b', border:'rgba(245,240,232,0.1)' },
  { id:'midnight',    name:'Midnight',    bg:'#0a0d14', surface:'#111827', text:'#e8eaf6', muted:'#6b7280', accent:'#3b82f6', border:'rgba(232,234,246,0.1)' },
  { id:'forest',      name:'Forest',      bg:'#0a110a', surface:'#111a11', text:'#e8f5e9', muted:'#6b7c6b', accent:'#2e7d32', border:'rgba(232,245,233,0.1)' },
  { id:'burgundy',    name:'Burgundy',    bg:'#0f0a0a', surface:'#1a1010', text:'#fdf0f0', muted:'#7c6060', accent:'#8b1a1a', border:'rgba(253,240,240,0.1)' },
  { id:'slate',       name:'Slate',       bg:'#0d0f12', surface:'#161b22', text:'#e6edf3', muted:'#8b949e', accent:'#58a6ff', border:'rgba(230,237,243,0.1)' },
  { id:'amber',       name:'Amber',       bg:'#0f0e0a', surface:'#1a1810', text:'#fdf8e8', muted:'#7c7060', accent:'#d97706', border:'rgba(253,248,232,0.1)' },
  { id:'plum',        name:'Plum',        bg:'#0e0a12', surface:'#1a1020', text:'#f3e8fd', muted:'#7c6080', accent:'#9333ea', border:'rgba(243,232,253,0.1)' },
  { id:'rose',        name:'Rose',        bg:'#120a0d', surface:'#201016', text:'#fde8ef', muted:'#80606b', accent:'#e11d48', border:'rgba(253,232,239,0.1)' },
  { id:'teal',        name:'Teal',        bg:'#0a1212', surface:'#101e1e', text:'#e8fafa', muted:'#607c7c', accent:'#0d9488', border:'rgba(232,250,250,0.1)' },
  { id:'light',       name:'Light',       bg:'#f5f0e8', surface:'#ffffff', text:'#0e0c0a', muted:'#6b6560', accent:'#c0392b', border:'rgba(14,12,10,0.1)'    },
  { id:'cream',       name:'Cream',       bg:'#f5f0e8', surface:'#ffffff', text:'#0e0c0a', muted:'#6b6560', accent:'#c0392b', border:'rgba(14,12,10,0.1)'    },
  { id:'warm-white',  name:'Warm White',  bg:'#faf8f5', surface:'#ffffff', text:'#1a1612', muted:'#8a8278', accent:'#e87c35', border:'rgba(26,22,18,0.1)'    },
  { id:'soft-blue',   name:'Soft Blue',   bg:'#f0f4f8', surface:'#ffffff', text:'#1a2332', muted:'#6b7a8d', accent:'#2563eb', border:'rgba(26,35,50,0.1)'    },
  { id:'sage',        name:'Sage',        bg:'#f2f5f0', surface:'#ffffff', text:'#1a2018', muted:'#6b7c68', accent:'#2d6a4f', border:'rgba(26,32,24,0.1)'    },
  { id:'lavender',    name:'Lavender',    bg:'#f4f0f8', surface:'#ffffff', text:'#1a1232', muted:'#7c6b8d', accent:'#7c3aed', border:'rgba(26,18,50,0.1)'    },
];

/* ─── STATE ──────────────────────────────────────────────────────────── */
let state = {
  token:        null,
  user:         null,
  section:      'dashboard',
  usersPage:    1,
  userQuery:    '',
  usersFilter:  null,
  activeTheme:  localStorage.getItem('admin_theme') || 'reelmatch',
  editingTemplate: null,
  usersTotal:   0,
  usersPageSize: 20,
  _filteredUsers: null,
  _usersTotalFetched: false,
  sortCol: 'created_at',
  sortDir: 'desc',
  _currentPageData: null,
};

/* ─── API HELPER ─────────────────────────────────────────────────────── */
async function api(path, opts = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (window.adminState && window.adminState.token) headers['Authorization'] = `Bearer ${window.adminState.token}`;
  else if (state.token) headers['Authorization'] = `Bearer ${state.token}`;
  Object.assign(headers, opts.headers || {});
  const fullUrl = `${API_BASE}${path}`;
  console.log('───────────────────────────────────────'); // DEBUG
  console.log('[Utils] ▶ API CALL', opts.method || 'GET', fullUrl); // DEBUG
  console.log(`[api] ${opts.method || 'GET'} ${fullUrl} | token: ${(window.adminState?.token || state.token) ? '✓' : '✗ MISSING'}`);
  try {
    const res = await fetch(fullUrl, { ...opts, headers });
    console.log('[Utils] response status:', res.status); // DEBUG
    console.log(`[api] ${opts.method || 'GET'} ${fullUrl} → ${res.status}`);
    if (res.status === 401 && (window.adminState?.token || state.token)) { doLogout(); return null; }
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: `HTTP ${res.status}` }));
      const detail = Array.isArray(err.detail)
        ? err.detail.map(d => d.msg || JSON.stringify(d)).join('; ')
        : (err.detail || err.message || `HTTP ${res.status}`);
      console.error(`[api] error ${res.status} ${path}:`, err);
      throw new Error(detail);
    }
    if (res.status === 204) return null;
    const data = await res.json();
    console.log('[Utils] ▶ RETURNING DATA TO CALLER:', data); // DEBUG
    console.log('───────────────────────────────────────'); // DEBUG
    return data;
  } catch (e) {
    console.error('[Utils] ✗ API ERROR:', e); // DEBUG
    console.log('───────────────────────────────────────'); // DEBUG
    if (e.message === 'Failed to fetch') {
      console.error(`[api] Network error on ${fullUrl} — possible CORS rejection, server down, or unreachable host`);
    }
    throw e;
  }
}

/* ─── TOAST ──────────────────────────────────────────────────────────── */
function toast(msg, type='info') {
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  el.textContent = msg;
  document.getElementById('toast-container').appendChild(el);
  setTimeout(() => {
    el.style.animation = 'slideOut .2s ease forwards';
    setTimeout(() => el.remove(), 200);
  }, 4000);
}

/* ─── CONFIRM DIALOG ─────────────────────────────────────────────────── */
let _confirmCallback = null;
function showConfirm(title, msg, cb) {
  document.getElementById('confirm-title').textContent = title;
  document.getElementById('confirm-message').textContent = msg;
  _confirmCallback = cb;
  document.getElementById('confirm-overlay').classList.add('open');
}
function closeConfirm() { document.getElementById('confirm-overlay').classList.remove('open'); }
function confirmOk() { closeConfirm(); if (_confirmCallback) _confirmCallback(); }

/* ─── DATE/TIME HELPERS ──────────────────────────────────────────────── */
function getAdminTimezone() {
  return localStorage.getItem('admin_timezone') || 'America/New_York';
}

function formatDate(s) {
  if (!s) return '';
  try {
    return new Date(s).toLocaleString('en-US', {
      timeZone: getAdminTimezone(),
      year: 'numeric', month: 'short', day: 'numeric',
      hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true,
    });
  } catch { return s; }
}

function buildTimezoneSelectHtml(selectId, currentVal) {
  const common = [
    'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles',
    'Europe/London', 'Europe/Paris', 'Asia/Tokyo', 'Australia/Sydney',
  ];
  let allZones;
  try { allZones = Intl.supportedValuesOf('timeZone'); }
  catch { allZones = [...common]; }

  const groups = {};
  for (const tz of allZones) {
    const region = tz.includes('/') ? tz.split('/')[0] : 'Other';
    if (!groups[region]) groups[region] = [];
    groups[region].push(tz);
  }
  const opt = (tz) => `<option value="${tz}"${currentVal === tz ? ' selected' : ''}>${tz.replace(/_/g, ' ')}</option>`;
  const regionOrder = ['America','Europe','Asia','Pacific','Australia','Africa','Atlantic','Indian','Arctic','Antarctica','Etc'];
  const sortedRegions = Object.keys(groups).sort((a, b) => {
    const ai = regionOrder.indexOf(a), bi = regionOrder.indexOf(b);
    if (ai >= 0 && bi >= 0) return ai - bi;
    if (ai >= 0) return -1; if (bi >= 0) return 1;
    return a.localeCompare(b);
  });
  let html = `<select id="${selectId}" style="width:100%;max-width:320px;padding:8px 12px;font-size:13px;background:var(--bg-primary);color:var(--text-primary);border:1px solid var(--border);border-radius:6px;cursor:pointer">`;
  html += `<optgroup label="— Common —">${common.map(opt).join('')}</optgroup>`;
  for (const region of sortedRegions) {
    html += `<optgroup label="${region}">${groups[region].map(opt).join('')}</optgroup>`;
  }
  html += '</select>';
  return html;
}

/* ─── UTILITIES ──────────────────────────────────────────────────────── */
function esc(s) {
  if (!s) return '';
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

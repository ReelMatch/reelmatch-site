// ═══════════════════════════════════════════════════════
// ReelMatch Editing Room — users.js
// ═══════════════════════════════════════════════════════
console.log('[Users] ▶ INITIALIZED'); // DEBUG

/* ─── USERS ──────────────────────────────────────────────────────────── */
function handleCardClick(action) {
  switch (action) {
    case 'users-all':    navigate('users'); loadUsers(); break;
    case 'users-today':  navigate('users'); fetchUsersFiltered('today'); break;
    case 'users-week':   navigate('users'); fetchUsersFiltered('week'); break;
    case 'ratings-all':  navigate('users'); toast('Ratings view — coming soon', 'info'); break;
    case 'ratings-today':navigate('users'); toast('Ratings today view — coming soon', 'info'); break;
    case 'reports':      navigate('reports'); break;
    case 'groups-active':navigate('users'); toast('Groups view — coming soon', 'info'); break;
  }
}

function calcUsersPageSize() {
  const searchBarEl = document.querySelector('#sec-users .search-bar');
  const paginationEl = document.getElementById('users-pagination');
  const headerEl = document.querySelector('#sec-users .section-header');
  const searchH  = searchBarEl  ? searchBarEl.offsetHeight  + 16 : 60;
  const headerH  = headerEl     ? headerEl.offsetHeight     + 28 : 80;
  const paginH   = 56; // reserved for pagination row
  const tableHeadH = 42; // thead row
  const mainPad  = 64; // top+bottom padding of #main-content
  const available = window.innerHeight - searchH - headerH - paginH - tableHeadH - mainPad;
  const rows = Math.floor(available / 56);
  state.usersPageSize = Math.min(50, Math.max(5, rows));
}

async function loadUsers() {
  calcUsersPageSize();
  state.userQuery = '';
  state.usersFilter = null;
  state.usersPage = 1;
  closeIsFilterDropdown();
  document.getElementById('user-search').value = '';
  updateSearchClear();
  const subtitle = document.querySelector('#sec-users .section-subtitle');
  if (subtitle) subtitle.textContent = 'All accounts';
  await fetchUsersPage();
}

/* ── is: filter dropdown ─────────────────────────────────────────────── */
const IS_FILTERS = [
  { key: 'is:admin',       filter: 'admin',       desc: 'Users with role = admin' },
  { key: 'is:moderator',   filter: 'moderator',   desc: 'Users with role = moderator' },
  { key: 'is:unverified',  filter: 'unverified',  desc: 'Users with unverified email' },
  { key: 'is:verified',    filter: 'verified',    desc: 'Users with verified email' },
  { key: 'is:test',        filter: 'test',        desc: 'Test accounts (is_test_user)' },
];

function updateSearchClear() {
  const input = document.getElementById('user-search');
  const btn   = document.getElementById('search-clear-btn');
  if (!input || !btn) return;
  btn.classList.toggle('visible', input.value.length > 0);
}

function clearUserSearch() {
  const input = document.getElementById('user-search');
  if (input) input.value = '';
  updateSearchClear();
  closeIsFilterDropdown();
  loadUsers();
}

function onUserSearchInput() {
  const val = document.getElementById('user-search').value;
  const dd = document.getElementById('is-filter-dropdown');
  if (val.startsWith('is:')) {
    const suffix = val.slice(3).toLowerCase();
    const matches = IS_FILTERS.filter(f => f.key.slice(3).startsWith(suffix));
    if (matches.length) {
      dd.innerHTML = matches.map(f => `
        <div class="is-filter-opt" onclick="applyIsFilter('${f.key}','${f.filter}')">
          <span class="is-filter-key">${esc(f.key)}</span>
          <span class="is-filter-desc">${esc(f.desc)}</span>
        </div>`).join('');
      dd.classList.add('open');
      return;
    }
  }
  dd.classList.remove('open');
}

function onUserSearchKeydown(e) {
  if (e.key === 'Enter') { closeIsFilterDropdown(); searchUsers(); }
  if (e.key === 'Escape') { closeIsFilterDropdown(); }
}

function closeIsFilterDropdown() {
  document.getElementById('is-filter-dropdown').classList.remove('open');
}

function applyIsFilter(key, filter) {
  document.getElementById('user-search').value = key;
  closeIsFilterDropdown();
  state.userQuery = '';
  state.usersFilter = filter;
  state.usersPage = 1;
  const subtitle = document.querySelector('#sec-users .section-subtitle');
  if (subtitle) subtitle.textContent = `Filter: ${key}`;
  fetchUsersPage();
}

async function searchUsers() {
  closeIsFilterDropdown();
  const q = document.getElementById('user-search').value.trim();
  if (!q) { loadUsers(); return; }
  // Handle is: filter
  if (q.startsWith('is:')) {
    const suffix = q.slice(3).toLowerCase();
    const match = IS_FILTERS.find(f => f.key === q);
    if (match) { applyIsFilter(match.key, match.filter); return; }
    // Partial match — pick first
    const partial = IS_FILTERS.find(f => f.key.slice(3).startsWith(suffix));
    if (partial) { applyIsFilter(partial.key, partial.filter); return; }
  }
  state.userQuery = q;
  state.usersFilter = null;
  state.usersPage = 1;
  const subtitle = document.querySelector('#sec-users .section-subtitle');
  if (subtitle) subtitle.textContent = `Results for "${q}"`;
  await fetchUsersPage();
}

async function fetchUsersFiltered(filter) {
  calcUsersPageSize();
  const subtitle = document.querySelector('#sec-users .section-subtitle');
  const now = new Date();
  let since;
  if (filter === 'today') {
    since = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
    if (subtitle) subtitle.textContent = 'Joined today';
  } else {
    since = new Date(now - 7 * 864e5).toISOString();
    if (subtitle) subtitle.textContent = 'Joined this week';
  }
  // Fetch all, filter client-side, then paginate
  const wrap = document.getElementById('users-table-wrap');
  wrap.innerHTML = `<div class="loading"><div class="spinner"></div> Loading users…</div>`;
  try {
    const raw = await api('/admin/users?page_size=200');
    if (!raw) return;
    const data = raw.users ?? raw;
    const filtered = since ? data.filter(u => u.created_at && u.created_at >= since) : data;
    state.usersTotal = filtered.length;
    state.usersPage = 1;
    // Store filtered set for pagination
    state._filteredUsers = filtered;
    renderUsersPageFromCache();
  } catch (e) {
    wrap.innerHTML = `<div class="empty">Error: ${esc(e.message)}</div>`;
    toast(e.message, 'error');
  }
}

function renderUsersPageFromCache() {
  const filtered = state._filteredUsers || [];
  const ps = state.usersPageSize;
  const page = state.usersPage;
  const slice = filtered.slice((page - 1) * ps, page * ps);
  renderUsersTable(slice, filtered.length);
}

async function fetchUsersPage() {
  state._filteredUsers = null;
  const wrap = document.getElementById('users-table-wrap');
  wrap.innerHTML = `<div class="loading"><div class="spinner"></div> Loading users…</div>`;
  try {
    let data, total;
    const sortParams = `&sort_by=${encodeURIComponent(state.sortCol)}&sort_dir=${encodeURIComponent(state.sortDir)}`;
    if (state.usersFilter) {
      // is: filter — server-side pagination
      const raw = await api(`/admin/users?filter=${encodeURIComponent(state.usersFilter)}&page=${state.usersPage}&page_size=${state.usersPageSize}${sortParams}`);
      if (!raw) return;
      data  = raw.users ?? raw;
      total = raw.total ?? data.length;
      state.usersTotal = total;
    } else if (state.userQuery) {
      // Text search — server-side sort + pagination
      const raw = await api(`/users/search?q=${encodeURIComponent(state.userQuery)}&page=${state.usersPage}&page_size=${state.usersPageSize}${sortParams}`);
      if (!raw) return;
      data  = raw.results ?? (Array.isArray(raw) ? raw : []);
      total = raw.total ?? data.length;
      state.usersTotal = total;
    } else {
      // All users: server-side pagination + sort
      const raw = await api(`/admin/users?page=${state.usersPage}&page_size=${state.usersPageSize}${sortParams}`);
      if (!raw) return;
      data  = raw.users  ?? raw;
      const exactTotal = raw.total ?? null;
      state.usersTotal = exactTotal !== null
        ? exactTotal
        : (data.length < state.usersPageSize
            ? (state.usersPage - 1) * state.usersPageSize + data.length
            : state.usersTotal);
    }
    console.log('[fetchUsersPage] raw data first 5:', data.slice(0,5).map(u => ({id:u.id, username:u.username, first_name:u.first_name, last_name:u.last_name})));
    renderUsersTable(data, state.usersTotal);
  } catch (e) {
    console.error('fetchUsersPage error:', e);
    wrap.innerHTML = `<div class="empty">Error: ${esc(e.message)}</div>`;
    toast(e.message, 'error');
  }
}

function renderUsersTable(users, total) {
  console.log('[renderUsersTable] first 5 rows:', users.slice(0,5).map(u => ({id:u.id, username:u.username, first_name:u.first_name, last_name:u.last_name})));
  const wrap = document.getElementById('users-table-wrap');
  if (!users.length) {
    wrap.innerHTML = `<div class="empty">No users found.</div>`;
    renderUsersPagination(0, 0);
    return;
  }
  const totalUsers = total ?? users.length;
  state._currentPageData = users;
  const ps = state.usersPageSize;
  const page = state.usersPage;
  const from = (page - 1) * ps + 1;
  const to   = Math.min(page * ps, totalUsers);

  wrap.innerHTML = `
    <div class="table-wrap">
      <table>
        <thead><tr>
          <th class="sortable" onclick="setSortCol('username')">Username ${sortIcon('username')}</th>
          <th class="sortable" onclick="setSortCol('last_name')">Name ${sortIcon('last_name')}</th>
          <th class="sortable" onclick="setSortCol('email')">Email ${sortIcon('email')}</th>
          <th class="sortable" onclick="setSortCol('email_verified')">Verified ${sortIcon('email_verified')}</th>
          <th class="sortable" onclick="setSortCol('created_at')">Joined ${sortIcon('created_at')}</th>
          <th class="sortable" style="text-align:right" onclick="setSortCol('ratings_count')">Ratings ${sortIcon('ratings_count')}</th>
          <th class="sortable" style="text-align:right" onclick="setSortCol('reviews_count')">Reviews ${sortIcon('reviews_count')}</th>
        </tr></thead>
        <tbody>
          ${users.map(u => { _userAdminCache[u.username] = u;
            const suspended = u.is_active === false;
            const rowStyle = suspended ? 'cursor:pointer;background:rgba(255,182,193,0.10)' : 'cursor:pointer';
            const roleMark = u.role === 'admin'
              ? ' <span class="badge badge-admin" style="font-size:10px;padding:1px 5px;vertical-align:middle">admin</span>'
              : u.role === 'moderator'
                ? ' <span class="badge badge-mod" style="font-size:10px;padding:1px 5px;vertical-align:middle">mod</span>'
                : '';
            const suspBadge = suspended ? ' <span class="badge badge-suspended" style="font-size:10px;padding:1px 5px;vertical-align:middle">suspended</span>' : '';
            const rc = u.ratings_count ?? 0;
            const rv = u.reviews_count ?? 0;
            return `
            <tr data-uid="${u.id}" onclick="openUserPanel('${esc(u.username)}')" style="${rowStyle}">
              <td><span style="display:inline-flex;align-items:center;gap:8px">${u.avatar_url ? `<img src="${esc(u.avatar_url)}" style="width:28px;height:28px;border-radius:50%;object-fit:cover;flex-shrink:0;vertical-align:middle" alt="">` : `<span style="display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;border-radius:50%;background:var(--bg-hover);color:var(--text-muted);font-size:11px;font-weight:600;flex-shrink:0">${esc((u.first_name||u.username||'?')[0].toUpperCase())}</span>`}<strong>${esc(u.username)}</strong>${roleMark}${suspBadge}</span></td>
              <td style="color:var(--text-muted)">${u.first_name || u.last_name ? esc([u.first_name, u.last_name].filter(Boolean).join(' ')) : '—'}</td>
              <td style="color:var(--text-muted)">${esc(u.email||'—')}</td>
              <td>${u.email_verified === true ? '<span class="badge badge-verified">Yes</span>' : '<span class="badge badge-pending">No</span>'}</td>
              <td style="color:var(--text-muted);font-size:12px">${formatDate(u.created_at)}</td>
              <td style="text-align:right;${rc === 0 ? 'color:var(--text-muted)' : ''}">${rc.toLocaleString()}</td>
              <td style="text-align:right;${rv === 0 ? 'color:var(--text-muted)' : ''}">${rv.toLocaleString()}</td>
            </tr>
          `; }).join('')}
        </tbody>
      </table>
    </div>`;

  renderUsersPagination(totalUsers, users.length);
}

function renderUsersPagination(total, pageCount) {
  let el = document.getElementById('users-pagination');
  if (!el) {
    el = document.createElement('div');
    el.id = 'users-pagination';
    document.getElementById('users-table-wrap').after(el);
  }
  const ps    = state.usersPageSize;
  const page  = state.usersPage;
  const pages = Math.ceil(total / ps) || 1;

  if (total <= ps) { el.innerHTML = ''; return; }

  const from = (page - 1) * ps + 1;
  const to   = Math.min(page * ps, total);

  el.innerHTML = `
    <div class="pagination-wrap">
      <span class="pg-count">Showing ${from}–${to} of ${total}</span>
      <div class="pg-controls">
        <button class="pg-btn" ${page===1?'disabled':''} onclick="usersGoPage(1)" title="First">|&lt;</button>
        <button class="pg-btn" ${page===1?'disabled':''} onclick="usersGoPage(${page-1})" title="Previous">&lt;</button>
        <span class="pg-label">Page
          <span class="pg-num" id="pg-num-display" onclick="startPageEdit()" title="Click to jump">${page}</span>
          <input id="pg-num-input" class="pg-input" type="number" min="1" max="${pages}" value="${page}"
            style="display:none"
            onblur="commitPageEdit(${pages})"
            onkeydown="if(event.key==='Enter')commitPageEdit(${pages});if(event.key==='Escape'){this.style.display='none';document.getElementById('pg-num-display').style.display='inline'}" />
          of ${pages}
        </span>
        <button class="pg-btn" ${page>=pages?'disabled':''} onclick="usersGoPage(${page+1})" title="Next">&gt;</button>
        <button class="pg-btn" ${page>=pages?'disabled':''} onclick="usersGoPage(${pages})" title="Last">&gt;|</button>
      </div>
    </div>`;
}

function usersGoPage(n) {
  state.usersPage = n;
  if (state._filteredUsers) {
    renderUsersPageFromCache();
  } else {
    fetchUsersPage();
  }
}

function startPageEdit() {
  document.getElementById('pg-num-display').style.display = 'none';
  const inp = document.getElementById('pg-num-input');
  inp.style.display = 'inline';
  inp.focus(); inp.select();
}

function commitPageEdit(maxPages) {
  const inp = document.getElementById('pg-num-input');
  const n = Math.min(maxPages, Math.max(1, parseInt(inp.value, 10) || 1));
  inp.style.display = 'none';
  usersGoPage(n);
}

async function changeRole(userId, username, newRole) {
  try {
    await api(`/users/${username}/role`, {
      method: 'PATCH',
      body: JSON.stringify({ role: newRole }),
    });
    toast(`${username} role updated to ${newRole}`, 'success');
  } catch (e) {
    toast(`Role change not yet supported by API: ${e.message}`, 'error');
  }
}

function roleBadge(role) {
  if (role === 'admin')     return '<span class="badge badge-admin">admin</span>';
  if (role === 'moderator') return '<span class="badge badge-mod">mod</span>';
  return '<span class="badge badge-user">user</span>';
}

/* ─── USER LIST SORT ─────────────────────────────────────────────── */
function sortUsers(users) {
  const col = state.sortCol;
  const dir = state.sortDir;
  return [...users].sort((a, b) => {
    let va = a[col] ?? '';
    let vb = b[col] ?? '';
    if (col === 'email_verified') { va = va === true ? 1 : 0; vb = vb === true ? 1 : 0; }
    else { va = String(va).toLowerCase(); vb = String(vb).toLowerCase(); }
    if (va < vb) return dir === 'asc' ? -1 : 1;
    if (va > vb) return dir === 'asc' ? 1 : -1;
    return 0;
  });
}

function setSortCol(col) {
  if (state.sortCol === col) {
    state.sortDir = state.sortDir === 'asc' ? 'desc' : 'asc';
  } else {
    state.sortCol = col;
    state.sortDir = 'asc';
  }
  state.usersPage = 1;
  state._filteredUsers = null;
  fetchUsersPage();
}

function sortIcon(col) {
  if (state.sortCol !== col) return '<span class="sort-icon">↕</span>';
  return `<span class="sort-icon sort-active">${state.sortDir === 'asc' ? '↑' : '↓'}</span>`;
}

function updateCurrentPageRow(userId) {
  if (!state._currentPageData || !_panelUser) return;
  const idx = state._currentPageData.findIndex(u => u.id === userId);
  if (idx !== -1) {
    state._currentPageData[idx] = { ...state._currentPageData[idx], ..._panelUser };
    const cacheKey = Object.keys(_userAdminCache).find(k => _userAdminCache[k].id === userId);
    if (cacheKey) state._currentPageData[idx] = { ...state._currentPageData[idx], ..._userAdminCache[cacheKey] };
  }
  renderUsersTable(state._currentPageData, state.usersTotal);
}

function removeCurrentPageRow(userId) {
  if (!state._currentPageData) return;
  const row = document.querySelector(`tr[data-uid="${userId}"]`);
  const doRemove = () => {
    state._currentPageData = state._currentPageData.filter(u => u.id !== userId);
    state.usersTotal = Math.max(0, state.usersTotal - 1);
    renderUsersTable(state._currentPageData, state.usersTotal);
  };
  if (row) {
    row.classList.add('row-removing');
    setTimeout(doRemove, 310);
  } else {
    doRemove();
  }
}

function calcAge(birthdate) {
  if (!birthdate) return null;
  const birth = new Date(birthdate);
  const now = new Date();
  let age = now.getFullYear() - birth.getFullYear();
  const m = now.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < birth.getDate())) age--;
  return age;
}

async function toggleUserField(field, newVal) {
  if (!_panelUser) return;
  try {
    await api(`/admin/users/${_panelUser.id}/edit`, {
      method: 'PUT',
      body: JSON.stringify({ field, value: String(newVal) }),
    });
    _panelUser[field] = newVal;
    const cacheKey = Object.keys(_userAdminCache).find(k => _userAdminCache[k].id === _panelUser.id);
    if (cacheKey) _userAdminCache[cacheKey][field] = newVal;
    const label = field.replace(/_/g, ' ');
    toast(`${label.charAt(0).toUpperCase() + label.slice(1)} ${newVal ? 'enabled' : 'disabled'}`, 'success');
    renderUserPanel(_panelUser);
    updateCurrentPageRow(_panelUser.id);
  } catch (e) {
    toast(`Failed: ${e.message}`, 'error');
  }
}

function selectPronoun(text) {
  const input = document.getElementById('pf-input-pronouns');
  if (input) {
    input.value = text;
    document.querySelectorAll('.pronoun-chip').forEach(c =>
      c.classList.toggle('active', c.textContent === text));
  }
}

/* ─── REASON MODAL ───────────────────────────────────────────────────── */
let _reasonCallback = null;
let _reasonMinLen   = 5;

const REASON_CHIPS = {
  suspend:        ['Spam', 'Harassment', 'Fake account', 'Terms violation', 'Abusive content'],
  unsuspend:      ['Appeal accepted', 'Suspension served', 'Error corrected', 'Reviewed and cleared'],
  role_change:    ['Promoted to moderator', 'Demoted due to abuse', 'Admin access granted', 'Role correction'],
  delete:         ['User requested deletion', 'Severe terms violation', 'Duplicate account', 'Fraudulent account'],
  verify:         ['Identity confirmed', 'Manual review passed', 'Support request resolved'],
  generic:        ['Policy violation', 'Admin action', 'Manual correction'],
  content_removed:['Spam', 'Harassment', 'Misinformation', 'Terms violation', 'Offensive content'],
  report_dismiss: ['Insufficient evidence', 'Not a violation', 'Reporter error', 'Duplicate report'],
  report_delete:  ['Harassment', 'Spam', 'Inappropriate content', 'Spoilers', 'Hate speech'],
  report_escalate:['Severe violation', 'Repeat offender', 'Legal concern', 'Needs senior review'],
};

function showReasonModal({ title, chipKey = 'generic', minLen = 5, destructive = false, onConfirm }) {
  _reasonCallback = onConfirm;
  _reasonMinLen   = minLen;

  document.getElementById('reason-title').textContent = title;

  const chips = REASON_CHIPS[chipKey] || REASON_CHIPS.generic;
  document.getElementById('reason-chips').innerHTML = chips.map(c =>
    `<span class="reason-chip" onclick="selectReasonChip(this,'${esc(c)}')">${esc(c)}</span>`
  ).join('');

  const ta = document.getElementById('reason-textarea');
  ta.value = '';
  ta.oninput = updateReasonBtn;

  const btn = document.getElementById('reason-confirm-btn');
  btn.className = `btn ${destructive ? 'btn-danger' : 'btn-primary'}`;
  btn.disabled = true;

  document.getElementById('reason-char-hint').textContent = '';
  document.getElementById('reason-overlay').classList.add('open');
  setTimeout(() => ta.focus(), 60);
}

function selectReasonChip(el, text) {
  document.querySelectorAll('.reason-chip').forEach(c => c.classList.remove('active'));
  el.classList.add('active');
  document.getElementById('reason-textarea').value = text;
  updateReasonBtn();
}

function updateReasonBtn() {
  const len = document.getElementById('reason-textarea').value.trim().length;
  const btn = document.getElementById('reason-confirm-btn');
  btn.disabled = len < 5;
  document.getElementById('reason-char-hint').textContent = '';
}

function closeReasonModal() {
  document.getElementById('reason-overlay').classList.remove('open');
  _reasonCallback = null;
}

function submitReason() {
  console.log('submitReason: called');
  const reason = document.getElementById('reason-textarea').value.trim();
  console.log('submitReason: reason =', reason, '| length =', reason.length);
  if (reason.length < 5) {
    console.log('submitReason: reason too short, aborting');
    return;
  }
  const cb = _reasonCallback;
  console.log('submitReason: callback =', cb);
  closeReasonModal();
  if (cb) {
    console.log('submitReason: invoking callback');
    cb(reason);
  } else {
    console.warn('submitReason: no callback set');
  }
}

/* ─── USER DETAIL PANEL ──────────────────────────────────────────────── */
let _panelUser = null;
const _userAdminCache = {}; // username → full admin row (has email, email_verified, role, id)

async function openUserPanel(username, context = {}) {
  document.getElementById('panel-title').textContent = username;
  document.getElementById('panel-body').innerHTML = '<div class="loading"><div class="spinner"></div></div>';
  document.getElementById('user-panel').classList.add('open');
  document.getElementById('panel-overlay').classList.add('open');

  // Start with cached admin data (has id, email, email_verified, role, is_active)
  const adminData = _userAdminCache[username] || {};
  _panelUser = { ...adminData };

  try {
    // Fetch public profile for stats and any fields not in the admin cache
    const profile = await api(`/users/${username}`);
    console.log('[openUserPanel] raw profile API response:', profile);
    if (profile) {
      // Start from adminData (preserves all admin-only fields: first_name, last_name, etc.)
      // Overlay profile fields, but adminData wins for any field it already has a value for
      _panelUser = {
        ...profile,
        ...adminData,
        // Always take stats from the live profile (not cached)
        total_ratings:   profile.total_ratings,
        follower_count:  profile.follower_count,
        following_count: profile.following_count,
      };
    }
    // Store panel context (e.g. opened from banned list vs suspended list)
    _panelUser._panelStatus = context.status || null;
    _panelUser._banId       = context.ban_id || null;
    console.log('[openUserPanel] merged _panelUser:', JSON.parse(JSON.stringify(_panelUser)));
    renderUserPanel(_panelUser);
  } catch (e) {
    console.error('openUserPanel fetch error:', e);
    // Still render with whatever admin data we have
    if (_panelUser.id) {
      _panelUser._panelStatus = context.status || null;
      _panelUser._banId       = context.ban_id || null;
      renderUserPanel(_panelUser);
    } else {
      document.getElementById('panel-body').innerHTML = `<div class="empty">Error loading user: ${esc(e.message)}</div>`;
    }
  }
}

function closeUserPanel() {
  document.getElementById('user-panel').classList.remove('open');
  document.getElementById('panel-overlay').classList.remove('open');
  _panelUser = null;
}

function renderUserPanel(u) {
  const initials = (u.username || '?').slice(0,2).toUpperCase();
  const joinDate = u.created_at ? formatDate(u.created_at) : '—';
  const ratings  = u.total_ratings    ?? '—';
  const reviews  = u.total_reviews    ?? '—';
  const friends  = u.follower_count   ?? '—';
  const groups   = u.groups_count     ?? '—';
  const active        = u.is_active !== false; // default true if unknown
  const isBannedPanel = u._panelStatus === 'banned';

  document.getElementById('panel-body').innerHTML = `
    <!-- Tabs -->
    <div class="panel-tabs">
      <div class="panel-tab active" onclick="switchPanelTab('info',this)">User Info</div>
      <div class="panel-tab" onclick="switchPanelTab('modlog',this)">Mod Log</div>
    </div>

    <!-- Info tab -->
    <div class="panel-tab-content active" id="ptab-info">
      <div class="panel-avatar">
        ${u.avatar_url ? `<img src="${esc(u.avatar_url)}" alt="" />` : initials}
      </div>
      <div class="panel-username">${esc(u.username)}</div>
      <div class="panel-meta">Joined ${joinDate}</div>
      ${isBannedPanel
        ? '<div class="panel-meta" style="color:#cc2222;margin-top:4px">⚠ This account has been permanently banned</div>'
        : !active ? '<div class="panel-meta" style="color:#e57373;margin-top:4px">⚠ Account suspended</div>' : ''}
      <div class="panel-badges" style="margin-top:8px">
        ${roleBadge(u.role)}
        ${u.email_verified === true
          ? '<span class="badge badge-verified" style="margin-left:6px">Verified</span>'
          : '<span class="badge badge-pending" style="margin-left:6px">Unverified</span>'}
        ${isBannedPanel
          ? '<span class="badge" style="margin-left:6px;background:rgba(139,0,0,.35);color:#cc2222;font-weight:700">BANNED</span>'
          : !active ? '<span class="badge" style="margin-left:6px;background:rgba(229,62,62,.2);color:#e57373">Suspended</span>' : ''}
      </div>

      <div class="panel-stats">
        <div class="panel-stat" onclick="openStatPanel('Ratings')"><div class="panel-stat-n">${ratings}</div><div class="panel-stat-l">Ratings</div></div>
        <div class="panel-stat" onclick="openStatPanel('Reviews')"><div class="panel-stat-n">${reviews}</div><div class="panel-stat-l">Reviews</div></div>
        <div class="panel-stat" onclick="openStatPanel('Followers')"><div class="panel-stat-n">${friends}</div><div class="panel-stat-l">Followers</div></div>
        <div class="panel-stat" onclick="openStatPanel('Groups')"><div class="panel-stat-n">${groups}</div><div class="panel-stat-l">Groups</div></div>
      </div>

      <!-- IDENTITY -->
      <div class="panel-section">
        <div class="panel-section-title">Identity</div>
        <div class="pf-grid">
          ${[
            ['first_name',   'First Name',   u.first_name],
            ['last_name',    'Last Name',    u.last_name],
            ['username',     'Username',     u.username],
            ['pronouns',     'Pronouns',     u.pronouns],
          ].map(([field, label, val]) => `
            <div class="pf-row">
              <div class="pf-label">${label}</div>
              <div class="pf-val-wrap" id="pf-${field}">
                <span class="pf-val pf-editable${!val ? ' empty' : ''}" onclick="startFieldEdit('${field}')">${esc(val || '—')}</span>
                <button class="pf-edit-btn" onclick="startFieldEdit('${field}')" title="Edit ${label}">✎</button>
              </div>
            </div>`).join('')}
        </div>
      </div>

      <!-- PROFILE -->
      <div class="panel-section">
        <div class="panel-section-title">Profile</div>
        <div class="pf-grid">
          ${[
            ['bio',      'Bio',      u.bio],
            ['location', 'Location', u.location],
            ['website',  'Website',  u.website],
          ].map(([field, label, val]) => `
            <div class="pf-row${field === 'bio' && val ? ' pf-row--multiline' : ''}">
              <div class="pf-label">${label}</div>
              <div class="pf-val-wrap" id="pf-${field}">
                <span class="pf-val pf-editable${!val ? ' empty' : ''}" onclick="startFieldEdit('${field}')">${esc(val || '—')}</span>
                <button class="pf-edit-btn" onclick="startFieldEdit('${field}')" title="Edit ${label}">✎</button>
              </div>
            </div>`).join('')}
          <div class="pf-row">
            <div class="pf-label">Public</div>
            <div class="pf-val-wrap">
              <div class="toggle-wrap">
                <label class="toggle">
                  <input type="checkbox" ${u.is_profile_public !== false ? 'checked' : ''} onchange="toggleUserField('is_profile_public', this.checked)" />
                  <span class="toggle-slider"></span>
                </label>
                <span class="toggle-label">${u.is_profile_public !== false ? 'Public profile' : 'Private profile'}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- PREFERENCES -->
      <div class="panel-section">
        <div class="panel-section-title">Preferences</div>
        <div class="pf-grid">
          <div class="pf-row">
            <div class="pf-label">Adult</div>
            <div class="pf-val-wrap">
              <div class="toggle-wrap">
                <label class="toggle">
                  <input type="checkbox" ${u.show_adult_content ? 'checked' : ''} onchange="toggleUserField('show_adult_content', this.checked)" />
                  <span class="toggle-slider"></span>
                </label>
                <span class="toggle-label">${u.show_adult_content ? 'Adult content on' : 'Adult content off'}</span>
              </div>
            </div>
          </div>
          <div class="pf-row">
            <div class="pf-label">Timezone</div>
            <div class="pf-val-wrap" id="pf-timezone">
              <span class="pf-val pf-editable${!u.timezone ? ' empty' : ''}" onclick="startFieldEdit('timezone')">${esc(u.timezone || '—')}</span>
              <button class="pf-edit-btn" onclick="startFieldEdit('timezone')" title="Edit Timezone">✎</button>
            </div>
          </div>
          <div class="pf-row">
            <div class="pf-label">Theme</div>
            <div class="pf-val-wrap" id="pf-theme_preference">
              <span class="pf-val pf-editable${!u.theme_preference ? ' empty' : ''}" onclick="startFieldEdit('theme_preference')">${esc(u.theme_preference || '—')}</span>
              <button class="pf-edit-btn" onclick="startFieldEdit('theme_preference')" title="Edit Theme">✎</button>
            </div>
          </div>
        </div>
      </div>

      <!-- ACCOUNT -->
      <div class="panel-section">
        <div class="panel-section-title">Account</div>
        <div class="pf-grid">
          ${[
            ['email', 'Email', u.email],
            ['role',  'Role',  u.role],
          ].map(([field, label, val]) => `
            <div class="pf-row">
              <div class="pf-label">${label}</div>
              <div class="pf-val-wrap" id="pf-${field}">
                <span class="pf-val pf-editable${!val ? ' empty' : ''}" onclick="startFieldEdit('${field}')">${esc(val || '—')}</span>
                <button class="pf-edit-btn" onclick="startFieldEdit('${field}')" title="Edit ${label}">✎</button>
              </div>
            </div>`).join('')}
          <div class="pf-row">
            <div class="pf-label">Birthdate</div>
            <div class="pf-val-wrap" id="pf-birthdate">
              ${(() => {
                const age = calcAge(u.birthdate);
                const bdStr = u.birthdate
                  ? new Date(u.birthdate).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'})
                  : null;
                return `
                  <span class="pf-val pf-editable${!u.birthdate ? ' empty' : ''}" onclick="startFieldEdit('birthdate')">
                    ${bdStr || '—'}
                    ${age !== null ? `<span style="color:var(--text-muted);font-size:12px;margin-left:6px">${age} years old</span>` : ''}
                  </span>
                  <button class="pf-edit-btn" onclick="startFieldEdit('birthdate')" title="Edit Birthdate">✎</button>`;
              })()}
            </div>
          </div>
          <div class="pf-row">
            <div class="pf-label">Verified</div>
            <div class="pf-val-wrap">
              <span class="pf-val">
                ${u.email_verified === true
                  ? '<span style="color:#6dc86d">✓ Yes</span>'
                  : '<span style="color:var(--text-muted)">No</span>'}
              </span>
            </div>
          </div>
          <div class="pf-row">
            <div class="pf-label">Joined</div>
            <div class="pf-val-wrap">
              <span class="pf-val" style="color:var(--text-muted)">${joinDate}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Account Actions -->
      <div class="panel-section">
        <div class="panel-section-title">Account Actions</div>
        <div class="panel-actions">
          <div class="panel-action-row">
            <button class="btn btn-ghost" style="flex:1;justify-content:center" onclick="panelVerifyEmail()">
              ${u.email_verified === true ? '✓ Email Already Verified' : 'Verify Email Manually'}
            </button>
          </div>
          <div class="panel-action-row">
            <button class="btn btn-ghost" style="flex:1;justify-content:center" onclick="panelResetPassword()">Send Password Reset Email</button>
          </div>
          <div class="panel-action-row">
            <button class="btn btn-ghost" style="flex:1;justify-content:center" onclick="openSetPasswordModal()">Set Password</button>
          </div>
        </div>
      </div>

      <!-- Recommendations -->
      <div class="panel-section">
        <div class="panel-section-title">Recommendations</div>
        <div id="panel-matrix-status-badge" style="margin-bottom:8px">
          <div style="font-size:12px;color:var(--text-muted)">Loading matrix status…</div>
        </div>
        <div class="panel-actions">
          <div class="panel-action-row">
            <button id="recs-rebuild-matrix-btn" class="btn btn-ghost" style="flex:1;justify-content:center" onclick="panelRefreshRecs('matrix')" title="Rebuild neighbor matrix (Phase 1)">⬡ Rebuild Matrix</button>
            <button id="recs-recompute-recs-btn" class="btn btn-ghost" style="flex:1;justify-content:center" onclick="panelRefreshRecs('recs')" title="Recompute recommendations from stored neighbors (Phase 2)">◈ Recompute Recs</button>
          </div>
          <div id="panel-recs-log-container"></div>
        </div>
      </div>

      <!-- Communication -->
      <div class="panel-section">
        <div class="panel-section-title">Communication</div>
        <div class="panel-actions">
          <div class="panel-action-row">
            <button class="btn btn-ghost" style="flex:1;justify-content:center" onclick="toast('Send Email — coming soon','info')">Send Email</button>
            <button class="btn btn-ghost" style="flex:1;justify-content:center" onclick="toast('App Notification — coming soon','info')">Send Notification</button>
          </div>
          <div class="panel-action-row">
            <button class="btn btn-ghost" style="flex:1;justify-content:center" onclick="toast('SMS — coming soon','info')">Send SMS</button>
          </div>
        </div>
      </div>

      <!-- Danger Zone -->
      <div class="panel-section danger-zone">
        <div class="panel-section-title">Danger Zone</div>
        <div class="panel-actions">
          <div class="panel-action-row">
            ${isBannedPanel
              ? `<button class="btn btn-success" style="flex:1;justify-content:center" onclick="panelUnban()">Unban</button>`
              : active
                ? `<button class="btn btn-danger" style="flex:1;justify-content:center" onclick="panelSuspend()">Suspend Account</button>`
                : `<button class="btn btn-success" style="flex:1;justify-content:center" onclick="panelUnsuspend()">Unsuspend Account</button>`
            }
            <button class="btn btn-danger" style="flex:1;justify-content:center" onclick="panelDelete()">Delete Account</button>
          </div>
          <div class="panel-action-row" style="margin-top:8px">
            ${isBannedPanel
              ? `<button class="btn btn-danger" style="flex:1;justify-content:center;background:rgba(60,0,0,.35);border-color:rgba(100,40,40,.3);opacity:.5;cursor:not-allowed" disabled>🚫 Permanently Ban</button>`
              : `<button class="btn btn-danger" style="flex:1;justify-content:center;background:rgba(120,0,0,.7);border-color:rgba(255,80,80,.3)" onclick="panelBan()">🚫 Permanently Ban</button>`
            }
          </div>
          <div class="panel-action-row" style="margin-top:8px">
            <button class="btn" style="flex:1;justify-content:center;background:transparent;border:1px solid rgba(229,115,115,.5);color:#e57373" onclick="panelClearRatings()">Clear All Ratings</button>
            <button class="btn" style="flex:1;justify-content:center;background:transparent;border:1px solid rgba(229,115,115,.5);color:#e57373" onclick="panelClearReviews()">Clear All Reviews</button>
          </div>
        </div>
      </div>
    </div>

    <!-- Mod Log tab -->
    <div class="panel-tab-content" id="ptab-modlog">
      <div id="modlog-body"><div class="loading"><div class="spinner"></div> Loading…</div></div>
    </div>
  `;
}

  // Load matrix status badge asynchronously after panel renders
  if (u.id) loadPanelMatrixStatus(u.id);
}

function switchPanelTab(tab, el) {
  document.querySelectorAll('.panel-tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.panel-tab-content').forEach(t => t.classList.remove('active'));
  el.classList.add('active');
  document.getElementById(`ptab-${tab}`).classList.add('active');
  if (tab === 'modlog' && _panelUser) loadModLog(_panelUser.id);
}

async function loadModLog(userId) {
  const el = document.getElementById('modlog-body');
  if (!el) return;
  el.innerHTML = '<div class="loading"><div class="spinner"></div> Loading…</div>';
  try {
    const rows = await api(`/admin/users/${userId}/moderation-log`);
    if (!rows || !rows.length) {
      el.innerHTML = '<div class="empty" style="padding:32px;text-align:center">No moderation history</div>';
      return;
    }
    el.innerHTML = `
      <table class="mod-log-table">
        <thead><tr><th>Timestamp</th><th>Action</th><th>Reason</th><th>By</th></tr></thead>
        <tbody>
          ${rows.map(r => `
            <tr>
              <td style="white-space:nowrap;color:var(--text-muted);font-size:11.5px">${formatDate(r.created_at)}</td>
              <td><span class="action-badge ab-${r.action}">${r.action.replace(/_/g,' ')}</span></td>
              <td style="color:var(--text-muted)">${esc(r.reason)}</td>
              <td style="color:var(--text-muted)">${esc(r.performed_by_username||'admin')}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>`;
  } catch (e) {
    el.innerHTML = `<div class="empty">Error: ${esc(e.message)}</div>`;
  }
}

/* ─── INLINE FIELD EDITING ───────────────────────────────────────────── */

function startFieldEdit(field) {
  if (!_panelUser) return;
  const currentVal = _panelUser[field] || '';
  const wrap = document.getElementById(`pf-${field}`);
  if (!wrap) return;

  let inputHtml;
  if (field === 'role') {
    const roles = ['user', 'moderator', 'admin'];
    inputHtml = `<select class="pf-input" id="pf-input-${field}">
      ${roles.map(r => `<option value="${r}"${currentVal===r?' selected':''}>${r}</option>`).join('')}
    </select>`;
  } else if (field === 'theme_preference') {
    const themes = ['system', 'dark', 'light'];
    inputHtml = `<select class="pf-input" id="pf-input-${field}">
      ${themes.map(t => `<option value="${t}"${currentVal===t?' selected':''}>${t.charAt(0).toUpperCase()+t.slice(1)}</option>`).join('')}
    </select>`;
  } else if (field === 'bio') {
    inputHtml = `<textarea class="pf-input" id="pf-input-${field}" rows="3">${esc(currentVal)}</textarea>`;
  } else if (field === 'pronouns') {
    const pronounOptions = ['he/his', 'she/her', 'they/them', 'ze/zir', 'any', 'prefer not to say'];
    inputHtml = `<div style="flex:1">
    <input class="pf-input" id="pf-input-${field}" type="text" value="${esc(currentVal)}" style="margin-bottom:6px" />
    <div class="pronoun-chips">
      ${pronounOptions.map(p => `<span class="pronoun-chip${currentVal===p?' active':''}" onclick="selectPronoun('${esc(p)}')">${esc(p)}</span>`).join('')}
    </div>
  </div>`;
  } else if (field === 'birthdate') {
    inputHtml = `<input class="pf-input" id="pf-input-${field}" type="date" value="${esc(currentVal)}" />`;
  } else if (field === 'timezone') {
    const tzHtml = buildTimezoneSelectHtml(`pf-input-${field}`, currentVal || 'America/New_York');
    inputHtml = `<div style="flex:1">${tzHtml}</div>`;
  } else {
    inputHtml = `<input class="pf-input" id="pf-input-${field}" type="text" value="${esc(currentVal)}" />`;
  }

  wrap.innerHTML = `${inputHtml}<div class="pf-edit-actions">
    <button class="pf-save-btn" id="pf-save-${field}" onclick="saveFieldEdit('${field}')">✓</button>
    <button class="pf-cancel-btn" onclick="renderUserPanel(_panelUser)">×</button>
  </div>`;

  const input = document.getElementById(`pf-input-${field}`);
  input?.focus();
  if (field !== 'bio' && field !== 'role' && field !== 'pronouns') {
    input?.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); saveFieldEdit(field); }
      if (e.key === 'Escape') renderUserPanel(_panelUser);
    });
  } else if (field === 'bio') {
    input?.addEventListener('keydown', e => {
      if (e.key === 'Escape') renderUserPanel(_panelUser);
    });
  }
  if (field === 'pronouns') {
    input?.addEventListener('keydown', e => {
      if (e.key === 'Escape') renderUserPanel(_panelUser);
    });
  }
}

async function saveFieldEdit(field) {
  if (!_panelUser) return;
  const userId = _panelUser.id;
  const input = document.getElementById(`pf-input-${field}`);
  if (!input) return;
  const newVal = input.value.trim();
  const originalVal = _panelUser[field] || '';

  if (newVal === originalVal) { renderUserPanel(_panelUser); return; }

  const saveBtn = document.getElementById(`pf-save-${field}`);
  if (saveBtn) saveBtn.disabled = true;
  input.disabled = true;

  try {
    const res = await api(`/admin/users/${_panelUser.id}/edit`, {
      method: 'PUT',
      body: JSON.stringify({ field, value: newVal }),
    });

    const oldUsername = _panelUser.username;

    // Merge the full updated user object from the API response into _panelUser.
    // This ensures all fields (not just the edited one) reflect actual DB state.
    _panelUser = { ..._panelUser, ...res };

    // Sync admin cache
    const cacheKey = Object.keys(_userAdminCache).find(k => _userAdminCache[k].id === _panelUser.id);
    if (cacheKey) _userAdminCache[cacheKey] = { ..._userAdminCache[cacheKey], ...res };

    // If username changed, re-key the cache entry
    if (field === 'username' && cacheKey && cacheKey !== newVal) {
      _userAdminCache[newVal] = _userAdminCache[cacheKey];
      delete _userAdminCache[cacheKey];
      if (document.getElementById('panel-title')) {
        document.getElementById('panel-title').textContent = newVal;
      }
    }

    const label = field.replace(/_/g, ' ');
    toast(`${label.charAt(0).toUpperCase() + label.slice(1)} updated`, 'success');
    renderUserPanel(_panelUser);
    updateCurrentPageRow(userId);
  } catch (e) {
    console.error('saveFieldEdit error:', e);
    toast(`Failed to update ${field}: ${e.message}`, 'error');
    input.disabled = false;
    if (saveBtn) saveBtn.disabled = false;
  }
}

async function panelChangeRole() {
  if (!_panelUser) return;
  const uid = _panelUser.id;
  const role = _panelUser.role || 'user';
  showReasonModal({
    title: `Change role to "${role}"`,
    chipKey: 'role_change',
    minLen: 5,
    destructive: false,
    onConfirm: async (reason) => {
      try {
        const res = await api(`/admin/users/${_panelUser.id}/role`, {
          method: 'PUT',
          body: JSON.stringify({ role, reason }),
        });
        console.log('panelChangeRole:', res);
        if (_userAdminCache[_panelUser.username]) _userAdminCache[_panelUser.username].role = role;
        _panelUser.role = role;
        toast(`Role updated to ${role}`, 'success');
        renderUserPanel(_panelUser);
        updateCurrentPageRow(uid);
      } catch (e) {
        console.error('panelChangeRole error:', e);
        toast(`Role change failed: ${e.message}`, 'error');
      }
    },
  });
}

async function panelVerifyEmail() {
  if (!_panelUser) return;
  if (_panelUser.email_verified === true) { toast('Email is already verified', 'info'); return; }
  const uid = _panelUser.id;
  showReasonModal({
    title: 'Manually verify email',
    chipKey: 'verify',
    minLen: 5,
    destructive: false,
    onConfirm: async (reason) => {
      console.log('panelVerifyEmail: user_id =', _panelUser.id);
      try {
        const res = await api(`/admin/users/${_panelUser.id}/verify-email`, {
          method: 'PUT',
          body: JSON.stringify({ reason }),
        });
        console.log('panelVerifyEmail:', res);
        _panelUser.email_verified = true;
        if (_userAdminCache[_panelUser.username]) _userAdminCache[_panelUser.username].email_verified = true;
        toast('Email verified', 'success');
        renderUserPanel(_panelUser);
        updateCurrentPageRow(uid);
      } catch (e) {
        console.error('panelVerifyEmail error:', e);
        toast(`Verify failed: ${e.message}`, 'error');
      }
    },
  });
}

async function panelResetPassword() {
  if (!_panelUser) return;
  try {
    await api('/auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify({ email: _panelUser.email }),
    });
    toast('Password reset email sent', 'success');
  } catch (e) { toast(e.message, 'error'); }
}

let _panelRecsTimer = null;

function _panelLogTs() {
  const n = new Date();
  return [n.getHours(), n.getMinutes(), n.getSeconds()]
    .map(v => String(v).padStart(2, '0')).join(':');
}

function _panelRecLog(text, type = 'info') {
  const body = document.getElementById('panel-recs-log-body');
  if (!body) return;
  const line = document.createElement('div');
  line.className = `rec-log-line ${type}`;
  line.textContent = text;
  body.appendChild(line);
  body.scrollTop = body.scrollHeight;
}

function _panelRecLogTs(text, type = 'info') {
  _panelRecLog(`[${_panelLogTs()}] ${text}`, type);
}

async function _copyPanelRecLog() {
  const body = document.getElementById('panel-recs-log-body');
  const btn  = document.getElementById('panel-recs-log-copy-btn');
  if (!body || !btn) return;
  const text = Array.from(body.querySelectorAll('.rec-log-line'))
    .map(el => el.textContent).join('\n');
  try {
    await navigator.clipboard.writeText(text);
    btn.textContent = '✓ Copied';
    setTimeout(() => { btn.textContent = '📋'; }, 1800);
  } catch {
    btn.textContent = '✗';
    setTimeout(() => { btn.textContent = '📋'; }, 1800);
  }
}

function _closePanelRecLog() {
  const cons = document.getElementById('panel-recs-log-console');
  if (cons) cons.style.display = 'none';
  if (_panelRecsTimer) { clearInterval(_panelRecsTimer); _panelRecsTimer = null; }
}

async function panelRefreshRecs() {
  if (!_panelUser) return;
  const btn = document.getElementById('recs-refresh-user-btn');
  const username = _panelUser.username;

  console.log('═══════════════════════════════════════');
  console.log(`[Users] ▶ REFRESH RECS — user: ${username} (${_panelUser.id})`);
  console.log('═══════════════════════════════════════');

  // Inject log console if not yet present
  let cons = document.getElementById('panel-recs-log-console');
  if (!cons) {
    const container = document.getElementById('panel-recs-log-container');
    if (container) {
      container.innerHTML = `
        <div id="panel-recs-log-console" class="rec-log-console" style="margin-top:10px">
          <div class="rec-log-header">
            <span id="panel-recs-log-title">Rec Engine — ${esc(username)}</span>
            <div class="rec-log-actions">
              <button id="panel-recs-log-copy-btn" class="rec-log-btn" onclick="_copyPanelRecLog()" title="Copy log">📋</button>
              <button class="rec-log-btn" onclick="_closePanelRecLog()" title="Close">×</button>
            </div>
          </div>
          <div id="panel-recs-log-body" class="rec-log-body" style="height:200px"></div>
        </div>`;
      cons = document.getElementById('panel-recs-log-console');
    }
  } else {
    // Reset for re-run
    const body = document.getElementById('panel-recs-log-body');
    if (body) body.innerHTML = '';
    const title = document.getElementById('panel-recs-log-title');
    if (title) title.textContent = `Rec Engine — ${username}`;
    cons.style.display = 'block';
  }

  if (_panelRecsTimer) { clearInterval(_panelRecsTimer); _panelRecsTimer = null; }

  btn.disabled = true;
  btn.textContent = 'Refreshing…';

  _panelRecLogTs(`▶ Refresh queued for ${username}…`, 'info');

  try {
    const res = await api(`/admin/recommendations/refresh-user/${_panelUser.id}`, { method: 'POST' });
    console.log('[Users] ▶ REFRESH RECS response:', res);

    const job_id = res.job_id;
    _panelRecLogTs('○ Waiting for worker…', 'info');

    _panelRecsTimer = setInterval(async () => {
      console.log(`[Users] ▶ REFRESH RECS POLL — job_id: ${job_id}`);
      try {
        const s = await api(`/admin/recommendations/refresh-status/${job_id}`);
        if (!s) return;
        console.log('[Users] ▶ REFRESH RECS STATUS:', JSON.stringify(s));

        if (s.status === 'running' && s.processed === 0) {
          // Still waiting — no new log line needed (already logged "Waiting")
        }

        if (s.results && s.results.length > 0) {
          const r = s.results[0];
          if (r && !cons._resultLogged) {
            cons._resultLogged = true;
            _panelRecLogTs('── Running recommendation engine…', 'info');
            if (r.status === 'ok') {
              _panelRecLogTs(
                `✓ Complete — ${r.recs_stored} recs (${r.neighbor_recs} neighbor, ${r.genre_affinity_recs} genre affinity, ${r.neighbor_count} neighbors found)`,
                'ok'
              );
            } else {
              _panelRecLogTs(`✗ ERROR: ${r.error}`, 'error');
            }
          }
        }

        if (s.status === 'complete') {
          clearInterval(_panelRecsTimer);
          _panelRecsTimer = null;
          btn.disabled = false;
          btn.textContent = 'Refresh Recs';
        }
      } catch (e) {
        console.error('[Users] ✗ REFRESH RECS POLL error:', e);
        _panelRecLogTs(`✗ Poll error: ${e.message}`, 'error');
      }
    }, 1000);

  } catch (e) {
    console.error('[Users] ✗ REFRESH RECS error:', e);
    _panelRecLogTs(`✗ Failed: ${e.message}`, 'error');
    btn.disabled = false;
    btn.textContent = 'Refresh Recs';
  }
}

function openSetPasswordModal() {
  if (!_panelUser) return;
  const input = document.getElementById('set-password-input');
  input.value = '';
  input.type = 'password';
  document.getElementById('set-password-eye').textContent = '👁';
  document.getElementById('set-password-btn').disabled = true;
  const overlay = document.getElementById('set-password-overlay');
  overlay.style.display = 'flex';
  setTimeout(() => input.focus(), 60);
}

function closeSetPasswordModal() {
  document.getElementById('set-password-overlay').style.display = 'none';
}

function toggleSetPasswordVisibility() {
  const input = document.getElementById('set-password-input');
  const eye = document.getElementById('set-password-eye');
  if (input.type === 'password') { input.type = 'text'; eye.textContent = '🙈'; }
  else { input.type = 'password'; eye.textContent = '👁'; }
}

async function submitSetPassword() {
  if (!_panelUser) return;
  const uid = _panelUser.id;
  if (!uid) { toast('No user selected', 'error'); return; }
  const password = document.getElementById('set-password-input').value.trim();
  if (password.length < 8) return;
  const btn = document.getElementById('set-password-btn');
  btn.disabled = true;
  btn.textContent = 'Saving…';
  console.log(`[SetPassword] PUT /admin/users/${uid}/password`);
  try {
    await api(`/admin/users/${uid}/password`, {
      method: 'PUT',
      body: JSON.stringify({ password }),
    });
    toast('Password updated successfully', 'success');
    closeSetPasswordModal();
  } catch (e) {
    console.error('[SetPassword] error:', e.message);
    toast(`Failed: ${e.message}`, 'error');
    btn.disabled = false;
    btn.textContent = 'Set Password';
  }
}

async function panelSuspend() {
  if (!_panelUser) return;
  const uid = _panelUser.id;
  showReasonModal({
    title: `Suspend @${_panelUser.username}`,
    chipKey: 'suspend',
    minLen: 5,
    destructive: true,
    onConfirm: async (reason) => {
      console.log('panelSuspend: user_id =', _panelUser.id);
      try {
        const res = await api(`/admin/users/${_panelUser.id}/suspend`, {
          method: 'PUT',
          body: JSON.stringify({ reason }),
        });
        console.log('panelSuspend:', res);
        _panelUser.is_active = false;
        if (_userAdminCache[_panelUser.username]) _userAdminCache[_panelUser.username].is_active = false;
        toast(`${_panelUser.username} suspended`, 'success');
        renderUserPanel(_panelUser);
        updateCurrentPageRow(uid);
      } catch (e) {
        console.error('panelSuspend error:', e);
        toast(`Suspend failed: ${e.message}`, 'error');
      }
    },
  });
}

async function panelUnsuspend() {
  if (!_panelUser) return;
  const uid = _panelUser.id;
  showReasonModal({
    title: `Unsuspend @${_panelUser.username}`,
    chipKey: 'unsuspend',
    minLen: 5,
    destructive: false,
    onConfirm: async (reason) => {
      try {
        const res = await api(`/admin/users/${_panelUser.id}/unsuspend`, {
          method: 'PUT',
          body: JSON.stringify({ reason }),
        });
        console.log('panelUnsuspend:', res);
        _panelUser.is_active = true;
        if (_userAdminCache[_panelUser.username]) _userAdminCache[_panelUser.username].is_active = true;
        toast(`${_panelUser.username} unsuspended`, 'success');
        renderUserPanel(_panelUser);
        updateCurrentPageRow(uid);
      } catch (e) {
        console.error('panelUnsuspend error:', e);
        toast(`Unsuspend failed: ${e.message}`, 'error');
      }
    },
  });
}

async function panelUnban() {
  if (!_panelUser) return;
  const banId = _panelUser._banId;
  if (!banId) { toast('Ban ID not found — cannot unban from panel', 'error'); return; }
  showReasonModal({
    title: `Unban @${_panelUser.username}`,
    chipKey: 'unsuspend',
    minLen: 5,
    destructive: false,
    onConfirm: async (reason) => {
      try {
        await api(`/admin/banned-users/${banId}`, {
          method: 'DELETE',
          body: JSON.stringify({ reason, reactivate: true }),
        });
        toast(`${_panelUser.username} unbanned`, 'success');
        _panelUser._panelStatus = null;
        _panelUser._banId = null;
        _panelUser.is_active = true;
        renderUserPanel(_panelUser);
        loadBannedUsers();
      } catch (e) {
        console.error('panelUnban error:', e);
        toast(`Unban failed: ${e.message}`, 'error');
      }
    },
  });
}

async function panelDelete() {
  if (!_panelUser) return;
  const uid = _panelUser.id;
  showReasonModal({
    title: `Delete @${_panelUser.username}`,
    chipKey: 'delete',
    minLen: 5,
    destructive: true,
    onConfirm: async (reason) => {
      try {
        await api(`/admin/users/${_panelUser.id}`, {
          method: 'DELETE',
          body: JSON.stringify({ reason }),
        });
        toast(`${_panelUser.username} deleted`, 'success');
        closeUserPanel();
        removeCurrentPageRow(uid);
      } catch (e) {
        console.error('panelDelete error:', e);
        toast(`Delete failed: ${e.message}`, 'error');
      }
    },
  });
}

/* ─── BAN ────────────────────────────────────────────────────────────── */

async function panelBan() {
  if (!_panelUser) return;
  const uid  = _panelUser.id;
  const uname = _panelUser.username;

  // Custom ban modal via reason modal + checkboxes injected after open
  showReasonModal({
    title: `Permanently Ban @${uname}`,
    chipKey: 'suspend',
    minLen: 5,
    destructive: true,
    onConfirm: async (reason) => {
      const banEmail = document.getElementById('ban-opt-email')?.checked ?? true;
      const banIp    = document.getElementById('ban-opt-ip')?.checked    ?? true;
      try {
        await api(`/admin/users/${uid}/ban`, {
          method: 'POST',
          body: JSON.stringify({ reason, ban_email: banEmail, ban_ip: banIp }),
        });
        _panelUser.is_active = false;
        if (_userAdminCache[uname]) _userAdminCache[uname].is_active = false;
        toast(`${uname} permanently banned`, 'success');
        renderUserPanel(_panelUser);
        updateCurrentPageRow(uid);
      } catch (e) {
        toast(`Ban failed: ${e.message}`, 'error');
      }
    },
  });

  // Inject ban option checkboxes into reason modal after it opens
  setTimeout(() => {
    const modal = document.getElementById('reason-modal-box');
    if (!modal) return;
    const existing = modal.querySelector('.ban-opts');
    if (existing) return;
    const wrap = document.createElement('div');
    wrap.className = 'ban-opts';
    wrap.style.cssText = 'margin: 8px 0 0; display:flex; gap:16px; font-size:13px; color:var(--text-muted)';
    wrap.innerHTML = `
      <label style="display:flex;align-items:center;gap:6px;cursor:pointer">
        <input type="checkbox" id="ban-opt-email" checked style="width:auto;padding:0;margin:0;border:none;background:none"> Ban email
      </label>
      <label style="display:flex;align-items:center;gap:6px;cursor:pointer">
        <input type="checkbox" id="ban-opt-ip" checked style="width:auto;padding:0;margin:0;border:none;background:none"> Ban IP
      </label>`;
    const textarea = modal.querySelector('textarea');
    if (textarea) textarea.parentNode.insertBefore(wrap, textarea);
  }, 50);
}

/* ─── CLEAR RATINGS / REVIEWS ───────────────────────────────────────── */

async function panelClearRatings() {
  if (!_panelUser) return;
  const uname = _panelUser.username;
  showConfirm(
    `Clear All Ratings for @${uname}`,
    `This will permanently delete every rating @${uname} has made. This cannot be undone.`,
    async () => {
      try {
        const res = await api(`/admin/users/${_panelUser.id}/ratings`, { method: 'DELETE' });
        toast(res.message || `Ratings cleared for ${uname}`, 'success');
      } catch (e) {
        toast(`Failed: ${e.message}`, 'error');
      }
    }
  );
}

async function panelClearReviews() {
  if (!_panelUser) return;
  const uname = _panelUser.username;
  showConfirm(
    `Clear All Reviews for @${uname}`,
    `This will permanently delete every review @${uname} has written. This cannot be undone.`,
    async () => {
      try {
        const res = await api(`/admin/users/${_panelUser.id}/reviews`, { method: 'DELETE' });
        toast(res.message || `Reviews cleared for ${uname}`, 'success');
      } catch (e) {
        toast(`Failed: ${e.message}`, 'error');
      }
    }
  );
}

/* ─── BANNED USERS SECTION ───────────────────────────────────────────── */

let _bannedPage = 1;
const _bannedPageSize = 30;
let _bannedTotal = 0;

function onProblemSearchInput() {
  const val = document.getElementById('problem-search')?.value || '';
  const btn = document.getElementById('problem-search-clear');
  if (btn) btn.classList.toggle('visible', val.length > 0);
}

function clearProblemSearch() {
  const input = document.getElementById('problem-search');
  if (input) input.value = '';
  onProblemSearchInput();
  _bannedPage = 1;
  loadBannedUsers();
}

async function loadBannedUsers() {
  const wrap = document.getElementById('banned-table-wrap');
  if (!wrap) return;
  wrap.innerHTML = `<div class="loading"><div class="spinner"></div> Loading…</div>`;
  const q = (document.getElementById('problem-search')?.value || '').trim();
  let url = `/admin/banned-users?page=${_bannedPage}&page_size=${_bannedPageSize}`;
  if (q) url += `&q=${encodeURIComponent(q)}`;
  console.log('[loadBannedUsers] fetching', url, '| token:', (window.adminState?.token || state.token) ? '✓' : '✗ MISSING');
  try {
    const raw = await api(url);
    console.log('[loadBannedUsers] response:', raw);
    if (!raw) return;
    let rows = raw.banned || [];
    // Client-side filter if backend doesn't support q for this endpoint yet
    if (q) {
      const lq = q.toLowerCase();
      rows = rows.filter(b =>
        (b.username || '').toLowerCase().includes(lq) ||
        (b.email    || '').toLowerCase().includes(lq) ||
        (b.first_name || '').toLowerCase().includes(lq) ||
        (b.last_name  || '').toLowerCase().includes(lq)
      );
    }
    _bannedTotal = raw.total || 0;
    renderBannedTable(rows);
  } catch (e) {
    console.error('[loadBannedUsers] error:', e);
    wrap.innerHTML = `<div class="empty">Error: ${esc(e.message)}</div>`;
  }
}

function renderBannedTable(rows) {
  const wrap = document.getElementById('banned-table-wrap');
  if (!rows.length) {
    wrap.innerHTML = `<div class="empty">No banned or suspended users.</div>`;
    return;
  }
  const totalPages = Math.ceil(_bannedTotal / _bannedPageSize);
  wrap.innerHTML = `
    <div class="table-wrap">
      <table>
        <thead><tr>
          <th>Type</th>
          <th>User</th>
          <th>Email</th>
          <th>Reason</th>
          <th>Action by</th>
          <th>Date</th>
          <th></th>
        </tr></thead>
        <tbody>
          ${rows.map(b => {
            const isBanned = b.type === 'banned';
            const rowBg = isBanned
              ? 'background:rgba(220,53,69,0.12)'
              : 'background:rgba(255,182,193,0.15)';
            const badge = isBanned
              ? '<span class="badge" style="background:rgba(220,53,69,0.35);color:#ff8a8a;font-size:10px">banned</span>'
              : '<span class="badge badge-suspended" style="font-size:10px">suspended</span>';

            const displayName = b.username || b.email || 'Unknown';
            const subName = (b.first_name || b.last_name)
              ? `<div style="color:var(--text-muted);font-size:11px;margin-top:2px">${esc([b.first_name, b.last_name].filter(Boolean).join(' '))}</div>`
              : '';
            const hasUserId = !!b.user_id;
            const rowClick = hasUserId
              ? `style="${rowBg};cursor:pointer" onclick="openProblemUserPanel(event, this)"`
              : `style="${rowBg}"`;
            const dataAttrs = hasUserId
              ? `data-username="${esc(b.username || '')}" data-userid="${esc(b.user_id || '')}" data-ban-type="${isBanned ? 'banned' : 'suspended'}" data-ban-id="${esc(b.id || '')}"`
              : '';

            const actionBtn = isBanned
              ? `<button class="btn btn-ghost btn-sm" onclick="event.stopPropagation();unbanEntry('${esc(b.id)}', '${esc(b.email || '')}')">Unban</button>`
              : `<button class="btn btn-ghost btn-sm" onclick="event.stopPropagation();unsuspendEntry('${esc(b.user_id)}', '${esc(b.username || '')}')">Unsuspend</button>`;
            const modLogBtn = hasUserId
              ? `<button class="btn btn-ghost btn-sm" style="margin-left:4px" onclick="event.stopPropagation();openRowModLog('${esc(b.user_id)}', '${esc(displayName)}')">Mod Log</button>`
              : '';

            return `
            <tr ${rowClick} ${dataAttrs}>
              <td>${badge}</td>
              <td><div style="font-weight:600">${esc(displayName)}</div>${subName}</td>
              <td style="color:var(--text-muted)">${esc(b.email || '—')}</td>
              <td style="color:var(--text-muted);max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${esc(b.reason || '')}">${esc(b.reason || '—')}</td>
              <td style="color:var(--text-muted)">${esc(b.banned_by_username || '—')}</td>
              <td style="color:var(--text-muted);font-size:12px;white-space:nowrap">${formatDate(b.created_at)}</td>
              <td style="white-space:nowrap" onclick="event.stopPropagation()">${actionBtn}${modLogBtn}</td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>
    ${totalPages > 1 ? `
    <div class="pagination" style="justify-content:center;padding:16px 0">
      <button class="btn btn-ghost btn-sm" ${_bannedPage <= 1 ? 'disabled' : ''} onclick="_bannedPage--;loadBannedUsers()">← Prev</button>
      <span style="color:var(--text-muted);font-size:13px">Page ${_bannedPage} / ${totalPages}</span>
      <button class="btn btn-ghost btn-sm" ${_bannedPage >= totalPages ? 'disabled' : ''} onclick="_bannedPage++;loadBannedUsers()">Next →</button>
    </div>` : ''}`;
}

async function unbanEntry(banId, email) {
  showReasonModal({
    title: `Lift ban${email ? ` for ${email}` : ''}`,
    chipKey: 'unsuspend',
    onConfirm: async (reason) => {
      try {
        await api(`/admin/banned-users/${banId}`, {
          method: 'DELETE',
          body: JSON.stringify({ reason, reactivate: true }),
        });
        toast('Ban lifted', 'success');
        loadBannedUsers();
      } catch (e) {
        toast(`Failed: ${e.message}`, 'error');
      }
    },
  });
}

async function unsuspendEntry(userId, username) {
  showReasonModal({
    title: `Unsuspend ${username || 'user'}`,
    chipKey: 'unsuspend',
    onConfirm: async (reason) => {
      try {
        await api(`/admin/users/${userId}/unsuspend`, {
          method: 'PUT',
          body: JSON.stringify({ reason }),
        });
        toast(`${username || 'User'} unsuspended`, 'success');
        loadBannedUsers();
      } catch (e) {
        toast(`Failed: ${e.message}`, 'error');
      }
    },
  });
}

/* ─── PROBLEM USERS PANEL / MOD LOG MODAL ───────────────────────────── */

function openProblemUserPanel(event, row) {
  const username = row.dataset.username;
  const userId   = row.dataset.userid;
  if (!userId) return;
  if (username) {
    const banType = row.dataset.banType;
    const banId   = row.dataset.banId;
    openUserPanel(username, { status: banType, ban_id: banId });
  }
}

async function openRowModLog(userId, displayName) {
  const overlay = document.getElementById('modlog-modal-overlay');
  const title   = document.getElementById('modlog-modal-title');
  const body    = document.getElementById('modlog-modal-body');
  title.textContent = `${displayName}'s Mod Log`;
  body.innerHTML = '<div class="loading" style="padding:32px;text-align:center"><div class="spinner"></div></div>';
  overlay.style.display = 'flex';

  if (!userId) {
    body.innerHTML = '<div class="empty" style="padding:32px;text-align:center">No mod log available — user record not found.</div>';
    return;
  }

  try {
    const rows = await api(`/admin/users/${userId}/moderation-log`);
    if (!rows || !rows.length) {
      body.innerHTML = '<div class="empty" style="padding:32px;text-align:center">No moderation history.</div>';
      return;
    }
    body.innerHTML = `
      <table class="mod-log-table" style="width:100%">
        <thead><tr><th>Date</th><th>Action</th><th>Reason</th><th>By</th></tr></thead>
        <tbody>
          ${rows.map(r => `
            <tr>
              <td style="white-space:nowrap;color:var(--text-muted);font-size:11.5px">${formatDate(r.created_at)}</td>
              <td><span class="action-badge ab-${r.action}">${r.action.replace(/_/g,' ')}</span></td>
              <td style="color:var(--text-muted)">${esc(r.reason)}</td>
              <td style="color:var(--text-muted)">${esc(r.performed_by_username || 'admin')}</td>
            </tr>`).join('')}
        </tbody>
      </table>`;
  } catch (e) {
    body.innerHTML = `<div class="empty" style="padding:32px;text-align:center">Error: ${esc(e.message)}</div>`;
  }
}

function closeModlogModal() {
  document.getElementById('modlog-modal-overlay').style.display = 'none';
}

/* ─── STAT SUB-PANELS ────────────────────────────────────────────────── */

async function openStatPanel(type) {
  if (!_panelUser) return;
  const u = _panelUser;
  document.getElementById('panel-body').innerHTML = `
    <div class="sub-panel">
      <div class="sub-panel-header">
        <button class="sub-panel-back" onclick="renderUserPanel(_panelUser)">← Back</button>
        <div class="sub-panel-title">@${esc(u.username)}'s ${type}</div>
      </div>
      <div id="sub-panel-content"><div class="loading"><div class="spinner"></div></div></div>
    </div>`;
  const el = document.getElementById('sub-panel-content');
  try {
    switch (type) {
      case 'Ratings':   await _loadRatingsPanel(u, el);   break;
      case 'Reviews':   await _loadReviewsPanel(u, el);   break;
      case 'Followers': await _loadFollowersPanel(u, el); break;
      case 'Groups':    await _loadGroupsPanel(u, el);    break;
    }
  } catch (e) {
    el.innerHTML = `<div class="empty">Failed to load: ${esc(e.message)}</div>`;
  }
}

function renderStars(rating) {
  let html = '<span style="letter-spacing:1px">';
  for (let i = 1; i <= 10; i++) {
    if (rating >= i) {
      html += `<span style="color:#f5a623">★</span>`;
    } else if (rating >= i - 0.5) {
      html += `<span style="position:relative;display:inline-block">` +
              `<span style="color:var(--text-muted)">★</span>` +
              `<span style="position:absolute;left:0;top:0;color:#f5a623;width:50%;overflow:hidden;display:inline-block">★</span>` +
              `</span>`;
    } else {
      html += `<span style="color:var(--text-muted)">★</span>`;
    }
  }
  html += `<span style="color:var(--text-muted);font-size:11px;margin-left:5px">${rating}</span>`;
  html += '</span>';
  return html;
}

function _posterHtml(posterPath) {
  const POSTER_BASE = 'https://image.tmdb.org/t/p/w92';
  if (posterPath) {
    return `<img src="${POSTER_BASE}${esc(posterPath)}" style="width:40px;height:60px;object-fit:cover;border-radius:4px;flex-shrink:0" alt="" loading="lazy">`;
  }
  return `<div style="width:40px;height:60px;border-radius:4px;background:var(--bg-hover);display:flex;align-items:center;justify-content:center;font-size:20px;flex-shrink:0">🎬</div>`;
}

function _detectPageSize(el) {
  const h = el.clientHeight || 500;
  return Math.max(3, Math.min(20, Math.floor(h / 72)));
}

function _paginationHtml(page, totalPages, total, pageSize, loadFn) {
  if (totalPages <= 1) return '';
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);
  const btn = (label, targetPage, disabled) =>
    `<button class="btn" style="font-size:11px;padding:3px 8px" onclick="${loadFn}(_panelUser,document.getElementById('sub-panel-content'),${targetPage})" ${disabled ? 'disabled' : ''}>${label}</button>`;
  return `
    <div style="display:flex;flex-direction:column;align-items:center;gap:8px;padding:12px 16px;border-top:1px solid var(--border);flex-shrink:0">
      <div style="display:flex;gap:4px;align-items:center">
        ${btn('|&lt; First', 1, page === 1)}
        ${btn('&lt; Prev', page - 1, page === 1)}
        <span style="color:var(--text-muted);font-size:12px;padding:0 8px">Page ${page} of ${totalPages}</span>
        ${btn('Next &gt;', page + 1, page === totalPages)}
        ${btn('Last &gt;|', totalPages, page === totalPages)}
      </div>
      <div style="color:var(--text-muted);font-size:11px">Showing ${from}–${to} of ${total} ${loadFn.includes('Ratings') ? 'ratings' : 'reviews'}</div>
    </div>`;
}

async function _loadRatingsPanel(u, el, page = 1) {
  el.innerHTML = '<div class="loading"><div class="spinner"></div></div>';
  const pageSize = _detectPageSize(el);
  const data = await api(`/ratings/${u.username}?page=${page}&page_size=${pageSize}`);
  const items = data?.ratings || [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  if (!items.length && page === 1) { el.innerHTML = '<div class="empty">No ratings yet.</div>'; return; }

  const rows = items.map(r => {
    const title = r.movie_title || '—';
    const year = r.movie_year || '';
    return `
    <div class="sub-item" style="display:flex;align-items:center;gap:12px;padding:6px 16px;min-height:72px;border-bottom:1px solid rgba(245,240,232,.05)">
      ${_posterHtml(r.movie_poster_path)}
      <div style="flex:1;min-width:0;display:flex;flex-direction:column;justify-content:center;gap:2px">
        <div>${renderStars(r.rating ?? 0)}</div>
        <div style="font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(title)}${year ? ` <span style="color:var(--text-muted);font-weight:400">(${esc(year)})</span>` : ''}</div>
      </div>
      <div style="color:var(--text-muted);font-size:11px;flex-shrink:0;white-space:nowrap;text-align:right">${formatDate(r.rated_at)}</div>
    </div>`;
  }).join('');

  el.style.display = 'flex';
  el.style.flexDirection = 'column';
  el.innerHTML = `<div style="flex:1;overflow-y:auto">${rows}</div>` + _paginationHtml(page, totalPages, total, pageSize, '_loadRatingsPanel');
}

async function _loadReviewsPanel(u, el, page = 1) {
  el.innerHTML = '<div class="loading"><div class="spinner"></div></div>';
  const pageSize = _detectPageSize(el);
  const data = await api(`/reviews/user/${u.username}?page=${page}&page_size=${pageSize}`);
  const items = data?.reviews || [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  if (!items.length && page === 1) { el.innerHTML = '<div class="empty">No reviews yet.</div>'; return; }

  const rows = items.map(r => {
    const title = r.movie_title || '—';
    const year = r.movie_year || '';
    const excerpt = (r.content || '').slice(0, 100);
    const hasMore = (r.content || '').length > 100;
    return `
    <div class="sub-item" id="review-row-${esc(r.id)}" style="display:flex;align-items:center;gap:12px;padding:6px 16px;min-height:72px;border-bottom:1px solid rgba(245,240,232,.05)">
      ${_posterHtml(r.movie_poster_path)}
      <div style="flex:1;min-width:0;display:flex;flex-direction:column;justify-content:center;gap:2px">
        ${r.rating != null ? `<div>${renderStars(r.rating)}</div>` : ''}
        <div style="font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(title)}${year ? ` <span style="color:var(--text-muted);font-weight:400">(${esc(year)})</span>` : ''}</div>
        ${excerpt ? `<div style="color:var(--text-muted);font-size:11px;font-style:italic;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(excerpt)}${hasMore ? '…' : ''}</div>` : ''}
      </div>
      <div style="display:flex;flex-direction:column;align-items:flex-end;gap:6px;flex-shrink:0">
        <div style="color:var(--text-muted);font-size:11px;white-space:nowrap">${formatDate(r.created_at)}</div>
        <button class="btn btn-danger" style="font-size:11px;padding:2px 8px" onclick="deleteReview('${esc(r.id)}')">Delete</button>
      </div>
    </div>`;
  }).join('');

  el.style.display = 'flex';
  el.style.flexDirection = 'column';
  el.innerHTML = `<div style="flex:1;overflow-y:auto">${rows}</div>` + _paginationHtml(page, totalPages, total, pageSize, '_loadReviewsPanel');
}

async function _loadFollowersPanel(u, el) {
  // Fetch followers via admin endpoint or fall back to public profile count
  let items = [];
  try {
    const data = await api(`/admin/users/${u.id}/followers`);
    items = Array.isArray(data) ? data : (data?.followers || []);
  } catch {
    // No dedicated admin followers endpoint — show count only
    el.innerHTML = `<div class="empty" style="padding:24px 20px">
      Follower list requires a dedicated admin endpoint.<br>
      <span style="font-size:20px;font-family:'DM Serif Display',serif;margin-top:12px;display:block">${u.follower_count ?? 0}</span>
      <span style="font-size:11px;color:var(--text-muted)">FOLLOWERS</span></div>`;
    return;
  }
  if (!items.length) { el.innerHTML = '<div class="empty">No followers yet.</div>'; return; }
  el.innerHTML = items.map(f => {
    const initials = (f.username || '?').slice(0, 2).toUpperCase();
    return `
    <div class="sub-item">
      ${f.avatar_url ? `<img class="sub-avatar" src="${esc(f.avatar_url)}" alt="">` : `<div class="sub-avatar">${initials}</div>`}
      <div class="sub-item-info">
        <div class="sub-item-title">@${esc(f.username)}</div>
        <div class="sub-item-meta">${formatDate(f.followed_at || f.created_at)}</div>
      </div>
    </div>`;
  }).join('');
}

async function _loadGroupsPanel(u, el) {
  const data = await api(`/groups?user_id=${encodeURIComponent(u.id)}`);
  const items = Array.isArray(data) ? data : (data?.groups || data?.results || []);
  if (!items.length) { el.innerHTML = '<div class="empty">No groups yet.</div>'; return; }
  el.innerHTML = items.map(g => `
    <div class="sub-item">
      <div class="sub-item-info">
        <div class="sub-item-title">${esc(g.name || '—')}</div>
        <div class="sub-item-meta">
          ${g.member_count ?? '—'} members
          ${g.user_role ? ` · ${esc(g.user_role)}` : ''}
          · ${formatDate(g.joined_at || g.created_at)}
        </div>
      </div>
    </div>`).join('');
}

async function deleteReview(reviewId) {
  try {
    await api(`/admin/reviews/${reviewId}`, { method: 'DELETE' });
    const row = document.getElementById(`review-row-${reviewId}`);
    if (row) {
      row.style.transition = 'opacity 0.3s';
      row.style.opacity = '0';
      setTimeout(() => row.remove(), 300);
    }
    if (_panelUser) {
      _panelUser.total_reviews = Math.max(0, (_panelUser.total_reviews || 1) - 1);
      document.querySelectorAll('.panel-stat').forEach(el => {
        if (el.querySelector('.panel-stat-l')?.textContent === 'Reviews') {
          el.querySelector('.panel-stat-n').textContent = _panelUser.total_reviews;
        }
      });
    }
    toast('Review deleted', 'success');
  } catch (e) {
    toast(`Failed to delete review: ${e.message}`, 'error');
  }
}

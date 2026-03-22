// ═══════════════════════════════════════════════════════
// ReelMatch Editing Room — reports.js
// ═══════════════════════════════════════════════════════
console.log('[Reports] ▶ INITIALIZED'); // DEBUG

/* ─── REPORTS ────────────────────────────────────────────────────────── */
let _reportsCache = null;
let reportsSortCol = 'created_at';
let reportsSortDir = 'desc';
let reportsPage = 1;
let reportsPageSize = 0;  // 0 = not yet locked
let reportsFilter = null;
let reportsQuery = '';
let reportsTotal = 0;
let _reportsPageSizeLocked = false;
let _reportsResizeTimer = null;

const REPORT_IS_FILTERS = [
  { key: 'is:pending',   label: 'Pending',   filter: 'is:pending' },
  { key: 'is:escalated', label: 'Escalated', filter: 'is:escalated' },
  { key: 'is:resolved',  label: 'Resolved',  filter: 'is:resolved' },
  { key: 'is:dismissed', label: 'Dismissed', filter: 'is:dismissed' },
];

function updateReportSearchClear() {
  const input = document.getElementById('report-search');
  const btn = document.getElementById('report-search-clear-btn');
  if (!input || !btn) return;
  btn.classList.toggle('visible', input.value.length > 0);
}

function clearReportSearch() {
  const input = document.getElementById('report-search');
  if (input) input.value = '';
  updateReportSearchClear();
  closeReportIsFilterDropdown();
}

function closeReportIsFilterDropdown() {
  const dd = document.getElementById('report-is-filter-dropdown');
  if (dd) dd.innerHTML = '';
}

function onReportSearchInput() {
  const val = document.getElementById('report-search').value;
  const dd = document.getElementById('report-is-filter-dropdown');
  if (val.startsWith('is:')) {
    const suffix = val.slice(3).toLowerCase();
    const matches = REPORT_IS_FILTERS.filter(f => f.key.slice(3).startsWith(suffix));
    if (matches.length) {
      dd.innerHTML = `<div class="is-dropdown">${matches.map(f =>
        `<div class="is-option" onclick="applyReportIsFilter('${f.key}','${f.filter}')">${f.label}</div>`
      ).join('')}</div>`;
    } else {
      dd.innerHTML = '';
    }
  } else {
    dd.innerHTML = '';
  }
}

function onReportSearchKeydown(e) {
  if (e.key === 'Enter') searchReports();
  if (e.key === 'Escape') closeReportIsFilterDropdown();
}

function applyReportIsFilter(key, filter) {
  document.getElementById('report-search').value = key;
  closeReportIsFilterDropdown();
  reportsQuery = '';
  reportsFilter = filter;
  reportsPage = 1;
  fetchReportsPage();
}

async function loadReports() {
  reportsQuery = '';
  reportsFilter = null;
  reportsPage = 1;
  reportsSortCol = 'created_at';
  reportsSortDir = 'desc';
  clearReportSearch();
  const subtitle = document.getElementById('reports-subtitle');
  if (subtitle) subtitle.textContent = 'Pending moderation queue';
  // Calculate page_size once per session; resize listener unlocks it for recalculation
  if (!_reportsPageSizeLocked) {
    await _initReportsPageSize();
  }
  await fetchReportsPage();
}

async function searchReports() {
  closeReportIsFilterDropdown();
  const q = document.getElementById('report-search').value.trim();
  if (!q) { loadReports(); return; }
  if (q.startsWith('is:')) {
    const filterVal = q.slice(3).toLowerCase();
    const known = ['pending', 'escalated', 'resolved', 'dismissed'];
    if (!known.includes(filterVal)) { toast('Unknown filter. Try is:pending, is:escalated, is:resolved, is:dismissed', 'error'); return; }
    reportsFilter = `is:${filterVal}`;
    reportsQuery = '';
  } else {
    reportsFilter = null;
    reportsQuery = q;
  }
  reportsPage = 1;
  fetchReportsPage();
}

function _measureAndSetReportsLayout() {
  // Guard: never recalculate while locked (only the resize handler unlocks)
  if (_reportsPageSizeLocked) return;
  const wrap = document.getElementById('reports-table-wrap');
  if (!wrap) return;
  // Measure the top of the wrap relative to the viewport after paint
  const wrapTop = wrap.getBoundingClientRect().top;
  // Reserve space for pagination controls + bottom padding
  const paginationH = 52;
  const bottomPad = 20;
  const available = Math.max(200, window.innerHeight - wrapTop - paginationH - bottomPad);
  // Lock container height so page_size stays consistent across fetches
  wrap.style.height = `${available}px`;
  wrap.style.overflowY = 'auto';
  reportsPageSize = Math.max(5, Math.min(30, Math.floor(available / 56)));
  _reportsPageSizeLocked = true;
  console.log(`[Reports] page_size locked to ${reportsPageSize} (available: ${available}px, wrapTop: ${Math.round(wrapTop)}px)`);
}

function _initReportsPageSize() {
  return new Promise(resolve => {
    // Double rAF: first tick lets section become visible, second ensures layout is painted
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        _measureAndSetReportsLayout();
        resolve();
      });
    });
  });
}

async function fetchReportsPage() {
  const wrap = document.getElementById('reports-table-wrap');
  wrap.innerHTML = `<div class="loading"><div class="spinner"></div> Loading reports…</div>`;
  const params = new URLSearchParams({
    page: reportsPage,
    page_size: reportsPageSize,
    sort_by: reportsSortCol,
    sort_dir: reportsSortDir,
  });
  if (reportsFilter) params.set('filter', reportsFilter);
  if (reportsQuery) params.set('q', reportsQuery);
  try {
    const data = await api(`/admin/reports?${params}`);
    if (!data) return;
    _reportsCache = data.reports;
    reportsTotal = data.total;
    renderReportsTable(data.reports, data.total);
  } catch (e) {
    wrap.innerHTML = `<div class="empty">Error: ${esc(e.message)}</div>`;
    toast(e.message, 'error');
  }
}

function setReportsSortCol(col) {
  if (reportsSortCol === col) {
    reportsSortDir = reportsSortDir === 'asc' ? 'desc' : 'asc';
  } else {
    reportsSortCol = col;
    reportsSortDir = col === 'created_at' ? 'desc' : 'asc';
  }
  reportsPage = 1;
  fetchReportsPage();
}

function reportsSortIcon(col) {
  if (reportsSortCol !== col) return '<span style="opacity:.3;margin-left:4px">↕</span>';
  return reportsSortDir === 'asc'
    ? '<span style="margin-left:4px">↑</span>'
    : '<span style="margin-left:4px">↓</span>';
}

function reportStatusBadge(status) {
  const cls = { pending: 'badge-pending', dismissed: 'badge-user', resolved: 'badge-verified', escalated: 'badge-suspended' };
  return `<span class="badge ${cls[status] || 'badge-pending'}">${esc(status)}</span>`;
}

function renderReportsTable(reports, total) {
  const wrap = document.getElementById('reports-table-wrap');
  const totalPages = Math.ceil((total || 0) / reportsPageSize) || 1;
  if (!reports || !reports.length) {
    wrap.innerHTML = `<div class="empty" style="padding:40px;text-align:center;color:var(--text-muted)">✓ No reports</div>`;
    return;
  }
  const thStyle = 'cursor:pointer;user-select:none;white-space:nowrap';
  wrap.innerHTML = `
    <div class="table-wrap">
      <table>
        <thead><tr>
          <th style="${thStyle}" onclick="setReportsSortCol('content_type')">Type${reportsSortIcon('content_type')}</th>
          <th style="${thStyle}" onclick="setReportsSortCol('offender_username')">Offender${reportsSortIcon('offender_username')}</th>
          <th style="${thStyle}" onclick="setReportsSortCol('reporter_username')">Reporter${reportsSortIcon('reporter_username')}</th>
          <th>Content Preview</th>
          <th style="${thStyle}" onclick="setReportsSortCol('reason')">Reason${reportsSortIcon('reason')}</th>
          <th>Status</th>
          <th style="${thStyle}" onclick="setReportsSortCol('created_at')">Date${reportsSortIcon('created_at')}</th>
        </tr></thead>
        <tbody>
          ${reports.map(r => {
            const isHarassment = (r.reason || '').toLowerCase() === 'harassment';
            const rowBg = isHarassment ? 'background:rgba(245,158,11,0.15);' : '';
            const reasonCell = isHarassment
              ? `<span style="background:rgba(245,158,11,0.2);color:#d97706;font-size:10px;padding:2px 6px;border-radius:10px;font-weight:600">⚠ Harassment</span>`
              : esc(r.reason);
            return `
            <tr id="report-row-${esc(r.id)}" style="cursor:pointer;${rowBg}" onclick="openReportPanel('${esc(r.id)}')">
              <td><span class="badge badge-pending">${esc(r.content_type)}</span></td>
              <td><strong>${esc(r.offender_username || '—')}</strong></td>
              <td style="color:var(--text-muted)">${esc(r.reporter_username || '—')}</td>
              <td style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--text-muted);font-size:12px">
                ${esc(r.content_preview || '—')}
              </td>
              <td>${reasonCell}</td>
              <td>${reportStatusBadge(r.status)}</td>
              <td style="font-size:12px;color:var(--text-muted);white-space:nowrap">${formatDate(r.created_at)}</td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>`;
  renderReportsPagination(total);
}

function renderReportsPagination(total) {
  let el = document.getElementById('reports-pagination');
  if (!el) {
    el = document.createElement('div');
    el.id = 'reports-pagination';
    document.getElementById('reports-table-wrap').after(el);
  }
  const ps    = reportsPageSize || 20;
  const page  = reportsPage;
  const pages = Math.ceil(total / ps) || 1;

  if (total <= ps) { el.innerHTML = ''; return; }

  const from = (page - 1) * ps + 1;
  const to   = Math.min(page * ps, total);

  el.innerHTML = `
    <div class="pagination-wrap">
      <span class="pg-count">Showing ${from}–${to} of ${total} reports</span>
      <div class="pg-controls">
        <button class="pg-btn" ${page===1?'disabled':''} onclick="reportsGoToPage(1)" title="First">|&lt;</button>
        <button class="pg-btn" ${page===1?'disabled':''} onclick="reportsGoToPage(${page-1})" title="Previous">&lt;</button>
        <span class="pg-label">Page <span class="pg-num">${page}</span> of ${pages}</span>
        <button class="pg-btn" ${page>=pages?'disabled':''} onclick="reportsGoToPage(${page+1})" title="Next">&gt;</button>
        <button class="pg-btn" ${page>=pages?'disabled':''} onclick="reportsGoToPage(${pages})" title="Last">&gt;|</button>
      </div>
    </div>`;
}

function reportsGoToPage(p) {
  reportsPage = p;
  fetchReportsPage();
}

/* ─── REPORT DETAIL PANEL ────────────────────────────────────────────── */
let _currentReportId = null;

async function openReportPanel(reportId) {
  _currentReportId = reportId;
  document.getElementById('panel-title').textContent = 'Loading report…';
  document.getElementById('panel-body').innerHTML = '<div class="loading"><div class="spinner"></div></div>';
  document.getElementById('user-panel').classList.add('open');
  document.getElementById('panel-overlay').classList.add('open');
  try {
    const data = await api(`/admin/reports/${reportId}`);
    document.getElementById('panel-title').textContent = `Report #${data.report.id.slice(-8).toUpperCase()}`;
    document.getElementById('panel-body').innerHTML = renderReportPanel(data);
  } catch (e) {
    document.getElementById('panel-body').innerHTML = `<div class="empty">Error: ${esc(e.message)}</div>`;
  }
}

function renderReportPanel(d) {
  const r = d.report || {};
  const reporter = d.reporter || {};
  const offender = d.offender || {};
  const content = d.content || {};
  const canAct = r.status === 'pending' || r.status === 'escalated';
  const warnReports = (offender.total_reports || 0) > 3;
  const warnDeletions = (offender.total_deletions || 0) > 3;

  return `
    <div style="margin-bottom:20px;display:flex;align-items:center;gap:12px;flex-wrap:wrap">
      <span id="rp-status-badge">${reportStatusBadge(r.status)}</span>
      <span style="color:var(--text-muted);font-size:12px">${formatDate(r.created_at)}</span>
    </div>

    <div style="margin-bottom:20px;padding:16px;background:var(--bg-primary);border-radius:8px;border:1px solid var(--border)">
      <div style="font-size:11px;text-transform:uppercase;letter-spacing:.8px;color:var(--text-muted);margin-bottom:10px">Reported Content</div>
      <div style="margin-bottom:10px;display:flex;align-items:center;gap:8px;flex-wrap:wrap">
        <span class="badge badge-pending">${esc(content.type || 'review')}</span>
        ${content.movie_title ? `<span style="color:var(--text-muted);font-size:12px">${esc(content.movie_title)}${content.movie_year ? ` (${esc(content.movie_year)})` : ''}</span>` : ''}
        ${content.rating != null ? `<span>${renderStars(content.rating)}</span>` : ''}
      </div>
      ${content.full_content
        ? `<blockquote style="margin:0;padding:12px 16px;border-left:3px solid var(--accent);background:var(--bg-hover);border-radius:0 6px 6px 0;font-style:italic;line-height:1.6;font-size:13px;white-space:pre-wrap">${esc(content.full_content)}</blockquote>`
        : `<div style="color:var(--text-muted);font-style:italic;font-size:13px">Content unavailable (may have been deleted)</div>`}
    </div>

    <details style="margin-bottom:16px;background:var(--bg-primary);border-radius:8px;border:1px solid var(--border);overflow:hidden">
      <summary style="padding:12px 16px;cursor:pointer;font-size:13px;font-weight:600;user-select:none">
        Reporter: @${esc(reporter.username || '?')}
      </summary>
      <div style="padding:12px 16px;border-top:1px solid var(--border)">
        <div style="color:var(--text-muted);font-size:12px;margin-bottom:2px">${esc(reporter.email || '—')}</div>
        <div style="color:var(--text-muted);font-size:12px;margin-bottom:10px">Joined ${formatDate(reporter.created_at)}</div>
        <div style="font-size:12px"><span style="text-transform:uppercase;letter-spacing:.6px;color:var(--text-muted);font-size:10px">Reason</span><div style="font-weight:600;margin-top:2px">${esc(r.reason || '—')}</div></div>
        ${r.details ? `<div style="margin-top:8px;color:var(--text-muted);font-size:12px;font-style:italic">${esc(r.details)}</div>` : ''}
      </div>
    </details>

    <div style="margin-bottom:20px;padding:16px;background:var(--bg-primary);border-radius:8px;border:1px solid var(--border)">
      <div style="font-size:11px;text-transform:uppercase;letter-spacing:.8px;color:var(--text-muted);margin-bottom:10px">Alleged Offender</div>
      <div style="margin-bottom:6px">
        <strong style="font-size:16px;cursor:pointer;color:var(--accent)"
          onclick="closeUserPanel();setTimeout(()=>openUserPanel('${esc(offender.username || '')}'),250)">@${esc(offender.username || '?')}</strong>
      </div>
      <div style="color:var(--text-muted);font-size:12px;margin-bottom:2px">${esc(offender.email || '—')}</div>
      <div style="color:var(--text-muted);font-size:12px;margin-bottom:14px">Joined ${formatDate(offender.created_at)}</div>
      <div style="display:flex;gap:10px;margin-bottom:14px">
        <div style="flex:1;padding:10px;text-align:center;border-radius:8px;background:var(--bg-hover);border:1px solid ${warnReports ? 'rgba(255,100,100,.5)' : 'var(--border)'}">
          <div style="font-size:22px;font-weight:700;${warnReports ? 'color:#ff6666' : ''}">${offender.total_reports || 0}</div>
          <div style="font-size:11px;color:var(--text-muted)">times reported</div>
        </div>
        <div style="flex:1;padding:10px;text-align:center;border-radius:8px;background:var(--bg-hover);border:1px solid ${warnDeletions ? 'rgba(255,100,100,.5)' : 'var(--border)'}">
          <div style="font-size:22px;font-weight:700;${warnDeletions ? 'color:#ff6666' : ''}">${offender.total_deletions || 0}</div>
          <div style="font-size:11px;color:var(--text-muted)">items deleted</div>
        </div>
      </div>
      <button class="btn btn-ghost btn-sm" onclick="loadReportModLog('${esc(offender.id || '')}')">View Mod Log</button>
      <div id="report-modlog-container" style="margin-top:10px"></div>
    </div>

    ${canAct ? `
    <div id="rp-actions" style="padding:16px;background:var(--bg-primary);border-radius:8px;border:1px solid var(--border)">
      <div style="font-size:11px;text-transform:uppercase;letter-spacing:.8px;color:var(--text-muted);margin-bottom:12px">Actions</div>
      <div style="display:flex;gap:10px">
        <button class="btn btn-ghost" style="flex:1" onclick="dismissReport('${esc(r.id)}')">Dismiss</button>
        <button class="btn btn-danger" style="flex:1" onclick="deleteReportContent('${esc(r.id)}')">Delete Content</button>
        <button class="btn" style="flex:1;background:rgba(234,88,12,.15);color:#fb923c;border:1px solid rgba(234,88,12,.3)" onclick="escalateReport('${esc(r.id)}')">Escalate</button>
      </div>
    </div>
    ` : `<div style="padding:12px 16px;background:var(--bg-primary);border-radius:8px;border:1px solid var(--border);color:var(--text-muted);font-size:12px;text-align:center">This report has been <strong>${esc(r.status)}</strong></div>`}
  `;
}

async function loadReportModLog(userId) {
  const el = document.getElementById('report-modlog-container');
  if (!el || !userId) return;
  el.innerHTML = '<div class="loading"><div class="spinner"></div></div>';
  try {
    const rows = await api(`/admin/users/${userId}/moderation-log`);
    if (!rows || !rows.length) {
      el.innerHTML = '<div style="color:var(--text-muted);font-size:12px;padding:8px 0">No moderation history</div>';
      return;
    }
    el.innerHTML = `
      <table class="mod-log-table" style="margin-top:6px">
        <thead><tr><th>Timestamp</th><th>Action</th><th>Reason</th><th>By</th></tr></thead>
        <tbody>
          ${rows.map(row => `
            <tr>
              <td style="white-space:nowrap;color:var(--text-muted);font-size:11px">${formatDate(row.created_at)}</td>
              <td><span class="action-badge ab-${row.action}">${row.action.replace(/_/g,' ')}</span></td>
              <td style="color:var(--text-muted);font-size:12px">${esc(row.reason)}</td>
              <td style="color:var(--text-muted);font-size:12px">${esc(row.performed_by_username || 'admin')}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>`;
  } catch (e) {
    el.innerHTML = `<div style="color:var(--accent);font-size:12px">${esc(e.message)}</div>`;
  }
}

function _updateReportPanelAfterAction(reportId, newStatus, actionLabel) {
  // Update panel UI
  const badge = document.getElementById('rp-status-badge');
  if (badge) badge.innerHTML = reportStatusBadge(newStatus);
  const actions = document.getElementById('rp-actions');
  if (actions) actions.innerHTML = `<div style="color:var(--text-muted);font-size:12px;text-align:center">${esc(actionLabel)}</div>`;

  // Fade and remove row from table
  const row = document.getElementById(`report-row-${reportId}`);
  if (row) {
    row.style.transition = 'opacity .4s';
    row.style.opacity = '0';
    setTimeout(() => {
      row.remove();
      reportsTotal = Math.max(0, reportsTotal - 1);
      // If page is now empty and we're not on page 1, go back one page
      const remaining = document.querySelectorAll('#reports-table-wrap tbody tr').length;
      if (remaining === 0 && reportsPage > 1) {
        reportsPage--;
        fetchReportsPage();
      } else {
        // Re-render pagination with updated total
        renderReportsPagination(reportsTotal);
      }
    }, 400);
  }
}

function dismissReport(reportId) {
  showReasonModal({
    title: 'Dismiss Report',
    chipKey: 'report_dismiss',
    onConfirm: async (reason) => {
      try {
        await api(`/admin/reports/${reportId}/dismiss`, { method: 'POST', body: JSON.stringify({ reason }) });
        _updateReportPanelAfterAction(reportId, 'dismissed', 'Report dismissed');
        toast('Report dismissed', 'success');
      } catch (e) { toast(`Error: ${e.message}`, 'error'); }
    },
  });
}

function deleteReportContent(reportId) {
  showReasonModal({
    title: 'Delete Content',
    chipKey: 'report_delete',
    destructive: true,
    onConfirm: async (reason) => {
      try {
        await api(`/admin/reports/${reportId}/delete-content`, { method: 'POST', body: JSON.stringify({ reason }) });
        _updateReportPanelAfterAction(reportId, 'resolved', 'Content deleted and report resolved');
        toast('Content deleted and report resolved', 'success');
      } catch (e) { toast(`Error: ${e.message}`, 'error'); }
    },
  });
}

function escalateReport(reportId) {
  showReasonModal({
    title: 'Escalate Report',
    chipKey: 'report_escalate',
    onConfirm: async (reason) => {
      try {
        await api(`/admin/reports/${reportId}/escalate`, { method: 'POST', body: JSON.stringify({ reason }) });
        _updateReportPanelAfterAction(reportId, 'escalated', 'Report escalated');
        toast('Report escalated', 'success');
      } catch (e) { toast(`Error: ${e.message}`, 'error'); }
    },
  });
}

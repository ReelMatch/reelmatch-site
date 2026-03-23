// ═══════════════════════════════════════════════════════
// ReelMatch Editing Room — dashboard.js
// ═══════════════════════════════════════════════════════
console.log('[Dashboard] ▶ INITIALIZED'); // DEBUG

/* ─── DASHBOARD ──────────────────────────────────────────────────────── */
let _dashInterval = null;

async function loadDashboard() {
  const body = document.getElementById('dashboard-body');

  console.log('[Dashboard] ▶ SHOWING SKELETON STATE'); // DEBUG
  body.innerHTML = skeletonHTML();

  let s;
  try {
    s = await api('/admin/stats');
    if (!s) return;
  } catch (e) {
    body.innerHTML = `<div class="error-card">⚠ Failed to load stats: ${esc(e.message)}</div>`;
    document.getElementById('health-dot').classList.add('hidden');
    return;
  }

  console.log('[Dashboard] ▶ STATS LOADED — replacing skeletons'); // DEBUG
  document.getElementById('health-dot').classList.remove('hidden');
  document.getElementById('dash-updated').textContent =
    'Updated ' + new Date().toLocaleTimeString();

  const pending = s.pending_reports || 0;
  const li = s.last_import;

  body.innerHTML = `
    <!-- Row 1: 4 large cards -->
    <div class="stats-grid">
      ${bigCard('Total Users',    s.total_users,    'registered accounts',   false,        'users-all')}
      ${bigCard('Total Ratings',  s.total_ratings,  'user film ratings',     false,        'ratings-all')}
      ${bigCard('Movies Cached',  s.movies_cached,  'in Supabase catalogue', false,        '')}
      ${bigCard('Pending Reports', pending,          'awaiting moderation',   pending > 0, 'reports')}
    </div>

    <!-- Row 2: 4 medium cards -->
    <div class="stats-grid-2">
      ${medCard('New Users Today',       s.new_users_today,    'joined since midnight', 'users-today')}
      ${medCard('Ratings Today',         s.ratings_today,      'ratings logged today',  'ratings-today')}
      ${medCard('Active Group Sessions', s.active_sessions,    'sessions in progress',  'groups-active')}
      ${medCard('Achievements Earned',   s.achievements_earned,'total unlocked',        'users-all')}
    </div>

    <!-- Row 3: 2 wide cards -->
    <div class="stats-grid-wide">
      <div class="wide-card">
        <h3>Seed Data</h3>
        <div class="mini-stats">
          ${miniStat(s.seed_ratings,          'Seed Ratings')}
          ${miniStat(s.movies_with_streaming, 'With Streaming')}
          ${miniStat(s.average_rating,        'Avg User Rating')}
        </div>
      </div>
      <div class="wide-card">
        <h3>Social Graph</h3>
        <div class="mini-stats">
          ${miniStat(s.total_follows,      'Follows')}
          ${miniStat(s.total_friendships,  'Friendships')}
          ${miniStat(s.total_reviews,      'Reviews')}
          ${miniStat(s.total_groups,       'Groups')}
        </div>
      </div>
    </div>

    <!-- Last import -->
    <div class="import-card">
      <div>
        <h3>Last Import Job</h3>
        ${li
          ? `<div class="import-detail">${esc(li.source)} &mdash; <strong>${esc(li.status)}</strong> &mdash; ${(li.processed_records||0).toLocaleString()} records</div>
             <div class="import-meta">${formatDate(li.created_at)}</div>`
          : `<div class="import-meta">No import jobs found</div>`}
      </div>
      <button class="btn btn-ghost btn-sm" onclick="navigate('settings')">Import Status ↗</button>
    </div>

    <!-- Build info -->
    <div class="stats-grid" style="margin-top:0;grid-template-columns:1fr">
      <div class="stat-card" style="padding:16px 18px">
        <div class="stat-label" style="margin-bottom:4px">Build</div>
        <div class="stat-number" style="font-size:1.4rem">v${BUILD_VERSION}</div>
        <div class="stat-sublabel">${BUILD_DATE}</div>
        ${(() => {
          const cur = CHANGELOG[0];
          const older = CHANGELOG.slice(1);
          return `<div style="margin-top:12px;border-top:1px solid var(--border);padding-top:12px">
            <div style="font-size:10px;font-weight:600;color:var(--text-muted);letter-spacing:0.6px;margin-bottom:8px;text-transform:uppercase">Changelog</div>
            <div style="font-size:12px;font-weight:600;color:var(--text-primary);margin-bottom:4px">${esc(cur.version)} — ${esc(cur.date)}</div>
            <ul style="margin:0 0 0 0;padding-left:14px;font-size:12px;color:var(--text-primary);line-height:1.9">
              ${cur.changes.map(c => `<li>${esc(c)}</li>`).join('')}
            </ul>
            ${older.map(v => `
              <div style="margin-top:10px;font-size:11px;font-weight:600;color:var(--text-muted)">${esc(v.version)} — ${esc(v.date)}</div>
              <ul style="margin:0;padding-left:14px;font-size:11px;color:var(--text-muted);line-height:1.9">
                ${v.changes.map(c => `<li>${esc(c)}</li>`).join('')}
              </ul>
            `).join('')}
          </div>`;
        })()}
      </div>
    </div>
  `;

  // Animate numbers counting up — only once per session
  if (!sessionStorage.getItem('stats_animated')) {
    body.querySelectorAll('[data-count]').forEach(el => countUp(el));
    sessionStorage.setItem('stats_animated', '1');
  }
}

/* ─── RECOMMENDATIONS REFRESH ────────────────────────────────────────── */
let _recsRefreshTimer = null;

/* Log console helpers */
function _logTs() {
  const n = new Date();
  return [n.getHours(), n.getMinutes(), n.getSeconds()]
    .map(v => String(v).padStart(2, '0')).join(':');
}

function recLog(text, type = 'info') {
  const cons = document.getElementById('recs-log-console');
  const body = document.getElementById('recs-log-body');
  if (!body) return;
  cons.style.display = 'block';
  const line = document.createElement('div');
  line.className = `rec-log-line ${type}`;
  line.textContent = text;
  body.appendChild(line);
  body.scrollTop = body.scrollHeight;
}

function recLogTs(text, type = 'info') {
  recLog(`[${_logTs()}] ${text}`, type);
}

function clearRecLog() {
  const body = document.getElementById('recs-log-body');
  if (body) body.innerHTML = '';
}

function closeRecLog() {
  document.getElementById('recs-log-console').style.display = 'none';
}

async function copyRecLog() {
  const body = document.getElementById('recs-log-body');
  const btn  = document.getElementById('recs-log-copy-btn');
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

async function startRecsRefresh(phase = 'both') {
  const btnId = phase === 'matrix' ? 'recs-matrix-btn'
              : phase === 'recs'   ? 'recs-compute-btn'
              : 'recs-refresh-btn';
  const btn      = document.getElementById(btnId);
  const progress = document.getElementById('recs-refresh-progress');
  const fill     = document.getElementById('recs-progress-fill');
  const msg      = document.getElementById('recs-refresh-msg');

  // Disable all three phase buttons while running
  ['recs-matrix-btn', 'recs-compute-btn', 'recs-refresh-btn'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.disabled = true;
  });
  progress.style.display = 'block';
  fill.style.width = '0%';
  msg.style.color = 'var(--text-muted)';
  msg.textContent = 'Starting…';

  clearRecLog();
  recLog('═══════════════════════════════════════', 'header');
  const phaseLabel = phase === 'matrix' ? 'MATRIX BUILD'
                   : phase === 'recs'   ? 'REC COMPUTATION'
                   : 'FULL REFRESH (BOTH PHASES)';
  recLog(`  REC ENGINE — ${phaseLabel} — ${new Date().toLocaleString()}`, 'header');
  recLog('═══════════════════════════════════════', 'header');
  recLogTs('▶ Sending refresh request to server…', 'info');

  try {
    const data = await api(`/admin/recommendations/refresh-all?phase=${phase}`, { method: 'POST' });
    if (!data) {
      _enableRecsButtons();
      recLogTs('✗ No response from server', 'error');
      return;
    }
    const { job_id } = data;
    recLogTs(`✓ Job queued  (id: ${job_id})`, 'ok');
    recLogTs('○ Waiting for worker to start…', 'info');
    msg.textContent = 'Processing…';

    let _lastProcessed = -1;
    let _lastResults = 0;
    let _loggedPhase1 = false;
    let _loggedPhase2 = false;

    if (_recsRefreshTimer) clearInterval(_recsRefreshTimer);
    _recsRefreshTimer = setInterval(async () => {
      console.log('[RecConsole] ▶ POLL TICK — job_id:', job_id); // DEBUG
      try {
        const s = await api(`/admin/recommendations/refresh-status/${job_id}`);
        if (!s) { return; }

        console.log('[RecConsole] ▶ RAW STATUS RESPONSE:', JSON.stringify(s)); // DEBUG

        // Update progress bar when processed count changes
        if (s.processed !== _lastProcessed) {
          const pct = s.total > 0 ? Math.round((s.processed / s.total) * 100) : 0;
          fill.style.width = `${pct}%`;
          msg.textContent = `Processing ${s.processed} / ${s.total} users…`;
          _lastProcessed = s.processed;
        }

        // Log new per-user results as they arrive
        if (s.results && s.results.length > _lastResults) {
          for (let i = _lastResults; i < s.results.length; i++) {
            const r = s.results[i];
            console.log('[RecConsole] ▶ USER RESULT:', r.username, r.phase, r.status); // DEBUG

            // Insert phase separator headers on first result of each phase
            if (r.phase === 'matrix' && !_loggedPhase1) {
              _loggedPhase1 = true;
              console.log('[Dashboard] ▶ PHASE 1 — matrix builds'); // DEBUG
              recLog('───────────────────────────────────────', 'header');
              recLogTs('▶ PHASE 1 — Building pending matrices…', 'info');
            } else if (r.phase === 'recs' && !_loggedPhase2) {
              _loggedPhase2 = true;
              console.log('[Dashboard] ▶ PHASE 2 — rec computation'); // DEBUG
              recLog('───────────────────────────────────────', 'header');
              recLogTs('▶ PHASE 2 — Computing recommendations…', 'info');
            }

            if (r.status === 'ok') {
              if (r.phase === 'matrix') {
                recLogTs(`── matrix built: ${r.username} (${r.neighbor_count} neighbors)`, 'info');
              } else {
                recLogTs(`✓ ${r.username} — ${r.recs_stored} recs (${r.neighbor_recs} neighbor, ${r.genre_affinity_recs} genre affinity, ${r.neighbor_count} neighbors)`, 'ok');
              }
            } else {
              recLogTs(`✗ ${r.username} — ERROR: ${r.error}`, 'error');
            }
          }
          _lastResults = s.results.length;
        }

        if (s.status === 'complete') {
          clearInterval(_recsRefreshTimer);
          _recsRefreshTimer = null;
          fill.style.width = '100%';
          msg.style.color = '#81c784';
          msg.textContent = `✓ Done — processed ${s.processed} users`;
          recLog('───────────────────────────────────────', 'header');
          recLogTs(`✓ Complete — processed ${s.processed} user${s.processed !== 1 ? 's' : ''}`, 'ok');
          const errorCount = s.errors ? s.errors.length : 0;
          if (errorCount > 0) {
            recLogTs(`✗ ${errorCount} user${errorCount !== 1 ? 's' : ''} failed`, 'error');
          } else {
            recLogTs('○ No errors', 'info');
          }
          recLog('═══════════════════════════════════════', 'header');
          _enableRecsButtons();

        } else if (s.status === 'error') {
          clearInterval(_recsRefreshTimer);
          _recsRefreshTimer = null;
          msg.style.color = '#e57373';
          msg.textContent = `✗ Error: ${s.errors[0]?.error || 'Unknown error'}`;
          recLog('───────────────────────────────────────', 'header');
          recLogTs(`✗ Job failed: ${s.errors[0]?.error || 'Unknown error'}`, 'error');
          recLog('═══════════════════════════════════════', 'header');
          _enableRecsButtons();
        }
      } catch (e) {
        console.error('[RecConsole] ✗ POLL error:', e.message); // DEBUG
        recLogTs(`✗ Poll error: ${e.message}`, 'error');
      }
    }, 1000);
  } catch (e) {
    msg.style.color = '#e57373';
    msg.textContent = `✗ Failed to start: ${e.message}`;
    recLogTs(`✗ Failed to start job: ${e.message}`, 'error');
    _enableRecsButtons();
  }
}

function _enableRecsButtons() {
  ['recs-matrix-btn', 'recs-compute-btn', 'recs-refresh-btn'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.disabled = false;
  });
}

function skeletonHTML() {
  const row = n => `<div class="skeleton-grid">${'<div class="skeleton-box"></div>'.repeat(n)}</div>`;
  return row(4) + row(4) + `<div class="skeleton-grid" style="grid-template-columns:1fr 1fr">${'<div class="skeleton-box" style="height:110px"></div>'.repeat(2)}</div>`;
}

function bigCard(label, value, sublabel, isDanger = false, action = '') {
  const n = Number(value);
  const display = isNaN(n) ? value : n.toLocaleString();
  const actionAttr = action ? ` data-action="${action}" onclick="handleCardClick('${action}')"` : '';
  return `
    <div class="stat-card${isDanger ? ' danger' : ''}"${actionAttr}>
      <div class="stat-number" data-count="${isNaN(n)?'':n}">${isDanger ? '⚠ ' : ''}${display}</div>
      <div class="stat-label">${label}</div>
      <div class="stat-sublabel">${sublabel}</div>
    </div>`;
}

function medCard(label, value, sublabel, action = '') {
  const n = Number(value);
  const display = isNaN(n) ? value : n.toLocaleString();
  const actionAttr = action ? ` data-action="${action}" onclick="handleCardClick('${action}')"` : '';
  return `
    <div class="stat-card"${actionAttr}>
      <div class="stat-number sm" data-count="${isNaN(n)?'':n}">${display}</div>
      <div class="stat-label">${label}</div>
      <div class="stat-sublabel">${sublabel}</div>
    </div>`;
}

function miniStat(value, label) {
  const n = Number(value);
  const display = isNaN(n) ? value : n.toLocaleString();
  return `
    <div class="mini-stat">
      <div class="mini-stat-number" data-count="${isNaN(n)?'':n}">${display}</div>
      <div class="mini-stat-label">${label}</div>
    </div>`;
}

function countUp(el) {
  const target = parseInt(el.dataset.count, 10);
  if (isNaN(target) || target === 0) return;
  const duration = 600;
  const start = performance.now();
  const prefix = el.textContent.startsWith('⚠') ? '⚠ ' : '';
  function step(now) {
    const p = Math.min((now - start) / duration, 1);
    const ease = 1 - Math.pow(1 - p, 3);
    el.textContent = prefix + Math.round(target * ease).toLocaleString();
    if (p < 1) requestAnimationFrame(step);
    else el.textContent = prefix + target.toLocaleString();
  }
  requestAnimationFrame(step);
}

function startDashAutoRefresh() {
  if (_dashInterval) clearInterval(_dashInterval);
  _dashInterval = setInterval(() => {
    if (state.section === 'dashboard') loadDashboard();
  }, 30000);
}

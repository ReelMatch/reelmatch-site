// ═══════════════════════════════════════════════════════
// ReelMatch Editing Room — recengine.js
// RecEngine section: Movie Similarities + stats loaders
// ═══════════════════════════════════════════════════════
console.log('[RecEngine] ▶ INITIALIZED'); // DEBUG

/* ─── SHARED LOG HELPERS ─────────────────────────────────────────────── */
function _reTs() {
  const n = new Date();
  return [n.getHours(), n.getMinutes(), n.getSeconds()]
    .map(v => String(v).padStart(2, '0')).join(':');
}

/* ─── SIMILARITY LOG ─────────────────────────────────────────────────── */
function simLog(text, type = 'info') {
  const cons = document.getElementById('sim-log-console');
  const body = document.getElementById('sim-log-body');
  if (!body) return;
  cons.style.display = 'block';
  const line = document.createElement('div');
  line.className = `rec-log-line ${type}`;
  line.textContent = text;
  body.appendChild(line);
  body.scrollTop = body.scrollHeight;
}

function simLogTs(text, type = 'info') {
  simLog(`[${_reTs()}] ${text}`, type);
}

function closeSimLog() {
  const el = document.getElementById('sim-log-console');
  if (el) el.style.display = 'none';
}

async function copySimLog() {
  const body = document.getElementById('sim-log-body');
  const btn  = document.getElementById('sim-log-copy-btn');
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

/* ─── SIMILARITY STATS ───────────────────────────────────────────────── */
async function loadSimStats() {
  const bar = document.getElementById('sim-stats-bar');
  if (!bar) return;
  bar.style.display = 'block';
  bar.textContent = 'Loading stats…';
  try {
    const stats = await api('/admin/recommendations/movie-similarity-stats');
    if (stats) {
      bar.textContent = `${stats.total_movies_with_similarities} movies indexed — avg ${stats.avg_similar_per_movie} similar per movie`;
    } else {
      bar.textContent = 'No stats available';
    }
  } catch (e) {
    bar.textContent = `Error: ${e.message}`;
  }
}

/* ─── SIMILARITY PRECOMPUTE (RecEngine section) ──────────────────────── */
let _simRETimer = null;

async function startSimPrecomputeRE() {
  const progress = document.getElementById('sim-refresh-progress');
  const fill     = document.getElementById('sim-progress-fill');
  const msg      = document.getElementById('sim-refresh-msg');

  ['sim-precompute-btn', 'sim-stats-btn'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.disabled = true;
  });
  progress.style.display = 'block';
  fill.style.width = '0%';
  msg.style.color = 'var(--text-muted)';
  msg.textContent = 'Starting similarity precomputation…';

  simLog('═══════════════════════════════════════', 'header');
  simLog(`  MOVIE SIMILARITIES — ${new Date().toLocaleString()}`, 'header');
  simLog('═══════════════════════════════════════', 'header');
  simLogTs('▶ Sending precompute request to server…', 'info');

  try {
    const data = await api('/admin/recommendations/precompute-movie-similarities', { method: 'POST' });
    if (!data) {
      _enableSimButtons();
      simLogTs('✗ No response from server', 'error');
      return;
    }
    const { job_id, total_movies } = data;
    simLogTs(`✓ Job queued  (id: ${job_id})`, 'ok');
    simLogTs(`── Processing ${total_movies || '…'} movies…`, 'info');
    msg.textContent = 'Precomputing…';

    const loggedIndices = new Set();
    const pollStartTime = Date.now();
    if (_simRETimer) clearInterval(_simRETimer);
    _simRETimer = setInterval(async () => {
      console.log('[RecEngine] ▶ SIM POLL TICK — job_id:', job_id); // DEBUG

      if (Date.now() - pollStartTime > 2700000) {
        clearInterval(_simRETimer);
        _simRETimer = null;
        simLogTs('✗ Timed out after 45 minutes — job may still be running in background. Check Railway logs.', 'error');
        _enableSimButtons();
        return;
      }

      try {
        const s = await api(`/admin/recommendations/refresh-status/${job_id}`);
        if (!s) return;
        console.log('[RecEngine] ▶ SIM STATUS:', JSON.stringify(s)); // DEBUG

        if (s.results && s.results.length > 0) {
          s.results.forEach((r, idx) => {
            if (!loggedIndices.has(idx)) {
              loggedIndices.add(idx);
              const icon = r.status === 'ok' ? '✓' : '✗';
              const detail = r.status === 'ok'
                ? `${r.similar_found} similar found`
                : `error: ${r.error}`;
              simLog(`[${_reTs()}] ${icon} ${r.movie_title} — ${detail} (${r.current}/${s.total})`, r.status === 'ok' ? 'ok' : 'error');
            }
          });
        }

        if (s.processed > 0 && s.total > 0) {
          const pct = Math.round((s.processed / s.total) * 100);
          fill.style.width = `${pct}%`;
          msg.textContent = `Processing movies… ${s.processed}/${s.total} (${pct}%)`;
        }

        if (s.status === 'complete' || s.status === 'error') {
          clearInterval(_simRETimer);
          _simRETimer = null;
          console.log('[RecEngine] ▶ SIM POLLING STOPPED — status:', s.status); // DEBUG

          if (s.status === 'complete') {
            const result = s.result || {};
            fill.style.width = '100%';
            msg.style.color = '#81c784';
            msg.textContent = `✓ Done — ${result.processed || 0} movies processed`;
            simLog('───────────────────────────────────────', 'header');
            simLogTs(`✓ Complete — ${result.processed || 0} movies processed, ${result.errors || 0} errors`, 'ok');
            try {
              const stats = await api('/admin/recommendations/movie-similarity-stats');
              if (stats) {
                simLogTs(`── ${stats.total_movies_with_similarities} movies indexed, avg ${stats.avg_similar_per_movie} similar per movie`, 'info');
                const bar = document.getElementById('sim-stats-bar');
                if (bar) {
                  bar.style.display = 'block';
                  bar.textContent = `${stats.total_movies_with_similarities} movies indexed — avg ${stats.avg_similar_per_movie} similar per movie`;
                }
              }
            } catch (e) {
              console.warn('[RecEngine] ✗ Failed to fetch similarity stats:', e.message); // DEBUG
            }
          } else {
            msg.style.color = '#e57373';
            msg.textContent = `✗ Error: ${s.error || 'Unknown error'}`;
            simLog('───────────────────────────────────────', 'header');
            simLogTs(`✗ Job failed: ${s.error || 'Unknown error'}`, 'error');
          }
          simLog('═══════════════════════════════════════', 'header');
          _enableSimButtons();
        }
      } catch (e) {
        console.error('[RecEngine] ✗ SIM POLL error:', e.message); // DEBUG
        simLogTs(`✗ Poll error: ${e.message}`, 'error');
      }
    }, 2000);
  } catch (e) {
    msg.style.color = '#e57373';
    msg.textContent = `✗ Failed to start: ${e.message}`;
    simLogTs(`✗ Failed to start job: ${e.message}`, 'error');
    _enableSimButtons();
  }
}

function _enableSimButtons() {
  ['sim-precompute-btn', 'sim-stats-btn'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.disabled = false;
  });
}

/* ─── KEYWORD STATS ──────────────────────────────────────────────────── */
async function loadKeywordStats() {
  const bar = document.getElementById('keywords-stats-bar');
  if (!bar) return;
  bar.style.display = 'block';
  bar.textContent = 'Loading stats…';
  try {
    const stats = await api('/admin/movies/keyword-stats');
    if (stats) {
      bar.textContent = `${stats.movies_with_keywords} movies with keywords — avg ${stats.avg_keywords_per_movie} per movie — ${stats.movies_without_keywords} still missing`;
    } else {
      bar.textContent = 'No stats available';
    }
  } catch (e) {
    bar.textContent = `Error: ${e.message}`;
  }
}

/* ═══════════════════════════════════════════════════════
   DIAGNOSTICS
   ═══════════════════════════════════════════════════════ */

const _diagConfig = {
  kw: {
    name:        'movies-without-keywords',
    reportUrl:   '/admin/diagnostics/movies-without-keywords',
    fixUrl:      '/admin/movies/fetch-keywords',
    timeout:     2700000,  // 45 min
    pollInterval: 2000,
    countLabel:  n => `${n} missing keywords`,
    renderItem:  item => item.title,
    resultLine:  (r) => r.movie_title
      ? `${r.status === 'ok' ? '✓' : '✗'} ${r.movie_title} — ${r.status === 'ok' ? `${r.keywords_found} keywords` : `error: ${r.error}`}`
      : null,
  },
  sim: {
    name:        'movies-without-similarities',
    reportUrl:   '/admin/diagnostics/movies-without-similarities',
    fixUrl:      '/admin/recommendations/precompute-movie-similarities',
    timeout:     2700000,  // 45 min
    pollInterval: 2000,
    countLabel:  n => `${n} missing similarities`,
    renderItem:  item => item.title,
    resultLine:  (r) => r.movie_title
      ? `${r.status === 'ok' ? '✓' : '✗'} ${r.movie_title} — ${r.status === 'ok' ? `${r.similar_found} similar found` : `error: ${r.error}`}`
      : null,
  },
  mat: {
    name:        'users-without-matrix',
    reportUrl:   '/admin/diagnostics/users-without-matrix',
    fixUrl:      '/admin/recommendations/refresh-all?phase=matrix',
    timeout:     600000,   // 10 min
    pollInterval: 1000,
    countLabel:  n => `${n} without matrix`,
    renderItem:  item => `${item.username} (${item.rating_count} ratings)`,
    resultLine:  (r) => r.username
      ? `${r.status === 'ok' ? '✓' : '✗'} ${r.username}${r.status === 'ok' ? ` — ${r.neighbor_count || 0} neighbors` : ` — ERROR: ${r.error}`}`
      : null,
  },
  recs: {
    name:        'users-without-recs',
    reportUrl:   '/admin/diagnostics/users-without-recs',
    fixUrl:      '/admin/recommendations/refresh-all?phase=recs',
    timeout:     600000,   // 10 min
    pollInterval: 1000,
    countLabel:  n => `${n} without recs`,
    renderItem:  item => `${item.username} (${item.rating_count} ratings)`,
    resultLine:  (r) => r.username
      ? `${r.status === 'ok' ? '✓' : '✗'} ${r.username}${r.status === 'ok' ? ` — ${r.recs_stored || 0} recs` : ` — ERROR: ${r.error}`}`
      : null,
  },
};

const _diagTimers = { kw: null, sim: null, mat: null, recs: null };

/* ─── DIAG LOG HELPERS ───────────────────────────────────────────────── */
function _diagLog(key, text, type = 'info') {
  const cons = document.getElementById(`diag-${key}-log-console`);
  const body = document.getElementById(`diag-${key}-log-body`);
  if (!body) return;
  cons.style.display = 'block';
  const line = document.createElement('div');
  line.className = `rec-log-line ${type}`;
  line.textContent = text;
  body.appendChild(line);
  body.scrollTop = body.scrollHeight;
}

function _diagLogTs(key, text, type = 'info') {
  _diagLog(key, `[${_reTs()}] ${text}`, type);
}

function closeDiagLog(key) {
  const el = document.getElementById(`diag-${key}-log-console`);
  if (el) el.style.display = 'none';
}

async function copyDiagLog(key) {
  const body = document.getElementById(`diag-${key}-log-body`);
  const btn  = document.getElementById(`diag-${key}-log-copy-btn`);
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

/* ─── RUN DIAGNOSTIC REPORT ──────────────────────────────────────────── */
async function runDiagReport(key) {
  const cfg       = _diagConfig[key];
  const badge     = document.getElementById(`diag-${key}-badge`);
  const list      = document.getElementById(`diag-${key}-list`);
  const fixBtn    = document.getElementById(`diag-${key}-fix-btn`);
  const reportBtn = document.getElementById(`diag-${key}-report-btn`);

  console.log('[Diagnostics] ▶ running report:', cfg.name); // DEBUG
  if (reportBtn) { reportBtn.disabled = true; reportBtn.textContent = 'Running…'; }
  if (badge) { badge.style.display = 'none'; }

  try {
    const data = await api(cfg.reportUrl);
    console.log('[Diagnostics] ▶ report result:', data); // DEBUG

    if (!data) throw new Error('No response from server');

    const count = data.count || 0;
    const items = data.items || [];

    // Update badge
    if (badge) {
      badge.style.display = 'inline-block';
      if (count === 0) {
        badge.style.background = '#2e7d32';
        badge.style.color = '#fff';
        badge.textContent = '✓ All good';
      } else {
        badge.style.background = '#c0392b';
        badge.style.color = '#fff';
        badge.textContent = cfg.countLabel(count);
      }
    }

    // Update list
    if (list) {
      if (items.length === 0) {
        list.style.display = 'none';
      } else {
        list.style.display = 'block';
        list.innerHTML = items.map(item => `<div>${esc(cfg.renderItem(item))}</div>`).join('');
        if (count > items.length) {
          list.innerHTML += `<div style="color:var(--text-muted);font-style:italic">… and ${count - items.length} more</div>`;
        }
      }
    }

    // Show fix button only if there are items to fix
    if (fixBtn) fixBtn.style.display = count > 0 ? 'inline-flex' : 'none';

  } catch (e) {
    if (badge) {
      badge.style.display = 'inline-block';
      badge.style.background = '#555';
      badge.style.color = '#fff';
      badge.textContent = `Error`;
    }
    console.error('[Diagnostics] ✗ report error:', e.message); // DEBUG
  } finally {
    if (reportBtn) { reportBtn.disabled = false; reportBtn.textContent = 'Run Report'; }
  }
}

function runAllDiagReports() {
  console.log('[Diagnostics] ▶ running report:', 'all'); // DEBUG
  ['kw', 'sim', 'mat', 'recs'].forEach(key => runDiagReport(key));
}

/* ─── TRIGGER DIAGNOSTIC FIX ─────────────────────────────────────────── */
async function triggerDiagFix(key) {
  const cfg    = _diagConfig[key];
  const fixBtn = document.getElementById(`diag-${key}-fix-btn`);

  console.log('[Diagnostics] ▶ fix triggered:', cfg.name); // DEBUG
  if (fixBtn) fixBtn.disabled = true;

  // Clear and open log
  const logBody = document.getElementById(`diag-${key}-log-body`);
  if (logBody) logBody.innerHTML = '';

  _diagLog(key, '═══════════════════════════════════════', 'header');
  _diagLog(key, `  ${cfg.name.toUpperCase()} — FIX — ${new Date().toLocaleString()}`, 'header');
  _diagLog(key, '═══════════════════════════════════════', 'header');
  _diagLogTs(key, '▶ Sending fix request to server…', 'info');

  try {
    const data = await api(cfg.fixUrl, { method: 'POST' });
    if (!data) {
      _diagLogTs(key, '✗ No response from server', 'error');
      if (fixBtn) fixBtn.disabled = false;
      return;
    }

    const { job_id } = data;
    _diagLogTs(key, `✓ Job queued  (id: ${job_id})`, 'ok');
    _diagLogTs(key, '○ Polling for progress…', 'info');

    const loggedIndices = new Set();
    const loggedUsers   = new Set();
    const pollStart     = Date.now();

    if (_diagTimers[key]) clearInterval(_diagTimers[key]);
    _diagTimers[key] = setInterval(async () => {
      if (Date.now() - pollStart > cfg.timeout) {
        clearInterval(_diagTimers[key]);
        _diagTimers[key] = null;
        _diagLogTs(key, `✗ Timed out — job may still be running in background. Check Railway logs.`, 'error');
        if (fixBtn) fixBtn.disabled = false;
        return;
      }

      try {
        const s = await api(`/admin/recommendations/refresh-status/${job_id}`);
        if (!s) return;

        // Per-item result lines (index-keyed for keywords/sim, username-keyed for matrix/recs)
        if (s.results && s.results.length > 0) {
          s.results.forEach((r, idx) => {
            const lineKey = r.username ? `${r.username}_${r.phase || ''}` : idx;
            const tracked = r.username ? loggedUsers : loggedIndices;
            if (!tracked.has(lineKey)) {
              tracked.add(lineKey);
              const line = cfg.resultLine(r, s);
              if (line) _diagLog(key, `[${_reTs()}] ${line}`, r.status === 'ok' ? 'ok' : 'error');
            }
          });
        }

        if (s.status === 'complete' || s.status === 'error') {
          clearInterval(_diagTimers[key]);
          _diagTimers[key] = null;
          _diagLog(key, '───────────────────────────────────────', 'header');

          if (s.status === 'complete') {
            const result = s.result || {};
            const processed = result.processed ?? s.processed ?? 0;
            const errors    = result.errors    ?? (s.errors ? s.errors.length : 0);
            _diagLogTs(key, `✓ Complete — ${processed} processed, ${errors} errors`, 'ok');
          } else {
            _diagLogTs(key, `✗ Job failed: ${s.errors?.[0]?.error || 'Unknown error'}`, 'error');
          }

          _diagLog(key, '═══════════════════════════════════════', 'header');
          if (fixBtn) fixBtn.disabled = false;

          // Refresh the report badge after fix
          runDiagReport(key);
        }
      } catch (e) {
        console.error(`[Diagnostics] ✗ poll error (${key}):`, e.message); // DEBUG
        _diagLogTs(key, `✗ Poll error: ${e.message}`, 'error');
      }
    }, cfg.pollInterval);

  } catch (e) {
    _diagLogTs(key, `✗ Failed to start: ${e.message}`, 'error');
    if (fixBtn) fixBtn.disabled = false;
  }
}

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

// ═══════════════════════════════════════════════════════
// ReelMatch Editing Room — movies.js
// ═══════════════════════════════════════════════════════
console.log('[Movies] ▶ INITIALIZED'); // DEBUG

/* ─── MOVIES ─────────────────────────────────────────────────────────── */
async function loadMovies() {
  document.getElementById('movie-search').value = '';
  document.getElementById('movies-subtitle').textContent = 'Trending Now';
  const wrap = document.getElementById('movies-table-wrap');
  wrap.innerHTML = `<div class="loading"><div class="spinner"></div> Loading trending movies…</div>`;
  try {
    const data = await api('/movies/trending');
    if (!data) return;
    const movies = Array.isArray(data) ? data : (data.results || []);
    renderMoviesTable(movies);
  } catch (e) {
    wrap.innerHTML = `<div class="empty">Error: ${e.message}</div>`;
    toast(e.message, 'error');
  }
}

async function searchMovies() {
  const q = document.getElementById('movie-search').value.trim();
  if (!q) { loadMovies(); return; }
  document.getElementById('movies-subtitle').textContent = 'Search Results';
  const wrap = document.getElementById('movies-table-wrap');
  wrap.innerHTML = `<div class="loading"><div class="spinner"></div> Searching…</div>`;
  try {
    const data = await api(`/admin/movies/search?q=${encodeURIComponent(q)}&page_size=20`);
    if (!data) return;
    const movies = data.movies || data.results || data || [];
    renderMoviesTable(movies);
  } catch (e) {
    wrap.innerHTML = `<div class="empty">Error: ${e.message}</div>`;
    toast(e.message, 'error');
  }
}

async function renderMoviesTable(movies) {
  const wrap = document.getElementById('movies-table-wrap');
  if (!movies.length) { wrap.innerHTML = `<div class="empty">No movies found.</div>`; return; }

  // Fetch RM ratings stats for all movies
  let rmStats = {};
  try {
    const ids = movies.map(m => m.tmdb_id || m.id).filter(Boolean).join(',');
    if (ids) rmStats = await api(`/movies/ratings-stats?tmdb_ids=${ids}`);
  } catch (_) { /* silently show — for all RM Rating cells */ }

  wrap.innerHTML = `
    <div class="table-wrap">
      <table>
        <thead><tr>
          <th>Title</th><th>Year</th><th>TMDB ID</th><th>RM ID</th>
          <th>TMDB Rating</th><th>RM Rating</th><th>Actions</th>
        </tr></thead>
        <tbody>
          ${movies.map(m => {
            const key = String(m.tmdb_id || m.id || '');
            const rm = rmStats[key];
            const rmCell = rm ? `${rm.avg.toFixed(1)} <span style="color:var(--accent)">★</span> <span style="color:var(--text-muted);font-size:11px">(${rm.count})</span>` : '—';
            return `
            <tr style="height:64px">
              <td style="padding-top:0;padding-bottom:0">
                <div style="display:flex;align-items:center;gap:10px;height:100%">
                  ${m.poster_path ? `<img src="https://image.tmdb.org/t/p/w92${m.poster_path}" style="width:auto;height:60px;object-fit:cover;border-radius:3px;flex-shrink:0" />` : '<div style="width:40px;height:60px;background:var(--bg-hover);border-radius:3px;flex-shrink:0"></div>'}
                  <strong>${esc(m.title)}</strong>
                </div>
              </td>
              <td style="color:var(--text-muted)">${(m.release_date||'').slice(0,4)||'—'}</td>
              <td style="font-family:monospace;font-size:12px;color:var(--text-muted)">${m.tmdb_id||m.id||'—'}</td>
              <td style="font-family:monospace;font-size:12px;color:var(--accent)">${m.rm_id ? `RM${m.rm_id}` : '—'}</td>
              <td>${m.vote_average ? `${Number(m.vote_average).toFixed(1)} <span style="color:var(--accent)">★</span>` : '—'}</td>
              <td>${rmCell}</td>
              <td>
                <a href="https://www.themoviedb.org/movie/${m.tmdb_id||m.id}" target="_blank" class="btn btn-ghost btn-sm">TMDB ↗</a>
              </td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>`;
}

/* ─── MOVIE DATA HEALTH ──────────────────────────────────────────────── */
let _movieSelection = new Set();

async function loadMovieHealthStats() {
  const bar = document.getElementById('movie-health-bar');
  bar.innerHTML = `<div class="loading"><div class="spinner"></div></div>`;
  try {
    const s = await api('/admin/movies/health-stats');
    if (!s) return;
    const pill = (label, num, cls, action) =>
      `<div class="health-pill ${cls}" onclick="${action}" title="Click to view">
        <span class="pill-num">${Number(num).toLocaleString()}</span>
        <span>${label}</span>
      </div>`;
    bar.innerHTML = `<div class="health-pills">
      ${pill('Total', s.total, '', 'loadMovies()')}
      ${pill('No Poster',   s.missing_poster,   s.missing_poster   > 0 ? 'warn'   : 'ok', "loadMoviesMissingData('poster_path')")}
      ${pill('No Overview', s.missing_overview, s.missing_overview > 0 ? 'warn'   : 'ok', "loadMoviesMissingData('overview')")}
      ${pill('No Cast',     s.missing_cast,     s.missing_cast     > 0 ? 'warn'   : 'ok', "loadMoviesMissingData('cast_data')")}
      ${pill('No Crew',     s.missing_crew,     s.missing_crew     > 0 ? 'warn'   : 'ok', "loadMoviesMissingData('crew')")}
      ${pill('No Backdrop', s.missing_backdrop, s.missing_backdrop > 0 ? 'warn'   : 'ok', "loadMoviesMissingData('backdrop_path')")}
      ${pill('No Genres',   s.missing_genres,   s.missing_genres   > 0 ? 'warn'   : 'ok', "loadMoviesMissingData('genres')")}
      ${pill('Low Votes',   s.low_vote_count,   s.low_vote_count   > 0 ? 'warn'   : 'ok', 'loadMoviesLowVoteCount()')}
      ${pill('Duplicates',  s.duplicate_titles, s.duplicate_titles > 0 ? 'danger' : 'ok', 'loadMovieDuplicates()')}
    </div>`;
  } catch (e) {
    bar.innerHTML = `<div style="font-size:12px;color:var(--text-muted);padding:6px 0">Health stats unavailable — ${e.message}</div>`;
  }
}

async function loadMovieDuplicates() {
  document.getElementById('movies-subtitle').textContent = 'Duplicate Titles';
  const wrap = document.getElementById('movies-table-wrap');
  wrap.innerHTML = `<div class="loading"><div class="spinner"></div> Finding duplicates…</div>`;
  try {
    const data = await api('/admin/movies/duplicates');
    if (!data) return;
    const groups = data.groups || [];
    if (!groups.length) {
      wrap.innerHTML = `<div class="empty" style="padding:32px;text-align:center;color:var(--text-muted)">No duplicates found.</div>`;
      return;
    }
    wrap.innerHTML = `
      <div style="margin-bottom:12px;font-size:13px;color:var(--text-muted)">${groups.length} duplicate group${groups.length !== 1 ? 's' : ''} found</div>
      ${groups.map(g => `
        <div class="table-wrap" style="margin-bottom:12px">
          <div style="padding:11px 16px;background:var(--bg-hover);font-size:13px;font-weight:600;border-bottom:1px solid var(--border)">
            ${esc(g.title)}
            <span style="color:var(--text-muted);font-weight:400"> (${g.year || 'Unknown year'})</span>
            <span style="color:var(--text-muted);font-size:11px;font-weight:400;margin-left:8px">${g.movies.length} entries</span>
          </div>
          <table><tbody>
            ${g.movies.map(m => `<tr>
              <td style="padding:8px 16px">
                <div style="display:flex;align-items:center;gap:8px">
                  ${m.poster_path
                    ? `<img src="https://image.tmdb.org/t/p/w45${m.poster_path}" style="width:auto;height:42px;border-radius:3px;flex-shrink:0" />`
                    : `<div style="width:28px;height:42px;background:var(--bg-hover);border-radius:3px;flex-shrink:0"></div>`}
                  <strong>${esc(m.title)}</strong>
                </div>
              </td>
              <td style="color:var(--text-muted);font-size:12px">${(m.release_date||'').slice(0,4)||'—'}</td>
              <td style="font-family:monospace;font-size:12px;color:var(--text-muted)">TMDB ${m.tmdb_id}</td>
              <td style="color:var(--text-muted);font-size:12px">${m.vote_count != null ? m.vote_count.toLocaleString() + ' votes' : '—'}</td>
              <td>
                <div style="display:flex;gap:6px">
                  <button class="btn btn-ghost btn-sm" onclick="confirmRefreshMovie(${m.tmdb_id}, '${esc(m.title).replace(/'/g,"\\'")}')">⟳ Re-cache</button>
                  <button class="btn btn-danger btn-sm" onclick="confirmDeleteMovie(${m.tmdb_id}, '${esc(m.title).replace(/'/g,"\\'")}')">Delete</button>
                  <a href="https://www.themoviedb.org/movie/${m.tmdb_id}" target="_blank" class="btn btn-ghost btn-sm">TMDB ↗</a>
                </div>
              </td>
            </tr>`).join('')}
          </tbody></table>
        </div>`).join('')}`;
  } catch (e) {
    wrap.innerHTML = `<div class="empty">Error: ${e.message}</div>`;
    toast(e.message, 'error');
  }
}

async function loadMoviesMissingData(field) {
  const labels = { poster_path: 'Poster', backdrop_path: 'Backdrop', overview: 'Overview', cast_data: 'Cast', crew: 'Crew', genres: 'Genres' };
  document.getElementById('movies-subtitle').textContent = `Missing ${labels[field] || field}`;
  const wrap = document.getElementById('movies-table-wrap');
  wrap.innerHTML = `<div class="loading"><div class="spinner"></div> Loading…</div>`;
  try {
    const data = await api(`/admin/movies/missing-data?field=${field}&page_size=100`);
    if (!data) return;
    renderMoviesHealthTable(data.movies, `${Number(data.total).toLocaleString()} movies missing ${labels[field] || field}`);
  } catch (e) {
    wrap.innerHTML = `<div class="empty">Error: ${e.message}</div>`;
    toast(e.message, 'error');
  }
}

async function loadMoviesLowVoteCount() {
  document.getElementById('movies-subtitle').textContent = 'Low Vote Count (< 10)';
  const wrap = document.getElementById('movies-table-wrap');
  wrap.innerHTML = `<div class="loading"><div class="spinner"></div> Loading…</div>`;
  try {
    const data = await api('/admin/movies/low-vote-count?threshold=10&page_size=100');
    if (!data) return;
    renderMoviesHealthTable(data.movies, `${Number(data.total).toLocaleString()} movies with fewer than 10 votes`);
  } catch (e) {
    wrap.innerHTML = `<div class="empty">Error: ${e.message}</div>`;
    toast(e.message, 'error');
  }
}

async function loadMoviesRecent() {
  document.getElementById('movies-subtitle').textContent = 'Recently Added (7 days)';
  const wrap = document.getElementById('movies-table-wrap');
  wrap.innerHTML = `<div class="loading"><div class="spinner"></div> Loading…</div>`;
  try {
    const data = await api('/admin/movies/recent?days=7&page_size=100');
    if (!data) return;
    renderMoviesHealthTable(data.movies, `${Number(data.total).toLocaleString()} movies added in the last 7 days`, true);
  } catch (e) {
    wrap.innerHTML = `<div class="empty">Error: ${e.message}</div>`;
    toast(e.message, 'error');
  }
}

function renderMoviesHealthTable(movies, subtitle, showDate = false) {
  const wrap = document.getElementById('movies-table-wrap');
  if (!movies.length) {
    wrap.innerHTML = `<div class="empty" style="padding:32px;text-align:center;color:var(--text-muted)">None found.</div>`;
    return;
  }
  _movieSelection.clear();
  updateMovieBulkBar();
  wrap.innerHTML = `
    <div style="margin-bottom:10px;display:flex;align-items:center;justify-content:space-between">
      <span style="font-size:13px;color:var(--text-muted)">${subtitle}</span>
      <label style="font-size:12px;color:var(--text-muted);cursor:pointer;display:flex;align-items:center;gap:6px">
        <input type="checkbox" id="movie-select-all" onchange="toggleSelectAllMovies(this.checked)" /> Select all
      </label>
    </div>
    <div class="table-wrap">
      <table>
        <thead><tr>
          <th style="width:32px"></th>
          <th>Title</th><th>Year</th><th>TMDB ID</th><th>Votes</th>
          ${showDate ? '<th>Added</th>' : ''}
          <th>Actions</th>
        </tr></thead>
        <tbody>
          ${movies.map(m => `
          <tr>
            <td style="padding-right:0">
              <input type="checkbox" class="movie-row-cb" value="${m.tmdb_id}"
                     onchange="toggleMovieSelect(${m.tmdb_id}, this.checked)" />
            </td>
            <td style="padding-top:0;padding-bottom:0;height:52px">
              <div style="display:flex;align-items:center;gap:8px;height:100%">
                ${m.poster_path
                  ? `<img src="https://image.tmdb.org/t/p/w45${m.poster_path}" style="width:auto;height:46px;object-fit:cover;border-radius:3px;flex-shrink:0" />`
                  : `<div style="width:30px;height:46px;background:var(--bg-hover);border-radius:3px;flex-shrink:0"></div>`}
                <strong>${esc(m.title)}</strong>
              </div>
            </td>
            <td style="color:var(--text-muted)">${(m.release_date||'').slice(0,4)||'—'}</td>
            <td style="font-family:monospace;font-size:12px;color:var(--text-muted)">${m.tmdb_id||'—'}</td>
            <td style="color:var(--text-muted)">${m.vote_count != null ? Number(m.vote_count).toLocaleString() : '—'}</td>
            ${showDate ? `<td style="font-size:12px;color:var(--text-muted)">${m.created_at ? formatDate(m.created_at) : '—'}</td>` : ''}
            <td>
              <div style="display:flex;gap:6px">
                <button class="btn btn-ghost btn-sm" onclick="confirmRefreshMovie(${m.tmdb_id}, '${esc(m.title).replace(/'/g,"\\'")}')">⟳ Re-cache</button>
                <button class="btn btn-danger btn-sm" onclick="confirmDeleteMovie(${m.tmdb_id}, '${esc(m.title).replace(/'/g,"\\'")}')">Delete</button>
                <a href="https://www.themoviedb.org/movie/${m.tmdb_id}" target="_blank" class="btn btn-ghost btn-sm">TMDB ↗</a>
              </div>
            </td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>`;
}

function toggleMovieSelect(tmdbId, checked) {
  if (checked) _movieSelection.add(tmdbId);
  else _movieSelection.delete(tmdbId);
  updateMovieBulkBar();
}

function toggleSelectAllMovies(checked) {
  document.querySelectorAll('.movie-row-cb').forEach(cb => {
    cb.checked = checked;
    toggleMovieSelect(parseInt(cb.value), checked);
  });
}

function clearMovieSelection() {
  _movieSelection.clear();
  document.querySelectorAll('.movie-row-cb').forEach(cb => cb.checked = false);
  const all = document.getElementById('movie-select-all');
  if (all) all.checked = false;
  updateMovieBulkBar();
}

function updateMovieBulkBar() {
  const bar = document.getElementById('movie-bulk-bar');
  if (!bar) return;
  const n = _movieSelection.size;
  bar.classList.toggle('visible', n > 0);
  document.getElementById('movie-bulk-count').textContent = `${n} selected`;
}

async function recacheSingleMovie() {
  const raw = document.getElementById('recache-tmdb-id').value.trim();
  const tmdbId = parseInt(raw);
  if (!tmdbId || isNaN(tmdbId)) { toast('Enter a valid TMDB ID', 'error'); return; }
  const btn = event.currentTarget || event.target;
  const origText = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'Re-caching…';
  try {
    const data = await api(`/admin/movies/${tmdbId}/refresh`, { method: 'POST' });
    if (!data) return;
    toast(`Refreshed: ${data.title}`, 'success');
    document.getElementById('recache-tmdb-id').value = '';
    loadMovieHealthStats();
  } catch (e) {
    toast(e.message, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = origText;
  }
}

function confirmRefreshMovie(tmdbId, title) {
  showConfirm('Re-cache Movie', `Re-fetch "${title}" from TMDB and update all fields?`, async () => {
    try {
      const data = await api(`/admin/movies/${tmdbId}/refresh`, { method: 'POST' });
      if (data) toast(`Refreshed: ${data.title}`, 'success');
    } catch (e) { toast(e.message, 'error'); }
  });
}

function confirmDeleteMovie(tmdbId, title) {
  showConfirm('Delete Movie', `Permanently delete "${title}" (TMDB ${tmdbId}) from the database? This cannot be undone.`, async () => {
    try {
      await api(`/admin/movies/${tmdbId}`, { method: 'DELETE' });
      toast(`Deleted "${title}"`, 'success');
      document.querySelectorAll(`input.movie-row-cb[value="${tmdbId}"]`).forEach(cb => cb.closest('tr')?.remove());
      loadMovieHealthStats();
    } catch (e) { toast(e.message, 'error'); }
  });
}

async function bulkDeleteMovies() {
  const ids = [..._movieSelection];
  if (!ids.length) return;
  showConfirm('Bulk Delete', `Permanently delete ${ids.length} selected movies? This cannot be undone.`, async () => {
    let ok = 0, fail = 0;
    for (const id of ids) {
      try { await api(`/admin/movies/${id}`, { method: 'DELETE' }); ok++; }
      catch (_) { fail++; }
    }
    toast(`Deleted ${ok}${fail ? `, ${fail} failed` : ''}`, ok > 0 ? 'success' : 'error');
    clearMovieSelection();
    loadMovieHealthStats();
  });
}

async function bulkRefreshMovies() {
  const ids = [..._movieSelection];
  if (!ids.length) return;
  showConfirm('Bulk Re-cache', `Re-fetch ${ids.length} selected movies from TMDB?`, async () => {
    let ok = 0, fail = 0;
    for (const id of ids) {
      try { await api(`/admin/movies/${id}/refresh`, { method: 'POST' }); ok++; }
      catch (_) { fail++; }
    }
    toast(`Refreshed ${ok}${fail ? `, ${fail} failed` : ''}`, ok > 0 ? 'success' : 'error');
    clearMovieSelection();
    loadMovieHealthStats();
  });
}

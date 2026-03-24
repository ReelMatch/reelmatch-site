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
            const rowClick = m.id ? `onclick="if(!event.target.closest('button,a'))openMoviePanel('${m.id}')"` : '';
            return `
            <tr style="height:64px;${m.id ? 'cursor:pointer' : ''}" ${rowClick}>
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
                ${m.id ? `<button class="btn btn-ghost btn-sm" onclick="openMoviePanel('${m.id}')">Detail</button>` : ''}
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
          <tr${m.id ? ` style="cursor:pointer" onclick="if(!event.target.closest('button,a,input'))openMoviePanel('${m.id}')"` : ''}>
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
                ${m.id ? `<button class="btn btn-ghost btn-sm" onclick="openMoviePanel('${m.id}')">Detail</button>` : ''}
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

/* ─── MOVIE DETAIL PANEL ─────────────────────────────────────────────── */

async function openMoviePanel(movieId) {
  if (!movieId) { toast('No internal ID available for this movie', 'error'); return; }

  const panel   = document.getElementById('movie-detail-panel');
  const overlay = document.getElementById('movie-detail-overlay');
  const content = document.getElementById('movie-detail-content');

  // Show panel with loading state
  panel.style.display = 'block';
  overlay.style.display = 'block';
  content.innerHTML = '<div class="loading" style="padding:48px;text-align:center"><div class="spinner"></div></div>';
  requestAnimationFrame(() => { panel.style.transform = 'translateX(0)'; });

  console.log('[MoviePanel] ▶ opening panel for movie:', movieId); // DEBUG

  try {
    const data = await api(`/admin/movies/${movieId}/detail`);
    console.log('[MoviePanel] ▶ data received:', data); // DEBUG
    renderMoviePanel(data);
  } catch (e) {
    content.innerHTML = `<div style="padding:32px;text-align:center;color:var(--text-muted)">Error loading movie: ${esc(e.message)}</div>`;
  }
}

function closeMoviePanel() {
  const panel   = document.getElementById('movie-detail-panel');
  const overlay = document.getElementById('movie-detail-overlay');
  panel.style.transform = 'translateX(100%)';
  overlay.style.display = 'none';
  setTimeout(() => { panel.style.display = 'none'; }, 300);
}

function renderMoviePanel(data) {
  const el = document.getElementById('movie-detail-content');
  if (!data || !data.movie) {
    el.innerHTML = '<div style="padding:32px;text-align:center;color:var(--text-muted)">Movie not found.</div>';
    return;
  }

  const m        = data.movie;
  const ratings  = data.ratings || {};
  const keywords = data.keywords || [];
  const similar  = data.similar_movies || [];
  const streaming = data.streaming || [];
  const imgBase  = 'https://image.tmdb.org/t/p/';

  // Derived values
  const genres    = (m.genres || []).map(g => (typeof g === 'object' ? g.name : g)).filter(Boolean);
  const castList  = Array.isArray(m.cast) ? m.cast : [];
  const metaParts = [m.year, m.director, m.runtime ? `${m.runtime} min` : null].filter(Boolean);

  // Rating distribution chart (0.5–10.0 in 0.5 steps)
  let distHTML = '';
  if ((ratings.total || 0) > 0 && ratings.distribution) {
    const maxCount = Math.max(...Object.values(ratings.distribution).map(Number), 1);
    const steps = [];
    for (let r = 0.5; r <= 10.01; r += 0.5) steps.push(r.toFixed(1));
    distHTML = steps.map(r => {
      const count = Number(ratings.distribution[r] || 0);
      if (!count) return '';
      const pct = Math.round((count / maxCount) * 100);
      return `<div style="display:flex;align-items:center;gap:6px;margin-bottom:3px">
        <span style="font-size:11px;color:var(--text-muted);width:26px;text-align:right">${r}</span>
        <div style="flex:1;height:8px;background:var(--bg-hover);border-radius:4px;overflow:hidden">
          <div style="width:${pct}%;height:100%;background:#f5a623;border-radius:4px"></div>
        </div>
        <span style="font-size:11px;color:var(--text-muted);width:30px">${count}</span>
      </div>`;
    }).join('');
  }

  // Similar movies
  const sim10  = similar.slice(0, 10);
  const simRest = similar.slice(10);
  const simLine = s => `<div style="font-size:12px;color:var(--text-muted);margin-bottom:4px">
    ${esc(s.title)}${s.year ? ` (${s.year})` : ''} —
    <strong style="color:var(--text-primary)">${Math.round((s.similarity || 0) * 100)}%</strong> match
    · ${(s.shared_raters || 0).toLocaleString()} shared raters
  </div>`;

  // Streaming grouped by type
  const streamGroups = {};
  streaming.forEach(s => {
    const t = s.stream_type || 'other';
    (streamGroups[t] = streamGroups[t] || []).push(s);
  });
  const streamHTML = Object.entries(streamGroups).map(([type, providers]) => `
    <div style="margin-bottom:8px">
      <div style="font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:0.6px;color:var(--text-muted);margin-bottom:4px">${esc(type)}</div>
      <div style="display:flex;flex-wrap:wrap;gap:5px">${providers.map(p =>
        `<span style="font-size:12px;padding:2px 10px;background:var(--bg-hover);border-radius:12px;border:1px solid var(--border)">${esc(p.provider)}</span>`
      ).join('')}</div>
    </div>`).join('');

  el.innerHTML = `
    <!-- HEADER: backdrop + close -->
    <div style="position:relative;flex-shrink:0">
      ${m.backdrop_path
        ? `<div style="width:100%;height:200px;background:linear-gradient(to bottom,rgba(0,0,0,0.25),rgba(15,12,9,0.96)),url('${imgBase}w1280${esc(m.backdrop_path)}') center/cover no-repeat"></div>`
        : `<div style="width:100%;height:80px;background:var(--bg-hover)"></div>`}
      <button onclick="closeMoviePanel()" title="Close" style="position:absolute;top:12px;right:14px;background:rgba(0,0,0,0.55);border:none;color:#fff;font-size:18px;width:30px;height:30px;border-radius:50%;cursor:pointer;display:flex;align-items:center;justify-content:center;line-height:1">×</button>
    </div>

    <div style="padding:20px 24px 40px">

      <!-- POSTER + META -->
      <div style="display:flex;gap:16px;margin-bottom:22px">
        ${m.poster_path
          ? `<img src="${imgBase}w185${esc(m.poster_path)}" style="width:100px;height:auto;border-radius:6px;flex-shrink:0;box-shadow:0 4px 16px rgba(0,0,0,0.4)" />`
          : `<div style="width:100px;height:150px;background:var(--bg-hover);border-radius:6px;flex-shrink:0"></div>`}
        <div style="flex:1;min-width:0">
          <h2 style="font-family:'DM Serif Display',serif;font-size:22px;margin:0 0 6px;line-height:1.2">${esc(m.title || '')}</h2>
          ${metaParts.length ? `<div style="font-size:13px;color:var(--text-muted);margin-bottom:5px">${metaParts.map(String).map(esc).join(' · ')}</div>` : ''}
          ${m.vote_average != null ? `<div style="font-size:13px;margin-bottom:7px">${Number(m.vote_average).toFixed(1)} <span style="color:#f5a623">★</span> <span style="color:var(--text-muted);font-size:11px">(${(m.vote_count || 0).toLocaleString()} votes)</span></div>` : ''}
          ${genres.length ? `<div style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:7px">${genres.map(g => `<span style="font-size:11px;padding:2px 8px;background:var(--bg-hover);border:1px solid var(--border);border-radius:10px">${esc(g)}</span>`).join('')}</div>` : ''}
          ${m.tagline ? `<div style="font-style:italic;font-size:12px;color:var(--text-muted);margin-bottom:6px">"${esc(m.tagline)}"</div>` : ''}
          <div style="font-size:11px;color:var(--text-muted);line-height:1.8">
            TMDB: ${m.tmdb_id || '—'} &nbsp;|&nbsp; ID: ${m.id ? `${m.id.slice(0,8)}…` : '—'}<br/>
            Cached: ${m.cached_at ? formatDate(m.cached_at) : '—'} &nbsp;|&nbsp; Popularity: ${m.popularity != null ? Number(m.popularity).toFixed(1) : '—'}
          </div>
        </div>
      </div>

      <!-- REELMATCH RATINGS -->
      <div style="margin-bottom:22px;border-top:1px solid var(--border);padding-top:16px">
        <div style="font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:0.8px;color:var(--text-muted);margin-bottom:10px">ReelMatch Ratings</div>
        ${!ratings.total
          ? `<div style="font-size:13px;color:var(--text-muted)">No ratings yet</div>`
          : `<div style="font-size:13px;margin-bottom:10px">${(ratings.total).toLocaleString()} ratings &nbsp;·&nbsp; avg <strong>${Number(ratings.average || 0).toFixed(2)}</strong>/10</div>
             <div style="max-width:380px">${distHTML}</div>`}
      </div>

      <!-- OVERVIEW -->
      ${m.overview ? `
      <div style="margin-bottom:22px;border-top:1px solid var(--border);padding-top:16px">
        <div style="font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:0.8px;color:var(--text-muted);margin-bottom:8px">Overview</div>
        <div style="font-size:13px;line-height:1.75;color:var(--text-primary)">${esc(m.overview)}</div>
      </div>` : ''}

      <!-- CAST & CREW -->
      <div style="margin-bottom:22px;border-top:1px solid var(--border);padding-top:16px">
        <div style="font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:0.8px;color:var(--text-muted);margin-bottom:8px">Cast &amp; Crew</div>
        ${m.director ? `<div style="font-size:13px;margin-bottom:8px"><strong>Director:</strong> ${esc(m.director)}</div>` : ''}
        ${castList.length
          ? castList.slice(0, 10).map(c => {
              const name = typeof c === 'object' ? (c.name || '') : String(c);
              const char = typeof c === 'object' ? (c.character || '') : '';
              return `<div style="font-size:12px;color:var(--text-muted);line-height:1.9">${esc(name)}${char ? ` <span style="font-style:italic">— ${esc(char)}</span>` : ''}</div>`;
            }).join('')
          : `<div style="font-size:13px;color:var(--text-muted)">No cast data</div>`}
      </div>

      <!-- KEYWORDS -->
      <div style="margin-bottom:22px;border-top:1px solid var(--border);padding-top:16px">
        <div id="movie-panel-kw-section">
          <div style="font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:0.8px;color:var(--text-muted);margin-bottom:8px">Keywords (${data.keywords_count || 0})</div>
          ${keywords.length
            ? `<div style="display:flex;flex-wrap:wrap;gap:5px">${keywords.map(k =>
                `<span style="font-size:11px;padding:2px 8px;background:var(--bg-surface);border:1px solid var(--border);border-radius:10px">${esc(k.name)}</span>`
              ).join('')}</div>`
            : `<div style="font-size:13px;color:var(--text-muted)">No keywords fetched yet</div>`}
        </div>
      </div>

      <!-- SIMILAR MOVIES -->
      <div style="margin-bottom:22px;border-top:1px solid var(--border);padding-top:16px">
        <div id="movie-panel-sim-section">
        <div style="font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:0.8px;color:var(--text-muted);margin-bottom:8px">Similar Movies (${data.similar_movies_count || 0} computed)</div>
        ${similar.length === 0
          ? `<div style="font-size:13px;color:var(--text-muted)">Similarities not yet computed</div>`
          : `${sim10.map(simLine).join('')}
             ${simRest.length ? `
               <div id="movie-panel-sim-expand" style="margin-top:6px">
                 <button class="btn btn-ghost btn-sm" onclick="
                   document.getElementById('movie-panel-sim-more').style.display='block';
                   document.getElementById('movie-panel-sim-expand').style.display='none'">
                   Show all ${similar.length} →
                 </button>
               </div>
               <div id="movie-panel-sim-more" style="display:none">${simRest.map(simLine).join('')}</div>` : ''}
          `}
      </div>

      <!-- STREAMING -->
      <div style="margin-bottom:22px;border-top:1px solid var(--border);padding-top:16px">
        <div style="font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:0.8px;color:var(--text-muted);margin-bottom:8px">Streaming</div>
        ${streaming.length ? streamHTML : `<div style="font-size:13px;color:var(--text-muted)">No streaming data</div>`}
      </div>

      <!-- ACTIONS -->
      <div id="movie-panel-actions" style="border-top:1px solid var(--border);padding-top:16px">
        <div style="font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:0.8px;color:var(--text-muted);margin-bottom:10px">Actions</div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <button id="movie-panel-btn-keywords" class="btn btn-ghost btn-sm" onclick="moviePanelFetchKeywords('${m.id}')">🔑 Fetch Keywords</button>
          <button id="movie-panel-btn-sim" class="btn btn-ghost btn-sm" onclick="moviePanelComputeSim('${m.id}')">⧫ Compute Similarities</button>
          <button class="btn btn-ghost btn-sm" onclick="toast('Coming soon','info')">⟳ Refresh from TMDB</button>
        </div>
        <div id="movie-panel-action-msg" style="font-size:12px;color:var(--text-muted);margin-top:8px;display:none"></div>
      </div>

    </div>`;
}

async function moviePanelFetchKeywords(movieId) {
  const btn = document.getElementById('movie-panel-btn-keywords');
  const msg = document.getElementById('movie-panel-action-msg');
  if (!btn) return;
  const orig = btn.innerHTML;
  btn.innerHTML = '⟳ Fetching…';
  btn.disabled = true;
  msg.style.display = 'none';
  try {
    const data = await api(`/admin/movies/${movieId}/fetch-keywords`, { method: 'POST' });
    if (!data) return;
    msg.textContent = `✓ ${data.keywords_count} keywords fetched`;
    msg.style.color = 'var(--success, #22c55e)';
    msg.style.display = 'block';
    // Re-render just the keywords section
    const detail = await api(`/admin/movies/${movieId}/detail`);
    if (detail) {
      const keywords = detail.keywords || [];
      const kwSection = document.getElementById('movie-panel-kw-section');
      if (kwSection) {
        const chips = keywords.length
          ? `<div style="display:flex;flex-wrap:wrap;gap:5px">${keywords.map(k =>
              `<span style="font-size:11px;padding:2px 8px;background:var(--bg-surface);border:1px solid var(--border);border-radius:10px">${esc(k.name)}</span>`
            ).join('')}</div>`
          : `<div style="font-size:13px;color:var(--text-muted)">No keywords fetched yet</div>`;
        kwSection.innerHTML = `<div style="font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:0.8px;color:var(--text-muted);margin-bottom:8px">Keywords (${detail.keywords_count || 0})</div>${chips}`;
      }
    }
  } catch (e) {
    msg.textContent = `✗ ${e.message}`;
    msg.style.color = 'var(--danger, #ef4444)';
    msg.style.display = 'block';
  } finally {
    btn.innerHTML = orig;
    btn.disabled = false;
  }
}

async function moviePanelComputeSim(movieId) {
  const btn = document.getElementById('movie-panel-btn-sim');
  const msg = document.getElementById('movie-panel-action-msg');
  if (!btn) return;
  const orig = btn.innerHTML;
  btn.innerHTML = '⟳ Computing…';
  btn.disabled = true;
  msg.style.display = 'none';
  try {
    const data = await api(`/admin/movies/${movieId}/compute-similarities`, { method: 'POST' });
    if (!data) return;
    msg.textContent = `✓ ${data.similar_movies_count} similar movies computed`;
    msg.style.color = 'var(--success, #22c55e)';
    msg.style.display = 'block';
    // Re-render just the similar movies section
    const detail = await api(`/admin/movies/${movieId}/detail`);
    if (detail) {
      const similar = detail.similar_movies || [];
      const simSection = document.getElementById('movie-panel-sim-section');
      if (simSection) {
        const sim10   = similar.slice(0, 10);
        const simRest = similar.slice(10);
        const simLine = s => `<div style="font-size:12px;color:var(--text-muted);margin-bottom:4px">
          ${esc(s.title)}${s.year ? ` (${s.year})` : ''} —
          <strong style="color:var(--text-primary)">${Math.round((s.similarity || 0) * 100)}%</strong> match
          · ${(s.shared_raters || 0).toLocaleString()} shared raters
        </div>`;
        const simHTML = similar.length === 0
          ? `<div style="font-size:13px;color:var(--text-muted)">Similarities not yet computed</div>`
          : `${sim10.map(simLine).join('')}${simRest.length ? `
            <div id="movie-panel-sim-expand" style="margin-top:6px">
              <button class="btn btn-ghost btn-sm" onclick="
                document.getElementById('movie-panel-sim-more').style.display='block';
                document.getElementById('movie-panel-sim-expand').style.display='none'">
                Show all ${similar.length} →
              </button>
            </div>
            <div id="movie-panel-sim-more" style="display:none">${simRest.map(simLine).join('')}</div>` : ''}`;
        simSection.innerHTML = `<div style="font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:0.8px;color:var(--text-muted);margin-bottom:8px">Similar Movies (${detail.similar_movies_count || 0} computed)</div>${simHTML}`;
      }
    }
  } catch (e) {
    msg.textContent = `✗ ${e.message}`;
    msg.style.color = 'var(--danger, #ef4444)';
    msg.style.display = 'block';
  } finally {
    btn.innerHTML = orig;
    btn.disabled = false;
  }
}

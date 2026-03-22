// ═══════════════════════════════════════════════════════
// ReelMatch Editing Room — analytics.js
// ═══════════════════════════════════════════════════════
console.log('[Analytics] ▶ INITIALIZED'); // DEBUG

/* ─── ANALYTICS ──────────────────────────────────────────────────────── */

let _analyticsTab    = 'growth';
let _analyticsRange  = { preset: '30d', start: null, end: null };
let _analyticsCache  = {};   // keyed by `${tab}-${start}-${end}`
let _analyticsCharts = {};   // keyed by chart canvas id

function _analyticsDateParams() {
  const { start, end } = _currentAnalyticsDates();
  return `start_date=${start}&end_date=${end}`;
}

function _currentAnalyticsDates() {
  const now   = new Date();
  const end   = now.toISOString();
  const presets = { '7d': 7, '30d': 30, '90d': 90, '1y': 365 };
  if (_analyticsRange.preset === 'custom' && _analyticsRange.start && _analyticsRange.end) {
    return { start: _analyticsRange.start + 'T00:00:00Z', end: _analyticsRange.end + 'T23:59:59Z' };
  }
  const days = presets[_analyticsRange.preset] || 30;
  const start = new Date(now.getTime() - days * 86400000).toISOString();
  return { start, end };
}

function _analyticsCacheKey(tab) {
  const { start, end } = _currentAnalyticsDates();
  return `${tab}|${start.slice(0,10)}|${end.slice(0,10)}`;
}

function _destroyChart(id) {
  if (_analyticsCharts[id]) { _analyticsCharts[id].destroy(); delete _analyticsCharts[id]; }
}

function _chartColors() {
  const s = getComputedStyle(document.documentElement);
  return {
    accent:    '#c0392b',
    blue:      '#3b82f6',
    green:     '#2e7d32',
    text:      s.getPropertyValue('--text-muted').trim() || '#6b6560',
    border:    s.getPropertyValue('--border').trim()     || 'rgba(245,240,232,0.1)',
    surface:   s.getPropertyValue('--bg-surface').trim() || '#1a1612',
  };
}

function _makeChart(id, config) {
  _destroyChart(id);
  const canvas = document.getElementById(id);
  if (!canvas) return null;
  const c = _chartColors();
  const defaults = {
    plugins: { legend: { labels: { color: c.text, font: { family: 'DM Sans', size: 11 } } }, tooltip: { backgroundColor: c.surface, titleColor: c.text, bodyColor: c.text, borderColor: c.border, borderWidth: 1, cornerRadius: 6 } },
    scales: config.type !== 'pie' && config.type !== 'doughnut' ? {
      x: { ticks: { color: c.text, font: { size: 11 } }, grid: { color: c.border } },
      y: { ticks: { color: c.text, font: { size: 11 } }, grid: { color: c.border } },
    } : undefined,
  };
  config.options = Object.assign({}, defaults, config.options || {});
  if (defaults.scales && config.options.scales !== false) config.options.scales = defaults.scales;
  _analyticsCharts[id] = new Chart(canvas, config);
  return _analyticsCharts[id];
}

function _lineChart(id, labels, datasets) {
  const c = _chartColors();
  const colors = [c.accent, c.blue, c.green, '#a78bfa', '#fb923c'];
  return _makeChart(id, {
    type: 'line',
    data: {
      labels,
      datasets: datasets.map((d, i) => ({
        label: d.label, data: d.data,
        borderColor: d.color || colors[i % colors.length],
        backgroundColor: 'transparent',
        borderWidth: 2, pointRadius: 2, tension: 0.3,
      })),
    },
  });
}

function _barChart(id, labels, data, color, horizontal) {
  const c = _chartColors();
  return _makeChart(id, {
    type: 'bar',
    data: { labels, datasets: [{ data, backgroundColor: color || c.accent + 'cc', borderRadius: 4 }] },
    options: {
      indexAxis: horizontal ? 'y' : 'x',
      plugins: { legend: { display: false } },
    },
  });
}

function _doughnutChart(id, labels, data) {
  const palette = ['#c0392b','#3b82f6','#2e7d32','#a78bfa','#fb923c','#06b6d4','#f59e0b','#ec4899','#10b981','#6366f1'];
  return _makeChart(id, {
    type: 'doughnut',
    data: { labels, datasets: [{ data, backgroundColor: palette, borderWidth: 0 }] },
    options: { cutout: '60%', plugins: { legend: { position: 'right' } } },
  });
}

function _pieChart(id, labels, data) {
  const palette = ['#c0392b','#3b82f6','#2e7d32','#a78bfa','#fb923c','#06b6d4','#f59e0b','#ec4899'];
  return _makeChart(id, {
    type: 'pie',
    data: { labels, datasets: [{ data, backgroundColor: palette, borderWidth: 0 }] },
    options: { plugins: { legend: { position: 'right' } } },
  });
}

function _skeletonCard(h) {
  return `<div class="analytics-skeleton" style="height:${h || 200}px;border-radius:10px;margin-bottom:16px"></div>`;
}

function _statCard(label, value, sub) {
  return `<div class="analytics-stat-card"><div class="asc-label">${label}</div><div class="asc-value">${value}</div>${sub ? `<div class="asc-sub">${sub}</div>` : ''}</div>`;
}

function _fmt(n) { return (n ?? 0).toLocaleString(); }

async function loadAnalytics() {
  // Validate Chart.js is loaded
  if (typeof Chart === 'undefined') {
    document.getElementById('analytics-content').innerHTML = `<div class="empty" style="padding:40px;text-align:center">Chart.js failed to load. Check network connectivity.</div>`;
    return;
  }
  await setAnalyticsTab(_analyticsTab, false);
}

function setAnalyticsRange(preset) {
  _analyticsRange.preset = preset;
  document.querySelectorAll('.range-pill').forEach(b => b.classList.remove('active'));
  const btn = document.getElementById(`range-${preset}`);
  if (btn) btn.classList.add('active');
  const cust = document.getElementById('analytics-custom-range');
  if (cust) cust.style.display = preset === 'custom' ? 'flex' : 'none';
  if (preset !== 'custom') {
    _analyticsCache = {};  // invalidate all cache on range change
    setAnalyticsTab(_analyticsTab, false);
  }
}

function applyCustomRange() {
  const from = document.getElementById('analytics-from')?.value;
  const to   = document.getElementById('analytics-to')?.value;
  if (from && to && from <= to) {
    _analyticsRange.start = from;
    _analyticsRange.end   = to;
    _analyticsCache = {};
    setAnalyticsTab(_analyticsTab, false);
  }
}

async function setAnalyticsTab(tab, updateButtons = true) {
  _analyticsTab = tab;
  if (updateButtons !== false) {
    document.querySelectorAll('.analytics-tab').forEach(b => b.classList.remove('active'));
    const btn = document.getElementById(`atab-${tab}`);
    if (btn) btn.classList.add('active');
  }

  const key = _analyticsCacheKey(tab);
  if (_analyticsCache[key]) {
    _renderTab(tab, _analyticsCache[key]);
    return;
  }

  const wrap = document.getElementById('analytics-content');
  wrap.innerHTML = `${_skeletonCard(120)}${_skeletonCard(280)}${_skeletonCard(180)}`;

  try {
    const params = _analyticsDateParams();
    const data = await api(`/admin/analytics/${tab}?${params}`);
    _analyticsCache[key] = data;
    _renderTab(tab, data);
  } catch (e) {
    wrap.innerHTML = `<div class="empty" style="padding:40px;text-align:center;color:var(--text-muted)">
      Failed to load — <span style="color:var(--accent);cursor:pointer" onclick="setAnalyticsTab('${tab}')">↺ retry</span>
      <div style="font-size:11px;margin-top:6px">${esc(e.message)}</div>
    </div>`;
  }
}

function _renderTab(tab, data) {
  switch (tab) {
    case 'growth':     _renderGrowth(data);     break;
    case 'engagement': _renderEngagement(data); break;
    case 'content':    _renderContent(data);    break;
    case 'moderation': _renderModeration(data); break;
    case 'platform':   _renderPlatform(data);   break;
    case 'investor':   _renderInvestor(data);   break;
  }
}

/* ── Growth ── */
function _renderGrowth(d) {
  const wrap = document.getElementById('analytics-content');
  const days  = d.signups_by_day || [];
  const labels = days.map(x => x.date);
  const counts = days.map(x => x.count);

  wrap.innerHTML = `
    <div class="analytics-stat-cards">
      ${_statCard('Total Users',      _fmt(d.total_users),        '')}
      ${_statCard('New This Period',   _fmt(d.new_users_period),   '')}
      ${_statCard('7-Day Retention',  (d.retention_7day  ?? 0) + '%', 'rated within 7d of signup')}
      ${_statCard('30-Day Retention', (d.retention_30day ?? 0) + '%', 'rated within 30d of signup')}
    </div>
    <div class="analytics-chart-wrap">
      <div class="analytics-subhead">Signups per Day</div>
      <canvas id="chart-signups"></canvas>
    </div>`;

  _lineChart('chart-signups', labels, [{ label: 'Signups', data: counts }]);
}

/* ── Engagement ── */
function _renderEngagement(d) {
  const wrap = document.getElementById('analytics-content');
  const rDays = d.ratings_by_day  || [];
  const rvDays = d.reviews_by_day || [];
  const topG   = (d.genre_distribution || []).slice(0, 10);
  const active = d.most_active_users || [];

  wrap.innerHTML = `
    <div class="analytics-stat-cards">
      ${_statCard('Ratings This Period', _fmt(d.total_ratings_period), '')}
      ${_statCard('Reviews This Period', _fmt(d.total_reviews_period), '')}
      ${_statCard('Avg Ratings/User',    d.avg_ratings_per_user ?? 0,  '')}
    </div>
    <div class="analytics-two-col">
      <div class="analytics-chart-wrap"><div class="analytics-subhead">Ratings per Day</div><canvas id="chart-ratings-day"></canvas></div>
      <div class="analytics-chart-wrap"><div class="analytics-subhead">Reviews per Day</div><canvas id="chart-reviews-day"></canvas></div>
    </div>
    <div class="analytics-chart-wrap">
      <div class="analytics-subhead">Genre Distribution (top 10)</div>
      <canvas id="chart-genres"></canvas>
    </div>
    <div class="analytics-table-wrap">
      <div class="analytics-subhead" style="padding:12px 14px 0">Most Active Users</div>
      <table>
        <thead><tr><th>#</th><th>Username</th><th>Ratings</th><th>Reviews</th></tr></thead>
        <tbody>
          ${active.map((u, i) => `
            <tr><td style="color:var(--text-muted)">${i+1}</td>
            <td><strong>@${esc(u.username)}</strong></td>
            <td>${_fmt(u.rating_count)}</td>
            <td>${_fmt(u.review_count)}</td></tr>`).join('') || '<tr><td colspan="4" style="text-align:center;color:var(--text-muted)">No data</td></tr>'}
        </tbody>
      </table>
    </div>`;

  const c = _chartColors();
  _lineChart('chart-ratings-day', rDays.map(x=>x.date), [{ label: 'Ratings', data: rDays.map(x=>x.count), color: c.accent }]);
  _lineChart('chart-reviews-day', rvDays.map(x=>x.date), [{ label: 'Reviews', data: rvDays.map(x=>x.count), color: c.blue }]);
  _barChart('chart-genres', topG.map(x=>x.genre), topG.map(x=>x.count), null, true);
}

/* ── Content ── */
let _openGenreIdx = null;

function _renderContent(d) {
  const wrap   = document.getElementById('analytics-content');
  const rated  = d.most_rated_movies || [];
  const watch  = d.most_watchlisted  || [];
  const prov   = (d.streaming_provider_popularity || []).slice(0, 8);
  const rdist  = d.ratings_distribution || [];
  const genres = d.most_rated_genres   || [];
  const topPG  = d.top_movies_per_genre || [];
  const years  = d.most_rated_years    || [];
  _openGenreIdx = null;

  // Build decade buckets from year data for bar chart
  const decadeBuckets = {};
  years.forEach(y => {
    const dec = Math.floor(parseInt(y.year, 10) / 10) * 10;
    const k = `${dec}s`;
    decadeBuckets[k] = (decadeBuckets[k] || 0) + y.total_ratings;
  });
  const decadeLabels = Object.keys(decadeBuckets).sort();
  const decadeVals   = decadeLabels.map(k => decadeBuckets[k]);

  wrap.innerHTML = `
    <div class="analytics-two-col">
      <div class="analytics-table-wrap">
        <div class="analytics-subhead" style="padding:12px 14px 0">Most Rated Movies</div>
        <table>
          <thead><tr><th>#</th><th>Title</th><th>Year</th><th>Ratings</th><th>Avg</th></tr></thead>
          <tbody>
            ${rated.map((m,i) => `<tr>
              <td style="color:var(--text-muted)">${i+1}</td>
              <td style="max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(m.title)}</td>
              <td style="color:var(--text-muted)">${m.year||'—'}</td>
              <td>${_fmt(m.rating_count)}</td>
              <td style="color:#f5a623">${m.avg_rating}</td>
            </tr>`).join('') || '<tr><td colspan="5" style="text-align:center;color:var(--text-muted)">No data</td></tr>'}
          </tbody>
        </table>
      </div>
      <div class="analytics-table-wrap">
        <div class="analytics-subhead" style="padding:12px 14px 0">Most Watchlisted</div>
        <table>
          <thead><tr><th>#</th><th>Title</th><th>Year</th><th>Count</th></tr></thead>
          <tbody>
            ${watch.map((m,i) => `<tr>
              <td style="color:var(--text-muted)">${i+1}</td>
              <td style="max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(m.title)}</td>
              <td style="color:var(--text-muted)">${m.year||'—'}</td>
              <td>${_fmt(m.count)}</td>
            </tr>`).join('') || '<tr><td colspan="4" style="text-align:center;color:var(--text-muted)">No data</td></tr>'}
          </tbody>
        </table>
      </div>
    </div>
    <div class="analytics-two-col">
      <div class="analytics-chart-wrap">
        <div class="analytics-subhead">Streaming Provider Popularity</div>
        <canvas id="chart-providers"></canvas>
      </div>
      <div class="analytics-chart-wrap">
        <div class="analytics-subhead">Rating Distribution</div>
        <canvas id="chart-rdist"></canvas>
      </div>
    </div>

    <div class="analytics-subhead" style="margin-top:8px">By Genre</div>
    ${genres.length ? `
      <div class="genre-carousel-wrap">
        <button class="genre-carousel-btn" id="genre-btn-left" onclick="_genreScroll(-1)" aria-label="Scroll left">&#8592;</button>
        <div class="genre-scroll-outer" id="genre-scroll-outer">
          <div class="genre-scroll-row" id="genre-scroll-row">
            ${genres.map((g, i) => `
              <div class="genre-card" id="genre-card-${i}" onclick="_toggleGenreCard(${i})">
                <div class="genre-card-name">${esc(g.genre)}</div>
                <div class="genre-card-rating">${renderStars(g.avg_rating)} ${g.avg_rating}</div>
                <div class="genre-card-meta">${_fmt(g.total_ratings)} ratings &middot; ${_fmt(g.movie_count)} movies</div>
              </div>`).join('')}
          </div>
        </div>
        <button class="genre-carousel-btn" id="genre-btn-right" onclick="_genreScroll(1)" aria-label="Scroll right">&#8594;</button>
      </div>
      <div class="genre-scroll-dots" id="genre-scroll-dots"></div>
      <div id="genre-movies-panel" class="genre-movies-panel"></div>
    ` : '<p style="color:var(--text-muted);font-size:13px;margin-bottom:20px">No genre data available.</p>'}

    <div class="analytics-subhead" style="margin-top:4px">By Release Year</div>
    ${decadeLabels.length ? `
      <div class="analytics-chart-wrap" style="margin-bottom:20px">
        <canvas id="chart-decades"></canvas>
      </div>
    ` : '<p style="color:var(--text-muted);font-size:13px;margin-bottom:20px">No year data available.</p>'}
  `;

  // Store top-movies-per-genre on the panel element for use in toggle
  const panel = document.getElementById('genre-movies-panel');
  if (panel) panel._topPG = topPG;

  if (prov.length)          _doughnutChart('chart-providers', prov.map(x=>x.provider_name), prov.map(x=>x.user_count));
  if (rdist.length)         _barChart('chart-rdist', rdist.map(x=>x.rating_value), rdist.map(x=>x.count));
  if (decadeLabels.length)  _barChart('chart-decades', decadeLabels, decadeVals);

  // Init carousel after render
  requestAnimationFrame(_initGenreCarousel);
}

function _initGenreCarousel() {
  const row = document.getElementById('genre-scroll-row');
  const outer = document.getElementById('genre-scroll-outer');
  const dotsEl = document.getElementById('genre-scroll-dots');
  const btnL = document.getElementById('genre-btn-left');
  const btnR = document.getElementById('genre-btn-right');
  if (!row || !outer || !dotsEl) return;

  const cardW = 180 + 12; // card width + gap
  const visibleCount = () => Math.floor(outer.offsetWidth / cardW);
  const totalCards = row.children.length;

  // Build dots
  const numDots = Math.max(1, Math.ceil(totalCards / 3));
  dotsEl.innerHTML = Array.from({length: numDots}, (_, i) =>
    `<div class="genre-scroll-dot${i===0?' active':''}" onclick="_genreScrollToDot(${i})"></div>`
  ).join('');

  _updateGenreCarouselState();

  row.addEventListener('scroll', () => {
    _updateGenreCarouselState();
  }, {passive: true});
}

function _updateGenreCarouselState() {
  const row = document.getElementById('genre-scroll-row');
  const outer = document.getElementById('genre-scroll-outer');
  const dotsEl = document.getElementById('genre-scroll-dots');
  const btnL = document.getElementById('genre-btn-left');
  const btnR = document.getElementById('genre-btn-right');
  if (!row || !outer) return;

  const cardW = 180 + 12;
  const scrollLeft = row.scrollLeft;
  const maxScroll = row.scrollWidth - row.clientWidth;

  if (btnL) btnL.disabled = scrollLeft <= 0;
  if (btnR) btnR.disabled = maxScroll <= 0 || scrollLeft >= maxScroll - 1;

  // Update active dot
  if (dotsEl) {
    const dotIdx = Math.round(scrollLeft / (cardW * 3));
    dotsEl.querySelectorAll('.genre-scroll-dot').forEach((d, i) => {
      d.classList.toggle('active', i === dotIdx);
    });
  }
}

function _genreScroll(dir) {
  const row = document.getElementById('genre-scroll-row');
  if (!row) return;
  const cardW = 180 + 12;
  row.scrollBy({ left: dir * cardW * 3, behavior: 'smooth' });
  setTimeout(_updateGenreCarouselState, 350);
}

function _genreScrollToDot(dotIdx) {
  const row = document.getElementById('genre-scroll-row');
  if (!row) return;
  const cardW = 180 + 12;
  row.scrollTo({ left: dotIdx * cardW * 3, behavior: 'smooth' });
  setTimeout(_updateGenreCarouselState, 350);
}

function _toggleGenreCard(idx) {
  const panel = document.getElementById('genre-movies-panel');
  const topPG = panel && panel._topPG ? panel._topPG : [];

  // If clicking the already-open card, close it
  if (_openGenreIdx === idx) {
    _openGenreIdx = null;
    document.getElementById(`genre-card-${idx}`).classList.remove('open');
    panel.classList.remove('open');
    setTimeout(() => { panel.innerHTML = ''; }, 310);
    return;
  }

  // Close previous card if open
  if (_openGenreIdx !== null) {
    const prev = document.getElementById(`genre-card-${_openGenreIdx}`);
    if (prev) prev.classList.remove('open');
  }

  _openGenreIdx = idx;
  document.getElementById(`genre-card-${idx}`).classList.add('open');

  const entry = topPG[idx];
  if (!entry) { panel.classList.remove('open'); return; }

  const TMDB_IMG = 'https://image.tmdb.org/t/p/w92';
  const movies = entry.movies || [];
  const movieCards = movies.length ? movies.map(m => {
    const posterHTML = m.poster_path
      ? `<img class="genre-panel-poster" src="${TMDB_IMG}${esc(m.poster_path)}" alt="${esc(m.title)}" loading="lazy">`
      : `<div class="genre-panel-poster-placeholder">🎬</div>`;
    return `<div class="genre-panel-movie">
      ${posterHTML}
      <div class="genre-panel-title">${esc(m.title)}</div>
      <div class="genre-panel-year">${m.year || '—'}</div>
      <div class="genre-panel-stars">${renderStars(m.avg_rating)} ${m.avg_rating}</div>
    </div>`;
  }).join('') : '<p style="color:var(--text-muted);font-size:13px">No qualifying movies (min. 3 ratings).</p>';

  panel.innerHTML = `
    <div class="genre-panel-inner">
      <div class="genre-panel-heading">
        ${esc(entry.genre)}
        <span class="genre-panel-link">View all ${esc(entry.genre)} movies &rarr;</span>
      </div>
      <div class="genre-panel-movies">${movieCards}</div>
    </div>
  `;
  panel.classList.add('open');

  // Scroll the card into view smoothly
  document.getElementById(`genre-card-${idx}`).scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
}

/* ── Moderation ── */
function _renderModeration(d) {
  const wrap = document.getElementById('analytics-content');
  const rDays  = d.reports_by_day         || [];
  const cDays  = d.content_removed_by_day || [];
  const byReason = d.reports_by_reason    || [];
  const offenders = d.repeat_offenders    || [];

  wrap.innerHTML = `
    <div class="analytics-stat-cards">
      ${_statCard('Resolution Rate', (d.resolution_rate ?? 0) + '%', 'resolved + dismissed / total')}
      ${_statCard('Reports This Period', _fmt(rDays.reduce((s,x)=>s+x.count,0)), '')}
      ${_statCard('Removals This Period', _fmt(cDays.reduce((s,x)=>s+x.count,0)), '')}
    </div>
    <div class="analytics-two-col">
      <div class="analytics-chart-wrap"><div class="analytics-subhead">Reports per Day</div><canvas id="chart-reports-day"></canvas></div>
      <div class="analytics-chart-wrap"><div class="analytics-subhead">Content Removed per Day</div><canvas id="chart-removed-day"></canvas></div>
    </div>
    <div class="analytics-two-col">
      <div class="analytics-chart-wrap"><div class="analytics-subhead">Reports by Reason</div><canvas id="chart-reason-pie"></canvas></div>
      <div class="analytics-table-wrap">
        <div class="analytics-subhead" style="padding:12px 14px 0">Repeat Offenders</div>
        <table>
          <thead><tr><th>Username</th><th>Reported</th><th>Removed</th></tr></thead>
          <tbody>
            ${offenders.map(o => `<tr>
              <td><strong>@${esc(o.username)}</strong></td>
              <td>${_fmt(o.report_count)}</td>
              <td style="color:var(--accent)">${_fmt(o.removal_count)}</td>
            </tr>`).join('') || '<tr><td colspan="3" style="text-align:center;color:var(--text-muted)">No data</td></tr>'}
          </tbody>
        </table>
      </div>
    </div>`;

  const c = _chartColors();
  _lineChart('chart-reports-day', rDays.map(x=>x.date), [{ label: 'Reports', data: rDays.map(x=>x.count), color: c.accent }]);
  _lineChart('chart-removed-day', cDays.map(x=>x.date), [{ label: 'Removed', data: cDays.map(x=>x.count), color: c.blue }]);
  if (byReason.length) _pieChart('chart-reason-pie', byReason.map(x=>x.reason), byReason.map(x=>x.count));
}

/* ── Platform ── */
function _renderPlatform(d) {
  const wrap = document.getElementById('analytics-content');
  const jobs   = d.import_jobs         || [];
  const emails = d.email_sends_by_type || [];

  wrap.innerHTML = `
    <div class="analytics-stat-cards">
      ${_statCard('Active Sessions', _fmt(d.active_sessions), 'users active in last 24h')}
      ${_statCard('Total Groups',    _fmt(d.total_groups),    '')}
    </div>
    <div class="analytics-two-col">
      <div class="analytics-table-wrap">
        <div class="analytics-subhead" style="padding:12px 14px 0">Recent Import Jobs</div>
        <table>
          <thead><tr><th>Source</th><th>Status</th><th>Records</th><th>Date</th></tr></thead>
          <tbody>
            ${jobs.map(j => `<tr>
              <td>${esc(j.source)}</td>
              <td><span class="badge badge-${j.status === 'completed' ? 'verified' : j.status === 'failed' ? 'suspended' : 'pending'}">${esc(j.status)}</span></td>
              <td>${_fmt(j.processed_records)}</td>
              <td style="font-size:11px;color:var(--text-muted)">${formatDate(j.created_at)}</td>
            </tr>`).join('') || '<tr><td colspan="4" style="text-align:center;color:var(--text-muted)">No jobs</td></tr>'}
          </tbody>
        </table>
      </div>
      <div class="analytics-chart-wrap">
        <div class="analytics-subhead">Notifications by Type</div>
        ${emails.length ? '<canvas id="chart-emails"></canvas>' : '<div style="padding:24px;color:var(--text-muted);text-align:center">No notifications in period</div>'}
      </div>
    </div>`;

  if (emails.length) _barChart('chart-emails', emails.map(x=>x.type), emails.map(x=>x.count));
}

/* ── Investor ── */
function _renderInvestor(d) {
  const wrap = document.getElementById('analytics-content');
  const hClass = { healthy: 'health-healthy', degraded: 'health-degraded', critical: 'health-critical' };
  const wowSign = d.growth_rate_wow >= 0 ? '+' : '';
  const momSign = d.growth_rate_mom >= 0 ? '+' : '';
  const wowClass = d.growth_rate_wow >= 0 ? 'positive' : 'negative';
  const momClass = d.growth_rate_mom >= 0 ? 'positive' : 'negative';

  wrap.innerHTML = `
    <div style="text-align:center;margin-bottom:28px">
      <div style="font-family:'DM Serif Display',serif;font-size:28px;margin-bottom:4px">Reel<span style="color:var(--accent)">Match</span></div>
      <div style="font-size:13px;color:var(--text-muted)">Platform Analytics — ${document.getElementById('analytics-subtitle')?.textContent || ''}</div>
    </div>
    <div class="investor-kpi-grid">
      <div class="investor-kpi"><div class="kpi-label">Monthly Active Users</div><div class="kpi-value">${_fmt(d.mau)}</div><div class="kpi-sub">last 30 days</div></div>
      <div class="investor-kpi"><div class="kpi-label">Daily Active Users</div><div class="kpi-value">${_fmt(d.dau)}</div><div class="kpi-sub">today</div></div>
      <div class="investor-kpi"><div class="kpi-label">DAU / MAU Ratio</div><div class="kpi-value">${((d.dau_mau_ratio || 0) * 100).toFixed(1)}%</div><div class="kpi-sub">≥20% is excellent</div></div>
      <div class="investor-kpi"><div class="kpi-label">Total Users</div><div class="kpi-value">${_fmt(d.total_users)}</div></div>
      <div class="investor-kpi"><div class="kpi-label">Total Ratings</div><div class="kpi-value">${_fmt(d.total_ratings)}</div></div>
      <div class="investor-kpi"><div class="kpi-label">Avg Ratings / User</div><div class="kpi-value">${d.avg_ratings_per_user ?? 0}</div></div>
    </div>
    <div class="investor-growth-row">
      <div class="investor-growth-card"><div class="igc-label">WoW Growth</div><div class="igc-value ${wowClass}">${wowSign}${d.growth_rate_wow ?? 0}%</div></div>
      <div class="investor-growth-card"><div class="igc-label">MoM Growth</div><div class="igc-value ${momClass}">${momSign}${d.growth_rate_mom ?? 0}%</div></div>
      <div class="investor-growth-card"><div class="igc-label">Ratings This Week</div><div class="igc-value">${_fmt(d.ratings_this_week)}</div></div>
      <div class="investor-growth-card"><div class="igc-label">Ratings Last Week</div><div class="igc-value">${_fmt(d.ratings_last_week)}</div></div>
      <div class="investor-growth-card"><div class="igc-label">Platform Health</div><div style="margin-top:4px"><span class="health-badge ${hClass[d.platform_health] || 'health-degraded'}">${d.platform_health || '—'}</span></div></div>
    </div>
    <div class="investor-charts-row">
      <div class="analytics-chart-wrap"><div class="analytics-subhead">User Growth (signups/day)</div><canvas id="chart-inv-growth"></canvas></div>
      <div class="analytics-chart-wrap"><div class="analytics-subhead">Daily Ratings Activity</div><canvas id="chart-inv-ratings"></canvas></div>
    </div>
    <div style="text-align:center;margin-top:8px;font-size:11px;color:var(--text-muted)">
      Generated by ReelMatch Editing Room — ${new Date().toUTCString()}
    </div>`;

  // Fetch supporting time series for the charts (growth + engagement data)
  const params = _analyticsDateParams();
  Promise.all([
    api(`/admin/analytics/growth?${params}`).catch(() => null),
    api(`/admin/analytics/engagement?${params}`).catch(() => null),
  ]).then(([gd, ed]) => {
    if (gd?.signups_by_day) {
      const days = gd.signups_by_day;
      _lineChart('chart-inv-growth', days.map(x=>x.date), [{ label: 'Signups', data: days.map(x=>x.count) }]);
    }
    if (ed?.ratings_by_day) {
      const days = ed.ratings_by_day;
      _lineChart('chart-inv-ratings', days.map(x=>x.date), [{ label: 'Ratings', data: days.map(x=>x.count) }]);
    }
  });
}

/* ── PDF Export ── */
async function exportAnalyticsPDF() {
  if (typeof window.jspdf === 'undefined') { toast('PDF library not loaded', 'error'); return; }
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' });
  const tab  = _analyticsTab;
  const date = new Date().toISOString().slice(0, 10);
  const W    = 210;
  let y = 20;

  // Header
  doc.setFontSize(20); doc.setFont('helvetica', 'bold');
  doc.text('ReelMatch', W / 2, y, { align: 'center' }); y += 8;
  doc.setFontSize(11); doc.setFont('helvetica', 'normal');
  doc.setTextColor(150);
  doc.text(`${tab.charAt(0).toUpperCase() + tab.slice(1)} Analytics — ${date}`, W / 2, y, { align: 'center' }); y += 12;
  doc.setTextColor(0);

  // Export each chart as image
  const canvases = document.querySelectorAll('#analytics-content canvas');
  for (const canvas of canvases) {
    try {
      const imgData = canvas.toDataURL('image/png');
      const aspect  = canvas.width / canvas.height;
      const imgW    = 170; const imgH = imgW / aspect;
      if (y + imgH > 270) { doc.addPage(); y = 20; }
      doc.addImage(imgData, 'PNG', 20, y, imgW, Math.min(imgH, 80)); y += Math.min(imgH, 80) + 8;
    } catch {}
  }

  // Export tables via autoTable
  const tables = document.querySelectorAll('#analytics-content .analytics-table-wrap table');
  for (const table of tables) {
    if (y > 240) { doc.addPage(); y = 20; }
    doc.autoTable({ html: table, startY: y, margin: { left: 20, right: 20 }, styles: { fontSize: 9 }, headStyles: { fillColor: [192, 57, 43] } });
    y = doc.lastAutoTable.finalY + 8;
  }

  // Footer
  doc.setFontSize(9); doc.setTextColor(150);
  doc.text(`Generated by ReelMatch Editing Room — ${new Date().toUTCString()}`, W / 2, 285, { align: 'center' });

  doc.save(`ReelMatch-${tab}-${date}.pdf`);
  toast('PDF exported', 'success');
}


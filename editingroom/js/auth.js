// ═══════════════════════════════════════════════════════
// ReelMatch Editing Room — auth.js
// ═══════════════════════════════════════════════════════

window.adminState = { token: null, user: null };

/* ─── AUTH STATE ─────────────────────────────────────────────────────── */
let _otpSessionToken = null;
let _otpEmail        = null;
let _otpPassword     = null;
let _otpTimerID      = null;

async function doLogin() {
  console.log('[Auth] ▶ LOGIN ATTEMPT'); // DEBUG
  const email = document.getElementById('login-email').value.trim();
  const pass  = document.getElementById('login-password').value;
  const btn   = document.getElementById('login-btn');
  const err   = document.getElementById('login-error');
  err.textContent = '';
  if (!email || !pass) { err.textContent = 'Please enter email and password.'; return; }
  btn.disabled = true; btn.textContent = 'Sending code…';
  try {
    console.log('[Auth] ▶ OTP REQUESTED'); // DEBUG
    const data = await api('/admin/auth/request-otp', {
      method: 'POST',
      body: JSON.stringify({ email, password: pass }),
    });
    if (!data) { btn.disabled = false; btn.textContent = 'Sign in'; return; }
    _otpEmail        = email;
    _otpPassword     = pass;
    _otpSessionToken = data.session_token;
    showOtpScreen(email);
  } catch (e) {
    err.textContent = e.message || 'Login failed.';
    btn.disabled = false; btn.textContent = 'Sign in';
  }
}

function showOtpScreen(email) {
  document.getElementById('login-screen').style.display = 'none';
  const screen = document.getElementById('otp-screen');
  screen.classList.add('active');
  document.getElementById('otp-email-display').textContent = email;
  document.getElementById('otp-input').value = '';
  document.getElementById('otp-error').textContent = '';
  document.getElementById('otp-attempts').textContent = '';
  document.getElementById('otp-btn').disabled = false;
  document.getElementById('otp-btn').textContent = 'Verify';
  const inp = document.getElementById('otp-input');
  inp.classList.remove('otp-error');
  setTimeout(() => inp.focus(), 100);
  startOtpTimer(60);
}

function showLoginScreen() {
  clearInterval(_otpTimerID);
  document.getElementById('otp-screen').classList.remove('active');
  document.getElementById('login-screen').style.display = 'flex';
  document.getElementById('login-btn').disabled = false;
  document.getElementById('login-btn').textContent = 'Sign in';
  document.getElementById('login-error').textContent = '';
}

function startOtpTimer(seconds) {
  clearInterval(_otpTimerID);
  const timerEl  = document.getElementById('otp-timer');
  const resendEl = document.getElementById('otp-resend');
  resendEl.style.display = 'none';
  let remaining = seconds;
  function tick() {
    if (remaining <= 0) {
      clearInterval(_otpTimerID);
      timerEl.textContent = 'Code expired.';
      resendEl.style.display = 'inline';
      return;
    }
    timerEl.textContent = `Code expires in ${remaining}s`;
    remaining--;
  }
  tick();
  _otpTimerID = setInterval(tick, 1000);
}

function onOtpInput(el) {
  el.value = el.value.replace(/\D/g, '').slice(0, 6);
  el.classList.remove('otp-error');
  document.getElementById('otp-error').textContent = '';
  if (el.value.length === 6) doVerifyOtp();
}

async function doVerifyOtp() {
  const code = document.getElementById('otp-input').value.trim();
  const btn  = document.getElementById('otp-btn');
  const err  = document.getElementById('otp-error');
  err.textContent = '';
  if (code.length !== 6) { err.textContent = 'Enter the 6-digit code.'; return; }
  btn.disabled = true; btn.textContent = 'Verifying…';
  try {
    const data = await api('/admin/auth/verify-otp', {
      method: 'POST',
      body: JSON.stringify({ session_token: _otpSessionToken, code }),
    });
    if (!data) { btn.disabled = false; btn.textContent = 'Verify'; return; }
    clearInterval(_otpTimerID);
    window.adminState.token = data.access_token;
    window.adminState.user  = data.user;
    state.token = data.access_token;
    state.user  = data.user;
    localStorage.setItem('admin_token', window.adminState.token);
    localStorage.setItem('admin_user',  JSON.stringify(window.adminState.user));
    console.log('[Auth] ▶ OTP VERIFIED — token stored'); // DEBUG
    document.getElementById('otp-screen').classList.remove('active');
    bootApp();
  } catch (e) {
    const inp = document.getElementById('otp-input');
    inp.classList.add('otp-error');
    setTimeout(() => inp.classList.remove('otp-error'), 400);
    inp.value = '';
    const msg = e.message || 'Invalid code.';
    err.textContent = msg;
    // Parse remaining attempts from error message if present
    const match = msg.match(/(\d+) attempt/);
    if (match) document.getElementById('otp-attempts').textContent = `${match[0]} remaining`;
    btn.disabled = false; btn.textContent = 'Verify';
    inp.focus();
  }
}

async function doResendOtp() {
  const resendEl = document.getElementById('otp-resend');
  const timerEl  = document.getElementById('otp-timer');
  resendEl.style.display = 'none';
  timerEl.textContent = 'Sending…';
  try {
    const data = await api('/admin/auth/request-otp', {
      method: 'POST',
      body: JSON.stringify({ email: _otpEmail, password: _otpPassword }),
    });
    if (!data) return;
    _otpSessionToken = data.session_token;
    document.getElementById('otp-input').value = '';
    document.getElementById('otp-error').textContent = '';
    document.getElementById('otp-attempts').textContent = '';
    startOtpTimer(60);
  } catch (e) {
    timerEl.textContent = '';
    document.getElementById('otp-error').textContent = e.message || 'Failed to resend.';
    resendEl.style.display = 'inline';
  }
}

function doLogout() {
  console.log('[Auth] ▶ LOGOUT'); // DEBUG
  localStorage.removeItem('admin_token');
  localStorage.removeItem('admin_user');
  window.adminState.token = null; window.adminState.user = null;
  state.token = null; state.user = null;
  document.getElementById('app').style.display = 'none';
  document.getElementById('otp-screen').classList.remove('active');
  document.getElementById('login-screen').style.display = 'flex';
  document.getElementById('login-password').value = '';
  document.getElementById('login-btn').disabled = false;
  document.getElementById('login-btn').textContent = 'Sign in';
  clearInterval(_otpTimerID);
}

function checkAuth() {
  const t = localStorage.getItem('admin_token');
  const u = localStorage.getItem('admin_user');
  if (!t) return false;
  window.adminState.token = t;
  state.token = t;
  try {
    window.adminState.user = JSON.parse(u);
    state.user = window.adminState.user;
  } catch {}
  return true;
}

function bootApp() {
  document.getElementById('login-screen').style.display = 'none';
  document.getElementById('app').style.display = 'flex';
  document.getElementById('sidebar-email').textContent = (window.adminState.user || state.user)?.email || '';
  document.getElementById('sidebar-build-ver').textContent  = BUILD_VERSION;
  document.getElementById('sidebar-build-date').textContent = BUILD_DATE;
  document.getElementById('info-admin-email').textContent = (window.adminState.user || state.user)?.email || '';
  document.getElementById('info-api-base').textContent = API_BASE;
  buildThemeGrid('settings-theme-grid');
  initTimezoneSettings();
  startDashAutoRefresh();
  window.addEventListener('resize', () => {
    if (state.section === 'users') {
      calcUsersPageSize();
      if (state._filteredUsers) renderUsersPageFromCache();
      else fetchUsersPage();
    }
  });
  navigate(state.section);
}

/* ─── NAVIGATION ─────────────────────────────────────────────────────── */
function navigate(section) {
  state.section = section;
  document.querySelectorAll('.nav-item').forEach(el => {
    el.classList.toggle('active', el.dataset.section === section);
  });
  document.querySelectorAll('.section').forEach(el => {
    el.classList.toggle('active', el.id === `sec-${section}`);
  });
  switch (section) {
    case 'dashboard':  loadDashboard();             break;
    case 'users':      loadUsers();                 break;
    case 'banned':     loadBannedUsers();           break;
    case 'reports':    loadReports();               break;
    case 'movies':     loadMovies(); loadMovieHealthStats(); break;
    case 'analytics':  loadAnalytics();             break;
    case 'appdev':     loadAppDev();               break;
    case 'settings':   initTimezoneSettings(); renderEmailTemplateList(); break;
  }
}

/* ─── ENTER KEY ON LOGIN ─────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  console.log('═══════════════════════════════════════'); // DEBUG
  console.log('[Auth] ▶ PAGE LOADED'); // DEBUG
  console.log('[Auth] checking session token'); // DEBUG
  console.log('═══════════════════════════════════════'); // DEBUG

  document.getElementById('login-password').addEventListener('keydown', e => {
    if (e.key === 'Enter') doLogin();
  });
  document.getElementById('login-email').addEventListener('keydown', e => {
    if (e.key === 'Enter') document.getElementById('login-password').focus();
  });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeUserPanel(); });

  // Close reason overlay on backdrop click
  document.getElementById('reason-overlay').addEventListener('click', e => {
    if (e.target === document.getElementById('reason-overlay')) closeReasonModal();
  });

  // Close is-filter dropdown on outside click
  document.addEventListener('click', e => {
    if (!e.target.closest('.search-input-wrap')) closeIsFilterDropdown();
  });

  // Reports resize handler
  window.addEventListener('resize', () => {
    if (state.section !== 'reports') return;
    clearTimeout(_reportsResizeTimer);
    _reportsResizeTimer = setTimeout(() => {
      _reportsPageSizeLocked = false;
      _measureAndSetReportsLayout();
      reportsPage = 1;
      fetchReportsPage();
    }, 300);
  });

  /* ─── INIT ───────────────────────────────────────────────────────────── */
  applyTheme(state.activeTheme);
  if (checkAuth()) {
    bootApp();
  }
});

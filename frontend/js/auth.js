/* ═══════════════════════════════════════════════════════
   VendorBridge — Auth Page Logic
   ═══════════════════════════════════════════════════════ */

/* ─── Init ──────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  // Hide loader
  setTimeout(() => {
    const loader = document.getElementById('page-loader');
    loader.style.opacity = '0';
    setTimeout(() => loader.style.display = 'none', 300);
  }, 700);

  // Redirect if already logged in
  if (Session.isLoggedIn()) {
    window.location.href = 'dashboard.html';
    return;
  }

  // Init role selectors
  initRoles('signup-roles');

  // Trigger initial signup role state
  const defaultRole = getRole('signup-roles');
  if (defaultRole) {
    handleSignupRoleChange(defaultRole);
  }

  // Form submissions
  document.getElementById('login-form').addEventListener('submit',  handleLogin);
  document.getElementById('signup-form').addEventListener('submit', handleSignup);
  document.getElementById('forgot-form').addEventListener('submit', handleForgot);
});


/* ─── View / Tab Switching ──────────────────────────── */
const VIEWS = ['login', 'signup', 'forgot'];

function switchTab(tab) {
  // Update tab buttons
  document.getElementById('tab-login').classList.toggle('active',  tab === 'login');
  document.getElementById('tab-signup').classList.toggle('active', tab === 'signup');
  document.getElementById('tab-login').setAttribute('aria-selected',  tab === 'login');
  document.getElementById('tab-signup').setAttribute('aria-selected', tab === 'signup');

  switchView(tab);
}

function switchView(view) {
  VIEWS.forEach(v => {
    const el = document.getElementById(`view-${v}`);
    if (el) el.classList.toggle('hidden', v !== view);
  });
}


/* ─── Role Selector ─────────────────────────────────── */
function initRoles(containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;

  container.querySelectorAll('.role-item').forEach(item => {
    item.addEventListener('click', () => {
      container.querySelectorAll('.role-item').forEach(i => i.classList.remove('selected'));
      item.classList.add('selected');
      const radio = item.querySelector('input[type="radio"]');
      radio.checked = true;

      // Handle dynamic role-specific fields
      if (containerId === 'signup-roles') {
        handleSignupRoleChange(radio.value);
      }
    });
  });
}

function handleSignupRoleChange(role) {
  const gstinGroup = document.getElementById('s-gstin-group');
  const companyLabel = document.getElementById('s-company-label');
  const companyGstinRow = document.getElementById('company-gstin-row');
  
  if (role === 'Vendor') {
    if (gstinGroup) gstinGroup.classList.remove('hidden');
    if (companyGstinRow) companyGstinRow.classList.add('vendor-selected');
    if (companyLabel) companyLabel.innerHTML = 'Company <span style="color:#EF4444;font-weight:500;">*</span>';
  } else {
    if (gstinGroup) gstinGroup.classList.add('hidden');
    if (companyGstinRow) companyGstinRow.classList.remove('vendor-selected');
    if (companyLabel) companyLabel.innerHTML = 'Company <span style="color:#CBD5E1;font-weight:400;">(optional)</span>';
    
    // Clear GSTIN value and errors when not in Vendor role
    const gstinInput = document.getElementById('s-gstin');
    if (gstinInput) gstinInput.value = '';
    clearErr('s-gstin', 's-gstin-err');
    clearErr('s-company', 's-company-err');
  }
}

function getRole(containerId) {
  const sel = document.querySelector(`#${containerId} .role-item.selected`);
  return sel ? sel.dataset.role : null;
}


/* ─── Password Eye Toggle ───────────────────────────── */
function toggleEye(inputId, btnId) {
  const inp = document.getElementById(inputId);
  const btn = document.getElementById(btnId);
  const isHidden = inp.type === 'password';
  inp.type  = isHidden ? 'text' : 'password';
  btn.textContent = isHidden ? '🙈' : '👁';
}


/* ─── Password Strength ─────────────────────────────── */
function checkStrength(val) {
  const bars = ['sb1','sb2','sb3','sb4'].map(id => document.getElementById(id));
  const txt  = document.getElementById('strength-txt');
  bars.forEach(b => b.className = 's-bar');

  if (!val) { txt.textContent = 'Enter a strong password'; return; }

  let score = 0;
  if (val.length >= 8)                         score++;
  if (/[A-Z]/.test(val))                       score++;
  if (/\d/.test(val))                          score++;
  if (/[!@#$%^&*(),.?":{}|<>_\-]/.test(val))  score++;

  const map = [
    { cls: 'weak',   label: 'Weak'   },
    { cls: 'fair',   label: 'Fair'   },
    { cls: 'good',   label: 'Good'   },
    { cls: 'strong', label: 'Strong' },
  ];

  for (let i = 0; i < score; i++) bars[i].classList.add(map[score - 1].cls);
  txt.textContent = map[score - 1]?.label || 'Weak';
}


/* ─── Validation Helpers ────────────────────────────── */
function isValidEmail(e) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.trim()); }

function setErr(inputId, errId, show) {
  document.getElementById(inputId)?.classList.toggle('has-error', show);
  const err = document.getElementById(errId);
  if (err) err.classList.toggle('show', show);
  return !show;
}

function clearErr(inputId, errId) { setErr(inputId, errId, false); }


/* ─── Button Loading ────────────────────────────────── */
function setLoading(ctaId, txtId, loading, label = '') {
  const btn = document.getElementById(ctaId);
  const txt = document.getElementById(txtId);
  btn.disabled = loading;
  txt.innerHTML = loading
    ? `<span class="btn-spinner"></span>${label}`
    : label;
}


/* ─── Toast ─────────────────────────────────────────── */
function toast(type, title, msg, ms = 4000) {
  const icons = { success: '✅', error: '❌', info: 'ℹ️', warning: '⚠️' };
  const wrap  = document.getElementById('toast-wrap');

  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.innerHTML = `
    <span class="toast-icon">${icons[type]||'ℹ️'}</span>
    <div class="toast-body">
      <div class="toast-title">${title}</div>
      ${msg ? `<div class="toast-msg">${msg}</div>` : ''}
    </div>
    <button class="toast-x" onclick="this.closest('.toast').remove()">✕</button>
  `;
  wrap.appendChild(el);

  setTimeout(() => {
    el.style.opacity = '0';
    el.style.transition = 'opacity 0.3s';
    setTimeout(() => el.remove(), 300);
  }, ms);
}


/* ─── LOGIN ─────────────────────────────────────────── */
async function handleLogin(e) {
  e.preventDefault();

  const email    = document.getElementById('l-email').value.trim();
  const password = document.getElementById('l-password').value;

  let ok = true;
  ok = setErr('l-email',    'l-email-err',    !isValidEmail(email)) && ok;
  ok = setErr('l-password', 'l-password-err', !password)            && ok;
  if (!ok) return;

  clearErr('l-email', 'l-email-err');
  clearErr('l-password', 'l-password-err');

  setLoading('login-cta', 'login-cta-txt', true, 'Signing in…');

  try {
    const res = await Api.auth.login({ email, password });
    Session.save(res.access_token, res.user);
    toast('success', 'Login successful', `Welcome back, ${res.user.full_name}!`);
    setTimeout(() => { window.location.href = 'dashboard.html'; }, 900);
  } catch (err) {
    toast('error', 'Login failed', err.message);
    setLoading('login-cta', 'login-cta-txt', false, 'Log In');
  }
}


/* ─── SIGNUP ────────────────────────────────────────── */
async function handleSignup(e) {
  e.preventDefault();

  const firstName = document.getElementById('s-first-name').value.trim();
  const lastName  = document.getElementById('s-last-name').value.trim();
  const name      = `${firstName} ${lastName}`.trim();
  const email     = document.getElementById('s-email').value.trim();
  const company   = document.getElementById('s-company').value.trim();
  const gstin     = document.getElementById('s-gstin').value.trim();
  const password  = document.getElementById('s-password').value;
  const role      = getRole('signup-roles');

  const pwdOk = password.length >= 8
    && /[A-Z]/.test(password)
    && /\d/.test(password)
    && /[!@#$%^&*(),.?":{}|<>_\-]/.test(password);

  let ok = true;
  ok = setErr('s-first-name', 's-first-name-err', firstName.length < 1) && ok;
  ok = setErr('s-last-name',  's-last-name-err',  lastName.length < 1)  && ok;
  ok = setErr('s-email',      's-email-err',      !isValidEmail(email)) && ok;
  ok = setErr('s-password',   's-password-err',   !pwdOk)               && ok;
  
  if (role === 'Vendor') {
    ok = setErr('s-company',  's-company-err',    company.length < 1)   && ok;
    
    // Check if GSTIN is exactly 15 chars alphanumeric
    const cleanGstin = gstin.toUpperCase();
    const isGstinValid = cleanGstin.length === 15 && /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}[Z|A-Z0-9]{1}[0-9A-Z]{1}$/.test(cleanGstin);
    ok = setErr('s-gstin',    's-gstin-err',      !isGstinValid)        && ok;
  }

  if (!ok) return;

  clearErr('s-first-name', 's-first-name-err');
  clearErr('s-last-name',  's-last-name-err');
  clearErr('s-email',      's-email-err');
  clearErr('s-company',    's-company-err');
  clearErr('s-gstin',      's-gstin-err');
  clearErr('s-password',   's-password-err');

  setLoading('signup-cta', 'signup-cta-txt', true, 'Creating account…');

  try {
    const payload = { full_name: name, email, password, role };
    if (company) payload.company = company;
    if (role === 'Vendor') payload.gstin = gstin.toUpperCase();

    const res = await Api.auth.signup(payload);
    Session.save(res.access_token, res.user);
    toast('success', 'Account created!', `Welcome to VendorBridge, ${res.user.full_name}!`);
    setTimeout(() => { window.location.href = 'dashboard.html'; }, 900);
  } catch (err) {
    toast('error', 'Signup failed', err.message);
    setLoading('signup-cta', 'signup-cta-txt', false, 'Create Account');
  }
}


/* ─── FORGOT PASSWORD ───────────────────────────────── */
async function handleForgot(e) {
  e.preventDefault();

  const email = document.getElementById('f-email').value.trim();

  if (!isValidEmail(email)) {
    setErr('f-email', 'f-email-err', true);
    return;
  }
  clearErr('f-email', 'f-email-err');

  setLoading('forgot-cta', 'forgot-cta-txt', true, 'Sending…');

  try {
    await Api.auth.forgot({ email });
    document.getElementById('forgot-form').classList.add('hidden');
    document.getElementById('forgot-ok').classList.remove('hidden');
  } catch (err) {
    toast('error', 'Request failed', err.message);
    setLoading('forgot-cta', 'forgot-cta-txt', false, 'Send Reset Link');
  }
}

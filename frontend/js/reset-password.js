/* ═══════════════════════════════════════════════════════
   VendorBridge — Reset Password Logic
   ═══════════════════════════════════════════════════════ */

let token = '';

/* ─── Init ──────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  // Hide loader
  setTimeout(() => {
    const loader = document.getElementById('page-loader');
    if (loader) {
      loader.style.opacity = '0';
      setTimeout(() => loader.style.display = 'none', 300);
    }
  }, 700);

  // Extract token from query param
  const urlParams = new URLSearchParams(window.location.search);
  token = urlParams.get('token') || '';

  if (!token) {
    toast('error', 'Invalid Session', 'Reset token is missing from the link.');
    document.getElementById('reset-form').classList.add('hidden');
    document.getElementById('reset-header').style.display = 'none';
    const errorBox = document.createElement('div');
    errorBox.className = 'success-box';
    errorBox.innerHTML = `
      <div class="success-emoji">⚠️</div>
      <div class="success-title">Invalid Link</div>
      <p class="success-desc">The password reset link is invalid or has expired.</p>
      <a href="index.html" class="cta-btn" style="margin-top:8px; text-decoration: none;">Back to Login</a>
    `;
    document.getElementById('view-reset').appendChild(errorBox);
    return;
  }

  // Form submission
  document.getElementById('reset-form').addEventListener('submit', handleReset);
});

/* ─── Password Eye Toggle ───────────────────────────── */
function toggleEye(inputId, btnId) {
  const inp = document.getElementById(inputId);
  const btn = document.getElementById(btnId);
  if (!inp || !btn) return;
  const isHidden = inp.type === 'password';
  inp.type  = isHidden ? 'text' : 'password';
  btn.textContent = isHidden ? '🙈' : '👁';
}

/* ─── Password Strength ─────────────────────────────── */
function checkStrength(val) {
  const bars = ['sb1','sb2','sb3','sb4'].map(id => document.getElementById(id));
  const txt  = document.getElementById('strength-txt');
  if (!txt) return;
  bars.forEach(b => { if (b) b.className = 's-bar'; });

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

  for (let i = 0; i < score; i++) {
    if (bars[i]) bars[i].classList.add(map[score - 1].cls);
  }
  txt.textContent = map[score - 1]?.label || 'Weak';
}

/* ─── Validation Helpers ────────────────────────────── */
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
  if (!btn || !txt) return;
  btn.disabled = loading;
  txt.innerHTML = loading
    ? `<span class="btn-spinner"></span>${label}`
    : label;
}

/* ─── Toast ─────────────────────────────────────────── */
function toast(type, title, msg, ms = 4000) {
  const icons = { success: '✅', error: '❌', info: 'ℹ️', warning: '⚠️' };
  const wrap  = document.getElementById('toast-wrap');
  if (!wrap) return;

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

/* ─── RESET PASSWORD SUBMIT ────────────────────────── */
async function handleReset(e) {
  e.preventDefault();

  const password = document.getElementById('r-password').value;
  const confirmPassword = document.getElementById('r-confirm-password').value;

  const pwdOk = password.length >= 8
    && /[A-Z]/.test(password)
    && /\d/.test(password)
    && /[!@#$%^&*(),.?":{}|<>_\-]/.test(password);

  const confirmOk = password === confirmPassword;

  let ok = true;
  ok = setErr('r-password', 'r-password-err', !pwdOk) && ok;
  ok = setErr('r-confirm-password', 'r-confirm-password-err', !confirmOk) && ok;

  if (!ok) return;

  clearErr('r-password', 'r-password-err');
  clearErr('r-confirm-password', 'r-confirm-password-err');

  setLoading('reset-cta', 'reset-cta-txt', true, 'Resetting…');

  try {
    await Api.auth.resetPassword({ token, new_password: password });
    toast('success', 'Reset Complete', 'Your password was successfully updated.');
    document.getElementById('reset-form').classList.add('hidden');
    document.getElementById('reset-header').style.display = 'none';
    document.getElementById('reset-ok').classList.remove('hidden');
  } catch (err) {
    toast('error', 'Reset failed', err.message);
    setLoading('reset-cta', 'reset-cta-txt', false, 'Reset Password');
  }
}

/* ─── API Service Layer ──────────────────────────────── */

const API_BASE = 'http://localhost:8000/api';

const Api = {
  /* ── Core fetch wrapper ── */
  async request(endpoint, options = {}) {
    const token = sessionStorage.getItem('vb_token');
    const headers = {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    };

    const response = await fetch(`${API_BASE}${endpoint}`, {
      ...options,
      headers,
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(data.detail || `HTTP ${response.status}`);
    }

    return data;
  },

  /* ── Auth endpoints ── */
  auth: {
    login:  (payload) => Api.request('/auth/login',  { method: 'POST', body: JSON.stringify(payload) }),
    signup: (payload) => Api.request('/auth/signup', { method: 'POST', body: JSON.stringify(payload) }),
    forgot: (payload) => Api.request('/auth/forgot-password', { method: 'POST', body: JSON.stringify(payload) }),
    me:     ()        => Api.request('/auth/me'),
    logout: ()        => Api.request('/auth/logout', { method: 'POST' }),
  },

  /* ── Dashboard endpoints ── */
  dashboard: {
    stats:    () => Api.request('/dashboard/stats'),
    rfqs:     (q) => Api.request(`/dashboard/rfqs${q ? `?q=${encodeURIComponent(q)}` : ''}`),
    orders:   (q) => Api.request(`/dashboard/purchase-orders${q ? `?q=${encodeURIComponent(q)}` : ''}`),
    invoices: (q) => Api.request(`/dashboard/invoices${q ? `?q=${encodeURIComponent(q)}` : ''}`),
    approvals:(q) => Api.request(`/dashboard/approvals${q ? `?q=${encodeURIComponent(q)}` : ''}`),
  },
};

/* ─── Session helpers ──────────────────────────────── */
const Session = {
  save(token, user) {
    sessionStorage.setItem('vb_token', token);
    sessionStorage.setItem('vb_user', JSON.stringify(user));
  },
  clear() {
    sessionStorage.removeItem('vb_token');
    sessionStorage.removeItem('vb_user');
  },
  getToken() { return sessionStorage.getItem('vb_token'); },
  getUser()  {
    const u = sessionStorage.getItem('vb_user');
    return u ? JSON.parse(u) : null;
  },
  isLoggedIn() { return !!this.getToken(); },
};

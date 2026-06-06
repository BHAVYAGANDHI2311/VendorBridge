/* ─── API Service Layer ──────────────────────────────── */

const API_BASE = 'http://localhost:8000/api';

class ApiError extends Error {
  constructor(detail, status) {
    const msg = typeof detail === 'object' ? detail.message : detail;
    super(msg || `HTTP ${status}`);
    this.code = typeof detail === 'object' ? detail.code : 'UNKNOWN';
    this.field = typeof detail === 'object' ? detail.field : null;
    this.status = status;
    this.retryable = status >= 500 || status === 0;
    this.detail = detail;
  }

  static format(err) {
    if (err instanceof ApiError) return err.message;
    return err.message || 'An unexpected error occurred';
  }

  static fieldMap(err) {
    if (err instanceof ApiError && err.field) {
      return { [err.field]: err.message };
    }
    return {};
  }
}

const Api = {
  async request(endpoint, options = {}) {
    const token = sessionStorage.getItem('vb_token');
    const headers = {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    };

    let response;
    try {
      response = await fetch(`${API_BASE}${endpoint}`, {
        ...options,
        headers,
        signal: options.signal,
      });
    } catch (networkErr) {
      if (networkErr.name === 'AbortError') throw networkErr;
      throw new ApiError({ code: 'NETWORK_ERROR', message: 'Network error. Please check your connection.' }, 0);
    }

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      const detail = data.detail || { code: 'UNKNOWN', message: `HTTP ${response.status}` };
      throw new ApiError(detail, response.status);
    }

    return data;
  },

  async upload(endpoint, formData) {
    const token = sessionStorage.getItem('vb_token');
    const headers = token ? { Authorization: `Bearer ${token}` } : {};

    let response;
    try {
      response = await fetch(`${API_BASE}${endpoint}`, {
        method: 'POST',
        headers,
        body: formData,
      });
    } catch (networkErr) {
      throw new ApiError({ code: 'NETWORK_ERROR', message: 'Network error. Please check your connection.' }, 0);
    }

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const detail = data.detail || { code: 'UNKNOWN', message: `HTTP ${response.status}` };
      throw new ApiError(detail, response.status);
    }
    return data;
  },

  auth: {
    login:  (payload) => Api.request('/auth/login',  { method: 'POST', body: JSON.stringify(payload) }),
    signup: (payload) => Api.request('/auth/signup', { method: 'POST', body: JSON.stringify(payload) }),
    forgot: (payload) => Api.request('/auth/forgot-password', { method: 'POST', body: JSON.stringify(payload) }),
    resetPassword: (payload) => Api.request('/auth/reset-password', { method: 'POST', body: JSON.stringify(payload) }),
    me:     ()        => Api.request('/auth/me'),
    logout: ()        => Api.request('/auth/logout', { method: 'POST' }),
  },

  dashboard: {
    stats:    () => Api.request('/dashboard/stats'),
    rfqs:     (q) => Api.request(`/dashboard/rfqs${q ? `?q=${encodeURIComponent(q)}` : ''}`),
    orders:   (q) => Api.request(`/dashboard/purchase-orders${q ? `?q=${encodeURIComponent(q)}` : ''}`),
    invoices: (q) => Api.request(`/dashboard/invoices${q ? `?q=${encodeURIComponent(q)}` : ''}`),
    approvals:(q) => Api.request(`/dashboard/approvals${q ? `?q=${encodeURIComponent(q)}` : ''}`),
  },

  vendors: {
    list({ page = 1, limit = 10, q = '', status = 'all' } = {}, opts = {}) {
      const params = new URLSearchParams({ page, limit });
      if (q) params.set('q', q);
      if (status && status !== 'all') params.set('status', status);
      return Api.request(`/vendors?${params}`, opts);
    },
    get(id) {
      return Api.request(`/vendors/${id}`);
    },
    create(payload) {
      return Api.request('/vendors', { method: 'POST', body: JSON.stringify(payload) });
    },
    update(id, payload) {
      return Api.request(`/vendors/${id}`, { method: 'PUT', body: JSON.stringify(payload) });
    },
    updateStatus(id, status) {
      return Api.request(`/vendors/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) });
    },
  },
};

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

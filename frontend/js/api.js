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

  purchaseOrders: {
    list({ page = 1, limit = 20 } = {}) {
      return Api.request(`/purchase-orders?page=${page}&limit=${limit}`);
    },
    get(id) {
      return Api.request(`/purchase-orders/${id}`);
    },
    create(payload) {
      return Api.request('/purchase-orders', { method: 'POST', body: JSON.stringify(payload) });
    },
    updateStatus(id, status) {
      return Api.request(`/purchase-orders/${id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });
    },
  },

  activityLogs: {
    list(type = 'all', { page = 1, limit = 50 } = {}) {
      return Api.request(`/activity-logs?type=${encodeURIComponent(type)}&page=${page}&limit=${limit}`);
    },
  },

  approvals: {
    recordStep(payload) {
      return Api.request('/approvals/audit-step', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
    },
  },

  reports: {
    stats(month, year) {
      const params = new URLSearchParams();
      if (month) params.set('month', month);
      if (year) params.set('year', year);
      return Api.request(`/reports/stats?${params}`);
    },
    spendByCategory(month, year) {
      const params = new URLSearchParams();
      if (month) params.set('month', month);
      if (year) params.set('year', year);
      return Api.request(`/reports/spend-by-category?${params}`);
    },
    topVendors(month, year) {
      const params = new URLSearchParams();
      if (month) params.set('month', month);
      if (year) params.set('year', year);
      return Api.request(`/reports/top-vendors?${params}`);
    },
    monthlyTrend(month, year) {
      const params = new URLSearchParams();
      if (month) params.set('month', month);
      if (year) params.set('year', year);
      return Api.request(`/reports/monthly-trend?${params}`);
    },
    async exportCsv(month, year) {
      const token = sessionStorage.getItem('vb_token');
      const params = new URLSearchParams();
      if (month) params.set('month', month);
      if (year) params.set('year', year);
      const response = await fetch(`${API_BASE}/reports/export?${params}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        const detail = data.detail || { message: `HTTP ${response.status}` };
        throw new ApiError(detail, response.status);
      }
      const blob = await response.blob();
      const disposition = response.headers.get('Content-Disposition') || '';
      const match = disposition.match(/filename="?([^"]+)"?/);
      const filename = match ? match[1] : `vendorbridge-report-${month}-${year}.csv`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    },
  },

  invoices: {
    get(id) {
      return Api.request(`/invoices/${id}`);
    },
    async downloadPdf(id) {
      const token = sessionStorage.getItem('vb_token');
      const response = await fetch(`${API_BASE}/invoices/${id}/pdf`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        const detail = data.detail || { message: `HTTP ${response.status}` };
        throw new ApiError(detail, response.status);
      }
      return response.blob();
    },
    sendEmail(id, payload) {
      return Api.request(`/invoices/${id}/send-email`, {
        method: 'POST',
        body: JSON.stringify(payload),
      });
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

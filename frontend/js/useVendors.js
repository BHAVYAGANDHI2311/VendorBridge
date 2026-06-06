/* ═══════════════════════════════════════════════════════
   VendorBridge — useVendors State Store
   Vanilla JS equivalent of a React custom hook
   ═══════════════════════════════════════════════════════ */

class VendorsStore {
  constructor() {
    this.state = {
      items: [],
      loading: false,
      error: null,
      search: '',
      statusFilter: 'all',
      page: 1,
      limit: 10,
      total: 0,
      pages: 1,
      counts: { all: 0, Active: 0, Pending: 0, Blocked: 0 },
      selectedVendor: null,
      submitting: false,
    };
    this._listeners = new Set();
    this._debounceTimer = null;
    this._abortController = null;
  }

  subscribe(fn) {
    this._listeners.add(fn);
    return () => this._listeners.delete(fn);
  }

  getState() {
    return { ...this.state };
  }

  _emit() {
    const snapshot = this.getState();
    this._listeners.forEach((fn) => fn(snapshot));
  }

  _setState(partial) {
    this.state = { ...this.state, ...partial };
    this._emit();
  }

  setSearch(query) {
    this._setState({ search: query, page: 1 });
    clearTimeout(this._debounceTimer);
    this._debounceTimer = setTimeout(() => this.fetch(), 350);
  }

  setStatusFilter(status) {
    this._setState({ statusFilter: status, page: 1 });
    this.fetch();
  }

  setPage(page) {
    this._setState({ page });
    this.fetch();
  }

  async fetch(retries = 2) {
    if (this._abortController) this._abortController.abort();
    this._abortController = new AbortController();

    this._setState({ loading: true, error: null });

    try {
      const params = {
        page: this.state.page,
        limit: this.state.limit,
        q: this.state.search,
        status: this.state.statusFilter,
      };

      const data = await Api.vendors.list(params, { signal: this._abortController.signal });

      this._setState({
        items: data.items,
        total: data.total,
        pages: data.pages,
        counts: {
          all: data.counts?.all ?? 0,
          Active: data.counts?.Active ?? 0,
          Pending: data.counts?.Pending ?? 0,
          Blocked: data.counts?.Blocked ?? 0,
        },
        loading: false,
        error: null,
      });
    } catch (err) {
      if (err.name === 'AbortError') return;

      if (retries > 0 && err.retryable) {
        await new Promise((r) => setTimeout(r, 1000));
        return this.fetch(retries - 1);
      }

      this._setState({
        loading: false,
        error: ApiError.format(err),
      });
    }
  }

  async getVendor(id) {
    try {
      const vendor = await Api.vendors.get(id);
      this._setState({ selectedVendor: vendor });
      return vendor;
    } catch (err) {
      throw ApiError.format(err);
    }
  }

  async createVendor(formData) {
    const payload = VendorValidation.sanitizePayload(formData);
    const { valid, errors } = VendorValidation.validate(payload);
    if (!valid) return { success: false, errors };

    this._setState({ submitting: true });
    try {
      const vendor = await Api.vendors.create(payload);
      await this.fetch();
      this._setState({ submitting: false });
      return { success: true, vendor };
    } catch (err) {
      this._setState({ submitting: false });
      return { success: false, apiError: ApiError.format(err), fieldErrors: ApiError.fieldMap(err) };
    }
  }

  async updateVendor(id, formData) {
    const payload = VendorValidation.sanitizePayload(formData);
    const { valid, errors } = VendorValidation.validate(payload, true);
    if (!valid) return { success: false, errors };

    this._setState({ submitting: true });
    try {
      const vendor = await Api.vendors.update(id, payload);
      await this.fetch();
      this._setState({ submitting: false, selectedVendor: vendor });
      return { success: true, vendor };
    } catch (err) {
      this._setState({ submitting: false });
      return { success: false, apiError: ApiError.format(err), fieldErrors: ApiError.fieldMap(err) };
    }
  }

  async updateStatus(id, status) {
    const prevItems = [...this.state.items];
    const optimistic = prevItems.map((v) =>
      v.id === id ? { ...v, status } : v
    );
    this._setState({ items: optimistic });

    try {
      await Api.vendors.updateStatus(id, status);
      await this.fetch();
      return { success: true };
    } catch (err) {
      this._setState({ items: prevItems });
      return { success: false, apiError: ApiError.format(err) };
    }
  }

  clearSelected() {
    this._setState({ selectedVendor: null });
  }
}

/** Factory — mirrors `const store = useVendors()` pattern */
function useVendors() {
  if (!window.__vendorsStore) {
    window.__vendorsStore = new VendorsStore();
  }
  return window.__vendorsStore;
}

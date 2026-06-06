/**
 * RFQ API service layer.
 */
const RFQService = {
  async fetchConfig() {
    return RFQConfigLoader.load();
  },

  async fetchCategories() {
    return Api.request(API_ENDPOINTS.CATEGORIES);
  },

  async fetchUnits() {
    return Api.request(API_ENDPOINTS.UNITS);
  },

  async fetchActiveVendors(query = '') {
    const params = new URLSearchParams({ status: 'Active', limit: 50 });
    if (query) params.set('q', query);
    const data = await Api.request(`${API_ENDPOINTS.VENDORS}?${params}`);
    return data.items || data;
  },

  async submitDraft(formData) {
    return Api.upload(API_ENDPOINTS.RFQ_DRAFT, formData);
  },

  async submitFinal(formData) {
    return Api.upload(API_ENDPOINTS.RFQ_SEND, formData);
  },

  buildFormData(payload, files) {
    const fd = new FormData();
    fd.append('payload', JSON.stringify(payload));
    (files || []).forEach((f) => fd.append('files', f));
    return fd;
  },

  mapApiErrors(err) {
    if (err instanceof ApiError && err.detail && err.detail.errors) return err.detail.errors;
    if (err instanceof ApiError && err.field) return { [err.field]: err.message };
    return { _form: ApiError.format(err) };
  },
};

/**
 * RFQ wizard state store (vanilla JS — equivalent to Zustand useRFQStore).
 */
const RFQ_STORE_KEY = 'vb_rfq_draft';

class RFQStore {
  constructor() {
    this.state = {
      currentStep: 1,
      formData: {
        title: '',
        category: '',
        deadline: '',
        description: '',
        line_items: [],
        assigned_vendor_ids: [],
        assigned_vendors: [],
      },
      uploadedFiles: [],
      categories: [],
      units: [],
      config: null,
      isSubmitting: false,
      isFetching: false,
      errors: {},
    };
    this._listeners = new Set();
    this._restore();
  }

  subscribe(fn) { this._listeners.add(fn); return () => this._listeners.delete(fn); }
  _emit() { this._listeners.forEach((fn) => fn(this.getState())); }

  getState() {
    return JSON.parse(JSON.stringify({ ...this.state, uploadedFiles: this.state.uploadedFiles.map(f => ({ name: f.name, size: f.size, type: f.type })) }));
  }

  _setState(partial) {
    Object.assign(this.state, partial);
    this._persist();
    this._emit();
  }

  _persist() {
    const { formData, currentStep } = this.state;
    sessionStorage.setItem(RFQ_STORE_KEY, JSON.stringify({ formData, currentStep }));
  }

  _restore() {
    try {
      const saved = JSON.parse(sessionStorage.getItem(RFQ_STORE_KEY) || 'null');
      if (saved) {
        this.state.formData = { ...this.state.formData, ...saved.formData };
        this.state.currentStep = saved.currentStep || 1;
        if (!this.state.formData.line_items.length) {
          this.addLineItem(false);
        }
      } else {
        this.addLineItem(false);
      }
    } catch (_) {
      this.addLineItem(false);
    }
  }

  async init() {
    this._setState({ isFetching: true });
    try {
      const [config, categories, units] = await Promise.all([
        RFQService.fetchConfig(),
        RFQService.fetchCategories(),
        RFQService.fetchUnits(),
      ]);
      this._setState({ config, categories, units, isFetching: false });
    } catch (err) {
      this._setState({ isFetching: false, errors: { _init: ApiError.format(err) } });
      throw err;
    }
  }

  setStep(step) { this._setState({ currentStep: step, errors: {} }); }

  nextStep() {
    const errors = this.validateCurrentStep(false);
    if (Object.keys(errors).length) {
      this._setState({ errors });
      return false;
    }
    this._setState({ currentStep: Math.min(3, this.state.currentStep + 1), errors: {} });
    return true;
  }

  prevStep() {
    this._setState({ currentStep: Math.max(1, this.state.currentStep - 1), errors: {} });
  }

  updateField(field, value) {
    this.state.formData[field] = value;
    this._persist();
    this._emit();
  }

  /** Update a form field without triggering re-render (for live typing). */
  updateFieldSilent(field, value) {
    this.state.formData[field] = value;
    this._persist();
  }

  addLineItem(emit = true) {
    this.state.formData.line_items.push({
      id: crypto.randomUUID(),
      item_name: '',
      qty: '',
      unit: '',
    });
    if (emit) { this._persist(); this._emit(); }
  }

  removeLineItem(id) {
    if (this.state.formData.line_items.length <= 1) return;
    this.state.formData.line_items = this.state.formData.line_items.filter((i) => i.id !== id);
    this._persist();
    this._emit();
  }

  updateLineItem(id, field, value) {
    const item = this.state.formData.line_items.find((i) => i.id === id);
    if (item) item[field] = value;
    this._persist();
    this._emit();
  }

  /** Update line item data without triggering re-render (for live typing). */
  updateLineItemSilent(id, field, value) {
    const item = this.state.formData.line_items.find((i) => i.id === id);
    if (item) item[field] = value;
    this._persist();
  }

  assignVendor(vendor) {
    const ids = this.state.formData.assigned_vendor_ids;
    if (ids.includes(vendor.id)) return;
    this.state.formData.assigned_vendor_ids.push(vendor.id);
    this.state.formData.assigned_vendors.push(vendor);
    this._persist();
    this._emit();
  }

  removeVendor(vendorId) {
    this.state.formData.assigned_vendor_ids = this.state.formData.assigned_vendor_ids.filter((id) => id !== vendorId);
    this.state.formData.assigned_vendors = this.state.formData.assigned_vendors.filter((v) => v.id !== vendorId);
    this._persist();
    this._emit();
  }

  addFiles(fileList) {
    const fu = this.state.config?.file_upload;
    const newFiles = Array.from(fileList);
    const errors = RFQValidation.validateFiles([...this.state.uploadedFiles, ...newFiles], this.state.config || { file_upload: { max_total_files: 5, allowed_extensions: [], max_file_size_bytes: 99999999 } });
    if (Object.keys(errors).length) {
      this._setState({ errors });
      return false;
    }
    this.state.uploadedFiles = [...this.state.uploadedFiles, ...newFiles].slice(0, fu?.max_total_files || 5);
    this._emit();
    return true;
  }

  removeFile(index) {
    this.state.uploadedFiles.splice(index, 1);
    this._emit();
  }

  validateAll() {
    const { config, formData } = this.state;
    if (!config) return {};
    return {
      ...RFQValidation.validateStep1(formData, config),
      ...RFQValidation.validateStep2(formData.line_items, config),
      ...RFQValidation.validateStep3(formData, config),
    };
  }

  validateCurrentStep(fullSend = false) {
    const { config, formData, currentStep } = this.state;
    if (!config) return {};
    if (fullSend) {
      return {
        ...RFQValidation.validateStep1(formData, config),
        ...RFQValidation.validateStep2(formData.line_items, config),
        ...RFQValidation.validateStep3(formData, config),
        ...RFQValidation.validateFiles(this.state.uploadedFiles, config),
      };
    }
    if (currentStep === 1) return RFQValidation.validateStep1(formData, config);
    if (currentStep === 2) return RFQValidation.validateStep2(formData.line_items, config);
    if (currentStep === 3) return RFQValidation.validateStep3(formData, config);
    return {};
  }

  buildPayload() {
    const d = this.state.formData;
    return {
      title: RFQValidation.sanitizeText(d.title),
      category: d.category,
      deadline: d.deadline ? new Date(d.deadline).toISOString() : '',
      description: RFQValidation.sanitizeText(d.description),
      line_items: d.line_items.map((i) => ({
        id: i.id,
        item_name: RFQValidation.sanitizeText(i.item_name),
        qty: parseFloat(i.qty) || 0,
        unit: i.unit,
      })),
      assigned_vendor_ids: d.assigned_vendor_ids,
    };
  }

  async saveDraft() {
    const errors = RFQValidation.validateDraft(this.state.formData, this.state.config);
    if (Object.keys(errors).length) { this._setState({ errors }); return { success: false, errors }; }

    this._setState({ isSubmitting: true });
    try {
      const fd = RFQService.buildFormData(this.buildPayload(), this.state.uploadedFiles);
      const result = await RFQService.submitDraft(fd);
      this._setState({ isSubmitting: false, errors: {} });
      return { success: true, data: result };
    } catch (err) {
      const errors = RFQService.mapApiErrors(err);
      this._setState({ isSubmitting: false, errors });
      return { success: false, errors, message: ApiError.format(err) };
    }
  }

  async sendRFQ() {
    const errors = {
      ...this.validateAll(),
      ...RFQValidation.validateFiles(this.state.uploadedFiles, this.state.config),
    };
    if (Object.keys(errors).length) { this._setState({ errors }); return { success: false, errors }; }

    this._setState({ isSubmitting: true });
    try {
      const fd = RFQService.buildFormData(this.buildPayload(), this.state.uploadedFiles);
      const result = await RFQService.submitFinal(fd);
      this.resetForm();
      return { success: true, data: result };
    } catch (err) {
      const errors = RFQService.mapApiErrors(err);
      this._setState({ isSubmitting: false, errors });
      return { success: false, errors, message: ApiError.format(err) };
    }
  }

  resetForm() {
    sessionStorage.removeItem(RFQ_STORE_KEY);
    this.state = {
      ...this.state,
      currentStep: 1,
      formData: { title: '', category: '', deadline: '', description: '', line_items: [], assigned_vendor_ids: [], assigned_vendors: [] },
      uploadedFiles: [],
      isSubmitting: false,
      errors: {},
    };
    this.addLineItem(false);
    this._emit();
  }
}

function useRFQStore() {
  if (!window.__rfqStore) window.__rfqStore = new RFQStore();
  return window.__rfqStore;
}

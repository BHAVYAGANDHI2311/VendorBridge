/* ═══ RFQ Create Page Components ═══ */

const WizardStepper = {
  render(container, state) {
    const active = RFQStoreHelpers.computeStep(state);

    container.innerHTML = `
      <nav class="wizard-stepper wizard-stepper--wireframe" aria-label="RFQ progress">
        ${[1, 2, 3].map((n) => {
          const done = n < active;
          const isActive = n === active;
          const cls = done ? 'wizard-dot--done' : isActive ? 'wizard-dot--active' : 'wizard-dot--pending';
          return `<span class="wizard-dot ${cls}" aria-label="Step ${n}">${done ? '✓' : n}</span>`;
        }).join('<span class="wizard-line" aria-hidden="true"></span>')}
      </nav>`;
  },
};

const RFQCreateForm = {
  renderLeft(container, state, store) {
    const today = new Date().toISOString().split('T')[0];
    const datalist = state.categories.map((c) => `<option value="${esc(c.name)}"></option>`).join('');

    container.innerHTML = `
      <div class="rfq-col-fields">
        <div class="rfq-field">
          <label for="rfq-title">RFQ Title <span class="req">*</span></label>
          <input id="rfq-title" type="text" class="rfq-input" value="${esc(state.formData.title)}"
            aria-required="true" aria-invalid="${state.errors.title ? 'true' : 'false'}" />
          ${errMsg('title', state.errors.title)}
        </div>
        <div class="rfq-field">
          <label for="rfq-category">Category</label>
          <input id="rfq-category" type="text" class="rfq-input" list="category-suggestions"
            value="${esc(state.formData.category)}" placeholder="e.g. IT, Construction" />
          <datalist id="category-suggestions">${datalist}</datalist>
          ${errMsg('category', state.errors.category)}
        </div>
        <div class="rfq-field">
          <label for="rfq-deadline">Deadline <span class="req">*</span></label>
          <input id="rfq-deadline" type="date" class="rfq-input" min="${today}"
            value="${state.formData.deadline ? state.formData.deadline.split('T')[0] : ''}" aria-required="true" />
          <span class="rfq-date-hint">Format: YYYY-MM-DD · Must be today or later</span>
          ${errMsg('deadline', state.errors.deadline)}
        </div>
        <div class="rfq-field">
          <label for="rfq-desc">Description</label>
          <textarea id="rfq-desc" class="rfq-input rfq-textarea" rows="5">${esc(state.formData.description)}</textarea>
          ${errMsg('description', state.errors.description)}
        </div>
      </div>`;

    // Text inputs: silently persist on typing, full sync on blur
    const titleEl = document.getElementById('rfq-title');
    if (titleEl) {
      titleEl.addEventListener('input', (e) => store.updateFieldSilent('title', e.target.value));
      titleEl.addEventListener('blur', (e) => store.updateField('title', e.target.value));
    }

    const catEl = document.getElementById('rfq-category');
    if (catEl) {
      catEl.addEventListener('input', (e) => store.updateFieldSilent('category', e.target.value));
      catEl.addEventListener('blur', (e) => store.updateField('category', e.target.value));
    }

    bindField('rfq-deadline', 'change', (v) => {
      // Validate that deadline is not before today
      if (v) {
        const selected = new Date(v + 'T00:00:00');
        const now = new Date();
        now.setHours(0, 0, 0, 0);
        if (selected < now) {
          const el = document.getElementById('rfq-deadline');
          if (el) el.value = '';
          return;
        }
      }
      store.updateField('deadline', v);
    });

    const descEl = document.getElementById('rfq-desc');
    if (descEl) {
      descEl.addEventListener('input', (e) => store.updateFieldSilent('description', e.target.value));
      descEl.addEventListener('blur', (e) => store.updateField('description', e.target.value));
    }
  },

  renderLineItems(container, state, store) {
    const rows = state.formData.line_items.map((item, i) => `
      <tr data-row-id="${item.id}">
        <td>
          <input type="text" class="rfq-input rfq-input--table" data-li="${item.id}" data-field="item_name"
            value="${esc(item.item_name)}" placeholder="Item name" aria-label="Item row ${i + 1}" />
          ${errMsg(`line_items.${i}.item_name`, state.errors[`line_items.${i}.item_name`])}
        </td>
        <td>
          <input type="number" class="rfq-input rfq-input--table" data-li="${item.id}" data-field="qty"
            value="${esc(item.qty)}" min="0" step="any" aria-label="Qty row ${i + 1}" />
          ${errMsg(`line_items.${i}.qty`, state.errors[`line_items.${i}.qty`])}
        </td>
        <td>
          <input type="text" class="rfq-input rfq-input--table" data-li="${item.id}" data-field="unit"
            value="${esc(item.unit)}" placeholder="NOS" aria-label="Unit row ${i + 1}" />
          ${errMsg(`line_items.${i}.unit`, state.errors[`line_items.${i}.unit`])}
        </td>
        <td class="rfq-table__action">
          <button type="button" class="rfq-icon-btn" data-remove-li="${item.id}" aria-label="Remove row ${i + 1}"
            ${state.formData.line_items.length <= 1 ? 'disabled' : ''}>✕</button>
        </td>
      </tr>`).join('');

    container.innerHTML = `
      <div class="rfq-panel">
        <h3 class="rfq-section-title">Line items</h3>
        <div class="rfq-table-wrap">
          <table class="rfq-table rfq-table--wireframe" role="table">
            <thead><tr><th>Item</th><th>Qty</th><th>Unit</th><th></th></tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
        <button type="button" class="rfq-outline-btn" id="add-line-item">+ add line item</button>
      </div>`;

    // Use 'change' + 'blur' to avoid re-render on every keystroke for text inputs
    // This prevents the bug where typing more than 1 character fails
    container.querySelectorAll('[data-li]').forEach((el) => {
      if (el.type === 'number') {
        // Number inputs use change event
        el.addEventListener('change', () => store.updateLineItem(el.dataset.li, el.dataset.field, el.value));
      } else {
        // Text inputs: update store silently (no re-render) on input, sync on blur
        el.addEventListener('input', () => {
          store.updateLineItemSilent(el.dataset.li, el.dataset.field, el.value);
        });
        el.addEventListener('blur', () => {
          store.updateLineItem(el.dataset.li, el.dataset.field, el.value);
        });
      }
    });
    container.querySelectorAll('[data-remove-li]').forEach((btn) => {
      btn.addEventListener('click', () => store.removeLineItem(btn.dataset.removeLi));
    });
    document.getElementById('add-line-item').addEventListener('click', () => store.addLineItem());
  },

  renderVendors(container, state, store) {
    const rows = state.formData.assigned_vendors.map((v) => `
      <tr>
        <td>${esc(v.name)}</td>
        <td class="rfq-table__action">
          <button type="button" class="rfq-icon-btn" data-remove-vendor="${v.id}" aria-label="Remove ${esc(v.name)}">✕</button>
        </td>
      </tr>`).join('');

    container.innerHTML = `
      <div class="rfq-panel rfq-panel--vendors">
        <h3 class="rfq-section-title">ASSIGN VENDORS</h3>
        ${errMsg('assigned_vendor_ids', state.errors.assigned_vendor_ids)}
        <div class="rfq-table-wrap">
          <table class="rfq-table rfq-table--wireframe rfq-table--vendors" role="table">
            <tbody>${rows || '<tr class="rfq-table__empty"><td colspan="2">No vendors assigned</td></tr>'}</tbody>
          </table>
        </div>
        <div class="vendor-add-wrap">
          <button type="button" class="rfq-outline-btn" id="toggle-vendor-search">+ add vendor</button>
          <div class="vendor-search-panel hidden" id="vendor-search-panel">
            <input type="search" id="vendor-search" class="rfq-input" placeholder="Type vendor name to search..." autocomplete="off" />
            <div class="vendor-dropdown hidden" id="vendor-dropdown" role="listbox"></div>
          </div>
        </div>
      </div>`;

    document.getElementById('toggle-vendor-search')?.addEventListener('click', () => {
      document.getElementById('vendor-search-panel').classList.toggle('hidden');
      document.getElementById('vendor-search')?.focus();
    });

    const search = document.getElementById('vendor-search');
    const dropdown = document.getElementById('vendor-dropdown');
    let debounce;

    search?.addEventListener('input', () => {
      clearTimeout(debounce);
      debounce = setTimeout(async () => {
        const q = search.value.trim();
        if (!q) { dropdown.classList.add('hidden'); return; }
        try {
          // Fetch vendors from server DB matching the query
          const vendors = await RFQService.fetchActiveVendors(q);
          const assigned = new Set(state.formData.assigned_vendor_ids);
          const available = vendors.filter((v) => !assigned.has(v.id));
          dropdown.innerHTML = available.length
            ? available.map((v) =>
                `<button type="button" class="vendor-option" data-id="${v.id}" data-name="${esc(v.name)}" data-email="${esc(v.email)}">
                  <strong>${esc(v.name)}</strong>
                  <span style="font-size:12px;color:var(--text-muted);margin-left:8px">${esc(v.email)}</span>
                </button>`
              ).join('')
            : '<div class="vendor-option vendor-option--empty">No matching vendors found</div>';
          dropdown.classList.remove('hidden');
          dropdown.querySelectorAll('.vendor-option[data-id]').forEach((opt) => {
            opt.addEventListener('click', () => {
              store.assignVendor({ id: opt.dataset.id, name: opt.dataset.name, email: opt.dataset.email });
              search.value = '';
              dropdown.classList.add('hidden');
              document.getElementById('vendor-search-panel').classList.add('hidden');
            });
          });
        } catch (_) { /* ignore */ }
      }, 300);
    });

    container.querySelectorAll('[data-remove-vendor]').forEach((btn) => {
      btn.addEventListener('click', () => store.removeVendor(btn.dataset.removeVendor));
    });
  },
};

const RFQToolbar = {
  render(container, state, store, handlers) {
    const submitting = state.isSubmitting;
    const exts = (state.config?.file_upload?.allowed_extensions || []).join(', ').toUpperCase();

    const fileList = state.uploadedFiles.map((f, i) => `
      <span class="toolbar-file">
        ${esc(f.name)}
        <button type="button" class="toolbar-file__remove" data-fidx="${i}" aria-label="Remove ${esc(f.name)}">×</button>
      </span>`).join('');

    container.innerHTML = `
      <div class="rfq-footer">
        <div class="rfq-footer__actions">
          <button type="button" class="rfq-footer-btn rfq-footer-btn--primary" id="btn-send" ${submitting ? 'disabled' : ''}>
            ${submitting ? 'Sending…' : 'Save & Send to Vendors'}
          </button>
          <button type="button" class="rfq-footer-btn rfq-footer-btn--secondary" id="btn-draft" ${submitting ? 'disabled' : ''}>
            ${submitting ? 'Saving…' : 'Save as Draft'}
          </button>
        </div>
        <div class="rfq-footer__attach">
          <div class="upload-zone upload-zone--wireframe" id="upload-zone" tabindex="0" role="button"
            aria-label="Upload attachments">
            <span class="upload-zone__label">Attachments</span>
            <span class="upload-zone__text">drag & drop files or click to upload</span>
            <span class="upload-zone__hint">${exts}</span>
            <input type="file" id="file-input" class="upload-zone__input" multiple aria-hidden="true" />
          </div>
          <div class="toolbar-file-list">${fileList}</div>
          ${state.errors.attachments ? `<p class="rfq-error">${state.errors.attachments}</p>` : ''}
        </div>
      </div>`;

    document.getElementById('btn-send')?.addEventListener('click', handlers.onSend);
    document.getElementById('btn-draft')?.addEventListener('click', handlers.onDraft);

    const zone = document.getElementById('upload-zone');
    const input = document.getElementById('file-input');
    if (zone && input) {
      zone.addEventListener('click', () => input.click());
      zone.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.click(); } });
      zone.addEventListener('dragover', (e) => { e.preventDefault(); zone.classList.add('upload-zone--drag'); });
      zone.addEventListener('dragleave', () => zone.classList.remove('upload-zone--drag'));
      zone.addEventListener('drop', (e) => {
        e.preventDefault();
        zone.classList.remove('upload-zone--drag');
        if (e.dataTransfer.files.length) store.addFiles(e.dataTransfer.files);
      });
      input.addEventListener('change', () => { if (input.files.length) store.addFiles(input.files); input.value = ''; });
    }

    container.querySelectorAll('[data-fidx]').forEach((btn) => {
      btn.addEventListener('click', () => store.removeFile(parseInt(btn.dataset.fidx, 10)));
    });
  },
};

const ConfirmationModal = {
  show(state, onConfirm, onCancel) {
    const items = state.formData.line_items;
    const vendorNames = state.formData.assigned_vendors.map((v) => v.name).join(', ');
    document.getElementById('modal-root').innerHTML = `
      <div class="modal-overlay" id="confirm-overlay" role="dialog" aria-modal="true">
        <div class="modal">
          <div class="modal__header">
            <h2 class="modal__title">Send RFQ to Vendors?</h2>
            <button class="modal__close" id="confirm-close" aria-label="Close">×</button>
          </div>
          <div class="modal__body">
            <p>This RFQ will be sent to <strong>${state.formData.assigned_vendors.length}</strong> selected vendor(s):</p>
            <p class="confirm-vendors">${esc(vendorNames)}</p>
            <ul class="confirm-summary">
              <li><span>Title</span><strong>${esc(state.formData.title)}</strong></li>
              <li><span>Line Items</span><strong>${items.length}</strong></li>
              <li><span>Deadline</span><strong>${state.formData.deadline ? Format.date(state.formData.deadline) : '—'}</strong></li>
            </ul>
          </div>
          <div class="modal__footer">
            <button class="btn btn-ghost" id="confirm-cancel">Cancel</button>
            <button class="btn btn-primary" id="confirm-send">Confirm & Send</button>
          </div>
        </div>
      </div>`;
    document.getElementById('confirm-close').onclick = onCancel;
    document.getElementById('confirm-cancel').onclick = onCancel;
    document.getElementById('confirm-send').onclick = onConfirm;
  },
  close() { document.getElementById('modal-root').innerHTML = ''; },
};

const RFQStoreHelpers = {
  computeStep(state) {
    const d = state.formData;
    const basicsDone = !!(d.title?.trim() && d.deadline);
    const itemsDone = d.line_items.some((i) => i.item_name?.trim() && parseFloat(i.qty) > 0 && i.unit?.trim());
    const vendorsDone = d.assigned_vendors.length > 0;
    if (!basicsDone) return 1;
    if (!itemsDone || !vendorsDone) return 2;
    return 3;
  },
};

function bindField(id, evt, fn) {
  const el = document.getElementById(id);
  el?.addEventListener(evt, (e) => fn(e.target.value));
}

function esc(str) {
  const d = document.createElement('div');
  d.textContent = str ?? '';
  return d.innerHTML;
}

function errMsg(field, msg) {
  return msg ? `<p class="rfq-error" role="alert">${msg}</p>` : '';
}

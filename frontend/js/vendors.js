/* ═══════════════════════════════════════════════════════
   VendorBridge — Vendors Page
   ═══════════════════════════════════════════════════════ */

const WRITE_ROLES = ['Admin', 'Procurement Officer'];
let store;
let unsubscribe;

document.addEventListener('DOMContentLoaded', async () => {
  if (!Layout.requireAuth()) return;

  store = useVendors();
  const user = Layout.getUser();
  const canWrite = WRITE_ROLES.includes(user.role);

  Layout.mount('vendors', buildPageShell(canWrite));
  bindPageEvents(canWrite);

  unsubscribe = store.subscribe((state) => renderTable(state, canWrite));

  try {
    await store.fetch();
  } catch (err) {
    Toast.show('Error', ApiError.format(err), 'error');
  }

  if (new URLSearchParams(window.location.search).get('action') === 'new' && canWrite) {
    openVendorModal('create');
  }

  hideLoader();
});

function hideLoader() {
  const loader = document.getElementById('page-loader');
  if (loader) {
    loader.style.opacity = '0';
    setTimeout(() => loader.remove(), 300);
  }
}

function buildPageShell(canWrite) {
  return `
    <div class="vendors-page">
      <div class="vendors-page__header">
        <div>
          <h1 class="vendors-page__title">Vendors</h1>
          <p class="vendors-page__subtitle">Manage supplier profiles and registrations</p>
        </div>
        ${canWrite ? '<button class="btn btn-primary" id="add-vendor-btn" aria-label="Add new vendor">+ Add Vendor</button>' : ''}
      </div>

      <div class="vendors-search">
        <label class="sr-only" for="vendor-search">Search vendors</label>
        <input type="search" id="vendor-search" class="vendors-search__input"
          placeholder="Search by name, GST number, category..." autocomplete="off" />
        <svg class="vendors-search__icon" width="18" height="18" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" stroke-width="2" aria-hidden="true">
          <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
        </svg>
      </div>

      <div class="status-tabs" role="tablist" aria-label="Filter by status">
        ${statusTab('all', 'All')}
        ${statusTab('Active', 'Active')}
        ${statusTab('Pending', 'Pending')}
        ${statusTab('Blocked', 'Blocked')}
      </div>

      <div class="vendors-table-card" style="margin-top:0">
        <div id="vendors-table-container"></div>
        <div id="vendors-pagination"></div>
      </div>
    </div>
    <div id="modal-root"></div>
  `;
}

function statusTab(value, label) {
  return `
    <button class="status-tab" role="tab" data-status="${value}" aria-selected="false">
      ${label} <span class="status-tab__count" data-count="${value}">(0)</span>
    </button>
  `;
}

function bindPageEvents(canWrite) {
  document.getElementById('vendor-search')?.addEventListener('input', (e) => {
    store.setSearch(e.target.value);
  });

  document.querySelectorAll('.status-tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.status-tab').forEach((t) => {
        t.classList.remove('status-tab--active');
        t.setAttribute('aria-selected', 'false');
      });
      tab.classList.add('status-tab--active');
      tab.setAttribute('aria-selected', 'true');
      store.setStatusFilter(tab.dataset.status);
    });
  });

  document.querySelector('.status-tab[data-status="all"]')?.classList.add('status-tab--active');
  document.querySelector('.status-tab[data-status="all"]')?.setAttribute('aria-selected', 'true');

  if (canWrite) {
    document.getElementById('add-vendor-btn')?.addEventListener('click', () => openVendorModal('create'));
  }
}

function renderTable(state, canWrite) {
  updateTabCounts(state.counts);

  const container = document.getElementById('vendors-table-container');
  const paginationEl = document.getElementById('vendors-pagination');
  if (!container) return;

  if (state.loading) {
    container.innerHTML = '<div class="vendors-loading" aria-live="polite">Loading vendors…</div>';
    paginationEl.innerHTML = '';
    return;
  }

  if (state.error) {
    container.innerHTML = `
      <div class="vendors-empty" role="alert">
        <div class="vendors-empty__icon">⚠</div>
        <p>${escapeHtml(state.error)}</p>
        <button class="btn btn-primary" style="margin-top:16px" id="retry-fetch">Try Again</button>
      </div>`;
    document.getElementById('retry-fetch')?.addEventListener('click', () => store.fetch());
    paginationEl.innerHTML = '';
    return;
  }

  if (!state.items.length) {
    container.innerHTML = `
      <div class="vendors-empty">
        <div class="vendors-empty__icon">📋</div>
        <p>No vendors found matching your criteria.</p>
      </div>`;
    paginationEl.innerHTML = '';
    return;
  }

  const rows = state.items.map((v) => `
    <tr>
      <td><span class="vendors-table__name">${escapeHtml(v.name)}</span></td>
      <td>${escapeHtml(v.category)}</td>
      <td><code style="font-size:12px">${escapeHtml(v.gst_number)}</code></td>
      <td><span class="${kycClass(v.kyc_status)}">${escapeHtml(v.kyc_status)}</span></td>
      <td><span class="${statusClass(v.status)}">${escapeHtml(v.status)}</span></td>
      <td>
        <button class="vendors-table__link" data-view="${v.id}" aria-label="View ${escapeHtml(v.name)}">View</button>
        ${canWrite ? `<button class="vendors-table__link" data-edit="${v.id}" style="margin-left:12px" aria-label="Edit ${escapeHtml(v.name)}">Edit</button>` : ''}
      </td>
    </tr>
  `).join('');

  container.innerHTML = `
    <table class="vendors-table" role="table">
      <thead>
        <tr>
          <th scope="col">Vendor Name</th>
          <th scope="col">Category</th>
          <th scope="col">GST Number</th>
          <th scope="col">KYC Status</th>
          <th scope="col">Status</th>
          <th scope="col">Action</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>`;

  container.querySelectorAll('[data-view]').forEach((btn) => {
    btn.addEventListener('click', () => openVendorModal('view', btn.dataset.view));
  });
  container.querySelectorAll('[data-edit]').forEach((btn) => {
    btn.addEventListener('click', () => openVendorModal('edit', btn.dataset.edit));
  });

  renderPagination(state, paginationEl);
}

function updateTabCounts(counts) {
  document.querySelectorAll('[data-count]').forEach((el) => {
    const key = el.dataset.count;
    const val = key === 'all' ? counts.all : counts[key] ?? 0;
    el.textContent = `(${val})`;
  });
}

function renderPagination(state, el) {
  if (!el || state.pages <= 1) {
    if (el) el.innerHTML = state.total > 0
      ? `<div class="vendors-pagination"><span class="vendors-pagination__info">Showing ${state.items.length} of ${state.total} vendors</span></div>`
      : '';
    return;
  }

  const start = (state.page - 1) * state.limit + 1;
  const end = Math.min(state.page * state.limit, state.total);

  el.innerHTML = `
    <div class="vendors-pagination">
      <span class="vendors-pagination__info">Showing ${start}–${end} of ${state.total} vendors</span>
      <div class="vendors-pagination__controls">
        <button class="page-btn" id="page-prev" ${state.page <= 1 ? 'disabled' : ''} aria-label="Previous page">← Prev</button>
        <button class="page-btn page-btn--active">${state.page}</button>
        <button class="page-btn" id="page-next" ${state.page >= state.pages ? 'disabled' : ''} aria-label="Next page">Next →</button>
      </div>
    </div>`;

  document.getElementById('page-prev')?.addEventListener('click', () => store.setPage(state.page - 1));
  document.getElementById('page-next')?.addEventListener('click', () => store.setPage(state.page + 1));
}

function statusClass(status) {
  return { Active: 'status-text--active', Pending: 'status-text--pending', Blocked: 'status-text--blocked' }[status] || '';
}

function kycClass(kyc) {
  return { Verified: 'kyc-text--verified', Pending: 'kyc-text--pending', Expired: 'kyc-text--expired' }[kyc] || '';
}

async function openVendorModal(mode, vendorId) {
  const root = document.getElementById('modal-root');
  let vendor = null;

  if (vendorId) {
    try {
      vendor = await store.getVendor(vendorId);
    } catch (err) {
      Toast.show('Error', err.message || String(err), 'error');
      return;
    }
  }

  const isView = mode === 'view';
  const isEdit = mode === 'edit';
  const title = mode === 'create' ? 'Add Vendor' : isView ? 'Vendor Details' : 'Edit Vendor';

  root.innerHTML = `
    <div class="modal-overlay" id="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="modal-title">
      <div class="modal ${isView ? 'modal--wide' : ''}">
        <div class="modal__header">
          <h2 class="modal__title" id="modal-title">${title}</h2>
          <button class="modal__close" id="modal-close" aria-label="Close dialog">×</button>
        </div>
        <div class="modal__body" id="modal-body">
          ${isView ? renderDetailView(vendor) : renderForm(vendor)}
        </div>
        <div class="modal__footer" id="modal-footer">
          ${isView ? renderViewActions(vendor) : renderFormActions(mode, vendor?.id)}
        </div>
      </div>
    </div>`;

  document.getElementById('modal-close')?.addEventListener('click', closeModal);
  document.getElementById('modal-overlay')?.addEventListener('click', (e) => {
    if (e.target.id === 'modal-overlay') closeModal();
  });

  if (!isView) {
    document.getElementById('vendor-form')?.addEventListener('submit', (e) => handleFormSubmit(e, mode, vendor?.id));
  }

  bindViewActions(vendor);
}

function renderForm(vendor = null) {
  const v = vendor || {};
  const cats = VendorValidation.CATEGORIES.map(
    (c) => `<option value="${c}" ${v.category === c ? 'selected' : ''}>${c}</option>`
  ).join('');
  const statuses = VendorValidation.STATUSES.map(
    (s) => `<option value="${s}" ${(v.status || 'Pending') === s ? 'selected' : ''}>${s}</option>`
  ).join('');

  return `
    <form class="vendor-form" id="vendor-form" novalidate>
      <div class="form-field">
        <label for="f-name">Vendor Name *</label>
        <input id="f-name" name="name" type="text" required value="${escapeAttr(v.name || '')}" />
        <span class="field-error-msg" data-error="name"></span>
      </div>
      <div class="form-row">
        <div class="form-field">
          <label for="f-category">Category *</label>
          <select id="f-category" name="category" required>
            <option value="">Select category</option>${cats}
          </select>
          <span class="field-error-msg" data-error="category"></span>
        </div>
        <div class="form-field">
          <label for="f-status">Status</label>
          <select id="f-status" name="status">${statuses}</select>
        </div>
      </div>
      <div class="form-field">
        <label for="f-gst">GST Number *</label>
        <input id="f-gst" name="gst_number" type="text" required maxlength="29"
          value="${escapeAttr(v.gst_number || '')}" placeholder="29 alphanumeric characters" />
        <span class="form-hint">Must be exactly 29 alphanumeric characters</span>
        <span class="field-error-msg" data-error="gst_number"></span>
      </div>
      <div class="form-row">
        <div class="form-field">
          <label for="f-contact">Contact Person *</label>
          <input id="f-contact" name="contact_person" type="text" required value="${escapeAttr(v.contact_person || '')}" />
          <span class="field-error-msg" data-error="contact_person"></span>
        </div>
        <div class="form-field">
          <label for="f-phone">Phone *</label>
          <input id="f-phone" name="phone" type="tel" required value="${escapeAttr(v.phone || '')}" placeholder="+91 9876543210" />
          <span class="field-error-msg" data-error="phone"></span>
        </div>
      </div>
      <div class="form-field">
        <label for="f-email">Email *</label>
        <input id="f-email" name="email" type="email" required value="${escapeAttr(v.email || '')}" />
        <span class="field-error-msg" data-error="email"></span>
      </div>
    </form>`;
}

function renderDetailView(v) {
  return `
    <div class="vendor-detail-grid">
      <div class="detail-item detail-item--full"><label>Vendor Name</label><span>${escapeHtml(v.name)}</span></div>
      <div class="detail-item"><label>Category</label><span>${escapeHtml(v.category)}</span></div>
      <div class="detail-item"><label>Status</label><span class="${statusClass(v.status)}">${escapeHtml(v.status)}</span></div>
      <div class="detail-item detail-item--full"><label>GST Number</label><span><code>${escapeHtml(v.gst_number)}</code></span></div>
      <div class="detail-item"><label>Contact Person</label><span>${escapeHtml(v.contact_person)}</span></div>
      <div class="detail-item"><label>Phone</label><span>${escapeHtml(v.phone)}</span></div>
      <div class="detail-item"><label>Email</label><span>${escapeHtml(v.email)}</span></div>
      <div class="detail-item"><label>KYC Status</label><span class="${kycClass(v.kyc_status)}">${escapeHtml(v.kyc_status)}</span></div>
      <div class="detail-item"><label>Created</label><span>${Format.date(v.created_at)}</span></div>
      <div class="detail-item"><label>Last Updated</label><span>${Format.date(v.updated_at)}</span></div>
    </div>`;
}

function renderViewActions(vendor) {
  const user = Layout.getUser();
  if (!WRITE_ROLES.includes(user.role)) {
    return '<button class="btn btn-ghost" id="modal-cancel">Close</button>';
  }
  const blockLabel = vendor.status === 'Blocked' ? 'Unblock (Set Active)' : 'Block Vendor';
  const blockStatus = vendor.status === 'Blocked' ? 'Active' : 'Blocked';
  return `
    <button class="btn btn-ghost" id="modal-cancel">Close</button>
    <button class="btn btn-ghost" id="modal-block" data-status="${blockStatus}" style="color:var(--danger)">${blockLabel}</button>
    <button class="btn btn-primary" id="modal-edit">Edit</button>`;
}

function renderFormActions(mode, id) {
  return `
    <button type="button" class="btn btn-ghost" id="modal-cancel">Cancel</button>
    <button type="submit" form="vendor-form" class="btn btn-primary" id="modal-save">
      ${mode === 'create' ? 'Create Vendor' : 'Save Changes'}
    </button>`;
}

function bindViewActions(vendor) {
  document.getElementById('modal-cancel')?.addEventListener('click', closeModal);
  document.getElementById('modal-edit')?.addEventListener('click', () => {
    closeModal();
    openVendorModal('edit', vendor.id);
  });
  document.getElementById('modal-block')?.addEventListener('click', async () => {
    const newStatus = document.getElementById('modal-block').dataset.status;
    const result = await store.updateStatus(vendor.id, newStatus);
    if (result.success) {
      Toast.show('Status Updated', `Vendor marked as ${newStatus}.`, 'success');
      closeModal();
    } else {
      Toast.show('Error', result.apiError, 'error');
    }
  });
}

async function handleFormSubmit(e, mode, vendorId) {
  e.preventDefault();
  clearFormErrors();

  const form = e.target;
  const formData = Object.fromEntries(new FormData(form));

  const result = mode === 'create'
    ? await store.createVendor(formData)
    : await store.updateVendor(vendorId, formData);

  if (result.success) {
    Toast.show(
      mode === 'create' ? 'Vendor Created' : 'Vendor Updated',
      `${formData.name} has been ${mode === 'create' ? 'added' : 'updated'} successfully.`,
      'success'
    );
    closeModal();
    return;
  }

  const allErrors = { ...result.errors, ...result.fieldErrors };
  if (result.apiError) {
    Toast.show('Validation Error', result.apiError, 'error');
  }
  showFormErrors(allErrors);
}

function showFormErrors(errors) {
  if (!errors) return;
  Object.entries(errors).forEach(([field, msg]) => {
    const errEl = document.querySelector(`[data-error="${field}"]`);
    const input = document.querySelector(`[name="${field}"]`);
    if (errEl) errEl.textContent = msg;
    if (input) input.classList.add('field-error');
  });
}

function clearFormErrors() {
  document.querySelectorAll('[data-error]').forEach((el) => { el.textContent = ''; });
  document.querySelectorAll('.field-error').forEach((el) => el.classList.remove('field-error'));
}

function closeModal() {
  document.getElementById('modal-root').innerHTML = '';
  store.clearSelected();
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str ?? '';
  return div.innerHTML;
}

function escapeAttr(str) {
  return escapeHtml(str).replace(/"/g, '&quot;');
}

window.addEventListener('beforeunload', () => unsubscribe?.());

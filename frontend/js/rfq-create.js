/* ═══ RFQ Creation Page — wireframe layout ═══ */
const RFQ_WRITE_ROLES = ['Admin', 'Procurement Officer'];

document.addEventListener('DOMContentLoaded', async () => {
  if (!Layout.requireAuth()) return;

  const user = Layout.getUser();
  if (!RFQ_WRITE_ROLES.includes(user.role)) {
    Toast.show('Access Denied', 'You do not have permission to create RFQs.', 'error');
    window.location.href = 'dashboard.html';
    return;
  }

  const store = useRFQStore();

  Layout.mount('rfqs', `
    <div class="rfq-create-page">
      <header class="rfq-create-page__header">
        <h1 class="rfq-create-page__title">Create RFQ's</h1>
        <p class="rfq-create-page__subtitle">new request for quotation</p>
      </header>

      <div class="rfq-form-card">
        <div class="rfq-two-col" id="form-content">
          <div class="rfq-loading">Loading…</div>
        </div>
        <div id="form-footer"></div>
      </div>
    </div>
    <div id="modal-root"></div>
  `);

  const unsubscribe = store.subscribe(() => render(store));

  try {
    await store.init();
    render(store);
  } catch (err) {
    document.getElementById('form-content').innerHTML = `
      <div class="rfq-error-state" role="alert">
        <p>Failed to load configuration: ${esc(err.message || String(err))}</p>
        <button class="btn btn-primary" onclick="location.reload()">Retry</button>
      </div>`;
  }

  hideLoader();
  window.addEventListener('beforeunload', () => unsubscribe());
});

function hideLoader() {
  const loader = document.getElementById('page-loader');
  if (loader) { loader.style.opacity = '0'; setTimeout(() => loader.remove(), 300); }
}

function render(store) {
  const state = store.state;
  if (state.isFetching) return;

  const content = document.getElementById('form-content');
  content.innerHTML = `
    <div id="col-left"></div>
    <div id="col-right">
      <div id="line-items-section"></div>
      <div id="vendors-section"></div>
    </div>`;

  RFQCreateForm.renderLeft(document.getElementById('col-left'), state, store);
  RFQCreateForm.renderLineItems(document.getElementById('line-items-section'), state, store);
  RFQCreateForm.renderVendors(document.getElementById('vendors-section'), state, store);

  RFQToolbar.render(document.getElementById('form-footer'), state, store, {
    onDraft: () => handleDraft(store),
    onSend: () => handleSend(store, state),
  });
}

async function handleDraft(store) {
  const result = await store.saveDraft();
  if (result.success) {
    Toast.show('Draft Saved', `RFQ saved as draft${result.data?.title ? `: ${result.data.title}` : ''}.`, 'success');
  } else if (result.message) {
    Toast.show('Error', result.message, 'error');
  } else {
    Toast.show('Validation Error', 'Please fix the highlighted fields.', 'error');
  }
}

function handleSend(store, state) {
  const errors = store.validateAll();
  if (Object.keys(errors).length) {
    store._setState({ errors });
    Toast.show('Validation Error', 'Please complete all required fields before sending.', 'error');
    render(store);
    return;
  }

  ConfirmationModal.show(store.state, async () => {
    ConfirmationModal.close();
    const result = await store.sendRFQ();
    if (result.success) {
      const count = result.data?.assigned_vendors?.length || store.state.formData.assigned_vendors.length;
      Toast.show('RFQ Sent', `Successfully sent to ${count} vendor(s).`, 'success');
      window.location.href = 'rfqs.html';
    } else if (result.message) {
      Toast.show('Error', result.message, 'error');
    }
  }, () => ConfirmationModal.close());
}

function esc(str) {
  const d = document.createElement('div');
  d.textContent = str ?? '';
  return d.innerHTML;
}

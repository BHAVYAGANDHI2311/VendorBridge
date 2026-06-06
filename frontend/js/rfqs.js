/* ═══ RFQ List Page ═══ */
document.addEventListener('DOMContentLoaded', async () => {
  if (!Layout.requireAuth()) return;

  const user = Layout.getUser();
  const canCreate = ['Admin', 'Procurement Officer'].includes(user.role);

  Layout.mount('rfqs', `
    <div class="rfq-list-page">
      <div class="rfq-list-header">
        <div>
          <h1 class="rfq-create-page__title">RFQs</h1>
          <p class="rfq-create-page__subtitle">Manage request for quotations</p>
        </div>
        ${canCreate ? '<a href="rfq-create.html" class="btn btn-primary">+ Create RFQ</a>' : ''}
      </div>
      <div class="rfq-form-card" id="rfq-list-container">
        <div class="rfq-loading">Loading RFQs…</div>
      </div>
    </div>
  `);

  try {
    const data = await Api.request(`${API_ENDPOINTS.RFQ_LIST}?limit=20`);
    renderList(data.items || []);
  } catch (err) {
    document.getElementById('rfq-list-container').innerHTML = `
      <div class="rfq-error-state" role="alert">
        <p>${esc(ApiError.format(err))}</p>
        <button class="btn btn-primary" onclick="location.reload()">Retry</button>
      </div>`;
  }

  hideLoader();
});

function renderList(items) {
  const container = document.getElementById('rfq-list-container');
  if (!items.length) {
    container.innerHTML = `
      <div class="rfq-error-state">
        <p>No RFQs yet. Create your first RFQ to get started.</p>
        <a href="rfq-create.html" class="btn btn-primary" style="margin-top:16px">+ Create RFQ</a>
      </div>`;
    return;
  }

  const rows = items.map((r) => `
    <tr>
      <td><strong>${esc(r.title)}</strong></td>
      <td>${esc(r.category || '—')}</td>
      <td>${esc(r.status)}</td>
      <td>${r.vendor_count || 0}</td>
      <td>${r.deadline ? Format.date(r.deadline) : '—'}</td>
      <td>${Format.date(r.created_at)}</td>
    </tr>`).join('');

  container.innerHTML = `
    <table class="rfq-table" role="table">
      <thead><tr>
        <th>Title</th><th>Category</th><th>Status</th><th>Vendors</th><th>Deadline</th><th>Created</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
}

function hideLoader() {
  const loader = document.getElementById('page-loader');
  if (loader) { loader.style.opacity = '0'; setTimeout(() => loader.remove(), 300); }
}

function esc(str) {
  const d = document.createElement('div');
  d.textContent = str ?? '';
  return d.innerHTML;
}

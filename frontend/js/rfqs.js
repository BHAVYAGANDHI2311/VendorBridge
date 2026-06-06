/* ═══ RFQ List Page ═══ */
document.addEventListener('DOMContentLoaded', async () => {
  if (!Layout.requireAuth()) return;

  const user = Layout.getUser();
  const isVendor = RoleAccess.isVendor(user.role);
  const canCreate = RoleAccess.canCreateRFQ(user.role);
  const subtitle = isVendor
    ? 'RFQs assigned to your vendor account'
    : 'Manage request for quotations';

  Layout.mount('rfqs', `
    <div class="rfq-list-page">
      <div class="rfq-list-header">
        <div>
          <h1 class="rfq-create-page__title">RFQs</h1>
          <p class="rfq-create-page__subtitle">${subtitle}</p>
        </div>
        ${canCreate ? '<a href="rfq-create.html" class="btn btn-primary">+ Create RFQ</a>' : ''}
        ${isVendor ? '<a href="quotations.html" class="btn btn-primary">Submit Quotation →</a>' : ''}
      </div>
      <div class="rfq-form-card" id="rfq-list-container">
        <div class="rfq-loading">Loading RFQs…</div>
      </div>
    </div>
  `);

  try {
    const data = isVendor
      ? await Api.quotations.listRfqs()
      : await Api.request(`${API_ENDPOINTS.RFQ_LIST}?limit=20`);
    renderList(data.items || [], isVendor);
  } catch (err) {
    document.getElementById('rfq-list-container').innerHTML = `
      <div class="rfq-error-state" role="alert">
        <p>${esc(ApiError.format(err))}</p>
        <button class="btn btn-primary" onclick="location.reload()">Retry</button>
      </div>`;
  }

  hideLoader();
});

function renderList(items, isVendor = false) {
  const container = document.getElementById('rfq-list-container');
  if (!items.length) {
    container.innerHTML = isVendor ? `
      <div class="rfq-error-state">
        <p>No RFQs assigned to you yet.</p>
        <p style="color:var(--text-muted);font-size:13px;margin-top:8px">Assigned RFQs will appear here once procurement sends them to your vendor profile.</p>
      </div>` : `
      <div class="rfq-error-state">
        <p>No RFQs yet. Create your first RFQ to get started.</p>
        <a href="rfq-create.html" class="btn btn-primary" style="margin-top:16px">+ Create RFQ</a>
      </div>`;
    return;
  }

  if (isVendor) {
    const rows = items.map((r) => `
      <tr class="data-table__row" data-href="quotations.html?rfq_id=${encodeURIComponent(r.id)}" tabindex="0" style="cursor:pointer">
        <td><strong>${esc(r.title)}</strong></td>
        <td>${esc(r.category || '—')}</td>
        <td>${esc(r.status)}</td>
        <td>${r.deadline ? Format.date(r.deadline) : '—'}</td>
      </tr>`).join('');
    container.innerHTML = `
      <table class="rfq-table" role="table">
        <thead><tr><th>Title</th><th>Category</th><th>Status</th><th>Deadline</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>`;
    container.querySelectorAll('[data-href]').forEach((row) => {
      const go = () => { window.location.href = row.dataset.href; };
      row.addEventListener('click', go);
      row.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); }
      });
    });
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

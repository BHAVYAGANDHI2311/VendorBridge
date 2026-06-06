/* ═══ Approvals List Page ═══ */

document.addEventListener('DOMContentLoaded', () => {
  if (!Layout.requireAuth()) return;

  const user = Layout.getUser();
  LocalUsers.register(user);

  if (!RoleAccess.canViewApprovals(user.role)) {
    Layout.mount('approvals', `
      <div class="approvals-page">
        <div class="approvals-empty">
          <div style="font-size:48px;margin-bottom:12px;opacity:0.5">🔒</div>
          <p>You do not have access to approvals.</p>
        </div>
      </div>`);
    hideLoader();
    return;
  }

  Layout.mount('approvals', `
    <div class="approvals-page">
      <header class="approvals-page__header">
        <h1 class="approvals-page__title">Approvals</h1>
        <p class="approvals-page__subtitle">Review and action pending quotation approvals</p>
      </header>
      <div class="approvals-card" id="approvals-list"></div>
    </div>
  `);

  renderList();
  hideLoader();
});

function renderList() {
  const container = document.getElementById('approvals-list');
  const items = ApprovalStore.getAll();

  if (!items.length) {
    container.innerHTML = `
      <div class="approvals-empty">
        <div style="font-size:48px;margin-bottom:12px;opacity:0.5">📋</div>
        <p>No approval workflows yet.</p>
        <p style="font-size:13px;color:var(--text-muted);margin-top:8px">
          Select a vendor from Quotation Comparison to start an approval workflow.
        </p>
      </div>`;
    return;
  }

  const rows = items.map((a) => {
    const badgeClass = a.overallStatus === 'Approved' ? 'approved'
      : a.overallStatus === 'Rejected' ? 'rejected' : 'progress';
    return `
      <tr class="data-table__row" data-href="approval-workflow.html?id=${encodeURIComponent(a.id)}" tabindex="0" role="row" style="cursor:pointer">
        <td><strong>${esc(a.rfqTitle)}</strong></td>
        <td>${esc(a.vendorName)}</td>
        <td>${formatCurrency(a.grandTotal)}</td>
        <td><span class="approval-status-badge approval-status-badge--${badgeClass}">${esc(a.overallStatus)}</span></td>
        <td>${formatDate(a.createdAt)}</td>
      </tr>`;
  }).join('');

  container.innerHTML = `
    <div class="data-table-scroll" style="padding:0">
      <table class="data-table" role="table">
        <thead>
          <tr>
            <th scope="col">RFQ</th>
            <th scope="col">Vendor</th>
            <th scope="col">Amount</th>
            <th scope="col">Status</th>
            <th scope="col">Created</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;

  container.querySelectorAll('[data-href]').forEach((row) => {
    const go = () => { window.location.href = row.dataset.href; };
    row.addEventListener('click', go);
    row.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); }
    });
  });
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

function formatDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function formatCurrency(amount) {
  if (amount == null || isNaN(amount)) return '₹0';
  return '₹' + Number(amount).toLocaleString('en-IN', { maximumFractionDigits: 0 });
}

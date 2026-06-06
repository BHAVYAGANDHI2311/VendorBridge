/* ═══ Activity & Logs — immutable audit trail from API ═══ */

const FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'rfq', label: 'RFQ' },
  { id: 'approvals', label: 'Approvals' },
  { id: 'invoices', label: 'Invoices' },
  { id: 'vendors', label: 'Vendors' },
];

let activeFilter = 'all';

document.addEventListener('DOMContentLoaded', async () => {
  if (!Layout.requireAuth()) return;

  const user = Layout.getUser();
  if (!RoleAccess.canViewActivity(user.role)) {
    Layout.mount('activity', `
      <div class="activity-page">
        <div class="activity-empty">
          <div style="font-size:48px;margin-bottom:12px;opacity:0.5">🔒</div>
          <p>You do not have access to the audit trail.</p>
        </div>
      </div>`);
    hideLoader();
    return;
  }

  Layout.mount('activity', `
    <div class="activity-page">
      <header class="activity-page__header">
        <h1 class="activity-page__title">Activity &amp; Logs</h1>
        <p class="activity-page__subtitle">Procurement audit trail</p>
      </header>
      <div class="activity-filters" id="activity-filters" role="tablist" aria-label="Filter activity logs"></div>
      <div class="activity-timeline" id="activity-timeline">
        <div class="activity-loading">Loading activity…</div>
      </div>
    </div>
  `);

  renderFilters();
  await loadLogs(activeFilter);
  hideLoader();
});

function renderFilters() {
  const container = document.getElementById('activity-filters');
  container.innerHTML = FILTERS.map((f) => `
    <button type="button"
      class="activity-filter ${f.id === activeFilter ? 'activity-filter--active' : ''}"
      data-filter="${f.id}"
      role="tab"
      aria-selected="${f.id === activeFilter}">
      ${f.label}
    </button>`).join('');

  container.querySelectorAll('.activity-filter').forEach((btn) => {
    btn.addEventListener('click', async () => {
      activeFilter = btn.dataset.filter;
      renderFilters();
      await loadLogs(activeFilter);
    });
  });
}

async function loadLogs(filter) {
  const timeline = document.getElementById('activity-timeline');
  timeline.innerHTML = '<div class="activity-loading">Loading activity…</div>';

  try {
    const data = await Api.activityLogs.list(filter);
    renderTimeline(data.items || []);
  } catch (err) {
    timeline.innerHTML = `
      <div class="activity-empty">
        <p>${esc(ApiError.format(err))}</p>
        <button class="btn btn-primary" style="margin-top:16px" onclick="location.reload()">Retry</button>
      </div>`;
  }
}

function renderTimeline(items) {
  const timeline = document.getElementById('activity-timeline');

  if (!items.length) {
    timeline.innerHTML = `
      <div class="activity-empty">
        <div style="font-size:40px;margin-bottom:12px;opacity:0.5">📋</div>
        <p>No activity recorded yet for this filter.</p>
        <p style="font-size:13px;color:var(--text-muted);margin-top:8px">
          Actions across RFQs, quotations, approvals, invoices, and vendors appear here automatically.
        </p>
      </div>`;
    return;
  }

  timeline.innerHTML = items.map((item) => {
    const icon = getIcon(item);
    const iconClass = getIconClass(item);
    return `
      <div class="activity-item">
        <div class="activity-item__icon activity-item__icon--${iconClass}" aria-hidden="true">${icon}</div>
        <div class="activity-item__body">
          <div class="activity-item__message">${esc(item.message)}</div>
          <div class="activity-item__meta">
            ${item.performer_name ? esc(item.performer_name) + ' · ' : ''}${formatDateTime(item.created_at)}
          </div>
        </div>
      </div>`;
  }).join('');
}

function getIconClass(item) {
  const type = item.type || '';
  if (type === 'quotation') return 'quotation';
  if (type === 'approval') return 'approval';
  if (type === 'invoice') return 'invoice';
  if (type === 'vendor') return 'vendor';
  return 'rfq';
}

function getIcon(item) {
  const action = (item.action || '').toLowerCase();
  const type = (item.type || '').toLowerCase();

  if (action.includes('quotation_selected') || action.includes('payment_paid')) return '✓';
  if (action.includes('quotation_submitted') || action.includes('approved')) return '✓';
  if (action.includes('rejected')) return '✕';
  if (action.includes('approval') || action.includes('pending')) return '⏳';
  if (action.includes('po_generated')) return '📦';
  if (action.includes('invoice_sent') || action.includes('email')) return '✉';
  if (action.includes('vendor')) return '👤';
  if (type === 'rfq' || action.includes('rfq')) return '📄';
  if (type === 'invoice') return '💳';
  return '•';
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

function formatDateTime(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
    + ', ' + d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

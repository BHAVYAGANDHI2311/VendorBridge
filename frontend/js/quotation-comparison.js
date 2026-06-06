/* ═══ Quotation Comparison — procurement staff only ═══ */

const COMPARISON_ROLES = ['Admin', 'Procurement Officer', 'Manager'];
let currentComparisonData = null;

document.addEventListener('DOMContentLoaded', async () => {
  if (!Layout.requireAuth()) return;

  const user = Layout.getUser();
  LocalUsers.register(user);
  if (!COMPARISON_ROLES.includes(user.role)) {
    window.location.href = 'quotations.html';
    return;
  }

  Layout.mount('quotation-comparison', `
    <div class="quotation-page">
      <header class="quotation-page__header">
        <h1 class="quotation-page__title">Quotation Comparison</h1>
        <p class="quotation-page__subtitle" id="page-subtitle">Compare vendor quotations side by side</p>
      </header>
      <div id="quotation-content">
        <div class="quotation-empty">
          <div class="quotation-empty__icon">⏳</div>
          <div class="quotation-empty__text">Loading quotations…</div>
        </div>
      </div>
    </div>
  `);

  hideLoader();

  try {
    const data = await Api.request('/quotations/compare/rfqs');
    const rfqs = data.items || [];

    if (!rfqs.length) {
      document.getElementById('quotation-content').innerHTML = `
        <div class="quotation-empty">
          <div class="quotation-empty__icon">📋</div>
          <div class="quotation-empty__text">No quotations received yet.</div>
          <p style="color:var(--text-muted);font-size:13px">Comparison will appear once vendors submit quotations for an RFQ.</p>
        </div>`;
      return;
    }

    const urlParams = new URLSearchParams(window.location.search);
    const preselectedId = urlParams.get('rfq_id') || rfqs[0].rfq_id;

    renderComparisonRFQPicker(rfqs, preselectedId);
    await loadComparison(preselectedId);
  } catch (err) {
    document.getElementById('quotation-content').innerHTML = `
      <div class="quotation-empty">
        <div class="quotation-empty__icon">⚠</div>
        <div class="quotation-empty__text">${escQ(ApiError.format(err))}</div>
        <button class="btn btn-primary" onclick="location.reload()">Retry</button>
      </div>`;
  }
});

function renderComparisonRFQPicker(rfqs, selectedId) {
  const options = rfqs.map((r) =>
    `<option value="${r.rfq_id}" ${r.rfq_id === selectedId ? 'selected' : ''}>${escQ(r.title)} (${r.quotation_count} quotation${r.quotation_count === 1 ? '' : 's'})</option>`
  ).join('');

  const picker = document.createElement('div');
  picker.className = 'compare-rfq-picker';
  picker.innerHTML = `
    <div class="compare-rfq-picker__label">Select RFQ</div>
    <select class="rfq-select" id="compare-rfq-select">${options}</select>`;

  const container = document.getElementById('quotation-content');
  container.innerHTML = '';
  container.appendChild(picker);

  const tableHost = document.createElement('div');
  tableHost.id = 'comparison-table-area';
  container.appendChild(tableHost);

  document.getElementById('compare-rfq-select').addEventListener('change', (e) => {
    const rfqId = e.target.value;
    const url = new URL(window.location.href);
    url.searchParams.set('rfq_id', rfqId);
    window.history.replaceState({}, '', url);
    loadComparison(rfqId);
  });
}

async function loadComparison(rfqId) {
  const area = document.getElementById('comparison-table-area');
  if (!area) return;

  area.innerHTML = `
    <div class="quotation-empty">
      <div class="quotation-empty__icon">⏳</div>
      <div class="quotation-empty__text">Loading comparison…</div>
    </div>`;

  try {
    const data = await Api.request(`/quotations/compare/${rfqId}`);
    document.getElementById('page-subtitle').textContent =
      `RFQ: ${data.rfq_title} — ${data.quotation_count} quotation${data.quotation_count === 1 ? '' : 's'} received`;

    renderComparisonTable(data);
  } catch (err) {
    area.innerHTML = `
      <div class="quotation-empty">
        <div class="quotation-empty__icon">⚠</div>
        <div class="quotation-empty__text">${escQ(ApiError.format(err))}</div>
      </div>`;
  }
}

function renderComparisonTable(data) {
  const area = document.getElementById('comparison-table-area');
  const columns = data.columns || [];
  const criteria = data.criteria || [];

  const headerCells = columns.map((col) => `
    <th class="${col.is_lowest ? 'compare-th--lowest' : ''}" scope="col">
      ${escQ(col.vendor_name)}
      ${col.is_lowest ? '<span class="compare-lowest-badge">Lowest</span>' : ''}
    </th>`).join('');

  const bodyRows = criteria.map((criterion) => `
    <tr>
      <th class="compare-criteria" scope="row">${escQ(criterion.label)}</th>
      ${columns.map((col) => `
        <td class="${col.is_lowest ? 'compare-td--lowest' : ''}">
          <span class="compare-value ${criterion.format === 'currency' ? 'compare-value--currency' : ''}">
            ${formatCompareValue(col.values[criterion.key], criterion.format)}
          </span>
        </td>`).join('')}
    </tr>`).join('');

  const hasSelection = Boolean(data.selected_quotation_id);

  const actionRow = `
    <tr class="compare-actions-row">
      <td></td>
      ${columns.map((col) => {
        if (col.is_selected) {
          return `<td class="${col.is_lowest ? 'compare-td--lowest' : ''}">
            <span class="compare-value" style="color:var(--success);font-weight:600">Selected</span>
          </td>`;
        }
        if (hasSelection) {
          return `<td class="${col.is_lowest ? 'compare-td--lowest' : ''}">—</td>`;
        }
        return `<td class="${col.is_lowest ? 'compare-td--lowest' : ''}">
          <button type="button"
            class="btn ${col.is_lowest ? 'btn-primary' : 'btn-ghost'} compare-select-btn"
            data-quotation-id="${col.quotation_id}"
            data-vendor-id="${col.vendor_id || ''}"
            data-vendor-name="${escQ(col.vendor_name)}"
            data-grand-total="${col.values?.grand_total ?? ''}"
            data-delivery-days="${col.values?.delivery_days ?? ''}"
            data-vendor-rating="${col.values?.vendor_rating ?? ''}">
            ${col.is_lowest ? 'Select &amp; Approve' : 'Select'}
          </button>
        </td>`;
      }).join('')}
    </tr>`;

  area.innerHTML = `
    <div class="compare-card">
      <div class="compare-card__body">
        <div class="compare-scroll">
          <table class="compare-table" role="table" aria-label="Quotation comparison for ${escQ(data.rfq_title)}">
            <thead>
              <tr>
                <th class="compare-criteria" scope="col">Criteria</th>
                ${headerCells}
              </tr>
            </thead>
            <tbody>
              ${bodyRows}
              ${actionRow}
            </tbody>
          </table>
        </div>
        ${data.footnote ? `<p class="compare-footnote">${escQ(data.footnote)}</p>` : ''}
      </div>
    </div>`;

  area.querySelectorAll('.compare-select-btn').forEach((btn) => {
    btn.addEventListener('click', () => handleSelectVendor(data.rfq_id, btn));
  });
}

async function handleSelectVendor(rfqId, btn) {
  const quotationId = btn.dataset.quotationId;
  const vendorName = btn.dataset.vendorName;
  const data = currentComparisonData;

  btn.disabled = true;
  const originalText = btn.textContent;
  btn.textContent = 'Processing…';

  try {
    await Api.request('/quotations/select', {
      method: 'POST',
      body: JSON.stringify({ rfq_id: rfqId, quotation_id: quotationId }),
    });

    const approval = ApprovalStore.createFromSelection({
      rfqId,
      rfqTitle: data?.rfq_title || '',
      quotationId,
      vendorId: btn.dataset.vendorId || '',
      vendorName,
      grandTotal: parseFloat(btn.dataset.grandTotal) || 0,
      deliveryDays: parseInt(btn.dataset.deliveryDays, 10) || 0,
      vendorRating: btn.dataset.vendorRating !== '' ? parseFloat(btn.dataset.vendorRating) : null,
    });

    Toast.show('Vendor Selected', `"${vendorName}" selected. Opening approval workflow…`, 'success');
    setTimeout(() => {
      window.location.href = `approval-workflow.html?id=${encodeURIComponent(approval.id)}`;
    }, 800);
  } catch (err) {
    Toast.show('Error', ApiError.format(err), 'error');
    btn.disabled = false;
    btn.textContent = originalText;
  }
}

function formatCompareValue(value, format) {
  if (value == null || value === '') return '—';
  switch (format) {
    case 'currency':
      return formatCurrency(value);
    case 'percent':
      return `${value}%`;
    case 'rating':
      return `${value}/5`;
    case 'number':
      return String(value);
    default:
      return escQ(String(value));
  }
}

function hideLoader() {
  const loader = document.getElementById('page-loader');
  if (loader) { loader.style.opacity = '0'; setTimeout(() => loader.remove(), 300); }
}

function escQ(str) {
  const d = document.createElement('div');
  d.textContent = str ?? '';
  return d.innerHTML;
}

function formatCurrency(amount) {
  if (amount == null || isNaN(amount)) return '₹0';
  return '₹' + amount.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

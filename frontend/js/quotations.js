/* ═══ Submit Quotations — vendor page (quotations.html) ═══ */

const COMPARISON_ROLES = ['Admin', 'Procurement Officer', 'Manager'];

document.addEventListener('DOMContentLoaded', async () => {
  if (!Layout.requireAuth()) return;

  const user = Layout.getUser();

  if (COMPARISON_ROLES.includes(user.role)) {
    window.location.href = 'quotation-comparison.html' + window.location.search;
    return;
  }

  if (user.role !== 'Vendor') {
    Layout.mount('quotations', `
      <div class="quotation-page">
        <div class="quotation-empty">
          <div class="quotation-empty__icon">🔒</div>
          <div class="quotation-empty__text">Submit Quotations is only available to vendor accounts.</div>
        </div>
      </div>`);
    hideLoader();
    return;
  }

  Layout.mount('quotations', `
    <div class="quotation-page">
      <header class="quotation-page__header">
        <h1 class="quotation-page__title">Submit Quotations</h1>
        <p class="quotation-page__subtitle" id="page-subtitle">Select an RFQ to submit your quotation</p>
      </header>
      <div id="quotation-content">
        <div class="quotation-empty">
          <div class="quotation-empty__icon">⏳</div>
          <div class="quotation-empty__text">Loading RFQs…</div>
        </div>
      </div>
    </div>
  `);

  hideLoader();

  try {
    const data = await Api.request('/quotations/rfqs');
    const rfqs = data.items || [];

    if (!rfqs.length) {
      renderEmptyState();
      return;
    }

    const urlParams = new URLSearchParams(window.location.search);
    const preselectedId = urlParams.get('rfq_id');

    renderRFQSelector(rfqs, preselectedId);
  } catch (err) {
    document.getElementById('quotation-content').innerHTML = `
      <div class="quotation-empty">
        <div class="quotation-empty__icon">⚠</div>
        <div class="quotation-empty__text">${escQ(ApiError.format(err))}</div>
        <button class="btn btn-primary" onclick="location.reload()">Retry</button>
      </div>`;
  }
});

function renderEmptyState() {
  document.getElementById('quotation-content').innerHTML = `
    <div class="quotation-empty">
      <div class="quotation-empty__icon">📋</div>
      <div class="quotation-empty__text">No RFQs assigned to you yet.</div>
      <p style="color:var(--text-muted);font-size:13px">RFQs will appear here once a Procurement Officer assigns them to your vendor profile.</p>
    </div>`;
}

function renderRFQSelector(rfqs, preselectedId) {
  const container = document.getElementById('quotation-content');

  const options = rfqs.map((r) =>
    `<option value="${r.id}" ${r.id === preselectedId ? 'selected' : ''}>${escQ(r.title)} — Deadline: ${r.deadline ? formatDate(r.deadline) : 'N/A'}</option>`
  ).join('');

  container.innerHTML = `
    <div class="rfq-selector-card">
      <h3 class="rfq-selector-card__title">Select RFQ</h3>
      <select class="rfq-select" id="rfq-select">
        <option value="">— Choose an RFQ —</option>
        ${options}
      </select>
    </div>
    <div id="quotation-form-area"></div>`;

  const select = document.getElementById('rfq-select');
  select.addEventListener('change', () => {
    const rfqId = select.value;
    if (rfqId) {
      loadRFQForQuotation(rfqId);
    } else {
      document.getElementById('quotation-form-area').innerHTML = '';
      document.getElementById('page-subtitle').textContent = 'Select an RFQ to submit your quotation';
    }
  });

  if (preselectedId && rfqs.find((r) => r.id === preselectedId)) {
    loadRFQForQuotation(preselectedId);
  }
}

async function loadRFQForQuotation(rfqId) {
  const formArea = document.getElementById('quotation-form-area');
  formArea.innerHTML = `
    <div class="quotation-empty">
      <div class="quotation-empty__icon">⏳</div>
      <div class="quotation-empty__text">Loading RFQ details…</div>
    </div>`;

  try {
    const rfq = await Api.request(`/quotations/rfq/${rfqId}`);
    document.getElementById('page-subtitle').textContent =
      `RFQ: ${rfq.title} — deadline ${rfq.deadline ? formatDate(rfq.deadline) : 'N/A'}`;

    renderQuotationForm(rfq);
  } catch (err) {
    formArea.innerHTML = `
      <div class="quotation-empty">
        <div class="quotation-empty__icon">⚠</div>
        <div class="quotation-empty__text">${escQ(ApiError.format(err))}</div>
      </div>`;
  }
}

function renderQuotationForm(rfq) {
  const formArea = document.getElementById('quotation-form-area');
  const existing = rfq.existing_quotation;

  const summaryItems = (rfq.line_items || []).map((i) =>
    `${escQ(i.item_name)} × ${i.qty}${i.unit ? ' ' + i.unit : ''}`
  ).join(', ');

  const summaryText = summaryItems
    ? `${summaryItems}${rfq.category ? ' — category ' + escQ(rfq.category) : ''}`
    : rfq.description || 'No items specified';

  const rows = (rfq.line_items || []).map((item, i) => {
    const existingItem = existing?.line_items?.[i];
    return `
      <tr>
        <td>${escQ(item.item_name)}</td>
        <td>${item.qty}</td>
        <td>
          <input type="number" class="qt-input" data-idx="${i}" data-field="unit_price"
            value="${existingItem?.unit_price || ''}" min="0" step="any"
            placeholder="0.00" aria-label="Unit price for ${escQ(item.item_name)}" />
        </td>
        <td class="qt-total" data-total-idx="${i}">₹0</td>
        <td>
          <input type="number" class="qt-input" data-idx="${i}" data-field="delivery_days"
            value="${existingItem?.delivery_days || ''}" min="0" step="1"
            placeholder="Days" aria-label="Delivery days for ${escQ(item.item_name)}" />
        </td>
      </tr>`;
  }).join('');

  formArea.innerHTML = `
    <div class="rfq-summary-card">
      <div class="rfq-summary-card__label">RFQ Summary</div>
      <div class="rfq-summary-card__text">${summaryText}</div>
    </div>

    <div class="quotation-form-card">
      <div class="quotation-form-card__body">
        <h3 class="quotation-section-title">Your Quotation</h3>
        <table class="quotation-table" id="quotation-table">
          <thead>
            <tr>
              <th>Item</th>
              <th>Qty</th>
              <th>Unit Price</th>
              <th>Total</th>
              <th>Delivery (days)</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>

        <div class="quotation-bottom-row">
          <div>
            <div class="quotation-field">
              <label class="quotation-field__label" for="qt-tax">Tax / GST %</label>
              <input type="number" class="quotation-field__input" id="qt-tax"
                value="${existing?.tax_percent ?? 18}" min="0" max="100" step="0.01" placeholder="18 %" />
            </div>
            <div class="quotation-field" style="margin-top:16px">
              <label class="quotation-field__label" for="qt-notes">Note / Terms</label>
              <textarea class="quotation-field__input quotation-field__textarea" id="qt-notes"
                placeholder="Payment terms: 30 days net…">${escQ(existing?.notes || '')}</textarea>
            </div>
          </div>
          <div class="quotation-totals" id="quotation-totals">
            <div class="quotation-totals__row">
              <span>Subtotal</span>
              <span class="quotation-totals__value" id="qt-subtotal">₹0</span>
            </div>
            <div class="quotation-totals__row">
              <span id="qt-tax-label">GST (18%)</span>
              <span class="quotation-totals__value" id="qt-tax-amount">₹0</span>
            </div>
            <div class="quotation-totals__row quotation-totals__row--grand">
              <span>Grand Total</span>
              <span id="qt-grand-total">₹0</span>
            </div>
          </div>
        </div>
      </div>

      <div class="quotation-footer">
        <button type="button" class="quotation-btn quotation-btn--primary" id="btn-submit-quotation">
          Submit Quotation
        </button>
        <button type="button" class="quotation-btn quotation-btn--secondary" id="btn-save-draft">
          Save Draft
        </button>
      </div>
    </div>`;

  formArea._rfq = rfq;

  document.getElementById('quotation-table').querySelectorAll('.qt-input[data-field="unit_price"]').forEach((el) => {
    el.addEventListener('input', () => recalculateTotals(rfq));
  });
  document.getElementById('qt-tax').addEventListener('input', () => recalculateTotals(rfq));

  recalculateTotals(rfq);

  document.getElementById('btn-submit-quotation').addEventListener('click', () => handleSubmit(rfq, 'submit'));
  document.getElementById('btn-save-draft').addEventListener('click', () => handleSubmit(rfq, 'draft'));
}

function recalculateTotals(rfq) {
  const lineItems = rfq.line_items || [];
  let subtotal = 0;

  lineItems.forEach((item, i) => {
    const priceEl = document.querySelector(`[data-idx="${i}"][data-field="unit_price"]`);
    const totalEl = document.querySelector(`[data-total-idx="${i}"]`);
    const price = parseFloat(priceEl?.value) || 0;
    const total = item.qty * price;
    subtotal += total;
    if (totalEl) totalEl.textContent = formatCurrency(total);
  });

  const taxPercent = parseFloat(document.getElementById('qt-tax')?.value) || 0;
  const taxAmount = subtotal * taxPercent / 100;
  const grandTotal = subtotal + taxAmount;

  document.getElementById('qt-subtotal').textContent = formatCurrency(subtotal);
  document.getElementById('qt-tax-label').textContent = `GST (${taxPercent}%)`;
  document.getElementById('qt-tax-amount').textContent = formatCurrency(taxAmount);
  document.getElementById('qt-grand-total').textContent = formatCurrency(grandTotal);
}

async function handleSubmit(rfq, mode) {
  const lineItems = (rfq.line_items || []).map((item, i) => {
    const priceEl = document.querySelector(`[data-idx="${i}"][data-field="unit_price"]`);
    const daysEl = document.querySelector(`[data-idx="${i}"][data-field="delivery_days"]`);
    return {
      item_name: item.item_name,
      qty: item.qty,
      unit: item.unit || '',
      unit_price: parseFloat(priceEl?.value) || 0,
      delivery_days: parseInt(daysEl?.value) || 0,
    };
  });

  const taxPercent = parseFloat(document.getElementById('qt-tax')?.value) || 0;
  const notes = document.getElementById('qt-notes')?.value || '';

  const payload = {
    rfq_id: rfq.id,
    line_items: lineItems,
    tax_percent: taxPercent,
    notes: notes,
  };

  const endpoint = mode === 'submit' ? '/quotations/submit' : '/quotations/draft';
  const btnId = mode === 'submit' ? 'btn-submit-quotation' : 'btn-save-draft';
  const btn = document.getElementById(btnId);

  btn.disabled = true;
  btn.textContent = mode === 'submit' ? 'Submitting…' : 'Saving…';

  try {
    await Api.request(endpoint, {
      method: 'POST',
      body: JSON.stringify(payload),
    });

    if (mode === 'submit') {
      Toast.show('Quotation Submitted', `Your quotation for "${rfq.title}" has been submitted successfully.`, 'success');
    } else {
      Toast.show('Draft Saved', 'Quotation draft saved.', 'success');
    }
  } catch (err) {
    Toast.show('Error', ApiError.format(err), 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = mode === 'submit' ? 'Submit Quotation' : 'Save Draft';
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

function formatDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
}

function formatCurrency(amount) {
  if (amount == null || isNaN(amount)) return '₹0';
  return '₹' + amount.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

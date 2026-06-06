/* ═══ Purchase Order & Invoice Page ═══ */

let currentPO = null;

let canManagePO = false;

document.addEventListener('DOMContentLoaded', async () => {
  if (!Layout.requireAuth()) return;

  canManagePO = RoleAccess.canManagePurchaseOrders(Layout.getUser().role);

  const params = new URLSearchParams(window.location.search);
  const poId = params.get('id');

  if (poId) {
    await loadDetail(poId);
  } else {
    await loadList();
  }
});

async function loadList() {
  const isVendor = RoleAccess.isVendor(Layout.getUser().role);
  Layout.mount('purchase-orders', `
    <div class="po-page">
      <header class="po-page__top">
        <div>
          <h1 class="po-page__title">Purchase Orders</h1>
          <p class="po-page__subtitle">${isVendor ? 'Your purchase orders' : 'Orders generated from approved quotations'}</p>
        </div>
      </header>
      <div class="po-card" id="po-list">
        <div class="approvals-empty"><div class="quotation-empty__icon">⏳</div><p>Loading…</p></div>
      </div>
    </div>
  `);
  hideLoader();

  try {
    const data = await Api.purchaseOrders.list();
    renderList(data.items || []);
  } catch (err) {
    document.getElementById('po-list').innerHTML = errorHtml(ApiError.format(err));
  }
}

function renderList(items) {
  const container = document.getElementById('po-list');
  if (!items.length) {
    container.innerHTML = `
      <div class="approvals-empty">
        <div style="font-size:48px;margin-bottom:12px;opacity:0.5">📦</div>
        <p>No purchase orders yet.</p>
        <p style="font-size:13px;color:var(--text-muted);margin-top:8px">
          POs are created automatically when L2 approval is completed.
        </p>
      </div>`;
    return;
  }

  const rows = items.map((po) => `
    <tr class="data-table__row" data-href="purchase-orders.html?id=${encodeURIComponent(po.id)}" tabindex="0" style="cursor:pointer">
      <td><strong>${esc(po.po_number)}</strong></td>
      <td>${esc(po.vendor_name)}</td>
      <td>${esc(po.rfq_title)}</td>
      <td>${formatCurrency(po.grand_total)}</td>
      <td>${statusBadge(po.status)}</td>
      <td>${formatDate(po.po_date || po.created_at)}</td>
    </tr>`).join('');

  container.innerHTML = `
    <div class="data-table-scroll">
      <table class="data-table" role="table">
        <thead>
          <tr>
            <th>PO Number</th><th>Vendor</th><th>RFQ</th><th>Amount</th><th>Status</th><th>PO Date</th>
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

async function loadDetail(poId) {
  Layout.mount('purchase-orders', `
    <div class="po-page">
      <div class="po-page__top">
        <div>
          <h1 class="po-page__title">Purchase Order &amp; Invoice</h1>
          <p class="po-page__subtitle" id="po-subtitle">Loading…</p>
        </div>
        <div class="po-actions" id="po-toolbar"></div>
      </div>
      <div id="po-detail"><div class="approvals-empty">Loading…</div></div>
    </div>
  `);
  hideLoader();

  try {
    const po = await Api.purchaseOrders.get(poId);
    currentPO = po;
    renderDetail(po);
  } catch (err) {
    document.getElementById('po-detail').innerHTML = errorHtml(ApiError.format(err));
  }
}

function renderDetail(po) {
  document.getElementById('po-subtitle').textContent =
    `${po.po_number} — ${po.status}`;

  const canPay = canManagePO && po.status === 'Pending Payment';
  const canCancel = canManagePO && po.status === 'Pending Payment';

  document.getElementById('po-toolbar').innerHTML = canManagePO ? `
    <label class="po-toolbar-check">
      <input type="checkbox" id="pdf-email-copy" />
      Email copy to my account
    </label>
    <button type="button" class="btn btn-ghost" id="btn-download-pdf">Download PDF</button>
    <button type="button" class="btn btn-ghost" id="btn-print">Print</button>
    <button type="button" class="btn btn-ghost" id="btn-email">Send Email</button>
  ` : `
    <button type="button" class="btn btn-ghost" id="btn-print">Print</button>
  `;

  const billTo = po.bill_to || {};
  const vendor = po.vendor || {};
  const rows = (po.line_items || []).map((item) => `
    <tr>
      <td>${esc(item.item_name)}</td>
      <td>${item.qty}</td>
      <td>${formatCurrency(item.unit_price)}</td>
      <td>${formatCurrency(item.total)}</td>
    </tr>`).join('');

  document.getElementById('po-detail').innerHTML = `
    <div class="po-card" id="print-area">
      <div class="po-parties">
        <div class="po-party">
          <div class="po-party__label">Bill To</div>
          <div class="po-party__name">${esc(billTo.organization_name || '—')}</div>
          <div class="po-party__line">${esc(billTo.address || '')}</div>
          <div class="po-party__line">GSTIN: ${esc(billTo.gstin || '—')}</div>
        </div>
        <div class="po-party">
          <div class="po-party__label">Vendor</div>
          <div class="po-party__name">${esc(vendor.name || '—')}</div>
          <div class="po-party__line">${esc(vendor.address || '')}</div>
          <div class="po-party__line">GSTIN: ${esc(vendor.gstin || '—')}</div>
        </div>
      </div>

      <div class="po-meta-row">
        <div class="po-meta-item">
          <div class="po-meta-item__label">PO Number</div>
          <div class="po-meta-item__value">${esc(po.po_number)}</div>
        </div>
        <div class="po-meta-item">
          <div class="po-meta-item__label">Invoice Number</div>
          <div class="po-meta-item__value">${esc(po.invoice_number || '—')}</div>
        </div>
        <div class="po-meta-item">
          <div class="po-meta-item__label">PO Date</div>
          <div class="po-meta-item__value">${formatDate(po.po_date)}</div>
        </div>
        <div class="po-meta-item">
          <div class="po-meta-item__label">Invoice Date</div>
          <div class="po-meta-item__value">${formatDate(po.invoice_date)}</div>
        </div>
        <div class="po-meta-item">
          <div class="po-meta-item__label">Due Date</div>
          <div class="po-meta-item__value">${formatDate(po.due_date)}</div>
        </div>
      </div>

      <table class="po-table" role="table">
        <thead>
          <tr><th>Item</th><th>Qty</th><th>Unit Price</th><th>Total</th></tr>
        </thead>
        <tbody>${rows || '<tr><td colspan="4" class="data-table__empty">No line items</td></tr>'}</tbody>
      </table>

      <div class="po-totals">
        <div class="po-totals__row"><span>Subtotal</span><span>${formatCurrency(po.subtotal)}</span></div>
        <div class="po-totals__row"><span>CGST (9%)</span><span>${formatCurrency(po.cgst)}</span></div>
        <div class="po-totals__row"><span>SGST (9%)</span><span>${formatCurrency(po.sgst)}</span></div>
        <div class="po-totals__row po-totals__row--grand"><span>Grand Total</span><span>${formatCurrency(po.grand_total)}</span></div>
      </div>

      <div class="po-footer-actions">
        <div>${statusBadge(po.status)}</div>
        <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">
          ${canPay ? '<button type="button" class="btn btn-primary" id="btn-mark-paid">Mark as Paid</button>' : ''}
          ${canCancel ? '<button type="button" class="btn btn-ghost" id="btn-cancel-po">Cancel PO</button>' : ''}
          <a href="purchase-orders.html" class="btn btn-ghost">← All Purchase Orders</a>
        </div>
      </div>

      ${renderEmailLogs(po.email_logs)}
    </div>
  `;

  document.getElementById('btn-download-pdf')?.addEventListener('click', () => downloadPdf(po));
  document.getElementById('btn-print')?.addEventListener('click', () => window.print());
  document.getElementById('btn-email')?.addEventListener('click', () => openEmailModal(po));
  document.getElementById('btn-mark-paid')?.addEventListener('click', () => markAsPaid(po.id));
  document.getElementById('btn-cancel-po')?.addEventListener('click', () => cancelPO(po.id));
}

function renderEmailLogs(logs) {
  if (!logs || !logs.length) return '';
  const rows = logs.map((log) => `
    <tr>
      <td>${formatDate(log.sent_at)}</td>
      <td>${esc(log.to)}</td>
      <td>${esc(log.subject)}</td>
      <td>${esc(log.attachment || '—')}</td>
    </tr>`).join('');
  return `
    <div class="po-email-logs">
      <h3 class="po-email-logs__title">Email History</h3>
      <table class="po-table" role="table">
        <thead><tr><th>Sent</th><th>To</th><th>Subject</th><th>Attachment</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}

async function cancelPO(poId) {
  if (!confirm('Cancel this purchase order and linked invoice?')) return;
  const btn = document.getElementById('btn-cancel-po');
  btn.disabled = true;
  btn.textContent = 'Cancelling…';
  try {
    const updated = await Api.purchaseOrders.updateStatus(poId, 'Cancelled');
    currentPO = updated;
    Toast.show('Status Updated', 'Purchase order cancelled.', 'success');
    renderDetail(updated);
  } catch (err) {
    Toast.show('Error', ApiError.format(err), 'error');
    btn.disabled = false;
    btn.textContent = 'Cancel PO';
  }
}

async function downloadPdf(po) {
  if (!po.invoice_id) {
    Toast.show('Error', 'No invoice linked to this purchase order.', 'error');
    return;
  }
  const sendEmail = document.getElementById('pdf-email-copy')?.checked || false;
  const btn = document.getElementById('btn-download-pdf');
  if (btn) { btn.disabled = true; btn.textContent = sendEmail ? 'Sending…' : 'Downloading…'; }
  try {
    const result = await Api.invoices.downloadAndSave(po.invoice_id, {
      sendEmail,
      invoiceNumber: po.invoice_number,
      poNumber: po.po_number,
    });
    if (sendEmail && result.emailResult) {
      Toast.show('Done', `${result.filename} downloaded and emailed to your account.`, 'success');
      const updated = await Api.purchaseOrders.get(po.id);
      currentPO = updated;
      renderDetail(updated);
    } else {
      Toast.show('Downloaded', `${result.filename} saved.`, 'success');
    }
  } catch (err) {
    Toast.show('Error', ApiError.format(err), 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Download PDF'; }
  }
}

function openEmailModal(po) {
  const userEmail = Layout.getUser().email || '';
  const overlay = document.createElement('div');
  overlay.className = 'po-modal-overlay';
  overlay.id = 'email-modal';
  overlay.innerHTML = `
    <div class="po-modal" role="dialog" aria-labelledby="email-modal-title">
      <h2 class="po-modal__title" id="email-modal-title">Send Invoice Email</h2>
      <p class="po-modal__hint">The invoice PDF will be sent to your logged-in account email.</p>
      <div class="po-field">
        <label class="po-field__label" for="email-to">To (your account)</label>
        <input type="email" class="po-field__input" id="email-to" value="${escAttr(userEmail)}" readonly />
      </div>
      <div class="po-field">
        <label class="po-field__label" for="email-subject">Subject</label>
        <input type="text" class="po-field__input" id="email-subject" value="${escAttr(`Invoice ${po.invoice_number || po.po_number}`)}" />
      </div>
      <div class="po-field">
        <label class="po-field__label" for="email-message">Message</label>
        <textarea class="po-field__input po-field__textarea" id="email-message">Please find attached the invoice ${esc(po.invoice_number || po.po_number)} for purchase order ${esc(po.po_number)}.</textarea>
      </div>
      <div class="po-modal__actions">
        <button type="button" class="btn btn-ghost" id="email-cancel">Cancel</button>
        <button type="button" class="btn btn-primary" id="email-send">Send</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  document.getElementById('email-cancel').addEventListener('click', () => overlay.remove());
  overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
  document.getElementById('email-send').addEventListener('click', async () => {
    if (!userEmail) {
      Toast.show('Error', 'No email on your account. Please log in again or update your profile.', 'error');
      return;
    }
    const btn = document.getElementById('email-send');
    btn.disabled = true;
    try {
      const res = await Api.invoices.sendEmail(po.invoice_id, {
        subject: document.getElementById('email-subject').value.trim(),
        message: document.getElementById('email-message').value.trim(),
      });
      Toast.show('Email Sent', res.message || 'Invoice sent to your registered email.', 'success');
      overlay.remove();
      const updated = await Api.purchaseOrders.get(po.id);
      currentPO = updated;
      renderDetail(updated);
    } catch (err) {
      Toast.show('Error', ApiError.format(err), 'error');
      btn.disabled = false;
    }
  });
}

async function markAsPaid(poId) {
  const btn = document.getElementById('btn-mark-paid');
  btn.disabled = true;
  btn.textContent = 'Updating…';
  try {
    const updated = await Api.purchaseOrders.updateStatus(poId, 'Paid');
    currentPO = updated;
    Toast.show('Status Updated', 'Purchase order marked as Paid.', 'success');
    renderDetail(updated);
  } catch (err) {
    Toast.show('Error', ApiError.format(err), 'error');
    btn.disabled = false;
    btn.textContent = 'Mark as Paid';
  }
}

function statusBadge(status) {
  const key = (status || '').toLowerCase().replace(/\s+/g, '-');
  const cls = key.includes('paid') ? 'paid' : key.includes('cancel') ? 'cancelled' : 'pending';
  return `<span class="po-status-badge po-status-badge--${cls}">${esc(status)}</span>`;
}

function errorHtml(msg) {
  return `<div class="approvals-empty"><p>${esc(msg)}</p><button class="btn btn-primary" onclick="location.reload()">Retry</button></div>`;
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

function escAttr(str) {
  return String(str ?? '').replace(/"/g, '&quot;');
}

function formatDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function formatCurrency(amount) {
  if (amount == null || isNaN(amount)) return '₹0';
  return '₹' + Number(amount).toLocaleString('en-IN', { maximumFractionDigits: 2 });
}

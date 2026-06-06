/* ═══ Invoices — staff only (Admin, Procurement Officer, Manager) ═══ */

let canManageInvoices = false;

document.addEventListener('DOMContentLoaded', async () => {
  if (!Layout.requireAuth()) return;

  const user = Layout.getUser();
  if (!RoleAccess.canViewInvoices(user.role)) {
    Layout.mount('invoices', RoleAccess.accessDeniedHtml('You do not have permission to view invoices.'));
    hideLoader();
    return;
  }

  canManageInvoices = RoleAccess.canManagePurchaseOrders(user.role);

  const params = new URLSearchParams(window.location.search);
  const poId = params.get('po_id');

  Layout.mount('invoices', `
    <div class="po-page">
      <header class="po-page__top">
        <div>
          <h1 class="po-page__title">Invoices</h1>
          <p class="po-page__subtitle">Track invoice status, download PDFs, and email copies to your account</p>
        </div>
        ${canManageInvoices ? `
        <div class="po-actions">
          <label class="po-toolbar-check">
            <input type="checkbox" id="pdf-email-copy" />
            Email copy to my account when downloading
          </label>
        </div>` : ''}
      </header>
      <div class="po-card" id="invoice-list">
        <div class="approvals-empty"><div class="quotation-empty__icon">⏳</div><p>Loading…</p></div>
      </div>
    </div>
  `);
  hideLoader();

  if (poId) {
    window.location.href = `purchase-orders.html?id=${encodeURIComponent(poId)}`;
    return;
  }

  try {
    const data = await Api.dashboard.invoices('', 50);
    renderList(data || []);
  } catch (err) {
    document.getElementById('invoice-list').innerHTML = `
      <div class="approvals-empty">
        <p>${esc(ApiError.format(err))}</p>
        <button class="btn btn-primary" style="margin-top:16px" onclick="location.reload()">Retry</button>
      </div>`;
  }
});

function renderList(items) {
  const container = document.getElementById('invoice-list');
  if (!items.length) {
    container.innerHTML = `
      <div class="approvals-empty">
        <p>No invoices yet.</p>
        <p style="font-size:13px;color:var(--text-muted);margin-top:8px">Invoices are created when purchase orders are generated.</p>
        <a href="purchase-orders.html" class="btn btn-primary" style="margin-top:16px">View Purchase Orders</a>
      </div>`;
    return;
  }

  const actionHeader = canManageInvoices ? '<th>Actions</th>' : '';
  const rows = items.map((inv) => {
    const actions = canManageInvoices ? `
      <td class="invoice-actions">
        <a href="purchase-orders.html?id=${encodeURIComponent(inv.po_id)}" class="btn btn-ghost btn-sm">View</a>
        <button type="button" class="btn btn-ghost btn-sm" data-pdf="${escAttr(inv.id)}" data-invoice="${escAttr(inv.invoice_number || '')}" data-po="${escAttr(inv.po_number || '')}">PDF</button>
        <button type="button" class="btn btn-ghost btn-sm" data-email="${escAttr(inv.id)}" data-invoice="${escAttr(inv.invoice_number || '')}" data-po="${escAttr(inv.po_number || '')}">Email</button>
      </td>` : '';
    return `
    <tr>
      <td><strong>${esc(inv.invoice_number || '—')}</strong></td>
      <td>${esc(inv.po_number || '—')}</td>
      <td>${esc(inv.vendor || '—')}</td>
      <td>${formatCurrency(inv.amount || inv.grand_total)}</td>
      <td>${statusBadge(inv.status)}</td>
      <td>${inv.due_date ? Format.date(inv.due_date) : '—'}</td>
      ${actions}
    </tr>`;
  }).join('');

  container.innerHTML = `
    <div class="data-table-scroll">
      <table class="data-table" role="table">
        <thead>
          <tr><th>Invoice#</th><th>PO#</th><th>Vendor</th><th>Amount</th><th>Status</th><th>Due Date</th>${actionHeader}</tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;

  container.querySelectorAll('[data-pdf]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      downloadPdf(btn.dataset.pdf, btn.dataset.invoice, btn.dataset.po, btn);
    });
  });
  container.querySelectorAll('[data-email]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      sendInvoiceEmail(btn.dataset.email, btn.dataset.invoice, btn.dataset.po, btn);
    });
  });
}

async function downloadPdf(invoiceId, invoiceNumber, poNumber, btn) {
  const sendEmail = document.getElementById('pdf-email-copy')?.checked || false;
  const prev = btn?.textContent;
  if (btn) { btn.disabled = true; btn.textContent = sendEmail ? 'Sending…' : '…'; }
  try {
    const result = await Api.invoices.downloadAndSave(invoiceId, {
      sendEmail,
      invoiceNumber,
      poNumber,
    });
    if (sendEmail && result.emailResult) {
      Toast.show('Done', `${result.filename} downloaded and emailed to your account.`, 'success');
    } else {
      Toast.show('Downloaded', `${result.filename} saved.`, 'success');
    }
  } catch (err) {
    Toast.show('Error', ApiError.format(err), 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = prev || 'PDF'; }
  }
}

async function sendInvoiceEmail(invoiceId, invoiceNumber, poNumber, btn) {
  const label = invoiceNumber || poNumber || invoiceId;
  const prev = btn?.textContent;
  if (btn) { btn.disabled = true; btn.textContent = '…'; }
  try {
    const res = await Api.invoices.sendEmail(invoiceId, {
      subject: `Invoice ${label}`,
      message: `Please find attached the invoice ${label}.`,
    });
    Toast.show('Email Sent', res.message || 'Invoice sent to your registered email.', 'success');
  } catch (err) {
    Toast.show('Error', ApiError.format(err), 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = prev || 'Email'; }
  }
}

function statusBadge(status) {
  const key = (status || '').toLowerCase().replace(/\s+/g, '-');
  const cls = key.includes('paid') ? 'paid' : key.includes('cancel') ? 'cancelled' : 'pending';
  return `<span class="po-status-badge po-status-badge--${cls}">${esc(status)}</span>`;
}

function formatCurrency(amount) {
  if (amount == null || isNaN(amount)) return '₹0';
  return '₹' + Number(amount).toLocaleString('en-IN', { maximumFractionDigits: 0 });
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

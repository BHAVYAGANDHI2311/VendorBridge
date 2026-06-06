/* ═══ Approval Workflow Detail Page ═══ */

const STEPS = [
  { num: 1, label: 'Submitted' },
  { num: 2, label: 'L1 Review' },
  { num: 3, label: 'L2 Approval' },
  { num: 4, label: 'Generate PO' },
];

document.addEventListener('DOMContentLoaded', () => {
  if (!Layout.requireAuth()) return;

  const user = Layout.getUser();
  LocalUsers.register(user);

  const params = new URLSearchParams(window.location.search);
  const approvalId = params.get('id');

  if (!approvalId) {
    window.location.href = 'approvals.html';
    return;
  }

  const approval = ApprovalStore.getById(approvalId);
  if (!approval) {
    Layout.mount('approvals', `
      <div class="approvals-page">
        <div class="approvals-empty">
          <p>Approval workflow not found.</p>
          <a href="approvals.html" class="btn btn-primary" style="margin-top:16px">← Back to Approvals</a>
        </div>
      </div>`);
    hideLoader();
    return;
  }

  renderPage(approval, user);
  hideLoader();
});

function renderPage(approval, user) {
  const quotation = ApprovalStore.getQuotation(approval.quotationId);
  const summary = {
    vendorName: approval.vendorName || quotation?.vendor_name || '—',
    grandTotal: approval.grandTotal ?? quotation?.grand_total ?? 0,
    deliveryDays: approval.deliveryDays ?? quotation?.delivery_days ?? '—',
    vendorRating: approval.vendorRating ?? quotation?.vendor_rating ?? null,
  };

  const currentStep = ApprovalStore.getCurrentStep(approval);
  const canAct = ApprovalStore.canUserAct(approval, user);
  const activeStep = ApprovalStore.getActiveChainStep(approval);

  Layout.mount('approvals', `
    <div class="approvals-page">
      <header class="approvals-page__header">
        <h1 class="approvals-page__title">Approval Workflow</h1>
        <p class="approvals-page__subtitle" id="workflow-subtitle">
          RFQ: ${esc(approval.rfqTitle)} — Vendor: ${esc(summary.vendorName)} — ${formatCurrency(summary.grandTotal)}
        </p>
      </header>

      ${renderStepper(currentStep, approval)}

      <div class="approval-workflow-grid">
        <div class="approval-panel">
          <h2 class="approval-panel__title">Approval Chain</h2>
          <div id="approval-chain">${renderChain(approval.approvalChain)}</div>
          <div class="approval-remarks">
            <label class="approval-remarks__label" for="approval-remarks">Approval Remarks</label>
            <textarea id="approval-remarks" class="approval-remarks__input"
              placeholder="Any comments or conditions…"
              ${canAct ? '' : 'disabled'}>${esc(canAct ? '' : getReadonlyRemarks(approval, user))}</textarea>
          </div>
        </div>

        <div class="approval-panel">
          <h2 class="approval-panel__title">Quotation Summary</h2>
          <div class="approval-summary-box">
            <div class="approval-summary-row">
              <span class="approval-summary-row__label">Vendor</span>
              <span class="approval-summary-row__value">${esc(summary.vendorName)}</span>
            </div>
            <div class="approval-summary-row approval-summary-row--total">
              <span class="approval-summary-row__label">Total</span>
              <span class="approval-summary-row__value">${formatCurrency(summary.grandTotal)}</span>
            </div>
            <div class="approval-summary-row">
              <span class="approval-summary-row__label">Delivery</span>
              <span class="approval-summary-row__value">${summary.deliveryDays} days</span>
            </div>
            <div class="approval-summary-row">
              <span class="approval-summary-row__label">Rating</span>
              <span class="approval-summary-row__value">${summary.vendorRating != null ? `${summary.vendorRating}/5` : '—'}</span>
            </div>
          </div>
          <div class="approval-actions" id="approval-actions">
            ${canAct ? `
              <button type="button" class="btn btn-ghost" id="btn-reject">Reject</button>
              <button type="button" class="btn btn-primary" id="btn-approve">Approve</button>
            ` : `<p style="font-size:13px;color:var(--text-muted);text-align:right;width:100%">
              ${approval.overallStatus === 'In Progress'
                ? `Awaiting action from ${esc(activeStep?.approverName || activeStep?.approverRole || 'approver')}`
                : `Workflow ${esc(approval.overallStatus.toLowerCase())}`}
            </p>`}
          </div>
        </div>
      </div>

      <p style="margin-top:20px">
        <a href="approvals.html" class="btn btn-ghost">← Back to Approvals</a>
      </p>
    </div>
  `);

  if (canAct) {
    document.getElementById('btn-approve')?.addEventListener('click', () => handleApprove(approval.id, user));
    document.getElementById('btn-reject')?.addEventListener('click', () => handleReject(approval.id, user));
  }
}

function renderStepper(currentStep, approval) {
  const steps = STEPS.map((step, i) => {
    const num = i + 1;
    let cls = '';
    if (num < currentStep) cls = 'approval-step--done';
    else if (num === currentStep && approval.overallStatus !== 'Rejected') cls = 'approval-step--active';
    else if (num === currentStep && approval.overallStatus === 'Rejected') cls = 'approval-step--active';

    const line = i < STEPS.length - 1
      ? `<span class="approval-step__line ${num < currentStep ? 'approval-step__line--done' : ''}"></span>`
      : '';

    return `
      <div class="approval-step ${cls}">
        <span class="approval-step__dot">${step.num}</span>
        <span>${step.label}</span>
      </div>${line}`;
  }).join('');

  return `<div class="approval-stepper" role="list" aria-label="Approval progress">${steps}</div>`;
}

function resolveChainDisplay(item) {
  const levelConfig = LocalUsers.getLevels().find((l) => l.level === item.level);
  const resolved = levelConfig ? LocalUsers.resolveApprover(levelConfig) : {};
  return {
    name: item.approverName || resolved.approverName || item.approverRole || 'Unassigned',
    role: item.approverRole || resolved.approverRole || '',
  };
}

function renderChain(chain) {
  return chain.map((item) => {
    const display = resolveChainDisplay(item);
    let statusCls = 'waiting';
    let icon = '○';
    let meta = '';

    if (item.status === 'Approved') {
      statusCls = 'approved';
      icon = '✓';
      meta = item.actionAt ? `Approved on ${formatDateTime(item.actionAt)}` : 'Approved';
    } else if (item.status === 'Rejected') {
      statusCls = 'rejected';
      icon = '✕';
      meta = item.actionAt ? `Rejected on ${formatDateTime(item.actionAt)}` : 'Rejected';
    } else if (item.status === 'Pending') {
      statusCls = 'awaiting';
      icon = '⏳';
      meta = item.actionAt ? `Assigned ${formatDate(item.actionAt)}` : 'Awaiting';
    } else if (item.status === 'Waiting') {
      statusCls = 'waiting';
      icon = '○';
      meta = 'Waiting for L1 approval';
    }

    const roleLabel = display.role ? `(${display.role})` : '';

    return `
      <div class="approval-chain-item approval-chain-item--${statusCls}">
        <div class="approval-chain-item__icon" aria-hidden="true">${icon}</div>
        <div>
          <div class="approval-chain-item__name">${esc(display.name)} ${roleLabel ? `<span class="approval-chain-item__role">${esc(roleLabel)}</span>` : ''}</div>
          <div class="approval-chain-item__meta">${esc(meta)}</div>
          ${item.remarks ? `<div class="approval-chain-item__meta" style="margin-top:6px;font-style:italic">"${esc(item.remarks)}"</div>` : ''}
        </div>
      </div>`;
  }).join('');
}

function getReadonlyRemarks(approval, user) {
  const step = approval.approvalChain.find(
    (s) => s.approverEmail === user.email || s.approverRole === user.role
  );
  return step?.remarks || '';
}

async function handleApprove(approvalId, user) {
  const remarks = document.getElementById('approval-remarks')?.value?.trim() || '';
  const btn = document.getElementById('btn-approve');
  btn.disabled = true;
  btn.textContent = 'Approving…';

  try {
    const approval = ApprovalStore.getById(approvalId);
    const activeStep = ApprovalStore.getActiveChainStep(approval);
    const updated = ApprovalStore.approve(approvalId, user, remarks);

    try {
      await Api.approvals.recordStep({
        level: activeStep?.level || 'L1',
        action: 'approved',
        rfq_id: updated.rfqId,
        quotation_id: updated.quotationId,
        rfq_title: updated.rfqTitle,
        vendor_name: updated.vendorName,
        remarks,
      });
    } catch (_) { /* audit append best-effort */ }

    Toast.show('Approved', `${user.full_name} approved this workflow step.`, 'success');

    if (updated.overallStatus === 'Approved') {
      try {
        const po = await Api.purchaseOrders.create({
          quotation_id: updated.quotationId,
          rfq_id: updated.rfqId,
          approval_id: updated.id,
        });
        Toast.show('PO Generated', `Purchase order ${po.po_number} created.`, 'success');
        setTimeout(() => {
          window.location.href = `purchase-orders.html?id=${encodeURIComponent(po.id)}`;
        }, 900);
        return;
      } catch (apiErr) {
        Toast.show('PO Error', ApiError.format(apiErr), 'error');
      }
    }
    renderPage(updated, user);
  } catch (err) {
    Toast.show('Error', err.message, 'error');
    btn.disabled = false;
    btn.textContent = 'Approve';
  }
}

async function handleReject(approvalId, user) {
  const remarks = document.getElementById('approval-remarks')?.value?.trim() || '';
  if (!remarks) {
    Toast.show('Remarks required', 'Please add remarks before rejecting.', 'warning');
    return;
  }

  const btn = document.getElementById('btn-reject');
  btn.disabled = true;
  btn.textContent = 'Rejecting…';

  try {
    const approval = ApprovalStore.getById(approvalId);
    const activeStep = ApprovalStore.getActiveChainStep(approval);
    ApprovalStore.reject(approvalId, user, remarks);

    try {
      await Api.approvals.recordStep({
        level: activeStep?.level || 'L1',
        action: 'rejected',
        rfq_id: approval.rfqId,
        quotation_id: approval.quotationId,
        rfq_title: approval.rfqTitle,
        vendor_name: approval.vendorName,
        remarks,
      });
    } catch (_) { /* audit append best-effort */ }

    Toast.show('Rejected', 'Approval workflow has been rejected.', 'error');
    setTimeout(() => { window.location.href = 'approvals.html'; }, 1200);
  } catch (err) {
    Toast.show('Error', err.message, 'error');
    btn.disabled = false;
    btn.textContent = 'Reject';
  }
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

function formatDateTime(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
    + ', ' + d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

function formatCurrency(amount) {
  if (amount == null || isNaN(amount)) return '₹0';
  return '₹' + Number(amount).toLocaleString('en-IN', { maximumFractionDigits: 0 });
}

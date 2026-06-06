/* ─── Approval workflow — localStorage persistence ─── */

const APPROVALS_KEY = 'vb_approvals';
const QUOTATIONS_KEY = 'vb_quotations';
const RFQS_KEY = 'vb_rfqs';
const POS_KEY = 'vb_purchase_orders';
const NOTIFICATIONS_KEY = 'vb_notifications';
const ACTIVITY_KEY = 'vb_activity';

const ApprovalStore = {
  _read(key) {
    try {
      return JSON.parse(localStorage.getItem(key) || '[]');
    } catch {
      return [];
    }
  },

  _write(key, data) {
    localStorage.setItem(key, JSON.stringify(data));
  },

  _uid() {
    return `apr-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  },

  getAll() {
    return this._read(APPROVALS_KEY);
  },

  getById(id) {
    return this.getAll().find((a) => a.id === id) || null;
  },

  save(approval) {
    const all = this.getAll();
    const idx = all.findIndex((a) => a.id === approval.id);
    if (idx >= 0) all[idx] = approval;
    else all.unshift(approval);
    this._write(APPROVALS_KEY, all);
    return approval;
  },

  cacheQuotation(quotation) {
    const all = this._read(QUOTATIONS_KEY);
    const idx = all.findIndex((q) => q.id === quotation.id);
    if (idx >= 0) all[idx] = quotation;
    else all.push(quotation);
    this._write(QUOTATIONS_KEY, all);
  },

  getQuotation(id) {
    return this._read(QUOTATIONS_KEY).find((q) => q.id === id) || null;
  },

  cacheRfq(rfq) {
    const all = this._read(RFQS_KEY);
    const idx = all.findIndex((r) => r.id === rfq.id);
    if (idx >= 0) all[idx] = rfq;
    else all.push(rfq);
    this._write(RFQS_KEY, all);
  },

  getRfq(id) {
    return this._read(RFQS_KEY).find((r) => r.id === id) || null;
  },

  buildChain() {
    LocalUsers.ensureLevels();
    return LocalUsers.getLevels().map((lvl) => {
      const approver = LocalUsers.resolveApprover(lvl);
      return {
        level: lvl.level,
        label: lvl.label,
        approverRole: approver.approverRole,
        approverName: approver.approverName,
        approverEmail: approver.approverEmail,
        approverId: approver.approverId,
        status: lvl.level === 'L2' ? 'Waiting' : 'Pending',
        remarks: '',
        actionAt: null,
      };
    });
  },

  createFromSelection({ rfqId, rfqTitle, quotationId, vendorId, vendorName, grandTotal, deliveryDays, vendorRating }) {
    const quotation = {
      id: quotationId,
      rfq_id: rfqId,
      rfq_title: rfqTitle,
      vendor_id: vendorId,
      vendor_name: vendorName,
      grand_total: grandTotal,
      delivery_days: deliveryDays,
      vendor_rating: vendorRating,
    };
    this.cacheQuotation(quotation);
    this.cacheRfq({ id: rfqId, title: rfqTitle });

    const approval = {
      id: this._uid(),
      rfqId,
      quotationId,
      vendorId,
      rfqTitle,
      vendorName,
      grandTotal,
      deliveryDays,
      vendorRating,
      approvalChain: this.buildChain(),
      overallStatus: 'In Progress',
      createdAt: new Date().toISOString(),
      poId: null,
    };

    this.save(approval);
    this.logActivity('Approval Created', `Quotation from ${vendorName} submitted for approval`, rfqTitle);
    this.notifyRole('Procurement Officer', `New approval workflow started for RFQ: ${rfqTitle}`);
    return approval;
  },

  getCurrentStep(approval) {
    const l1 = approval.approvalChain.find((s) => s.level === 'L1');
    const l2 = approval.approvalChain.find((s) => s.level === 'L2');

    if (approval.overallStatus === 'Approved') return 4;
    if (approval.overallStatus === 'Rejected') {
      if (l2?.status === 'Rejected') return 3;
      if (l1?.status === 'Rejected') return 2;
      return 2;
    }
    if (l1?.status === 'Approved' && (l2?.status === 'Pending' || l2?.status === 'Waiting')) return 3;
    return 2;
  },

  getActiveChainStep(approval) {
    if (approval.overallStatus !== 'In Progress') return null;
    const l1 = approval.approvalChain.find((s) => s.level === 'L1');
    if (l1?.status === 'Pending') return l1;
    const l2 = approval.approvalChain.find((s) => s.level === 'L2');
    if (l1?.status === 'Approved' && l2?.status === 'Pending') return l2;
    return null;
  },

  canUserAct(approval, user) {
    if (approval.overallStatus !== 'In Progress') return false;
    const active = this.getActiveChainStep(approval);
    if (!active) return false;
    return user.role === active.approverRole
      || (user.email && user.email.toLowerCase() === (active.approverEmail || '').toLowerCase());
  },

  countPending() {
    return this.getAll().filter((a) => a.overallStatus === 'In Progress').length;
  },

  approve(approvalId, user, remarks) {
    const approval = this.getById(approvalId);
    if (!approval) throw new Error('Approval not found');
    if (!this.canUserAct(approval, user)) throw new Error('Not your turn to approve');

    const active = this.getActiveChainStep(approval);
    const now = new Date().toISOString();
    active.status = 'Approved';
    active.remarks = remarks || '';
    active.actionAt = now;
    active.approverName = user.full_name;
    active.approverEmail = user.email;

    if (active.level === 'L1') {
      const l2 = approval.approvalChain.find((s) => s.level === 'L2');
      if (l2) {
        l2.status = 'Pending';
        l2.actionAt = now;
      }
      this.notifyRole('Manager', `L1 approved — your review is required for RFQ: ${approval.rfqTitle}`);
    }

    if (active.level === 'L2') {
      approval.overallStatus = 'Approved';
      this.notifyRole('Procurement Officer', `Approval complete for ${approval.rfqTitle} — PO will be generated via API`);
    }

    this.save(approval);
    this.logActivity('Approved', `${user.full_name} approved ${active.level} for ${approval.rfqTitle}`, approval.vendorName);
    return approval;
  },

  reject(approvalId, user, remarks) {
    const approval = this.getById(approvalId);
    if (!approval) throw new Error('Approval not found');
    if (!this.canUserAct(approval, user)) throw new Error('Not your turn to reject');

    const active = this.getActiveChainStep(approval);
    const now = new Date().toISOString();
    active.status = 'Rejected';
    active.remarks = remarks || '';
    active.actionAt = now;
    active.approverName = user.full_name;
    active.approverEmail = user.email;
    approval.overallStatus = 'Rejected';

    this.save(approval);
    this.logActivity('Rejected', `${user.full_name} rejected ${active.level} for ${approval.rfqTitle}`, approval.vendorName);
    this.notifyRole('Procurement Officer', `Approval rejected for RFQ: ${approval.rfqTitle} — ${remarks || 'No remarks'}`);
    return approval;
  },

  createPurchaseOrder(approval) {
    const orders = this._read(POS_KEY);
    const po = {
      id: `po-${Date.now()}`,
      po_number: `PO-${new Date().getFullYear()}-${String(orders.length + 1).padStart(4, '0')}`,
      rfq_id: approval.rfqId,
      rfq_title: approval.rfqTitle,
      vendor_id: approval.vendorId,
      vendor_name: approval.vendorName,
      amount: approval.grandTotal,
      delivery_days: approval.deliveryDays,
      status: 'Generated',
      approval_id: approval.id,
      created_at: new Date().toISOString(),
    };
    orders.unshift(po);
    this._write(POS_KEY, orders);
    this.logActivity('PO Generated', `Purchase order ${po.po_number} created`, approval.vendorName);
    return po;
  },

  getPurchaseOrders() {
    return this._read(POS_KEY);
  },

  logActivity(action, detail, subject = '') {
    const logs = this._read(ACTIVITY_KEY);
    logs.unshift({
      id: `act-${Date.now()}`,
      action,
      detail,
      subject,
      at: new Date().toISOString(),
      user: Session.getUser()?.full_name || 'System',
    });
    if (logs.length > 200) logs.length = 200;
    this._write(ACTIVITY_KEY, logs);
  },

  getActivity() {
    return this._read(ACTIVITY_KEY);
  },

  notifyRole(role, message) {
    const users = LocalUsers.getByRole(role);
    users.forEach((u) => this.addNotification(u.email, message));
  },

  addNotification(email, message) {
    const notes = this._read(NOTIFICATIONS_KEY);
    notes.unshift({
      id: `ntf-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      email: email.toLowerCase(),
      message,
      read: false,
      at: new Date().toISOString(),
    });
    if (notes.length > 100) notes.length = 100;
    this._write(NOTIFICATIONS_KEY, notes);
  },

  getNotificationsForUser(email) {
    return this._read(NOTIFICATIONS_KEY).filter(
      (n) => n.email === (email || '').toLowerCase()
    );
  },
};

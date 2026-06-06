/* ═══════════════════════════════════════════════════════
   VendorBridge — Dashboard Page Logic
   ═══════════════════════════════════════════════════════ */

let spendingChart = null;

document.addEventListener('DOMContentLoaded', async () => {
  if (!Layout.requireAuth()) return;

  try {
    Layout.mount('dashboard', getSkeletonHtml());
    bindRefresh();
    await loadDashboard();
  } catch (err) {
    ErrorBoundary.show(
      document.getElementById('app'),
      err.message || 'Failed to load dashboard.',
      () => window.location.reload()
    );
  } finally {
    hideLoader();
  }
});

function hideLoader() {
  const loader = document.getElementById('page-loader');
  if (!loader) return;
  loader.style.opacity = '0';
  setTimeout(() => loader.remove(), 300);
}

function getSkeletonHtml() {
  const skeletonCards = Array.from({ length: 4 }, () => StatCard.skeleton().outerHTML).join('');
  return `
    <section class="welcome-banner" aria-label="Welcome">
      <div>
        <div class="skeleton skeleton--text skeleton--lg" style="width:280px;background:rgba(255,255,255,0.3)"></div>
        <div class="skeleton skeleton--text skeleton--sm" style="width:160px;margin-top:8px;background:rgba(255,255,255,0.2)"></div>
      </div>
    </section>
    <div class="stats-grid" id="stats-grid">${skeletonCards}</div>
    <div class="section-card"><div class="skeleton skeleton--text" style="height:200px"></div></div>
  `;
}

function bindRefresh() {
  document.getElementById('refresh-btn')?.addEventListener('click', async () => {
    const btn = document.getElementById('refresh-btn');
    btn?.classList.add('topbar__refresh--spinning');
    try {
      await loadDashboard();
      Toast.show('Refreshed', 'Dashboard data updated successfully.', 'success');
    } catch (err) {
      Toast.show('Refresh failed', err.message, 'error');
    } finally {
      btn?.classList.remove('topbar__refresh--spinning');
    }
  });
}

async function loadDashboard() {
  const user = Layout.getUser();
  const role = user.role;
  if (typeof LocalUsers !== 'undefined') LocalUsers.register(user);

  const fetches = [
    Api.dashboard.stats(),
    Api.dashboard.orders(),
    Api.dashboard.rfqs(),
  ];
  if (RoleAccess.canViewInvoices(role)) {
    fetches.push(Api.dashboard.invoices());
  }
  const results = await Promise.all(fetches);
  const stats = results[0];
  const orders = results[1];
  const rfqs = results[2];
  const invoices = RoleAccess.canViewInvoices(role) ? results[3] : [];

  renderDashboard(stats.user || user, stats, orders, rfqs, invoices, role);
}

function renderDashboard(user, stats, orders, rfqs, invoices, role) {
  const main = document.getElementById('main-content');
  if (!main) return;

  main.innerHTML = '';

  /* Welcome Banner */
  const welcome = document.createElement('section');
  welcome.className = 'welcome-banner';
  welcome.setAttribute('aria-label', 'Welcome');
  welcome.innerHTML = `
    <div>
      <h1 class="welcome-banner__title">Welcome back, ${escapeHtml(user.full_name)}</h1>
      <p class="welcome-banner__role">${escapeHtml(user.role)}</p>
    </div>
    <time class="welcome-banner__date" datetime="${new Date().toISOString()}">${Format.dateLong()}</time>
  `;
  main.appendChild(welcome);

  /* Stats Cards */
  const statsGrid = document.createElement('div');
  statsGrid.className = 'stats-grid';
  statsGrid.id = 'stats-grid';

  const statConfigs = [
    {
      icon: '📋',
      value: stats.active_rfqs,
      label: 'Active RFQs',
      href: 'rfqs.html',
      show: true,
    },
    {
      icon: '✓',
      value: stats.pending_approvals,
      label: 'Pending Approvals',
      href: 'approvals.html',
      show: RoleAccess.canViewApprovals(role),
    },
    {
      icon: '💰',
      value: Format.currency(stats.spending_this_month),
      label: 'Total Spending (This Month)',
      trend: stats.spending_trend_pct,
      href: 'reports.html',
      show: RoleAccess.canViewReports(role),
    },
    {
      icon: '👥',
      value: stats.vendor_count ?? 0,
      label: 'Active Vendors',
      href: 'vendors.html',
      show: RoleAccess.canViewVendors(role),
    },
  ];

  statConfigs.filter((c) => c.show).forEach((cfg) => {
    statsGrid.appendChild(StatCard.create(cfg));
  });
  main.appendChild(statsGrid);

  /* Quick Actions */
  const actions = document.createElement('div');
  actions.className = 'quick-actions';
  actions.setAttribute('role', 'toolbar');
  actions.setAttribute('aria-label', 'Quick actions');

  if (RoleAccess.canCreateRFQ(role)) {
    actions.appendChild(QuickActionButton.create({
      label: 'New RFQ',
      variant: 'primary',
      icon: '+',
      href: 'rfq-create.html',
    }));
  }
  if (RoleAccess.canManageVendors(role)) {
    actions.appendChild(QuickActionButton.create({
      label: 'Add Vendor',
      variant: 'secondary',
      href: 'vendors.html?action=new',
    }));
  }
  if (RoleAccess.canCompareQuotations(role)) {
    actions.appendChild(QuickActionButton.create({
      label: 'Compare Quotations',
      variant: 'secondary',
      href: 'quotation-comparison.html',
    }));
  }
  if (RoleAccess.canSubmitQuotations(role)) {
    actions.appendChild(QuickActionButton.create({
      label: 'Submit Quotation',
      variant: 'secondary',
      href: 'quotations.html',
    }));
  }
  if (RoleAccess.canViewApprovals(role)) {
    actions.appendChild(QuickActionButton.create({
      label: 'Pending Approvals',
      variant: 'secondary',
      href: 'approvals.html',
    }));
  }
  if (RoleAccess.canViewReports(role)) {
    actions.appendChild(QuickActionButton.create({
      label: 'View Reports',
      variant: 'secondary',
      href: 'reports.html',
    }));
  }
  if (RoleAccess.canViewInvoices(role)) {
    actions.appendChild(QuickActionButton.create({
      label: 'Generate Invoice',
      variant: 'secondary',
      href: 'purchase-orders.html',
    }));
  }
  main.appendChild(actions);

  /* Recent Purchase Orders */
  const poSection = createSection('Recent Purchase Orders', 'purchase-orders.html');
  const poTable = DataTable.create({
    columns: [
      { key: 'po_number', label: 'PO#' },
      { key: 'vendor', label: 'Vendor Name' },
      {
        key: 'amount',
        label: 'Amount',
        render: (v) => document.createTextNode(Format.currency(v)),
      },
      {
        key: 'status',
        label: 'Status',
        render: (v) => StatusBadge.create(v, 'PO'),
      },
      {
        key: 'created_at',
        label: 'Date',
        render: (v) => document.createTextNode(Format.date(v)),
      },
    ],
    rows: orders,
    searchable: true,
    searchPlaceholder: 'Search purchase orders...',
    onSearch: async (q) => {
      const data = await Api.dashboard.orders(q);
      poTable.renderRows(data);
    },
    onRowClick: (row) => {
      window.location.href = `purchase-orders.html?id=${row.id}`;
    },
  });
  poSection.appendChild(poTable);
  main.appendChild(poSection);

  const rfqSection = createSection('Recent RFQs', 'rfqs.html');
  const rfqTable = DataTable.create({
    columns: [
      { key: 'title', label: 'Title' },
      { key: 'category', label: 'Category' },
      {
        key: 'status',
        label: 'Status',
        render: (v) => StatusBadge.create(v, 'RFQ'),
      },
      {
        key: 'deadline',
        label: 'Deadline',
        render: (v) => document.createTextNode(Format.date(v)),
      },
    ],
    rows: rfqs,
    searchable: false,
    emptyMessage: 'No RFQs yet. Create one to start procurement.',
    onRowClick: (row) => {
      if (RoleAccess.isVendor(role)) {
        window.location.href = `quotations.html?rfq_id=${row.id}`;
      } else {
        window.location.href = 'rfqs.html';
      }
    },
  });
  rfqSection.appendChild(rfqTable);
  main.appendChild(rfqSection);

  if (RoleAccess.canViewInvoices(role) || RoleAccess.canViewReports(role)) {
    const grid = document.createElement('div');
    grid.className = 'dashboard-grid-2';

    if (RoleAccess.canViewInvoices(role)) {
      const invSection = createSection('Recent Invoices', 'invoices.html');
      const invTable = DataTable.create({
        columns: [
          { key: 'invoice_number', label: 'Invoice#' },
          { key: 'po_number', label: 'PO Reference' },
          { key: 'vendor', label: 'Vendor' },
          {
            key: 'amount',
            label: 'Amount',
            render: (v) => document.createTextNode(Format.currency(v)),
          },
          {
            key: 'status',
            label: 'Status',
            render: (v) => StatusBadge.create(normalizeInvoiceStatus(v), 'Invoice'),
          },
          {
            key: 'due_date',
            label: 'Due Date',
            render: (v) => document.createTextNode(Format.date(v)),
          },
        ],
        rows: invoices,
        searchable: true,
        searchPlaceholder: 'Search invoices...',
        onSearch: async (q) => {
          const data = await Api.dashboard.invoices(q);
          invTable.renderRows(data);
        },
        onRowClick: (row) => {
          const target = row.po_id || row.id;
          window.location.href = `purchase-orders.html?id=${encodeURIComponent(target)}`;
        },
      });
      invSection.appendChild(invTable);
      grid.appendChild(invSection);
    }

    if (RoleAccess.canViewReports(role)) {
      const chartSection = createSection('Spending Trends — Last 6 Months', 'reports.html');
      const chartWrap = document.createElement('div');
      chartWrap.className = 'chart-container';
      chartWrap.innerHTML = '<canvas id="spending-chart" role="img" aria-label="Bar chart showing monthly procurement spending for the last 6 months"></canvas>';
      chartSection.appendChild(chartWrap);
      grid.appendChild(chartSection);
    }

    main.appendChild(grid);
    if (RoleAccess.canViewReports(role)) {
      renderChart(stats.monthly_trend || []);
    }
  }
}

function createSection(title, linkHref) {
  const section = document.createElement('section');
  section.className = 'section-card';
  const header = document.createElement('div');
  header.className = 'section-card__header';
  header.innerHTML = `<h2 class="section-card__title">${title}</h2>`;
  if (linkHref) {
    header.innerHTML += `<a href="${linkHref}" class="section-card__link">View all →</a>`;
  }
  section.appendChild(header);
  return section;
}

function renderChart(trendData) {
  const canvas = document.getElementById('spending-chart');
  if (!canvas || typeof Chart === 'undefined') return;

  if (spendingChart) {
    spendingChart.destroy();
  }

  const labels = trendData.map((d) => d.month);
  const values = trendData.map((d) => d.spend);

  spendingChart = new Chart(canvas, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Monthly Spending',
        data: values,
        backgroundColor: 'rgba(37, 99, 235, 0.85)',
        hoverBackgroundColor: 'rgba(37, 99, 235, 1)',
        borderRadius: 6,
        borderSkipped: false,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (ctx) => ` ${Format.currency(ctx.raw)}`,
          },
        },
      },
      scales: {
        y: {
          beginAtZero: true,
          grid: { color: 'rgba(226, 232, 240, 0.8)' },
          ticks: {
            callback: (v) => Format.currency(v),
            font: { size: 11 },
          },
        },
        x: {
          grid: { display: false },
          ticks: { font: { size: 12, weight: '500' } },
        },
      },
    },
  });
}

function normalizeInvoiceStatus(status) {
  if (status === 'Submitted') return 'Pending';
  return status;
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

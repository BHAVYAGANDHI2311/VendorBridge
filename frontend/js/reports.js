/* ═══ Reports & Analytics — dynamic procurement insights ═══ */

let trendChart = null;
let selectedMonth = new Date().getMonth() + 1;
let selectedYear = new Date().getFullYear();

document.addEventListener('DOMContentLoaded', async () => {
  if (!Layout.requireAuth()) return;

  const user = Layout.getUser();
  if (!RoleAccess.canViewSpending(user.role)) {
    Layout.mount('reports', `
      <div class="reports-page">
        <div class="reports-empty">
          <div style="font-size:48px;margin-bottom:12px;opacity:0.5">🔒</div>
          <p>You do not have access to procurement reports.</p>
        </div>
      </div>`);
    hideLoader();
    return;
  }

  Layout.mount('reports', getPageHtml());
  populateMonthOptions();
  bindControls();
  try {
    await loadReports();
  } catch (err) {
    Toast.show('Failed to load reports', ApiError.format(err), 'error');
  }
  hideLoader();
});

function getPageHtml() {
  const now = new Date();
  const monthName = now.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
  return `
    <div class="reports-page">
      <header class="reports-page__header">
        <div>
          <h1 class="reports-page__title">Reports &amp; Analytics</h1>
          <p class="reports-page__subtitle" id="reports-subtitle">Procurement Insights — ${monthName}</p>
        </div>
        <div class="reports-page__controls">
          <label class="sr-only" for="reports-month">Select month</label>
          <select id="reports-month" class="reports-month-select" aria-label="Select month"></select>
          <button type="button" class="btn btn-secondary" id="reports-export">Export</button>
        </div>
      </header>

      <div class="reports-stats" id="reports-stats">
        ${statSkeleton()}
      </div>

      <div class="reports-grid">
        <section class="reports-panel">
          <h2 class="reports-panel__title">Spend by Category</h2>
          <div id="reports-categories" class="reports-category-list">
            <div class="reports-loading">Loading…</div>
          </div>
        </section>

        <div class="reports-right-col">
          <section class="reports-panel">
            <h2 class="reports-panel__title">Top Vendors by Spend</h2>
            <div id="reports-vendors">
              <div class="reports-loading">Loading…</div>
            </div>
          </section>

          <section class="reports-panel">
            <h2 class="reports-panel__title">Monthly Trend</h2>
            <div class="reports-chart-wrap">
              <canvas id="reports-trend-chart" role="img" aria-label="Bar chart showing monthly procurement spend for the last six months"></canvas>
            </div>
          </section>
        </div>
      </div>
    </div>`;
}

function statSkeleton() {
  return Array.from({ length: 4 }, () => `
    <div class="reports-stat">
      <div class="skeleton skeleton--text skeleton--lg"></div>
      <div class="skeleton skeleton--text skeleton--sm" style="margin-top:8px"></div>
    </div>`).join('');
}

function populateMonthOptions() {
  const select = document.getElementById('reports-month');
  const options = [];
  const now = new Date();

  for (let i = 0; i < 24; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const m = d.getMonth() + 1;
    const y = d.getFullYear();
    const label = d.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
    const value = `${y}-${m}`;
    options.push(`<option value="${value}" ${m === selectedMonth && y === selectedYear ? 'selected' : ''}>${label}</option>`);
  }

  select.innerHTML = options.join('');
}

function bindControls() {
  document.getElementById('reports-month').addEventListener('change', async (e) => {
    const [y, m] = e.target.value.split('-').map(Number);
    selectedYear = y;
    selectedMonth = m;
    try {
      await loadReports();
    } catch (err) {
      Toast.show('Failed to load reports', ApiError.format(err), 'error');
    }
  });

  document.getElementById('reports-export').addEventListener('click', exportReport);
}

async function loadReports() {
  updateSubtitle();

  const [stats, categories, vendors, trend] = await Promise.all([
    Api.reports.stats(selectedMonth, selectedYear),
    Api.reports.spendByCategory(selectedMonth, selectedYear),
    Api.reports.topVendors(selectedMonth, selectedYear),
    Api.reports.monthlyTrend(selectedMonth, selectedYear),
  ]);

  renderStats(stats);
  renderCategories(categories.items || []);
  renderVendors(vendors.items || []);
  renderTrendChart(trend.items || []);
}

function updateSubtitle() {
  const d = new Date(selectedYear, selectedMonth - 1, 1);
  const label = d.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
  document.getElementById('reports-subtitle').textContent = `Procurement Insights — ${label}`;
}

function renderStats(stats) {
  document.getElementById('reports-stats').innerHTML = `
    <div class="reports-stat">
      <div class="reports-stat__value reports-stat__value--spend">${formatCompact(stats.total_spend)}</div>
      <div class="reports-stat__label">Total Spend</div>
    </div>
    <div class="reports-stat">
      <div class="reports-stat__value reports-stat__value--vendors">${stats.active_vendors}</div>
      <div class="reports-stat__label">Active Vendors</div>
    </div>
    <div class="reports-stat">
      <div class="reports-stat__value reports-stat__value--rate">${stats.rfq_success_rate}%</div>
      <div class="reports-stat__label">RFQ Success Rate</div>
    </div>
    <div class="reports-stat">
      <div class="reports-stat__value reports-stat__value--overdue">${stats.overdue_invoices}</div>
      <div class="reports-stat__label">Overdue Invoices</div>
    </div>`;
}

function renderCategories(items) {
  const container = document.getElementById('reports-categories');
  if (!items.length) {
    container.innerHTML = '<div class="reports-empty">No paid spend recorded for this month.</div>';
    return;
  }

  container.innerHTML = items.map((item) => `
    <div class="reports-category-item">
      <div class="reports-category-item__head">
        <span class="reports-category-item__name">${esc(item.category)}</span>
        <span class="reports-category-item__amount">${formatInr(item.amount)}</span>
      </div>
      <div class="reports-category-item__bar">
        <div class="reports-category-item__fill"
          style="width:${item.percentage}%;background:${item.color}"></div>
      </div>
    </div>`).join('');
}

function renderVendors(items) {
  const container = document.getElementById('reports-vendors');
  if (!items.length) {
    container.innerHTML = '<div class="reports-empty">No vendor spend data for this month.</div>';
    return;
  }

  container.innerHTML = `
    <table class="reports-vendors-table">
      <thead>
        <tr>
          <th>Vendor</th>
          <th>Spend (₹)</th>
          <th>POs</th>
        </tr>
      </thead>
      <tbody>
        ${items.map((v) => `
          <tr>
            <td>${esc(v.vendor_name)}</td>
            <td>${formatInrNumber(v.spend)}</td>
            <td>${v.po_count}</td>
          </tr>`).join('')}
      </tbody>
    </table>`;
}

function renderTrendChart(items) {
  const canvas = document.getElementById('reports-trend-chart');
  if (!canvas || typeof Chart === 'undefined') return;

  if (trendChart) trendChart.destroy();

  const labels = items.map((d) => d.month);
  const values = items.map((d) => d.spend);
  const colors = items.map((d) =>
    d.is_current ? 'rgba(29, 78, 216, 0.95)' : 'rgba(147, 197, 253, 0.9)'
  );

  trendChart = new Chart(canvas, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Monthly Spend',
        data: values,
        backgroundColor: colors,
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
            label: (ctx) => ` ${formatInr(ctx.raw)}`,
          },
        },
      },
      scales: {
        y: {
          beginAtZero: true,
          grid: { color: 'rgba(226, 232, 240, 0.8)' },
          ticks: {
            callback: (v) => formatCompact(v),
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

async function exportReport() {
  const btn = document.getElementById('reports-export');
  btn.disabled = true;
  btn.textContent = 'Exporting…';

  try {
    await Api.reports.exportCsv(selectedMonth, selectedYear);
    Toast.show('Export complete', 'Report downloaded successfully.', 'success');
  } catch (err) {
    Toast.show('Export failed', ApiError.format(err), 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Export';
  }
}

function formatCompact(amount) {
  const num = Number(amount) || 0;
  if (num >= 100000) return `${(num / 100000).toFixed(1)}L`;
  if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
  return num.toLocaleString('en-IN');
}

function formatInr(amount) {
  const num = Number(amount) || 0;
  if (num >= 100000) return `₹${(num / 100000).toFixed(1)}L`;
  if (num >= 1000) return `₹${(num / 1000).toFixed(1)}K`;
  return `₹${num.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
}

function formatInrNumber(amount) {
  return Number(amount || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 });
}

function esc(str) {
  const d = document.createElement('div');
  d.textContent = str ?? '';
  return d.innerHTML;
}

function hideLoader() {
  const loader = document.getElementById('page-loader');
  if (loader) { loader.style.opacity = '0'; setTimeout(() => loader.remove(), 300); }
}

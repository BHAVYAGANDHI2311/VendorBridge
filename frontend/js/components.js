/* ═══════════════════════════════════════════════════════
   VendorBridge — Reusable UI Components
   ═══════════════════════════════════════════════════════ */

const StatusBadge = {
  PO: {
    Approved: 'success',
    Pending: 'warning',
    Draft: 'neutral',
    Rejected: 'danger',
    Delivered: 'info',
  },
  Invoice: {
    Paid: 'success',
    Pending: 'warning',
    Overdue: 'danger',
    Draft: 'neutral',
    Submitted: 'warning',
    Approved: 'info',
  },
  RFQ: {
    Sent: 'info',
    Received: 'success',
    Draft: 'neutral',
    Closed: 'neutral',
  },
};

StatusBadge.create = function (status, type = 'PO') {
  const map = StatusBadge[type] || StatusBadge.PO;
  const variant = map[status] || 'neutral';
  const el = document.createElement('span');
  el.className = `status-badge status-badge--${variant}`;
  el.textContent = status;
  el.setAttribute('role', 'status');
  el.setAttribute('aria-label', `Status: ${status}`);
  return el;
};

const StatCard = {
  create({ icon, value, label, trend, href, onClick, ariaLabel }) {
    const card = document.createElement('a');
    card.className = 'stat-card';
    card.href = href || '#';
    card.setAttribute('aria-label', ariaLabel || label);
    if (onClick) {
      card.addEventListener('click', (e) => {
        if (href === '#') e.preventDefault();
        onClick(e);
      });
    }

    card.innerHTML = `
      <div class="stat-card__icon" aria-hidden="true">${icon}</div>
      <div class="stat-card__body">
        <div class="stat-card__value">${value}</div>
        <div class="stat-card__label">${label}</div>
        ${trend != null ? `<div class="stat-card__trend ${trend >= 0 ? 'stat-card__trend--up' : 'stat-card__trend--down'}">${trend >= 0 ? '↑' : '↓'} ${Math.abs(trend)}%</div>` : ''}
      </div>
    `;
    return card;
  },

  skeleton() {
    const el = document.createElement('div');
    el.className = 'stat-card stat-card--skeleton';
    el.innerHTML = `
      <div class="skeleton skeleton--circle"></div>
      <div class="stat-card__body">
        <div class="skeleton skeleton--text skeleton--lg"></div>
        <div class="skeleton skeleton--text skeleton--sm"></div>
      </div>
    `;
    return el;
  },
};

const DataTable = {
  create({ columns, rows, searchable = false, searchPlaceholder = 'Search...', onSearch, onRowClick, emptyMessage = 'No records found' }) {
    const wrapper = document.createElement('div');
    wrapper.className = 'data-table-wrapper';

    if (searchable) {
      const searchBar = document.createElement('div');
      searchBar.className = 'data-table-search';
      searchBar.innerHTML = `
        <label class="sr-only" for="table-search-${Date.now()}">Search table</label>
        <input type="search" class="data-table-search__input" placeholder="${searchPlaceholder}" aria-label="${searchPlaceholder}" />
        <svg class="data-table-search__icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
      `;
      const input = searchBar.querySelector('input');
      let debounce;
      input.addEventListener('input', () => {
        clearTimeout(debounce);
        debounce = setTimeout(() => onSearch?.(input.value), 300);
      });
      wrapper.appendChild(searchBar);
    }

    const tableContainer = document.createElement('div');
    tableContainer.className = 'data-table-scroll';

    const table = document.createElement('table');
    table.className = 'data-table';
    table.setAttribute('role', 'table');

    const thead = document.createElement('thead');
    const headerRow = document.createElement('tr');
    columns.forEach((col) => {
      const th = document.createElement('th');
      th.scope = 'col';
      th.textContent = col.label;
      headerRow.appendChild(th);
    });
    thead.appendChild(headerRow);
    table.appendChild(thead);

    const tbody = document.createElement('tbody');
    tbody.className = 'data-table__body';
    table.appendChild(tbody);

    tableContainer.appendChild(table);
    wrapper.appendChild(tableContainer);

    const renderRows = (data) => {
      tbody.innerHTML = '';
      if (!data.length) {
        const tr = document.createElement('tr');
        const td = document.createElement('td');
        td.colSpan = columns.length;
        td.className = 'data-table__empty';
        td.textContent = emptyMessage;
        tr.appendChild(td);
        tbody.appendChild(tr);
        return;
      }

      data.forEach((row) => {
        const tr = document.createElement('tr');
        tr.className = 'data-table__row';
        tr.tabIndex = 0;
        tr.setAttribute('role', 'row');
        if (onRowClick) {
          tr.style.cursor = 'pointer';
          tr.addEventListener('click', () => onRowClick(row));
          tr.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              onRowClick(row);
            }
          });
        }

        columns.forEach((col) => {
          const td = document.createElement('td');
          const val = row[col.key];
          if (col.render) {
            td.appendChild(col.render(val, row));
          } else {
            td.textContent = val ?? '—';
          }
          tr.appendChild(td);
        });
        tbody.appendChild(tr);
      });
    };

    renderRows(rows);
    wrapper.renderRows = renderRows;

    return wrapper;
  },

  skeletonRows(cols = 5, rows = 5) {
    return Array.from({ length: rows }, () =>
      Array.from({ length: cols }, () => '<div class="skeleton skeleton--text"></div>').join('')
    );
  },
};

const QuickActionButton = {
  create({ label, variant = 'secondary', icon, href, onClick, ariaLabel }) {
    const btn = document.createElement('a');
    btn.className = `quick-action quick-action--${variant}`;
    btn.href = href || '#';
    btn.setAttribute('aria-label', ariaLabel || label);
    btn.innerHTML = `${icon ? `<span class="quick-action__icon" aria-hidden="true">${icon}</span>` : ''}<span>${label}</span>`;

    if (onClick || href === '#') {
      btn.addEventListener('click', (e) => {
        if (href === '#') e.preventDefault();
        onClick?.(e);
      });
    }
    return btn;
  },
};

const Format = {
  currency(amount) {
    if (amount == null) return '—';
    const num = Number(amount);
    if (num >= 100000) return `$${(num / 100000).toFixed(1)}L`;
    if (num >= 1000) return `$${(num / 1000).toFixed(1)}K`;
    return `$${num.toLocaleString('en-US')}`;
  },

  date(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  },

  dateLong() {
    return new Date().toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  },
};

const Toast = {
  show(title, message, type = 'info') {
    let container = document.getElementById('toast-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'toast-container';
      document.body.appendChild(container);
    }

    const icons = { success: '✓', error: '✕', warning: '⚠', info: 'ℹ' };
    const toast = document.createElement('div');
    toast.className = `toast toast--${type}`;
    toast.setAttribute('role', 'alert');
    toast.innerHTML = `
      <span class="toast__icon" aria-hidden="true">${icons[type] || icons.info}</span>
      <div class="toast__body">
        <div class="toast__title">${title}</div>
        ${message ? `<div class="toast__message">${message}</div>` : ''}
      </div>
      <button class="toast__close" aria-label="Dismiss notification">×</button>
    `;

    toast.querySelector('.toast__close').addEventListener('click', () => toast.remove());
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 5000);
  },
};

const ErrorBoundary = {
  show(container, message, onRetry) {
    container.innerHTML = `
      <div class="error-boundary" role="alert">
        <div class="error-boundary__icon" aria-hidden="true">⚠</div>
        <h2 class="error-boundary__title">Something went wrong</h2>
        <p class="error-boundary__message">${message}</p>
        ${onRetry ? '<button class="btn btn-primary error-boundary__retry">Try Again</button>' : ''}
      </div>
    `;
    if (onRetry) {
      container.querySelector('.error-boundary__retry').addEventListener('click', onRetry);
    }
  },
};

const RoleAccess = {
  canViewApprovals(role) {
    return ['Admin', 'Manager', 'Procurement Officer'].includes(role);
  },
  canViewSpending(role) {
    return ['Admin', 'Manager', 'Procurement Officer'].includes(role);
  },
  canCreateRFQ(role) {
    return ['Admin', 'Procurement Officer'].includes(role);
  },
  canManageVendors(role) {
    return ['Admin', 'Procurement Officer', 'Manager'].includes(role);
  },
};

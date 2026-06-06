/* ═══════════════════════════════════════════════════════
   VendorBridge — Shared App Layout (Sidebar + Header)
   ═══════════════════════════════════════════════════════ */

const NAV_ITEMS = [
  { id: 'dashboard', label: 'Dashboard', href: 'dashboard.html', icon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>' },
  { id: 'vendors', label: 'Vendors', href: 'vendors.html', icon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>' },
  { id: 'rfqs', label: 'RFQs', href: 'rfqs.html', icon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>', children: true },
  { id: 'quotations', label: 'Quotations', href: 'quotations.html', icon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>' },
  { id: 'approvals', label: 'Approvals', href: 'approvals.html', icon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>', roles: ['Admin', 'Manager', 'Procurement Officer'] },
  { id: 'purchase-orders', label: 'Purchase Orders', href: 'purchase-orders.html', icon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>' },
  { id: 'invoices', label: 'Invoices', href: 'invoices.html', icon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>' },
  { id: 'reports', label: 'Reports', href: 'reports.html', icon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>' },
  { id: 'activity', label: 'Activity', href: 'activity.html', icon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>' },
];

const Layout = {
  requireAuth() {
    if (!Session.isLoggedIn()) {
      window.location.href = 'index.html';
      return false;
    }
    return true;
  },

  getUser() {
    return Session.getUser() || { full_name: 'User', role: 'Procurement Officer', email: '' };
  },

  render(activePage) {
    const user = this.getUser();
    const initials = user.full_name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .slice(0, 2)
      .toUpperCase();

    const navHtml = NAV_ITEMS.filter((item) => {
      if (!item.roles) return true;
      return item.roles.includes(user.role);
    }).map((item) => `
      <a href="${item.href}" class="sidebar__link ${item.id === activePage ? 'sidebar__link--active' : ''}" ${item.id === activePage ? 'aria-current="page"' : ''}>
        <span class="sidebar__link-icon">${item.icon}</span>
        <span class="sidebar__link-text">${item.label}</span>
        ${item.children ? '<svg class="sidebar__chevron" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>' : ''}
      </a>
    `).join('');

    return `
      <aside class="sidebar" id="sidebar" aria-label="Main navigation">
        <nav class="sidebar__nav">${navHtml}</nav>
      </aside>

      <div class="app-main">
        <header class="topbar">
          <div class="topbar__left">
            <button class="topbar__menu-btn" id="sidebar-toggle" aria-label="Toggle navigation menu" aria-expanded="false">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
            </button>
            <a href="dashboard.html" class="topbar__brand">
              <span class="topbar__brand-icon">V</span>
              <span class="topbar__brand-text">VendorBridge</span>
            </a>
          </div>
          <div class="topbar__right">
            <button class="topbar__refresh" id="refresh-btn" aria-label="Refresh dashboard data" title="Refresh">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
            </button>
            <div class="topbar__profile" id="profile-dropdown">
              <button class="topbar__profile-btn" aria-haspopup="true" aria-expanded="false" id="profile-btn">
                <span class="topbar__avatar" aria-hidden="true">${initials}</span>
                <span class="topbar__profile-name">${user.full_name}</span>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>
              </button>
              <div class="topbar__dropdown hidden" id="profile-menu" role="menu">
                <div class="topbar__dropdown-header">
                  <strong>${user.full_name}</strong>
                  <span>${user.role}</span>
                  <small>${user.email}</small>
                </div>
                <hr />
                <button role="menuitem" id="logout-btn">Sign Out</button>
              </div>
            </div>
          </div>
        </header>
        <main class="main-content" id="main-content"></main>
      </div>
    `;
  },

  mount(activePage, contentHtml) {
    const app = document.getElementById('app');
    app.innerHTML = this.render(activePage);
    document.getElementById('main-content').innerHTML = contentHtml;
    this.bindEvents();
  },

  bindEvents() {
    const toggle = document.getElementById('sidebar-toggle');
    const sidebar = document.getElementById('sidebar');
    toggle?.addEventListener('click', () => {
      const open = sidebar.classList.toggle('sidebar--open');
      toggle.setAttribute('aria-expanded', String(open));
    });

    const profileBtn = document.getElementById('profile-btn');
    const profileMenu = document.getElementById('profile-menu');
    profileBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      const open = profileMenu.classList.toggle('hidden');
      profileBtn.setAttribute('aria-expanded', String(!open));
    });

    document.addEventListener('click', () => {
      profileMenu?.classList.add('hidden');
      profileBtn?.setAttribute('aria-expanded', 'false');
    });

    document.getElementById('logout-btn')?.addEventListener('click', async () => {
      try { await Api.auth.logout(); } catch (_) { /* ignore */ }
      Session.clear();
      window.location.href = 'index.html';
    });
  },
};

/* ═══════════════════════════════════════════════════════
   VendorBridge — Placeholder Page Handler
   ═══════════════════════════════════════════════════════ */

document.addEventListener('DOMContentLoaded', () => {
  if (!Layout.requireAuth()) return;

  const page = document.body.dataset.page;
  const title = document.body.dataset.title || 'Coming Soon';
  const description = document.body.dataset.description || 'This module is under development.';

  Layout.mount(page, `
    <div class="placeholder-page">
      <div class="placeholder-page__icon" aria-hidden="true">🚧</div>
      <h1 class="placeholder-page__title">${title}</h1>
      <p class="placeholder-page__desc">${description}</p>
      <a href="dashboard.html" class="btn btn-primary">← Back to Dashboard</a>
    </div>
  `);

  const loader = document.getElementById('page-loader');
  if (loader) {
    loader.style.opacity = '0';
    setTimeout(() => loader.remove(), 300);
  }
});

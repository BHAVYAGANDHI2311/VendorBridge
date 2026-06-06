/* ═══ User Management — Admin only ═══ */

document.addEventListener('DOMContentLoaded', async () => {
  if (!Layout.requireAuth()) return;

  const user = Layout.getUser();
  if (!RoleAccess.canManageUsers(user.role)) {
    Layout.mount('users', RoleAccess.accessDeniedHtml('Only administrators can manage users.'));
    hideLoader();
    return;
  }

  Layout.mount('users', `
    <div class="po-page">
      <header class="po-page__top">
        <div>
          <h1 class="po-page__title">Users</h1>
          <p class="po-page__subtitle">Manage accounts and access</p>
        </div>
      </header>
      <div class="po-card" id="users-list">
        <div class="approvals-empty">Loading users…</div>
      </div>
    </div>
  `);
  hideLoader();

  try {
    const data = await Api.users.list();
    renderUsers(data.items || []);
  } catch (err) {
    document.getElementById('users-list').innerHTML = `<div class="approvals-empty">${esc(ApiError.format(err))}</div>`;
  }
});

function renderUsers(items) {
  const container = document.getElementById('users-list');
  if (!items.length) {
    container.innerHTML = '<div class="approvals-empty">No users found.</div>';
    return;
  }

  const rows = items.map((u) => `
    <tr>
      <td><strong>${esc(u.full_name)}</strong><br><small style="color:var(--text-muted)">${esc(u.email)}</small></td>
      <td>${esc(u.role)}</td>
      <td>${u.is_active ? '<span class="status-badge status-badge--success">Active</span>' : '<span class="status-badge status-badge--danger">Inactive</span>'}</td>
      <td>${Format.date(u.created_at)}</td>
      <td>
        <button type="button" class="btn btn-ghost btn-sm" data-id="${u.id}" data-active="${u.is_active}">
          ${u.is_active ? 'Deactivate' : 'Activate'}
        </button>
      </td>
    </tr>`).join('');

  container.innerHTML = `
    <div class="data-table-scroll">
      <table class="data-table">
        <thead><tr><th>User</th><th>Role</th><th>Status</th><th>Joined</th><th>Actions</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;

  container.querySelectorAll('button[data-id]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.id;
      const isActive = btn.dataset.active === 'true';
      try {
        await Api.users.updateStatus(id, !isActive);
        Toast.show('Updated', `User ${isActive ? 'deactivated' : 'activated'}.`, 'success');
        const data = await Api.users.list();
        renderUsers(data.items || []);
      } catch (err) {
        Toast.show('Error', ApiError.format(err), 'error');
      }
    });
  });
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

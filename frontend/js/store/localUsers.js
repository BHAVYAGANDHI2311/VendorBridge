/* ─── localStorage user registry (no hardcoded names) ─── */

const USERS_KEY = 'vb_users';
const LEVELS_KEY = 'vb_approval_levels';

const LocalUsers = {
  defaultLevels() {
    return [
      { level: 'L1', approverRole: 'Procurement Officer', label: 'L1 Review' },
      { level: 'L2', approverRole: 'Manager', label: 'L2 Approval' },
    ];
  },

  ensureLevels() {
    if (!localStorage.getItem(LEVELS_KEY)) {
      localStorage.setItem(LEVELS_KEY, JSON.stringify(this.defaultLevels()));
    }
    return JSON.parse(localStorage.getItem(LEVELS_KEY));
  },

  getLevels() {
    return this.ensureLevels();
  },

  getAll() {
    try {
      return JSON.parse(localStorage.getItem(USERS_KEY) || '[]');
    } catch {
      return [];
    }
  },

  register(user) {
    if (!user?.email) return;
    const users = this.getAll();
    const id = user.id || user._id || user.email;
    const entry = {
      id: String(id),
      email: user.email.toLowerCase(),
      full_name: user.full_name || user.name || user.email,
      role: user.role || 'Procurement Officer',
    };
    const idx = users.findIndex((u) => u.email === entry.email);
    if (idx >= 0) users[idx] = { ...users[idx], ...entry };
    else users.push(entry);
    localStorage.setItem(USERS_KEY, JSON.stringify(users));
    return entry;
  },

  getByRole(role) {
    return this.getAll().filter((u) => u.role === role);
  },

  resolveApprover(levelConfig) {
    const matches = this.getByRole(levelConfig.approverRole);
    if (!matches.length) {
      return {
        approverName: '',
        approverRole: levelConfig.approverRole,
        approverEmail: '',
        approverId: '',
      };
    }
    const user = matches[0];
    return {
      approverName: user.full_name,
      approverRole: user.role,
      approverEmail: user.email,
      approverId: user.id,
    };
  },
};

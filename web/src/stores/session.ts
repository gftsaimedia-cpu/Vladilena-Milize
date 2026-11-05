// Phiên đăng nhập: người dùng, vai trò, năng lực. Máy chủ thật: GET /api/v2/auth/me; dữ liệu giả: src/mock/accounts.
import { defineStore } from 'pinia';
import { mockAccount, readSessionName } from '@/mock/accounts';
import { api } from '@/services/http';

// Có một trong các năng lực này (hoặc role === 'admin') thì vào khu Admin; còn lại vào khu nhân viên.
export const ADMIN_CAPS = Object.freeze([
  'config.read',
  'payroll.calculate',
  'payroll.approve',
  'attendance.correct',
  'attendance.lock',
  'audit.read'
]);

export const ADMIN_HOME = '/admin/tong-quan';
export const STAFF_HOME = '/nhan-vien';
export const LOGIN_PATH = '/dang-nhap';

// Chữ cái đầu của hai từ cuối trong họ tên.
const initialsOf = (name?) => {
  const words = String(name || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  return words
    .slice(-2)
    .map(w => w[0])
    .join('')
    .toUpperCase();
};

const ROLE_LABELS = {
  admin: 'Admin',
  cb: 'C&B',
  accounting: 'Kế toán',
  hr: 'Nhân sự',
  manager: 'Quản lý',
  staff: 'Nhân viên'
};

export const useSessionStore = defineStore('session', {
  state: () => ({
    ready: false,
    user: null,
    roles: [],
    caps: [],
    payrollSubject: true,
    serverNow: null,
    me: null
  }),
  getters: {
    isLoggedIn: (s?) => !!s.user,
    isAdminCapable: (s?) => !!s.user && (s.user.role === 'admin' || s.caps.some(c => ADMIN_CAPS.includes(c))),
    home() {
      if (!this.user) return LOGIN_PATH;
      return this.isAdminCapable ? ADMIN_HOME : STAFF_HOME;
    },
    // Dạng cho vỏ Admin: { username, name, roleLabel, initials }; roleLabel là vai trò đầu tiên có nhãn.
    shellMe(s?) {
      if (!s.user) return {};
      const role = ['admin', 'cb', 'accounting', 'hr', 'manager', 'staff'].find(r => s.roles.includes(r));
      return {
        username: s.user.username,
        name: s.user.name,
        roleLabel: ROLE_LABELS[role] || ROLE_LABELS.staff,
        initials: initialsOf(s.user.name)
      };
    }
  },
  actions: {
    // Gói tài khoản giả vào store; user rỗng = chưa đăng nhập.
    apply(data?) {
      const user = data && data.user ? data.user : null;
      this.user = user;
      this.roles = user && Array.isArray(data.roles) ? data.roles : [];
      this.caps = user && Array.isArray(data.caps) ? data.caps : [];
      this.payrollSubject = user ? data.payrollSubject !== false : true;
      this.serverNow = (data && data.serverNow) || null;
      this.me = user ? data : null;
      this.ready = true;
    },
    // Máy chủ trả { user: null } khi chưa đăng nhập, hoặc { user, roles, caps, payrollSubject, serverNow }.
    async load() {
      if (__MOCK__) {
        const name = readSessionName();
        this.apply(name ? mockAccount(name) : null);
        return;
      }
      this.apply(await api.get('/auth/me'));
    },
    clear() {
      this.apply(null);
    }
  }
});

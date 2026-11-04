// Phiên giả: tên đăng nhập lưu ở localStorage; không có khoá thì coi như đã vào bằng admin.
import { MOCK_NOW } from './clock';

export type MockAccount = {
  user: { username: string; name: string; role: string };
  roles: string[];
  caps: string[];
  payrollSubject: boolean;
  serverNow: string;
};

const SESSION_KEY = 'aicb.mock.session';
const SIGNED_OUT = 'none';
const DEFAULT_NAME = 'admin';

// Danh sách năng lực Admin viết lại ở đây để không import vòng với stores/session.
const ADMIN_CAPS = [
  'config.read',
  'payroll.calculate',
  'payroll.approve',
  'attendance.correct',
  'attendance.lock',
  'audit.read'
];

export function mockAccount(username: string): MockAccount {
  if (username === 'admin') {
    return {
      user: { username, name: 'Quản trị viên', role: 'admin' },
      roles: ['admin'],
      caps: [...ADMIN_CAPS],
      payrollSubject: false,
      serverNow: MOCK_NOW
    };
  }
  return {
    user: { username, name: 'Nguyễn Thu Hà', role: 'staff' },
    roles: ['staff'],
    caps: [],
    payrollSubject: true,
    serverNow: MOCK_NOW
  };
}

// Trình duyệt chặn localStorage (cửa sổ ẩn danh, cấu hình chặn): dùng biến trong module thay thế.
let memoryValue: string | null = null;

// Trả tên đang đăng nhập, hoặc null khi đã đăng xuất.
export function readSessionName(): string | null {
  // Đã phải ghi vào biến trong module (setItem lỗi) thì giá trị đó là bản mới nhất, đọc trước.
  let raw: string | null = memoryValue;
  if (raw === null) {
    try {
      raw = localStorage.getItem(SESSION_KEY);
    } catch {
      raw = null;
    }
  }
  if (raw === null) return DEFAULT_NAME;
  return raw === SIGNED_OUT ? null : raw;
}

export function writeSessionName(name: string | null): void {
  const value = name === null ? SIGNED_OUT : name;
  try {
    localStorage.setItem(SESSION_KEY, value);
    memoryValue = null;
  } catch {
    memoryValue = value;
  }
}

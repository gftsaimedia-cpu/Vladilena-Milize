// Đăng nhập, đăng xuất, đổi mật khẩu và đọc phiên. Máy chủ thật: /api/v2/auth/*, phiên là cookie HttpOnly.
// Chế độ dữ liệu giả (__MOCK__): phiên giả trong src/mock/accounts, nhận mọi mật khẩu.
// Lỗi ném ApiError để màn đăng nhập hiện nguyên văn câu báo của máy chủ.
import { writeSessionName } from '@/mock/accounts';
import { respond } from '@/mock/respond';
import { useSessionStore } from '@/stores/session';
import { ApiError, api } from './http';

// Tên đăng nhập luôn cắt khoảng trắng và viết thường, như máy chủ chuẩn hoá.
const normalizeUsername = (raw?) =>
  String(raw || '')
    .trim()
    .toLowerCase();

/** Đọc lại phiên vào store; đã đăng xuất thì user rỗng. */
export async function loadSession() {
  const store = useSessionStore();
  await store.load();
  return store;
}

/** Đăng nhập: tên hoặc mật khẩu rỗng thì báo lỗi ngay, không gọi máy chủ. */
export async function login({ username, password }: any) {
  const name = normalizeUsername(username);
  const pass = String(password ?? '');
  if (!name || !pass) throw new ApiError(400, 'Nhập tên đăng nhập và mật khẩu.');
  if (__MOCK__) writeSessionName(name);
  else await api.post('/auth/login', { username: name, password: pass });
  return loadSession();
}

/** Đăng xuất rồi xoá phiên trong store (tải lại trang vẫn ở màn đăng nhập). */
export async function logout() {
  if (__MOCK__) writeSessionName(null);
  else await api.post('/auth/logout');
  useSessionStore().clear();
  return { ok: true };
}

/** Đổi mật khẩu của chính mình. Máy chủ cấp cookie mới cho thiết bị này và đăng xuất các thiết bị khác. */
export async function changePassword(current?, next?) {
  if (__MOCK__) return respond({ ok: true });
  return api.put('/auth/password', { oldPassword: current, newPassword: next });
}

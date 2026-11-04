// Đăng nhập, đăng xuất, đổi mật khẩu và đọc phiên trên phiên giả (src/mock/accounts), không gọi máy chủ.
// Lỗi ném ApiError như máy chủ thật để màn đăng nhập hiện nguyên văn.
import { writeSessionName } from '@/mock/accounts';
import { respond } from '@/mock/respond';
import { useSessionStore } from '@/stores/session';
import { ApiError } from './http';

// Tên đăng nhập luôn cắt khoảng trắng và viết thường, như máy chủ chuẩn hoá.
const normalizeUsername = (raw?) =>
  String(raw || '')
    .trim()
    .toLowerCase();

/** Đọc lại phiên giả vào store; đã đăng xuất thì user rỗng. */
export async function loadSession() {
  const store = useSessionStore();
  await store.load();
  return store;
}

/** Đăng nhập: tên hoặc mật khẩu rỗng thì báo lỗi; còn lại nhận mọi mật khẩu và ghi tên vào phiên giả. */
export async function login({ username, password }: any) {
  const name = normalizeUsername(username);
  const pass = String(password ?? '');
  if (!name || !pass) throw new ApiError(400, 'Nhập tên đăng nhập và mật khẩu.');
  writeSessionName(name);
  return loadSession();
}

/** Đăng xuất: ghi "đã đăng xuất" vào phiên giả (tải lại trang vẫn ở màn đăng nhập) rồi xoá phiên trong store. */
export async function logout() {
  writeSessionName(null);
  useSessionStore().clear();
  return { ok: true };
}

/** Đổi mật khẩu của chính mình: mockup luôn thành công. */
export async function changePassword(_current?, _next?) {
  return respond({ ok: true });
}

// Đăng nhập, đăng xuất, đổi mật khẩu và đọc phiên (POST /api/login, POST /api/logout, PUT /api/password, GET /api/me).
// Lỗi ném ApiError với câu của máy chủ (hiện nguyên văn).
import { useSessionStore } from '@/stores/session';
import { api } from './http';

// Tên đăng nhập luôn cắt khoảng trắng và viết thường, như máy chủ chuẩn hoá.
const normalizeUsername = (raw?) =>
  String(raw || '')
    .trim()
    .toLowerCase();

/** Đọc lại phiên (GET /me) vào store; chưa đăng nhập thì user rỗng. */
export async function loadSession() {
  const store = useSessionStore();
  await store.load();
  return store;
}

/** Đăng nhập: POST /login rồi GET /me để có đủ vai trò, năng lực. Trả store phiên. */
export async function login({ username, password }: any) {
  await api('POST', '/login', { username: normalizeUsername(username), password: String(password ?? '') });
  return loadSession();
}

/** Đăng xuất: thu hồi phiên ở máy chủ, xoá phiên ở trình duyệt. Phiên đã hết hạn thì cũng coi như đã đăng xuất. */
export async function logout() {
  try {
    await api('POST', '/logout', {});
  } catch {
    /* phiên đã hết hạn: vẫn xoá phiên cục bộ */
  }
  useSessionStore().clear();
  return { ok: true };
}

/** Đổi mật khẩu của chính mình (PUT /password). Máy chủ cấp cookie phiên mới trong cùng phản hồi. */
export async function changePassword(current?, next?) {
  return api('PUT', '/password', { current: String(current ?? ''), next: String(next ?? '') });
}

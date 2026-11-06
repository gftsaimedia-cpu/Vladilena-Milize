// Dịch vụ Phân quyền và Tài khoản (Cài đặt, Admin). Câu lỗi của máy chủ đi nguyên văn qua ApiError.
// Máy chủ thật: tóm tắt và Tài khoản đọc GET /api/v2/roles + /employees; đổi vai trò, khoá / mở khoá, đặt lại mật khẩu
// qua PUT /api/v2/employees/:username. Ma trận vai trò (tạo, sửa, ngừng dùng vai trò) chưa có API: báo chưa nối.
// Xử lý yêu cầu: chưa có API ở BE v2, báo chưa nối.
import { buildAccounts, nextRoles } from '@/builders/admin-perm/accounts';
import { buildPermSummary } from '@/builders/admin-perm/roles';
import { accountSourcesFromApi } from '@/builders/api/accounts';
import { useSessionStore } from '@/stores/session';
import { notConnected } from './data-mode';
import { api } from './http';

const enc = encodeURIComponent;

async function sources() {
  const [rolesRes, empRes] = await Promise.all([api('GET', '/roles'), api('GET', '/employees')]);
  return accountSourcesFromApi(rolesRes.roles || [], empRes.employees || []);
}

// ---------- Vai trò ----------
// Số vai trò, tài khoản, Admin, tài khoản khoá
export async function getPermSummary() {
  return buildPermSummary((await sources()).rolesRes);
}

// Ma trận khu vực, loại yêu cầu, việc khác: BE v2 chỉ có hai vai trò cố định (admin, staff), chưa có API.
export const getRoles = () => notConnected();
export const saveRoles = (_roles?) => notConnected();
export const createRole = (_input: any): Promise<{ key: string }> => notConnected();
export const deprecateRole = (_role?, _reason?) => notConnected();

// ---------- Tài khoản ----------
export async function getAccounts({ page = 1, role = 'all', q = '' }: any = {}) {
  const { rolesRes, staffRes } = await sources();
  return buildAccounts(rolesRes, staffRes, null, useSessionStore().user?.username, { page, role, q });
}

const putAccount = (username: string, account: Record<string, unknown>) =>
  api('PUT', `/employees/${enc(username)}`, { account });

// Đổi vai trò của dòng `row` thành vai trò có nhãn `roleLabel`: gửi đúng một vai trò, BE ghi nó vào staff.role
// (đăng nhập và quyền đọc cột này) và thu hồi vai trò phụ.
export async function setAccountRole(row?, roleLabel?) {
  const res = await api('GET', '/roles');
  const target = (res.roles || []).find(r => r.label === roleLabel);
  if (!target) throw new Error(`Không có vai trò "${roleLabel}"`);
  return putAccount(row.username, { roles: nextRoles(target.code) });
}

// Khoá hoặc mở khoá. Khoá thì máy chủ ghi thời điểm khoá và mọi phiên của người đó hết hiệu lực.
export async function setAccountLocked(row?, locked?) {
  return putAccount(row.username, { isLocked: !!locked });
}

// Đặt mật khẩu mới cho tài khoản khác; máy chủ cho mọi phiên cũ của người đó hết hiệu lực. BE chưa lưu lý do.
export async function resetAccountPassword(row?, { password }: any = {}) {
  return putAccount(row.username, { password: String(password ?? '') });
}

// ---------- Xử lý yêu cầu chưa được đồng ý hoặc bị từ chối ----------
// BE v2 chưa có API (bảng v1 request.type.<loại> của /settings/params đã bỏ): tab đã ẩn, địa chỉ cũ đưa về Vai trò.
export const getRequestRules = () => notConnected();
export const saveRequestRules = (_draft?) => notConnected();

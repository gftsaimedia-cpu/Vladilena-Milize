// Dịch vụ Phân quyền và Tài khoản (Cài đặt, Admin). Câu lỗi của máy chủ đi nguyên văn qua ApiError.
// Máy chủ thật: tóm tắt và Tài khoản đọc GET /api/v2/roles + /employees; đổi vai trò, khoá / mở khoá, đặt lại mật khẩu
// qua PUT /api/v2/employees/:username. Ma trận vai trò (tạo, sửa, ngừng dùng vai trò) chưa có API: báo chưa nối.
// Xử lý yêu cầu: GET/PUT /settings/params (bảng request.type.<loại>), chưa có ở BE v2.
import { buildAccounts, nextRoles, primaryRole } from '@/builders/admin-perm/accounts';
import { buildRequestRules, toRuleChanges } from '@/builders/admin-perm/rules';
import { buildPermSummary } from '@/builders/admin-perm/roles';
import { accountSourcesFromApi } from '@/builders/api/accounts';
import { useSessionStore } from '@/stores/session';
import { notConnected } from './data-mode';
import { api, qs } from './http';

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
export const createRole = (_input: any) => notConnected();
export const deprecateRole = (_role?, _reason?) => notConnected();

// ---------- Tài khoản ----------
export async function getAccounts({ page = 1, role = 'all', q = '' }: any = {}) {
  const { rolesRes, staffRes } = await sources();
  return buildAccounts(rolesRes, staffRes, null, useSessionStore().user?.username, { page, role, q });
}

const putAccount = (username: string, account: Record<string, unknown>) =>
  api('PUT', `/employees/${enc(username)}`, { account });

// Đổi vai trò chính của dòng `row` thành vai trò có nhãn `roleLabel`.
export async function setAccountRole(row?, roleLabel?) {
  const res = await api('GET', '/roles');
  const target = (res.roles || []).find(r => r.label === roleLabel);
  if (!target) throw new Error(`Không có vai trò "${roleLabel}"`);
  return putAccount(row.username, { roles: nextRoles(row.roles, primaryRole(row.roles), target.code) });
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
let rulesBase: any = null; // bản gốc của lần đọc gần nhất: số phiên bản tham số, tháng áp dụng, giá trị từng dòng

// GET /api/settings/params?group=9: các dòng nghỉ và làm thêm cùng cách xử lý hiện tại
export async function getRequestRules() {
  const res = await api('GET', `/settings/params${qs({ group: 9 })}`);
  const built = buildRequestRules(res);
  rulesBase = built.base;
  return built.view;
}

// PUT /api/settings/params: chỉ gửi các khoá của dòng đã đổi, kèm số phiên bản tham số của lần đọc; không đổi gì thì không gọi
export async function saveRequestRules(draft?) {
  if (!rulesBase) throw new Error('Chưa đọc cách xử lý yêu cầu');
  const changes = toRuleChanges(draft, rulesBase);
  if (!changes.length) return { ok: true, saved: [] };
  const res = await api('PUT', '/settings/params', {
    changes,
    expectedRev: rulesBase.rev,
    effectiveMonth: rulesBase.month
  });
  rulesBase.rev = res.paramsRev;
  for (const row of [...draft.leave, ...draft.extra]) {
    const was = rulesBase.rows[row.key];
    if (!was) continue;
    was.value = row.value;
    if (row.countsAbsent !== undefined) was.countsAbsent = !!row.countsAbsent;
  }
  return { ok: true, saved: res.saved || [] };
}

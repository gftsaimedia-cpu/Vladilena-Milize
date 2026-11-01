// Dịch vụ Phân quyền và Tài khoản (Cài đặt, Admin) gọi máy chủ qua api(). Câu lỗi của máy chủ đi nguyên văn qua ApiError.
// Vai trò: GET/POST /roles, PUT /roles/:code. Tài khoản: GET /roles, GET /staff, PUT /staff/:u/roles, PUT /staff/:u, POST /staff/:u/password.
// Xử lý yêu cầu: GET/PUT /settings/params (bảng request.type.<loại>).
import { buildAccounts, nextRoles, primaryRole } from '@/builders/admin-perm/accounts';
import { buildRequestRules, toRuleChanges } from '@/builders/admin-perm/rules';
import { buildPermSummary, buildRoleMatrix, roleSignature, toRolePutBody } from '@/builders/admin-perm/roles';
import { ApiError, api, qs } from './http';

const enc = encodeURIComponent;
const reasonOf = (text?) => (typeof text === 'string' && text.trim() ? text.trim() : undefined);

// ---------- Vai trò ----------
// GET /api/roles: số vai trò, tài khoản, Admin, tài khoản khoá
export async function getPermSummary() {
  return buildPermSummary(await api('GET', '/roles'));
}

// GET /api/roles: ma trận khu vực, loại yêu cầu, việc khác và các vai trò
export async function getRoles() {
  return buildRoleMatrix(await api('GET', '/roles'));
}

// PUT /api/roles/:code cho từng vai trò tuỳ chỉnh đã đổi (vai trò mặc định chỉ đọc); dừng ở lỗi đầu tiên
export async function saveRoles(roles?) {
  const changed = roles.filter(role => !role.locked && roleSignature(role) !== role.sig);
  const bodies = changed.map(role => [role.key, toRolePutBody(role)]); // dựng hết trước, có lỗi thì chưa gửi gì
  const saved: any[] = [];
  for (const [key, body] of bodies) {
    await api('PUT', `/roles/${enc(key)}`, body);
    saved.push(key);
  }
  return { ok: true, saved };
}

// POST /api/roles: tạo vai trò mới, sao chép quyền từ vai trò `copyFrom` nếu có. Trả { key } là mã vai trò mới.
export async function createRole({ name, reason, copyFrom }: any) {
  const res = await api('POST', '/roles', {
    label: String(name || '').trim(),
    copyFrom: copyFrom || undefined,
    reason: reasonOf(reason)
  });
  return { ok: true, key: res.role.code };
}

// POST /api/roles/:code/deprecate { rev, reason }: ngừng dùng vai trò tuỳ chỉnh (không xoá); tài khoản đang giữ vai trò vẫn giữ dòng gán. rev lấy từ role.ver.rev.
export async function deprecateRole(role?, reason?) {
  if (!role || !role.ver || !Number.isInteger(role.ver.rev)) throw new Error('Thiếu số phiên bản (rev) của vai trò');
  await api('POST', `/roles/${enc(role.key)}/deprecate`, { rev: role.ver.rev, reason: reasonOf(reason) });
  return { ok: true };
}

// ---------- Tài khoản ----------
// GET /api/roles, /staff, /positions, /me ghép thành một trang tài khoản
export async function getAccounts({ page = 1, role = 'all', q = '' }: any = {}) {
  const optional = (p?) =>
    p.catch(e => {
      if (e instanceof ApiError && e.status === 403) return null;
      throw e;
    });
  const [rolesRes, staffRes, positionsRes, me] = await Promise.all([
    api('GET', '/roles'),
    api('GET', '/staff'),
    optional(api('GET', '/positions')),
    api('GET', '/me')
  ]);
  return buildAccounts(rolesRes, staffRes, positionsRes, me.user.username, { page, role, q });
}

const needRev = (row?, field?) => {
  if (!row || !row.ver || row.ver[field] === undefined || row.ver[field] === null)
    throw new Error(`Thiếu số phiên bản (${field}) của tài khoản ${row && row.username}`);
  return row.ver[field];
};

// PUT /api/staff/:u/roles: đổi vai trò chính của dòng `row` thành vai trò có nhãn `roleLabel`
export async function setAccountRole(row?, roleLabel?) {
  const rev = needRev(row, 'rev');
  const res = await api('GET', '/roles');
  const target = res.roles.find(r => r.label === roleLabel);
  if (!target) throw new Error(`Không có vai trò "${roleLabel}"`);
  const roles = nextRoles(row.roles, primaryRole(row.roles), target.code);
  return api('PUT', `/staff/${enc(row.username)}/roles`, { roles, expectedRev: rev });
}

// PUT /api/staff/:u { locked, expectedRev }: khoá hoặc mở khoá, kèm dấu vân tay hồ sơ
export async function setAccountLocked(row?, locked?) {
  return api('PUT', `/staff/${enc(row.username)}`, { locked: !!locked, expectedRev: needRev(row, 'staffRev') });
}

// POST /api/staff/:u/password { password, reason }: đặt mật khẩu mới cho tài khoản khác
export async function resetAccountPassword(row?, { password, reason }: any = {}) {
  return api('POST', `/staff/${enc(row.username)}/password`, {
    password: String(password ?? ''),
    reason: reasonOf(reason)
  });
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

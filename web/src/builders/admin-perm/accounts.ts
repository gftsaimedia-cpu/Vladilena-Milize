// Danh sách tài khoản (Cài đặt › Phân quyền › Tài khoản): ghép GET /api/roles (vai trò, số phiên bản vai trò) với GET /api/staff (nhãn phụ, khoá, dấu vân tay hồ sơ).
// Mỗi dòng hiện một vai trò chính; vai trò khác và cờ "nhân viên" (hưởng lương) của tài khoản giữ nguyên khi đổi vai trò chính.

export const ACCOUNT_PAGE_SIZE = 10;
const STAFF = 'staff';

const fold = (text?) =>
  String(text || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/gi, 'd')
    .toLowerCase();

// Vai trò chính: vai trò đầu tiên khác "staff"; chỉ có staff thì staff; chưa có gì thì rỗng
export const primaryRole = (roles?) => roles.find(r => r !== STAFF) || (roles.includes(STAFF) ? STAFF : '');

// Danh sách vai trò sau khi đổi vai trò chính `from` thành `to`: bỏ vai trò chính cũ (trừ staff, cờ hưởng lương), thêm vai trò mới, giữ phần còn lại
export function nextRoles(current?, from?, to?) {
  const list = new Set<any>(current);
  if (from && from !== STAFF) list.delete(from);
  list.add(to);
  return [...list];
}

export function buildAccounts(rolesRes?, staffRes?, positionsRes?, me?, query: any = {}) {
  const labelOf = Object.fromEntries(rolesRes.roles.map(r => [r.code, r.label]));
  const codeOfLabel = Object.fromEntries(rolesRes.roles.map(r => [r.label, r.code]));
  const profile = new Map<any, any>((staffRes.staff || []).map(s => [s.username, s]));
  const shortOf = Object.fromEntries(((positionsRes && positionsRes.positions) || []).map(p => [p.code, p.short]));

  const all = rolesRes.staff.map(s => {
    const prof = profile.get(s.username);
    const code = primaryRole(s.roles);
    const role = labelOf[code] || '';
    const sub =
      prof && prof.payrollSubject
        ? `${shortOf[prof.type] || String(prof.type).toUpperCase()} · ${prof.levelName || prof.level}`
        : role;
    return {
      name: s.name,
      sub,
      username: s.username,
      role,
      roleCode: code,
      roles: [...s.roles],
      status: s.locked ? 'locked' : 'active',
      me: s.username === me,
      ver: { rev: s.rev, staffRev: prof ? prof.rev : undefined }
    };
  });

  const holds = (a?, label?) => a.roles.includes(codeOfLabel[label]);
  const needle = fold(query.q || '').trim();
  const roleKey = query.role || 'all';
  const list = all.filter(a => (roleKey === 'all' || holds(a, roleKey)) && (!needle || fold(a.name).includes(needle)));

  const heldCodes = new Set<any>(all.flatMap(a => a.roles));
  const shownRoles = rolesRes.roles.filter(r => !r.deprecated || heldCodes.has(r.code));
  const pages = Math.max(1, Math.ceil(list.length / ACCOUNT_PAGE_SIZE));
  const page = Math.min(Math.max(1, Number(query.page) || 1), pages);
  const start = (page - 1) * ACCOUNT_PAGE_SIZE;
  const rows = list.slice(start, start + ACCOUNT_PAGE_SIZE);
  return {
    summary: {
      total: all.length,
      admins: all.filter(a => a.roles.includes('admin')).length,
      locked: all.filter(a => a.status === 'locked').length
    },
    chips: [
      { key: 'all', label: 'Tất cả', count: all.length },
      ...shownRoles.map(r => ({
        key: r.label,
        label: r.label,
        count: all.filter(a => a.roles.includes(r.code)).length
      }))
    ],
    roles: shownRoles.map(r => r.label),
    rows,
    total: list.length,
    page,
    pages,
    from: list.length ? start + 1 : 0,
    to: start + rows.length
  };
}

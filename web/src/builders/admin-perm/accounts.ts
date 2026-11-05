// Danh sách tài khoản (Cài đặt › Phân quyền › Tài khoản): ghép vai trò (GET /api/v2/roles) với hồ sơ (GET /employees).
// Quy ước của BE v2: vai trò chính là roles[0] (cột staff.role, nơi đăng nhập và quyền đọc); vai trò khác không cho quyền
// gì. Mỗi dòng hiện, lọc và đếm theo vai trò chính; đổi vai trò gửi đúng một vai trò mới.

export const ACCOUNT_PAGE_SIZE = 10;

const fold = (text?) =>
  String(text || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/gi, 'd')
    .toLowerCase();

// Vai trò chính: phần tử đầu, như BE ghi vào staff.role
export const primaryRole = (roles?) => (roles && roles[0]) || '';

// Danh sách vai trò gửi lên khi đổi vai trò chính thành `to`: chỉ một vai trò, BE ghi nó vào staff.role và thu hồi phần còn lại
export const nextRoles = (to?) => [to];

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

  const holds = (a?, label?) => a.roleCode === codeOfLabel[label];
  const needle = fold(query.q || '').trim();
  const roleKey = query.role || 'all';
  const list = all.filter(a => (roleKey === 'all' || holds(a, roleKey)) && (!needle || fold(a.name).includes(needle)));

  const heldCodes = new Set<any>(all.map(a => a.roleCode));
  const shownRoles = rolesRes.roles.filter(r => !r.deprecated || heldCodes.has(r.code));
  const pages = Math.max(1, Math.ceil(list.length / ACCOUNT_PAGE_SIZE));
  const page = Math.min(Math.max(1, Number(query.page) || 1), pages);
  const start = (page - 1) * ACCOUNT_PAGE_SIZE;
  const rows = list.slice(start, start + ACCOUNT_PAGE_SIZE);
  return {
    summary: {
      total: all.length,
      admins: all.filter(a => a.roleCode === 'admin').length,
      locked: all.filter(a => a.status === 'locked').length
    },
    chips: [
      { key: 'all', label: 'Tất cả', count: all.length },
      ...shownRoles.map(r => ({
        key: r.label,
        label: r.label,
        count: all.filter(a => a.roleCode === r.code).length
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

// Ma trận vai trò (Cài đặt › Phân quyền › Vai trò): dựng từ GET /api/roles và đổi ngược thành thân PUT /api/roles/:code.
// Phạm vi là một giá trị cho cả vai trò; màn hiện nó ở mọi khu có cột Phạm vi và các khu đó luôn cùng giá trị.

const GROUP_LABEL = { main: 'Màn làm việc', settings: 'Cài đặt' };
export const LEVEL_LABEL = { none: 'Không', view: 'Xem', edit: 'Sửa' };
const LEVEL_TO_BE = { none: 'khong', view: 'xem', edit: 'sua' };
export const SCOPE_LABEL = { all: 'Tất cả', team: 'Nhóm mình quản lý', self: 'Chỉ bản thân' };
const SCOPE_CODE = Object.fromEntries(Object.entries(SCOPE_LABEL).map(([code, label]: any) => [label, code]));
// Loại yêu cầu máy chủ có mà màn không hiện: vai trò đã lưu mang gì thì giữ nguyên khi lưu
const HIDDEN_APPROVALS = ['willmakeup'];

// Số tài khoản, vai trò, Admin và tài khoản khoá, đếm từ một lần đọc /roles
export function buildPermSummary(res?) {
  return {
    roles: res.roles.length,
    accounts: res.staff.length,
    admins: res.staff.filter(s => s.roles.includes('admin')).length,
    locked: res.staff.filter(s => s.locked).length
  };
}

// Dấu của phần vai trò màn sửa được (tên, mức quyền, loại yêu cầu, việc khác): khác dấu lúc tải = vai trò đã đổi
export function roleSignature(role?) {
  return JSON.stringify({ name: role.name, areas: role.areas, requests: role.requests, other: role.other });
}

function buildRole(role?, res?, designCaps?) {
  const scopeLabel = SCOPE_LABEL[role.scope] || SCOPE_LABEL.all;
  const areas: Record<string, any> = {};
  for (const a of res.areas) areas[a.id] = { value: role.levels[a.id] || 'none', scope: scopeLabel };
  const requests: Record<string, any> = {};
  for (const i of res.approvalItems) {
    if (!HIDDEN_APPROVALS.includes(i.id)) requests[i.id] = role.approvals.includes(i.id);
  }
  const other: Record<string, any> = {};
  for (const e of res.extras) if (e.design) other[e.cap] = role.extras.includes(e.cap);
  // Năng lực của vai trò mà ma trận không biểu diễn được (khu vực chỉ có một phần năng lực, việc lẻ ngoài thiết kế)
  // vẫn đi theo `extras` khi lưu để không mất quyền
  const covered = new Set<any>();
  for (const a of res.areas) {
    const level = role.levels[a.id];
    if (level !== 'none') a.view.forEach(c => covered.add(c));
    if (level === 'edit') a.edit.forEach(c => covered.add(c));
  }
  const residual = (role.caps || []).filter(
    c => !covered.has(c) && !designCaps.has(c) && !role.extras.includes(c) && !c.startsWith('request.decide.')
  );
  const built: Record<string, any> = {
    key: role.code,
    name: role.label,
    note: role.isDefault
      ? 'mặc định'
      : role.deprecated
        ? 'ngưng dùng'
        : role.users > 0
          ? `${role.users} tài khoản`
          : '',
    locked: !!role.readOnly,
    deprecated: !!role.deprecated,
    areas,
    requests,
    other,
    ver: { rev: role.rev },
    keep: {
      approve: role.approvals.filter(id => HIDDEN_APPROVALS.includes(id)),
      extras: [...role.extras.filter(c => !designCaps.has(c)), ...residual],
      scope: role.scope || 'all',
      scoped: res.areas.filter(a => a.scoped).map(a => a.id)
    }
  };
  built.sig = roleSignature(built);
  return built;
}

export function buildRoleMatrix(res?) {
  const groups: any[] = [];
  for (const area of res.areas) {
    const label = GROUP_LABEL[area.group] || area.group;
    let group = groups.find(g => g.group === label);
    if (!group) groups.push((group = { group: label, items: [] }));
    group.items.push({ key: area.id, name: area.label, levels: [...area.levels], scoped: !!area.scoped });
  }
  const designCaps = new Set<any>(res.extras.filter(e => e.design).map(e => e.cap));
  return {
    areas: groups,
    levelLabels: { ...LEVEL_LABEL },
    scopes: Object.values(SCOPE_LABEL),
    requests: res.approvalItems.filter(i => !HIDDEN_APPROVALS.includes(i.id)).map(i => ({ key: i.id, label: i.label })),
    other: res.extras.filter(e => e.design).map(e => ({ key: e.cap, label: e.label })),
    accounts: res.staff.length,
    limits: { ...res.limits },
    roles: res.roles.map(role => buildRole(role, res, designCaps))
  };
}

// Thân PUT /api/roles/:code: gửi đủ mức quyền, loại yêu cầu, việc khác và phạm vi cùng lúc
export function toRolePutBody(role?) {
  if (!role.ver || !Number.isInteger(role.ver.rev)) throw new Error(`Thiếu số phiên bản (rev) của vai trò ${role.key}`);
  const perms: Record<string, any> = {};
  for (const [id, area] of Object.entries<any>(role.areas)) perms[id] = LEVEL_TO_BE[area.value];
  const scopes = new Set<any>(role.keep.scoped.map(id => role.areas[id].scope));
  if (scopes.size > 1) throw new Error('Phạm vi của các khu trong một vai trò phải giống nhau');
  const scope = scopes.size ? SCOPE_CODE[[...scopes][0]] || role.keep.scope : role.keep.scope;
  return {
    rev: role.ver.rev,
    label: role.name,
    perms,
    approve: [...Object.keys(role.requests).filter(id => role.requests[id]), ...role.keep.approve],
    extras: [...role.keep.extras, ...Object.keys(role.other).filter(cap => role.other[cap])],
    scope
  };
}

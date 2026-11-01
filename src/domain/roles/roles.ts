'use strict';
const { AsyncList } = require('../../shared/async-list');
// Vai trò tuỳ chỉnh (Cài đặt › Phân quyền › Vai trò): vai trò là DỮ LIỆU ở bảng settings (khoá 'roles.custom'), không thêm bảng hay cột.
// Vai trò mặc định trong mã (src/platform/authz.ts → ROLE_CAPS) chỉ đọc; vai trò `admin` không sửa được. Vai trò tuỳ chỉnh chỉ chọn trong các năng lực đã có trong mã,
// trừ năng lực dành riêng cho Admin (authz.RESERVED_CAPS = roles.manage): không ai tự cấp quyền quản trị phân quyền cho mình qua vai trò tuỳ chỉnh.
//   describeAll()               danh sách vai trò (mặc định + tuỳ chỉnh) cho GET /api/roles
//   create / update / deprecate ghi trong MỘT giao dịch cùng dòng nhật ký (src/platform/audit.ts); khoá lạc quan theo `rev` của từng vai trò
// Phạm vi dữ liệu (all | team | self) là của CẢ vai trò như hệ thống năng lực hiện tại; chưa có phạm vi theo từng khu vực.
const crypto = require('node:crypto');
const store = require('../../platform/db');
const authz = require('../../platform/authz');
const audit = require('../../platform/audit');
const config = require('../../platform/config');
const events = require('../../platform/events');
const { HttpError } = require('../../platform/http');
const { nowIso } = require('../../platform/request-rules');

/* ---------- nhãn và khu vực của ma trận Không / Xem / Sửa ---------- */
const BUILTIN_LABELS = Object.freeze({
  admin: 'Admin',
  cb: 'C&B',
  accounting: 'Kế toán',
  hr: 'Nhân sự',
  manager: 'Quản lý',
  staff: 'Nhân viên'
});
// Mỗi khu vực: view = năng lực của mức "Xem", edit = năng lực THÊM của mức "Sửa" (Sửa gồm cả Xem). Khu vực không có năng lực xem riêng chỉ có Không / Sửa.
// Ba khu vực của Cài đặt dùng chung năng lực config.* (config.read, config.payroll) nên đổi một khu vực kéo theo khu vực cùng năng lực.
const AREAS = Object.freeze([
  {
    id: 'profile',
    group: 'main',
    label: 'Hồ sơ & hợp đồng',
    view: ['profile.read', 'contract.read'],
    edit: ['profile.write', 'contract.write'],
    scoped: true
  },
  {
    id: 'attendance',
    group: 'main',
    label: 'Chấm công & nghỉ phép',
    view: ['attendance.read'],
    edit: ['attendance.correct', 'attendance.import'],
    scoped: false
  },
  {
    id: 'pay',
    group: 'main',
    label: 'Lương & phụ cấp',
    view: ['salary.read', 'payroll.view'],
    edit: ['salary.write', 'payroll.calculate', 'payroll.override'],
    scoped: true
  },
  { id: 'kpi', group: 'main', label: 'KPI', view: [], edit: ['kpi.score.write'], scoped: false },
  { id: 'report', group: 'main', label: 'Báo cáo', view: ['report.read'], edit: ['report.export'], scoped: false },
  {
    id: 'settings_formula',
    group: 'settings',
    label: 'Công thức lương & quyền lợi',
    view: ['config.read'],
    edit: ['config.payroll'],
    scoped: false
  },
  {
    id: 'settings_tax',
    group: 'settings',
    label: 'Bảo hiểm & thuế',
    view: ['config.read'],
    edit: ['config.legal'],
    scoped: false
  },
  {
    id: 'settings_period',
    group: 'settings',
    label: 'Kỳ lương & chấm công',
    view: ['config.read'],
    edit: ['config.payroll'],
    scoped: false
  },
  {
    id: 'access',
    group: 'settings',
    label: 'Phân quyền & tài khoản',
    view: [],
    edit: ['staff.lock'],
    scoped: false
  }
]);
// Việc khác và các năng lực lẻ. `design`: luôn hiện trên màn; các năng lực còn lại giao diện hiện khi cần.
const EXTRAS = Object.freeze([
  { cap: 'attendance.lock', label: 'Chốt công', design: true },
  { cap: 'payroll.approve', label: 'Khoá kỳ lương', design: true },
  { cap: 'profile.sensitive.read', label: 'Xem số tài khoản ngân hàng, CCCD', design: true },
  { cap: 'profile.sensitive.write', label: 'Sửa số tài khoản ngân hàng, CCCD', design: false },
  { cap: 'profile.read.pii', label: 'Xem thông tin cá nhân nhạy cảm (ngày sinh)', design: false },
  { cap: 'payroll.pay', label: 'Đánh dấu đã trả lương', design: false },
  { cap: 'period.reopen', label: 'Mở lại kỳ lương', design: false },
  { cap: 'period.reopen.inputs', label: 'Mở lại dữ liệu đầu vào của kỳ lương', design: false },
  { cap: 'config.profile', label: 'Sửa cấu hình hồ sơ', design: false },
  { cap: 'audit.read', label: 'Xem nhật ký thay đổi', design: false }
]);
// Loại yêu cầu được duyệt, theo thứ tự trên màn hình
const APPROVAL_ITEMS = Object.freeze([
  { id: 'leave', label: 'Nghỉ phép năm' },
  { id: 'isat', label: 'iSAT' },
  { id: 'approved', label: 'Nghỉ được duyệt' },
  { id: 'ot', label: 'Làm thêm giờ' },
  { id: 'makeup_hours', label: 'Làm bù theo giờ' },
  { id: 'holiday_work', label: 'OT ngày lễ' },
  { id: 'willmakeup', label: 'Nghỉ, sẽ làm bù' }
]);
const ITEM_IDS = APPROVAL_ITEMS.map(i => i.id);
// Loại yêu cầu không còn dùng: vai trò đã lưu có thể còn mang, đầu vào có thì bỏ qua (không báo lỗi, không lưu)
const RETIRED_ITEMS = Object.freeze(['makeup_day']);
const LEVEL_RANK = { none: 0, view: 1, edit: 2 };

const ROLE_CODE_RE = new RegExp(`^[a-z][a-z_]{1,${config.ROLE_CODE_MAX - 1}}$`);
const HAS_MARKUP = /[<>]/;
const sizeOf = (text?) => [...text].length;
const isObj = (v?) => !!v && typeof v === 'object' && !Array.isArray(v);
const bad = (message?, code?) => new HttpError(400, message, { code });
const echo = (value?) => String(value).slice(0, config.ERROR_ECHO_CODE_MAX);

/* ---------- đọc ---------- */
// Cờ của khu vực theo tập năng lực: 'edit' khi có đủ năng lực Sửa, 'view' khi đủ năng lực Xem, còn lại 'none'
function levelOf(area?, capSet?) {
  if (area.edit.every(c => capSet.has(c)) && (area.edit.length || area.view.length)) return 'edit';
  if (area.view.length && area.view.every(c => capSet.has(c))) return 'view';
  return 'none';
}
const levelsOf = (caps?) => {
  const set = new Set<any>(caps);
  return Object.fromEntries(AREAS.map(a => [a.id, levelOf(a, set)]));
};
// Loại yêu cầu được duyệt suy từ năng lực (request.decide.* = mọi loại)
function approvalsOf(caps?) {
  if (caps.includes(authz.DECIDE_ALL)) return [...ITEM_IDS];
  return ITEM_IDS.filter(item => caps.includes(authz.DECIDE_PREFIX + item));
}
const knownRoleSet = async () =>
  new Set<any>([...Object.keys(authz.ROLE_CAPS), ...(await authz.customTable()).roles.map(r => r.code)]);
// Vai trò của một tài khoản: đã gán (staff_roles) + admin cũ (staff.role) + staff mặc định của nhân sự được trả lương; chỉ tên vai trò đã biết
// (gồm vai trò tuỳ chỉnh đã ngưng dùng, để Admin còn thấy và gỡ được)
const rolesOfStaff = async (s?, givenKnown?) => {
  const known = givenKnown === undefined ? await knownRoleSet() : givenKnown;
  return [
    ...new Set<any>([
      ...(await store.roles.activeRoles(s.username)),
      ...(s.role === 'admin' ? ['admin'] : []),
      ...(s.payrollSubject ? ['staff'] : [])
    ])
  ]
    .filter(r => known.has(r))
    .sort();
};
// Vai trò staff = nhân sự được trả lương: MỘT thứ, không hai. Đổi cờ payrollSubject theo việc có staff hay không, kèm một dòng nhật ký
// staff.payrollSubject (mức pay) do người gọi truyền vào. Trả true khi cờ đổi.
async function syncPayroll(actx?, username?, wantsStaff?, current?) {
  if (!!current === !!wantsStaff) return false;
  await store.setPayrollSubject(username, wantsStaff);
  await audit.write(actx, {
    action: 'staff.payrollSubject',
    entityKind: 'staff',
    entityId: username,
    subject: username,
    before: { payrollSubject: !!current },
    after: { payrollSubject: !!wantsStaff },
    sensitivity: 'pay'
  });
  return true;
}
// Sửa một lần các tài khoản đã được gán vai trò staff (dòng staff_roles còn hiệu lực) nhưng payrollSubject false (dữ liệu chỉ có dòng vai trò):
// bật payrollSubject để Check-in và bảng lương nhất quán. Chạy khi nạp máy chủ; không có dòng nào lệch thì không làm gì. Trả số tài khoản đã sửa.
async function reconcileStaffRole() {
  const ctx = { actor: 'system', actorRoles: [] as any[], requestId: crypto.randomUUID() };
  let fixed = 0;
  for (const s of await store.listStaff())
    if (!s.payrollSubject && (await store.roles.activeRoles(s.username)).includes('staff'))
      await store.transaction(async () => {
        if (await syncPayroll(ctx, s.username, true, false)) fixed++;
      });
  return fixed;
}
// Số phiên bản vai trò của một người = số dòng gán + số dòng đã thu hồi (đổi gì cũng tăng); dùng cho expectedRev
const rolesRevOf = (rows?) => rows.length + rows.filter(r => r.revokedAt).length;

// Tên gọi ngắn của mức khu vực trong hợp đồng giao diện: khong | xem | sua
const PERM_NAME = { none: 'khong', view: 'xem', edit: 'sua' };
const PERM_LEVEL = { khong: 'none', xem: 'view', sua: 'edit' };
const permsOf = (levels?) =>
  Object.fromEntries(Object.entries<any>(levels).map(([id, level]: any) => [id, PERM_NAME[level]]));
const extrasOf = (caps?) => EXTRAS.map(e => e.cap).filter(cap => caps.includes(cap));
// Trường gọi lại bằng tên khác cho giao diện: system (mặc định trong mã), active, editable, perms, approve, extras
const aliasesOf = (role?, caps?) => ({
  system: role.builtin,
  active: !role.deprecated,
  editable: role.custom && !role.deprecated,
  perms: permsOf(role.levels),
  approve: role.approvals,
  extras: extrasOf(caps)
});

function describeBuiltin(code?, users?) {
  const caps = [...authz.ROLE_CAPS[code]];
  const role: Record<string, any> = {
    id: code,
    code,
    label: BUILTIN_LABELS[code],
    builtin: true,
    custom: false,
    readOnly: true,
    isDefault: code === 'staff',
    deprecated: false,
    copiedFrom: null,
    caps,
    approvals: approvalsOf(caps),
    scope: authz.ROLE_SCOPE[code] || null,
    levels: levelsOf(caps),
    rev: 0,
    users: users.get(code) || 0
  };
  return { ...role, ...aliasesOf(role, caps) };
}
function describeCustom(def?, users?) {
  const caps = [...authz.customCapsOf(def)];
  const role = {
    id: def.code,
    code: def.code,
    label: def.label,
    builtin: false,
    custom: true,
    readOnly: !!def.deprecated,
    isDefault: false,
    deprecated: !!def.deprecated,
    copiedFrom: def.copiedFrom || null,
    caps: def.deprecated ? [] : caps,
    approvals: def.deprecated ? [] : approvalsOf(caps),
    // Với vai trò đã ngưng dùng, `storedCaps` cho biết trước khi ngưng vai trò có gì (chỉ xem)
    ...(def.deprecated ? { storedCaps: caps, deprecatedAt: def.deprecatedAt || null } : {}),
    scope: authz.SCOPES.includes(def.scope) ? def.scope : 'all',
    levels: levelsOf(def.deprecated ? [] : caps),
    rev: Number.isInteger(def.rev) ? def.rev : 1,
    users: users.get(def.code) || 0,
    createdAt: def.createdAt || null,
    updatedAt: def.updatedAt || null
  };
  return { ...role, ...aliasesOf(role, role.caps) };
}
// Số tài khoản (chưa khoá) đang giữ từng vai trò
async function holderCounts(staffList?, known?) {
  const counts = new Map<any, any>();
  for (const s of staffList) {
    if (s.locked) continue;
    for (const role of await rolesOfStaff(s, known)) counts.set(role, (counts.get(role) || 0) + 1);
  }
  return counts;
}
async function describeAll() {
  const table = await authz.customTable();
  const staffList = await store.listStaff();
  const known = new Set<any>([...Object.keys(authz.ROLE_CAPS), ...table.roles.map(r => r.code)]);
  const users = await holderCounts(staffList, known);
  const byUser = new Map<any, any>();
  for (const row of await store.roles.list({ includeRevoked: true })) {
    if (!byUser.has(row.username)) byUser.set(row.username, []);
    byUser.get(row.username).push(row);
  }
  return {
    roles: [
      ...Object.keys(authz.ROLE_CAPS).map(code => describeBuiltin(code, users)),
      ...table.roles.map(def => describeCustom(def, users))
    ],
    rev: table.rev,
    caps: [...authz.CAPS, authz.DECIDE_ALL],
    reservedCaps: [...authz.RESERVED_CAPS],
    areas: AREAS.map(a => ({
      ...a,
      view: [...a.view],
      edit: [...a.edit],
      levels: a.view.length ? ['none', 'view', 'edit'] : ['none', 'edit']
    })),
    extras: EXTRAS.map(e => ({ ...e })),
    approvalItems: APPROVAL_ITEMS.map(i => ({ ...i })),
    scopes: [...authz.SCOPES],
    limits: { labelMax: config.ROLE_LABEL_MAX, codeMax: config.ROLE_CODE_MAX, customMax: config.ROLES_CUSTOM_MAX },
    staff: await AsyncList.map(staffList, async s => ({
      username: s.username,
      name: s.name,
      roles: await rolesOfStaff(s, known),
      rev: rolesRevOf(byUser.get(s.username) || []),
      locked: !!s.locked
    }))
  };
}

/* ---------- kiểm đầu vào ---------- */
// Lý do không bắt buộc; có gửi thì chỉ kiểm tối đa.
function parseReason(value?) {
  if (value === undefined || value === null || value === '') return null;
  const reason = typeof value === 'string' ? value.trim() : '';
  if (reason.length > config.REASON_MAX) throw bad(`Lý do tối đa ${config.REASON_MAX} ký tự`, 'REASON_REQUIRED');
  return reason || null;
}
function parseLabel(value?) {
  const label = typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : '';
  if (!label || sizeOf(label) > config.ROLE_LABEL_MAX)
    throw bad(`Tên vai trò phải từ 1 đến ${config.ROLE_LABEL_MAX} ký tự`, 'ROLE_LABEL_INVALID');
  if (HAS_MARKUP.test(label)) throw bad('Tên vai trò không được chứa ký tự < hoặc >', 'ROLE_LABEL_INVALID');
  return label;
}
function parseScope(value?) {
  if (!authz.SCOPES.includes(value))
    throw bad(`Phạm vi phải là một trong: ${authz.SCOPES.join(', ')}`, 'ROLE_SCOPE_INVALID');
  return value;
}
// Năng lực: mảng tên; request.decide.<loại> và request.decide.* đi vào approvals. Trả { caps, approvals } đã sắp, không trùng.
function parseCaps(capsInput?, approvalsInput?) {
  const caps = new Set<any>(),
    approvals = new Set<any>();
  if (capsInput !== undefined) {
    if (!Array.isArray(capsInput) || capsInput.some(c => typeof c !== 'string'))
      throw bad('caps phải là mảng tên năng lực', 'ROLE_CAPS_INVALID');
    for (const cap of capsInput) {
      if (cap === authz.DECIDE_ALL) ITEM_IDS.forEach(i => approvals.add(i));
      else if (cap.startsWith(authz.DECIDE_PREFIX)) {
        const item = cap.slice(authz.DECIDE_PREFIX.length);
        if (RETIRED_ITEMS.includes(item)) continue;
        if (!ITEM_IDS.includes(item))
          throw bad(`Loại yêu cầu "${echo(item)}" không có để duyệt`, 'ROLE_APPROVAL_UNKNOWN');
        approvals.add(item);
      } else if (authz.RESERVED_CAPS.includes(cap))
        throw bad(`Năng lực ${cap} chỉ dành cho Admin, không đưa vào vai trò tuỳ chỉnh được`, 'ROLE_CAP_RESERVED');
      else if (!authz.CAPS.includes(cap)) throw bad(`Không có năng lực "${echo(cap)}"`, 'ROLE_CAP_UNKNOWN');
      else caps.add(cap);
    }
  }
  if (approvalsInput !== undefined) {
    const wanted = Array.isArray(approvalsInput) ? approvalsInput.filter(i => !RETIRED_ITEMS.includes(i)) : null;
    if (!wanted || wanted.some(i => !ITEM_IDS.includes(i)))
      throw bad(`approvals phải là mảng loại yêu cầu trong: ${ITEM_IDS.join(', ')}`, 'ROLE_APPROVAL_UNKNOWN');
    approvals.clear(); // `approvals` gửi riêng thì thay hẳn các loại suy từ caps
    wanted.forEach(i => approvals.add(i));
  }
  return { caps: [...caps].sort(), approvals: ITEM_IDS.filter(i => approvals.has(i)) };
}
// Mức theo khu vực → năng lực: { areaId: 'none'|'view'|'edit' } cộng extras (mảng tên năng lực lẻ)
function capsFromLevels(levels?, extras?) {
  if (!isObj(levels)) throw bad('levels phải là đối tượng { khu vực: none | view | edit }', 'ROLE_LEVELS_INVALID');
  const caps: any[] = [];
  for (const [id, level] of Object.entries<any>(levels)) {
    const area = AREAS.find(a => a.id === id);
    if (!area) throw bad(`Không có khu vực "${echo(id)}"`, 'ROLE_LEVELS_INVALID');
    if (!Object.hasOwn(LEVEL_RANK, level) || (level === 'view' && !area.view.length))
      throw bad(`Khu vực ${area.label} không có mức "${echo(level)}"`, 'ROLE_LEVELS_INVALID');
    if (level !== 'none') caps.push(...area.view);
    if (level === 'edit') caps.push(...area.edit);
  }
  if (extras !== undefined && (!Array.isArray(extras) || extras.some(c => typeof c !== 'string')))
    throw bad('extras phải là mảng tên năng lực', 'ROLE_CAPS_INVALID');
  return [...caps, ...(extras || [])];
}
// Từ thân yêu cầu lấy { caps, approvals } nếu có gửi (caps hoặc levels); undefined nếu không đụng tới năng lực
function capsFromBody(input?) {
  // Tên gọi của giao diện: perms { khu vực: khong | xem | sua } = levels; approve = approvals
  const b: Record<string, any> = { ...input };
  if (b.perms !== undefined && b.levels === undefined) {
    if (!isObj(b.perms)) throw bad('perms phải là đối tượng { khu vực: khong | xem | sua }', 'ROLE_LEVELS_INVALID');
    b.levels = Object.fromEntries(
      Object.entries<any>(b.perms).map(([id, v]: any) => {
        if (!Object.hasOwn(PERM_LEVEL, v))
          throw bad(`Mức "${echo(v)}" không có; chọn khong, xem hoặc sua`, 'ROLE_LEVELS_INVALID');
        return [id, PERM_LEVEL[v]];
      })
    );
  }
  if (b.approve !== undefined && b.approvals === undefined) b.approvals = b.approve;
  if (b.levels !== undefined && b.caps !== undefined)
    throw bad('Chỉ gửi một trong hai: caps hoặc levels', 'ROLE_CAPS_INVALID');
  if (b.levels !== undefined) return parseCaps(capsFromLevels(b.levels, b.extras), b.approvals);
  if (b.caps !== undefined || b.approvals !== undefined) return parseCaps(b.caps, b.approvals);
  return undefined;
}
// Mã vai trò từ tên: chữ thường không dấu, chữ cách thành gạch dưới; null nếu quá ngắn
function codeFromLabel(label?) {
  const base = label
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/gi, 'd')
    .toLowerCase()
    .replace(/[^a-z]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, config.ROLE_CODE_MAX)
    .replace(/_+$/g, '');
  return ROLE_CODE_RE.test(base) ? base : null;
}
const isReserved = (code?) => code in Object.prototype;
const snapshot = (def?) => ({
  label: def.label,
  caps: [...def.caps],
  approvals: [...def.approvals],
  scope: def.scope,
  deprecated: !!def.deprecated
});
const labelKey = (label?) => label.toLocaleLowerCase('vi');
function assertLabelFree(label?, table?, exceptCode?) {
  const taken =
    Object.values<any>(BUILTIN_LABELS).some(l => labelKey(l) === labelKey(label)) ||
    table.roles.some(r => r.code !== exceptCode && labelKey(r.label) === labelKey(label));
  if (taken) throw new HttpError(409, `Đã có vai trò tên "${label}", hãy chọn tên khác`, { code: 'ROLE_LABEL_CLASH' });
}
const holdersOf = async (code?) => [...new Set<any>((await store.roles.list({ role: code })).map(r => r.username))];
const emitHolders = (usernames?) => usernames.forEach(u => events.emit.rolesChanged(u));
const found = (table?, code?) => table.roles.find(r => r.code === code) || null;
function findEditable(table?, code?) {
  if (authz.isBuiltinRole(code))
    throw new HttpError(
      403,
      `Vai trò ${BUILTIN_LABELS[code]} là vai trò mặc định, chỉ đọc; hãy sao chép thành vai trò mới`,
      {
        code: 'ROLE_BUILTIN_READONLY'
      }
    );
  const def = found(table, code);
  if (!def) throw new HttpError(404, 'Không có vai trò này', { code: 'ROLE_NOT_FOUND' });
  return def;
}
// rev (khoá lạc quan) BẮT BUỘC: thiếu hoặc sai kiểu là 400 ROLE_REV_REQUIRED, lệch là 409 ROLE_STALE (không bao giờ ghi đè người khác không biết)
function checkRev(def?, rev?) {
  if (!Number.isInteger(rev))
    throw bad(
      'rev phải là số nguyên (số phiên bản vai trò bạn đang xem; tải lại danh sách vai trò)',
      'ROLE_REV_REQUIRED'
    );
  if (rev !== def.rev)
    throw new HttpError(409, 'Vai trò này vừa được người khác đổi, tải lại rồi làm lại', {
      code: 'ROLE_STALE',
      rev: def.rev
    });
}
const save = async (table?) =>
  await store.setSetting(authz.CUSTOM_ROLES_KEY, { rev: table.rev + 1, roles: table.roles });

/* ---------- ghi ---------- */
async function create(me?, actx?, body?) {
  const b = isObj(body) ? body : {};
  const reason = parseReason(b.reason);
  const outcome = await store.transaction(async () => {
    const table = await authz.customTable();
    if (table.roles.length >= config.ROLES_CUSTOM_MAX)
      throw new HttpError(409, `Chỉ tạo được tối đa ${config.ROLES_CUSTOM_MAX} vai trò tuỳ chỉnh`, {
        code: 'ROLE_LIMIT'
      });
    // nguồn sao chép: vai trò mặc định hoặc tuỳ chỉnh (kể cả đã ngưng dùng)
    let source: any = null;
    if (b.copyFrom !== undefined && b.copyFrom !== null) {
      if (typeof b.copyFrom !== 'string') throw bad('copyFrom phải là mã vai trò', 'ROLE_COPY_UNKNOWN');
      if (authz.isBuiltinRole(b.copyFrom)) {
        const caps = [...authz.ROLE_CAPS[b.copyFrom]];
        source = {
          label: BUILTIN_LABELS[b.copyFrom],
          caps: caps.filter(c => authz.isGrantableCap(c)),
          approvals: approvalsOf(caps),
          scope: authz.ROLE_SCOPE[b.copyFrom]
        };
      } else {
        const def = found(table, b.copyFrom);
        if (!def) throw new HttpError(404, 'Vai trò nguồn không tồn tại', { code: 'ROLE_COPY_UNKNOWN' });
        source = { label: def.label, caps: [...def.caps], approvals: [...def.approvals], scope: def.scope };
      }
    }
    const label = parseLabel(b.label === undefined && source ? `${source.label} (bản sao)` : b.label);
    assertLabelFree(label, table, null);
    let code;
    if (b.code !== undefined && b.code !== null) {
      code = typeof b.code === 'string' ? b.code.trim() : '';
      if (!ROLE_CODE_RE.test(code) || isReserved(code))
        throw bad(
          `Mã vai trò chỉ gồm chữ thường không dấu và dấu gạch dưới, bắt đầu bằng chữ, từ 2 đến ${config.ROLE_CODE_MAX} ký tự`,
          'ROLE_CODE_INVALID'
        );
    } else {
      code = codeFromLabel(label);
      if (!code || isReserved(code))
        throw bad('Không tạo được mã từ tên này; hãy đặt tên có chữ cái hoặc gửi kèm mã', 'ROLE_CODE_INVALID');
    }
    if (authz.isBuiltinRole(code) || found(table, code))
      throw new HttpError(409, `Mã vai trò "${code}" đã có`, { code: 'ROLE_CODE_CLASH' });
    const given = capsFromBody(b);
    const now = nowIso();
    const def: Record<string, any> = {
      code,
      label,
      caps: given ? given.caps : source ? source.caps.filter(c => !c.startsWith(authz.DECIDE_PREFIX)) : [],
      approvals: given ? given.approvals : source ? source.approvals : [],
      scope: b.scope !== undefined ? parseScope(b.scope) : source ? source.scope : 'all',
      rev: 1,
      deprecated: false,
      copiedFrom: b.copyFrom || null,
      createdBy: me.username,
      createdAt: now,
      updatedAt: now
    };
    // Tập năng lực chuẩn hoá một lần nữa (nguồn sao chép là dữ liệu đã lưu)
    def.caps = [...authz.customCapsOf({ caps: def.caps, approvals: [] })];
    table.roles.push(def);
    await save(table);
    await audit.write(actx, {
      action: 'role.create',
      entityKind: 'role',
      entityId: code,
      before: null,
      after: { ...snapshot(def), copiedFrom: def.copiedFrom },
      reason
    });
    return { code, rev: table.rev + 1 };
  });
  const view = await describeAll();
  return { role: view.roles.find(r => r.code === outcome.code), rev: outcome.rev };
}

async function update(me?, actx?, code?, body?) {
  const b = isObj(body) ? body : {};
  // active: false ngưng dùng (như POST /roles/:code/deprecate); vai trò đã ngưng không bật lại được
  if (b.active === false) return await deprecate(me, actx, code, b);
  const reason = parseReason(b.reason);
  let notify: any[] = [];
  const outcome = await store.transaction(async () => {
    const table = await authz.customTable();
    const def = findEditable(table, code);
    checkRev(def, b.rev);
    if (def.deprecated)
      throw new HttpError(409, 'Vai trò đã ngưng dùng, không sửa hay bật lại được; hãy sao chép thành vai trò mới', {
        code: 'ROLE_DEPRECATED'
      });
    const before = snapshot(def);
    if (b.label !== undefined) {
      const label = parseLabel(b.label);
      assertLabelFree(label, table, code);
      def.label = label;
    }
    const given = capsFromBody(b);
    if (given) {
      // Không tự nâng quyền: người đang giữ vai trò này không được thêm năng lực vào chính nó
      const mine = new Set<any>(await authz.rolesOf(me));
      const added = [
        ...given.caps.filter(c => !def.caps.includes(c)),
        ...given.approvals.filter(i => !def.approvals.includes(i))
      ];
      if (mine.has(code) && added.length)
        throw new HttpError(403, 'Không thể tự thêm quyền cho vai trò mình đang giữ', { code: 'ROLE_SELF_ESCALATION' });
      def.caps = given.caps;
      def.approvals = given.approvals;
    }
    if (b.scope !== undefined) def.scope = parseScope(b.scope);
    const after = snapshot(def);
    if (JSON.stringify(before) === JSON.stringify(after)) return { code, rev: table.rev, changed: false };
    def.rev += 1;
    def.updatedAt = nowIso();
    await save(table);
    await audit.write(actx, {
      action: 'role.update',
      entityKind: 'role',
      entityId: code,
      before,
      after,
      reason
    });
    notify = await holdersOf(code);
    return { code, rev: table.rev + 1, changed: true };
  });
  emitHolders(notify);
  const view = await describeAll();
  return { role: view.roles.find(r => r.code === outcome.code), rev: outcome.rev, changed: outcome.changed };
}

// Ngưng dùng (không xoá): người đang giữ vai trò mất các năng lực đó ngay; dòng gán vẫn còn để Admin thấy và gỡ
async function deprecate(me?, actx?, code?, body?) {
  const b = isObj(body) ? body : {};
  const reason = parseReason(b.reason);
  let holders: any[] = [];
  const outcome = await store.transaction(async () => {
    const table = await authz.customTable();
    const def = findEditable(table, code);
    checkRev(def, b.rev);
    if (def.deprecated) throw new HttpError(409, 'Vai trò này đã ngưng dùng', { code: 'ROLE_DEPRECATED' });
    const before = snapshot(def);
    def.deprecated = true;
    def.deprecatedAt = nowIso();
    def.rev += 1;
    def.updatedAt = def.deprecatedAt;
    await save(table);
    await audit.write(actx, {
      action: 'role.deprecate',
      entityKind: 'role',
      entityId: code,
      before,
      after: snapshot(def),
      reason
    });
    holders = await holdersOf(code);
    return { code, rev: table.rev + 1 };
  });
  emitHolders(holders);
  const view = await describeAll();
  return { role: view.roles.find(r => r.code === outcome.code), rev: outcome.rev, holders: holders.length };
}

export = {
  BUILTIN_LABELS,
  AREAS,
  EXTRAS,
  APPROVAL_ITEMS,
  knownRoleSet,
  rolesOfStaff,
  rolesRevOf,
  syncPayroll,
  reconcileStaffRole,
  describeAll,
  codeFromLabel,
  levelsOf,
  create,
  update,
  deprecate
};

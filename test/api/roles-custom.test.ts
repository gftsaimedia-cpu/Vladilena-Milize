'use strict';
// Vai trò tuỳ chỉnh (src/domain/roles/roles.ts, src/domain/roles.js, src/platform/authz.ts):
//   GET /api/roles, POST /api/roles, PUT /api/roles/:code, POST /api/roles/:code/deprecate; gán qua PUT /api/staff/:u/roles
// Vai trò mặc định chỉ đọc; roles.manage chỉ của Admin; vai trò ngưng dùng mất năng lực ngay. Chỉ người bịa (qa_*).
const F = require('../helpers/api-fixture');
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const authz = require('../../src/platform/authz');
const config = require('../../src/platform/config');

const { store } = F;
const REASON = 'Phân quyền theo quyết định tháng này';

before(async () => {
  await F.start();
  await F.at('2026-11-02T09:00:00');
  await F.person('admin', 'admin', { type: 'tts', level: 0, shiftCode: null, startDate: null });
  await F.person('qa_plain', 'staff');
});
after(F.stop);

const make = async (body?, who = 'admin') => await F.call('POST', '/roles', { who, body });
const edit = async (code?, body?, who = 'admin') => await F.call('PUT', `/roles/${code}`, { who, body });
const stop = async (code?, body?, who = 'admin') => await F.call('POST', `/roles/${code}/deprecate`, { who, body });
const assign = async (username?, roles?, who = 'admin') =>
  await F.call('PUT', `/staff/${username}/roles`, { who, body: { roles, reason: REASON } });
const roleOf = async (code?) => (await F.call('GET', '/roles')).data.roles.find(r => r.code === code);
const auditOf = async (action?) =>
  await store.db.prepare('SELECT * FROM audit_log WHERE action = ? ORDER BY id').all(action);
const staff = async (name?) => await F.person(name, 'staff', { type: 'nv', level: 1, startDate: '2026-01-05' });

test('GET /api/roles: vai trò mặc định chỉ đọc có nhãn, khu vực của ma trận và loại yêu cầu; nhân sự 403, chưa đăng nhập 401', async () => {
  const res = await F.call('GET', '/roles');
  assert.equal(res.status, 200, JSON.stringify(res.data).slice(0, 200));
  const byCode = Object.fromEntries(res.data.roles.map(r => [r.code, r]));
  assert.deepEqual(Object.keys(byCode).sort(), Object.keys(authz.ROLE_CAPS).sort());
  assert.equal(byCode.accounting.label, 'Kế toán');
  assert.equal(byCode.accounting.builtin, true);
  assert.equal(byCode.accounting.readOnly, true);
  assert.equal(byCode.staff.isDefault, true);
  assert.equal(byCode.admin.levels.access, 'edit');
  assert.equal(byCode.accounting.levels.settings_tax, 'edit');
});

test('GET /api/roles: hợp đồng JSON đầy đủ cho màn Phân quyền', async () => {
  const { data } = await F.call('GET', '/roles');
  for (const key of [
    'roles',
    'rev',
    'caps',
    'reservedCaps',
    'areas',
    'extras',
    'approvalItems',
    'scopes',
    'limits',
    'staff'
  ])
    assert.ok(Object.hasOwn(data, key), `thiếu ${key}`);
  assert.deepEqual(data.reservedCaps, ['roles.manage']);
  assert.deepEqual(
    data.approvalItems.map(i => i.id),
    ['leave', 'isat', 'approved', 'ot', 'makeup_hours', 'holiday_work', 'willmakeup']
  );
  const kpi = data.areas.find(a => a.id === 'kpi');
  assert.deepEqual(kpi.levels, ['none', 'edit']);
  assert.deepEqual(data.areas.find(a => a.id === 'profile').levels, ['none', 'view', 'edit']);
  assert.deepEqual(data.limits, {
    labelMax: config.ROLE_LABEL_MAX,
    codeMax: config.ROLE_CODE_MAX,
    customMax: config.ROLES_CUSTOM_MAX
  });
  for (const r of data.roles)
    assert.ok(
      [
        'id',
        'code',
        'label',
        'builtin',
        'custom',
        'readOnly',
        'deprecated',
        'caps',
        'approvals',
        'scope',
        'levels',
        'rev',
        'users'
      ].every(k => Object.hasOwn(r, k)),
      r.code
    );
  assert.equal((await F.call('GET', '/roles', { who: 'qa_plain' })).status, 403);
  assert.equal((await F.call('GET', '/roles', { who: null })).status, 401);
});

test('POST /api/roles: tạo vai trò theo mức khu vực, mã từ tên, nhật ký role.create, nhân sự không tạo được', async () => {
  const res = await make({ label: 'Trợ lý chấm công', levels: { attendance: 'edit', report: 'view' }, reason: REASON });
  assert.equal(res.status, 200, JSON.stringify(res.data));
  const role = res.data.role;
  assert.equal(role.code, 'tro_ly_cham_cong');
  assert.equal(role.custom, true);
  assert.equal(role.readOnly, false);
  assert.equal(role.rev, 1);
  assert.equal(role.levels.attendance, 'edit');
  assert.equal(role.levels.report, 'view');
  assert.deepEqual(role.caps, ['attendance.correct', 'attendance.import', 'attendance.read', 'report.read']);
  assert.equal(role.scope, 'all');
  const rows = (await auditOf('role.create')).filter(r => r.entity_id === 'tro_ly_cham_cong');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].reason, REASON);
  assert.equal((await make({ label: 'Thử nhân sự' }, 'qa_plain')).status, 403);
});

test('vai trò tuỳ chỉnh có hiệu lực: người được gán vào được route theo năng lực, ra khỏi vai trò thì 403', async () => {
  await staff('qa_tro_ly');
  assert.equal((await F.call('GET', '/ot', { who: 'qa_tro_ly' })).status, 403, 'trước khi gán');
  const granted = await assign('qa_tro_ly', ['staff', 'tro_ly_cham_cong']);
  assert.equal(granted.status, 200, JSON.stringify(granted.data));
  assert.deepEqual(granted.data.roles, ['staff', 'tro_ly_cham_cong']);
  assert.notEqual((await F.call('GET', '/ot', { who: 'qa_tro_ly' })).status, 403, 'đã có attendance.correct');
  const me = await F.call('GET', '/me', { who: 'qa_tro_ly' });
  assert.ok(me.data.roles.includes('tro_ly_cham_cong'));
  assert.ok(me.data.caps.includes('attendance.correct'));
  assert.equal((await F.call('GET', '/roles', { who: 'qa_tro_ly' })).status, 403, 'không có roles.manage');
  assert.equal((await assign('qa_tro_ly', ['staff'])).status, 200);
  assert.equal((await F.call('GET', '/ot', { who: 'qa_tro_ly' })).status, 403, 'sau khi gỡ');
});

test('an toàn: roles.manage và năng lực lạ bị từ chối khi tạo hoặc sửa vai trò tuỳ chỉnh', async () => {
  const before = await store.getSetting(authz.CUSTOM_ROLES_KEY, null);
  const reserved = await make({ label: 'Tự cấp quyền', caps: ['roles.manage'] });
  assert.equal(reserved.status, 400);
  assert.equal(reserved.data.code, 'ROLE_CAP_RESERVED');
  const viaLevel = await make({ label: 'Tự cấp quyền hai', levels: { access: 'edit' }, extras: ['roles.manage'] });
  assert.equal(viaLevel.data.code, 'ROLE_CAP_RESERVED');
  assert.equal((await make({ label: 'Lạ', caps: ['khong.co.nang.luc'] })).data.code, 'ROLE_CAP_UNKNOWN');
  assert.equal((await make({ label: 'Lạ hai', caps: ['request.decide.khong_co'] })).data.code, 'ROLE_APPROVAL_UNKNOWN');
  assert.equal((await make({ label: 'Lạ ba', approvals: ['ot', 'abc'] })).data.code, 'ROLE_APPROVAL_UNKNOWN');
  assert.equal((await make({ label: 'Lạ bốn', levels: { khu_vuc_la: 'edit' } })).data.code, 'ROLE_LEVELS_INVALID');
  assert.equal((await make({ label: 'Lạ năm', levels: { kpi: 'view' } })).data.code, 'ROLE_LEVELS_INVALID');
  assert.equal((await make({ label: 'Lạ sáu', scope: 'moi_nguoi' })).data.code, 'ROLE_SCOPE_INVALID');
  assert.deepEqual(await store.getSetting(authz.CUSTOM_ROLES_KEY, null), before, 'không lưu gì');
  const upd = await edit('tro_ly_cham_cong', { rev: 1, caps: ['roles.manage'], reason: REASON });
  assert.equal(upd.data.code, 'ROLE_CAP_RESERVED');
});

test('an toàn: dữ liệu vai trò bị sửa tay chứa roles.manage vẫn không cho quyền quản trị phân quyền', async () => {
  const saved = await store.getSetting(authz.CUSTOM_ROLES_KEY, null);
  await store.setSetting(authz.CUSTOM_ROLES_KEY, {
    rev: saved.rev + 1,
    roles: [
      ...saved.roles,
      {
        code: 'qa_sua_tay',
        label: 'Sửa tay',
        caps: ['roles.manage', 'report.read'],
        approvals: [],
        scope: 'all',
        rev: 1
      }
    ]
  });
  await staff('qa_sua_tay_nguoi');
  await store.roles.grant('qa_sua_tay_nguoi', 'qa_sua_tay', 'admin');
  const me = await store.getStaff('qa_sua_tay_nguoi');
  assert.equal(await authz.can(me, 'roles.manage'), false);
  assert.equal(await authz.can(me, 'report.read'), true);
  assert.equal((await F.call('GET', '/roles', { who: 'qa_sua_tay_nguoi' })).status, 403);
});

test('POST /api/roles: tên và mã không trùng vai trò mặc định hay vai trò khác; tên rỗng hoặc có < > bị từ chối; lý do quá 300 ký tự bị từ chối', async () => {
  assert.equal((await make({ label: 'Kế toán' })).data.code, 'ROLE_LABEL_CLASH');
  assert.equal((await make({ label: 'trợ lý chấm công' })).data.code, 'ROLE_LABEL_CLASH');
  assert.equal((await make({ label: 'Mã trùng', code: 'admin' })).data.code, 'ROLE_CODE_CLASH');
  assert.equal((await make({ label: 'Mã trùng hai', code: 'tro_ly_cham_cong' })).data.code, 'ROLE_CODE_CLASH');
  assert.equal((await make({ label: 'Mã lạ', code: 'Mã Có Dấu' })).data.code, 'ROLE_CODE_INVALID');
  assert.equal((await make({ label: 'Mã nguyên mẫu', code: 'constructor' })).data.code, 'ROLE_CODE_INVALID');
  assert.equal((await make({ label: '   ' })).data.code, 'ROLE_LABEL_INVALID');
  assert.equal((await make({ label: '<b>x</b>' })).data.code, 'ROLE_LABEL_INVALID');
  assert.equal((await make({ label: 'Tên quá dài '.repeat(10) })).data.code, 'ROLE_LABEL_INVALID');
  assert.equal((await make({ label: '1234' })).data.code, 'ROLE_CODE_INVALID');
  assert.equal((await make({ label: 'Có lý do dài', reason: 'x'.repeat(301) })).data.code, 'REASON_REQUIRED');
});

test('POST /api/roles: sao chép từ vai trò mặc định giữ năng lực và loại duyệt, bỏ roles.manage khi sao chép Admin', async () => {
  const copy = await make({ copyFrom: 'accounting', label: 'Kế toán phụ' });
  assert.equal(copy.status, 200, JSON.stringify(copy.data));
  assert.equal(copy.data.role.copiedFrom, 'accounting');
  assert.deepEqual(copy.data.role.caps, [...authz.ROLE_CAPS.accounting].sort());
  const noLabel = await make({ copyFrom: 'hr' });
  assert.equal(noLabel.data.role.label, 'Nhân sự (bản sao)');
  assert.deepEqual(
    noLabel.data.role.approvals,
    ['leave'],
    'chỉ giữ loại yêu cầu có thật; attendance_adjust không phải loại'
  );
  const adminCopy = await make({ copyFrom: 'admin', label: 'Gần như Admin' });
  assert.equal(adminCopy.status, 200);
  assert.ok(!adminCopy.data.role.caps.includes('roles.manage'));
  assert.ok(adminCopy.data.role.caps.includes('payroll.pay'));
  assert.deepEqual(adminCopy.data.role.approvals, [
    'leave',
    'isat',
    'approved',
    'ot',
    'makeup_hours',
    'holiday_work',
    'willmakeup'
  ]);
  const fromCustom = await make({ copyFrom: 'tro_ly_cham_cong', label: 'Trợ lý hai', levels: { attendance: 'view' } });
  assert.deepEqual(fromCustom.data.role.caps, ['attendance.read']);
  assert.equal((await make({ copyFrom: 'khong_co', label: 'Nguồn lạ' })).status, 404);
});

test('loại yêu cầu được duyệt: vai trò tuỳ chỉnh duyệt đúng loại được tích, không loại khác', async () => {
  const res = await make({ label: 'Duyệt tăng ca', approvals: ['ot'] });
  assert.equal(res.status, 200, JSON.stringify(res.data));
  assert.deepEqual(res.data.role.approvals, ['ot']);
  assert.ok(res.data.role.caps.includes('request.decide.ot'));
  await staff('qa_duyet_ot');
  assert.equal((await assign('qa_duyet_ot', ['staff', 'duyet_tang_ca'])).status, 200);
  const me = await store.getStaff('qa_duyet_ot');
  assert.equal(await authz.can(me, 'request.decide.ot'), true);
  assert.equal(await authz.can(me, 'request.decide.leave'), false);
  assert.equal(
    (await F.call('GET', '/approvals/count', { who: 'qa_duyet_ot' })).status,
    200,
    'qua cổng "duyệt ít nhất một nhóm"'
  );
  assert.equal((await F.call('GET', '/approvals/count', { who: 'qa_plain' })).status, 403);
});

test('PUT /api/roles/:code: sửa nhãn, năng lực, loại duyệt; rev tăng; nhật ký role.update có cũ và mới; lý do tuỳ chọn (quá 300 ký tự là 400)', async () => {
  const before = await roleOf('tro_ly_cham_cong');
  const tooLong = await edit('tro_ly_cham_cong', {
    rev: before.rev,
    label: 'Trợ lý chấm công 2',
    reason: 'x'.repeat(301)
  });
  assert.equal(tooLong.status, 400);
  assert.equal(tooLong.data.code, 'REASON_REQUIRED');
  const res = await edit('tro_ly_cham_cong', {
    rev: before.rev,
    label: 'Trợ lý chấm công 2',
    levels: { attendance: 'edit', pay: 'view' },
    approvals: ['leave', 'ot'],
    scope: 'all',
    reason: REASON
  });
  assert.equal(res.status, 200, JSON.stringify(res.data));
  assert.equal(res.data.changed, true);
  assert.equal(res.data.role.rev, before.rev + 1);
  assert.equal(res.data.role.label, 'Trợ lý chấm công 2');
  assert.deepEqual(res.data.role.approvals, ['leave', 'ot']);
  assert.equal(res.data.role.levels.pay, 'view');
  assert.equal(res.data.role.code, 'tro_ly_cham_cong', 'mã không đổi khi đổi nhãn');
  const row = (await auditOf('role.update')).find(r => r.entity_id === 'tro_ly_cham_cong');
  assert.ok(row);
  assert.equal(JSON.parse(row.before_json).label, 'Trợ lý chấm công');
  assert.equal(JSON.parse(row.after_json).label, 'Trợ lý chấm công 2');
  // không đổi gì: không tăng rev, không thêm nhật ký
  const rows = (await auditOf('role.update')).length;
  const same = await edit('tro_ly_cham_cong', { rev: res.data.role.rev, label: 'Trợ lý chấm công 2', reason: REASON });
  assert.equal(same.data.changed, false);
  assert.equal(same.data.role.rev, res.data.role.rev);
  assert.equal((await auditOf('role.update')).length, rows);
  // không ghi lý do vẫn lưu
  const noReason = await edit('tro_ly_cham_cong', { rev: res.data.role.rev, label: 'Trợ lý chấm công 3' });
  assert.equal(noReason.status, 200, JSON.stringify(noReason.data));
  assert.equal(noReason.data.role.label, 'Trợ lý chấm công 3');
  const restored = await edit('tro_ly_cham_cong', { rev: noReason.data.role.rev, label: 'Trợ lý chấm công 2' });
  assert.equal(restored.status, 200);
});

test('PUT /api/roles/:code: rev cũ bị 409 ROLE_STALE, thiếu rev 400, mã lạ 404, vai trò mặc định 403 chỉ đọc, nhân sự 403', async () => {
  const now = await roleOf('tro_ly_cham_cong');
  const stale = await edit('tro_ly_cham_cong', { rev: now.rev - 1, label: 'Cũ', reason: REASON });
  assert.equal(stale.status, 409);
  assert.equal(stale.data.code, 'ROLE_STALE');
  assert.equal(stale.data.rev, now.rev);
  assert.equal(
    (await edit('tro_ly_cham_cong', { rev: 'abc', label: 'Rev sai kiểu', reason: REASON })).data.code,
    'ROLE_REV_REQUIRED'
  );
  assert.equal((await edit('khong_co_vai_tro', { rev: 1, label: 'Lạ', reason: REASON })).status, 404);
  for (const code of Object.keys(authz.ROLE_CAPS)) {
    const res = await edit(code, { rev: 0, caps: ['report.read'], reason: REASON });
    assert.equal(res.status, 403, code);
    assert.equal(res.data.code, 'ROLE_BUILTIN_READONLY');
  }
  assert.equal(
    (await edit('tro_ly_cham_cong', { rev: now.rev, label: 'X xx', reason: REASON }, 'qa_plain')).status,
    403
  );
  assert.equal((await edit('tro_ly_cham_cong', { rev: now.rev, label: 'X xx', reason: REASON }, null)).status, 401);
});

test('an toàn: người đang giữ vai trò tuỳ chỉnh không tự thêm quyền cho vai trò đó', async () => {
  const created = await make({ label: 'Vai trò tự giữ', levels: { report: 'view' } });
  const code = created.data.role.code;
  assert.equal((await assign('admin', ['admin', code])).status, 200);
  const hold = await edit(code, { rev: 1, levels: { report: 'edit' }, reason: REASON });
  assert.equal(hold.status, 403);
  assert.equal(hold.data.code, 'ROLE_SELF_ESCALATION');
  // bớt quyền cho chính mình thì được
  const less = await edit(code, { rev: 1, levels: { report: 'none' }, reason: REASON });
  assert.equal(less.status, 200);
  assert.equal((await assign('admin', ['admin'])).status, 200);
});

test('POST /api/roles/:code/deprecate: ngưng dùng không xoá, người giữ mất năng lực ngay, không gán mới, không sửa, nhật ký role.deprecate', async () => {
  const created = await make({ label: 'Vai trò sắp ngưng', levels: { attendance: 'edit' } });
  const code = created.data.role.code;
  await staff('qa_ngung');
  assert.equal((await assign('qa_ngung', ['staff', code])).status, 200);
  assert.notEqual((await F.call('GET', '/ot', { who: 'qa_ngung' })).status, 403);
  assert.equal((await stop(code, { rev: 1, reason: 'x'.repeat(301) })).data.code, 'REASON_REQUIRED');
  assert.equal((await stop(code, { rev: 9, reason: REASON })).data.code, 'ROLE_STALE');
  const res = await stop(code, { rev: 1, reason: REASON });
  assert.equal(res.status, 200, JSON.stringify(res.data));
  assert.equal(res.data.role.deprecated, true);
  assert.deepEqual(res.data.role.caps, []);
  assert.equal(res.data.holders, 1);
  assert.equal(res.data.role.users, 1, 'người giữ vẫn đếm để Admin gỡ');
  assert.equal((await F.call('GET', '/ot', { who: 'qa_ngung' })).status, 403, 'mất năng lực ngay');
  assert.ok(!(await F.call('GET', '/me', { who: 'qa_ngung' })).data.roles.includes(code));
  assert.equal((await stop(code, { rev: 2, reason: REASON })).data.code, 'ROLE_DEPRECATED', 'ngưng hai lần');
  assert.equal((await edit(code, { rev: 2, label: 'Sửa sau ngưng', reason: REASON })).data.code, 'ROLE_DEPRECATED');
  assert.ok(await roleOf(code), 'vẫn còn trong danh sách');
  await staff('qa_ngung_moi');
  const regrant = await assign('qa_ngung_moi', ['staff', code]);
  assert.equal(regrant.status, 400);
  assert.equal(regrant.data.code, 'ROLE_DEPRECATED');
  assert.equal((await assign('qa_ngung', ['staff'])).status, 200, 'gỡ vai trò đã ngưng được');
  assert.equal((await auditOf('role.deprecate')).filter(r => r.entity_id === code).length, 1);
  for (const builtin of ['admin', 'cb'])
    assert.equal((await stop(builtin, { rev: 0, reason: REASON })).data.code, 'ROLE_BUILTIN_READONLY');
});

test('PUT /api/staff/:u/roles: mã vai trò lạ vẫn bị 400, mã vai trò tuỳ chỉnh còn dùng được nhận', async () => {
  await staff('qa_ma_la');
  assert.equal((await assign('qa_ma_la', ['khong_co_vai_tro'])).status, 400);
  assert.equal((await assign('qa_ma_la', ['staff', 'tro_ly_cham_cong'])).status, 200);
});

test('POST /api/roles: tối đa số vai trò tuỳ chỉnh trong config, vượt thì 409 ROLE_LIMIT và không lưu', async () => {
  const have = (await authz.customTable()).roles.length;
  for (let i = have; i < config.ROLES_CUSTOM_MAX; i++) {
    const code = `qa_lap_${String.fromCharCode(97 + (i % 26))}${String.fromCharCode(97 + Math.floor(i / 26))}`;
    assert.equal((await make({ label: `Vai trò lặp ${code}`, code })).status, 200, code);
  }
  const over = await make({ label: 'Vai trò thứ ba mươi mốt', code: 'qa_vuot_tran' });
  assert.equal(over.status, 409);
  assert.equal(over.data.code, 'ROLE_LIMIT');
  assert.equal((await authz.customTable()).roles.length, config.ROLES_CUSTOM_MAX);
});

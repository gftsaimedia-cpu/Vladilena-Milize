'use strict';
// Vai trò "Nhân viên" (staff) và payrollSubject là MỘT THỨ:
//   - PUT /staff/:u/roles cấp staff thì bật payrollSubject, gỡ staff thì tắt (nhật ký staff.payrollSubject, mức pay); gỡ staff không trả 409;
//   - PUT /staff/:u với payrollSubject:false gỡ luôn dòng cấp staff tường minh;
//   - Admin gốc có chấm công và lương chỉ khi được cấp staff; bậc 0 thì cảnh báo ROLE_STAFF_NO_LEVEL;
//   - lib/roles.ts → reconcileStaffRole() (chạy khi nạp máy chủ) sửa dòng có staff tường minh mà payrollSubject false, người làm là "system".
//   - Luật AI late-declaration TẮT mặc định (ai.rule.lateDeclaration.enabled); danh sách kiểm không có mục "Hạn nhân sự báo công".
// Chỉ người bịa (qa_*) và DB trong bộ nhớ.
const P = require('../helpers/period-api');
const S = require('../helpers/settings-api');
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const Roles = require('../../lib/roles');

const { F, store } = P;
const monthOf = P.monthPool();

before(F.start);
after(F.stop);

const REASON = 'Phân quyền theo quyết định tháng này';
const putRoles = async (user, roles, who = 'admin') =>
  await F.call('PUT', `/staff/${user}/roles`, { who, body: { roles, reason: REASON } });
const auditOf = async user =>
  (
    await store.db
      .prepare("SELECT * FROM audit_log WHERE action = 'staff.payrollSubject' AND subject = ? ORDER BY id")
      .all(user)
  ).map(r => ({ ...r, before: JSON.parse(r.before_json), after: JSON.parse(r.after_json) }));
const estimated = async month =>
  (await F.call('GET', `/periods/${month}/estimates?pageSize=200`)).data.rows.map(r => r.username);
const staffForm = async (user, over = {}) => {
  const s = await store.getStaff(user);
  return {
    name: s.name,
    role: s.role,
    type: s.type,
    level: s.level,
    shiftCode: s.shiftCode,
    startDate: s.startDate,
    leaveAdjust: s.leaveAdjust,
    ...over
  };
};
// Nhân sự HR (có hồ sơ lương đầy đủ nhưng chưa được trả lương: không có vai trò Nhân viên)
const hrPerson = async user =>
  await F.person(user, 'staff', {
    type: 'nv',
    level: 1,
    shiftCode: 'n1',
    startDate: '2026-01-05',
    payrollSubject: false
  });

test('HR → Nhân viên → HR: cấp Nhân viên bật payrollSubject và người đó vào ước tính lương; gỡ thì tắt và ra khỏi ước tính; mỗi lần đổi một dòng nhật ký staff.payrollSubject', async () => {
  const M = monthOf();
  await P.seed(M);
  await hrPerson('qa_hr_vong');
  assert.equal((await putRoles('qa_hr_vong', ['hr'])).status, 200);
  assert.equal((await store.getStaff('qa_hr_vong')).payrollSubject, false);
  assert.ok(!(await estimated(M)).includes('qa_hr_vong'), 'HR không nhận lương: không có trong ước tính');
  const base = (await auditOf('qa_hr_vong')).length;

  const on = await putRoles('qa_hr_vong', ['hr', 'staff']);
  assert.equal(on.status, 200, JSON.stringify(on.data));
  assert.deepEqual(on.data.granted, ['staff']);
  assert.equal((await store.getStaff('qa_hr_vong')).payrollSubject, true, 'cấp Nhân viên thì vào bảng lương');
  assert.ok((await estimated(M)).includes('qa_hr_vong'), 'có trong ước tính lương');
  assert.deepEqual(
    (await F.call('GET', '/me', { who: 'qa_hr_vong' })).data.roles.sort(),
    ['hr', 'staff'],
    'quyền Nhân viên có hiệu lực ngay'
  );
  let rows = (await auditOf('qa_hr_vong')).slice(base);
  assert.equal(rows.length, 1);
  assert.deepEqual([rows[0].before, rows[0].after], [{ payrollSubject: false }, { payrollSubject: true }]);
  assert.equal(rows[0].actor, 'admin');
  assert.equal(rows[0].sensitivity, 'pay');

  const off = await putRoles('qa_hr_vong', ['hr']);
  assert.equal(off.status, 200, JSON.stringify(off.data));
  assert.deepEqual(off.data.revoked, ['staff'], 'gỡ staff không còn 409');
  assert.equal((await store.getStaff('qa_hr_vong')).payrollSubject, false);
  assert.ok(!(await estimated(M)).includes('qa_hr_vong'), 'ra khỏi ước tính lương');
  rows = (await auditOf('qa_hr_vong')).slice(base);
  assert.equal(rows.length, 2);
  assert.deepEqual([rows[1].before, rows[1].after], [{ payrollSubject: true }, { payrollSubject: false }]);
  // gửi lại đúng tập vai trò hiện có thì không ghi thêm dòng
  assert.equal((await putRoles('qa_hr_vong', ['hr'])).status, 200);
  assert.equal((await auditOf('qa_hr_vong')).slice(base).length, 2);
});

test('PUT /staff/:u với payrollSubject:false gỡ luôn dòng cấp Nhân viên tường minh; tạo tài khoản "Nhân viên" bằng payrollSubject:true thì vào bảng lương', async () => {
  const M = monthOf();
  await P.seed(M);
  await hrPerson('qa_hr_go');
  assert.equal((await putRoles('qa_hr_go', ['staff'])).status, 200);
  assert.ok((await store.roles.activeRoles('qa_hr_go')).includes('staff'));
  assert.equal((await store.getStaff('qa_hr_go')).payrollSubject, true);
  const res = await F.call('PUT', '/staff/qa_hr_go', { body: await staffForm('qa_hr_go', { payrollSubject: false }) });
  assert.equal(res.status, 200, JSON.stringify(res.data));
  assert.equal((await store.getStaff('qa_hr_go')).payrollSubject, false);
  assert.ok(!(await store.roles.activeRoles('qa_hr_go')).includes('staff'), 'dòng cấp staff tường minh đã thu hồi');

  // màn Phân quyền → Tạo tài khoản → "Nhân viên"
  const created = await F.call('PUT', '/staff/qa_moi_nv', {
    body: {
      name: 'Người thử mới',
      role: 'staff',
      type: 'nv',
      level: 1,
      startDate: '2026-01-05',
      password: 'qa-mat-khau-thu-123456',
      payrollSubject: true
    }
  });
  assert.equal(created.status, 200, JSON.stringify(created.data));
  assert.equal((await store.getStaff('qa_moi_nv')).payrollSubject, true);
  assert.ok((await estimated(M)).includes('qa_moi_nv'));
  const plain = await F.call('PUT', '/staff/qa_moi_hr', {
    body: {
      name: 'Người thử HR',
      role: 'staff',
      type: 'nv',
      level: 1,
      startDate: '2026-01-05',
      password: 'qa-mat-khau-thu-123456',
      payrollSubject: false
    }
  });
  assert.equal(plain.status, 200, JSON.stringify(plain.data));
  assert.ok(!(await estimated(M)).includes('qa_moi_hr'));
});

test('Admin gốc chỉ có chấm công và lương khi được cấp Nhân viên; bậc 0 thì cảnh báo ROLE_STAFF_NO_LEVEL nhưng vẫn lưu', async () => {
  await P.seed(monthOf());
  await F.person('qa_admin_nv', 'admin', { type: 'tts', level: 0, shiftCode: null, startDate: null });
  assert.equal((await store.getStaff('qa_admin_nv')).payrollSubject, false);
  const res = await putRoles('qa_admin_nv', ['admin', 'staff']);
  assert.equal(res.status, 200, JSON.stringify(res.data));
  assert.equal((await store.getStaff('qa_admin_nv')).payrollSubject, true);
  assert.ok(
    (res.data.warnings || []).some(w => w.code === 'ROLE_STAFF_NO_LEVEL'),
    JSON.stringify(res.data.warnings)
  );
  assert.equal((await store.getStaff('qa_admin_nv')).role, 'admin', 'vẫn là Admin gốc');
});

test('reconcileStaffRole (chạy khi nạp máy chủ): dòng có Nhân viên tường minh mà payrollSubject false được sửa, người làm là "system"; chạy lại không làm gì; người không có dòng staff không bị đụng', async () => {
  await P.seed(monthOf());
  await hrPerson('qa_lech');
  await hrPerson('qa_khong_staff');
  await store.roles.grant('qa_lech', 'staff', 'admin'); // ghi thẳng dòng vai trò, không đồng bộ payrollSubject
  assert.equal((await store.getStaff('qa_lech')).payrollSubject, false, 'điều kiện: lệch');
  assert.equal((await Roles.reconcileStaffRole()) >= 1, true);
  assert.equal((await store.getStaff('qa_lech')).payrollSubject, true, 'đã sửa');
  assert.equal((await store.getStaff('qa_khong_staff')).payrollSubject, false, 'không có dòng staff: giữ nguyên');
  const rows = await auditOf('qa_lech');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].actor, 'system');
  assert.deepEqual([rows[0].before, rows[0].after], [{ payrollSubject: false }, { payrollSubject: true }]);
  assert.equal(await Roles.reconcileStaffRole(), 0, 'chạy lại không còn gì để sửa');
  assert.equal((await auditOf('qa_lech')).length, 1);
});

test('AI soát: không còn mục "Hạn nhân sự báo công" và không phát hiện late-declaration mặc định; bật ai.rule.lateDeclaration.enabled thì khoản khai sau mùng 3 bị gắn', async () => {
  const M = monthOf();
  await P.seed(M);
  await S.setMode('defaults-only');
  // khai muộn: sau mùng 3 tháng sau (đồng hồ 10/11/2026), một khoản iSAT chờ duyệt
  const [y, m] = M.split('-').map(Number);
  await F.at(`${m === 12 ? y + 1 : y}-${String(m === 12 ? 1 : m + 1).padStart(2, '0')}-10T10:00:00`);
  const days = { ...(await store.getSheet('qa_nv1', M)).days, [await S.lastDow(M, 6)]: { kind: 'isat' } };
  assert.equal((await F.call('PUT', '/sheet', { who: 'qa_nv1', body: { month: M, days } })).status, 200);

  const off = (await F.call('GET', `/ai/review?month=${M}`)).data;
  assert.ok(
    !off.checklist.some(i => i.id === 'report-deadline' || /Hạn nhân sự báo công/.test(i.label)),
    'không còn mục hạn báo công'
  );
  assert.doesNotMatch(JSON.stringify(off.checklist), /Hạn nhân sự báo công|đã qua \d+ ngày|còn \d+ ngày/);
  assert.equal(off.findings.filter(f => f.rule === 'late-declaration').length, 0, 'tắt mặc định');
  assert.deepEqual(
    off.checked.skipped.filter(s => s.rule === 'late-declaration'),
    [{ rule: 'late-declaration', reason: 'Admin tắt' }]
  );

  const saved = await S.saveChanges([{ key: 'ai.rule.lateDeclaration.enabled', value: true }], { month: M });
  assert.equal(saved.status, 200, JSON.stringify(saved.data).slice(0, 200));
  const on = (await F.call('GET', `/ai/review?month=${M}`)).data;
  const late = on.findings.filter(f => f.rule === 'late-declaration');
  assert.ok(late.length >= 1, 'bật thì có phát hiện khai sau hạn');
  assert.ok(late.every(f => f.username === 'qa_nv1'));
  assert.ok(!on.checklist.some(i => i.id === 'report-deadline'), 'bật luật cũng không đưa mục hạn báo công trở lại');
});

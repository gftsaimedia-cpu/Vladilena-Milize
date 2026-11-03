'use strict';
// Các lớp của src/domain: họ tên, hợp đồng theo thâm niên,
// danh mục chức vụ/ca trong DB khớp DEFAULTS, giải trình (khoá lạc quan, tự duyệt, không mở lại giải trình đã duyệt), mã ca mới.
require('../helpers/require-isolated-database');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const store = require('../../src/platform/db');
const Params = require('../../src/engine/payroll-params');
const PunchRules = require('../../src/engine/punch');
const ActualHours = require('../../src/engine/actual-hours');
const { PersonName } = require('../../src/domain/employee/person-name');
const { PayrollPolicy } = require('../../src/domain/payroll/policy');
const { container } = require('../../src/domain/container');
const { ExplanationService, ExplanationRepository } = require('../../src/domain/explanation');

test('PersonName: họ trước, tên là chữ cuối, viết hoa chữ đầu', () => {
  const khoa = PersonName.parse('Bùi đăng khoa');
  assert.equal(khoa.familyName, 'Bùi Đăng');
  assert.equal(khoa.givenName, 'Khoa');
  const huyen = PersonName.parse('  Hồ thị   khánh huyền ');
  assert.equal(huyen.familyName, 'Hồ Thị Khánh');
  assert.equal(huyen.givenName, 'Huyền');
  assert.equal(huyen.fullName, 'Hồ Thị Khánh Huyền');
  assert.equal(PersonName.parse('an').familyName, '');
  assert.equal(PersonName.from({ familyName: 'nguyễn', givenName: 'khánh huyền' }).fullName, 'Nguyễn Khánh Huyền');
});

test('PayrollPolicy: đủ 3 tháng tròn tới hết tháng lương thì long, chưa đủ thì short', () => {
  assert.equal(PayrollPolicy.tenureContract('2026-08-01', '2026-10', 3), 'short'); // tròn 3 tháng ngày 01/11, sau 31/10
  assert.equal(PayrollPolicy.tenureContract('2026-08-01', '2026-11', 3), 'long');
  assert.equal(PayrollPolicy.tenureContract('2026-09-15', '2026-11', 3), 'short'); // tròn 3 tháng ngày 15/12
  assert.equal(PayrollPolicy.tenureContract('2026-09-15', '2026-12', 3), 'long');
  assert.equal(PayrollPolicy.tenureContract('2025-11-30', '2026-02', 3), 'long'); // tháng ngắn: lùi về 28/02
  assert.equal(PayrollPolicy.tenureContract(null, '2026-11', 3), null);
  const P = { 'tax.contract.basis': 'tenure', 'tax.longTermMonths': 3 };
  assert.equal(PayrollPolicy.contractFor(P, '2026-10-20', '2026-11', 'long'), 'short');
  assert.equal(PayrollPolicy.contractFor({}, '2026-10-20', '2026-11', 'long'), 'long'); // không theo thâm niên: giữ mặc định
  assert.equal(PayrollPolicy.contractFor(P, null, '2026-11', 'short'), 'short'); // thiếu ngày vào làm: giữ mặc định
});

test('danh mục trong DB: dòng tham số giữ đúng tiền của DEFAULTS, chỉ thêm khoá mới và tên bậc', async () => {
  const rows = await container.catalogParamRows();
  const base = rows.filter(r => r.effectiveMonth === '2000-01');
  const changed = base.filter(
    r => Object.hasOwn(Params.DEFAULTS, r.key) && JSON.stringify(Params.DEFAULTS[r.key]) !== JSON.stringify(r.value)
  );
  assert.ok(
    changed.every(r => /^level\.[a-z0-9_]+\.\d+\.name$/.test(r.key)),
    changed.map(r => r.key).join(', ')
  );
  const added = base.filter(r => !Object.hasOwn(Params.DEFAULTS, r.key)).map(r => r.key);
  assert.ok(
    added.every(k => /\.nightPct$|^shift\.(kind|alias)\./.test(k)),
    added.join(', ')
  );
  const P = Params.resolveParamSet(rows, '2026-11');
  assert.equal(P['shift.allowance.basis'], 'assigned');
  assert.equal(P['tax.contract.basis'], 'tenure');
  assert.equal(P['type.nv.nightPct'], 40);
  assert.equal(P['level.tts.1.name'], 'Explorer');
  assert.equal(P['shift.kind.Night1'], 'night');
  assert.equal(P['shift.alias.Flex2'], 'f2');
  const before = Params.resolveParamSet(rows, '2026-10');
  assert.equal(before['shift.allowance.basis'], 'assigned'); // tháng nào cũng cùng một bộ quy tắc
  assert.equal(before['tax.contract.basis'], 'tenure');
});

test('mã ca mới tra được giờ ca ở luật chấm công và giờ thực tế, danh sách khoá vẫn là khoá cũ', async () => {
  assert.deepEqual(PunchRules.SHIFT.Night1, PunchRules.SHIFT.g1);
  assert.deepEqual(ActualHours.SHIFT_TIMES.Flex1, ActualHours.SHIFT_TIMES.f1);
  assert.deepEqual(Object.keys(PunchRules.SHIFT).sort(), ['f1', 'f2', 'g1', 'g2', 'n1', 'n2']);
  assert.equal(PunchRules.canonicalOf('n2'), 'Normal2');
  assert.equal(PunchRules.presetOf('Night2'), 'g2');
  assert.equal(await container.shifts.canonicalOf('g1'), 'Night1');
  assert.equal((await container.shifts.find('Flex1')).kind, 'flex');
});

test('hồ sơ: uuid sinh một lần, họ/tên tách sẵn, tài khoản không đổi được', async () => {
  await store.upsertStaff({
    username: 'qa_khoa',
    name: 'bùi đăng khoa',
    role: 'staff',
    type: 'nv',
    level: 1,
    passHash: 'x'
  });
  const first = await store.getStaff('qa_khoa');
  assert.match(first.uuid, /^[0-9a-f-]{36}$/);
  assert.equal(first.familyName, 'Bùi Đăng');
  assert.equal(first.givenName, 'Khoa');
  await store.upsertStaff({ ...first, passHash: 'x', name: 'Hồ thị khánh huyền', contractStatus: 'probation' });
  const second = await store.getStaff('qa_khoa');
  assert.equal(second.uuid, first.uuid);
  assert.equal(second.givenName, 'Huyền');
  assert.equal(second.contractStatus, 'probation');
  await store.upsertStaff({ ...second, passHash: 'x', contractStatus: undefined, resignedOn: '2026-12-31' });
  assert.equal((await store.getStaff('qa_khoa')).contractStatus, 'probation'); // undefined = giữ
  assert.equal((await store.getStaff('qa_khoa')).resignedOn, '2026-12-31');
  await assert.rejects(
    async () => await store.db.prepare("UPDATE staff SET username = 'qa_khac' WHERE username = 'qa_khoa'").run()
  );
  assert.equal((await container.employees.byUuid(first.uuid, '2026-11')).username, 'qa_khoa');
});

test('giải trình: duyệt cần đúng rev, giải trình đã duyệt không bị trả lời lại, tự duyệt theo chính sách', async () => {
  await store.upsertStaff({
    username: 'qa_gt',
    name: 'Người giải trình',
    role: 'staff',
    type: 'nv',
    level: 1,
    passHash: 'x'
  });
  const denied: any[] = [];
  const service = new ExplanationService({
    repository: new ExplanationRepository({ queryBuilder: store.queryBuilder, transaction: store.transaction }),
    staffExists: async (u?) => !!(await store.getStaff(u)),
    clock: () => '2026-11-02T02:00:00.000Z',
    onSelf: (error?) => denied.push(error.code)
  });
  const asked = await service.request({
    username: 'qa_gt',
    date: '2026-11-02',
    prompt: 'Vì sao về sớm?',
    kind: 'admin',
    requestedBy: 'admin'
  });
  const answered = await service.answer({ id: asked.id, username: 'qa_gt', text: 'Đi khám bệnh' });
  await assert.rejects(
    async () => await service.decide({ id: asked.id, by: 'admin', approve: true, expectedRev: answered.rev + 1 }),
    e => e.code === 'EXPLANATION_STALE' && e.httpStatus === 409
  );
  const approved = await service.decide({ id: asked.id, by: 'admin', approve: true, expectedRev: answered.rev });
  assert.equal(approved.status, 'approved');
  await assert.rejects(
    async () => await service.answer({ id: asked.id, username: 'qa_gt', text: 'sửa lại' }),
    e => e.httpStatus === 409
  );
  assert.equal((await service.byId(asked.id)).status, 'approved');
  const again = await service.request({
    username: 'qa_gt',
    date: '2026-11-03',
    prompt: 'Vì sao?',
    kind: 'admin',
    requestedBy: 'admin'
  });
  await service.answer({ id: again.id, username: 'qa_gt', text: 'x' });
  await service.decide({ id: again.id, by: 'qa_gt', approve: true, isSelf: true });
  assert.deepEqual(denied, ['SELF_DECISION_FORBIDDEN']);
});

test('phụ cấp ca theo ca được xếp: ca Night có phụ cấp đêm theo bậc, ca Normal làm giờ đêm thì không', async () => {
  const { Engine, LEGACY_DEFAULTS, caseOf, clone, closeTo } = require('../helpers/pay-oracle');
  // chỉ chồng các khoá danh mục và quy tắc không có trong LEGACY_DEFAULTS (tiền của LEGACY_DEFAULTS giữ nguyên)
  const added = {
    ...Object.fromEntries(
      (await container.catalogParamRows())
        .filter(r => !Object.hasOwn(LEGACY_DEFAULTS, r.key))
        .map(r => [r.key, r.value])
    ),
    'shift.allowance.basis': Params.DEFAULTS['shift.allowance.basis']
  };
  const run = (over?, shiftCode?) => {
    const input = clone(caseOf('s20261015-00004').input); // TTS bậc 4, 22:00–07:00 cả tháng, ca cố định g2
    input.staff.shiftCode = shiftCode;
    for (const s of input.sessions) s.entry.preset = s.entry.plannedShift.code = shiftCode; // ca được xếp của từng lượt
    return Engine.create({ ...LEGACY_DEFAULTS, ...over }).computeMonth(input).m;
  };
  const legacy = run({}, 'g2');
  assert.equal(added['shift.allowance.basis'], 'assigned');
  assert.equal(added['type.tts.nightPct'], 30); // TTS không có bảng 40/60 nên giữ mức chung 30 %
  assert.ok(legacy.bonus > 0);
  assert.equal(run(added, 'Night2').bonus, legacy.bonus, 'ca Night2 (= g2) cùng mức 30 %: không đổi một đồng');
  assert.ok(run(added, 'Normal1').bonus < legacy.bonus, 'ca được xếp là Normal: không có phụ cấp đêm');
  const sixty = run({ ...added, 'level.tts.4.nightPct': 60 }, 'Night2');
  assert.ok(closeTo(sixty.bonus / legacy.bonus, 60 / 30, 1e-9), 'bậc đặt 60 % thì phụ cấp đêm gấp đôi');
  assert.deepEqual(
    run({ ...added, 'shift.allowance.basis': undefined }, 'Normal1').bonus,
    legacy.bonus,
    'bản chụp thiếu khoá cơ sở phụ cấp ca: đoán theo giờ có mặt như cũ'
  );
});

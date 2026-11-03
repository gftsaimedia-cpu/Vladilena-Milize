'use strict';
// Module timesheet (src/domain/timesheet/*): bộ luật khai Lịch ước tính. Trọng tâm: thứ tự cảnh báo giữ nguyên, thêm luật không phải
// sửa TimesheetValidator, ca của ngày do ShiftAssignment quyết, và các phép tính ngày giờ thuần.
require('../helpers/require-isolated-database');
const { test, after, before } = require('node:test');
const assert = require('node:assert/strict');
const store = require('../../src/platform/db');
const warnings = require('../../src/platform/warnings');
const { Rule, RuleSet, Violation } = require('../../src/domain/shared/rule');
const { DayMath } = require('../../src/domain/timesheet/day-math');
const { ExtraTimes } = require('../../src/domain/timesheet/extra-times');
const { SheetRevision } = require('../../src/domain/timesheet/sheet-revision');
const { TimesheetValidator } = require('../../src/domain/timesheet/timesheet-validator');
const { timesheet } = require('../../src/domain/timesheet/services');

after(() => store.db.close());

before(async () => {
  for (const [username, type] of [
    ['qa_ts', 'nv'],
    ['qa_pt', 'pt']
  ])
    await store.upsertStaff({
      username,
      name: username,
      role: 'staff',
      type,
      level: 1,
      shiftCode: 'n1',
      startDate: '2026-01-01',
      passHash: 'x'
    });
});
const staff = async (username = 'qa_ts') => (await store.listStaff()).find(s => s.username === username);
const work = (over: any = {}) => ({
  kind: 'work',
  in: '08:00',
  out: '17:00',
  extraKind: '',
  extraIn: '',
  extraOut: '',
  preset: '',
  breakMin: 0,
  ...over
});

// Chạy checkSheet trong một yêu cầu giả để lấy cảnh báo theo đúng thứ tự trả cho giao diện
async function run(clean?, prevDays: any = {}, { who = 'qa_ts', ...extra }: any = {}) {
  let out;
  await warnings.run(async () => {
    const result = await timesheet().validator.validate({
      u: await staff(who),
      month: '2026-10',
      clean,
      prevDays,
      ...extra
    });
    out = { result, codes: warnings.take().map(w => w.code) };
  });
  return out;
}

test('thứ tự cảnh báo: theo từng ngày (tăng dần), trong ngày theo thứ tự luật; Chủ nhật bỏ qua luật ngoài lịch', async () => {
  // Chức vụ pt: 11/10 Chủ nhật khai nghỉ được duyệt, 14/10 OT, 24/10 nghỉ phép; chức vụ không có các quyền lợi đó
  const { codes } = await run(
    {
      '2026-10-11': { kind: 'approved' },
      '2026-10-14': work({ extraKind: 'ot', extraOut: '19:00' }),
      '2026-10-24': { kind: 'leave' }
    },
    {},
    { who: 'qa_pt' }
  );
  assert.deepEqual(codes, [
    'SHEET_SUNDAY',
    'BENEFIT_NOT_ALLOWED',
    'SHEET_OFF_SCHEDULE',
    'BENEFIT_NOT_ALLOWED',
    'SHEET_OFF_SCHEDULE',
    'BENEFIT_NOT_ALLOWED'
  ]);
});

test('ca của ngày: ShiftAssignment gán preset, ngày lệch ca được gán thì bỏ preset và cảnh báo', async () => {
  const clean = { '2026-10-14': work(), '2026-10-15': work({ in: '09:00', out: '18:00', preset: 'n1' }) };
  const { codes } = await run(clean);
  assert.equal(
    clean['2026-10-14'].preset,
    (await staff()).shiftCode,
    'đúng giờ ca được gán thì mã ca của ngày là ca được gán'
  );
  assert.equal(clean['2026-10-15'].preset, '', 'lệch ca thì bỏ mã ca nhân sự gửi');
  assert.ok(codes.includes('SHEET_SHIFT_MISMATCH'));
});

test('ngày không thuộc tháng bị chặn 400 như lỗi định dạng', async () => {
  await assert.rejects(
    async () => await run({ '2026-11-03': work() }),
    err => err.status === 400 && /không thuộc tháng 2026-10/.test(err.message)
  );
});

test('thêm một luật vào bộ luật ngày không phải sửa TimesheetValidator', async () => {
  class NoFridayRule extends Rule {
    *evaluate({ date, dow }: any) {
      if (dow === 5) yield Violation.warn('SHEET_NO_FRIDAY', `Ngày ${date} là thứ Sáu`, undefined, { date });
    }
  }
  const base = new TimesheetValidator({
    rulesFor: () => {
      throw new Error('không dùng');
    },
    schedule: {},
    sheetFlagsOf: () => ({}),
    holidays: () => [],
    dayLimits: () => {}
  });
  const dayAfter = base.ruleSets.dayAfter.add(new NoFridayRule());
  assert.ok(dayAfter instanceof RuleSet);
  assert.equal(dayAfter.size, 8, '7 luật có sẵn cộng 1 luật mới');
  // 16/10/2026 là Thứ sáu: luật mới chạy qua bộ luật ngày thật
  const hits: any[] = [];
  for await (const violation of await dayAfter.violations({
    date: '2026-10-16',
    dow: 5,
    c: work(),
    unchanged: true,
    flags: {},
    sheet: {}
  }))
    hits.push(violation);
  assert.deepEqual(
    hits.map(v => v.code),
    ['SHEET_NO_FRIDAY']
  );
  assert.deepEqual(hits[0].details, { date: '2026-10-16' });
});

test('Violation.warn mang details; cảnh báo không details thì không thêm trường details', () => {
  const list = warnings.run(() => {
    Violation.warn('A_CODE', 'có details', 'hệ quả', { date: '2026-10-01' }).raise();
    Violation.warn('B_CODE', 'không details').raise();
    return warnings.take();
  });
  assert.deepEqual(list[0].details, { date: '2026-10-01' });
  assert.equal(list[0].message, 'có details. hệ quả');
  assert.equal('details' in list[1], false);
});

test('DayMath: khoảng giờ qua nửa đêm, cộng ngày qua ranh giới tháng, ngày cuối tháng', () => {
  assert.equal(DayMath.gap('22:00', '07:00'), 9 * 60);
  assert.equal(DayMath.gap('08:00', '08:00'), 0);
  assert.equal(DayMath.shiftDate('2026-10-31', 1), '2026-11-01');
  assert.equal(DayMath.shiftDate('2026-01-01', -1), '2025-12-31');
  assert.equal(DayMath.lastDayOf('2026-02'), '2026-02-28');
  assert.equal(DayMath.dm('2026-10-05'), '05/10');
  assert.equal(DayMath.dayOfWeek('2026-10-11'), 0);
  assert.equal(DayMath.sameHours({ kind: 'work', in: '08:00' }, { kind: 'work', in: '08:00', extraKind: '' }), true);
  assert.equal(DayMath.sameHours({ kind: 'work', in: '08:00' }, undefined), false);
});

test('ExtraTimes: trần ngày lấy từ limits được tiêm, không ghi cứng', () => {
  // Chỉ "trước ca" 06:00 cho ca 08:00–17:00 là hợp lệ; ép trần 1 giờ vẫn không đổi kết quả vì không nhập nhầm phía
  const tight = new ExtraTimes({ limits: { dayCap: 1 } });
  assert.doesNotThrow(() => tight.check('2026-10-14', work(), { extraKind: 'ot', extraIn: '06:00', extraOut: '' }));
  // Nhập nhầm ô: chỉ có "trước ca" 18:00 (nằm sau giờ ra)
  assert.throws(
    () => tight.check('2026-10-14', work(), { extraKind: 'ot', extraIn: '18:00', extraOut: '' }),
    err => err.status === 400 && err.details?.code === 'EXTRA_WRONG_SIDE'
  );
  assert.throws(
    () => tight.check('2026-10-14', work(), { extraKind: 'ot', extraIn: '', extraOut: '' }),
    /chưa nhập giờ làm thêm/
  );
});

test('SheetRevision: lệch rev là 409 SHEET_STALE, thiếu expectedRev thì ghi đè, expectedRev sai kiểu là 400', async () => {
  const revision = new SheetRevision({ sheetOf: async () => ({ rev: 3 }) });
  await assert.doesNotReject(() => revision.assert('u', '2026-10', undefined));
  await assert.doesNotReject(() => revision.assert('u', '2026-10', 3));
  await assert.rejects(
    () => revision.assert('u', '2026-10', 2),
    err => err.status === 409 && err.details?.code === 'SHEET_STALE' && err.details.rev === 3
  );
  await assert.rejects(
    () => revision.assert('u', '2026-10', -1),
    err => err.status === 400
  );
  await assert.rejects(
    () => revision.assert('u', '2026-10', 1.5),
    err => err.status === 400
  );
});

'use strict';
// Khối phụ cấp có điều kiện mất (src/engine/pay-blocks-calc.ts → lostOf) dùng ĐÚNG ngưỡng và số ngày nghỉ của chuyên cần trong bộ máy:
//   - giờ vượt: MỘT ngưỡng duy nhất = ghi đè theo chức vụ (type.<mã>.overLimitHours, khác null) hoặc attendance.overLimitHours, CỘNG biên độ
//     attendance.overLimitTolerance; cờ chuyên cần (r.attendOk), tiền chuyên cần và khối dùng cùng ngưỡng
//   - ngày nghỉ: max(0, leave + unpaid - unpaidExempt + noshow + willmakeup - makeup), do bộ máy tính một lần và đưa vào khối, kể cả chức vụ không có
//     phụ cấp đi lại và chuyên cần (bộ máy không gán r.absent ở đó); ngày nghỉ không lương được miễn (absentExempt) không tính
// Mặc định (biên độ 0, không ghi đè) giữ nguyên. Số tiền 100.000 ₫ của khối là số GIẢ để thử, chỉ nằm trong bộ nhớ.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const PayrollEngine = require('../../src/engine/payroll-engine');
const PayrollParams = require('../helpers/defaults-old-basis.js');
const golden = require('../fixtures/payroll-golden-v0.json');
const { attendDeclaredDays } = require('../helpers/payroll-cases');

const D = PayrollParams.DEFAULTS;
const copy = (v?) => JSON.parse(JSON.stringify(v));
const run = (id?, params?) =>
  PayrollEngine.create(params).computeMonth(copy(golden.cases.find(c => c.id === id).input)).m;
const blockOf = (type?, loss?, extra: any = {}) => ({
  ...D,
  'block.def.thu': { label: 'Khối thử', component: '3', method: 'fixed', scalesWithDays: false, tax: 'none', loss },
  [`type.${type}.block.thu.on`]: true,
  [`type.${type}.block.thu.amount`]: 100000,
  ...extra
});
const THR = { kind: 'overLimitHours' };
// Ca T6-5 (ngày 01 và 02/10 nghỉ không lương) với số ngày nghỉ không lương đổi thành `unpaid`; người chấm đủ các ngày còn lại
const withUnpaid = (unpaid?, type = 'nv') => {
  const input = copy(golden.cases.find(c => c.id === 'known-t65-over-limit-23.75h').input);
  input.staff.type = type;
  for (const date of ['2026-10-01', '2026-10-02', '2026-10-03']) delete input.days[date];
  for (const date of ['2026-10-01', '2026-10-02', '2026-10-03'].slice(0, unpaid)) input.days[date] = { kind: 'unpaid' };
  return attendDeclaredDays(input);
};
const runInput = (input?, params?) => PayrollEngine.create(params).computeMonth(input).m;
const OVER_24_25 = 'known-t65-over-limit-24.25h'; // NV, giờ vượt 24,25
const OVER_23_75 = 'known-t65-over-limit-23.75h'; // NV, giờ vượt 23,75

test('1c-4: khối mất theo giờ vượt, mặc định (biên độ 0, không ghi đè): ngưỡng 24 giờ như cũ (24,25 mất, 23,75 không)', () => {
  const lost = run(OVER_24_25, blockOf('nv', THR)).blocks[0];
  assert.equal(lost.lost, true);
  assert.equal(lost.amount, 0);
  const kept = run(OVER_23_75, blockOf('nv', THR)).blocks[0];
  assert.equal(kept.lost, false);
  assert.equal(kept.amount, 100000);
});

test('1c-4: khối mất theo giờ vượt cộng biên độ attendance.overLimitTolerance như chuyên cần: biên độ 0,5 giờ thì 24,25 giờ chưa mất; chuyên cần cùng ngưỡng', () => {
  const P = blockOf('nv', THR, { 'attendance.overLimitTolerance': 0.5 });
  const m = run(OVER_24_25, P);
  assert.equal(m.blocks[0].lost, false, 'ngưỡng 24,5: 24,25 chưa mất');
  assert.equal(m.blocks[0].amount, 100000);
  assert.equal(
    m.attendOk,
    run(OVER_24_25, { ...D, 'attendance.overLimitTolerance': 0.5 }).attendOk,
    'cùng kết luận với chuyên cần'
  );
  const over = blockOf('nv', THR, { 'attendance.overLimitTolerance': 0.1 });
  assert.equal(run(OVER_24_25, over).blocks[0].lost, true, 'ngưỡng 24,1: 24,25 vẫn mất');
});

test('1c-4: ghi đè type.<mã>.overLimitHours của chức vụ thắng ngưỡng chung và CỘNG biên độ (một ngưỡng cho cờ, tiền và khối)', () => {
  const tol = { 'attendance.overLimitTolerance': 1 };
  // ghi đè 24 + biên độ 1 = ngưỡng 25: 24,25 chưa mất
  assert.equal(run(OVER_24_25, blockOf('nv', THR, { ...tol, 'type.nv.overLimitHours': 24 })).blocks[0].lost, false);
  // ghi đè 23 + biên độ 1 = ngưỡng 24: 24,25 mất, 23,75 không
  assert.equal(run(OVER_24_25, blockOf('nv', THR, { ...tol, 'type.nv.overLimitHours': 23 })).blocks[0].lost, true);
  assert.equal(run(OVER_23_75, blockOf('nv', THR, { ...tol, 'type.nv.overLimitHours': 23 })).blocks[0].lost, false);
  // không biên độ: ghi đè 25 thì 24,25 chưa mất; ghi đè 23 thì 23,75 mất
  assert.equal(run(OVER_24_25, blockOf('nv', THR, { 'type.nv.overLimitHours': 25 })).blocks[0].lost, false);
  assert.equal(run(OVER_23_75, blockOf('nv', THR, { 'type.nv.overLimitHours': 23 })).blocks[0].lost, true);
  // null là "không ghi đè": quay về ngưỡng chung + biên độ (24 + 1 = 25)
  assert.equal(run(OVER_24_25, blockOf('nv', THR, { ...tol, 'type.nv.overLimitHours': null })).blocks[0].lost, false);
});

test('1c-4: cờ chuyên cần (attendOk), tiền chuyên cần và khối cùng ngưỡng khi chức vụ ghi đè ngưỡng và có biên độ: không có ca nào cờ báo giữ mà tiền bằng 0', () => {
  for (const [override, tolerance] of [
    [null, 0],
    [24, 1],
    [23, 1],
    [25, 0],
    [24, 0.5],
    [23, 0.5]
  ]) {
    for (const id of [OVER_24_25, OVER_23_75]) {
      const extra = { 'type.nv.overLimitHours': override, 'attendance.overLimitTolerance': tolerance };
      const m = run(id, blockOf('nv', THR, extra));
      const label = `${id} ghi đè ${override} biên độ ${tolerance}`;
      assert.equal(m.attendance > 0, m.attendOk, `${label}: tiền chuyên cần phải khớp cờ`);
      assert.equal(m.blocks[0].lost, !m.attendOk, `${label}: khối mất đúng khi chuyên cần mất`);
      assert.equal(m.blocks[0].amount, m.attendOk ? 100000 : 0, label);
    }
  }
  // một ca cụ thể: ghi đè 23 + biên độ 0,5 = 23,5 thì 23,75 giờ mất cả chuyên cần lẫn khối
  const m = run(OVER_23_75, blockOf('nv', THR, { 'type.nv.overLimitHours': 23, 'attendance.overLimitTolerance': 0.5 }));
  assert.deepEqual([m.attendOk, m.attendance, m.blocks[0].lost, m.blocks[0].amount], [false, 0, true, 0]);
});

test('1c-4: khối mất theo ngày nghỉ ở chức vụ KHÔNG có đi lại và chuyên cần (TTS): ngày nghỉ tính như bộ máy, 3 ngày không lương thì mất, 1 ngày thì không', () => {
  const loss = { kind: 'absentDays', days: 3 };
  const P = blockOf('tts', loss);
  const three = run('s20261015-00020', P); // nghỉ không lương 3 ngày
  assert.equal(three.absent, 0, 'bộ máy không tính r.absent cho chức vụ này');
  assert.equal(three.blocks[0].lost, true);
  assert.equal(three.blocks[0].amount, 0);
  const one = run('s20261015-00015', P); // 1 ngày
  assert.equal(one.blocks[0].lost, false);
  assert.equal(one.blocks[0].amount, 100000);
  // làm bù trừ vào ngày nghỉ như công thức của bộ máy: 00004 nghỉ 2, làm bù 1, còn 1 < 3
  assert.equal(run('s20261015-00004', P).blocks[0].lost, false);
});

test('1c-4: khối mất theo ngày nghỉ ở chức vụ có chuyên cần (NV) cho cùng kết quả như trước: dùng r.absent của bộ máy', () => {
  const m = runInput(withUnpaid(3), blockOf('nv', { kind: 'absentDays', days: 3 }));
  assert.equal(m.absent, 3);
  assert.equal(m.blocks[0].lost, true);
  const fewer = runInput(withUnpaid(1), blockOf('nv', { kind: 'absentDays', days: 3 }));
  assert.equal(fewer.absent, 1);
  assert.equal(fewer.blocks[0].lost, false);
});

test('1c-4: ngày nghỉ không lương được miễn (absentExempt) không tính vào ngày nghỉ xét chuyên cần của khối: cùng con số r.absent của bộ máy', () => {
  const loss = { kind: 'absentDays', days: 2 };
  const exempt = (key?) => id => {
    const input = copy(golden.cases.find(c => c.id === id).input);
    input.days[key].absentExempt = true;
    return PayrollEngine.create(blockOf('nv', loss)).computeMonth(input).m;
  };
  // ca gốc: 2 ngày nghỉ không lương (01 và 02/10), ngưỡng mất là 2 ngày (gte)
  const base = run(OVER_23_75, blockOf('nv', loss));
  assert.equal(base.absent, 2);
  assert.equal(base.blocks[0].lost, true, 'chưa miễn: 2 ngày nghỉ thì mất');
  // miễn một ngày: còn 1 ngày nghỉ xét chuyên cần, khối giữ nguyên
  const one = exempt('2026-10-02')(OVER_23_75);
  assert.equal(one.absent, 1);
  assert.equal(one.unpaid, 2, 'ngày nghỉ không lương vẫn là hai ngày, chỉ không tính vào chuyên cần');
  assert.equal(one.blocks[0].lost, false);
  assert.equal(one.blocks[0].amount, 100000);
  // chức vụ không có chuyên cần (TTS): khối vẫn dùng số ngày nghỉ đã trừ ngày được miễn
  const tts = withUnpaid(3, 'tts');
  const unpaidDays = Object.keys(tts.days).filter(d => tts.days[d].kind === 'unpaid');
  assert.equal(unpaidDays.length, 3);
  const P = blockOf('tts', { kind: 'absentDays', days: 3 });
  assert.equal(runInput(copy(tts), P).blocks[0].lost, true);
  tts.days[unpaidDays[0]].absentExempt = true;
  assert.equal(runInput(tts, P).blocks[0].lost, false, 'miễn một ngày: còn 2 < 3');
});

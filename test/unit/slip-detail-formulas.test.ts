'use strict';
// Công thức dưới từng dòng ở phần "Chi tiết" của phiếu Admin (src/domain/payroll/slip-formulas.ts → formulasOf).
// Mỗi công thức là chuỗi chữ kiểu vi-VN (6.000.000 ÷ 26 × 1; 1,5; 25%): test tự đọc chuỗi (không dùng giá trị mà module giữ) rồi tính
// bằng × ÷ + − và so với số tự tính của dòng, sai không quá 1 đồng mỗi bước làm tròn. Người mẫu: NV bậc 1, lương cơ bản 6.000.000 ₫,
// ngày công chuẩn 26, lương ngày 230.769,23 ₫, lương giờ 28.846,15 ₫.
require('../helpers/require-isolated-database');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const Engine = require('../../src/engine/payroll-engine');
const { DEFAULTS } = require('../helpers/defaults-old-basis.js');
const { cellsOf } = require('../../src/domain/payroll/slip-paid');
const { allowanceTotalOf } = require('../../src/domain/period/period-allowance');
const { formulasOf } = require('../../src/domain/payroll/slip-formulas');
const F = require('../helpers/schedule-fixtures');
const Cases = require('../helpers/payroll-cases');

const { evaluate, near, isArithmetic, plainAll } = require('../helpers/formula-eval');

/* ---------- dựng phiếu từ bộ máy ---------- */
const KINDS = { Normal1: 'normal', Flex1: 'flex', Night1: 'night', Night2: 'night', n1: 'normal', g2: 'night' };
const ASSIGNED = { ...DEFAULTS, 'shift.allowance.basis': 'assigned', 'type.nv.nightPct': 40 };
for (const [code, kind] of Object.entries<any>(KINDS)) ASSIGNED[`shift.kind.${code}`] = kind;
const NIGHT = {
  username: 'qa_f_night',
  type: 'nv',
  level: 1,
  nightPct: 40,
  startDate: '2025-01-06',
  shiftCode: 'Night2'
};
const DAY = { ...NIGHT, username: 'qa_f_day', shiftCode: 'Normal1' };
const work = (tin = '08:00', tout = '17:00', extra: any = {}) => ({
  kind: 'work',
  in: tin,
  out: tout,
  preset: 'Normal1',
  ...extra
});
const nightShift = (extra: any = {}) => ({ kind: 'work', in: '22:00', out: '07:00', preset: 'Night2', ...extra });
const clone = (v?) => JSON.parse(JSON.stringify(v));

function slipOf(staff?, days?, { holidays = [], params = ASSIGNED, month = '2026-10', kpi = null, entries }: any = {}) {
  const m = Engine.create(params).calcMonth(staff, days, kpi, holidays, month, null, entries, '2026-11-05T00:00:00Z');
  return fromMonth(m, staff, params, month);
}
function fromMonth(m?, staff?, params?, month?) {
  const snapshot = clone({ ...m, trace: m.trace });
  const cells = cellsOf(snapshot);
  const formulas = plainAll(formulasOf({ snapshot, staffTerms: staff, params, month, cells }));
  return { snapshot, cells, formulas, n: snapshot.net, f: formulas };
}
// số tự tính mà mỗi công thức phải tính ra
function targetsOf({ snapshot, cells, n }: any) {
  return {
    ...Object.fromEntries(
      [
        'workBase',
        'leavePay',
        'settlePay',
        'isatPay',
        'holidayPay',
        'otPay',
        'attendance',
        'travel',
        'flexPay',
        'breakPay',
        'nightPay',
        'kpiPay',
        'lateCut'
      ].map(k => [k, cells[k]])
    ),
    kpiPct: snapshot.kpiPct,
    allowanceTotal: allowanceTotalOf(snapshot),
    gross: n.gross,
    exempt: n.exempt,
    taxable: n.taxable,
    afterInsurance: n.gross - n.insurance,
    insurance: n.insurance,
    tax: n.tax,
    advance: n.advance,
    net: n.net
  };
}
// mọi công thức dạng phép tính của phiếu phải tính ra số của dòng; trả danh sách khoá đã kiểm
function checkAll(slip?, label?) {
  const targets = targetsOf(slip);
  const checked: any[] = [];
  for (const [key, text] of Object.entries<any>(slip.formulas)) {
    if (!(key in targets) || targets[key] == null) continue;
    if (!isArithmetic(text)) continue; // chữ ghi số quyết định (không đóng, không phát sinh, mất chuyên cần): kiểm riêng
    if (key === 'kpiPct') assert.ok(Math.abs(evaluate(text) - targets.kpiPct) < 0.01, `${label} kpiPct "${text}"`);
    else near(text, targets[key], `${label} ${key}`);
    checked.push(key);
  }
  return checked;
}
// số ngày hay giờ mà chuỗi dòng đếm liệt kê: "01–03/10, 06/10" → 4 ngày; "05/10 (4 giờ), 06/10 (1,5 giờ)" → 5,5 giờ
function countedIn(text?) {
  const hours = [...text.matchAll(/\((\d+(?:,\d+)?) giờ\)/g)];
  if (hours.length) return hours.reduce((s, x) => s + Number(x[1].replace(',', '.')), 0);
  return text.split(', ').reduce((s, part) => {
    const range = /^(\d\d)–(\d\d)\/\d\d$/.exec(part);
    return s + (range ? Number(range[2]) - Number(range[1]) + 1 : 1);
  }, 0);
}

/* ---------- ca có tên ---------- */
test('ngày NV thường: lương cơ bản, chuyên cần, đi lại, tổng phụ cấp, ngày công', async () => {
  const s = await slipOf(DAY, { '2026-10-05': work() });
  assert.equal(s.f.workDays, '05/10');
  assert.equal(s.f.workBase, '6.000.000 đ ÷ 26 ngày chuẩn × 1 ngày công');
  assert.equal(s.f.attendance, '6.000.000 đ × 25% × 1 ngày đi làm ÷ 26 ngày chuẩn');
  assert.equal(s.f.travel, '6.000.000 đ × 15% × 1 ngày đi làm ÷ 26 ngày chuẩn');
  assert.equal(s.f.allowanceTotal, '57.692 chuyên cần + 34.615 đi lại');
  assert.equal(s.f.gross, '230.769 lương ngày công + 92.307 phụ cấp');
  assert.equal(s.f.taxable, '323.076 tổng thu nhập − 0 miễn thuế');
  assert.equal(s.f.net, '323.076 tổng thu nhập − 0 bảo hiểm − 0 thuế − 0 tạm ứng');
  assert.deepEqual(checkAll(s, 'ngày thường').sort(), [
    'afterInsurance',
    'allowanceTotal',
    'attendance',
    'gross',
    'net',
    'taxable',
    'travel',
    'workBase'
  ]);
});

test('ca đêm 40 % qua ngày lễ 01/10: ngày 741.346 ₫ (403.846 + 129.808 + 207.692), phụ cấp 92.308', async () => {
  const s = await slipOf(NIGHT, { '2026-10-01': nightShift() }, { holidays: ['2026-10-01'] });
  assert.equal(Math.round(s.snapshot.rows[0].total), 741346);
  assert.equal(s.f.holidayPay, '6.000.000 đ ÷ 26 ngày chuẩn × 1 ngày lễ');
  assert.equal(s.f.workBase, '6 giờ thường của ca ngày lễ × 28.846,15 đ/giờ');
  assert.equal(s.f.otPay, '2 giờ lễ × 28.846,15 đ/giờ × 3 + 2 giờ đêm lễ × 28.846,15 đ/giờ × 0,6');
  assert.equal(s.f.nightPay, '1 ca đêm × 230.769 đ/ngày × 40%');
  assert.equal(s.f.breakPay, '1 giờ nghỉ đêm × 28.846,15 đ/giờ × 1,3');
  assert.equal(s.f.allowanceTotal, '57.692 chuyên cần + 34.615 đi lại + 37.500 nghỉ đêm + 92.308 ca đêm');
  assert.equal(s.f.ot30H, '01/10 (2 giờ)');
  assert.equal(
    Math.round(s.cells.workBase + s.cells.holidayPay + s.cells.otPay + s.cells.breakPay + s.cells.nightPay),
    741346
  );
  checkAll(s, 'ca đêm lễ');
});

test('giờ làm bù 4 giờ: 4 × 28.846,15 × 1 = 115.385', async () => {
  const s = await slipOf(DAY, {
    '2026-10-05': work(),
    '2026-10-06': work('08:00', '17:00', { extraKind: 'makeup', extraOut: '21:00' })
  });
  assert.equal(s.f.otPay, '4 giờ làm bù × 28.846,15 đ/giờ × 1');
  assert.equal(Math.round(s.cells.otPay), 115385);
  assert.equal(s.f.makeupHours, '06/10 (4 giờ)');
  assert.equal(s.f.workBase, '6.000.000 đ ÷ 26 ngày chuẩn × 2 ngày công');
  checkAll(s, 'làm bù');
});

test('OT ngày thường 4 giờ ×1,5', async () => {
  const s = await slipOf(DAY, { '2026-10-05': work('08:00', '17:00', { extraKind: 'ot', extraOut: '21:00' }) });
  assert.equal(s.f.otPay, '4 giờ OT × 28.846,15 đ/giờ × 1,5');
  assert.equal(s.f.ot15H, '05/10 (4 giờ)');
  checkAll(s, 'OT thường');
});

test('OT Chủ nhật ngoài lịch ×2 (ot.weekendRate)', async () => {
  const SUN = '2026-10-04';
  const staff = F.nvStaff();
  const days = { ...F.fullDays('2026-10', F.MON_SAT), [SUN]: { ...F.WORK, extraKind: 'ot', extraOut: '21:00' } };
  const sessions = [
    ...F.punches(staff, F.datesOn('2026-10', F.MON_SAT), { sched: F.MON_SAT }),
    ...F.punches(staff, [SUN], { sched: F.MON_SAT, to: 240 })
  ];
  const r = F.run(staff, days, {
    actualFrom: '2026-10-01',
    sessions,
    approvals: await F.approved(days, [], 'nv', [SUN])
  });
  const s = fromMonth(r.m, staff, r.params, '2026-10');
  assert.equal(s.f.otPay, '4 giờ OT cuối tuần × 28.846,15 đ/giờ × 2');
  assert.equal(s.f.ot20H, '04/10 (4 giờ)');
  assert.equal(s.f.insurance, '6.000.000 đ lương đóng bảo hiểm × 10,5%');
  checkAll(s, 'OT Chủ nhật');
});

test('nghỉ phép có lương, nghỉ không lương, đi muộn nửa giờ', async () => {
  const s = await slipOf(DAY, {
    '2026-10-05': { kind: 'leave' },
    '2026-10-06': { kind: 'unpaid' },
    '2026-10-07': work('08:30', '17:00')
  });
  assert.equal(s.f.leaveDays, '05/10');
  assert.equal(s.f.leavePay, '6.000.000 đ ÷ 26 ngày chuẩn × 1 ngày phép');
  assert.equal(s.f.unpaidDays, '06/10');
  assert.equal(s.f.lateCut, '0,5 giờ thiếu × 28.846,15 đ/giờ');
  assert.equal(s.f.debtH, '0,5 giờ thiếu');
  assert.equal(s.f.gross, '230.769 lương ngày công + 230.769 nghỉ phép + 92.307 phụ cấp − 14.423 đi muộn về sớm');
  checkAll(s, 'phép, trễ');
});

test('giờ thiếu lẻ phút ghi phân số để cộng lại đúng từng đồng (10 phút = 1/6 giờ)', async () => {
  const s = await slipOf(DAY, { '2026-10-05': work('08:10', '17:00') });
  assert.equal(s.f.lateCut, '1/6 giờ thiếu × 28.846,15 đ/giờ');
  checkAll(s, 'trễ 10 phút');
});

test('thực tập sinh: không phụ cấp, không bảo hiểm; thuế khấu trừ 10 % ghi số so với ngưỡng', () => {
  const tts = F.ttsStaff();
  const r = F.run(tts, F.fullDays('2026-10', F.MON_FRI), {});
  const s = fromMonth(r.m, tts, r.params, '2026-10');
  assert.equal(s.f.workBase, '2.000.000 đ ÷ 22 ngày chuẩn × 22 ngày công');
  assert.equal(s.f.attendance, undefined);
  assert.equal(s.f.travel, undefined);
  assert.equal(s.f.insurance, undefined);
  assert.match(s.f.tax, /^2\.000\.000 đ thu nhập < \d/);
  checkAll(s, 'TTS');
});

test('bảo hiểm: đủ công thì nền × 10,5 %; ngày có lương ít khiến ngày không lương từ 14 trở lên thì ghi phép trừ so với ngưỡng; không đóng thì không có công thức', () => {
  const full = F.fullDays('2026-10', F.MON_SAT);
  const staff = F.nvStaff();
  const paid = fromMonth(F.run(staff, full, {}).m, staff, DEFAULTS, '2026-10');
  assert.equal(paid.f.insurance, '6.000.000 đ lương đóng bảo hiểm × 10,5%');
  assert.equal(paid.n.insurance, 630000);
  checkAll(paid, 'bảo hiểm có');
  const gaps = { ...full };
  for (let d = 1; d <= 17; d += 1) {
    const date = `2026-10-${String(d).padStart(2, '0')}`;
    if (gaps[date]) gaps[date] = { kind: 'unpaid' };
  }
  const skipped = fromMonth(F.run(staff, gaps, {}).m, staff, DEFAULTS, '2026-10');
  assert.equal(skipped.n.insurance, 0);
  assert.equal(skipped.f.insurance, '26 ngày chuẩn − 12 ngày có lương = 14 ngày không lương ≥ 14 ngày');
  assert.equal(skipped.f.attendance, '15 ngày nghỉ ≥ 3 ngày tối đa');
  const none = F.nvStaff({ insured: false });
  const unins = fromMonth(F.run(none, full, {}).m, none, DEFAULTS, '2026-10');
  assert.equal(unins.n.insurance, 0);
  assert.equal(unins.f.insurance, undefined);
});

test('thuế TNCN > 0: (chịu thuế − bảo hiểm − giảm trừ) áp từng bậc; KPI năm thành phần', () => {
  const staff = F.nvStaff({ dependants: 1 });
  const over = { 'level.nv.1.base': 40000000 };
  const kpi = { method: 'five', parts: { wework: 90, user: 80, peer: 85, manager: 90, self: 100 } };
  const r = F.run(staff, F.fullDays('2026-10', F.MON_SAT), { over, kpi });
  const s = fromMonth(r.m, staff, r.params, '2026-10');
  assert.equal(s.n.tax, 3998369);
  assert.equal(
    s.f.tax,
    '10.000.000 đ trong bậc × 5% + 20.000.000 đ trong bậc × 10% + (63.391.846 đ thu nhập chịu thuế − 4.200.000 đ bảo hiểm − 15.500.000 đ giảm trừ bản thân − 1 người phụ thuộc × 6.200.000 đ/người − 30.000.000 đ cận dưới bậc) × 20%'
  );
  assert.equal(
    s.f.kpiPct,
    '40% × 90 điểm Base Wework + 24% × 80 điểm người dùng + 18% × 85 điểm đồng nghiệp + 12% × 90 điểm quản lý + 6% × 100 điểm tự đánh giá'
  );
  assert.equal(s.f.kpiPay, '6.000.000 đ lương KPI tối đa × 87,3%');
  assert.equal(s.f.net, '63.391.846 tổng thu nhập − 4.200.000 bảo hiểm − 3.998.369 thuế − 0 tạm ứng');
  const checked = checkAll(s, 'thuế');
  for (const key of ['tax', 'insurance', 'kpiPct', 'kpiPay', 'exempt'].filter(k => s.f[k]))
    assert.ok(checked.includes(key) || key === 'exempt', key);
});

test('tạm ứng đã duyệt: tỷ lệ × lương ngày × số ngày đi làm tới ngày 15', () => {
  const staff = F.nvStaff();
  const days = F.fullDays('2026-10', F.MON_SAT);
  const m = Engine.create(DEFAULTS).calcMonth(
    staff,
    days,
    null,
    [],
    '2026-10',
    null,
    undefined,
    '2026-11-05T00:00:00Z',
    {
      advance: true
    }
  );
  const s = fromMonth(m, staff, DEFAULTS, '2026-10');
  assert.ok(s.n.advance > 0);
  assert.equal(s.f.advance, '80% × (6.000.000 đ ÷ 26 ngày chuẩn × 13 ngày công)');
  checkAll(s, 'tạm ứng');
});

test('phép dư hết hạn quy tiền: ngày × lương ngày', () => {
  const staff = F.nvStaff();
  const m = Engine.create(DEFAULTS).calcMonth(
    staff,
    F.fullDays('2026-10', F.MON_SAT),
    null,
    [],
    '2026-10',
    null,
    undefined,
    '2026-11-05T00:00:00Z',
    {
      settleDays: 2
    }
  );
  const s = fromMonth(m, staff, DEFAULTS, '2026-10');
  assert.equal(s.f.settlePay, '6.000.000 đ ÷ 26 ngày chuẩn × 2 ngày phép dư');
  checkAll(s, 'quyết toán');
});

test('khoản điền thêm (cộng, trừ sau thuế): tổng thu nhập cộng khoản cộng, thực nhận trừ khoản trừ', async () => {
  const staff = F.nvStaff();
  const entries = [
    {
      id: 1,
      direction: 'add',
      amount: 500000,
      label: 'Thưởng',
      taxMode: null,
      taxCap: null,
      insuranceBase: null,
      flagsConfirmedBy: null
    },
    {
      id: 2,
      direction: 'deduct',
      amount: 300000,
      label: 'Hoàn ứng',
      taxMode: null,
      taxCap: null,
      insuranceBase: null,
      flagsConfirmedBy: null
    }
  ];
  const s = await slipOf(staff, F.fullDays('2026-10', F.MON_SAT), { params: DEFAULTS, entries });
  assert.equal(s.n.entriesAdd, 500000);
  assert.match(s.f.gross, / \+ 500\.000 khoản cộng thêm$/);
  assert.match(s.f.net, / − 300\.000 khoản trừ khác$/);
  checkAll(s, 'khoản điền thêm');
});

test('khối phụ cấp do C&B thêm: số cố định, hoặc % lương cơ bản nhân tỷ lệ ngày đi làm', async () => {
  const params = {
    ...DEFAULTS,
    'block.def.thu': {
      label: 'Khối cố định',
      component: '3',
      method: 'fixed',
      scalesWithDays: false,
      tax: 'none',
      loss: null
    },
    'block.def.tyle': {
      label: 'Khối theo lương',
      component: '3',
      method: 'pctBase',
      scalesWithDays: true,
      tax: 'none',
      loss: null
    },
    'type.nv.block.thu.on': true,
    'type.nv.block.thu.amount': 100000,
    'type.nv.block.tyle.on': true,
    'type.nv.block.tyle.pct': 0.05
  };
  const s = await slipOf(F.nvStaff(), F.fullDays('2026-10', F.MON_SAT), { params });
  assert.equal(s.f['block:thu'], '100.000 đ cố định');
  assert.equal(s.f['block:tyle'], '6.000.000 đ × 5% × 27 ngày đi làm ÷ 26 ngày chuẩn');
  assert.equal(
    s.f.allowanceTotal,
    '1.557.692 chuyên cần + 934.615 đi lại + 100.000 Khối cố định + 311.538 Khối theo lương'
  );
  checkAll(s, 'khối');
});

test('công thức không phụ thuộc số Admin sửa: cùng bản chụp, cùng tham số thì cùng công thức', async () => {
  const s = await slipOf(DAY, { '2026-10-05': work() });
  const again = plainAll(
    formulasOf({
      snapshot: s.snapshot,
      staffTerms: DAY,
      params: ASSIGNED,
      month: '2026-10',
      cells: { ...s.cells, travel: 999999 }
    })
  );
  assert.equal(again.travel, undefined, 'số tự tính khác công thức thì không có công thức (không chỉnh cho khớp)');
  assert.equal(again.attendance, s.f.attendance);
});

test('đọc chuỗi: số vi-VN, phần trăm, phân số, ngoặc, thứ tự phép tính', () => {
  assert.equal(evaluate('6.000.000 đ × 25% × 1 ngày đi làm ÷ 26 ngày chuẩn').toFixed(2), '57692.31');
  assert.equal(
    evaluate('2 giờ lễ × 28.846,15 đ/giờ × 3 + 2 giờ đêm lễ × 28.846,15 đ/giờ × 0,6').toFixed(2),
    '207692.28'
  );
  assert.equal(
    evaluate('10.000.000 đ trong bậc × 5% + (63.391.846 đ thu nhập chịu thuế − 4.200.000 đ bảo hiểm) × 20%').toFixed(1),
    '12338369.2'
  );
  assert.equal(evaluate('80% × (6.000.000 đ ÷ 26 ngày chuẩn × 13 ngày công)').toFixed(2), '2400000.00');
});

/* ---------- quét nhiều ca sinh ngẫu nhiên có hạt ---------- */
test('quét 500 ca: mọi công thức dạng phép tính tính ra đúng số của dòng; dòng tiền khác 0 đều có công thức', () => {
  const cases = Cases.generateCases(20261029, 500);
  const missing: Record<string, any> = {};
  const seen = new Set<any>();
  let slips = 0;
  for (const cs of cases) {
    const r = Engine.computeMonth(cs.input, DEFAULTS);
    const s = fromMonth(r.m, cs.input.staff, DEFAULTS, cs.input.month);
    if (!s.cells) continue;
    slips += 1;
    for (const key of checkAll(s, cs.id)) seen.add(key);
    const nonZero = {
      ...targetsOf(s),
      workDays: s.cells.workDays,
      unpaidDays: s.cells.unpaidDays,
      leaveDays: s.cells.leaveDays
    };
    // ngày chỉ có giờ làm thêm mà giờ ca chính trùng ngày lễ: số ngày công đã trừ phần trùng, công thức ngày công chưa dựng phần này
    const holidayOverlapOnly = r.m.rows.some(row => row.extraOnly && Number(row.holMainH) > 0);
    for (const [key, value] of Object.entries<any>(nonZero))
      if (['kpiPct', 'allowanceTotal', 'afterInsurance'].includes(key)) continue;
      else if (key === 'workBase' && holidayOverlapOnly) continue;
      else if (Math.abs(value || 0) > 0.5 && !s.f[key]) (missing[key] = missing[key] || []).push(cs.id);
    for (const key of ['workDays', 'unpaidDays', 'leaveDays', 'isatDays', 'holidayDays', 'ot15H', 'ot20H', 'ot30H'])
      if (s.f[key])
        assert.ok(
          Math.abs(countedIn(s.f[key]) - s.cells[key]) < 0.01,
          `${cs.id} ${key} "${s.f[key]}" đếm ${s.cells[key]}`
        );
  }
  assert.ok(slips > 400, `chỉ ${slips} phiếu`);
  assert.deepEqual(missing, {}, 'dòng khác 0 mà không dựng được công thức');
  for (const key of [
    'workBase',
    'otPay',
    'attendance',
    'travel',
    'insurance',
    'tax',
    'exempt',
    'nightPay',
    'gross',
    'net'
  ])
    assert.ok(seen.has(key), `bộ ca quét không có ca nào kiểm ${key}`);
});

'use strict';
// Tổng bằng tổng các dòng nguyên đồng: mỗi dòng tiền hiện trên phiếu (lương theo ngày công, nghỉ lễ, phép, iSAT, làm thêm, từng phụ cấp, khối, khoản điền thêm)
// làm tròn đồng MỘT lần; tổng phụ cấp, tổng thu nhập, thu nhập chịu thuế, sau bảo hiểm, thực nhận là cộng trừ đúng các số nguyên đó. Quét nhiều tháng sinh
// từ hạt giống: mọi tổng bằng tổng các dòng hiện ra, không trường tiền nào có phần lẻ, Thành tiền các ngày cộng đúng tiền ngày của tháng và bốn cột
// của từng ngày cộng đúng Thành tiền; công thức dưới dòng tính ra đúng số của dòng (kể cả các tổng).
require('../helpers/require-isolated-database');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const Engine = require('../../src/engine/payroll-engine');
const { DEFAULTS } = require('../helpers/defaults-old-basis.js');
const { cellsOf, withDayFigures } = require('../../src/domain/payroll/slip-paid');
const { allowanceTotalOf } = require('../../src/domain/period/period-allowance');
const { formulasOf } = require('../../src/domain/payroll/slip-formulas');
const { generateCases } = require('../helpers/payroll-cases');
const { evaluate } = require('../helpers/formula-eval');
const F = require('../helpers/schedule-fixtures');

const SEED = 20261029;
const COUNT = 600;
const clone = (v?) => JSON.parse(JSON.stringify(v));
const isInt = (v?) => Number.isInteger(v);
const num = (v?) => (typeof v === 'number' ? v : 0);

// các khoá tiền của m, m.net và m.trace (số lượng, tỷ lệ, giờ không phải tiền)
const M_MONEY = ['total', 'work', 'travel', 'attendance', 'allow', 'kpiPay', 'settlePay'];
const NET_MONEY = [
  'gross',
  'exemptNight',
  'exemptOt',
  'exempt',
  'taxable',
  'bhxh',
  'bhyt',
  'bhtn',
  'insurance',
  'employer',
  'deduction',
  'assessable',
  'tax',
  'advance',
  'net',
  'entriesAdd',
  'entriesDeduct'
];
const TRACE_COUNT = ['ngayDiLam', 'tyLeNgayDiLam', 'heSoNgayKpi', 'gioVuotNguong'];
const LINE_CELLS = [
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
  'kpiPay'
];

// Tính chuỗi công thức cộng trừ của phiếu ("173.077 lương ngày công + 230.769 nghỉ lễ − 14.423 đi muộn về sớm") bằng bộ đọc chung
const evalSum = (text?) => evaluate(text);
const plain = (text?) => text.split(String.fromCharCode(0xa0)).join(' ');

const run = (input?, params = DEFAULTS) => Engine.create(params).computeMonth(clone(input));
function describe(m?, staff?, params?, month?) {
  const snapshot = clone({ ...m, trace: m.trace });
  const cells = cellsOf(snapshot);
  const formulas = formulasOf({ snapshot, staffTerms: staff, params, month, cells });
  return { snapshot, cells, formulas };
}
const blocksSum = (m?) => (m.blocks || []).reduce((s, b) => s + b.amount, 0);

// Mọi kiểm tra của một tháng đã tính
function checkMonth(m?, label?, { pinned = false }: any = {}) {
  const whole = (field?, v?) => assert.ok(isInt(v), `${label}: ${field} = ${v} có phần lẻ`);
  for (const k of M_MONEY) whole(`m.${k}`, num(m[k]));
  for (const k of NET_MONEY) if (k in m.net) whole(`m.net.${k}`, m.net[k]);
  for (const [k, v] of Object.entries<any>(m.trace))
    if (!TRACE_COUNT.includes(k) && typeof v === 'number') whole(`trace.${k}`, v);
  for (const [k, v] of Object.entries<any>(m.lines)) whole(`lines.${k}`, v);
  for (const b of m.blocks || []) whole(`blocks.${b.code}`, b.amount);
  const snapshot = clone({ ...m, trace: m.trace });
  const cells = cellsOf(snapshot);
  for (const k of [...LINE_CELLS, 'lateCut']) whole(`cells.${k}`, cells[k]);

  // tổng thu nhập = cộng các dòng hiện ra − trừ đi muộn về sớm
  const income = LINE_CELLS.reduce((s, k) => s + cells[k], 0) + blocksSum(m) + num(m.net.entriesAdd);
  assert.equal(m.total, income - cells.lateCut, `${label}: tổng thu nhập = tổng các dòng`);
  assert.equal(m.net.gross, m.total, `${label}: gross`);
  // tổng phụ cấp
  const allowance = cells.attendance + cells.travel + cells.flexPay + cells.breakPay + cells.nightPay + blocksSum(m);
  assert.equal(allowanceTotalOf(snapshot), allowance, `${label}: tổng phụ cấp = cộng các dòng phụ cấp`);
  // các tổng sau thuế
  const n = m.net;
  assert.equal(n.taxable, Math.max(0, n.gross - n.exempt), `${label}: thu nhập chịu thuế`);
  assert.equal(n.net, n.gross - n.insurance - n.tax - n.advance - num(n.entriesDeduct), `${label}: thực nhận`);
  assert.equal(n.insurance, n.bhxh + n.bhyt + n.bhtn, `${label}: bảo hiểm`);
  // vết tiền ngày cộng đúng tiền ngày của tháng, tiền ngày + phần còn lại = tổng thu nhập
  const t = m.trace;
  assert.equal(
    t.tienNgayCong + t.phuCapCa + t.gioNghiDem + t.lamBu + t.tienOt + t.tienLamLe,
    t.tongThanhPhanNgay,
    `${label}: vết tiền ngày`
  );
  assert.equal(
    t.tongThanhPhanNgay + m.allow + m.kpiPay + num(m.settlePay) + blocksSum(m) + num(n.entriesAdd),
    m.total,
    `${label}: tiền ngày + phần còn lại = tổng thu nhập`
  );
  assert.equal(t.tongThuNhap, m.total, `${label}: vết tổng thu nhập`);
  // Thành tiền các ngày cộng đúng tiền ngày của tháng; bốn cột của ngày cộng đúng Thành tiền
  const rows = m.rows.filter(r => r.kind !== 'invalid');
  if (!pinned)
    assert.equal(
      rows.reduce((s, r) => s + r.pay, 0),
      m.work,
      `${label}: Thành tiền các ngày = tiền ngày của tháng`
    );
  for (const r of rows) {
    whole(`rows ${r.date} pay`, r.pay);
    if (r.kind === 'work' || (r.kind === 'holiday' && r.hours > 0)) {
      const c = Engine.columnsOfDay(r);
      for (const k of Object.keys(c)) whole(`rows ${r.date} cot.${k}`, c[k]);
      assert.equal(c.luongNgay + c.phuCapCa + c.lamThem - c.truGio, r.pay, `${label} ${r.date}: bốn cột = Thành tiền`);
    }
  }
}

test('quét nhiều tháng: mọi tổng bằng tổng các dòng nguyên đồng, không trường tiền nào có phần lẻ', async () => {
  let months = 0;
  for (const c of generateCases(SEED, COUNT)) {
    let out;
    try {
      out = run(c.input);
    } catch {
      continue; // đầu vào sai hồ sơ: bộ máy ném lỗi trước khi tính
    }
    months += 1;
    await checkMonth(out.m, c.id);
  }
  assert.ok(months >= COUNT / 2, `đủ tháng để quét (${months})`);
});

test('quét nhiều tháng: công thức dưới dòng và các tổng tính ra đúng số nguyên của dòng', () => {
  let checked = 0;
  for (const c of generateCases(SEED + 1, 300)) {
    let out;
    try {
      out = run(c.input);
    } catch {
      continue;
    }
    const { m } = out;
    const { formulas: f, snapshot } = describe(m, c.input.staff, DEFAULTS, c.input.month);
    const n = m.net;
    if (f.gross) assert.equal(evalSum(f.gross), n.gross, `${c.id}: công thức tổng thu nhập`);
    if (f.allowanceTotal) assert.equal(evalSum(f.allowanceTotal), allowanceTotalOf(snapshot), `${c.id}: tổng phụ cấp`);
    assert.equal(evalSum(f.taxable), n.taxable, `${c.id}: chịu thuế`);
    assert.equal(evalSum(f.afterInsurance), n.gross - n.insurance, `${c.id}: sau bảo hiểm`);
    assert.equal(evalSum(f.net), n.net, `${c.id}: thực nhận`);
    checked += 1;
  }
  assert.ok(checked > 100, `đủ tháng để quét (${checked})`);
});

/* ---------- số tham chiếu ---------- */
const NIGHT = {
  username: 'qa_t_night',
  type: 'nv',
  level: 1,
  nightPct: 40,
  startDate: '2025-01-06',
  shiftCode: 'Night2'
};
const DAY = { ...NIGHT, username: 'qa_t_day', shiftCode: 'Normal1' };
const ASSIGNED = { ...DEFAULTS, 'shift.allowance.basis': 'assigned', 'type.nv.nightPct': 40 };
for (const [code, kind] of Object.entries<any>({ Normal1: 'normal', Flex1: 'flex', Night1: 'night', Night2: 'night' }))
  ASSIGNED[`shift.kind.${code}`] = kind;
const calc = (staff?, days?, { holidays = [], params = ASSIGNED, month = '2026-10' }: any = {}) =>
  Engine.create(params).calcMonth(staff, days, null, holidays, month, null, undefined, '2026-11-05T00:00:00Z');

test('ca đêm lễ 01/10: ngày 741.346 = 403.846 + 129.808 + 207.692, tổng thu nhập 833.653 = 173.077 + 230.769 + 207.692 + 222.115', async () => {
  const night = { kind: 'work', in: '22:00', out: '07:00', preset: 'Night2' };
  const m = calc(NIGHT, { '2026-10-01': night }, { holidays: ['2026-10-01'] });
  assert.equal(m.rows[0].pay, 741346);
  assert.equal(m.rows[0].pay, 403846 + 129808 + 207692);
  const { cells, formulas, snapshot } = describe(m, NIGHT, ASSIGNED, '2026-10');
  assert.deepEqual(
    [cells.workBase, cells.holidayPay, cells.otPay, cells.breakPay + cells.nightPay],
    [173077, 230769, 207692, 129808]
  );
  assert.equal(allowanceTotalOf(snapshot), 222115);
  assert.equal(m.total, 833653);
  assert.equal(m.net.gross, 833653);
  assert.equal(m.net.gross, 741346 + 34615 + 57692);
  assert.equal(plain(formulas.allowanceTotal), '57.692 chuyên cần + 34.615 đi lại + 37.500 nghỉ đêm + 92.308 ca đêm');
  assert.equal(plain(formulas.gross), '173.077 lương ngày công + 230.769 nghỉ lễ + 207.692 làm thêm + 222.115 phụ cấp');
  assert.equal(evalSum(formulas.gross), 833653);
  assert.equal(m.net.exempt, 193269);
  await checkMonth(m, 'ca đêm lễ');
});

test('một ngày NV 07:55–17:10 ngày 01/10: tổng thu nhập 323.076 = 230.769 + 57.692 + 34.615, không đóng bảo hiểm', async () => {
  const day = { kind: 'work', in: '07:55', out: '17:10', preset: 'Normal1' };
  const m = calc(DAY, { '2026-10-01': day }, { params: DEFAULTS });
  assert.equal(m.net.gross, 323076);
  assert.equal(m.net.insurance, 0);
  assert.equal(m.net.net, 323076);
  assert.equal(m.total, m.lines.workBase + m.attendance + m.travel);
  await checkMonth(m, 'một ngày');
});

test('OT ngày thường 4 giờ: otPay 173.077, miễn thuế 57.692; OT Chủ nhật được duyệt 4 giờ: 230.769', async () => {
  const ot = { kind: 'work', in: '08:00', out: '17:00', preset: 'Normal1', extraKind: 'ot', extraOut: '21:00' };
  const m = calc(DAY, { '2026-10-05': ot });
  const { cells } = describe(m, DAY, ASSIGNED, '2026-10');
  assert.equal(cells.otPay, 173077);
  assert.equal(m.net.exemptOt, 57692);
  await checkMonth(m, 'OT ngày thường');

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
  assert.equal(cellsOf(clone({ ...r.m, trace: r.m.trace })).otPay, 230769);
  await checkMonth(r.m, 'OT Chủ nhật');
});

/* ---------- khối phụ cấp, khoản điền thêm, quyết toán phép, tạm ứng, ô số lượng ghim ---------- */
const ENTRIES = [
  { id: 1, direction: 'add', amount: 123457, label: 'Thưởng', taxMode: 'full', flagsConfirmedBy: 'ketoan' },
  { id: 2, direction: 'deduct', amount: 5001, label: 'Trừ' }
];
const BLOCK_PARAMS = {
  ...DEFAULTS,
  'block.def.thu': { label: 'Khoản thu lẻ', component: '3', method: 'pctBase', scalesWithDays: true, tax: 'none' },
  'type.nv.block.thu.on': true,
  'type.nv.block.thu.pct': 0.0333
};

test('khối phụ cấp lẻ, khoản điền thêm, quyết toán phép, tạm ứng đã duyệt: mỗi dòng nguyên đồng, tổng đúng bằng tổng các dòng', async () => {
  let checked = 0;
  let advanced = 0;
  for (const c of generateCases(SEED + 2, 200)) {
    if (c.input.staff.type !== 'nv') continue;
    let m;
    try {
      m = Engine.create(BLOCK_PARAMS).calcMonth(
        clone(c.input.staff),
        clone(c.input.days),
        c.input.kpi ?? null,
        c.input.holidays || [],
        c.input.month,
        c.input.upTo ?? null,
        ENTRIES,
        '2026-11-05T00:00:00Z',
        { advance: true, settleDays: 1.5 }
      );
    } catch {
      continue;
    }
    assert.ok(m.blocks && m.blocks.length === 1, `${c.id}: có khối`);
    assert.ok(m.settlePay > 0, `${c.id}: có quyết toán phép`);
    advanced += m.net.advance > 0 ? 1 : 0;
    await checkMonth(m, c.id);
    checked += 1;
  }
  assert.ok(checked > 10 && advanced > 0, `đủ tháng để quét (${checked}, có tạm ứng ${advanced})`);
});

test('ô số lượng ghim (ngày công, giờ OT): các dòng sau ghim vẫn nguyên đồng và tổng bằng tổng các dòng', async () => {
  let checked = 0;
  for (const c of generateCases(SEED + 3, 200)) {
    if (c.input.staff.type !== 'nv') continue;
    let out;
    try {
      out = run(c.input);
    } catch {
      continue;
    }
    const pinned = Engine.create(DEFAULTS).repin(
      out.m,
      c.input.staff,
      { workDays: out.m.count + 2, ot15H: 3, leaveDays: 1 },
      c.input.month
    );
    if (!pinned) continue;
    await checkMonth(pinned, c.id, { pinned: true });
    checked += 1;
  }
  assert.ok(checked > 10, `đủ tháng để quét (${checked})`);
});

test('ca đêm 07/10 sang lễ 08/10: Thành tiền ngày 859.615; 13 ngày công đóng bảo hiểm 630.000, 1 ngày công không đóng', async () => {
  const night = { kind: 'work', in: '22:00', out: '07:00', preset: 'Night2' };
  const m = calc(NIGHT, { '2026-10-07': night }, { holidays: ['2026-10-08'] });
  assert.equal(m.rows.find(r => r.date === '2026-10-07').pay, 859615);
  await checkMonth(m, 'ca đêm sang lễ');

  const days = Object.fromEntries(
    F.datesOn('2026-10', F.MON_SAT)
      .slice(0, 13)
      .map(d => [d, { ...F.WORK }])
  );
  const thirteen = F.run(F.nvStaff(), days);
  assert.equal(thirteen.m.net.insurance, 630000);
  await checkMonth(thirteen.m, '13 ngày công');
  const one = F.run(F.nvStaff(), { '2026-10-01': { ...F.WORK } });
  assert.equal(one.m.net.insurance, 0);
  await checkMonth(one.m, '1 ngày công');
});

/* ---------- phiếu phát nhân viên (trang 1 phiếu A4): các ô tiền của ngày cộng đúng Thành tiền, Thành tiền cộng đúng tiền ngày ---------- */
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
function loadPhieu() {
  const esc = (value?) =>
    String(value ?? '').replace(
      /[&<>"']/g,
      c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
    );
  const Admin = {
    esc,
    ic: () => '',
    actions: {} as Record<string, any>,
    S: {} as Record<string, any>,
    TYPE_SHORT: { nv: 'NV', ctv: 'CTV', tts: 'TTS' },
    TYPE_LONG: { nv: 'Nhân viên', ctv: 'Cộng tác viên', tts: 'Thực tập sinh' },
    levelText: () => 'Bậc',
    levelNames: { name: () => 'Bậc' },
    fmtStamp: (iso?) => String(iso)
  };
  const context = vm.createContext({ console, window: { Admin } });
  for (const file of ['view-phieu.js', 'phieu-a4.js', 'phieu-a4-days.js'])
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../../src/engine/admin', file), 'utf8'), context, {
      filename: file
    });
  return (Admin as any).Phieu;
}
const cellText = (td?) =>
  td
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
// "403.846" → 403846; "—" → 0; "−14.423" → -14423; "2 giờ OT chưa tính" → 0
function cellMoney(td?) {
  const t = cellText(td);
  if (!/^[−-]?\d{1,3}(\.\d{3})*$/.test(t)) return 0;
  return (t.startsWith('−') || t.startsWith('-') ? -1 : 1) * Number(t.replace(/[^\d]/g, ''));
}

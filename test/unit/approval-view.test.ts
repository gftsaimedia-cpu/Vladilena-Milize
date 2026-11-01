// Khoản tự khai "chờ duyệt": module dùng chung src/engine/approval-view.ts và số tiền qua calcMonth thật.
// Số tiền tính bằng khối công thức đóng băng (test/fixtures/legacy-payroll-block.js) nạp vào vm như payroll-attendance.test.ts.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const ApprovalView = require('../../src/engine/approval-view');
const { loadPayroll } = require('../helpers/payroll-vm');
const Engine = require('../../src/engine/payroll-engine');
const { DEFAULTS } = require('../../src/engine/payroll-params');
const { declaredPunches } = require('../helpers/declared-punches');

const {
  api: { calcMonth }
} = loadPayroll({ exports: ['calcMonth'], timeout: 1000 });

const { itemOf, fingerprint, effectiveStatus, payView, POLICY } = ApprovalView;

// ---------- dữ liệu mẫu ----------
const NV_L1 = { type: 'nv', level: 1, nightPct: 40 };
// Lương cơ bản NV L1 6.000.000, 26 ngày công: lương ngày 230.769,23; lương giờ 28.846,15.
// Chuyên cần 25% và đi lại 15% lương cơ bản, nhân (số ngày đi làm / 26).
const WORK = {
  kind: 'work',
  shift: 'normal',
  in: '08:00',
  out: '17:00',
  extraKind: '',
  extraIn: '',
  extraOut: '',
  preset: '',
  breakMin: 0
};
const ot = (extraOut = '19:00', more: any = {}) => ({ ...WORK, extraKind: 'ot', extraOut, ...more });
const makeupHours = (extraOut = '21:00', more: any = {}) => ({ ...WORK, extraKind: 'makeup', extraOut, ...more });

// Tháng 10/2026: 1/10 là Thứ 5. Thứ 7: 3, 10, 17, 24, 31. Không có ngày lễ.
function monthDates(sundays = false) {
  const out: any[] = [];
  for (let d = 1; d <= 31; d++) {
    const dow = new Date(Date.UTC(2026, 9, d)).getUTCDay();
    if (dow === 0 && !sundays) continue;
    out.push(`2026-10-${String(d).padStart(2, '0')}`);
  }
  return out;
}
const D = (day?) => `2026-10-${String(day).padStart(2, '0')}`;
// Mọi ngày Thứ 2 - Thứ 7 đi làm 08:00-17:00 (27 ngày), rồi ghi đè theo từng ca
function octoberOf(overrides: any = {}) {
  const days: Record<string, any> = {};
  for (const date of monthDates()) days[date] = { ...WORK };
  for (const [date, day] of Object.entries<any>(overrides)) {
    if (day === null) delete days[date];
    else days[date] = day;
  }
  return days;
}
function row(day?, status?, more: any = {}) {
  return { item: itemOf(day).item, status, fingerprint: fingerprint(day), rev: 1, ...more };
}
// statusByDate: ngày nào không liệt kê thì không có dòng duyệt (tức là chờ duyệt)
async function pay(staff?, days?, statusByDate: any = {}, kpi: any = null) {
  const rows: Record<string, any> = {};
  const statuses = { ...statusByDate };
  for (const [date, day] of Object.entries<any>(days))
    if (day.kind === 'willmakeup' && !Object.hasOwn(statuses, date)) statuses[date] = 'approved';
  for (const [date, status] of Object.entries<any>(statuses)) rows[date] = await row(days[date], status);
  const view = payView(days, rows);
  const real = calcMonth(staff, view.payDays, kpi, [], '2026-10', null);
  const all = calcMonth(staff, days, kpi, [], '2026-10', null);
  return { real, all, view, line: all.total - real.total };
}
const vnd = (value?) => Math.round(value);
const allDates = (days?, status?) => Object.fromEntries(Object.keys(days).map(date => [date, status]));
const itemDates = (days?) => Object.keys(days).filter(date => itemOf(days[date]));
const deepFreeze = (value?) => {
  if (value && typeof value === 'object') Object.values<any>(value).forEach(deepFreeze);
  return Object.freeze(value);
};

// ---------- itemOf ----------
test('itemOf: ngày iSAT là mục isat', () => {
  assert.equal(itemOf({ kind: 'isat' }).item, 'isat');
});
test('itemOf: ngày "Nghỉ được duyệt" là mục approved', () => {
  assert.equal(itemOf({ kind: 'approved' }).item, 'approved');
});
test('itemOf: ngày loại cũ kind makeup (Làm bù cả ngày) không còn là khoản cần duyệt', () => {
  assert.equal(itemOf({ ...WORK, kind: 'makeup' }), null);
  assert.equal(fingerprint({ ...WORK, kind: 'makeup' }), '');
});
test('itemOf: ngày làm có OT sau ca là mục ot', () => {
  assert.equal(itemOf(ot('19:00')).item, 'ot');
});
test('itemOf: OT trước ca (extraIn) cũng là mục ot', () => {
  assert.equal(itemOf({ ...WORK, extraKind: 'ot', extraIn: '06:00' }).item, 'ot');
});
test('itemOf: ngày làm có làm bù theo giờ là mục makeup_hours', () => {
  assert.equal(itemOf(makeupHours('21:00')).item, 'makeup_hours');
  assert.equal(itemOf({ ...WORK, extraKind: 'makeup', extraIn: '07:00' }).item, 'makeup_hours');
});
test('itemOf: ngày làm thường không phải mục cần duyệt', () => {
  assert.equal(itemOf({ ...WORK }), null);
  assert.equal(itemOf({ kind: 'work', in: '08:00', out: '17:00' }), null);
});
test('itemOf: extraKind mà không có giờ làm thêm thì không phải mục', () => {
  assert.equal(itemOf({ ...WORK, extraKind: 'ot' }), null);
  assert.equal(itemOf({ ...WORK, extraKind: 'makeup' }), null);
});
test('itemOf: giờ làm thêm trùng giờ ca coi như không có (giống cleanDays)', () => {
  assert.equal(itemOf({ ...WORK, extraKind: 'ot', extraOut: '17:00' }), null);
});
test('itemOf: bản ghi cũ có extraOut mà không có extraKind là làm bù theo giờ (như calcDay)', () => {
  assert.equal(itemOf({ ...WORK, extraOut: '19:00' }).item, 'makeup_hours');
});
test('itemOf: chỉ có extraIn mà không có extraKind thì calcDay không coi là làm thêm, nên không phải mục', () => {
  assert.equal(itemOf({ ...WORK, extraIn: '07:00' }), null);
});
test('itemOf: nghỉ không lương không cần duyệt; nghỉ sẽ làm bù cần duyệt theo lịch nhiều ngày', async () => {
  assert.equal(itemOf({ kind: 'unpaid' }), null);
  const day = {
    kind: 'willmakeup',
    makeupPlans: [
      { date: '2026-10-12', from: '17:00', to: '19:00' },
      { date: '2026-10-13', from: '08:00', to: '10:00' }
    ]
  };
  assert.deepEqual(itemOf(day), {
    item: 'willmakeup',
    fingerprint: 'willmakeup|[["2026-10-12","17:00","19:00"],["2026-10-13","08:00","10:00"]]'
  });
  assert.equal(effectiveStatus(day, null), 'pending');
  assert.equal(effectiveStatus(day, await row(day, 'approved')), 'approved');
  assert.equal(fingerprint(day), fingerprint({ ...day, makeupPlans: [...day.makeupPlans].reverse() }));
});
test('payView: nghỉ sẽ làm bù chưa duyệt vẫn là nghỉ không lương, không tạo nợ giờ làm bù', () => {
  const date = '2026-10-12';
  const day = { kind: 'willmakeup', makeupPlans: [{ date: '2026-10-13', from: '17:00', to: '19:00' }] };
  const view = payView({ [date]: day }, {});
  assert.deepEqual(view.pendingItems, [{ date, item: 'willmakeup', status: 'pending' }]);
  assert.deepEqual(view.payDays[date], { kind: 'unpaid' });
});
test('itemOf: fingerprint của mục khớp hàm fingerprint', () => {
  for (const day of [{ kind: 'isat' }, { kind: 'approved' }, ot(), makeupHours()]) {
    assert.equal(itemOf(day).fingerprint, fingerprint(day));
    assert.ok(itemOf(day).fingerprint.length > 0);
  }
});

// ---------- fingerprint: chỉ phần được trả tiền ----------
test('fingerprint: đổi giờ OT sau ca thì khác (OT 3 giờ sửa còn 2 giờ phải duyệt lại)', () => {
  assert.notEqual(fingerprint(ot('20:00')), fingerprint(ot('19:00')));
});
test('fingerprint: đổi preset, breakMin hay shift thì giữ nguyên', () => {
  const base = fingerprint(ot('19:00'));
  assert.equal(fingerprint(ot('19:00', { preset: 'n2' })), base);
  assert.equal(fingerprint(ot('19:00', { breakMin: 30 })), base);
  assert.equal(fingerprint(ot('19:00', { shift: 'flex' })), base);
});
test('fingerprint: OT chỉ sau ca, đổi giờ vào thì giữ, đổi giờ ra thì khác', () => {
  const base = fingerprint(ot('19:00'));
  assert.equal(fingerprint(ot('19:00', { in: '08:30' })), base);
  assert.notEqual(fingerprint(ot('19:00', { out: '16:00' })), base);
});
test('fingerprint: OT chỉ trước ca, đổi giờ ra thì giữ, đổi giờ vào thì khác', () => {
  const before = { ...WORK, extraKind: 'ot', extraIn: '06:00' };
  const base = fingerprint(before);
  assert.equal(fingerprint({ ...before, out: '16:00' }), base);
  assert.notEqual(fingerprint({ ...before, in: '08:30' }), base);
  assert.notEqual(fingerprint({ ...before, extraIn: '05:00' }), base);
});
test('fingerprint: đổi OT thành làm bù theo giờ cùng giờ thì khác (đổi loại khoản)', () => {
  assert.notEqual(fingerprint(ot('19:00')), fingerprint(makeupHours('19:00')));
});
test('fingerprint: hai ngày khác ngày nhưng cùng phần trả tiền thì cùng chuỗi (chuỗi không chứa ngày)', () => {
  assert.equal(fingerprint(ot('19:00')), fingerprint({ ...ot('19:00') }));
});

// ---------- effectiveStatus ----------
test('effectiveStatus: không có dòng duyệt thì chờ duyệt', () => {
  assert.equal(effectiveStatus(ot(), undefined), 'pending');
  assert.equal(effectiveStatus(ot(), null), 'pending');
});
test('effectiveStatus: dòng pending thì chờ duyệt', async () => {
  assert.equal(effectiveStatus(ot(), await row(ot(), 'pending')), 'pending');
});
test('effectiveStatus: dòng approved khớp dấu vân tay thì đã duyệt', async () => {
  assert.equal(effectiveStatus(ot(), await row(ot(), 'approved')), 'approved');
});
test('effectiveStatus: dòng approved nhưng dấu vân tay lệch (OT bị sửa sau khi duyệt) thì chờ duyệt', async () => {
  assert.equal(effectiveStatus(ot('20:00'), await row(ot('19:00'), 'approved')), 'pending');
});
test('effectiveStatus: dòng rejected khớp thì bị từ chối', async () => {
  assert.equal(effectiveStatus(ot(), await row(ot(), 'rejected')), 'rejected');
});
test('effectiveStatus: dòng rejected nhưng đã sửa phần trả tiền thì về chờ duyệt', async () => {
  assert.equal(effectiveStatus(ot('20:00'), await row(ot('19:00'), 'rejected')), 'pending');
});
test('effectiveStatus: dòng approved của OT mà ngày nay là làm bù theo giờ thì chờ duyệt', async () => {
  assert.equal(effectiveStatus(makeupHours('19:00'), await row(ot('19:00'), 'approved')), 'pending');
});
test('effectiveStatus: dòng approved không có fingerprint không bao giờ tạo ra tiền', () => {
  assert.equal(effectiveStatus(ot(), { item: 'ot', status: 'approved', rev: 1 }), 'pending');
});

// ---------- POLICY ----------
const VALID_ACTIONS = {
  isat: ['drop', 'unpaid'],
  approved: ['drop', 'unpaid'],
  makeup_day: ['drop'],
  ot: ['strip'],
  makeup_hours: ['strip'],
  holiday_work: ['drop'],
  leave: ['drop', 'unpaid'],
  willmakeup: ['unpaid']
};
test('POLICY: đủ ô cho hai trạng thái (chờ duyệt, bị từ chối) và tám loại khoản, giá trị hợp lệ', () => {
  for (const status of ['pending', 'rejected']) {
    assert.deepEqual(Object.keys(POLICY[status]).sort(), Object.keys(VALID_ACTIONS).sort(), status);
    for (const [item, allowed] of Object.entries<any>(VALID_ACTIONS))
      assert.ok(allowed.includes(POLICY[status][item]), `${status}.${item} = ${POLICY[status][item]}`);
  }
});
test('POLICY: iSAT và "Nghỉ được duyệt" chưa duyệt hoặc bị từ chối là nghỉ không lương (quyết định 14/10/2026)', () => {
  for (const status of ['pending', 'rejected']) {
    assert.equal(POLICY[status].isat, 'unpaid', status);
    assert.equal(POLICY[status].approved, 'unpaid', status);
  }
});
test('POLICY: OT và làm bù theo giờ chỉ bỏ đoạn làm thêm', () => {
  for (const status of ['pending', 'rejected']) {
    assert.equal(POLICY[status].ot, 'strip', status);
    assert.equal(POLICY[status].makeup_hours, 'strip', status);
  }
});
test('POLICY: bị từ chối giống chờ duyệt về cách xử lý tiền (Q5)', () => {
  assert.deepEqual({ ...POLICY.rejected }, { ...POLICY.pending });
});

// ---------- payView ----------
const mixedDays = () =>
  octoberOf({
    [D(3)]: { kind: 'isat' },
    [D(5)]: { kind: 'approved' },
    [D(7)]: ot('19:00', { preset: 'n1', breakMin: 15 }),
    [D(9)]: makeupHours('21:00'),
    [D(12)]: { kind: 'leave' }
  });

test('payView: mọi mục đã duyệt thì payDays bằng sâu days (không đổi một byte, không phá tiền hôm nay)', () => {
  const days = mixedDays();
  const rows = Object.fromEntries(itemDates(days).map(date => [date, row(days[date], 'approved')]));
  const view = payView(days, rows);
  assert.deepEqual(view.payDays, days);
  assert.deepEqual(view.pendingItems, []);
});
test('payView: payDays là bản sao, đổi payDays không đổi days', () => {
  const days = mixedDays();
  const rows = Object.fromEntries(itemDates(days).map(date => [date, row(days[date], 'approved')]));
  const view = payView(days, rows);
  assert.notEqual(view.payDays, days);
  view.payDays[D(7)].extraOut = '23:00';
  assert.equal(days[D(7)].extraOut, '19:00');
});
test('payView: không sửa đối tượng đầu vào (days và approvals đóng băng vẫn chạy được)', async () => {
  const days = deepFreeze(mixedDays());
  const rows = deepFreeze({ [D(7)]: await row(days[D(7)], 'pending') });
  const before = JSON.stringify([days, rows]);
  payView(days, rows);
  assert.equal(JSON.stringify([days, rows]), before);
});
for (const status of ['pending', 'rejected']) {
  const rowsFor = async (days?, date?) => ({ [date]: await row(days[date], status) });
  test(`payView (${status}): iSAT thành đúng { kind: 'unpaid' }`, async () => {
    const days = octoberOf({ [D(3)]: { kind: 'isat' } });
    assert.deepEqual(payView(days, await rowsFor(days, D(3))).payDays[D(3)], { kind: 'unpaid' });
  });
  test(`payView (${status}): "Nghỉ được duyệt" thành đúng { kind: 'unpaid' }`, async () => {
    const days = octoberOf({ [D(5)]: { kind: 'approved' } });
    assert.deepEqual(payView(days, await rowsFor(days, D(5))).payDays[D(5)], { kind: 'unpaid' });
  });
  for (const [name, day] of [
    ['OT', ot('19:00', { preset: 'n1', breakMin: 15 })],
    ['làm bù theo giờ', makeupHours('21:00', { preset: 'n1', breakMin: 15 })]
  ]) {
    test(`payView (${status}): ${name} giữ ngày đi làm, bỏ đoạn làm thêm`, async () => {
      const days = octoberOf({ [D(7)]: day });
      const kept = payView(days, await rowsFor(days, D(7))).payDays[D(7)];
      assert.equal(kept.kind, 'work');
      assert.equal(kept.in, '08:00');
      assert.equal(kept.out, '17:00');
      assert.equal(kept.preset, 'n1');
      assert.equal(kept.breakMin, 15);
      assert.ok(!kept.extraKind && !kept.extraIn && !kept.extraOut, JSON.stringify(kept));
      assert.equal(itemOf(kept), null, 'sau khi bỏ đoạn làm thêm không còn mục nào');
    });
  }
  test(`payView (${status}): pendingItems ghi ngày, loại khoản và trạng thái; ngày thường và khoản đã duyệt không có`, async () => {
    const days = mixedDays();
    const rows = {
      [D(3)]: await row(days[D(3)], status),
      [D(5)]: await row(days[D(5)], 'approved'),
      [D(7)]: await row(days[D(7)], status)
    };
    const items = payView(days, rows).pendingItems.sort((a: any, b: any) => a.date.localeCompare(b.date));
    assert.deepEqual(items, [
      { date: D(3), item: 'isat', status },
      { date: D(7), item: 'ot', status },
      { date: D(9), item: 'makeup_hours', status: 'pending' },
      { date: D(12), item: 'leave', status: 'pending' }
    ]);
  });
}
test('payView: khoản không có dòng duyệt xử lý như chờ duyệt (thiếu dữ liệu không tạo ra tiền)', () => {
  const days = octoberOf({ [D(3)]: { kind: 'isat' } });
  const view = payView(days, {});
  assert.deepEqual(view.payDays[D(3)], { kind: 'unpaid' });
  assert.deepEqual(view.pendingItems, [{ date: D(3), item: 'isat', status: 'pending' }]);
  assert.deepEqual(payView(days, undefined).payDays[D(3)], { kind: 'unpaid' });
});
test('payView: dòng đã duyệt nhưng dấu vân tay lệch (OT bị sửa sau khi duyệt) bị bỏ đoạn làm thêm', async () => {
  const approvedFor19 = await row(ot('19:00'), 'approved');
  const days = octoberOf({ [D(7)]: ot('20:00') });
  const view = payView(days, { [D(7)]: approvedFor19 });
  assert.ok(!view.payDays[D(7)].extraOut);
  assert.deepEqual(view.pendingItems, [{ date: D(7), item: 'ot', status: 'pending' }]);
});
test('payView: sửa shift hoặc giờ nghỉ của OT đã duyệt không làm mất duyệt', async () => {
  const approved = await row(ot('19:00'), 'approved');
  const days = octoberOf({ [D(7)]: ot('19:00', { shift: 'flex', preset: 'n2', breakMin: 45 }) });
  const view = payView(days, { [D(7)]: approved });
  assert.equal(view.payDays[D(7)].extraOut, '19:00');
  assert.deepEqual(view.pendingItems, []);
});
test('payView: ngày không có mục (đi làm thường) đi qua nguyên vẹn; nghỉ phép năm chưa duyệt thành nghỉ không lương', () => {
  const days = mixedDays();
  const view = payView(days, {});
  assert.deepEqual(view.payDays[D(1)], days[D(1)]);
  assert.deepEqual(view.payDays[D(12)], { kind: 'unpaid' });
});

// ---------- tiền thật qua calcMonth (NV L1 tháng 10/2026, cả tháng, KPI trống) ----------
// Mốc chuẩn: 27 ngày đi làm = 6.000.000 x 27/26 + đi lại 6.000.000 x 15% x 27/26 + chuyên cần 6.000.000 x 25% x 27/26
//   = 6.230.769,23 + 934.615,38 + 1.557.692,31 = 8.723.076,92 -> 8.723.077.
test('Mốc chuẩn: không có mục nào thì chờ duyệt không đổi gì (8.723.077)', async () => {
  const r = await pay(NV_L1, octoberOf());
  assert.equal(vnd(r.real.total), 8723077);
  assert.equal(vnd(r.all.total), 8723077);
  assert.equal(r.view.pendingItems.length, 0);
});

// Ca iSAT, tính tay độc lập (lương ngày 230.769,23):
//  - Đã duyệt hết: 22 ngày T2-T6 + 5 iSAT = 27 ngày x 230.769,23 = 6.230.769,23; chỉ 22 ngày được tính là đi làm nên
//    đi lại = 900.000 x 22/26 = 761.538,46; chuyên cần = 1.500.000 x 22/26 = 1.269.230,77; tổng 8.261.538,46 -> 8.261.538.
//  - Chờ duyệt = nghỉ không lương: 22 x 230.769,23 = 5.076.923,08; đi lại 761.538,46; 5 ngày nghỉ >= 3 nên mất chuyên cần;
//    tổng 5.838.461,54 -> 5.838.462. Dòng "chờ duyệt" = 8.261.538,46 - 5.838.461,54 = 2.423.076,92 -> 2.423.077.
const saturdays = [3, 10, 17, 24, 31].map(D);
const isatMonth = () => octoberOf(Object.fromEntries(saturdays.map(date => [date, { kind: 'isat' }])));
for (const status of ['pending', 'rejected', 'khong-co-dong']) {
  const label = status === 'khong-co-dong' ? 'không có dòng duyệt' : status;
  test(`C1: 5 iSAT ${label} là nghỉ không lương, mất lương ngày và chuyên cần (5.838.462)`, async () => {
    const days = await isatMonth();
    const r = await pay(
      NV_L1,
      days,
      status === 'khong-co-dong' ? {} : allDates({ ...Object.fromEntries(saturdays.map(d => [d, 1])) }, status)
    );
    assert.equal(vnd(r.all.total), 8261538);
    assert.equal(vnd(r.real.total), 5838462);
    assert.equal(vnd(r.line), 2423077);
    assert.equal(r.real.isat, 0);
    assert.equal(r.real.unpaid, 5);
    assert.equal(r.real.attendOk, false);
    assert.equal(r.real.overHours, 40);
  });
}
test('C1: duyệt 5 iSAT thì cộng lại đúng 8.261.538, dòng chờ duyệt về 0', async () => {
  const days = await isatMonth();
  const r = await pay(NV_L1, days, allDates(Object.fromEntries(saturdays.map(d => [d, 1])), 'approved'));
  assert.equal(vnd(r.real.total), 8261538);
  assert.equal(vnd(r.line), 0);
  assert.equal(r.view.pendingItems.length, 0);
});
// Duyệt dần (5 iSAT, 22 ngày làm): mỗi iSAT đã duyệt cộng 230.769,23 vào lương ngày.
//  - duyệt 1 (4 chờ): 22 x 230.769,23 + 230.769,23 = 5.307.692,31; đi lại 761.538,46; absent 4 >= 3 nên mất chuyên cần = 6.069.230,77.
//  - duyệt 2 (3 chờ): 5.538.461,54 + 761.538,46 = 6.300.000; absent 3 >= 3 nên vẫn mất chuyên cần.
//  - duyệt 3 (2 chờ): absent 2 < 3 và giờ vượt ngưỡng 16 < 24 nên có lại chuyên cần 1.269.230,77:
//    5.769.230,77 + 761.538,46 + 1.269.230,77 = 7.800.000.
test('C1: ngưỡng chuyên cần, 3 iSAT chờ vẫn mất (absent = 3) còn 2 iSAT chờ thì giữ chuyên cần', async () => {
  const days = await isatMonth();
  const approve = (n?) => Object.fromEntries(saturdays.slice(0, n).map(date => [date, 'approved']));
  assert.equal(vnd((await pay(NV_L1, days, await approve(1))).real.total), 6069231);
  const three = await pay(NV_L1, days, await approve(2));
  assert.equal(vnd(three.real.total), 6300000);
  assert.equal(three.real.attendOk, false);
  const two = await pay(NV_L1, days, await approve(3));
  assert.equal(vnd(two.real.total), 7800000);
  assert.equal(two.real.attendOk, true);
  assert.equal(vnd((await pay(NV_L1, days, await approve(4))).real.total), 8030769);
});
// KPI 100% (mức tối đa của NV L1 là 6.000.000): 14.261.538 khi đã duyệt hết. Chờ duyệt: 40 giờ vượt ngưỡng > 24 nên
// KPI nhân 22/26 = 5.076.923 -> 5.838.462 + 5.076.923 = 10.915.385.
test('C1: iSAT chờ duyệt kéo cả KPI xuống (giờ vượt ngưỡng 40 > 24): 10.915.385 so với 14.261.538', async () => {
  const r = await pay(NV_L1, await isatMonth(), {}, 100);
  assert.equal(vnd(r.all.total), 14261538);
  assert.equal(vnd(r.real.total), 10915385);
  assert.equal(vnd(r.line), 3346154);
});

const approvedLeave = () => octoberOf(Object.fromEntries([5, 6, 7, 8].map(day => [D(day), { kind: 'approved' }])));
// Tệp này chạy khối công thức đóng băng (test/helpers/payroll-vm), nên các số dưới đây là của khối đó.
// App tính "Nghỉ được duyệt" đã duyệt như nghỉ không lương khi xét chuyên cần và giờ vượt ngưỡng;
// số của app: test/unit/2026-10-26-nghi-duoc-duyet-tinh-chuyen-can.test.ts.
// Tính tay (khối đóng băng): "Nghỉ được duyệt" không tính là ngày nghỉ nên absent = 0: 23 ngày x 230.769,23 = 5.307.692,31;
// đi lại 900.000 x 23/26 = 796.153,85; chuyên cần 1.500.000 x 23/26 = 1.326.923,08; tổng 7.430.769,23.
// Chờ duyệt = 4 ngày nghỉ không lương (absent 4 >= 3): mất chuyên cần, còn 6.103.846,15.
for (const status of ['pending', 'rejected']) {
  test(`C2: 4 ngày "Nghỉ được duyệt" ${status} là nghỉ không lương, mất chuyên cần (6.103.846)`, async () => {
    const days = approvedLeave();
    const r = await pay(NV_L1, days, allDates(Object.fromEntries([5, 6, 7, 8].map(d => [D(d), 1])), status));
    assert.equal(vnd(r.all.total), 7430769);
    assert.equal(vnd(r.real.total), 6103846);
    assert.equal(vnd(r.line), 1326923);
    assert.equal(r.real.unpaid, 4);
    assert.equal(r.real.attendOk, false);
  });
}
test('C2: duyệt 4 ngày "Nghỉ được duyệt" thì cộng lại đúng 7.430.769', async () => {
  const days = approvedLeave();
  const r = await pay(NV_L1, days, allDates(Object.fromEntries([5, 6, 7, 8].map(d => [D(d), 1])), 'approved'));
  assert.equal(vnd(r.real.total), 7430769);
});
test('C2: 4 ngày "Nghỉ được duyệt" chờ cộng KPI 100%: 11.411.538 so với 13.430.769 (KPI nhân 23/26)', async () => {
  const r = await pay(NV_L1, approvedLeave(), {}, 100);
  assert.equal(vnd(r.all.total), 13430769);
  assert.equal(vnd(r.real.total), 11411538);
  assert.equal(vnd(r.line), 2019231);
});
test('C2: chỉ 2 ngày "Nghỉ được duyệt" chờ thì chưa mất chuyên cần (2 < 3 ngày, 16 < 24 giờ)', async () => {
  const days = octoberOf({ [D(5)]: { kind: 'approved' }, [D(6)]: { kind: 'approved' } });
  const r = await pay(NV_L1, days);
  assert.equal(r.real.attendOk, true);
  assert.equal(r.real.unpaid, 2);
  // 25 ngày x 230.769,23 + đi lại 900.000 x 25/26 + chuyên cần 1.500.000 x 25/26 = 5.769.230,77 + 865.384,62 + 1.442.307,69
  assert.equal(vnd(r.real.total), 8076923);
});

// OT: 2 giờ (17:00-19:00) ngày 7, 14, 21/10. Tính tay: OT = 2 giờ x 28.846,15 x 2 = 115.384,62 mỗi ngày, 3 ngày = 346.153,85.
// Đã duyệt: 8.723.076,92 + 346.153,85 = 9.069.230,77 -> 9.069.231. Chờ duyệt: bỏ OT, về mốc chuẩn 8.723.077.
const otMonth = () => octoberOf(Object.fromEntries([7, 14, 21].map(day => [D(day), ot('19:00')])));
for (const status of ['pending', 'rejected']) {
  test(`C3: 3 ngày OT ${status} không được trả (8.723.077), dòng chờ duyệt 346.154`, async () => {
    const days = otMonth();
    const r = await pay(NV_L1, days, allDates(Object.fromEntries([7, 14, 21].map(d => [D(d), 1])), status));
    assert.equal(vnd(r.all.total), 9069231);
    assert.equal(vnd(r.real.total), 8723077);
    assert.equal(vnd(r.line), 346154);
    assert.equal(r.real.otPay, 0);
    assert.equal(r.real.otHours, 0);
  });
}
test('C3: duyệt 3 ngày OT thì cộng lại đúng 9.069.231; duyệt riêng 1 ngày cộng 115.385', async () => {
  const days = otMonth();
  const approved = [7, 14, 21].map(D);
  assert.equal(
    vnd((await pay(NV_L1, days, allDates(Object.fromEntries(approved.map(d => [d, 1])), 'approved'))).real.total),
    9069231
  );
  const one = await pay(NV_L1, days, { [D(7)]: 'approved' });
  assert.equal(vnd(one.real.total), 8838462);
  assert.equal(vnd(one.real.otPay), 115385);
  assert.equal(one.view.pendingItems.length, 2);
});

// Làm bù theo giờ: 6/10 đi làm 08:00-16:00 (thiếu 1 giờ), 7/10 làm bù 17:00-18:00 (1 giờ). Đã duyệt thì giờ bù trả đúng giờ thiếu
// nên bằng mốc chuẩn 8.723.077. Chờ duyệt: giờ làm bù không vào sổ, ngày 6/10 bị trừ 1 giờ = 28.846,15: 8.694.230,77 -> 8.694.231.
test('C4: làm bù theo giờ chờ duyệt không bù giờ thiếu, mất 28.846 (8.694.231)', async () => {
  const days = octoberOf({ [D(6)]: { ...WORK, out: '16:00' }, [D(7)]: makeupHours('18:00') });
  for (const status of ['pending', 'rejected']) {
    const r = await pay(NV_L1, days, { [D(7)]: status });
    assert.equal(vnd(r.all.total), 8723077, status);
    assert.equal(vnd(r.real.total), 8694231, status);
    assert.equal(vnd(r.line), 28846, status);
    assert.equal(r.real.debt, 1, status);
    assert.equal(r.real.makeupHours, 0, status);
  }
  assert.equal(vnd((await pay(NV_L1, days, { [D(7)]: 'approved' })).real.total), 8723077);
});

// Chuỗi làm bù rồi OT: 9/10 "Nghỉ, sẽ làm bù" (cần 8 giờ), làm bù 4 giờ (17:00-21:00) ngày 12 và 13/10, OT 2 giờ ngày 20/10.
// Tính tay: 26 ngày đi làm (27 trừ ngày nghỉ sẽ làm bù) x 230.769,23 = 6.000.000; đi lại 900.000; chuyên cần 1.500.000
// (absent = 1 - 2 ngày làm bù < 3). Làm bù 8 giờ = 230.769,23; OT 2 giờ = 115.384,62.
//  - Cả hai đã duyệt: 6.000.000 + 900.000 + 1.500.000 + 230.769,23 + 115.384,62 = 8.746.153,85 -> 8.746.154.
//  - Cả hai chờ: không có làm bù, không OT: 8.400.000 (nợ 8 giờ, chưa tới ngưỡng 24).
//  - Chỉ làm bù duyệt: 8.400.000 + 230.769,23 = 8.630.769,23 -> 8.630.769.
//  - Chỉ OT duyệt, làm bù chờ: sổ giờ bù còn nợ 8 giờ nên OT ngày 20/10 vẫn "chưa tính": 8.400.000.
const chainDays = () =>
  octoberOf({
    [D(9)]: { kind: 'willmakeup' },
    [D(12)]: makeupHours('21:00'),
    [D(13)]: makeupHours('21:00'),
    [D(20)]: ot('19:00')
  });
test('C5: làm bù và OT cùng chờ duyệt thì không có tiền nào của hai khoản (8.400.000)', async () => {
  const r = await pay(NV_L1, chainDays());
  assert.equal(vnd(r.all.total), 8746154);
  assert.equal(vnd(r.real.total), 8400000);
  assert.equal(vnd(r.line), 346154);
  assert.equal(r.real.debt, 8);
});
test('C5: làm bù chờ duyệt không bù giờ thiếu, OT đã duyệt ngày sau vẫn "chưa tính"', async () => {
  const r = await pay(NV_L1, chainDays(), { [D(20)]: 'approved' });
  assert.equal(vnd(r.real.total), 8400000);
  assert.equal(r.real.otPay, 0);
  assert.equal(r.real.otHoldHours, 2);
  assert.equal(vnd(r.line), 346154);
});
test('C5: duyệt làm bù trước thì cộng 230.769, rồi duyệt OT thì OT được tính, tổng 8.746.154', async () => {
  const makeupOnly = await pay(NV_L1, chainDays(), { [D(12)]: 'approved', [D(13)]: 'approved' });
  assert.equal(vnd(makeupOnly.real.total), 8630769);
  assert.equal(vnd(makeupOnly.line), 115385);
  assert.equal(makeupOnly.real.debt, 0);
  const both = await pay(NV_L1, chainDays(), { [D(12)]: 'approved', [D(13)]: 'approved', [D(20)]: 'approved' });
  assert.equal(vnd(both.real.total), 8746154);
  assert.equal(both.real.otHoldHours, 0);
  assert.equal(vnd(both.line), 0);
});
test('C5: không cộng được từng khoản riêng, duyệt riêng OT (0) rồi làm bù (230.769) không bằng duyệt cả hai (346.154)', async () => {
  const none = (await pay(NV_L1, chainDays())).real.total;
  const otOnly = (await pay(NV_L1, chainDays(), { [D(20)]: 'approved' })).real.total - none;
  const makeupOnly = (await pay(NV_L1, chainDays(), { [D(12)]: 'approved', [D(13)]: 'approved' })).real.total - none;
  const both =
    (await pay(NV_L1, chainDays(), { [D(12)]: 'approved', [D(13)]: 'approved', [D(20)]: 'approved' })).real.total -
    none;
  assert.equal(vnd(otOnly), 0);
  assert.equal(vnd(makeupOnly), 230769);
  assert.equal(vnd(both), 346154);
  assert.notEqual(vnd(otOnly + makeupOnly), vnd(both));
});
test('C5: bị từ chối về tiền giống chờ duyệt, kể cả với OT đã duyệt đi cùng làm bù bị từ chối', async () => {
  const rejected = await pay(NV_L1, chainDays(), { [D(12)]: 'rejected', [D(13)]: 'rejected', [D(20)]: 'approved' });
  assert.equal(vnd(rejected.real.total), 8400000);
  assert.equal(rejected.real.otHoldHours, 2);
});

// Làm bù kéo mất chuyên cần (bộ máy lương dùng chung): 5, 6, 7/10 "Nghỉ, sẽ làm bù"; làm bù 4 giờ (17:00-21:00) mỗi ngày 12-17/10 (24 giờ).
// Tính tay: 24 ngày đi làm (27 trừ 3) x 230.769,23 = 5.538.461,54; đi lại 900.000 x 24/26 = 830.769,23.
//  - Đã duyệt: làm bù 24 giờ x 28.846,15 = 692.307,69; giờ nợ = 3 ngày x 8 giờ - 24 giờ làm bù = 0 nên ba ngày "Nghỉ, sẽ làm bù" đã bù đủ,
//    không tính là ngày nghỉ: chuyên cần 1.500.000 x 24/26 = 1.384.615,38; tổng 8.446.153,85 -> 8.446.154.
//  - Chờ duyệt hoặc bị từ chối: không có làm bù, nợ 24 giờ nên ba ngày nghỉ đều tính: nghỉ 3 >= 3 mất chuyên cần: 5.538.461,54 + 830.769,23 = 6.369.230,77.
test('C6: làm bù 24 giờ chờ duyệt làm mất chuyên cần (6.369.231)', () => {
  const dates = [12, 13, 14, 15, 16, 17].map(D);
  const days = octoberOf({
    [D(5)]: { kind: 'willmakeup' },
    [D(6)]: { kind: 'willmakeup' },
    [D(7)]: { kind: 'willmakeup' },
    ...Object.fromEntries(dates.map(date => [date, makeupHours('21:00')]))
  });
  const staff = { username: 'qa_nv_c6', ...NV_L1, shiftCode: 'n1', startDate: '2025-01-06' };
  const monthWith = (status?) => {
    const approvals: Record<string, any> = {};
    for (const [date, day] of Object.entries<any>(days)) {
      const found = itemOf(day, { date, holidays: [], staffType: staff.type });
      if (found)
        approvals[date] = {
          item: found.item,
          fingerprint: found.fingerprint,
          status: found.item === 'willmakeup' ? 'approved' : status
        };
    }
    return Engine.create(DEFAULTS).computeMonth({
      staff,
      days,
      approvals,
      sessions: declaredPunches(staff, days),
      kpi: { pct: null, amt: null, admPct: null, admAmt: null },
      holidays: [],
      month: '2026-10',
      upTo: null,
      asOf: '2026-11-02T12:00:00+07:00'
    }).m;
  };
  const all = monthWith('approved');
  for (const status of ['pending', 'rejected']) {
    const real = monthWith(status);
    assert.equal(vnd(all.total), 8446154, status);
    assert.equal(vnd(real.total), 6369231, status);
    assert.equal(vnd(all.total - real.total), 2076923, status);
    assert.equal(real.debt, 24, status);
    assert.equal(real.attendOk, false, status);
  }
  assert.equal(all.debt, 0);
  assert.equal(all.attendOk, true);
});

test('Tiền chờ duyệt không bao giờ vượt tiền khi đã duyệt hết (mọi ca của bảng)', async () => {
  for (const days of [await isatMonth(), approvedLeave(), otMonth(), chainDays()]) {
    const r = await pay(NV_L1, days);
    assert.ok(r.real.total <= r.all.total + 1e-6);
    assert.ok(r.line >= -1e-6);
  }
});
test('Thực lĩnh và thuế tính trên phần đã duyệt: thu nhập gộp của ca C1 chờ duyệt là 5.838.462', async () => {
  const r = await pay(NV_L1, await isatMonth());
  assert.equal(r.real.net.gross, 5838462);
});

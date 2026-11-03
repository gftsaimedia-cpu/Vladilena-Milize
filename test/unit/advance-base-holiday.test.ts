'use strict';
// Cơ sở tạm ứng = lương cơ bản thực nhận của các ngày đi làm từ ngày 1 đến ngày advance.untilDay.
// Ngày lễ đi làm thật là ngày công: lương ngày của ngày lễ vào cơ sở; tiền OT ngày lễ (hệ số lễ) không vào cơ sở.
// Ngày lễ không đi làm (chỉ hưởng lương lễ) và ngày lễ sau ngày advance.untilDay không vào cơ sở.
require('../helpers/require-isolated-database');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const AV = require('../../src/engine/approval-view');
const Engine = require('../../src/engine/payroll-engine');
const { DEFAULTS } = require('../../src/engine/payroll-params');
const { cellsOf } = require('../../src/domain/payroll/slip-paid');
const { formulasOf } = require('../../src/domain/payroll/slip-formulas');
const { near: near2, plainAll } = require('../helpers/formula-eval');
const { declaredPunches } = require('../helpers/declared-punches');

const HOL = '2026-10-13'; // Thứ Ba, trong lịch NV (T2–T7), trước ngày 15
const LATE_HOL = '2026-10-20'; // Thứ Ba, sau ngày 15
const DAILY = 6000000 / 26; // NV bậc 1: lương ngày
const RATE = DEFAULTS['advance.rate'];
const ASOF = '2026-11-02T12:00:00+07:00';
const NV = { username: 'qa_day', type: 'nv', level: 1, startDate: '2025-01-06', shiftCode: 'Normal1' };
const TTS = { username: 'qa_tts', type: 'tts', level: 1, startDate: '2025-01-06', shiftCode: 'Normal1' };
const work = { kind: 'work', in: '08:00', out: '17:00' };
const holidayOt = { ...work, extraKind: 'ot', extraIn: '', extraOut: '20:00' };

function month(staff?, days?, holidays?, advanceApproved = false) {
  const approvals: Record<string, any> = {};
  for (const [date, day] of Object.entries<any>(days)) {
    const found = AV.itemOf(day, { date, holidays, staffType: staff.type });
    if (found) approvals[date] = { item: found.item, fingerprint: found.fingerprint, status: 'approved' };
  }
  return Engine.create(DEFAULTS).computeMonth({
    staff,
    days,
    approvals,
    sessions: declaredPunches(staff, days),
    kpi: { pct: null, amt: null, admPct: null, admAmt: null },
    holidays,
    month: '2026-10',
    upTo: null,
    switches: {},
    asOf: ASOF,
    advanceApproved
  });
}
const near = (actual?, expected?, msg?) =>
  assert.ok(Math.abs(actual - expected) < 0.01, `${msg || ''} ${actual} != ${expected}`);

test('ngày lễ đi làm trước ngày 15: lương ngày của ngày lễ vào cơ sở tạm ứng cùng các ngày thường; OT ngày lễ không vào', async () => {
  const days = { '2026-10-12': work, [HOL]: holidayOt, '2026-10-14': work, '2026-10-15': work };
  const { m } = await month(NV, days, [HOL]);
  assert.equal(m.holWorkDays, 1);
  assert.ok(m.holWorkPay > 0);
  near(m.advanceBase, 4 * DAILY, 'cơ sở = 3 ngày thường + lương ngày lễ');
  assert.equal(m.trace.tamUngToiDa, Math.round(RATE * 4 * DAILY), 'tạm ứng = 80% cơ sở');
});

test('OT ngày lễ không đổi cơ sở tạm ứng: cùng cơ sở khi không có giờ làm thêm', async () => {
  const plain = (await month(NV, { '2026-10-12': work, [HOL]: work, '2026-10-14': work }, [HOL])).m;
  const ot = (await month(NV, { '2026-10-12': work, [HOL]: holidayOt, '2026-10-14': work }, [HOL])).m;
  assert.ok(ot.holWorkPay > plain.holWorkPay);
  near(ot.advanceBase, plain.advanceBase);
  near(ot.advanceBase, 3 * DAILY);
});

test('ngày lễ đi làm là ngày công và cũng là ngày đi làm của cơ sở tạm ứng: số công khớp số ngày trong cơ sở', async () => {
  const { m } = await month(NV, { '2026-10-12': work, [HOL]: work }, [HOL]);
  assert.equal(m.count, 2);
  near(m.advanceBase / DAILY, 2);
});

test('ngày lễ không đi làm: hưởng lương lễ nhưng không vào cơ sở tạm ứng', async () => {
  const { m } = await month(NV, { '2026-10-12': work, '2026-10-14': work }, [HOL]);
  assert.equal(m.holiday, 1);
  near(m.advanceBase, 2 * DAILY);
});

test('ngày lễ đi làm sau ngày 15 không vào cơ sở tạm ứng', async () => {
  const { m } = await month(NV, { '2026-10-12': work, [LATE_HOL]: work }, [LATE_HOL]);
  assert.equal(m.holWorkDays, 1);
  near(m.advanceBase, DAILY);
});

test('chức vụ không có quyền lợi OT: ngày lễ chỉ là lương lễ, không phải ngày đi làm, không vào cơ sở tạm ứng', async () => {
  const { m } = await month(TTS, { '2026-10-12': work, [HOL]: work }, [HOL]);
  assert.equal(m.holWorkDays, 0);
  const row = m.rows.find(r => r.date === '2026-10-12');
  near(m.advanceBase, row.daily - row.cut);
});

test('tạm ứng đã duyệt = 80% cơ sở có ngày lễ đi làm, trừ vào thực lĩnh; chưa duyệt thì 0 và số tối đa không đổi', async () => {
  const days = { '2026-10-12': work, [HOL]: holidayOt };
  const open = (await month(NV, days, [HOL])).m;
  const approved = (await month(NV, days, [HOL], true)).m;
  assert.equal(open.net.advance, 0);
  assert.equal(approved.net.advance, Math.round(RATE * 2 * DAILY));
  assert.equal(open.trace.tamUngToiDa, approved.trace.tamUngToiDa);
  assert.equal(open.net.net - approved.net.net, approved.net.advance);
});

test('công thức Chi tiết của tạm ứng đếm ngày lễ đi làm như ngày công và tính ra đúng số tạm ứng', async () => {
  const days = { '2026-10-12': work, [HOL]: holidayOt, '2026-10-14': work };
  const { m } = await month(NV, days, [HOL], true);
  const snapshot = JSON.parse(JSON.stringify(m));
  const f = plainAll(
    formulasOf({ snapshot, staffTerms: NV, params: DEFAULTS, month: '2026-10', cells: cellsOf(snapshot) })
  );
  assert.equal(f.advance, '80% × (6.000.000 đ ÷ 26 ngày chuẩn × 3 ngày công)');
  near2(f.advance, snapshot.net.advance);
});

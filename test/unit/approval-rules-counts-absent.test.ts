'use strict';
// Quy tắc duyệt: "tính là ngày nghỉ khi xét chuyên cần" (request.type.<loại>.countsAbsent). Mặc định true: khoản chưa duyệt thành nghỉ
// không lương vẫn là ngày nghỉ xét chuyên cần và giờ vượt ngưỡng; false chỉ bỏ ngày đó khỏi hai phép đếm, lương ngày vẫn mất. Người giả, tháng bịa.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const Params = require('../helpers/defaults-old-basis.js');
const PayrollEngine = require('../../src/engine/payroll-engine');
const ApprovalView = require('../../src/engine/approval-view');
const { declaredPunches } = require('../helpers/declared-punches');

const D = Params.DEFAULTS;
const MONTH = '2026-11';
const STAFF = { username: 'qa_absent', type: 'nv', level: 2, nightPct: 40, startDate: '2025-01-06' };
const workday = { kind: 'work', in: '08:00', out: '17:00' };
// Tháng 11/2026: Thứ Hai đến Thứ Bảy đi làm, trừ ngày 04/11 xin "Nghỉ được duyệt" chưa được duyệt
function month(params?, approvals: any = {}) {
  const days: Record<string, any> = {};
  for (let d = 2; d <= 28; d++) {
    const dow = new Date(Date.UTC(2026, 10, d)).getUTCDay();
    if (dow !== 0) days[`${MONTH}-${String(d).padStart(2, '0')}`] = { ...workday };
  }
  days[`${MONTH}-04`] = { kind: 'approved' };
  const out = PayrollEngine.create(params).computeMonth({
    staff: STAFF,
    days,
    approvals,
    sessions: declaredPunches(STAFF, days),
    kpi: { pct: null, amt: null, admPct: null, admAmt: null },
    holidays: [],
    month: MONTH,
    upTo: null,
    asOf: `${MONTH}-28T09:00:00+07:00`
  });
  return out.m;
}

test('chuyên cần: mặc định mọi loại tính là ngày nghỉ (đúng như trước khi có tuỳ chọn)', async () => {
  for (const item of ApprovalView.ITEMS) assert.equal(D[`request.type.${item}.countsAbsent`], true, item);
  assert.equal(ApprovalView.COUNTS_ABSENT.approved, true);
  const m = await month(D);
  assert.equal(m.unpaid, 1, 'khoản chưa duyệt thành nghỉ không lương');
  assert.equal(m.absent, 1);
});

test('chuyên cần: tắt "tính là ngày nghỉ" của Nghỉ được duyệt thì ngày đó không vào ngày nghỉ và giờ vượt ngưỡng, lương ngày vẫn mất', async () => {
  const on = await month(D);
  const off = await month({ ...D, 'request.type.approved.countsAbsent': false });
  assert.equal(off.absent, on.absent - 1);
  assert.equal(off.unpaid, on.unpaid, 'vẫn là ngày nghỉ không lương (không lương ngày)');
  assert.equal(off.base, on.base, 'lương cơ bản của ngày đi làm không đổi');
  assert.equal(off.overHours, on.overHours - D['time.workHoursPerDay'], 'giờ vượt ngưỡng bớt đúng một công');
});

test('chuyên cần: payView đánh dấu ngày nghỉ không lương không tính vào chuyên cần chỉ khi tắt cờ và chỉ với cách xử lý nghỉ không lương', () => {
  const days = { '2026-11-04': { kind: 'approved' } };
  const rows = { '2026-11-04': { item: 'approved', status: 'pending', fingerprint: 'approved' } };
  assert.deepEqual(ApprovalView.payView(days, rows).payDays['2026-11-04'], { kind: 'unpaid' });
  const off = ApprovalView.create({ ...D, 'request.type.approved.countsAbsent': false });
  assert.deepEqual(off.payView(days, rows).payDays['2026-11-04'], { kind: 'unpaid', absentExempt: true });
  const dropAll = ApprovalView.create({
    ...D,
    'request.type.approved.countsAbsent': false,
    'request.type.approved.pendingRule': 'drop'
  });
  assert.deepEqual(dropAll.payView(days, rows).payDays, {}, 'bỏ cả ngày thì không còn ngày nào để đếm');
});

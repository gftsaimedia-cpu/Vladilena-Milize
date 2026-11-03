'use strict';
// Ngày ngoài lịch chỉ trả đoạn làm thêm đã duyệt; Check-out muộn chỉ nới theo đoạn làm thêm sau ca đã khai.
require('../helpers/require-isolated-database');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const P = require('../../src/engine/punch');
const AV = require('../../src/engine/approval-view');
const Engine = require('../../src/engine/payroll-engine');
const { DEFAULTS } = require('../../src/engine/payroll-params');
const { lateCheckoutMin } = require('../../src/domain/explanation/late-checkout');

const SAT = '2026-10-10'; // thứ Bảy: trong lịch NV (T2–T7), ngoài lịch TTS (T2–T6)
const ASOF = '2026-11-02T12:00:00+07:00';
const NIGHT = { username: 'qa_night', type: 'nv', level: 1, shiftCode: 'Night2', startDate: '2025-01-06' };
const TTS = { username: 'qa_tts', type: 'tts', level: 1, shiftCode: 'Normal1', startDate: '2025-01-06' };
const SCHED = { nv: [1, 2, 3, 4, 5, 6], tts: [1, 2, 3, 4, 5] };
const vn = (date?, hm?, plus = 0) => {
  const d = new Date(Date.parse(date + 'T00:00:00Z') + plus * 86400000).toISOString().slice(0, 10);
  return new Date(`${d}T${hm}:00+07:00`).toISOString();
};
const who = (staff?) => ({ shiftCode: staff.shiftCode, sched: SCHED[staff.type] });
let nextId = 1;
const session = (staff?, date?, entry?) => ({
  id: nextId,
  sessionId: nextId++,
  username: staff.username,
  date,
  state: 'closed',
  entry
});
const approvalsFor = (days?, staff?) => {
  const out: Record<string, any> = {};
  for (const [date, day] of Object.entries<any>(days)) {
    const found = AV.itemOf(day, { date, holidays: [], staffType: staff.type });
    if (found) out[date] = { item: found.item, fingerprint: found.fingerprint, status: 'approved' };
  }
  return out;
};
function month(staff?, days?, { sessions = [], actual = false, approvals }: any = {}) {
  return Engine.create(DEFAULTS).computeMonth({
    staff,
    days,
    approvals: approvals || approvalsFor(days, staff),
    sessions,
    kpi: { pct: null, amt: null, admPct: null, admAmt: null },
    holidays: [],
    month: '2026-10',
    upTo: null,
    asOf: ASOF
  });
}
test('Check-out muộn: đoạn làm thêm sau ca đã khai nới giờ ra; ngày loại cũ makeup không nới', () => {
  const plannedShift = P.planShift(who(NIGHT), SAT);
  const open = { entry: { plannedShift, presIn: vn(SAT, '22:00') } };
  const withExtra = { kind: 'work', in: '22:00', out: '07:00', extraKind: 'makeup', extraIn: '', extraOut: '09:00' };
  assert.equal(lateCheckoutMin(open, vn(SAT, '09:00', 1), withExtra), 0);
  assert.equal(lateCheckoutMin(open, vn(SAT, '07:00', 1), { kind: 'makeup', in: '20:00', out: '09:00' }), 0);
  assert.equal(lateCheckoutMin(open, vn(SAT, '09:00', 1), { kind: 'makeup', in: '20:00', out: '09:00' }), 120);
});

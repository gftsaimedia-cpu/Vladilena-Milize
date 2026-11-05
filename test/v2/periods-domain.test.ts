import assert from 'node:assert/strict';
import { test } from 'node:test';
import { nextStatus, gateAllows, availableActions, approveReason, paydayOf, requestMonths } from '../../src/modules/periods/domain';
import {
  PeriodLockedError,
  ReasonRequiredError,
  BeforePaydayError,
} from '../../src/modules/periods/periods.errors';

test('transitions follow spec §4', () => {
  assert.equal(nextStatus('open', 'lock'), 'attendance_locked');
  assert.equal(nextStatus('attendance_locked', 'unlock'), 'open');
  assert.equal(nextStatus('calculated', 'unlock'), 'open');
  assert.equal(nextStatus('calculated', 'approve'), 'approved');
  assert.equal(nextStatus('approved', 'unapprove'), 'calculated');
  assert.equal(nextStatus('approved', 'pay'), 'paid');
  for (const a of ['lock', 'unlock', 'approve', 'unapprove', 'pay'] as const) assert.equal(nextStatus('paid', a), null);
  assert.equal(nextStatus('approved', 'unlock'), null);
  assert.equal(nextStatus('attendance_locked', 'approve'), null);
});
test('gate table of spec §5', () => {
  for (const u of ['punch', 'recalculate', 'file', 'explain', 'review', 'holiday'] as const) assert.equal(gateAllows('open', u), true);
  for (const s of ['attendance_locked', 'calculated'] as const) {
    assert.deepEqual(['punch', 'recalculate', 'file', 'holiday'].map(u => gateAllows(s, u as any)), [false, false, false, false]);
    assert.equal(gateAllows(s, 'explain'), true);
    assert.equal(gateAllows(s, 'review'), true);
  }
  for (const s of ['approved', 'paid'] as const) for (const u of ['punch', 'explain', 'review', 'holiday'] as const) assert.equal(gateAllows(s, u), false);
});
test('lock shows only after the month ends; pay only from payday', () => {
  const none = { pendingRequests: 0, unapprovedSlips: 0, missingSlips: [] };
  assert.deepEqual(availableActions({ month: '2026-10', status: 'open', today: '2026-10-31', payday: '2026-11-10', blockers: null }), {});
  assert.deepEqual(availableActions({ month: '2026-10', status: 'open', today: '2026-11-01', payday: '2026-11-10', blockers: null }), { lock: { enabled: true } });
  assert.deepEqual(availableActions({ month: '2026-10', status: 'approved', today: '2026-11-09', payday: '2026-11-10', blockers: null }), { unapprove: { enabled: true } });
  assert.deepEqual(availableActions({ month: '2026-10', status: 'approved', today: '2026-11-10', payday: '2026-11-10', blockers: null }), { unapprove: { enabled: true }, pay: { enabled: true } });
  assert.deepEqual(availableActions({ month: '2026-10', status: 'calculated', today: '2026-11-05', payday: '2026-11-10', blockers: none }), { unlock: { enabled: true }, approve: { enabled: true, blockers: none } });
  assert.deepEqual(availableActions({ month: '2026-10', status: 'paid', today: '2026-12-01', payday: '2026-11-10', blockers: null }), {});
});
test('approve reason lists missing, unapproved, pending in that order', () => {
  assert.equal(approveReason({ pendingRequests: 1, unapprovedSlips: 2, missingSlips: [] }), 'Còn 2 phiếu chưa duyệt · 1 đơn chờ duyệt');
  assert.equal(approveReason({ pendingRequests: 0, unapprovedSlips: 0, missingSlips: [{ username: 'a', name: 'A' }] }), 'Còn 1 người chưa có phiếu');
  assert.equal(approveReason({ pendingRequests: 0, unapprovedSlips: 0, missingSlips: [] }), undefined);
});
test('payday is the 10th of next month', () => {
  assert.equal(paydayOf('2026-10'), '2026-11-10');
  assert.equal(paydayOf('2026-12'), '2027-01-10');
});
test('request months cover every date field and both ends of a range', () => {
  assert.deepEqual(requestMonths({ leaveStartDate: '2026-10-30', leaveEndDate: '2026-11-02' }), ['2026-10', '2026-11']);
  assert.deepEqual(requestMonths({ changeStartDate: '2026-09-28', changeEndDate: '2026-11-03' }), ['2026-09', '2026-10', '2026-11']);
  assert.deepEqual(requestMonths({ otDate: '2026-10-05' }), ['2026-10']);
  assert.deepEqual(requestMonths({ explanationDate: '2026-10-29' }), ['2026-10']);
  assert.deepEqual(requestMonths({ advancePeriod: '2026-10' }), ['2026-10']);
  assert.deepEqual(requestMonths({ isatSaturday: '2026-10-10' }), ['2026-10']);
  assert.deepEqual(requestMonths({ leaveStartDate: '2026-10-20', leaveEndDate: '2026-10-20', makeupDates: ['2026-10-25', '2026-11-01'] }), ['2026-10', '2026-11']);
});
test('period errors carry HTTP status and code', () => {
  const e = new PeriodLockedError('2026-10', 'approved');
  assert.equal(e.status, 409);
  assert.equal(e.message, 'Kỳ lương tháng 10/2026 đã phê duyệt');
  assert.deepEqual(e.details, { code: 'PERIOD_LOCKED', month: '2026-10', status: 'approved' });
  assert.equal(new PeriodLockedError('2026-10', 'calculated').message, 'Tháng 10/2026 đã chốt công');
  assert.equal(new ReasonRequiredError().status, 400);
  assert.equal(new BeforePaydayError('2026-10', '2026-11-10').message, 'Chưa tới ngày trả lương 10/11/2026');
});

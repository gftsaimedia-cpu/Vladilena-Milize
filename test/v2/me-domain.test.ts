import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { daySummaryOf, monthOf, stepsOf, vnToday, weekOf } from '../../src/modules/me/domain';

const ts = (workDate: string, over: Record<string, unknown> = {}) => ({
  employeeId: 'u-nam', workDate, actualCheckIn: '07:55', actualCheckOut: '17:05', status: 'PRESENT',
  checkInStatus: 'ON_TIME', checkOutStatus: 'ON_TIME', metrics: { lateMinutes: 0 }, ...over
});

describe('Ngày hôm nay theo giờ Việt Nam', () => {
  it('vn midnight: 17:30Z belongs to the next day in Vietnam', () => {
    assert.equal(vnToday(new Date('2026-11-05T17:30:00Z')), '2026-11-06');
    assert.equal(vnToday(new Date('2026-11-05T16:59:00Z')), '2026-11-05');
  });

  it('the week runs Monday to Sunday', () => {
    assert.deepEqual(weekOf('2026-11-05'), ['2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06', '2026-11-07', '2026-11-08']);
  });
});

describe('Một ngày công', () => {
  const T = '2026-11-05';
  it('classifies the day', () => {
    assert.equal(daySummaryOf(undefined, '2026-11-01', T).kind, 'off'); // Chủ nhật
    assert.equal(daySummaryOf(undefined, '2026-11-06', T).kind, 'future');
    assert.equal(daySummaryOf(undefined, '2026-11-04', T).kind, 'absent');
    assert.equal(daySummaryOf(ts('2026-11-03') as any, '2026-11-03', T).kind, 'work');
    assert.equal(daySummaryOf(ts('2026-11-03', { checkInStatus: 'LATE', metrics: { lateMinutes: 12 } }) as any, '2026-11-03', T).kind, 'late');
    assert.equal(daySummaryOf(ts('2026-11-03', { status: 'LEAVE_PAID', actualCheckIn: null, actualCheckOut: null }) as any, '2026-11-03', T).kind, 'leave');
    assert.equal(daySummaryOf(ts('2026-11-04', { actualCheckOut: null }) as any, '2026-11-04', T).kind, 'todo');
    assert.equal(daySummaryOf(ts(T, { actualCheckOut: null }) as any, T, T).kind, 'work');
  });

  it('carries times and late minutes', () => {
    const d = daySummaryOf(ts('2026-11-03', { checkInStatus: 'LATE', actualCheckIn: '08:12', metrics: { lateMinutes: 12 } }) as any, '2026-11-03', T);
    assert.deepEqual(d, { date: '2026-11-03', kind: 'late', in: '08:12', out: '17:05', lateMinutes: 12 });
  });
});

describe('Công tháng', () => {
  it('counts the month totals', () => {
    const m = monthOf(
      [ts('2026-11-02'), ts('2026-11-03', { checkInStatus: 'LATE', metrics: { lateMinutes: 5 } }), ts('2026-11-04', { status: 'LEAVE_PAID', actualCheckIn: null, actualCheckOut: null })] as any,
      '2026-11',
      '2026-11-05'
    );
    assert.equal(m.days.length, 30);
    assert.deepEqual(m.totals, { workDays: 2, standardDays: 25, lateCount: 1, paidLeaveDays: 1 });
  });
});

describe('Các bước của đơn', () => {
  const base = { createdAt: '2026-11-05T01:00:00Z', reviewedAt: '2026-11-05T03:00:00Z' };
  it('shows sent then the decision', () => {
    assert.deepEqual(stepsOf({ ...base, status: 'PENDING', reviewedAt: null } as any), [
      { label: 'Đã gửi', at: '2026-11-05T01:00:00Z', state: 'done' },
      { label: 'Chờ duyệt', at: null, state: 'pend' }
    ]);
    assert.deepEqual(stepsOf({ ...base, status: 'APPROVED' } as any)[1], { label: 'Đã duyệt', at: '2026-11-05T03:00:00Z', state: 'done' });
    assert.deepEqual(stepsOf({ ...base, status: 'REJECTED' } as any)[1], { label: 'Đã từ chối', at: '2026-11-05T03:00:00Z', state: 'rej' });
    assert.deepEqual(stepsOf({ ...base, status: 'CANCELLED', updatedAt: '2026-11-05T04:00:00Z' } as any)[1], { label: 'Đã huỷ', at: '2026-11-05T04:00:00Z', state: 'rej' });
  });
});

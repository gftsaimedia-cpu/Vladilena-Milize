import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { daySummaryOf, estimateIncomeOf, monthOf, monthRangeOf, stepsOf, vnToday, weekOf } from '../../src/modules/me/domain';

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

  it("a past day without a timesheet outside the person's week is off, inside it is absent", () => {
    const BINH = [1, 2, 3, 4, 5]; // Bình: thứ Hai – thứ Sáu
    const later = '2026-12-14';
    assert.equal(daySummaryOf(undefined, '2026-12-12', later, BINH).kind, 'off'); // thứ Bảy
    assert.equal(daySummaryOf(undefined, '2026-12-11', later, BINH).kind, 'absent'); // thứ Sáu
    assert.equal(daySummaryOf(undefined, '2026-12-13', later, BINH).kind, 'off'); // Chủ nhật
    assert.equal(daySummaryOf(undefined, '2026-12-12', later).kind, 'absent'); // mặc định thứ Hai – thứ Bảy
    assert.equal(daySummaryOf(undefined, '2026-12-19', later, BINH).kind, 'off'); // ngày nghỉ sắp tới vẫn là off, như Chủ nhật hôm nay
    assert.equal(daySummaryOf(undefined, '2026-12-18', later, BINH).kind, 'future'); // thứ Sáu sắp tới
  });

  it('carries times and late minutes', () => {
    const d = daySummaryOf(ts('2026-11-03', { checkInStatus: 'LATE', actualCheckIn: '08:12', metrics: { lateMinutes: 12 } }) as any, '2026-11-03', T);
    assert.deepEqual(d, { date: '2026-11-03', kind: 'late', in: '08:12', out: '17:05', lateMinutes: 12 });
  });

  it('names the kind of leave from the timesheet status', () => {
    const off = (status: string) => daySummaryOf(ts('2026-11-03', { status, actualCheckIn: null, actualCheckOut: null }) as any, '2026-11-03', T);
    assert.deepEqual(off('LEAVE_PAID'), { date: '2026-11-03', kind: 'leave', leave: 'paid', in: null, out: null, lateMinutes: 0 });
    assert.equal(off('LEAVE_UNPAID').leave, 'unpaid');
    assert.equal(off('HOLIDAY').leave, 'holiday');
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

  it('a day outside the given week is off and standardDays counts the week', () => {
    const m = monthOf([], '2026-12', '2026-12-31', null, [1, 2, 3, 4, 5]);
    assert.equal(m.days.find(d => d.date === '2026-12-12')!.kind, 'off');
    assert.equal(m.days.find(d => d.date === '2026-12-11')!.kind, 'absent');
    assert.equal(m.totals.standardDays, 23);
  });

  it('the period is open until a day of the month is locked', () => {
    assert.equal(monthOf([ts('2026-10-01')] as any, '2026-10', '2026-11-05').periodState, 'open');
    assert.equal(monthOf([ts('2026-10-01'), ts('2026-10-02', { isLocked: true })] as any, '2026-10', '2026-11-05').periodState, 'locked');
  });

  it('the period is locked once Admin closes the month (Chốt công)', () => {
    const days = [ts('2026-10-01')] as any;
    assert.equal(monthOf(days, '2026-10', '2026-11-05', 'open').periodState, 'open');
    assert.equal(monthOf(days, '2026-10', '2026-11-05', null).periodState, 'open');
    for (const status of ['attendance_locked', 'calculated', 'reviewed', 'approved', 'paid']) {
      assert.equal(monthOf(days, '2026-10', '2026-11-05', status).periodState, 'locked', status);
    }
  });
});

describe('Khoảng tháng được xem', () => {
  it('runs from the start month to this month', () => {
    assert.deepEqual(monthRangeOf('2024-03-04', '2026-11-05'), { from: '2024-03', to: '2026-11' });
  });

  it('without a start date only this month', () => {
    assert.deepEqual(monthRangeOf(null, '2026-11-05'), { from: '2026-11', to: '2026-11' });
  });

  it('a start date after today still gives this month', () => {
    assert.deepEqual(monthRangeOf('2026-12-01', '2026-11-05'), { from: '2026-11', to: '2026-11' });
  });

  it('a start date with an impossible month counts as missing', () => {
    assert.deepEqual(monthRangeOf('2024-13-01', '2026-11-05'), { from: '2026-11', to: '2026-11' });
    assert.deepEqual(monthRangeOf('2024-00-10', '2026-11-05'), { from: '2026-11', to: '2026-11' });
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

describe('Thu nhập tạm tính', () => {
  // pw-staff vào làm 05/11, chưa có ngày công: phiếu đầy đủ trừ bảo hiểm cả tháng 630.000 trên tổng thu nhập 0.
  const newHire = {
    grossIncome: 0, baseSalaryActual: 0, insuranceDeduction: 630_000, insuranceBreakdown: { bhxh: 480_000, bhyt: 90_000, bhtn: 60_000 },
    incomeAfterInsurance: -630_000, personalIncomeTax: 0, advanceDeduction: 0, netIncome: -630_000
  };

  it('a new hire with no work days yet sees 0, not minus the insurance', () => {
    const e = estimateIncomeOf(newHire as any);
    assert.equal(e.netIncome, 0);
    assert.equal(e.insuranceDeduction, 0);
    assert.deepEqual(e.insuranceBreakdown, { bhxh: 0, bhyt: 0, bhtn: 0 });
    assert.equal(e.incomeAfterInsurance, 0);
  });

  it('takes off neither insurance nor tax, only the approved advance', () => {
    const e = estimateIncomeOf({
      ...newHire, grossIncome: 15_538_183, baseSalaryActual: 11_076_923, insuranceDeduction: 1_260_000,
      incomeAfterInsurance: 14_278_183, personalIncomeTax: 120_000, advanceDeduction: 2_000_000, netIncome: 12_158_183
    } as any);
    assert.equal(e.personalIncomeTax, 0);
    assert.equal(e.incomeAfterInsurance, 15_538_183);
    assert.equal(e.advanceDeduction, 2_000_000);
    assert.equal(e.netIncome, 13_538_183);
    assert.equal(e.baseSalaryActual, 11_076_923);
  });
});

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { daySummaryOf, estimateIncomeOf, monthOf, monthRangeOf, stepsOf, vnToday, weekOf } from '../../src/modules/me/domain';

// Dòng ngày công như DailyTimesheetDTO: mặc định là ngày PRESENT đủ giờ, không có trường hợp giải trình.
const ts = (workDate: string, over: Record<string, unknown> = {}) => ({
  employeeId: 'u-nam', workDate, actualCheckIn: '07:55', actualCheckOut: '17:05', status: 'PRESENT',
  metrics: { lateMinutes: 0 }, leaveType: null, cases: [], explanationStatus: 'NONE', explanationRequestId: null,
  payUnits: 1, deductionMinutes: 0, countsAsWorkday: true, countsAsDayOff: false, makeupMinutes: 0, ...over
});
// Dòng không có giờ chấm (nghỉ, lễ, ngoài thời gian làm, nghỉ tuần).
const bare = (workDate: string, status: string, over: Record<string, unknown> = {}) =>
  ts(workDate, { status, actualCheckIn: null, actualCheckOut: null, payUnits: 0, countsAsWorkday: false, ...over });
const LATE_CASE = { code: 'LATE_CHECK_IN', minutes: 40, affectsPay: true };
const INFO_CASE = { code: 'EARLY_CHECK_IN', minutes: 20, affectsPay: false };

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
  const D = '2026-11-03'; // thứ Hai đã qua
  const kindOf = (row: Record<string, unknown> | undefined, date = D, today = T) => daySummaryOf(row as any, date, today);

  it('a missing row keeps the old rule: off outside my week, future ahead, absent behind', () => {
    assert.equal(kindOf(undefined, '2026-11-01').kind, 'off'); // Chủ nhật
    assert.equal(kindOf(undefined, '2026-11-06').kind, 'future');
    assert.equal(kindOf(undefined, '2026-11-04').kind, 'absent');
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

  // Mỗi dòng của bảng spec 8.2 một test.
  it('OUTSIDE is outside', () => {
    assert.equal(kindOf(bare(D, 'OUTSIDE')).kind, 'outside');
    assert.equal(kindOf(bare(D, 'OUTSIDE')).leave, undefined);
  });

  it('REST is off', () => {
    assert.equal(kindOf(bare('2026-11-01', 'REST'), '2026-11-01').kind, 'off');
  });

  it('EXTRA is extra and keeps its punches', () => {
    const d = kindOf(ts('2026-11-01', { status: 'EXTRA', actualCheckIn: '09:00', actualCheckOut: '12:00', payUnits: 0, countsAsWorkday: false }), '2026-11-01');
    assert.equal(d.kind, 'extra');
    assert.equal(d.in, '09:00');
    assert.equal(d.out, '12:00');
  });

  it('HOLIDAY is leave/holiday', () => {
    const d = kindOf(bare(D, 'HOLIDAY'));
    assert.deepEqual([d.kind, d.leave], ['leave', 'holiday']);
  });

  it('ISAT is leave/isat', () => {
    const d = kindOf(bare(D, 'ISAT'));
    assert.deepEqual([d.kind, d.leave], ['leave', 'isat']);
  });

  it('LEAVE_PAID is leave/paid', () => {
    const d = kindOf(bare(D, 'LEAVE_PAID'));
    assert.deepEqual([d.kind, d.leave], ['leave', 'paid']);
  });

  it('LEAVE_UNPAID is leave/unpaid', () => {
    const d = kindOf(bare(D, 'LEAVE_UNPAID'));
    assert.deepEqual([d.kind, d.leave], ['leave', 'unpaid']);
  });

  it('LEAVE_MAKEUP is leave/makeup', () => {
    const d = kindOf(bare(D, 'LEAVE_MAKEUP'));
    assert.deepEqual([d.kind, d.leave], ['leave', 'makeup']);
  });

  it('PENDING today is work, PENDING after today is future', () => {
    assert.equal(kindOf(ts(T, { status: 'PENDING', actualCheckOut: null, countsAsWorkday: false, payUnits: 0 }), T).kind, 'work');
    assert.equal(kindOf(bare('2026-11-06', 'PENDING'), '2026-11-06').kind, 'future');
  });

  it('PRESENT with a pay-affecting case that is not approved is todo, whatever the explanation state', () => {
    for (const explanationStatus of ['NONE', 'PENDING', 'REJECTED']) {
      const row = ts(D, { actualCheckIn: '08:40', actualCheckOut: '17:00', cases: [LATE_CASE], explanationStatus, payUnits: 0, countsAsWorkday: false });
      assert.equal(kindOf(row).kind, 'todo', explanationStatus);
    }
  });

  it('PRESENT with a missing check-out the day after is todo', () => {
    const row = ts('2026-11-04', {
      actualCheckOut: null, cases: [{ code: 'MISSING_CHECK_OUT', minutes: 0, affectsPay: true }], payUnits: 0, countsAsWorkday: false
    });
    assert.equal(kindOf(row, '2026-11-04').kind, 'todo');
  });

  it('PRESENT with minutes deducted is late', () => {
    const row = ts(D, { actualCheckIn: '08:40', cases: [LATE_CASE], explanationStatus: 'APPROVED', deductionMinutes: 30, metrics: { lateMinutes: 40 } });
    assert.equal(kindOf(row).kind, 'late');
  });

  it('PRESENT with a case that is only informational stays work', () => {
    const row = ts(D, { cases: [INFO_CASE] });
    assert.equal(kindOf(row).kind, 'work');
  });

  it('PRESENT with an approved explanation and no deduction is work', () => {
    const row = ts(D, { cases: [LATE_CASE], explanationStatus: 'APPROVED', deductionMinutes: 0 });
    assert.equal(kindOf(row).kind, 'work');
  });

  it('the plain PRESENT day is work', () => {
    assert.equal(kindOf(ts(D)).kind, 'work');
  });

  it('ABSENT is absent', () => {
    assert.equal(kindOf(bare(D, 'ABSENT', { countsAsDayOff: true })).kind, 'absent');
  });

  it('carries times, late minutes, explanationStatus and cases', () => {
    const row = ts(D, { actualCheckIn: '08:12', cases: [LATE_CASE], explanationStatus: 'APPROVED', deductionMinutes: 30, metrics: { lateMinutes: 12 } });
    assert.deepEqual(kindOf(row), {
      date: D, kind: 'late', in: '08:12', out: '17:05', lateMinutes: 12, explanationStatus: 'approved', cases: [LATE_CASE]
    });
  });

  it('reads punch times given as ISO instants in Vietnam time', () => {
    const d = kindOf(ts(D, { actualCheckIn: '2026-11-03T01:40:00.000Z', actualCheckOut: '2026-11-03T10:00:00.000Z' }));
    assert.deepEqual([d.in, d.out], ['08:40', '17:00']);
  });

  it('lowercases the explanation state of the row', () => {
    for (const s of ['NONE', 'PENDING', 'APPROVED', 'REJECTED']) {
      assert.equal(kindOf(ts(D, { explanationStatus: s })).explanationStatus, s.toLowerCase());
    }
  });

  it('a day without a row has no explanation and no cases', () => {
    assert.deepEqual(kindOf(undefined, '2026-11-04'), { date: '2026-11-04', kind: 'absent', in: null, out: null, lateMinutes: 0, explanationStatus: 'none', cases: [] });
  });

  it('a leave day shows no punches and no late minutes', () => {
    assert.deepEqual(kindOf(bare(D, 'LEAVE_PAID')), {
      date: D, kind: 'leave', leave: 'paid', in: null, out: null, lateMinutes: 0, explanationStatus: 'none', cases: []
    });
  });
});

describe('Công tháng', () => {
  it('counts the month totals', () => {
    const m = monthOf(
      [
        ts('2026-11-02'),
        ts('2026-11-03', { cases: [LATE_CASE], explanationStatus: 'APPROVED', deductionMinutes: 30, metrics: { lateMinutes: 40 } }),
        bare('2026-11-04', 'LEAVE_PAID', { payUnits: 1 })
      ] as any,
      '2026-11',
      '2026-11-05'
    );
    assert.equal(m.days.length, 30);
    assert.deepEqual(m.totals, { workDays: 2, standardDays: 25, lateCount: 1, paidLeaveDays: 1 });
  });

  it('with a Monday to Friday week standardDays of 11/2026 is 21', () => {
    const m = monthOf([], '2026-11', '2026-11-05', null, [1, 2, 3, 4, 5]);
    assert.equal(m.totals.standardDays, 21);
  });

  it('workDays counts the rows that count as a workday, not the kind', () => {
    const m = monthOf(
      [
        ts('2026-11-02'),
        ts('2026-11-03', { cases: [LATE_CASE], payUnits: 0, countsAsWorkday: false }), // todo: chưa tính công
        bare('2026-11-04', 'PENDING')
      ] as any,
      '2026-11',
      '2026-11-04'
    );
    assert.equal(m.totals.workDays, 1);
  });

  it('paidLeaveDays counts LEAVE_PAID, HOLIDAY and ISAT that pay one unit (R11)', () => {
    const m = monthOf(
      [
        bare('2026-11-02', 'LEAVE_PAID', { payUnits: 1 }),
        bare('2026-11-03', 'HOLIDAY', { payUnits: 1 }),
        bare('2026-11-04', 'ISAT', { payUnits: 1 }),
        bare('2026-11-05', 'HOLIDAY', { payUnits: 0 }),
        bare('2026-11-06', 'ISAT', { payUnits: 0 }),
        bare('2026-11-07', 'LEAVE_UNPAID'),
        bare('2026-11-09', 'LEAVE_MAKEUP')
      ] as any,
      '2026-11',
      '2026-11-10'
    );
    assert.equal(m.totals.paidLeaveDays, 3);
    assert.equal(m.totals.workDays, 0);
  });

  it('lateCount counts the days whose kind is late', () => {
    const late = { cases: [LATE_CASE], explanationStatus: 'APPROVED', deductionMinutes: 30 };
    const m = monthOf(
      [ts('2026-11-02', late), ts('2026-11-03', late), ts('2026-11-04', { cases: [LATE_CASE], payUnits: 0, countsAsWorkday: false })] as any,
      '2026-11',
      '2026-11-05'
    );
    assert.equal(m.totals.lateCount, 2); // ngày thứ ba là todo, không phải late
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

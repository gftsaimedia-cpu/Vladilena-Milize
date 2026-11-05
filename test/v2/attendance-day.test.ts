import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  MAX_DEDUCTION_MINUTES,
  buildDay,
  deductionBlock,
  type AttendanceDay,
  type DaySources,
  type ScheduleFacts
} from '../../src/modules/attendance/domain/attendance-day';
import { vnInstant } from '../../src/modules/attendance/domain/calendar';

const DATE = '2026-11-03'; // thứ Ba
const NEXT = '2026-11-04';

function src(o: Partial<DaySources> = {}): DaySources {
  return {
    date: DATE,
    schedule: null,
    punches: [],
    otWindows: [],
    makeupWindows: [],
    explanation: null,
    isHoliday: false,
    now: new Date('2026-11-30T12:00:00Z'),
    employment: { startDate: '2026-01-01', resignedOn: null },
    benefits: { paidLeave: true, paidHoliday: true, isat: true },
    workWeek: [1, 2, 3, 4, 5, 6],
    graceMinutes: 15,
    defaultShift: { type: 'NORMAL', start: '08:00', end: '17:00', allowancePct: 0 },
    ...o
  };
}

const inAt = (hm: string, date = DATE) => ({ type: 'IN' as const, at: vnInstant(date, hm) });
const outAt = (hm: string, date = DATE) => ({ type: 'OUT' as const, at: vnInstant(date, hm) });
const punches = (a: string, b: string, date = DATE) => [inAt(a, date), outAt(b, date)];
const approved = (over: Partial<NonNullable<DaySources['explanation']>> = {}) => ({
  requestId: 'req-exp',
  status: 'APPROVED' as const,
  checkIn: null,
  checkOut: null,
  ...over
});
const day = (o: Partial<DaySources> = {}): AttendanceDay => buildDay('emp-1', src(o));
const codes = (d: AttendanceDay): string[] => d.cases.map(c => c.code);

function leave(over: Partial<ScheduleFacts>): ScheduleFacts {
  return {
    scheduleType: 'REGULAR',
    status: 'ON_LEAVE',
    shiftType: 'NORMAL',
    start: '08:00',
    end: '17:00',
    sourceRequestId: 'req-leave',
    requestType: 'LEAVE',
    leaveType: 'ANNUAL',
    ...over
  };
}

describe('deductionBlock', () => {
  it('trừ theo khối 30 phút (L4)', () => {
    assert.equal(deductionBlock(15), 0);
    assert.equal(deductionBlock(16), 30);
    assert.equal(deductionBlock(44), 30);
    assert.equal(deductionBlock(45), 60);
    assert.equal(deductionBlock(74), 60);
    assert.equal(deductionBlock(75), 90);
  });

  it('làm tròn từng bên rồi cộng (L5)', () => {
    assert.equal(deductionBlock(20) + deductionBlock(20), 60);
  });

  it('trần 480 phút một ngày (R7)', () => {
    assert.equal(MAX_DEDUCTION_MINUTES, 480);
  });
});

describe('buildDay: ngày đi làm (spec 5)', () => {
  it('08:05–17:10 → PRESENT, đủ lương, không trừ', () => {
    const d = day({ punches: punches('08:05', '17:10') });
    assert.equal(d.status, 'PRESENT');
    assert.equal(d.payUnits, 1);
    assert.equal(d.deductionMinutes, 0);
    assert.equal(d.countsAsWorkday, true);
    assert.equal(d.countsAsDayOff, false);
    assert.deepEqual(d.shift, { type: 'NORMAL', start: '08:00', end: '17:00', allowancePct: 0 });
  });

  it('08:40–17:00 + giải trình duyệt → trừ 30', () => {
    const d = day({ punches: punches('08:40', '17:00'), explanation: approved() });
    assert.equal(d.status, 'PRESENT');
    assert.equal(d.payUnits, 1);
    assert.equal(d.deductionMinutes, 30);
    assert.equal(d.explanationStatus, 'APPROVED');
    assert.equal(d.explanationRequestId, 'req-exp');
    assert.equal(d.lateMinutes, 40);
  });

  it('08:40–17:00 không giải trình → 0 đ, không phải ngày nghỉ (L17)', () => {
    const d = day({ punches: punches('08:40', '17:00') });
    assert.equal(d.status, 'PRESENT');
    assert.equal(d.payUnits, 0);
    assert.equal(d.countsAsWorkday, false);
    assert.equal(d.countsAsDayOff, false);
    assert.equal(d.dayStatus, 'NEEDS_EXPLANATION');
    assert.equal(d.checkInStatus, 'LATE');
    assert.equal(d.explanationStatus, 'NONE');
    assert.equal(d.explanationRequestId, null);
  });

  it('08:20–16:40 + duyệt → 30 + 30 = 60 (L5)', () => {
    const d = day({ punches: punches('08:20', '16:40'), explanation: approved() });
    assert.equal(d.deductionMinutes, 60);
    assert.equal(d.payUnits, 1);
    assert.equal(d.earlyMinutes, 20);
  });

  it('không chấm → ABSENT, tính ngày nghỉ, có hai mã thiếu', () => {
    const d = day();
    assert.equal(d.status, 'ABSENT');
    assert.equal(d.payUnits, 0);
    assert.equal(d.countsAsDayOff, true);
    assert.equal(d.countsAsWorkday, false);
    assert.deepEqual(codes(d), ['MISSING_CHECK_IN', 'MISSING_CHECK_OUT']);
    assert.equal(d.checkInStatus, 'MISSED');
    assert.equal(d.checkOutStatus, 'MISSED');
  });

  it('khung bù 18–22, chấm 08:00–21:00 → ra sớm chỉ để biết, bù 180 phút', () => {
    const d = day({ punches: punches('08:00', '21:00'), makeupWindows: [{ start: '18:00', end: '22:00' }] });
    assert.equal(d.status, 'PRESENT');
    assert.equal(d.payUnits, 1);
    assert.deepEqual(d.cases, [{ code: 'EARLY_CHECK_OUT', minutes: 60, affectsPay: false }]);
    assert.equal(d.makeupMinutes, 180);
  });

  it('giải trình PENDING → 0 đ, giữ trạng thái PENDING', () => {
    const d = day({
      punches: punches('08:40', '17:00'),
      explanation: approved({ status: 'PENDING' })
    });
    assert.equal(d.payUnits, 0);
    assert.equal(d.explanationStatus, 'PENDING');
    assert.equal(d.deductionMinutes, 0);
  });

  it('giải trình REJECTED → 0 đ', () => {
    const d = day({
      punches: punches('08:40', '17:00'),
      explanation: approved({ status: 'REJECTED' })
    });
    assert.equal(d.payUnits, 0);
    assert.equal(d.explanationStatus, 'REJECTED');
  });

  it('R6: không chấm + giải trình PENDING → vẫn ABSENT, tính ngày nghỉ', () => {
    const d = day({ explanation: approved({ status: 'PENDING' }) });
    assert.equal(d.status, 'ABSENT');
    assert.equal(d.countsAsDayOff, true);
    assert.equal(d.explanationStatus, 'PENDING');
  });

  it('ngày vắng có giải trình duyệt (giờ 08:00/17:00) → PRESENT, đủ lương, hai mã thiếu', () => {
    const d = day({ explanation: approved({ checkIn: '08:00', checkOut: '17:00' }) });
    assert.equal(d.status, 'PRESENT');
    assert.equal(d.payUnits, 1);
    assert.equal(d.deductionMinutes, 0);
    assert.equal(d.countsAsWorkday, true);
    assert.equal(d.countsAsDayOff, false);
    assert.deepEqual(codes(d), ['MISSING_CHECK_IN', 'MISSING_CHECK_OUT']);
    assert.equal(d.workHours, 0);
  });

  it('R7: vào 08:00, ra 08:05, duyệt → trừ tối đa 480', () => {
    const d = day({ punches: punches('08:00', '08:05'), explanation: approved() });
    assert.equal(d.deductionMinutes, 480);
    assert.equal(d.payUnits, 1);
  });
});

describe('buildDay: OUTSIDE (L13)', () => {
  it('trước ngày vào làm', () => {
    const d = day({ employment: { startDate: '2026-11-11', resignedOn: null } });
    assert.equal(d.status, 'OUTSIDE');
    assert.equal(d.payUnits, 0);
    assert.equal(d.countsAsDayOff, false);
    assert.equal(d.countsAsWorkday, false);
    assert.deepEqual(d.cases, []);
  });

  it('chính ngày nghỉ việc vẫn là ngày làm, ngày sau là OUTSIDE', () => {
    const employment = { startDate: '2026-01-01', resignedOn: '2026-11-03' };
    assert.notEqual(day({ employment }).status, 'OUTSIDE');
    assert.equal(day({ date: NEXT, employment }).status, 'OUTSIDE');
  });

  it('lễ trên ngày ngoài thời gian làm → OUTSIDE', () => {
    const d = day({ isHoliday: true, employment: { startDate: '2026-11-11', resignedOn: null } });
    assert.equal(d.status, 'OUTSIDE');
    assert.equal(d.payUnits, 0);
  });

  it('startDate null → không bao giờ OUTSIDE', () => {
    const d = day({ employment: { startDate: null, resignedOn: null } });
    assert.notEqual(d.status, 'OUTSIDE');
  });
});

describe('buildDay: HOLIDAY (L9, L10)', () => {
  it('ngày làm, có cờ paidHoliday → HOLIDAY 1 lương, không ca', () => {
    const d = day({ isHoliday: true });
    assert.equal(d.status, 'HOLIDAY');
    assert.equal(d.payUnits, 1);
    assert.equal(d.shift, null);
    assert.equal(d.countsAsWorkday, false);
    assert.equal(d.countsAsDayOff, false);
    assert.equal(d.dayStatus, 'PLANNED');
  });

  it('cờ tắt → 0 đ', () => {
    const d = day({ isHoliday: true, benefits: { paidLeave: true, paidHoliday: false, isat: true } });
    assert.equal(d.status, 'HOLIDAY');
    assert.equal(d.payUnits, 0);
  });

  it('lễ trên Chủ nhật → REST', () => {
    assert.equal(day({ date: '2026-11-01', isHoliday: true }).status, 'REST');
  });

  it('lễ thứ Bảy với tuần [1..5] → REST', () => {
    const d = day({ date: '2026-11-07', isHoliday: true, workWeek: [1, 2, 3, 4, 5] });
    assert.equal(d.status, 'REST');
    assert.equal(d.payUnits, 0);
  });

  it('lễ + lịch nghỉ cùng ngày → HOLIDAY', () => {
    const d = day({ isHoliday: true, schedule: leave({}) });
    assert.equal(d.status, 'HOLIDAY');
    assert.equal(d.leaveType, null);
  });

  it('lễ có khung OT, chấm đủ → HOLIDAY, mã dò chỉ để biết (không ca)', () => {
    const d = day({
      isHoliday: true,
      otWindows: [{ start: '08:00', end: '12:00' }],
      punches: [inAt('09:00'), outAt('12:00')]
    });
    assert.equal(d.status, 'HOLIDAY');
    assert.deepEqual(d.cases, [{ code: 'LATE_CHECK_IN', minutes: 60, affectsPay: false }]);
    assert.equal(d.payUnits, 1);
  });
});

describe('buildDay: iSAT và đơn nghỉ', () => {
  it('lịch iSAT → ISAT 1 lương, có đơn nguồn', () => {
    const d = day({ schedule: leave({ scheduleType: 'ISAT', requestType: 'ISAT', leaveType: null }) });
    assert.equal(d.status, 'ISAT');
    assert.equal(d.payUnits, 1);
    assert.equal(d.sourceRequestId, 'req-leave');
    assert.equal(d.countsAsDayOff, false);
    assert.equal(d.dayStatus, 'ON_LEAVE');
  });

  it('cờ isat tắt → 0 đ', () => {
    const d = day({
      schedule: leave({ scheduleType: 'ISAT', requestType: 'ISAT', leaveType: null }),
      benefits: { paidLeave: true, paidHoliday: true, isat: false }
    });
    assert.equal(d.status, 'ISAT');
    assert.equal(d.payUnits, 0);
  });

  it('LEAVE ANNUAL → LEAVE_PAID, 1 lương, tính ngày nghỉ', () => {
    const d = day({ schedule: leave({}) });
    assert.equal(d.status, 'LEAVE_PAID');
    assert.equal(d.payUnits, 1);
    assert.equal(d.countsAsDayOff, true);
    assert.equal(d.countsAsWorkday, false);
    assert.equal(d.leaveType, 'ANNUAL');
    assert.equal(d.sourceRequestId, 'req-leave');
    assert.equal(d.dayStatus, 'ON_LEAVE');
    assert.equal(d.shift, null);
  });

  it('R12: cờ paidLeave tắt → LEAVE_UNPAID', () => {
    const d = day({ schedule: leave({}), benefits: { paidLeave: false, paidHoliday: true, isat: true } });
    assert.equal(d.status, 'LEAVE_UNPAID');
    assert.equal(d.payUnits, 0);
    assert.equal(d.countsAsDayOff, true);
  });

  it('PERSONAL_UNPAID → LEAVE_UNPAID', () => {
    assert.equal(day({ schedule: leave({ leaveType: 'PERSONAL_UNPAID' }) }).status, 'LEAVE_UNPAID');
  });

  it('SOCIAL_INSURANCE → LEAVE_UNPAID', () => {
    assert.equal(day({ schedule: leave({ leaveType: 'SOCIAL_INSURANCE' }) }).status, 'LEAVE_UNPAID');
  });

  it('LEAVE_WITH_MAKEUP → LEAVE_MAKEUP, 0 đ, không tính ngày nghỉ (L14)', () => {
    const d = day({ schedule: leave({ requestType: 'LEAVE_WITH_MAKEUP' }) });
    assert.equal(d.status, 'LEAVE_MAKEUP');
    assert.equal(d.payUnits, 0);
    assert.equal(d.countsAsDayOff, false);
    assert.equal(d.dayStatus, 'ON_LEAVE');
  });
});

describe('buildDay: ngày ngoài tuần (L12)', () => {
  const SUNDAY = '2026-11-15';

  it('Chủ nhật không khung → REST', () => {
    const d = day({ date: SUNDAY });
    assert.equal(d.status, 'REST');
    assert.equal(d.payUnits, 0);
    assert.equal(d.countsAsDayOff, false);
    assert.equal(d.dayStatus, 'PLANNED');
    assert.deepEqual(d.cases, []);
  });

  it('Chủ nhật có khung OT 08–12, chấm 08:00–12:00 → EXTRA', () => {
    const d = day({
      date: SUNDAY,
      otWindows: [{ start: '08:00', end: '12:00' }],
      punches: punches('08:00', '12:00', SUNDAY)
    });
    assert.equal(d.status, 'EXTRA');
    assert.equal(d.payUnits, 0);
    assert.equal(d.countsAsWorkday, false);
    assert.equal(d.shift, null);
    assert.deepEqual(d.cases, []);
    assert.equal(d.makeupMinutes, 0);
  });

  it('Chủ nhật có khung bù 08–12, chấm 08:00–12:00 → bù 240 phút', () => {
    const d = day({
      date: SUNDAY,
      makeupWindows: [{ start: '08:00', end: '12:00' }],
      punches: punches('08:00', '12:00', SUNDAY)
    });
    assert.equal(d.status, 'EXTRA');
    assert.equal(d.makeupMinutes, 240);
  });

  it('R3: Chủ nhật có lịch REGULAR và có chấm nhưng không khung → REST', () => {
    const d = day({
      date: SUNDAY,
      schedule: leave({
        scheduleType: 'REGULAR',
        status: 'PLANNED',
        requestType: null,
        leaveType: null,
        sourceRequestId: null
      }),
      punches: punches('08:00', '17:00', SUNDAY)
    });
    assert.equal(d.status, 'REST');
    assert.equal(d.countsAsWorkday, false);
  });

  it('ngày EXTRA thiếu giờ ra khi đã quá mốc → mã thiếu chỉ để biết', () => {
    const d = day({
      date: SUNDAY,
      otWindows: [{ start: '08:00', end: '12:00' }],
      punches: [inAt('08:00', SUNDAY)]
    });
    assert.equal(d.status, 'EXTRA');
    assert.deepEqual(d.cases, [{ code: 'MISSING_CHECK_OUT', minutes: 0, affectsPay: false }]);
  });
});

describe('buildDay: ca của ngày làm (R3)', () => {
  const flexChange: ScheduleFacts = {
    scheduleType: 'SHIFT_CHANGE',
    status: 'PLANNED',
    shiftType: 'FLEX',
    start: '10:00',
    end: '19:00',
    sourceRequestId: 'req-shift',
    requestType: 'SHIFT_CHANGE',
    leaveType: null
  };

  it('SHIFT_CHANGE FLEX 10–19, vào 10:05 → không mã', () => {
    const d = day({ schedule: flexChange, punches: punches('10:05', '19:00') });
    assert.deepEqual(d.cases, []);
    assert.equal(d.status, 'PRESENT');
    assert.equal(d.payUnits, 1);
    assert.equal(d.shift?.type, 'FLEX');
    assert.equal(d.shift?.start, '10:00');
  });

  it('cùng lịch, vào 08:00 → EARLY_CHECK_IN', () => {
    const d = day({ schedule: flexChange, punches: punches('08:00', '19:00') });
    assert.ok(codes(d).includes('EARLY_CHECK_IN'));
    assert.equal(d.checkInStatus, 'EARLY');
    assert.equal(d.payUnits, 0);
  });

  it('lịch REGULAR 09–18 bị bỏ qua: vào 08:00 không mã', () => {
    const regular: ScheduleFacts = {
      ...flexChange,
      scheduleType: 'REGULAR',
      shiftType: 'NORMAL',
      start: '09:00',
      end: '18:00',
      requestType: null,
      sourceRequestId: null
    };
    const d = day({ schedule: regular, punches: punches('08:00', '17:00') });
    assert.deepEqual(d.cases, []);
    assert.equal(d.shift?.start, '08:00');
  });

  it('lịch SHIFT_CHANGE đã huỷ bị bỏ qua', () => {
    const d = day({ schedule: { ...flexChange, status: 'CANCELLED' }, punches: punches('08:00', '17:00') });
    assert.deepEqual(d.cases, []);
    assert.equal(d.shift?.start, '08:00');
  });
});

describe('buildDay: PENDING và mốc xét (spec 4.3)', () => {
  const D = '2026-11-30'; // thứ Hai

  it('16:00 VN chưa chấm → PENDING, PLANNED', () => {
    const d = day({ date: D, now: new Date('2026-11-30T09:00:00Z') });
    assert.equal(d.status, 'PENDING');
    assert.equal(d.dayStatus, 'PLANNED');
    assert.equal(d.payUnits, 0);
    assert.deepEqual(d.cases, []);
    assert.equal(d.checkInStatus, 'PENDING');
    assert.equal(d.checkOutStatus, 'PENDING');
  });

  it('17:30 VN chưa chấm → ABSENT', () => {
    const d = day({ date: D, now: new Date('2026-11-30T10:30:00Z') });
    assert.equal(d.status, 'ABSENT');
  });

  it('17:29 VN chưa chấm → vẫn PENDING', () => {
    const d = day({ date: D, now: new Date('2026-11-30T10:29:00Z') });
    assert.equal(d.status, 'PENDING');
  });

  it('chỉ có lần vào lúc 16:00 VN → PENDING, IN_PROGRESS', () => {
    const d = day({ date: D, now: new Date('2026-11-30T09:00:00Z'), punches: [inAt('08:00', D)] });
    assert.equal(d.status, 'PENDING');
    assert.equal(d.dayStatus, 'IN_PROGRESS');
    assert.equal(d.checkInStatus, 'VALID');
    assert.equal(d.checkOutStatus, 'PENDING');
  });

  it('R8: đủ vào và ra trước mốc → PRESENT', () => {
    const d = day({ date: D, now: new Date('2026-11-30T09:00:00Z'), punches: punches('08:00', '15:00', D) });
    assert.equal(d.status, 'PRESENT');
    assert.ok(codes(d).includes('EARLY_CHECK_OUT'));
    assert.equal(d.payUnits, 0);
  });

  it('ngày tương lai → PENDING', () => {
    const d = day({ date: '2026-12-02' });
    assert.equal(d.status, 'PENDING');
    assert.equal(d.payUnits, 0);
  });
});

describe('buildDay: ca đêm (L21)', () => {
  it('NIGHT 22–06, chấm 22:00 và 05:50 hôm sau → ra sớm 10 phút', () => {
    const d = day({
      defaultShift: { type: 'NIGHT', start: '22:00', end: '06:00', allowancePct: 30 },
      punches: [inAt('22:00'), outAt('05:50', NEXT)]
    });
    assert.equal(d.status, 'PRESENT');
    assert.equal(d.payUnits, 0);
    assert.deepEqual(d.cases, [{ code: 'EARLY_CHECK_OUT', minutes: 10, affectsPay: true }]);
    assert.equal(d.shift?.allowancePct, 30);
    assert.equal(d.workHours, 7.83);
  });
});

describe('buildDay: cột cũ (spec 6)', () => {
  it('ra 17:20 không khung → LATE_WITHOUT_OT', () => {
    const d = day({ punches: punches('08:00', '17:20') });
    assert.equal(d.checkOutStatus, 'LATE_WITHOUT_OT');
    assert.equal(d.payUnits, 0);
  });

  it('08:00–17:00 → workHours 9, VALID', () => {
    const d = day({ punches: punches('08:00', '17:00') });
    assert.equal(d.workHours, 9);
    assert.equal(d.checkInStatus, 'VALID');
    assert.equal(d.checkOutStatus, 'VALID');
    assert.equal(d.dayStatus, 'VALID');
    assert.equal(d.lateMinutes, 0);
    assert.equal(d.earlyMinutes, 0);
  });

  it('checkIn là lần vào sớm nhất, checkOut là lần ra muộn nhất', () => {
    const d = day({ punches: [inAt('08:30'), inAt('08:00'), outAt('12:00'), outAt('17:00')] });
    assert.equal(d.checkIn?.getTime(), vnInstant(DATE, '08:00').getTime());
    assert.equal(d.checkOut?.getTime(), vnInstant(DATE, '17:00').getTime());
  });

  it('L7: lần ra giữa ca là ra sớm', () => {
    const d = day({ punches: [inAt('08:00'), outAt('12:00'), inAt('13:00'), outAt('17:00')] });
    assert.deepEqual(d.cases, [{ code: 'EARLY_CHECK_OUT', minutes: 300, affectsPay: true }]);
    assert.equal(d.checkOutStatus, 'EARLY');
  });

  it('R9: thiếu giờ ra, bù tính theo giờ ghi trong giải trình duyệt', () => {
    const d = day({
      punches: [inAt('08:00')],
      makeupWindows: [{ start: '18:00', end: '22:00' }],
      explanation: approved({ checkOut: '21:00' })
    });
    assert.equal(d.status, 'PRESENT');
    assert.equal(d.makeupMinutes, 180);
    assert.equal(d.payUnits, 1);
  });

  it('employeeId và workDate được ghi vào dòng', () => {
    const d = day({ punches: punches('08:00', '17:00') });
    assert.equal(d.employeeId, 'emp-1');
    assert.equal(d.workDate, DATE);
  });
});

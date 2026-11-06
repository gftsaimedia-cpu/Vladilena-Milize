import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildDay,
  type AttendanceDay,
  type DaySources,
  type ScheduleFacts
} from '../../src/modules/attendance/domain/attendance-day.js';
import { vnInstant } from '../../src/modules/attendance/domain/calendar.js';

const DATE = '2026-11-03'; // thứ Ba
const NEXT = '2026-11-04';

function src(o: Partial<DaySources> = {}): DaySources {
  return {
    date: DATE,
    schedule: null,
    punches: [],
    otWindows: [],
    makeupWindows: [],
    halfShift: {
      half: 'FIRST',
      start: '08:00',
      end: '12:00',
      requestId: 'req-half-1'
    },
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
const day = (o: Partial<DaySources> = {}): AttendanceDay => buildDay('emp-1', src(o));

describe('Dòng ngày công nửa ca (buildDay)', () => {
  it('vào 08:00 ra 12:00 -> PRESENT, nửa công 0.5, workHours 4, countsAsWorkday true, countsAsDayOff true', () => {
    const d = day({ punches: punches('08:00', '12:00') });
    assert.equal(d.status, 'PRESENT');
    assert.deepEqual(d.shift, { type: 'NORMAL', start: '08:00', end: '12:00', allowancePct: 0 });
    assert.equal((d as any).halfShift, 'FIRST');
    assert.equal(d.workHours, 4);
    assert.equal(d.payUnits, 0.5);
    assert.equal(d.countsAsWorkday, true);
    assert.equal(d.countsAsDayOff, true);
    assert.deepEqual(d.cases, []);
  });

  it('quy tắc gốc: chỗ nào hiện cho 1 thì nửa ca cho 0.5, chỗ nào 0 thì vẫn 0', () => {
    // Vào trễ 08:40 (muộn 40 phút > grace 15), chưa giải trình -> payUnits 0, countsAsWorkday false, countsAsDayOff true
    const unapproved = day({ punches: punches('08:40', '12:00') });
    assert.equal(unapproved.status, 'PRESENT');
    assert.equal(unapproved.payUnits, 0);
    assert.equal(unapproved.countsAsWorkday, false);
    assert.equal(unapproved.countsAsDayOff, true);

    // Giải trình đã duyệt -> payUnits 0.5, countsAsWorkday true, countsAsDayOff true, trừ 30 phút
    const approvedDay = day({
      punches: punches('08:40', '12:00'),
      explanation: { requestId: 'req-exp', status: 'APPROVED', checkIn: null, checkOut: null }
    });
    assert.equal(approvedDay.status, 'PRESENT');
    assert.equal(approvedDay.payUnits, 0.5);
    assert.equal(approvedDay.countsAsWorkday, true);
    assert.equal(approvedDay.countsAsDayOff, true);
    assert.equal(approvedDay.deductionMinutes, 30);
  });

  it('ở lại tới 15:00 -> ra muộn 180 phút cần giải trình, workHours 4 (chỉ trong khung)', () => {
    const d = day({ punches: punches('08:00', '15:00') });
    assert.equal(d.status, 'PRESENT');
    assert.equal(d.workHours, 4);
    const caseItem = d.cases.find(c => c.code === 'FORGOT_CHECK_OUT' || c.code === 'LATE_CHECK_OUT');
    assert.ok(caseItem, 'phải có trường hợp ra muộn');
    assert.equal(caseItem.minutes, 180);
    assert.equal(caseItem.affectsPay, true);
  });

  it('vào 08:40 ra 11:20 -> vào trễ tính theo 08:00, ra sớm tính theo 12:00', () => {
    const d = day({ punches: punches('08:40', '11:20') });
    assert.equal(d.lateMinutes, 40);
    assert.equal(d.earlyMinutes, 40);
  });

  it('mốc xét 12:30 (30 phút sau cuối khung): 12:20 PENDING, 12:31 ABSENT/PRESENT', () => {
    // Chưa có chấm công:
    // Đặt now lúc 12:20 VN (05:20Z) -> chưa quá 12:30 -> PENDING
    const pendingDay = day({ punches: [], now: vnInstant(DATE, '12:20') });
    assert.equal(pendingDay.status, 'PENDING');

    // Đặt now lúc 12:31 VN (05:31Z) -> quá 12:30 -> ABSENT, payUnits 0, countsAsDayOff true
    const absentDay = day({ punches: [], now: vnInstant(DATE, '12:31') });
    assert.equal(absentDay.status, 'ABSENT');
    assert.equal(absentDay.payUnits, 0);
    assert.equal(absentDay.countsAsDayOff, true);
    assert.equal((absentDay as any).halfShift, 'FIRST');

    // Có vào lúc 08:00 nhưng không ra:
    // 12:20 -> PENDING
    const inOnlyPending = day({ punches: [inAt('08:00')], now: vnInstant(DATE, '12:20') });
    assert.equal(inOnlyPending.status, 'PENDING');

    // 12:31 -> PRESENT với MISSING_CHECK_OUT
    const inOnlyEvaluated = day({ punches: [inAt('08:00')], now: vnInstant(DATE, '12:31') });
    assert.equal(inOnlyEvaluated.status, 'PRESENT');
    assert.ok(inOnlyEvaluated.cases.some(c => c.code === 'MISSING_CHECK_OUT'));
  });

  it('ngày lễ / lịch nghỉ đã duyệt / ngoài tuần làm vẫn thắng nửa ca', () => {
    // Ngày lễ
    const holidayDay = day({ isHoliday: true });
    assert.equal(holidayDay.status, 'HOLIDAY');

    // Lịch nghỉ phép
    const leaveDay = day({
      schedule: {
        scheduleType: 'REGULAR',
        status: 'ON_LEAVE',
        shiftType: 'NORMAL',
        start: '08:00',
        end: '17:00',
        sourceRequestId: 'req-l',
        requestType: 'LEAVE',
        leaveType: 'ANNUAL'
      }
    });
    assert.equal(leaveDay.status, 'LEAVE_PAID');

    // Ngoài tuần làm (Chủ nhật)
    const restDay = day({ workWeek: [1, 2, 3, 4, 5] }); // thứ Ba (2) không thuộc workWeek nếu đặt [1]
    const sunday = day({ date: '2026-11-08', workWeek: [1, 2, 3, 4, 5, 6] });
    assert.equal(sunday.status, 'REST');
  });

  it('ca đêm Night1: FIRST 22:00-02:00 và SECOND 03:00-07:00', () => {
    const nightShift = { type: 'NIGHT' as const, start: '22:00', end: '07:00', allowancePct: 30 };

    // FIRST (22:00-02:00)
    const firstNight = day({
      defaultShift: nightShift,
      halfShift: { half: 'FIRST', start: '22:00', end: '02:00', requestId: 'req-n1' },
      punches: [inAt('22:00', DATE), outAt('02:05', NEXT)]
    });
    assert.equal(firstNight.status, 'PRESENT');
    assert.equal(firstNight.workHours, 4);
    assert.deepEqual(firstNight.cases, []);

    // Ra muộn 02:40 NEXT -> LATE_CHECK_OUT 40 phút
    const lateFirst = day({
      defaultShift: nightShift,
      halfShift: { half: 'FIRST', start: '22:00', end: '02:00', requestId: 'req-n1' },
      punches: [inAt('22:00', DATE), outAt('02:40', NEXT)]
    });
    assert.ok(lateFirst.cases.some(c => c.code === 'FORGOT_CHECK_OUT' || c.code === 'LATE_CHECK_OUT'));

    // SECOND (03:00-07:00)
    const secondNight = day({
      defaultShift: nightShift,
      halfShift: { half: 'SECOND', start: '03:00', end: '07:00', requestId: 'req-n2' },
      punches: [inAt('03:00', NEXT), outAt('07:00', NEXT)]
    });
    assert.equal(secondNight.status, 'PRESENT');
    assert.equal(secondNight.workHours, 4);
    assert.deepEqual(secondNight.cases, []);
  });
});

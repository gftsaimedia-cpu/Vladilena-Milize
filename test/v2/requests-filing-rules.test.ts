import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  advanceDayOpen,
  annualLeaveLeftOf,
  dayHourOptions,
  filingWindow,
  isClosedPeriod,
  isWholeHour,
  requestTitle
} from '../../src/modules/requests/domain';
import { leaveRequest } from './helpers/requests-fakes';

const S = (d: string, a: string, b: string) => ({ startDate: d, startTime: a, endTime: b });
const dayShifts = [S('2026-11-04', '08:00', '17:00'), S('2026-11-05', '08:00', '17:00'), S('2026-11-06', '08:00', '17:00')];

describe('Luật nộp đơn - domain', () => {
  it('filing window: today to the end of next month', () => {
    assert.deepEqual(filingWindow('2026-11-04'), { from: '2026-11-04', to: '2026-12-31' });
    assert.equal(filingWindow('2026-12-31').to, '2027-01-31');
    assert.equal(filingWindow('2027-01-30').to, '2027-02-28');
    assert.equal(filingWindow('2027-12-05').to, '2028-01-31');
  });

  it('whole hours', () => {
    assert.equal(isWholeHour('18:00'), true);
    assert.equal(isWholeHour('18:30'), false);
    assert.equal(isWholeHour('6:00'), false);
  });

  it('advance days: 16 and 17 only', () => {
    assert.equal(advanceDayOpen('2026-11-15'), false);
    assert.equal(advanceDayOpen('2026-11-16'), true);
    assert.equal(advanceDayOpen('2026-11-17'), true);
    assert.equal(advanceDayOpen('2026-11-18'), false);
  });

  it('closed period: any row that is not open', () => {
    assert.equal(isClosedPeriod(null), false);
    assert.equal(isClosedPeriod({ status: 'open' }), false);
    assert.equal(isClosedPeriod({ status: 'attendance_locked' }), true);
    assert.equal(isClosedPeriod({ status: 'LOCKED' }), true);
    assert.equal(isClosedPeriod({ status: 'paid' }), true);
  });

  it('day shift hours', () => {
    assert.deepEqual(dayHourOptions({ date: '2026-11-05', shifts: dayShifts, hasShift: true, windows: [] }), [
      { start: 6, ends: [{ end: 7, minutes: 60 }] },
      { start: 18, ends: [{ end: 19, minutes: 60 }, { end: 20, minutes: 120 }, { end: 21, minutes: 180 }, { end: 22, minutes: 240 }] },
      { start: 19, ends: [{ end: 20, minutes: 60 }, { end: 21, minutes: 120 }, { end: 22, minutes: 180 }] },
      { start: 20, ends: [{ end: 21, minutes: 60 }, { end: 22, minutes: 120 }] },
      { start: 21, ends: [{ end: 22, minutes: 60 }] }
    ]);
  });

  it('sunday hours: no shift, whole 06-22 window open', () => {
    const shifts = [S('2026-11-07', '08:00', '17:00'), S('2026-11-09', '08:00', '17:00')];
    const options = dayHourOptions({ date: '2026-11-08', shifts, hasShift: false, windows: [] });
    assert.deepEqual(options.map(o => o.start), [6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21]);
    const first = options[0].ends;
    assert.deepEqual(first[first.length - 1], { end: 21, minutes: 720 });
    assert.equal(first.some(e => e.end === 22), false);
  });

  it('existing OT narrows the options', () => {
    const shifts = [S('2026-11-11', '08:00', '17:00'), S('2026-11-12', '08:00', '17:00'), S('2026-11-13', '08:00', '17:00')];
    const windows = [{ date: '2026-11-12', startTime: '18:00', endTime: '20:00', kind: 'OT' as const }];
    const options = dayHourOptions({ date: '2026-11-12', shifts, hasShift: true, windows });
    assert.deepEqual(options.map(o => o.start), [6, 20, 21]);
    assert.deepEqual(options.find(o => o.start === 20)?.ends, [{ end: 21, minutes: 60 }, { end: 22, minutes: 120 }]);
  });

  it('night shift hours', () => {
    const shifts = [S('2026-11-04', '22:00', '07:00'), S('2026-11-05', '22:00', '07:00')];
    const options = dayHourOptions({ date: '2026-11-05', shifts, hasShift: true, windows: [] });
    assert.deepEqual(options.map(o => o.start), [8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20]);
    assert.deepEqual(options[0], {
      start: 8,
      ends: [{ end: 9, minutes: 60 }, { end: 10, minutes: 120 }, { end: 11, minutes: 180 }, { end: 12, minutes: 240 }, { end: 13, minutes: 240 }]
    });
    assert.deepEqual(options[options.length - 1], { start: 20, ends: [{ end: 21, minutes: 60 }] });
  });

  it('titles', () => {
    assert.equal(requestTitle({ kind: 'leave', leaveType: 'ANNUAL', startDate: '2026-11-13', endDate: '2026-11-16' }), 'Phép năm 13–16/11');
    assert.equal(requestTitle({ kind: 'leave', leaveType: 'PERSONAL_PAID', startDate: '2026-11-13', endDate: '2026-11-13' }), 'Việc riêng có lương 13/11');
    assert.equal(requestTitle({ kind: 'leave', leaveType: 'ANNUAL', startDate: '2026-11-30', endDate: '2026-12-02' }), 'Phép năm 30/11–02/12');
    assert.equal(requestTitle({ kind: 'leave-with-makeup', startDate: '2026-11-13', endDate: '2026-11-14' }), 'Nghỉ có làm bù 13–14/11');
    assert.equal(requestTitle({ kind: 'overtime', date: '2026-11-10', startTime: '18:00', endTime: '20:00' }), 'Làm thêm 10/11 18–20h');
    assert.equal(requestTitle({ kind: 'overtime', date: '2026-11-10', startTime: '18:30', endTime: '20:00' }), 'Làm thêm 10/11 18:30–20h');
    assert.equal(
      requestTitle({ kind: 'shift-change', frame: { shiftType: 'FLEX', startTime: '06:00', endTime: '15:00' }, startDate: '2026-11-10', endDate: '2026-11-12' }),
      'Đổi ca Flex 06–15, 10–12/11'
    );
    assert.equal(
      requestTitle({ kind: 'shift-change', frame: { shiftType: 'NIGHT', startTime: '22:00', endTime: '07:00' }, startDate: '2026-11-10', endDate: '2026-11-10' }),
      'Đổi ca Night 22–07, 10/11'
    );
    assert.equal(requestTitle({ kind: 'explanation', date: '2026-10-27' }), 'Giải trình 27/10');
    assert.equal(requestTitle({ kind: 'advance', month: '2026-11' }), 'Tạm ứng lương tháng 11');
  });

  it('annual leave left', () => {
    const active = [
      leaveRequest('2026-11-13', '2026-11-16', 'PENDING', { leaveDaysCount: 3 }),
      leaveRequest('2026-11-20', '2026-11-21', 'REJECTED', { leaveDaysCount: 2 }),
      leaveRequest('2026-11-23', '2026-11-23', 'PENDING', { leaveType: 'PERSONAL_PAID', leaveDaysCount: 1 })
    ];
    assert.equal(annualLeaveLeftOf({ leaveBalance: 12, leaveBalanceOn: null, leaveAccount: true }, active), 9);

    const old = [leaveRequest('2026-10-20', '2026-10-21', 'APPROVED', { leaveDaysCount: 2 })];
    assert.equal(annualLeaveLeftOf({ leaveBalance: 12, leaveBalanceOn: '2026-11-01', leaveAccount: true }, old), 12);
    assert.equal(annualLeaveLeftOf({ leaveBalance: 12, leaveBalanceOn: null, leaveAccount: false }, active), null);
  });
});

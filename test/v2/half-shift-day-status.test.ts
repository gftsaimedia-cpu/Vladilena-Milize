import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  DayConflictError,
  planClaims,
  type ActiveStatus,
  type ClaimStatus,
  type DayClaim,
  type DayView,
  type NewRequestKind,
  type WindowSource,
} from '../../src/modules/requests/domain/day-status.js';
import { EmployeeDays } from '../../src/modules/requests/domain/employee-days.js';
import { SystemRequest } from '../../src/modules/requests/domain/system-request.js';

interface Fixture {
  claims?: DayClaim[];
  windows?: Record<string, WindowSource[]>;
  holidays?: string[];
}

const claim = (
  date: string,
  status: ClaimStatus,
  requestStatus: ActiveStatus,
  requestId = `${status}-${date}`,
  baseRequestId: string | null = null
): DayClaim => ({
  employeeId: 'nv',
  date,
  status,
  requestId,
  baseRequestId,
  requestStatus,
  baseRequestStatus: null,
});

const view = ({ claims = [], windows = {}, holidays = [] }: Fixture = {}): DayView => {
  const byDate = new Map(claims.map(c => [c.date, c]));
  return {
    claimOn: date => byDate.get(date) ?? null,
    windowSourcesOn: date => windows[date] ?? [],
    isHoliday: date => holidays.includes(date),
  };
};

const plan = (kind: NewRequestKind, dates: string[], fixture: Fixture = {}, ownRequestId?: string) =>
  planClaims({ kind, dates, days: view(fixture), ownRequestId });

const conflict = (run: () => unknown): DayConflictError => {
  try {
    run();
  } catch (error) {
    assert.ok(error instanceof DayConflictError, `expected DayConflictError, got ${String(error)}`);
    return error;
  }
  assert.fail('expected a DayConflictError');
};

describe('half-shift day-status matrix (spec §7.2)', () => {
  const DATE = '2026-11-12';
  const SAT = '2026-11-14';

  describe('Filing HALF_SHIFT_LEAVE on various existing day claims', () => {
    it('free day: takes the day without replacement', () => {
      const res = plan('HALF_SHIFT_LEAVE', [DATE], {});
      assert.deepEqual(res.take, [{ date: DATE, replaces: null }]);
      assert.deepEqual(res.skipped, []);
      assert.deepEqual(res.warnings, []);
    });

    it('on existing LEAVE: blocks with "Ngày dd/mm đã có đơn nghỉ"', () => {
      const err = conflict(() => plan('HALF_SHIFT_LEAVE', [DATE], { claims: [claim(DATE, 'LEAVE', 'PENDING')] }));
      assert.equal(err.message, 'Ngày 12/11 đã có đơn nghỉ');
    });

    it('on existing LEAVE_WITH_MAKEUP: blocks with "Ngày dd/mm đã có đơn nghỉ"', () => {
      const err = conflict(() => plan('HALF_SHIFT_LEAVE', [DATE], { claims: [claim(DATE, 'LEAVE_WITH_MAKEUP', 'APPROVED')] }));
      assert.equal(err.message, 'Ngày 12/11 đã có đơn nghỉ');
    });

    it('on existing SHIFT_CHANGE: takes day and replaces the shift change claim', () => {
      const sc = claim(DATE, 'SHIFT_CHANGE', 'APPROVED', 'sc-1');
      const res = plan('HALF_SHIFT_LEAVE', [DATE], { claims: [sc] });
      assert.deepEqual(res.take, [{ date: DATE, replaces: sc }]);
      assert.deepEqual(res.skipped, []);
      assert.deepEqual(res.warnings, []);
    });

    it('on pending ISAT: blocks with "Thứ Bảy dd/mm đang có đơn iSAT chờ duyệt. Huỷ đơn iSAT hoặc chọn ngày khác."', () => {
      const err = conflict(() => plan('HALF_SHIFT_LEAVE', [SAT], { claims: [claim(SAT, 'ISAT', 'PENDING')] }));
      assert.equal(err.message, 'Thứ Bảy 14/11 đang có đơn iSAT chờ duyệt. Huỷ đơn iSAT hoặc chọn ngày khác.');
    });

    it('on approved ISAT: blocks with "Thứ Bảy dd/mm đã có iSAT được duyệt, không chọn được ngày này."', () => {
      const err = conflict(() => plan('HALF_SHIFT_LEAVE', [SAT], { claims: [claim(SAT, 'ISAT', 'APPROVED')] }));
      assert.equal(err.message, 'Thứ Bảy 14/11 đã có iSAT được duyệt, không chọn được ngày này.');
    });

    it('on existing HALF_SHIFT: blocks with "Ngày dd/mm đã có đơn nghỉ giữa ca"', () => {
      const err = conflict(() => plan('HALF_SHIFT_LEAVE', [DATE], { claims: [claim(DATE, 'HALF_SHIFT', 'PENDING')] }));
      assert.equal(err.message, 'Ngày 12/11 đã có đơn nghỉ giữa ca');
    });
  });

  describe('Filing other request kinds on an existing HALF_SHIFT day claim', () => {
    it('filing LEAVE on HALF_SHIFT: blocks with "Ngày dd/mm đã có đơn nghỉ giữa ca"', () => {
      const err = conflict(() => plan('LEAVE', [DATE], { claims: [claim(DATE, 'HALF_SHIFT', 'APPROVED')] }));
      assert.equal(err.message, 'Ngày 12/11 đã có đơn nghỉ giữa ca');
    });

    it('filing LEAVE_WITH_MAKEUP on HALF_SHIFT: blocks with "Ngày dd/mm đã có đơn nghỉ giữa ca"', () => {
      const err = conflict(() => plan('LEAVE_WITH_MAKEUP', [DATE], { claims: [claim(DATE, 'HALF_SHIFT', 'PENDING')] }));
      assert.equal(err.message, 'Ngày 12/11 đã có đơn nghỉ giữa ca');
    });

    it('filing SHIFT_CHANGE covering HALF_SHIFT: skips day with warning', () => {
      const res = plan('SHIFT_CHANGE', [DATE, '2026-11-13'], { claims: [claim(DATE, 'HALF_SHIFT', 'APPROVED')] });
      assert.deepEqual(res.take, [{ date: '2026-11-13', replaces: null }]);
      assert.deepEqual(res.skipped, [DATE]);
      assert.deepEqual(res.warnings, ['Ngày 12/11 đã có đơn nghỉ giữa ca, giữ nguyên, không đổi ca.']);
    });

    it('filing ISAT on Saturday with HALF_SHIFT: blocks with "Thứ Bảy dd/mm đã có đơn nghỉ giữa ca"', () => {
      const err = conflict(() => plan('ISAT', [SAT], { claims: [claim(SAT, 'HALF_SHIFT', 'PENDING')] }));
      assert.equal(err.message, 'Thứ Bảy 14/11 đã có đơn nghỉ giữa ca');
    });

    it('filing OVERTIME on HALF_SHIFT: allowed', () => {
      const res = plan('OVERTIME', [DATE], { claims: [claim(DATE, 'HALF_SHIFT', 'APPROVED')] });
      assert.deepEqual(res.take, []);
      assert.deepEqual(res.skipped, []);
      assert.deepEqual(res.warnings, []);
    });

    it('filing MAKEUP_SLOT on HALF_SHIFT: allowed', () => {
      const res = plan('MAKEUP_SLOT', [DATE], { claims: [claim(DATE, 'HALF_SHIFT', 'APPROVED')] });
      assert.deepEqual(res.take, []);
      assert.deepEqual(res.skipped, []);
      assert.deepEqual(res.warnings, []);
    });

    it('filing EXPLANATION on HALF_SHIFT: allowed', () => {
      const res = plan('EXPLANATION', [DATE], { claims: [claim(DATE, 'HALF_SHIFT', 'APPROVED')] });
      assert.deepEqual(res.take, []);
      assert.deepEqual(res.skipped, []);
      assert.deepEqual(res.warnings, []);
    });
  });

  describe('EmployeeDays.shiftChangeOn with HALF_SHIFT having baseRequestId', () => {
    it('returns the shift change request when HALF_SHIFT has baseRequestId pointing to it', () => {
      const shiftChangeReq = SystemRequest.createShiftChangeRequest({
        employeeId: 'nv',
        title: 'Đổi ca',
        reason: 'Đổi ca',
        startDate: '2026-11-12',
        endDate: '2026-11-12',
        frame: { shiftType: 'FLEX', startTime: '06:00', endTime: '15:00' },
      });

      const halfShiftClaim = claim(DATE, 'HALF_SHIFT', 'APPROVED', 'hs-1', shiftChangeReq.id);

      const empDays = new EmployeeDays({
        regularDows: [1, 2, 3, 4, 5],
        holidays: [],
        defaultShift: { startTime: '08:00', endTime: '17:00' },
        schedules: [],
        activeRequests: [shiftChangeReq],
        claims: [halfShiftClaim],
      });

      const shift = empDays.shiftOf(DATE);
      assert.ok(shift);
      assert.equal(shift.startTime, '06:00');
      assert.equal(shift.endTime, '15:00');
    });
  });
});

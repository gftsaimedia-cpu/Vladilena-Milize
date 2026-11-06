import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { PayrollService } from '../../src/modules/payroll/payroll.service.js';
import type { PayrollRepository } from '../../src/modules/payroll/payroll.repository.js';
import type { AttendanceDayRecord } from '../../src/modules/attendance/attendance-days.repository.js';
import type { ShiftFacts } from '../../src/modules/attendance/domain/attendance-day.js';
import { FakeDays, dayRow, nvMonthData, punched, type MonthFixture } from './payroll-fixtures.js';

/**
 * Task 8 & 10: Phiếu lương theo nửa công, tổng công, tạm ứng, bù và OT thật
 *
 * Nhân viên NV level 1: lương cơ bản 6.000.000, công chuẩn 26 ngày.
 * Đơn giá ngày = 6.000.000 / 26 = 230.769,23...
 * Đơn giá giờ = 230.769,23... / 8 = 28.846,15...
 * Tỉ lệ phụ cấp NV theo SEED_RATES:
 * - Đi lại (travelRate): 15%
 * - Chuyên cần (attendanceRate): 25%
 * - Flex (flexRate): 20%
 * - Đêm (nightRate): 40%
 */

const FAKE_SETTINGS_READER = {
  settingsFor: async () => ({
    attendance: { lateGraceMinutes: 15, diligenceLostFromDays: 3 },
    kpiWeights: { wework: 40, user: 24, peer: 18, manager: 12, self: 6 },
    insurance: { bhxhPct: 8, bhytPct: 1.5, bhtnPct: 1 },
    tax: { personalDeduction: 11_000_000, dependantDeduction: 4_400_000 },
    overtime: { weekdayRate: 1.5, weekendRate: 2, holidayRate: 3 }
  }),
  workWeekOf: async () => null,
  maxChangeId: async () => 0
} as any;

function slipOf(
  days: AttendanceDayRecord[],
  requests: any[] = [],
  extraStaff: any = {},
  month: string = '2026-10',
  holidayDates: string[] = []
) {
  const base = nvMonthData();
  const staff = { ...base.staff, ...extraStaff };
  const fixture: MonthFixture = { ...base, staff, days, requests, holidayDates };
  const repo = { getMonthlyData: async () => fixture } as unknown as PayrollRepository;
  return new PayrollService(repo, FAKE_SETTINGS_READER, new FakeDays(() => fixture.days)).generateMonthlyPayslip(
    'u1',
    month
  );
}

const oct = (d: number) => `2026-10-${String(d).padStart(2, '0')}`;

function halfShiftDay(
  date: string,
  half: 'FIRST' | 'SECOND',
  type: ShiftFacts['type'] = 'NORMAL',
  over: Partial<AttendanceDayRecord> = {}
): AttendanceDayRecord {
  const isNight = type === 'NIGHT';
  const hours = isNight ? 4 : 4;
  return dayRow('PRESENT', date, {
    shift: {
      type,
      start: half === 'FIRST' ? (isNight ? '22:00' : '08:00') : (isNight ? '03:00' : '13:00'),
      end: half === 'FIRST' ? (isNight ? '02:00' : '12:00') : (isNight ? '07:00' : '17:00'),
      allowancePct: isNight ? 40 : type === 'FLEX' ? 20 : 0
    },
    halfShift: half,
    workHours: hours,
    payUnits: 0.5,
    countsAsWorkday: true,
    countsAsDayOff: true,
    ...over
  });
}

describe('Task 8: Phiếu lương theo nửa công (EmployeePayslip & PayrollService)', () => {
  it('1 dòng PRESENT nửa ca: actualWorkDays 0.5, baseSalaryActual 115.385, đi lại 17.308, chuyên cần 28.846', async () => {
    // 1 dòng nửa ca duy nhất
    const slip = await slipOf([halfShiftDay(oct(1), 'FIRST')]);
    // actualWorkDays = 0.5
    assert.equal(slip.actualWorkDays, 0.5);
    // baseSalaryActual = round(6.000.000 * 0.5 / 26) = 115.385
    assert.equal(slip.baseSalaryActual, 115_385);
    // travelAllowanceActual = round(6.000.000 * 0.15 * 0.5 / 26) = 17.308
    assert.equal(slip.travelAllowanceActual, 17_308);
    // attendanceAllowanceActual (chuyên cần được giữ vì 0.5 ngày nghỉ < 3 ngày) = round(6.000.000 * 0.25 * 0.5 / 26) = 28.846
    assert.equal(slip.attendanceAllowanceActual, 28_846);
  });

  it('ca Flex 4 giờ: phụ cấp linh hoạt = round(6.000.000 * 0.20 * 4 / (26 * 8)) = 23.077', async () => {
    const slip = await slipOf([halfShiftDay(oct(1), 'FIRST', 'FLEX')]);
    // flexAllowanceActual = round(6.000.000 * 0.20 * 4 / 208) = 23.076,92 -> 23.077
    assert.equal(slip.flexAllowanceActual, 23_077);
  });

  it('ca Night nửa ca: nightShiftCount 0.5, phụ cấp đêm 46.154, tiền nghỉ đêm = 0, miễn thuế đêm 34.615', async () => {
    const slip = await slipOf([halfShiftDay(oct(1), 'FIRST', 'NIGHT')]);
    // nightShiftCount = 0.5
    assert.equal(slip.nightShiftCount, 0.5);
    // nightAllowanceActual = round(6.000.000 * 0.40 * 0.5 / 26) = 46.153,85 -> 46.154
    assert.equal(slip.nightAllowanceActual, 46_154);
    // offPaidNightActual = 0 (không có tiền nghỉ giữa ca trên nửa ca làm)
    assert.equal(slip.offPaidNightActual, 0);
    // trần miễn thuế đêm dùng 8 * nightRate * 0.5 = 8 * 0.4 * 0.5 = 1.6 giờ;
    // shiftHours = 4 -> min(4 * 0.3, 1.6) = min(1.2, 1.6) = 1.2 giờ
    // nightExempt = round(6.000.000 * 1.2 / 208) = 34.615,38 -> 34.615
    assert.equal(slip.taxExemptIncome, 34_615);
  });

  it('chuyên cần: 5 dòng nửa ca (2.5 ngày nghỉ) giữ; 6 dòng nửa ca (3.0 ngày nghỉ) mất; 2 nửa ca + 2 ngày nghỉ phép không lương (3 ngày) mất', async () => {
    // 5 dòng nửa ca: 5 * 0.5 = 2.5 ngày nghỉ. diligenceLostFromDays = 3 (mặc định của settings)
    // 2.5 < 3 -> GIỮ chuyên cần
    const days5 = Array.from({ length: 5 }, (_, i) => halfShiftDay(oct(i + 1), 'FIRST'));
    const slip5 = await slipOf(days5);
    assert.ok(slip5.attendanceAllowanceActual > 0, 'phải giữ chuyên cần khi nghỉ 2.5 ngày');

    // 6 dòng nửa ca: 6 * 0.5 = 3.0 ngày nghỉ. 3.0 >= 3 -> MẤT chuyên cần
    const days6 = Array.from({ length: 6 }, (_, i) => halfShiftDay(oct(i + 1), 'FIRST'));
    const slip6 = await slipOf(days6);
    assert.equal(slip6.attendanceAllowanceActual, 0, 'phải mất chuyên cần khi nghỉ 3.0 ngày');

    // 2 nửa ca (1.0 ngày) + 2 ngày nghỉ phép không lương (2.0 ngày) = 3.0 ngày nghỉ -> MẤT chuyên cần
    const mixed = [
      halfShiftDay(oct(1), 'FIRST'),
      halfShiftDay(oct(2), 'FIRST'),
      dayRow('LEAVE_UNPAID', oct(3)),
      dayRow('LEAVE_UNPAID', oct(5))
    ];
    const slipMixed = await slipOf(mixed);
    assert.equal(slipMixed.attendanceAllowanceActual, 0, 'phải mất chuyên cần khi tổng ngày nghỉ đạt 3 ngày');
  });

  it('dòng ABSENT có halfShift: trọng số 1 cho ngày nghỉ (T4)', async () => {
    // 2 ngày ABSENT có halfShift (mỗi ngày tính 1 ngày nghỉ = 2 ngày) + 1 ngày không lương (1 ngày) = 3 ngày -> MẤT chuyên cần
    const absentHalfShift = [
      dayRow('ABSENT', oct(1), { halfShift: 'FIRST' }),
      dayRow('ABSENT', oct(2), { halfShift: 'FIRST' }),
      dayRow('LEAVE_UNPAID', oct(3))
    ];
    const slip = await slipOf(absentHalfShift);
    assert.equal(slip.attendanceAllowanceActual, 0, 'dòng ABSENT có halfShift phải tính trọng số 1 cho ngày nghỉ');
    assert.equal(slip.actualWorkDays, 0);
  });

  it('tháng không có dòng nửa ca: toàn bộ DTO phiếu bằng đúng kết quả fixture thông thường', async () => {
    const base = nvMonthData();
    const repo = { getMonthlyData: async () => base } as unknown as PayrollRepository;
    const slip = await new PayrollService(repo, undefined, new FakeDays(() => base.days)).generateMonthlyPayslip(
      'u1',
      '2026-10'
    );
    // So sánh các trường tiền chính không bị ảnh hưởng khi không có nửa ca
    assert.equal(slip.baseSalaryActual, 4_615_385);
    assert.equal(slip.travelAllowanceActual, 692_308);
    assert.ok(slip.totalAllowanceActual > 0);
    assert.ok(slip.grossIncome > 0);
    assert.ok(slip.netIncome > 0);
  });
});

const nov = (d: number) => `2026-11-${String(d).padStart(2, '0')}`;

describe('Task 10: Phiếu lương — bù và OT thật', () => {
  it('Nợ 240 (nửa ca duyệt 12/11); T6 13/11 đủ 3h, T2 16/11 đủ 3h → repaid 240, repaidPay 115.385, ot15 2h, totalOt 2h, dropped 0, dòng 13/11 180, dòng 16/11 60', async () => {
    const days: AttendanceDayRecord[] = [
      halfShiftDay(nov(12), 'FIRST', 'NORMAL', punched(nov(12), '08:00', '12:00')),
      dayRow('PRESENT', nov(13), { workHours: 8, ...punched(nov(13), '08:00', '21:00') }),
      dayRow('PRESENT', nov(16), { workHours: 8, ...punched(nov(16), '08:00', '21:00') })
    ];
    const requests = [
      { id: 'r1', type: 'HALF_SHIFT_LEAVE', status: 'APPROVED', halfShiftDate: nov(12), halfShiftHalf: 'FIRST' },
      { id: 'r2', type: 'OVERTIME', status: 'APPROVED', otDate: nov(13), otStartTime: '18:00', otEndTime: '21:00', otHours: 3 },
      { id: 'r3', type: 'OVERTIME', status: 'APPROVED', otDate: nov(16), otStartTime: '18:00', otEndTime: '21:00', otHours: 3 }
    ];
    const slip = await slipOf(days, requests, {}, '2026-11');

    assert.equal(slip.halfShiftOwedMinutes, 240);
    assert.equal(slip.halfShiftRepaidMinutes, 240);
    assert.equal(slip.halfShiftRepaidPay, 115_385);
    assert.equal(slip.ot15Hours, 2);
    assert.equal(slip.ot15Pay, 86_538);
    assert.equal(slip.totalOtHours, 2);
    assert.equal(slip.halfShiftDroppedMinutes, 0);

    const line13 = slip.dailyLines.find(l => l.date === nov(13));
    assert.equal(line13?.repaidMinutes, 180);
    assert.equal(line13?.otHours, 0);

    const line16 = slip.dailyLines.find(l => l.date === nov(16));
    assert.equal(line16?.repaidMinutes, 60);
    assert.equal(line16?.otHours, 2);
  });

  it('Chỉ thứ 2 làm 3 giờ → halfShiftRepaidMinutes 180, halfShiftRepaidPay 86.538, halfShiftDroppedMinutes 60, ot15Hours 0', async () => {
    const days: AttendanceDayRecord[] = [
      halfShiftDay(nov(12), 'FIRST', 'NORMAL', punched(nov(12), '08:00', '12:00')),
      dayRow('PRESENT', nov(16), { workHours: 8, ...punched(nov(16), '08:00', '21:00') })
    ];
    const requests = [
      { id: 'r1', type: 'HALF_SHIFT_LEAVE', status: 'APPROVED', halfShiftDate: nov(12), halfShiftHalf: 'FIRST' },
      { id: 'r3', type: 'OVERTIME', status: 'APPROVED', otDate: nov(16), otStartTime: '18:00', otEndTime: '21:00', otHours: 3 }
    ];
    const slip = await slipOf(days, requests, {}, '2026-11');

    assert.equal(slip.halfShiftOwedMinutes, 240);
    assert.equal(slip.halfShiftRepaidMinutes, 180);
    assert.equal(slip.halfShiftRepaidPay, 86_538);
    assert.equal(slip.halfShiftDroppedMinutes, 60);
    assert.equal(slip.ot15Hours, 0);
  });

  it('Không có nợ → mọi thứ như cũ, halfShiftRepaidPay 0, halfShiftOwedMinutes 0', async () => {
    const days: AttendanceDayRecord[] = [
      dayRow('PRESENT', nov(13), { workHours: 8, ...punched(nov(13), '08:00', '21:00') })
    ];
    const requests = [
      { id: 'r2', type: 'OVERTIME', status: 'APPROVED', otDate: nov(13), otStartTime: '18:00', otEndTime: '21:00', otHours: 3 }
    ];
    const slip = await slipOf(days, requests, {}, '2026-11');

    assert.equal(slip.halfShiftOwedMinutes, 0);
    assert.equal(slip.halfShiftRepaidMinutes, 0);
    assert.equal(slip.halfShiftRepaidPay, 0);
    assert.equal(slip.halfShiftDroppedMinutes, 0);
    assert.equal(slip.ot15Hours, 3);
  });

  it('T4: dòng ngày 12/11 là ABSENT → nợ 0, giờ làm thêm là OT thật hết', async () => {
    const days: AttendanceDayRecord[] = [
      dayRow('ABSENT', nov(12), { workHours: 0, payUnits: 0 }),
      dayRow('PRESENT', nov(13), { workHours: 8, ...punched(nov(13), '08:00', '21:00') })
    ];
    const requests = [
      { id: 'r1', type: 'HALF_SHIFT_LEAVE', status: 'APPROVED', halfShiftDate: nov(12), halfShiftHalf: 'FIRST' },
      { id: 'r2', type: 'OVERTIME', status: 'APPROVED', otDate: nov(13), otStartTime: '18:00', otEndTime: '21:00', otHours: 3 }
    ];
    const slip = await slipOf(days, requests, {}, '2026-11');

    assert.equal(slip.halfShiftOwedMinutes, 0);
    assert.equal(slip.halfShiftRepaidMinutes, 0);
    assert.equal(slip.halfShiftRepaidPay, 0);
    assert.equal(slip.ot15Hours, 3);
  });

  it('T8: 12/11 là ngày lễ → nợ 0', async () => {
    const days: AttendanceDayRecord[] = [
      dayRow('HOLIDAY', nov(12), { workHours: 8, payUnits: 1 }),
      dayRow('PRESENT', nov(13), { workHours: 8, ...punched(nov(13), '08:00', '21:00') })
    ];
    const requests = [
      { id: 'r1', type: 'HALF_SHIFT_LEAVE', status: 'APPROVED', halfShiftDate: nov(12), halfShiftHalf: 'FIRST' },
      { id: 'r2', type: 'OVERTIME', status: 'APPROVED', otDate: nov(13), otStartTime: '18:00', otEndTime: '21:00', otHours: 3 }
    ];
    const slip = await slipOf(days, requests, {}, '2026-11', [nov(12)]);

    assert.equal(slip.halfShiftOwedMinutes, 0);
    assert.equal(slip.halfShiftRepaidMinutes, 0);
    assert.equal(slip.halfShiftRepaidPay, 0);
    assert.equal(slip.ot15Hours, 3);
  });

  it('halfShiftRepaidPay nằm trong grossIncome và không vào totalAllowanceActual, makeupPay, taxExemptIncome', async () => {
    // Tháng có nợ 240 và trả đủ 240
    const daysWithRepaid: AttendanceDayRecord[] = [
      halfShiftDay(nov(12), 'FIRST', 'NORMAL', punched(nov(12), '08:00', '12:00')),
      dayRow('PRESENT', nov(13), { workHours: 8, ...punched(nov(13), '08:00', '22:00') }) // 4h OT = 240 phút bù
    ];
    const requestsWithRepaid = [
      { id: 'r1', type: 'HALF_SHIFT_LEAVE', status: 'APPROVED', halfShiftDate: nov(12), halfShiftHalf: 'FIRST' },
      { id: 'r2', type: 'OVERTIME', status: 'APPROVED', otDate: nov(13), otStartTime: '18:00', otEndTime: '22:00', otHours: 4 }
    ];
    const slipRepaid = await slipOf(daysWithRepaid, requestsWithRepaid, {}, '2026-11');

    // Cùng tháng đó nhưng không có khung làm bù (chỉ có nửa ca ngày 12, ngày 13 về lúc 17:00)
    const daysWithoutRepaid: AttendanceDayRecord[] = [
      halfShiftDay(nov(12), 'FIRST', 'NORMAL', punched(nov(12), '08:00', '12:00')),
      dayRow('PRESENT', nov(13), { workHours: 8, ...punched(nov(13), '08:00', '17:00') })
    ];
    const requestsWithoutRepaid = [
      { id: 'r1', type: 'HALF_SHIFT_LEAVE', status: 'APPROVED', halfShiftDate: nov(12), halfShiftHalf: 'FIRST' }
    ];
    const slipNoRepaid = await slipOf(daysWithoutRepaid, requestsWithoutRepaid, {}, '2026-11');

    assert.equal(slipRepaid.halfShiftRepaidPay, 115_385);
    assert.equal(slipRepaid.grossIncome - slipNoRepaid.grossIncome, 115_385);
    assert.equal(slipRepaid.totalAllowanceActual, slipNoRepaid.totalAllowanceActual);
    assert.equal(slipRepaid.makeupPay, 0);
    assert.equal(slipRepaid.taxExemptIncome, 0); // 4h đều là bù, không có OT thật nên không có miễn thuế OT
  });

  it('Giờ bù không có mặt (khung đã duyệt nhưng không chấm công) → không trả nợ', async () => {
    const days: AttendanceDayRecord[] = [
      halfShiftDay(nov(12), 'FIRST', 'NORMAL', punched(nov(12), '08:00', '12:00')),
      dayRow('PRESENT', nov(13), { workHours: 8, ...punched(nov(13), '08:00', '17:00') }) // checkOut lúc 17:00, không có mặt trong khung 18-21
    ];
    const requests = [
      { id: 'r1', type: 'HALF_SHIFT_LEAVE', status: 'APPROVED', halfShiftDate: nov(12), halfShiftHalf: 'FIRST' },
      { id: 'r2', type: 'OVERTIME', status: 'APPROVED', otDate: nov(13), otStartTime: '18:00', otEndTime: '21:00', otHours: 3 }
    ];
    const slip = await slipOf(days, requests, {}, '2026-11');

    assert.equal(slip.halfShiftRepaidMinutes, 0);
    assert.equal(slip.halfShiftRepaidPay, 0);
    assert.equal(slip.halfShiftDroppedMinutes, 240);
  });
});

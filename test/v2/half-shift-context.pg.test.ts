import assert from 'node:assert/strict';
import { test } from 'node:test';
import { withTempDb } from './helpers/pg-temp-db.js';
import { TransactionCoordinator } from '../../src/database/transaction.js';
import { RequestsService } from '../../src/modules/requests/requests.service.js';
import { RequestsRepository } from '../../src/modules/requests/requests.repository.js';
import { DayStatusRepository } from '../../src/modules/requests/day-status.repository.js';
import { HolidaysRepository } from '../../src/modules/holidays/holidays.repository.js';
import { AttendanceRepository } from '../../src/modules/attendance/attendance.repository.js';
import type { PeriodStatus } from '../../src/modules/periods/domain/index.js';

test('half-shift requestContext on PostgreSQL', async t => {
  await withTempDb(t, 'half_shift_context', async (db, client) => {
    const nvId = '0a7c4e2e-1111-4a6b-9c1d-000000000001';
    const ttsId = '0a7c4e2e-1111-4a6b-9c1d-000000000002';

    await client.query(
      `INSERT INTO staff (username, name, type, level, pass_hash, created_at, uuid)
       VALUES 
         ('nv01', 'Nhân viên 01', 'nv', 1, 'x', now(), $1),
         ('tts01', 'Thực tập sinh 01', 'tts', 1, 'x', now(), $2)`,
      [nvId, ttsId]
    );

    // Ngày lễ 2026-11-20
    await client.query(
      `INSERT INTO company_holidays (holiday_date, name, created_at)
       VALUES ('2026-11-20', 'Ngày Nhà giáo', now())`
    );

    // Ca 8 giờ ngày 2026-11-18 (work_schedules: 08:00 - 16:00, 480 phút)
    await client.query(
      `INSERT INTO work_schedules (employee_id, work_date, shift_type, planned_start_time, planned_end_time)
       VALUES ($1, '2026-11-18', 'CUSTOM', '08:00', '16:00')`,
      [nvId]
    );

    const monthStatus: Record<string, PeriodStatus> = {};
    const fakePeriodGate = {
      statusOf: async (_trx: any, month: string) => monthStatus[month] ?? 'open',
      hold: async () => {}
    };

    const makeService = (gate = fakePeriodGate) =>
      new RequestsService(
        new RequestsRepository(db),
        new AttendanceRepository(db),
        new TransactionCoordinator(db),
        new HolidaysRepository(db),
        new DayStatusRepository(db),
        gate as any
      );

    const service = makeService();

    // Tạo 1 đơn nghỉ phép ngày 2026-11-16
    await service.createLeaveRequest({
      employeeId: 'nv01',
      leaveType: 'UNPAID',
      startDate: '2026-11-16',
      endDate: '2026-11-16',
      reason: 'Việc nhà'
    });

    // Tạo 1 đơn nghỉ giữa ca ngày 2026-11-12
    await service.createHalfShiftLeaveRequest({
      employeeId: 'nv01',
      date: '2026-11-12',
      half: 'FIRST',
      reason: 'Khám bệnh'
    });

    // 1. Context của nv01 khi các tháng đều mở
    const nvCtx = await service.requestContext('nv01');

    // Kinds có half-shift-leave enabled: true
    const halfShiftKind = nvCtx.kinds.find(k => k.kind === 'half-shift-leave');
    assert.ok(halfShiftKind, 'phải có kind half-shift-leave');
    assert.equal(halfShiftKind.enabled, true);

    // Rules có halfShiftOwedMinutes: 240
    assert.equal((nvCtx.rules as any).halfShiftOwedMinutes, 240);

    // Ngày làm việc bình thường 2026-11-13 (08:00-17:00, 9 tiếng)
    const day13 = nvCtx.days.find(d => d.date === '2026-11-13')!;
    assert.ok(day13.halfShift, 'ngày 13/11 phải có halfShift');
    assert.deepEqual(day13.halfShift, {
      FIRST: {
        work: { start: '08:00', end: '12:00' },
        leave: { start: '13:00', end: '17:00' }
      },
      SECOND: {
        work: { start: '13:00', end: '17:00' },
        leave: { start: '08:00', end: '12:00' }
      }
    });

    // Ngày Chủ nhật (2026-11-15): halfShift = null
    const sunday = nvCtx.days.find(d => d.date === '2026-11-15')!;
    assert.equal(sunday.halfShift, null);

    // Ngày lễ (2026-11-20): halfShift = null
    const holiday = nvCtx.days.find(d => d.date === '2026-11-20')!;
    assert.equal(holiday.halfShift, null);

    // Ngày ca 8 giờ (2026-11-18): halfShift = null
    const eightHourDay = nvCtx.days.find(d => d.date === '2026-11-18')!;
    assert.equal(eightHourDay.halfShift, null);

    // Ngày có đơn nghỉ (2026-11-16): claim = LEAVE, halfShift = null
    const leaveDay = nvCtx.days.find(d => d.date === '2026-11-16')!;
    assert.equal(leaveDay.claim?.status, 'LEAVE');
    assert.equal(leaveDay.halfShift, null);

    // Ngày có đơn nửa ca (2026-11-12): claim = HALF_SHIFT, halfShift = null
    const halfShiftDay = nvCtx.days.find(d => d.date === '2026-11-12')!;
    assert.equal(halfShiftDay.claim?.status, 'HALF_SHIFT');
    assert.equal(halfShiftDay.halfShift, null);

    // choices['half-shift-leave'].dates đúng các ngày halfShift khác null
    const halfShiftChoices = (nvCtx.choices as any)['half-shift-leave'];
    assert.ok(halfShiftChoices, 'phải có choices["half-shift-leave"]');
    const validDates = nvCtx.days.filter(d => d.halfShift !== null).map(d => d.date);
    assert.deepEqual(halfShiftChoices.dates, validDates);
    assert.equal(halfShiftChoices.dates.includes('2026-11-12'), false);
    assert.equal(halfShiftChoices.dates.includes('2026-11-13'), true);
    assert.equal(halfShiftChoices.dates.includes('2026-11-15'), false);
    assert.equal(halfShiftChoices.dates.includes('2026-11-16'), false);
    assert.equal(halfShiftChoices.dates.includes('2026-11-18'), false);
    assert.equal(halfShiftChoices.dates.includes('2026-11-20'), false);

    // 2. TTS (thiếu quyền lợi ot) -> enabled: false kèm "Loại nhân sự này chưa dùng được nghỉ giữa ca"
    const ttsCtx = await service.requestContext('tts01');
    const ttsKind = ttsCtx.kinds.find(k => k.kind === 'half-shift-leave');
    assert.ok(ttsKind);
    assert.equal(ttsKind.enabled, false);
    assert.equal(ttsKind.reason, 'Loại nhân sự này chưa dùng được nghỉ giữa ca');

    // 3. Mọi tháng đã chốt -> enabled: false "Không còn ngày đăng ký được"
    monthStatus['2026-11'] = 'closed';
    monthStatus['2026-12'] = 'closed';
    const closedCtx = await service.requestContext('nv01');
    const closedKind = closedCtx.kinds.find(k => k.kind === 'half-shift-leave');
    assert.ok(closedKind);
    assert.equal(closedKind.enabled, false);
    assert.equal(closedKind.reason, 'Không còn ngày đăng ký được');
    // Mọi ngày trong tháng đã chốt có halfShift: null
    assert.ok(closedCtx.days.every(d => d.halfShift === null));
  });

  await withTempDb(t, 'half_shift_debt_context', async (db, client) => {
    const nvId = '0a7c4e2e-1111-4a6b-9c1d-000000000001';
    const adminId = '0a7c4e2e-1111-4a6b-9c1d-000000000099';

    await client.query(
      `INSERT INTO staff (username, name, type, level, pass_hash, created_at, uuid)
       VALUES 
         ('nv01', 'Nhân viên 01', 'nv', 1, 'x', now(), $1),
         ('admin', 'Admin', 'admin', 1, 'x', now(), $2)`,
      [nvId, adminId]
    );

    const service = new RequestsService(
      new RequestsRepository(db),
      new AttendanceRepository(db),
      new TransactionCoordinator(db),
      new HolidaysRepository(db),
      new DayStatusRepository(db)
    );

    // 2 đơn nửa ca duyệt (10/11, 12/11) + 1 đơn chờ (13/11)
    const hs1 = await service.createHalfShiftLeaveRequest({
      employeeId: 'nv01',
      date: '2026-11-10',
      half: 'FIRST',
      reason: 'Khám 1'
    });
    await service.reviewRequest(hs1.id, 'admin', 'APPROVE');

    const hs2 = await service.createHalfShiftLeaveRequest({
      employeeId: 'nv01',
      date: '2026-11-12',
      half: 'FIRST',
      reason: 'Khám 2'
    });
    await service.reviewRequest(hs2.id, 'admin', 'APPROVE');

    await service.createHalfShiftLeaveRequest({
      employeeId: 'nv01',
      date: '2026-11-13',
      half: 'FIRST',
      reason: 'Chờ duyệt'
    });

    // 1 khung OT 4 giờ (17/11 18:00 - 22:00, 240 phút)
    await service.createOvertimeRequest({
      employeeId: 'nv01',
      otDate: '2026-11-17',
      startTime: '18:00',
      endTime: '22:00',
      reason: 'Làm thêm'
    });

    let ctx = await service.requestContext('nv01');
    let m11 = ctx.months.find(m => m.month === '2026-11')!;

    // Nợ: 2 đơn duyệt (480 phút), đơn chờ không tính
    // OT: 240 phút đã đăng ký sau ngày nợ -> registered: 240, remaining: 240
    assert.deepEqual((m11 as any).halfShiftDebt, {
      owedMinutes: 480,
      registeredMinutes: 240,
      remainingMinutes: 240
    });
    // Tháng chỉ có khung trả nợ -> hasOvertime là false
    assert.equal(m11.hasOvertime, false);

    // Thêm khung OT 5 giờ làm (CN 15/11 08:00 - 14:00, 300 phút) -> tổng OT 540 phút > 480 phút nợ
    await service.createOvertimeRequest({
      employeeId: 'nv01',
      otDate: '2026-11-15',
      startTime: '08:00',
      endTime: '14:00',
      reason: 'Làm thêm 2'
    });

    ctx = await service.requestContext('nv01');
    m11 = ctx.months.find(m => m.month === '2026-11')!;
    assert.deepEqual((m11 as any).halfShiftDebt, {
      owedMinutes: 480,
      registeredMinutes: 480,
      remainingMinutes: 0
    });
    // Có thêm khung vượt nợ -> hasOvertime là true
    assert.equal(m11.hasOvertime, true);

    // Ngày 12/11 thành ngày lễ về sau (T8) -> bỏ nợ ngày 12/11
    await client.query(
      `INSERT INTO company_holidays (holiday_date, name, created_at)
       VALUES ('2026-11-12', 'Lễ phát sinh', now())`
    );

    ctx = await service.requestContext('nv01');
    m11 = ctx.months.find(m => m.month === '2026-11')!;
    // Nợ chỉ còn 240 (ngày 10/11)
    assert.equal((m11 as any).halfShiftDebt.owedMinutes, 240);
    assert.equal((m11 as any).halfShiftDebt.registeredMinutes, 240);
    assert.equal((m11 as any).halfShiftDebt.remainingMinutes, 0);
  });
});

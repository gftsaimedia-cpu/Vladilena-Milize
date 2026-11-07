import assert from 'node:assert/strict';
import { test } from 'node:test';
import { withTempDb } from './helpers/pg-temp-db.js';
import { TransactionCoordinator } from '../../src/database/transaction.js';
import { AttendanceRepository } from '../../src/modules/attendance/attendance.repository.js';
import { AttendanceDaysRepository } from '../../src/modules/attendance/attendance-days.repository.js';
import { AttendanceDaysService } from '../../src/modules/attendance/attendance-days.service.js';
import { AttendanceService } from '../../src/modules/attendance/attendance.service.js';
import { SettingsAttendanceSettings } from '../../src/modules/attendance/attendance-settings.port.js';
import { SettingsReader } from '../../src/modules/settings/settings-reader.js';
import { SettingsRepository } from '../../src/modules/settings/settings.repository.js';
import { RequestsService } from '../../src/modules/requests/requests.service.js';
import { RequestsRepository } from '../../src/modules/requests/requests.repository.js';
import { DayStatusRepository } from '../../src/modules/requests/day-status.repository.js';
import { HolidaysRepository } from '../../src/modules/holidays/holidays.repository.js';
import { CalendarService } from '../../src/modules/calendar/calendar.service.js';
import { MeController } from '../../src/modules/me/me.controller.js';
import { vnToday } from '../../src/modules/me/domain/index.js';

const NV1 = '11111111-1111-4111-8111-111111111111';

test('GET /me/today và GET /me/attendance có cờ halfShift', async t => {
  await withTempDb(t, 'half_shift_me', async (db, client) => {
    await client.query(
      `INSERT INTO staff (username, name, role, type, level, pass_hash, created_at, uuid, start_date)
       VALUES 
         ('admin', 'Admin', 'admin', 'nv', 1, 'x', now(), '00000000-0000-0000-0000-000000000000', '2026-01-01'),
         ('nv1', 'Nhân viên 1', 'staff', 'nv', 1, 'x', now(), $1, '2026-01-01')`,
      [NV1]
    );

    const txCoord = new TransactionCoordinator(db);
    const setRepo = new SettingsRepository(db);
    const setReader = new SettingsReader(setRepo);
    const attSettings = new SettingsAttendanceSettings(setReader);
    const attDaysRepo = new AttendanceDaysRepository(db);
    const attDaysService = new AttendanceDaysService(attDaysRepo, attSettings, txCoord);
    const attRepo = new AttendanceRepository(db);
    const attService = new AttendanceService(attRepo, attDaysService, setReader, txCoord);

    const reqRepo = new RequestsRepository(db);
    const holRepo = new HolidaysRepository(db);
    const dayStatusRepo = new DayStatusRepository(db);
    const reqService = new RequestsService(reqRepo, attRepo, txCoord, holRepo, dayStatusRepo, undefined, undefined, undefined, undefined, undefined, attDaysService);

    const meController = new MeController(
      attService,
      reqService,
      {} as any,
      { findByUsernameOrUuid: async () => ({ toDTO: () => ({ contract: { effectiveFrom: '2026-01-01' } }) }) } as any,
      { getPeriod: async () => null } as any,
      { reminders: async () => [] } as any,
      setReader,
      new CalendarService(attDaysRepo, attSettings, dayStatusRepo)
    );

    const today = vnToday(); // YYYY-MM-DD
    const month = today.slice(0, 7);

    // Nộp và duyệt đơn nghỉ giữa ca cho ngày hôm nay
    const req = await reqService.createHalfShiftLeaveRequest({
      employeeId: 'nv1',
      date: today,
      half: 'FIRST',
      reason: 'Nghỉ ca đầu'
    });
    await reqService.reviewRequest(req.id, 'admin', 'APPROVE');

    // Chấm công vào 08:00 và ra 12:00
    await client.query(
      `INSERT INTO punch_events (id, employee_id, punched_at, work_date, type, latitude, longitude, accuracy_meters, distance_meters, is_within_office, created_at)
       VALUES 
         (gen_random_uuid(), $1, $2, $3, 'IN', 10.7, 106.7, 5, 5, true, now()),
         (gen_random_uuid(), $1, $4, $3, 'OUT', 10.7, 106.7, 5, 5, true, now())`,
      [NV1, `${today}T01:00:00Z`, today, `${today}T05:00:00Z`]
    );

    // Refresh ngày hôm nay
    await attDaysService.refreshDays(NV1, [today]);

    const sessionReq: any = { user: { uuid: NV1, username: 'nv1' } };

    // 1. GET /api/v2/me/today
    const todayRes = (await meController.today(sessionReq)) as any;
    assert.equal(todayRes.date, today);
    assert.deepEqual(todayRes.shift, { type: 'NORMAL', start: '08:00', end: '12:00' });
    assert.equal(todayRes.halfShift, 'FIRST');

    // 2. GET /api/v2/me/attendance
    const attMonthRes = (await meController.attendanceMonth(sessionReq, month)) as any;
    const todayCell = attMonthRes.days.find((d: any) => d.date === today);
    assert.ok(todayCell, 'phải tìm thấy ô ngày hôm nay');
    assert.equal(todayCell.halfShift, 'FIRST');

    // Ngày khác (ví dụ hôm qua hoặc ngày mai)
    const otherCell = attMonthRes.days.find((d: any) => d.date !== today);
    if (otherCell) {
      assert.equal(otherCell.halfShift, null);
    }
  });
});

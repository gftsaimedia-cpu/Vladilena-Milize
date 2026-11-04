import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { randomUUID } from 'node:crypto';
import { createScriptedKysely, type ScriptedLogEntry, type ScriptedQuery } from './helpers/scripted-kysely';
import { AttendanceRepository } from '../../src/modules/attendance/attendance.repository';
import { DailyTimesheet, PunchEvent, WorkSchedule } from '../../src/modules/attendance/domain';
import { RequestsRepository } from '../../src/modules/requests/requests.repository';
import { RequestsService } from '../../src/modules/requests/requests.service';
import { SystemRequest } from '../../src/modules/requests/domain';

// pg đọc cột DATE thành Date lúc 0h theo giờ máy. Ghim múi giờ chạy thật (UTC+7) để lỗi lệch ngày
// vẫn lộ ra khi máy chạy test để UTC.
process.env.TZ = 'Asia/Ho_Chi_Minh';

// pg-types dựng DATE bằng new Date(năm, tháng, ngày) theo giờ máy
const pgDate = (year: number, month: number, day: number) => new Date(year, month - 1, day);

// Các dạng giá trị một cột DATE có thể tới mapper, và ngày lịch phải đọc ra
const DATE_CASES: Array<[label: string, raw: Date | string, want: string]> = [
  ['Date from pg', pgDate(2026, 11, 7), '2026-11-07'],
  ['Date from pg on New Year', pgDate(2026, 1, 1), '2026-01-01'],
  ['YYYY-MM-DD text', '2026-11-07', '2026-11-07'],
  ['ISO timestamp text', '2026-11-07T00:00:00.000Z', '2026-11-07']
];

const scheduleRow = (workDate: Date | string) => ({
  id: randomUUID(),
  employee_id: 'emp-1',
  work_date: workDate as string,
  shift_type: 'NORMAL',
  planned_start_time: '08:00:00',
  planned_end_time: '17:00:00',
  approved_ot_hours: 0,
  schedule_type: 'REGULAR',
  status: 'PLANNED',
  source_request_id: null,
  created_at: '2026-11-01T01:00:00.000Z',
  updated_at: '2026-11-01T01:00:00.000Z'
});

const requestRow = (type: string, fields: Record<string, unknown>) => ({
  id: randomUUID(),
  employee_id: 'emp-1',
  title: 'Đơn',
  type,
  reason: 'Việc gia đình',
  status: 'PENDING',
  reviewed_by: null,
  reviewed_at: null,
  review_note: null,
  created_at: new Date('2026-11-01T01:00:00.000Z'),
  updated_at: new Date('2026-11-01T01:00:00.000Z'),
  leave_type: null,
  leave_start_date: null,
  leave_end_date: null,
  leave_days_count: null,
  explanation_date: null,
  actual_check_in: null,
  actual_check_out: null,
  ot_date: null,
  ot_start_time: null,
  ot_end_time: null,
  ot_hours: null,
  advance_amount: null,
  advance_period: null,
  change_start_date: null,
  change_end_date: null,
  new_shift_type: null,
  new_start_time: null,
  new_end_time: null,
  ...fields
});

describe('Cột DATE của PostgreSQL đọc ở UTC+7', () => {
  it('WorkSchedule.fromRow keeps work_date on the same calendar day', () => {
    for (const [label, raw, want] of DATE_CASES) {
      assert.equal(WorkSchedule.fromRow(scheduleRow(raw)).workDate, want, label);
    }
  });

  it('PunchEvent.fromRow keeps work_date on the same calendar day', () => {
    for (const [label, raw, want] of DATE_CASES) {
      const punch = PunchEvent.fromRow({
        id: randomUUID(),
        employee_id: randomUUID(),
        punched_at: '2026-11-07T01:05:00.000Z',
        work_date: raw as string,
        type: 'IN',
        latitude: 10.7769,
        longitude: 106.7009,
        accuracy_meters: 15,
        distance_meters: 20,
        is_within_office: true,
        note: null
      });
      assert.equal(punch.workDate, want, label);
    }
  });

  it('DailyTimesheet.fromRow keeps work_date on the same calendar day', () => {
    for (const [label, raw, want] of DATE_CASES) {
      const timesheet = DailyTimesheet.fromRow({
        id: randomUUID(),
        employee_id: randomUUID(),
        work_date: raw as string,
        shift_type: 'NORMAL',
        shift_start_time: '08:00',
        shift_end_time: '17:00',
        shift_allowance_pct: 0,
        actual_check_in: '2026-11-07T01:05:00.000Z',
        actual_check_out: null,
        work_hours: 0,
        work_units: 0,
        ot_hours: 0,
        late_minutes: 5,
        early_minutes: 0,
        status: 'DRAFT',
        is_locked: false,
        check_in_status: 'LATE',
        check_out_status: 'PENDING',
        day_status: 'IN_PROGRESS'
      });
      assert.equal(timesheet.workDate, want, label);
    }
  });

  it('SystemRequest.fromRow keeps leave start and end dates on the same calendar day', () => {
    for (const [label, raw, want] of DATE_CASES) {
      const req = SystemRequest.fromRow(
        requestRow('LEAVE', { leave_type: 'ANNUAL', leave_start_date: raw, leave_end_date: raw, leave_days_count: 1 })
      );
      assert.equal(req.leaveStartDate, want, label);
      assert.equal(req.leaveEndDate, want, label);
    }
  });

  it('SystemRequest.fromRow keeps explanation_date on the same calendar day', () => {
    for (const [label, raw, want] of DATE_CASES) {
      const req = SystemRequest.fromRow(
        requestRow('EXPLANATION', { explanation_date: raw, actual_check_in: '08:00', actual_check_out: null })
      );
      assert.equal(req.explanationDate, want, label);
    }
  });

  it('SystemRequest.fromRow keeps ot_date on the same calendar day', () => {
    for (const [label, raw, want] of DATE_CASES) {
      const req = SystemRequest.fromRow(
        requestRow('OVERTIME', { ot_date: raw, ot_start_time: '17:00', ot_end_time: '19:00', ot_hours: 2 })
      );
      assert.equal(req.otDate, want, label);
    }
  });
});

const isQuery = (entry: ScriptedLogEntry): entry is ScriptedQuery => typeof entry !== 'string';

// Ghép cột và tham số của một câu insert một dòng thành object để so sánh theo tên cột
function insertedRow(query: ScriptedQuery): Record<string, unknown> {
  const match = /^insert into "\w+" \(([^)]*)\) values \(([^)]*)\)/.exec(query.sql);
  assert.ok(match, `not a single-row insert: ${query.sql}`);
  const columns = match[1].split(', ').map(c => c.replace(/"/g, ''));
  const placeholders = match[2].split(', ');
  return Object.fromEntries(columns.map((c, i) => [c, query.parameters[Number(placeholders[i].slice(1)) - 1]]));
}

describe('Duyệt đơn lên ngày đã có lịch (cột DATE đọc về là Date)', () => {
  it('approving a one-day LEAVE marks that day ON_LEAVE and writes no other day', async () => {
    const employeeId = randomUUID();
    const leave = requestRow('LEAVE', {
      employee_id: employeeId,
      leave_type: 'ANNUAL',
      leave_start_date: pgDate(2026, 11, 6),
      leave_end_date: pgDate(2026, 11, 6),
      leave_days_count: 1
    });
    // Thứ Sáu 06/11/2026 đã có lịch PLANNED trong work_schedules
    const friday = { ...scheduleRow(pgDate(2026, 11, 6)), employee_id: employeeId };

    const { db, log } = createScriptedKysely(({ sql, parameters }) => {
      // findById chọn rõ từng cột (DATE qua to_char); vẫn trả Date ở đây để kiểm cả mapper khi DATE về dạng Date
      if (sql.startsWith('select') && sql.includes('from "system_requests"')) return [leave];
      if (sql.startsWith('select * from "work_schedules"')) {
        return parameters[0] === employeeId && parameters[1] === '2026-11-06' ? [friday] : [];
      }
      return [];
    });
    const service = new RequestsService(new RequestsRepository(db), new AttendanceRepository(db));

    await service.reviewRequest(leave.id, 'admin-1', 'APPROVE');

    const queries = log.filter(isQuery);
    const scheduleWrites = queries
      .filter(q => q.sql.startsWith('insert into "work_schedules"'))
      .map(insertedRow)
      .map(r => ({ id: r.id, work_date: r.work_date, status: r.status, source_request_id: r.source_request_id }));
    assert.deepEqual(scheduleWrites, [
      { id: friday.id, work_date: '2026-11-06', status: 'ON_LEAVE', source_request_id: leave.id }
    ]);

    // Lưu lại đơn sau khi duyệt không được ghi đè ngày nghỉ sang hôm trước
    const requestWrites = queries
      .filter(q => q.sql.startsWith('insert into "system_requests"'))
      .map(insertedRow)
      .map(r => ({ status: r.status, leave_start_date: r.leave_start_date, leave_end_date: r.leave_end_date }));
    assert.deepEqual(requestWrites, [{ status: 'APPROVED', leave_start_date: '2026-11-06', leave_end_date: '2026-11-06' }]);
  });
});

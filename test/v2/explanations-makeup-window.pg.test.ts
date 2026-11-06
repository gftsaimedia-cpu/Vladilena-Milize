import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { describe, it } from 'node:test';
import type { Kysely } from 'kysely';
import type { Client } from 'pg';
import type { DB } from '../../src/database/schema';
import { TransactionCoordinator } from '../../src/database/transaction';
import { AttendanceRepository } from '../../src/modules/attendance/attendance.repository';
import { AttendanceDaysRepository } from '../../src/modules/attendance/attendance-days.repository';
import { AttendanceDaysService } from '../../src/modules/attendance/attendance-days.service';
import { SettingsAttendanceSettings } from '../../src/modules/attendance/attendance-settings.port';
import { HolidaysRepository } from '../../src/modules/holidays/holidays.repository';
import { DayStatusRepository } from '../../src/modules/requests/day-status.repository';
import { ExplanationRemindersRepository } from '../../src/modules/requests/explanation-reminders.repository';
import { ExplanationsService } from '../../src/modules/requests/explanations.service';
import { RequestsRepository } from '../../src/modules/requests/requests.repository';
import { RequestsService } from '../../src/modules/requests/requests.service';
import { SettingsReader } from '../../src/modules/settings/settings-reader';
import { SettingsRepository } from '../../src/modules/settings/settings.repository';
import { withTempDb } from './helpers/pg-temp-db';

// Cần PostgreSQL thật (PG_TEST_URL), xem helpers/pg-temp-db.ts. Loại `nv` có sẵn trong schema.sql: tuần T2–T7, ca 08–17.
// Luật người dùng chốt 06/11: vào trễ ở khung làm bù đã duyệt thì giải trình được (tiền chỉ trừ phần trễ thật, giờ bù
// ghi đủ khung). Ngày nào bộ dò duy nhất của chấm công (detectCases, spec 4) báo có trường hợp thì nộp được giải trình.
// "Hôm nay" là Thứ Hai 16/11/2026 10:00, nên Chủ nhật 15/11 đã qua mốc xét.
const NOW = new Date('2026-11-16T10:00:00+07:00');
const BINH = '11111111-1111-4111-8111-111111111111';
const SUNDAY = '2026-11-15';

async function seedBinh(client: Client): Promise<void> {
  await client.query(
    `INSERT INTO staff (username, name, type, level, pass_hash, created_at, contract, uuid, start_date)
     VALUES ('nv-binh', 'Bình', 'nv', 1, 'x', '2026-01-01', 'long', $1, '2026-10-01')`,
    [BINH]
  );
}

/** Đơn nghỉ có làm bù (nghỉ Thứ Sáu 13/11) với một khung bù trên `date`, ở trạng thái `status`. */
async function makeupWindow(client: Client, date: string, start: string, end: string, status: string): Promise<void> {
  const id = randomUUID();
  await client.query(
    `INSERT INTO system_requests (id, employee_id, title, type, reason, status, created_at, updated_at,
       leave_type, leave_start_date, leave_end_date, leave_days_count)
     VALUES ($1, $2, 'Nghỉ có làm bù', 'LEAVE_WITH_MAKEUP', 'Việc nhà', $3, now(), now(), 'PERSONAL_UNPAID', '2026-11-13', '2026-11-13', 1)`,
    [id, BINH, status]
  );
  await client.query(
    `INSERT INTO makeup_slots (request_id, work_date, start_time, end_time, work_minutes) VALUES ($1, $2, $3, $4, 240)`,
    [id, date, start, end]
  );
}

/** Chấm vào / ra theo giờ Việt Nam. */
async function punch(client: Client, date: string, inTime: string, outTime: string): Promise<void> {
  for (const [time, type] of [
    [inTime, 'IN'],
    [outTime, 'OUT']
  ]) {
    await client.query(
      `INSERT INTO punch_events (id, employee_id, punched_at, work_date, type, latitude, longitude,
         accuracy_meters, distance_meters, is_within_office, created_at)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, 0, 0, 1, 1, true, now())`,
      [BINH, `${date}T${time}:00+07:00`, date, type]
    );
  }
}

/** Dịch vụ thật trên DB tạm; dòng ngày dựng lại từ lần chấm bằng bộ dựng dòng ngày thật. */
function build(db: Kysely<DB>) {
  const tx = new TransactionCoordinator(db);
  const reader = new SettingsReader(new SettingsRepository(db));
  const days = new AttendanceDaysService(new AttendanceDaysRepository(db), new SettingsAttendanceSettings(reader), tx);
  const explanations = new ExplanationsService(
    new RequestsRepository(db),
    new AttendanceRepository(db),
    new HolidaysRepository(db),
    new DayStatusRepository(db),
    new ExplanationRemindersRepository(db),
    undefined,
    reader
  );
  explanations.now = () => NOW;
  const requests = new RequestsService(
    new RequestsRepository(db),
    new AttendanceRepository(db),
    tx,
    new HolidaysRepository(db),
    new DayStatusRepository(db),
    undefined,
    undefined,
    explanations,
    undefined,
    undefined,
    days
  );
  requests.now = () => NOW;
  return {
    explanations,
    requests,
    rebuild: (dates: string[]) => days.refreshDays(BINH, dates, { now: NOW }),
    file: (workDate: string) => requests.createExplanationRequest({ employeeId: 'nv-binh', reason: 'Kẹt xe', workDate } as any)
  };
}

describe('Giải trình ngày không ca có khung bù đã duyệt (06/11)', () => {
  it('Chủ nhật 15/11, khung bù 18:00–22:00, vào 18:30 ra 22:00: cần giải trình vào trễ, nộp được', async t => {
    await withTempDb(t, 'expl_mk_late', async (db, client) => {
      await seedBinh(client);
      await makeupWindow(client, SUNDAY, '18:00', '22:00', 'APPROVED');
      await punch(client, SUNDAY, '18:30', '22:00');
      const f = build(db);
      await f.rebuild([SUNDAY]);

      const due = (await f.explanations.dueDays('nv-binh')).find(d => d.date === SUNDAY);
      assert.deepEqual(due, {
        date: SUNDAY,
        cases: ['LATE_CHECK_IN'],
        needs: { checkIn: false, checkOut: false },
        remindedAt: null,
        checkIn: '18:30',
        checkOut: '22:00'
      });

      // Đơn giải trình ghi sẵn trường hợp LATE_CHECK_IN: phiên Chấm công đọc nó khi đơn được duyệt để ghi đủ giờ bù.
      const dto = await f.file(SUNDAY);
      assert.deepEqual(dto.explanationCases, ['LATE_CHECK_IN']);
      const saved = await client.query(`SELECT case_code FROM explanation_cases WHERE request_id = $1`, [dto.id]);
      assert.deepEqual(saved.rows.map(r => r.case_code), ['LATE_CHECK_IN']);
    });
  });

  it('vào 18:10, trong 15 phút: không có gì cần giải trình', async t => {
    await withTempDb(t, 'expl_mk_ontime', async (db, client) => {
      await seedBinh(client);
      await makeupWindow(client, SUNDAY, '18:00', '22:00', 'APPROVED');
      await punch(client, SUNDAY, '18:10', '22:00');
      const f = build(db);
      await f.rebuild([SUNDAY]);

      assert.equal((await f.explanations.dueDays('nv-binh')).some(d => d.date === SUNDAY), false);
      await assert.rejects(f.file(SUNDAY), { message: 'Ngày 15/11 không có gì cần giải trình' });
    });
  });

  it('Chủ nhật không có khung (hoặc khung của đơn còn chờ duyệt): vẫn không phải ngày làm', async t => {
    await withTempDb(t, 'expl_mk_none', async (db, client) => {
      await seedBinh(client);
      // Khung bù trên Chủ nhật 15/11 nhưng đơn còn chờ duyệt: dòng ngày chỉ xét khung đã duyệt, nên ở đây cũng vậy.
      await makeupWindow(client, SUNDAY, '18:00', '22:00', 'PENDING');
      await punch(client, SUNDAY, '18:30', '22:00');
      await punch(client, '2026-11-08', '18:30', '22:00');
      const f = build(db);
      await f.rebuild([SUNDAY, '2026-11-08']);

      const dates = (await f.explanations.dueDays('nv-binh')).map(d => d.date);
      assert.equal(dates.includes(SUNDAY), false);
      assert.equal(dates.includes('2026-11-08'), false);
      await assert.rejects(f.file(SUNDAY), { message: 'Ngày 15/11 không phải ngày làm' });
      await assert.rejects(f.file('2026-11-08'), { message: 'Ngày 08/11 không phải ngày làm' });
    });
  });

  it('ngày có ca và khung bù sau ca: vẫn dò theo ca như trước', async t => {
    await withTempDb(t, 'expl_mk_shift', async (db, client) => {
      await seedBinh(client);
      // Thứ Năm 12/11, ca 08:00–17:00, khung bù 18:00–22:00 đã duyệt.
      await makeupWindow(client, '2026-11-12', '18:00', '22:00', 'APPROVED');
      await punch(client, '2026-11-12', '08:40', '17:00');
      const f = build(db);
      await f.rebuild(['2026-11-12']);

      const due = (await f.explanations.dueDays('nv-binh')).find(d => d.date === '2026-11-12');
      assert.deepEqual(due?.cases, ['LATE_CHECK_IN']);
      const dto = await f.file('2026-11-12');
      assert.deepEqual(dto.explanationCases, ['LATE_CHECK_IN']);
    });
  });
});

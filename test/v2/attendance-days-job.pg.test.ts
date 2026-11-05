import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Kysely } from 'kysely';
import type { Client } from 'pg';
import type { DB } from '../../src/database/schema';
import { TransactionCoordinator } from '../../src/database/transaction';
import { AttendanceDaysJob } from '../../src/modules/attendance/attendance-days.job';
import { AttendanceDaysRepository } from '../../src/modules/attendance/attendance-days.repository';
import { AttendanceDaysService, type RefreshOptions } from '../../src/modules/attendance/attendance-days.service';
import { PositionTypeAttendanceSettings } from '../../src/modules/attendance/attendance-settings.port';
import { withTempDb } from './helpers/pg-temp-db';

// Cần PostgreSQL thật (PG_TEST_URL), xem helpers/pg-temp-db.ts.
const NV = '11111111-1111-4111-8111-111111111111';
const NV2 = '22222222-2222-4222-8222-222222222222';
const NOW_1 = new Date('2026-11-03T12:00:00Z'); // 19:00 ngày 03/11 giờ VN, đã qua 17:30
const NOW_2 = new Date('2026-11-04T11:00:00Z'); // 18:00 ngày 04/11 giờ VN

async function addStaff(client: Client, username: string, uuid: string, startDate: string): Promise<void> {
  // Loại 'nv' có sẵn trong schema.sql (làm Thứ 2 đến Thứ 7).
  await client.query(
    `INSERT INTO staff (username, name, type, level, pass_hash, created_at, uuid, start_date)
     VALUES ($1, $1, 'nv', 1, 'x', '2026-01-01', $2, $3)`,
    [username, uuid, startDate]
  );
}

function build(db: Kysely<DB>, service?: AttendanceDaysService) {
  const repo = new AttendanceDaysRepository(db);
  const coordinator = new TransactionCoordinator(db);
  const real = new AttendanceDaysService(repo, new PositionTypeAttendanceSettings(db), coordinator);
  return { repo, coordinator, job: new AttendanceDaysJob(repo, service ?? real, coordinator) };
}

async function statuses(client: Client, employeeId: string): Promise<Map<string, string>> {
  const result = await client.query(
    `SELECT to_char(work_date, 'YYYY-MM-DD') AS d, status FROM timesheet_entries WHERE employee_id = $1`,
    [employeeId]
  );
  return new Map(result.rows.map(row => [row.d as string, row.status as string]));
}

describe('AttendanceDaysRepository.datesNeedingRefresh', () => {
  it('lists missing dates plus PENDING rows up to today, ascending and without duplicates', async t => {
    await withTempDb(t, 'att_job_dates', async (db, client) => {
      await addStaff(client, 'nv', NV, '2026-01-05');
      const { repo, job } = build(db);
      // Chưa có dòng nào: mọi ngày trong khoảng đều thiếu.
      const all = await repo.datesNeedingRefresh(NV, '2026-11-01', '2026-11-05', '2026-11-03');
      assert.deepEqual(all, ['2026-11-01', '2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05']);

      await job.runOnce(NOW_1);
      // Sau lần chạy: 04-05 là PENDING nhưng còn ở tương lai (> today), 01-03 đã chốt nên không còn gì.
      assert.deepEqual(await repo.datesNeedingRefresh(NV, '2026-11-01', '2026-11-05', '2026-11-03'), []);
      // Khi today tới 04/11, dòng PENDING 04/11 cần xét lại; 05/11 vẫn chưa.
      assert.deepEqual(await repo.datesNeedingRefresh(NV, '2026-11-01', '2026-11-05', '2026-11-04'), ['2026-11-04']);
      // Người khác không bị lẫn.
      assert.deepEqual(await repo.datesNeedingRefresh(NV2, '2026-11-01', '2026-11-02', '2026-11-03'), [
        '2026-11-01',
        '2026-11-02'
      ]);
    });
  });
});

describe('AttendanceDaysJob.runOnce trên PostgreSQL', () => {
  it('fills the previous and current month, keeps future workdays PENDING, then closes them as time passes', async t => {
    await withTempDb(t, 'att_job_run', async (db, client) => {
      await addStaff(client, 'nv', NV, '2026-01-05');
      const { job } = build(db);

      const first = await job.runOnce(NOW_1);
      assert.deepEqual(first, { employees: 1, days: 61 });
      const rows = await statuses(client, NV);
      assert.equal(rows.size, 61, '31 ngày tháng 10 + 30 ngày tháng 11');
      assert.equal(rows.get('2026-11-03'), 'ABSENT', 'ngày 03/11 không chấm, đã qua 17:30');
      for (const day of [4, 5, 6, 7, 9, 10, 30]) {
        const date = `2026-11-${String(day).padStart(2, '0')}`;
        assert.equal(rows.get(date), 'PENDING', date);
      }
      for (const day of [8, 15, 22, 29]) {
        assert.equal(rows.get(`2026-11-${String(day).padStart(2, '0')}`), 'REST', `Chủ nhật ${day}/11`);
      }
      assert.equal(rows.get('2026-10-01'), 'ABSENT');
      assert.equal(rows.has('2026-09-30'), false, 'không ghi trước tháng trước');
      assert.equal(rows.has('2026-12-01'), false);

      // Cùng `now`: không còn gì để làm.
      assert.deepEqual(await job.runOnce(NOW_1), { employees: 0, days: 0 });

      // 18:00 ngày 04/11: dòng PENDING của 04/11 tới mốc xét nên thành ABSENT.
      assert.deepEqual(await job.runOnce(NOW_2), { employees: 1, days: 1 });
      const later = await statuses(client, NV);
      assert.equal(later.get('2026-11-04'), 'ABSENT');
      assert.equal(later.get('2026-11-05'), 'PENDING');
    });
  });

  it('skips people who are not employed in the range', async t => {
    await withTempDb(t, 'att_job_scope', async (db, client) => {
      await addStaff(client, 'nv', NV, '2026-01-05');
      await addStaff(client, 'moi', NV2, '2026-12-15'); // nhận việc sau khoảng
      const { job } = build(db);
      assert.deepEqual(await job.runOnce(NOW_1), { employees: 1, days: 61 });
      assert.equal((await statuses(client, NV2)).size, 0);
    });
  });

  it('keeps going when one person fails, logs it with the id, and counts only the successes', async t => {
    await withTempDb(t, 'att_job_fail', async (db, client) => {
      await addStaff(client, 'nv', NV, '2026-01-05');
      await addStaff(client, 'nv2', NV2, '2026-01-05');
      const repo = new AttendanceDaysRepository(db);
      const coordinator = new TransactionCoordinator(db);
      class FailingFirst extends AttendanceDaysService {
        override async refreshDays(employeeId: string, dates: readonly string[], opts: RefreshOptions = {}) {
          if (employeeId === NV) throw new Error('hồ sơ hỏng');
          return await super.refreshDays(employeeId, dates, opts);
        }
      }
      const service = new FailingFirst(repo, new PositionTypeAttendanceSettings(db), coordinator);
      const errors = t.mock.method(console, 'error', () => undefined);
      const { job } = build(db, service);

      assert.deepEqual(await job.runOnce(NOW_1), { employees: 1, days: 61 });
      assert.equal((await statuses(client, NV)).size, 0);
      assert.equal((await statuses(client, NV2)).size, 61, 'người sau vẫn được ghi');
      assert.equal(errors.mock.callCount(), 1);
      assert.ok(String(errors.mock.calls[0].arguments.join(' ')).includes(NV), 'log có mã nhân sự');
    });
  });

  it('holds the job lock for the whole run, so two runs never overlap', async t => {
    await withTempDb(t, 'att_job_lock', async (db, client) => {
      await addStaff(client, 'nv', NV, '2026-01-05');
      const { job, coordinator } = build(db);
      let ran = false;
      let release!: () => void;
      const held = new Promise<void>(resolve => (release = resolve));
      // Giữ khoá `attendance_days_job` từ bên ngoài: runOnce phải đợi.
      const holder = coordinator.withLock('attendance_days_job', async () => {
        await held;
      });
      await new Promise(resolve => setTimeout(resolve, 100));
      const pending = job.runOnce(NOW_1).then(result => {
        ran = true;
        return result;
      });
      await new Promise(resolve => setTimeout(resolve, 300));
      assert.equal(ran, false, 'đang bị khoá thì runOnce chưa chạy');
      release();
      await holder;
      assert.deepEqual(await pending, { employees: 1, days: 61 });
    });
  });
});

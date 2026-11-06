import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Client } from 'pg';
import { Pool } from 'pg';
import { createKysely } from '../../src/database/kysely';
import { TransactionCoordinator } from '../../src/database/transaction';
import { AttendanceDaysRepository } from '../../src/modules/attendance/attendance-days.repository';
import { AttendanceDaysService } from '../../src/modules/attendance/attendance-days.service';
import { SettingsAttendanceSettings } from '../../src/modules/attendance/attendance-settings.port';
import { AttendanceSettingsListener } from '../../src/modules/attendance/attendance-settings.listener';
import { AuditLog } from '../../src/modules/audit/audit-log';
import { AuditRepository } from '../../src/modules/audit/audit.repository';
import { SettingsChanges } from '../../src/modules/settings/settings-changes';
import { SettingsReader } from '../../src/modules/settings/settings-reader';
import { SettingsRepository } from '../../src/modules/settings/settings.repository';
import { SettingsService } from '../../src/modules/settings/settings.service';
import { withTempDb } from './helpers/pg-temp-db';

// Cần PostgreSQL thật (PG_TEST_URL). Lưu cài đặt chấm công áp dụng từ tháng cũ khi có nhiều nhân sự: BE dựng lại ngày công
// của mọi người qua mọi tháng. Số truy vấn phải tỉ lệ với số tháng chứ không với số nhân sự x số tháng (N+1), và kết quả
// từng dòng ngày công phải giữ nguyên.
const STAFF = 250;
// Đo được ~12 truy vấn mỗi người (gồm giao dịch và khoá); trước khi gộp là ~190 mỗi người (48 nghìn truy vấn).
const MAX_QUERIES = STAFF * 16;
const NOW = new Date('2026-11-16T05:00:00Z');

async function seed(client: Client): Promise<void> {
  // Kỳ 03/2026 đã phê duyệt nên cài đặt chỉ áp dụng được từ 04/2026: 8 tháng tới tháng hiện tại (11/2026).
  await client.query("INSERT INTO payroll_periods (month, status) VALUES ('2026-03', 'approved')");
  await client.query(
    `INSERT INTO staff (username, name, type, level, pass_hash, created_at, uuid, start_date)
     SELECT 'nv' || i, 'nv' || i, 'nv', 1, 'x', '2026-01-01', gen_random_uuid(), '2026-01-05'
     FROM generate_series(1, $1) AS i`,
    [STAFF]
  );
  // Mỗi người chấm công vài ngày mỗi tháng, giờ vào rải theo người nên ân hạn mới đổi kết quả của một phần ngày.
  await client.query(
    `INSERT INTO punch_events (id, employee_id, punched_at, work_date, type, latitude, longitude,
       accuracy_meters, distance_meters, is_within_office, created_at)
     SELECT gen_random_uuid(), s.uuid,
       (d.d + CASE t.type WHEN 'IN' THEN time '08:00' + (s.n % 20) * interval '1 minute' ELSE time '17:05' END)
         AT TIME ZONE 'Asia/Ho_Chi_Minh',
       d.d, t.type, 0, 0, 1, 1, true, now()
     FROM (SELECT uuid, row_number() OVER (ORDER BY username) AS n FROM staff) s,
       (SELECT generate_series('2026-01-06'::date, '2026-11-13'::date, '1 day')::date AS d) d,
       (VALUES ('IN'), ('OUT')) t(type)
     WHERE extract(isodow FROM d.d) BETWEEN 1 AND 5 AND extract(day FROM d.d) BETWEEN 6 AND 10`
  );
}

const SNAPSHOT = `SELECT employee_id, work_date, status, check_in_status, check_out_status, late_minutes, early_minutes,
  work_hours, work_units, pay_units, deduction_minutes, day_status, counts_as_workday, actual_check_in, actual_check_out
  FROM timesheet_entries ORDER BY employee_id, work_date`;

describe('Lưu cài đặt chấm công từ tháng cũ với nhiều nhân sự', () => {
  it('rebuilds every month with a query count that does not grow with staff x months, and keeps the rows', async t => {
    await withTempDb(t, 'att_recompute', async (db, client) => {
      await seed(client);
      // Đếm mọi câu truy vấn qua pool của kết nối thử (không tính các câu đếm của chính test).
      let queries = 0;
      const countingDb = createKysely(
        (() => {
          const url = new URL(process.env.PG_TEST_URL!);
          url.pathname = `/${client.database}`;
          const p = new Pool({ connectionString: url.toString(), max: 10 });
          p.on('connect', c => {
            const original = c.query.bind(c) as (...a: unknown[]) => unknown;
            (c as any).query = (...a: unknown[]) => {
              queries += 1;
              return original(...a);
            };
          });
          return p;
        })()
      );
      try {
        const repo = new SettingsRepository(countingDb);
        const reader = new SettingsReader(repo);
        const changes = new SettingsChanges();
        const coordinator = new TransactionCoordinator(countingDb);
        const settings = new SettingsService(repo, reader, coordinator, changes, new AuditLog(new AuditRepository(), coordinator));
        const daysRepo = new AttendanceDaysRepository(countingDb);
        const days = new AttendanceDaysService(daysRepo, new SettingsAttendanceSettings(reader), coordinator);
        new AttendanceSettingsListener(changes, days, daysRepo).onModuleInit();

        queries = 0;
        const started = Date.now();
        const saved = await settings.saveGroup('attendance', { effectiveMonth: '2026-04', values: { lateGraceMinutes: 5 }, stamp: 0 }, 'admin', NOW);
        const elapsed = Date.now() - started;
        const used = queries;
        console.log(`[recompute] ${STAFF} nhân sự x 8 tháng: ${elapsed} ms, ${used} truy vấn`);
        assert.equal(saved.effectiveMonth, '2026-04');
        const after = (await client.query(SNAPSHOT)).rows;
        assert.ok(after.length > STAFF * 100, `ít dòng ngày công: ${after.length}`);

        // Đường tham chiếu: dựng lại từng người, từng tháng bằng refreshMonth (đường chuẩn, không gộp) cho cùng kết quả.
        await client.query('DELETE FROM timesheet_entries');
        const ids = (await client.query("SELECT uuid FROM staff ORDER BY username")).rows.map(r => r.uuid as string);
        for (const id of ids.slice(0, 20)) {
          for (let m = 4; m <= 11; m++) await days.refreshMonth(id, `2026-${String(m).padStart(2, '0')}`, { now: NOW });
        }
        const expected = (await client.query(SNAPSHOT)).rows;
        const byKey = (rows: any[]) => new Map(rows.map(r => [`${r.employee_id}|${r.work_date}`, JSON.stringify(r)]));
        const got = byKey(after);
        for (const [key, row] of byKey(expected)) assert.equal(got.get(key), row, key);

        assert.ok(used <= MAX_QUERIES, `${used} truy vấn (tối đa ${MAX_QUERIES}): còn N+1 theo nhân sự`);
      } finally {
        await countingDb.destroy();
      }
    });
  });
});

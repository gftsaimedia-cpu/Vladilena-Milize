import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Kysely } from 'kysely';
import type { Client } from 'pg';
import type { DB } from '../../src/database/schema';
import { TransactionCoordinator } from '../../src/database/transaction';
import { AttendanceDaysRepository } from '../../src/modules/attendance/attendance-days.repository';
import { AttendanceDaysService } from '../../src/modules/attendance/attendance-days.service';
import { AttendanceSettingsListener } from '../../src/modules/attendance/attendance-settings.listener';
import { SettingsAttendanceSettings } from '../../src/modules/attendance/attendance-settings.port';
import { SettingsChanges, type SettingsChange } from '../../src/modules/settings/settings-changes';
import { SettingsReader } from '../../src/modules/settings/settings-reader';
import { SettingsRepository } from '../../src/modules/settings/settings.repository';
import { SettingsService } from '../../src/modules/settings/settings.service';
import { withTempDb } from './helpers/pg-temp-db';

// Cần PostgreSQL thật (PG_TEST_URL), xem helpers/pg-temp-db.ts.
// Loại 'nv' có sẵn trong schema: tuần T2–T7 từ 2000-01, ân hạn mặc định 15 phút.
const AN = '11111111-1111-4111-8111-111111111111';
const BINH = '22222222-2222-4222-8222-222222222222';
const NO_TYPE = '33333333-3333-4333-8333-333333333333';
/** Thứ Hai 16/11/2026 giờ VN: các thứ Bảy 7 và 14/11 đã qua hẳn. */
const NOW = new Date('2026-11-16T05:00:00Z');
const META = { actor: 'x', at: NOW.toISOString() };

async function addStaff(client: Client, username: string, uuid: string, type = 'nv'): Promise<void> {
  await client.query(
    `INSERT INTO staff (username, name, type, level, pass_hash, created_at, uuid, start_date)
     VALUES ($1, $1, $2, 1, 'x', '2026-01-01', $3, '2026-01-05')`,
    [username, type, uuid]
  );
}

async function punch(client: Client, employeeId: string, date: string, inAt: string, outAt: string): Promise<void> {
  for (const [at, type] of [
    [inAt, 'IN'],
    [outAt, 'OUT']
  ]) {
    await client.query(
      `INSERT INTO punch_events (id, employee_id, punched_at, work_date, type, latitude, longitude,
         accuracy_meters, distance_meters, is_within_office, created_at)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, 0, 0, 1, 1, true, now())`,
      [employeeId, at, date, type]
    );
  }
}

/** Dựng đủ dây như AppModule: kho cài đặt thật, cổng thật, dịch vụ ngày công thật và người nghe đã đăng ký. */
function wire(db: Kysely<DB>) {
  const repo = new SettingsRepository(db);
  const reader = new SettingsReader(repo);
  const changes = new SettingsChanges();
  const coordinator = new TransactionCoordinator(db);
  const settings = new SettingsService(repo, reader, coordinator, changes);
  const port = new SettingsAttendanceSettings(reader);
  const daysRepo = new AttendanceDaysRepository(db);
  const days = new AttendanceDaysService(daysRepo, port, coordinator);
  const listener = new AttendanceSettingsListener(changes, days, daysRepo);
  listener.onModuleInit();
  return { reader, changes, settings, port, days, daysRepo, listener, repo };
}

/** Đọc thẳng cột từ `timesheet_entries`. */
async function column(client: Client, col: 'status' | 'check_in_status', employeeId: string, date: string): Promise<string> {
  const r = await client.query(`SELECT ${col} AS v FROM timesheet_entries WHERE employee_id = $1 AND work_date = $2`, [employeeId, date]);
  return r.rows[0].v;
}

describe('SettingsAttendanceSettings (cổng đọc kho cài đặt)', () => {
  it('returns the grace in force for each month', async t => {
    await withTempDb(t, 'att_port_grace', async db => {
      const { settings, port } = wire(db);
      assert.equal(await port.graceMinutes('2026-11'), 15);
      await settings.saveGroup('attendance', { effectiveMonth: '2026-12', values: { lateGraceMinutes: 10 }, stamp: 0 }, 'admin', NOW);
      assert.equal(await port.graceMinutes('2026-11'), 15);
      assert.equal(await port.graceMinutes('2026-12'), 10);
      assert.equal(await port.graceMinutes('2027-03'), 10);
    });
  });

  it('returns the personal week only for that person and from that month', async t => {
    await withTempDb(t, 'att_port_week', async (db, client) => {
      await addStaff(client, 'an', AN);
      await addStaff(client, 'binh', BINH);
      const { settings, port } = wire(db);
      await settings.saveWorkWeek('an', { weekdays: [1, 2, 3, 4, 5], effectiveMonth: '2026-12', stamp: 0 }, 'admin', NOW);
      assert.deepEqual(await port.workWeek(AN, '2026-11'), [1, 2, 3, 4, 5, 6]);
      assert.deepEqual(await port.workWeek(AN, '2026-12'), [1, 2, 3, 4, 5]);
      assert.deepEqual(await port.workWeek(AN, '2027-02'), [1, 2, 3, 4, 5]);
      assert.deepEqual(await port.workWeek(BINH, '2026-12'), [1, 2, 3, 4, 5, 6]);
    });
  });

  it('falls back to Monday–Saturday when the type has no week (ruling F2)', async t => {
    await withTempDb(t, 'att_port_f2', async (db, client) => {
      await addStaff(client, 'ql', NO_TYPE, 'ql');
      const { port } = wire(db);
      assert.deepEqual(await port.workWeek(NO_TYPE, '2026-11'), [1, 2, 3, 4, 5, 6]);
    });
  });

  it('reads inside the given transaction', async t => {
    await withTempDb(t, 'att_port_trx', async (db, client) => {
      await addStaff(client, 'an', AN);
      const { repo, port } = wire(db);
      await db.transaction().execute(async trx => {
        await repo.writeGroupVersion(trx, 'attendance', '2026-11', { lateGraceMinutes: 5, diligenceLostFromDays: 3 }, META);
        await repo.writeWorkWeek(trx, AN, '2026-11', '[2,4]', META);
        assert.equal(await port.graceMinutes('2026-11', trx), 5);
        assert.deepEqual(await port.workWeek(AN, '2026-11', trx), [2, 4]);
        // Ngoài giao dịch chưa commit thì chưa thấy.
        assert.equal(await port.graceMinutes('2026-11'), 15);
      });
      assert.equal(await port.graceMinutes('2026-11'), 5);
    });
  });
});

describe('SettingsAttendanceSettings.workWeek chuẩn hoá', () => {
  it('keeps 1..6 only, deduped and ascending (Sunday 0 and out-of-range dropped)', async () => {
    const reader = { workWeekOf: async () => ({ weekdays: [6, 0, 2, 2, 7, 3.5, 1] }) } as unknown as SettingsReader;
    assert.deepEqual(await new SettingsAttendanceSettings(reader).workWeek(AN, '2026-11'), [1, 2, 6]);
  });
});

describe('Cài đặt đổi thì ghi lại dòng ngày công', () => {
  it('rebuilds rows of every active person when the grace changes from the current month', async t => {
    await withTempDb(t, 'att_hook_grace', async (db, client) => {
      await addStaff(client, 'an', AN);
      await addStaff(client, 'binh', BINH);
      await punch(client, AN, '2026-11-03', '2026-11-03T01:12:00Z', '2026-11-03T10:10:00Z'); // vào 08:12
      await punch(client, BINH, '2026-11-03', '2026-11-03T01:12:00Z', '2026-11-03T10:10:00Z');
      const { settings, days } = wire(db);
      for (const id of [AN, BINH]) {
        const before = (await days.refreshMonth(id, '2026-11', { now: NOW })).find(r => r.workDate === '2026-11-03');
        assert.equal(before?.checkInStatus, 'VALID');
        assert.deepEqual(before?.cases, []);
      }

      const out = await settings.saveGroup('attendance', { effectiveMonth: '2026-11', values: { lateGraceMinutes: 10 }, stamp: 0 }, 'admin', NOW);
      assert.deepEqual(out.changed, ['lateGraceMinutes']);

      for (const id of [AN, BINH]) {
        assert.equal(await column(client, 'check_in_status', id, '2026-11-03'), 'LATE');
        const row = (await wire(db).daysRepo.listDays(id, '2026-11-03', '2026-11-03'))[0];
        assert.ok(row.cases.some(c => c.code === 'LATE_CHECK_IN'));
      }
    });
  });

  it('rebuilds every month from the effective month to the current one', async t => {
    await withTempDb(t, 'att_hook_months', async (db, client) => {
      await addStaff(client, 'an', AN);
      await punch(client, AN, '2026-10-05', '2026-10-05T01:12:00Z', '2026-10-05T10:10:00Z');
      await punch(client, AN, '2026-11-03', '2026-11-03T01:12:00Z', '2026-11-03T10:10:00Z');
      const { changes, days, repo } = wire(db);
      await days.refreshMonth(AN, '2026-10', { now: NOW });
      await days.refreshMonth(AN, '2026-11', { now: NOW });
      assert.equal(await column(client, 'check_in_status', AN, '2026-10-05'), 'VALID');
      // Ghi thẳng một phiên bản ân hạn 10 từ 2026-10 (tháng đã qua, màn hình không cho chọn), rồi báo như saveGroup sẽ báo.
      await repo.writeGroupVersion(db, 'attendance', '2026-10', { lateGraceMinutes: 10, diligenceLostFromDays: 3 }, META);
      await changes.notify({ kind: 'attendance', fromMonth: '2026-10', now: NOW });
      for (const date of ['2026-10-05', '2026-11-03']) {
        assert.equal(await column(client, 'check_in_status', AN, date), 'LATE', date);
      }
    });
  });

  it("re-statuses that person's Saturdays when a personal week without Saturday is saved", async t => {
    await withTempDb(t, 'att_hook_week', async (db, client) => {
      await addStaff(client, 'an', AN);
      await addStaff(client, 'binh', BINH);
      const { settings, days } = wire(db);
      for (const id of [AN, BINH]) await days.refreshMonth(id, '2026-11', { now: NOW });
      assert.equal(await column(client, 'status', AN, '2026-11-07'), 'ABSENT');
      assert.equal(await column(client, 'status', AN, '2026-11-14'), 'ABSENT');

      await settings.saveWorkWeek('an', { weekdays: [1, 2, 3, 4, 5], effectiveMonth: '2026-11', stamp: 0 }, 'admin', NOW);

      assert.equal(await column(client, 'status', AN, '2026-11-07'), 'REST');
      assert.equal(await column(client, 'status', AN, '2026-11-14'), 'REST');
      assert.equal(await column(client, 'status', AN, '2026-11-09'), 'ABSENT'); // thứ Hai vẫn là ngày làm
      assert.equal(await column(client, 'status', BINH, '2026-11-07'), 'ABSENT'); // người khác không bị đụng
    });
  });

  it('does nothing for a change that starts after the current month', async t => {
    await withTempDb(t, 'att_hook_future', async (db, client) => {
      await addStaff(client, 'an', AN);
      const { settings } = wire(db);
      await settings.saveGroup('attendance', { effectiveMonth: '2026-12', values: { lateGraceMinutes: 10 }, stamp: 0 }, 'admin', NOW);
      await settings.saveWorkWeek('an', { weekdays: [1, 2], effectiveMonth: '2027-01', stamp: 0 }, 'admin', NOW);
      const n = await client.query(`SELECT count(*) AS n FROM timesheet_entries`);
      assert.equal(Number(n.rows[0].n), 0);
    });
  });

  it('lets a listener error reach the caller while the setting stays saved', async t => {
    await withTempDb(t, 'att_hook_error', async (db, client) => {
      await addStaff(client, 'an', AN);
      const { settings, changes, port } = wire(db);
      changes.subscribe(async () => {
        throw new Error('nghe lỗi');
      });
      await assert.rejects(
        settings.saveGroup('attendance', { effectiveMonth: '2026-11', values: { lateGraceMinutes: 10 }, stamp: 0 }, 'admin', NOW),
        /nghe lỗi/
      );
      assert.equal(await port.graceMinutes('2026-11'), 10);
    });
  });
});

describe('SettingsService báo thay đổi sau khi commit', () => {
  it('notifies only for a changed attendance group or a saved work week, after commit', async t => {
    await withTempDb(t, 'att_notify', async (db, client) => {
      await addStaff(client, 'an', AN);
      const { settings, changes, reader } = wire(db);
      const seen: Array<{ change: SettingsChange; committedGrace: number }> = [];
      changes.subscribe(async change => {
        // Đọc bằng kết nối khác (không phải giao dịch của lần lưu): thấy giá trị mới nghĩa là đã commit.
        seen.push({ change, committedGrace: (await reader.settingsFor('2026-11', db)).attendance.lateGraceMinutes });
      });

      await settings.saveGroup('attendance', { effectiveMonth: '2026-11', values: { lateGraceMinutes: 10 }, stamp: 0 }, 'admin', NOW);
      assert.equal(seen.length, 1);
      assert.deepEqual(seen[0].change, { kind: 'attendance', fromMonth: '2026-11', now: NOW });
      assert.equal(seen[0].committedGrace, 10);

      // Lưu lại đúng giá trị cũ: không đổi gì thì không báo.
      const stamp = (await settings.getAll('2026-11', NOW)).groups.attendance.stamp;
      await settings.saveGroup('attendance', { effectiveMonth: '2026-11', values: { lateGraceMinutes: 10 }, stamp }, 'admin', NOW);
      assert.equal(seen.length, 1);

      // Nhóm khác không liên quan tới ngày công.
      await settings.saveGroup('overtime', { effectiveMonth: '2026-11', values: { weekdayRate: 1.6 }, stamp: 0 }, 'admin', NOW);
      assert.equal(seen.length, 1);

      await settings.saveWorkWeek('an', { weekdays: [1, 2, 3], effectiveMonth: '2026-12', stamp: 0 }, 'admin', NOW);
      assert.equal(seen.length, 2);
      assert.deepEqual(seen[1].change, { kind: 'workWeek', employeeUuid: AN, fromMonth: '2026-12', now: NOW });

      // Lưu bị từ chối (stamp cũ) thì không báo.
      await assert.rejects(settings.saveGroup('attendance', { effectiveMonth: '2026-11', values: { lateGraceMinutes: 12 }, stamp: 0 }, 'admin', NOW));
      assert.equal(seen.length, 2);
    });
  });
});

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Kysely } from 'kysely';
import type { Client } from 'pg';
import type { DB } from '../../src/database/schema';
import { TransactionCoordinator, type DatabaseTransaction } from '../../src/database/transaction';
import { AttendanceDaysRepository } from '../../src/modules/attendance/attendance-days.repository';
import { AttendanceDaysService, employeeLockKey } from '../../src/modules/attendance/attendance-days.service';
import { PositionTypeAttendanceSettings } from '../../src/modules/attendance/attendance-settings.port';
import { withTempDb } from './helpers/pg-temp-db';

// Cần PostgreSQL thật (PG_TEST_URL), xem helpers/pg-temp-db.ts.
const NV = '11111111-1111-4111-8111-111111111111';
const NV2 = '22222222-2222-4222-8222-222222222222';
const RESIGNED = '33333333-3333-4333-8333-333333333333';
const LOCKED_STAFF = '44444444-4444-4444-8444-444444444444';
const NOW = new Date('2026-11-30T12:00:00Z');

/** Bản ghi lại mọi khoá cố vấn được lấy, cả đường `withLock` lẫn đường `acquireAdvisoryLock` trực tiếp. */
class RecordingCoordinator extends TransactionCoordinator {
  readonly keys: string[] = [];
  override async acquireAdvisoryLock(trx: DatabaseTransaction, key: string): Promise<void> {
    this.keys.push(key);
    await super.acquireAdvisoryLock(trx, key);
  }
}

async function addStaff(
  client: Client,
  username: string,
  uuid: string,
  extra: { resignedOn?: string; lockedAt?: string } = {}
): Promise<void> {
  await client.query(
    `INSERT INTO staff (username, name, type, level, pass_hash, created_at, uuid, start_date, resigned_on, locked_at)
     VALUES ($1, $1, 'nv-test', 1, 'x', '2026-01-01', $2, '2026-01-05', $3, $4)`,
    [username, uuid, extra.resignedOn ?? null, extra.lockedAt ?? null]
  );
}

async function seed(client: Client): Promise<void> {
  const typeId = (
    await client.query(
      `INSERT INTO position_types (code, effective_month, name, workdays, flex_pct, night_pct, travel_pct,
         attendance_pct, regular_dows, makeup_dows, updated_by, updated_at)
       VALUES ('nv-test', '2000-01', 'NV', 26, 10, 30, 0, 0, '[1,2,3,4,5,6]', '[]', 'x', 'x') RETURNING id`
    )
  ).rows[0].id;
  await client.query(
    `INSERT INTO position_type_benefits (type_id, benefit, enabled) VALUES
       ($1, 'paidLeave', 1), ($1, 'paidHoliday', 1), ($1, 'isat', 0)`,
    [typeId]
  );
  await addStaff(client, 'nv', NV);
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

function build(db: Kysely<DB>) {
  const coordinator = new RecordingCoordinator(db);
  const service = new AttendanceDaysService(
    new AttendanceDaysRepository(db),
    new PositionTypeAttendanceSettings(db),
    coordinator
  );
  return { coordinator, service };
}

async function count(client: Client, employeeId?: string): Promise<number> {
  const result = employeeId
    ? await client.query(`SELECT count(*) AS n FROM timesheet_entries WHERE employee_id = $1`, [employeeId])
    : await client.query(`SELECT count(*) AS n FROM timesheet_entries`);
  return Number(result.rows[0].n);
}

describe('AttendanceDaysService.refreshDays trên PostgreSQL', () => {
  it('creates the day row from the punches and reads it back', async t => {
    await withTempDb(t, 'att_svc_create', async (db, client) => {
      await seed(client);
      await punch(client, NV, '2026-11-03', '2026-11-03T01:05:00Z', '2026-11-03T10:10:00Z');
      const { service } = build(db);
      const rows = await service.refreshDays(NV, ['2026-11-03'], { now: NOW });
      assert.equal(rows.length, 1);
      assert.equal(rows[0].workDate, '2026-11-03');
      assert.equal(rows[0].status, 'PRESENT');
      assert.equal(rows[0].payUnits, 1);
      const stored = await client.query(`SELECT status, pay_units FROM timesheet_entries WHERE employee_id = $1`, [NV]);
      assert.equal(stored.rows.length, 1);
      assert.equal(stored.rows[0].status, 'PRESENT');
      assert.equal(Number(stored.rows[0].pay_units), 1);
    });
  });

  it('takes the shared employee lock, with and without a caller transaction', async t => {
    await withTempDb(t, 'att_svc_lock', async (db, client) => {
      await seed(client);
      const { coordinator, service } = build(db);
      assert.equal(employeeLockKey(NV), `requests_${NV}`);

      await service.refreshDays(NV, ['2026-11-03'], { now: NOW });
      assert.deepEqual(coordinator.keys, [`requests_${NV}`]);

      await coordinator.run(async trx => {
        await service.refreshDays(NV, ['2026-11-04'], { trx, now: NOW });
      });
      assert.deepEqual(coordinator.keys, [`requests_${NV}`, `requests_${NV}`]);
    });
  });

  it('dedups dates and returns [] for an empty list without taking a lock', async t => {
    await withTempDb(t, 'att_svc_dedup', async (db, client) => {
      await seed(client);
      const { coordinator, service } = build(db);
      const rows = await service.refreshDays(NV, ['2026-11-04', '2026-11-03', '2026-11-04'], { now: NOW });
      assert.deepEqual(
        rows.map(r => r.workDate),
        ['2026-11-03', '2026-11-04']
      );
      assert.equal(await count(client, NV), 2);

      coordinator.keys.length = 0;
      assert.deepEqual(await service.refreshDays(NV, [], { now: NOW }), []);
      assert.deepEqual(coordinator.keys, []);
    });
  });

  it('leaves a locked row alone and returns its stored value', async t => {
    await withTempDb(t, 'att_svc_locked', async (db, client) => {
      await seed(client);
      await punch(client, NV, '2026-11-03', '2026-11-03T01:05:00Z', '2026-11-03T10:10:00Z');
      const { service } = build(db);
      await service.refreshDays(NV, ['2026-11-03'], { now: NOW });
      await client.query(`UPDATE timesheet_entries SET is_locked = true WHERE employee_id = $1`, [NV]);
      await client.query(`DELETE FROM punch_events WHERE employee_id = $1`, [NV]);

      const rows = await service.refreshDays(NV, ['2026-11-03'], { now: NOW });
      assert.equal(rows.length, 1);
      assert.equal(rows[0].isLocked, true);
      assert.equal(rows[0].status, 'PRESENT');
      assert.equal(rows[0].payUnits, 1);
    });
  });

  it('refreshMonth writes one row per day and marks the non-work days REST', async t => {
    await withTempDb(t, 'att_svc_month', async (db, client) => {
      await seed(client);
      const { service } = build(db);
      const rows = await service.refreshMonth(NV, '2026-11', { now: NOW });
      assert.equal(rows.length, 30);
      assert.equal(await count(client, NV), 30);
      const rest = rows.filter(r => r.status === 'REST').map(r => r.workDate);
      assert.deepEqual(rest, ['2026-11-01', '2026-11-08', '2026-11-15', '2026-11-22', '2026-11-29']);
    });
  });

  it('runs on the caller transaction: a later throw rolls everything back', async t => {
    await withTempDb(t, 'att_svc_trx', async (db, client) => {
      await seed(client);
      const { coordinator, service } = build(db);
      await assert.rejects(
        coordinator.run(async trx => {
          const rows = await service.refreshDays(NV, ['2026-11-03', '2026-11-04'], { trx, now: NOW });
          assert.equal(rows.length, 2);
          throw new Error('lùi giao dịch');
        }),
        /lùi giao dịch/
      );
      assert.equal(await count(client), 0);
    });
  });
});

describe('AttendanceDaysService.refreshDateForAll trên PostgreSQL', () => {
  it('writes only active people, each in its own transaction, and counts them', async t => {
    await withTempDb(t, 'att_svc_all', async (db, client) => {
      await seed(client);
      await addStaff(client, 'nv2', NV2);
      await addStaff(client, 'nghi', RESIGNED, { resignedOn: '2026-10-31' });
      await addStaff(client, 'khoa', LOCKED_STAFF, { lockedAt: '2026-10-01' });
      const { service } = build(db);

      assert.equal(await service.refreshDateForAll('2026-11-03', { now: NOW }), 2);
      const owners = await client.query(`SELECT DISTINCT employee_id FROM timesheet_entries ORDER BY employee_id`);
      assert.deepEqual(
        owners.rows.map(r => r.employee_id),
        [NV, NV2]
      );
      assert.equal(await count(client), 2);
    });
  });
});

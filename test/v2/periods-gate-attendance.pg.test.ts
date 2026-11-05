import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Kysely } from 'kysely';
import type { Client } from 'pg';
import type { DB } from '../../src/database/schema';
import { TransactionCoordinator } from '../../src/database/transaction';
import { AttendanceRepository } from '../../src/modules/attendance/attendance.repository';
import { AttendanceService } from '../../src/modules/attendance/attendance.service';
import { PeriodGate } from '../../src/modules/periods/period-gate';
import { PeriodLockedError } from '../../src/modules/periods/periods.errors';
import { PeriodsRepository } from '../../src/modules/periods/periods.repository';
import { withTempDb } from './helpers/pg-temp-db';

const EMPLOYEE = '6f1d2a40-3b7e-4c55-9a10-5d3c2b1a0e01';

async function fixture(db: Kysely<DB>, client: Client): Promise<AttendanceService> {
  await client.query(
    `INSERT INTO staff (username, name, type, level, pass_hash, created_at, contract, uuid)
     VALUES ('gate-user', 'Nhân viên cổng', 'nv', 1, 'x', $1, 'long', $2)`,
    [new Date().toISOString(), EMPLOYEE]
  );
  await client.query(`INSERT INTO payroll_periods (month, status) VALUES ('2026-10', 'attendance_locked')`);
  return new AttendanceService(new AttendanceRepository(db), new TransactionCoordinator(db), new PeriodGate(new PeriodsRepository(db)));
}

const count = async (client: Client, table: string): Promise<number> =>
  Number((await client.query(`SELECT count(*) AS n FROM ${table}`)).rows[0].n);

test('a punch on a day of a locked month is refused and writes nothing', async t => {
  await withTempDb(t, 'gate_punch', async (db, client) => {
    const service = await fixture(db, client);
    await assert.rejects(
      service.recordPunch({ employeeId: EMPLOYEE, type: 'IN', workDate: '2026-10-20' }),
      (e: any) => e instanceof PeriodLockedError && e.status === 409 && e.details.code === 'PERIOD_LOCKED' && e.details.month === '2026-10'
    );
    assert.equal(await count(client, 'punch_events'), 0);
    assert.equal(await count(client, 'work_schedules'), 0);
    assert.equal(await count(client, 'timesheet_entries'), 0);
  });
});

test('a punch in an open month still works', async t => {
  await withTempDb(t, 'gate_open', async (db, client) => {
    const service = await fixture(db, client);
    const result = await service.recordPunch({ employeeId: EMPLOYEE, type: 'IN', workDate: '2026-11-03' });
    assert.equal(result.punch.type, 'IN');
    assert.equal(await count(client, 'punch_events'), 1);
  });
});

test('a malformed workDate cannot slip past the gate of a locked month', async t => {
  await withTempDb(t, 'gate_baddate', async (db, client) => {
    const service = await fixture(db, client);
    // Ngày 20/10 đã có lịch, lượt chấm và bảng công từ lúc tháng còn mở; rồi Chốt công.
    await client.query(`UPDATE payroll_periods SET status = 'open' WHERE month = '2026-10'`);
    await service.recordPunch({ employeeId: EMPLOYEE, type: 'IN', workDate: '2026-10-20', punchedAt: '2026-10-20T01:00:00Z' });
    await client.query(`UPDATE payroll_periods SET status = 'attendance_locked' WHERE month = '2026-10'`);
    const sheet = () => client.query('SELECT * FROM timesheet_entries ORDER BY id').then(r => r.rows);
    const before = await sheet();

    // PG đọc '20261020' thành 20/10, còn tháng cắt ra cho cổng kỳ là '2026102' (coi như 'open').
    for (const workDate of ['20261020', ' 2026-10-20']) {
      await assert.rejects(service.recalculateTimesheet(EMPLOYEE, workDate), (e: any) => e.status === 400 && e.details.code === 'INVALID_DATE');
      await assert.rejects(service.recordPunch({ employeeId: EMPLOYEE, type: 'OUT', workDate }), /Ngày công \(workDate\) không hợp lệ/);
    }
    assert.deepEqual(await sheet(), before);
    assert.equal(await count(client, 'punch_events'), 1);
  });
});

test('recalculating a day of a locked month is refused', async t => {
  await withTempDb(t, 'gate_recalc', async (db, client) => {
    const service = await fixture(db, client);
    await assert.rejects(
      service.recalculateTimesheet(EMPLOYEE, '2026-10-20'),
      (e: any) => e instanceof PeriodLockedError && e.details.code === 'PERIOD_LOCKED' && e.details.month === '2026-10'
    );
  });
});

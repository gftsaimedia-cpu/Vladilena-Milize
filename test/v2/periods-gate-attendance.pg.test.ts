import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Kysely } from 'kysely';
import type { Client } from 'pg';
import type { DB } from '../../src/database/schema';
import { TransactionCoordinator } from '../../src/database/transaction';
import { AttendanceRepository } from '../../src/modules/attendance/attendance.repository';
import { AttendanceService } from '../../src/modules/attendance/attendance.service';
import { AttendanceDaysRepository } from '../../src/modules/attendance/attendance-days.repository';
import { AttendanceDaysService } from '../../src/modules/attendance/attendance-days.service';
import { SettingsAttendanceSettings } from '../../src/modules/attendance/attendance-settings.port';
import { SettingsReader } from '../../src/modules/settings/settings-reader';
import { SettingsRepository } from '../../src/modules/settings/settings.repository';
import { PeriodGate } from '../../src/modules/periods/period-gate';
import { PeriodLockedError } from '../../src/modules/periods/periods.errors';
import { PeriodsRepository } from '../../src/modules/periods/periods.repository';
import { withTempDb } from './helpers/pg-temp-db';

const EMPLOYEE = '6f1d2a40-3b7e-4c55-9a10-5d3c2b1a0e01';
/** Ca đêm 22:00–07:00: lần ra sáng sớm thuộc ngày bắt đầu ca (L21). */
const NIGHT = '6f1d2a40-3b7e-4c55-9a10-5d3c2b1a0e02';

// Dòng ngày công dựng từ loại nhân sự (loại 'nv' có sẵn trong schema.sql: tuần T2–T7, quyền lợi) và ca mặc định của hồ sơ.
async function fixture(db: Kysely<DB>, client: Client): Promise<AttendanceService> {
  await client.query(
    `INSERT INTO staff (username, name, type, level, pass_hash, created_at, contract, uuid, start_date)
     VALUES ('gate-user', 'Nhân viên cổng', 'nv', 1, 'x', $1, 'long', $2, '2026-01-05')`,
    [new Date().toISOString(), EMPLOYEE]
  );
  await client.query(
    `INSERT INTO staff (username, name, type, level, pass_hash, created_at, contract, uuid, start_date,
       shift_type, shift_start_time, shift_end_time, shift_allowance_pct)
     VALUES ('gate-night', 'Nhân viên ca đêm', 'nv', 1, 'x', $1, 'long', $2, '2026-01-05', 'NIGHT', '22:00', '07:00', 30)`,
    [new Date().toISOString(), NIGHT]
  );
  await client.query(`INSERT INTO payroll_periods (month, status) VALUES ('2026-10', 'attendance_locked')`);
  const coordinator = new TransactionCoordinator(db);
  const days = new AttendanceDaysService(
    new AttendanceDaysRepository(db),
    new SettingsAttendanceSettings(new SettingsReader(new SettingsRepository(db))),
    coordinator
  );
  return new AttendanceService(
    new AttendanceRepository(db),
    days,
    undefined,
    coordinator,
    new PeriodGate(new PeriodsRepository(db))
  );
}

const count = async (client: Client, table: string): Promise<number> =>
  Number((await client.query(`SELECT count(*) AS n FROM ${table}`)).rows[0].n);

test('a punch on a day of a locked month is refused and writes nothing', async t => {
  await withTempDb(t, 'gate_punch', async (db, client) => {
    const service = await fixture(db, client);
    await assert.rejects(
      service.recordPunch({ employeeId: EMPLOYEE, type: 'IN', workDate: '2026-10-20' }),
      (e: any) => e instanceof PeriodLockedError && e.status === 409 && e.details?.code === 'PERIOD_LOCKED' && e.details?.month === '2026-10'
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
      await assert.rejects(service.recalculateTimesheet(EMPLOYEE, workDate), (e: any) => e.status === 400 && e.details?.code === 'INVALID_DATE');
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
      (e: any) => e instanceof PeriodLockedError && e.details?.code === 'PERIOD_LOCKED' && e.details?.month === '2026-10'
    );
  });
});

test('recalculating a whole month of a locked month is refused and writes nothing', async t => {
  await withTempDb(t, 'gate_recalc_month', async (db, client) => {
    const service = await fixture(db, client);
    await assert.rejects(
      service.recalculateMonth(EMPLOYEE, '2026-10'),
      (e: any) => e instanceof PeriodLockedError && e.status === 409 && e.details?.month === '2026-10'
    );
    assert.equal(await count(client, 'timesheet_entries'), 0);
    // Tháng còn mở thì vẫn tính lại được.
    const rows = await service.recalculateMonth(EMPLOYEE, '2026-11');
    assert.equal(rows.length, 30);
  });
});

// Cổng kỳ xét tháng của NGÀY CÔNG, không phải ngày của lần chấm: ca đêm 31/10 ra lúc 05:00 ngày 01/11 thuộc tháng 10.
test('a night OUT on the 1st of an open month that belongs to a locked previous month is refused', async t => {
  await withTempDb(t, 'gate_night_out', async (db, client) => {
    const service = await fixture(db, client);
    // Vào ca đêm 31/10 lúc tháng 10 còn mở, rồi Chốt công tháng 10.
    await client.query(`UPDATE payroll_periods SET status = 'open' WHERE month = '2026-10'`);
    const inPunch = await service.recordPunch({ employeeId: NIGHT, type: 'IN', punchedAt: new Date('2026-10-31T21:55:00+07:00') });
    assert.equal(inPunch.timesheet.workDate, '2026-10-31');
    await client.query(`UPDATE payroll_periods SET status = 'attendance_locked' WHERE month = '2026-10'`);
    const sheet = () => client.query('SELECT * FROM timesheet_entries ORDER BY id').then(r => r.rows);
    const before = await sheet();

    await assert.rejects(
      service.recordPunch({ employeeId: NIGHT, type: 'OUT', punchedAt: new Date('2026-11-01T05:00:00+07:00') }),
      (e: any) =>
        e instanceof PeriodLockedError && e.status === 409 && e.details?.code === 'PERIOD_LOCKED' &&
        e.details?.month === '2026-10' && e.details?.status === 'attendance_locked'
    );
    assert.equal(await count(client, 'punch_events'), 1);
    assert.deepEqual(await sheet(), before);

    // Cùng lúc đó, một lần vào ngày 02/11 (tháng 11 còn mở) vẫn được ghi.
    const ok = await service.recordPunch({ employeeId: EMPLOYEE, type: 'IN', punchedAt: new Date('2026-11-02T08:00:00+07:00') });
    assert.equal(ok.timesheet.workDate, '2026-11-02');
    assert.equal(await count(client, 'punch_events'), 2);
  });
});

// Mặt kia của luật trên: tháng 10 còn mở thì lần ra 05:00 ngày 01/11 được ghi vào ngày 31/10, dù tháng 11 đã chốt.
test('a night OUT on the 1st of a locked month that belongs to an open previous month is recorded', async t => {
  await withTempDb(t, 'gate_night_out_open', async (db, client) => {
    const service = await fixture(db, client);
    await client.query(`UPDATE payroll_periods SET status = 'open' WHERE month = '2026-10'`);
    await service.recordPunch({ employeeId: NIGHT, type: 'IN', punchedAt: new Date('2026-10-31T21:55:00+07:00') });
    await client.query(`INSERT INTO payroll_periods (month, status) VALUES ('2026-11', 'attendance_locked')`);

    const out = await service.recordPunch({ employeeId: NIGHT, type: 'OUT', punchedAt: new Date('2026-11-01T05:00:00+07:00') });
    assert.equal(out.punch.workDate, '2026-10-31');
    assert.equal(out.timesheet.workDate, '2026-10-31');
    assert.equal(await count(client, 'punch_events'), 2);
  });
});

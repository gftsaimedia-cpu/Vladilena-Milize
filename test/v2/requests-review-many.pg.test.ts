// Duyệt nhiều đơn: duyệt tuần tự theo thứ tự ids, mỗi đơn một giao dịch; phiếu lương tính lại một lần cho mỗi
// (người, tháng) sau cả lô. Đơn lỗi vào failed, không kéo các đơn khác.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Kysely } from 'kysely';
import type { Client } from 'pg';
import { TransactionCoordinator } from '../../src/database/transaction';
import type { DB } from '../../src/database/schema';
import { AttendanceRepository } from '../../src/modules/attendance/attendance.repository';
import { AttendanceDaysRepository } from '../../src/modules/attendance/attendance-days.repository';
import { AttendanceDaysService } from '../../src/modules/attendance/attendance-days.service';
import { SettingsAttendanceSettings } from '../../src/modules/attendance/attendance-settings.port';
import { AuditLog } from '../../src/modules/audit/audit-log';
import { AuditRepository } from '../../src/modules/audit/audit.repository';
import { HolidaysRepository } from '../../src/modules/holidays/holidays.repository';
import { PayrollRepository } from '../../src/modules/payroll/payroll.repository';
import { PayrollService } from '../../src/modules/payroll/payroll.service';
import { PeriodGate } from '../../src/modules/periods/period-gate';
import { PeriodsRepository } from '../../src/modules/periods/periods.repository';
import { PeriodsService } from '../../src/modules/periods/periods.service';
import { DayStatusRepository } from '../../src/modules/requests/day-status.repository';
import { ExplanationRemindersRepository } from '../../src/modules/requests/explanation-reminders.repository';
import { ExplanationsService } from '../../src/modules/requests/explanations.service';
import { RequestsRepository } from '../../src/modules/requests/requests.repository';
import { RequestsService } from '../../src/modules/requests/requests.service';
import { SettingsReader } from '../../src/modules/settings/settings-reader';
import { SettingsRepository } from '../../src/modules/settings/settings.repository';
import { withTempDb } from './helpers/pg-temp-db';

const MONTH = '2026-10';
const NOW = () => new Date('2026-11-05T09:00:00+07:00');
const U1 = '0a1b2c3d-0000-4000-8000-000000000001';
const U2 = '0a1b2c3d-0000-4000-8000-000000000002';

async function build(db: Kysely<DB>, client: Client) {
  await client.query(
    `INSERT INTO staff (username, name, type, level, pass_hash, created_at, contract, uuid, locked_at)
     VALUES ('pg-user', 'Nhân viên PG', 'nv', 1, 'x', $1, 'long', '${U1}', NULL),
            ('pg-user-2', 'Nhân viên PG 2', 'nv', 1, 'x', $1, 'long', '${U2}', NULL),
            ('admin-username', 'Quản trị PG', 'nv', 1, 'x', $1, 'long', 'admin-uuid', $1)`,
    [new Date().toISOString()]
  );
  const tx = new TransactionCoordinator(db);
  const periodsRepo = new PeriodsRepository(db);
  const periods = new PeriodsService(periodsRepo, tx, new AuditLog(new AuditRepository(), new TransactionCoordinator(db)));
  periods.now = NOW;
  const days = new AttendanceDaysService(new AttendanceDaysRepository(db), new SettingsAttendanceSettings(new SettingsReader(new SettingsRepository(db))), tx);
  const payroll = new PayrollService(new PayrollRepository(db), undefined, days, tx, periods);
  const gate = new PeriodGate(periodsRepo);
  const explanations = new ExplanationsService(
    new RequestsRepository(db),
    new AttendanceRepository(db),
    new HolidaysRepository(db),
    new DayStatusRepository(db),
    new ExplanationRemindersRepository(db),
    gate
  );
  explanations.now = NOW;
  const service = new RequestsService(
    new RequestsRepository(db),
    new AttendanceRepository(db),
    tx,
    new HolidaysRepository(db),
    new DayStatusRepository(db),
    gate,
    payroll,
    explanations,
    undefined,
    undefined,
    days
  );
  service.now = NOW;
  return { service, payroll, periods };
}

const explanation = (employeeId: string, workDate: string) => ({
  employeeId,
  reason: 'Quên chấm công',
  workDate,
  actualCheckIn: '08:00',
  actualCheckOut: '17:00'
});

const runs = async (client: Client) => Number((await client.query('SELECT count(*) AS n FROM payroll_runs WHERE month = $1', [MONTH])).rows[0].n);

test('approveMany approves in order and recalculates once per person and month', { timeout: 60_000 }, async t => {
  await withTempDb(t, 'req_review_many', async (db, client) => {
    const { service, payroll, periods } = await build(db, client);
    await periods.lock(MONTH, 'admin');
    await payroll.calculatePeriodPayslips(MONTH, undefined, 'admin');
    await payroll.decidePayslip(MONTH, 'pg-user', 'approved', 'checker', 'ok');
    await payroll.decidePayslip(MONTH, 'pg-user-2', 'approved', 'checker', 'ok');
    const a = await service.createExplanationRequest(explanation('pg-user', '2026-10-28'));
    const b = await service.createExplanationRequest(explanation('pg-user', '2026-10-29'));
    const c = await service.createExplanationRequest(explanation('pg-user-2', '2026-10-29'));
    const before = await runs(client);

    const out = await service.approveMany([a.id, b.id, c.id], 'admin-username');

    assert.deepEqual(out.done.map(r => r.id), [a.id, b.id, c.id]);
    assert.ok(out.done.every(r => r.status === 'APPROVED' && r.reviewedBy === 'admin-uuid'));
    assert.deepEqual(out.failed, []);
    assert.deepEqual(out.recalculated, [
      { employeeId: U1, month: MONTH, ok: true },
      { employeeId: U2, month: MONTH, ok: true }
    ]);
    assert.equal(await runs(client), before + 2, 'two people, two partial runs: not one per request');
  });
});

test('approveMany reports requests that cannot be approved and still approves the rest', { timeout: 60_000 }, async t => {
  await withTempDb(t, 'req_review_many_fail', async (db, client) => {
    const { service } = await build(db, client);
    const ok = await service.createExplanationRequest(explanation('pg-user', '2026-10-28'));
    const done = await service.createExplanationRequest(explanation('pg-user', '2026-10-29'));
    await service.reviewRequest(done.id, 'admin-username', 'APPROVE');
    const missing = '0a1b2c3d-0000-4000-8000-0000000000ff';

    const out = await service.approveMany([done.id, missing, ok.id], 'admin-username');

    assert.deepEqual(out.done.map(r => r.id), [ok.id]);
    assert.deepEqual(out.failed.map(f => [f.id, f.code]), [
      [done.id, 'BAD_REQUEST'],
      [missing, 'REQUEST_NOT_FOUND']
    ]);
    assert.match(out.failed[0].message, /PENDING/);
    assert.deepEqual(out.recalculated, [], 'no month is calculated, so nothing to recalculate');
  });
});

test('approveMany puts a request of a locked month into failed with PERIOD_LOCKED', { timeout: 60_000 }, async t => {
  await withTempDb(t, 'req_review_many_locked', async (db, client) => {
    const { service } = await build(db, client);
    const req = await service.createExplanationRequest(explanation('pg-user', '2026-10-28'));
    await client.query(`INSERT INTO payroll_periods (month, status) VALUES ($1, 'approved')`, [MONTH]);

    const out = await service.approveMany([req.id], 'admin-username');

    assert.deepEqual(out.done, []);
    assert.deepEqual(out.failed.map(f => [f.id, f.code]), [[req.id, 'PERIOD_LOCKED']]);
  });
});

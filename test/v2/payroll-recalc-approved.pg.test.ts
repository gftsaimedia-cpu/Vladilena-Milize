// Ghim hành vi đã chốt (05/11, xác nhận lại 06/11): tính lại từng phần một phiếu đã Duyệt thì phiếu đó về Nháp và
// duyệt lại được; phiếu của người khác giữ nguyên quyết định. Không có mã PAYSLIP_APPROVED và không có route bỏ duyệt
// từng phiếu. Kỳ đã phê duyệt hay đã trả vẫn bị chặn ở cấp kỳ (PayrollFinalizedError).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Kysely } from 'kysely';
import type { Client } from 'pg';
import { TransactionCoordinator } from '../../src/database/transaction';
import type { DB } from '../../src/database/schema';
import { AttendanceDaysRepository } from '../../src/modules/attendance/attendance-days.repository';
import { AttendanceDaysService } from '../../src/modules/attendance/attendance-days.service';
import { SettingsAttendanceSettings } from '../../src/modules/attendance/attendance-settings.port';
import { AuditLog } from '../../src/modules/audit/audit-log';
import { AuditRepository } from '../../src/modules/audit/audit.repository';
import { PayrollFinalizedError } from '../../src/modules/payroll/payroll.errors';
import { PayrollRepository } from '../../src/modules/payroll/payroll.repository';
import { PayrollService } from '../../src/modules/payroll/payroll.service';
import { PeriodsRepository } from '../../src/modules/periods/periods.repository';
import { PeriodsService } from '../../src/modules/periods/periods.service';
import { SettingsReader } from '../../src/modules/settings/settings-reader';
import { SettingsRepository } from '../../src/modules/settings/settings.repository';
import { withTempDb } from './helpers/pg-temp-db';

const MONTH = '2026-10';

async function build(db: Kysely<DB>, client: Client) {
  await client.query(
    `INSERT INTO staff (username, name, type, level, pass_hash, created_at, contract, uuid)
     VALUES ('pg-user', 'Nhân viên PG', 'nv', 1, 'x', $1, 'long', 'pg-uuid-1'),
            ('pg-user-2', 'Nhân viên PG 2', 'nv', 1, 'x', $1, 'long', 'pg-uuid-2')`,
    [new Date().toISOString()]
  );
  const tx = new TransactionCoordinator(db);
  const periods = new PeriodsService(new PeriodsRepository(db), tx, new AuditLog(new AuditRepository(), new TransactionCoordinator(db)));
  periods.now = () => new Date('2026-11-01T08:00:00+07:00');
  const days = new AttendanceDaysService(
    new AttendanceDaysRepository(db),
    new SettingsAttendanceSettings(new SettingsReader(new SettingsRepository(db))),
    tx
  );
  return { payroll: new PayrollService(new PayrollRepository(db), undefined, days, tx, periods), periods };
}

const slipOf = async (client: Client, username: string) =>
  (await client.query('SELECT status, decided_by, decided_at, note FROM payslips WHERE username = $1 ORDER BY id DESC LIMIT 1', [username])).rows[0];

test('a partial recalculation sends an approved payslip back to draft and leaves the others decided', async t => {
  await withTempDb(t, 'payroll_recalc', async (db, client) => {
    const { payroll, periods } = await build(db, client);
    await periods.lock(MONTH, 'admin');
    await payroll.calculatePeriodPayslips(MONTH, undefined, 'admin');
    await payroll.decidePayslip(MONTH, 'pg-user', 'approved', 'admin', 'ok');
    await payroll.decidePayslip(MONTH, 'pg-user-2', 'approved', 'admin', 'ok');

    const result = await payroll.calculatePeriodPayslips(MONTH, ['pg-uuid-1'], 'admin');
    assert.deepEqual(result.errors, [], 'an approved payslip is recalculated, not refused');
    assert.equal(result.items.length, 1);

    const redone = await slipOf(client, 'pg-user');
    assert.equal(redone.status, 'draft');
    assert.equal(redone.decided_by, null);
    assert.equal(redone.decided_at, null);
    assert.equal(redone.note, null);
    const kept = await slipOf(client, 'pg-user-2');
    assert.equal(kept.status, 'approved');
    assert.equal(kept.decided_by, 'admin');
    assert.equal(kept.note, 'ok');

    // Duyệt lại được.
    const again = await payroll.decidePayslip(MONTH, 'pg-user', 'approved', 'admin', 'ok lần hai');
    assert.equal(again?.status, 'approved');
  });
});

test('an approved period still refuses a recalculation of any payslip', async t => {
  await withTempDb(t, 'payroll_recalc_final', async (db, client) => {
    const { payroll, periods } = await build(db, client);
    await periods.lock(MONTH, 'admin');
    await payroll.calculatePeriodPayslips(MONTH, undefined, 'admin');
    await payroll.decidePayslip(MONTH, 'pg-user', 'approved', 'admin', 'ok');
    await client.query("UPDATE payroll_periods SET status = 'approved' WHERE month = $1", [MONTH]);

    await assert.rejects(payroll.calculatePeriodPayslips(MONTH, ['pg-uuid-1'], 'admin'), PayrollFinalizedError);
    assert.equal((await slipOf(client, 'pg-user')).status, 'approved');
  });
});

// payroll.calculate / payroll.decide / kpi.score ghi nhật ký trong cùng transaction với phần lương được ghi
// (spec audit-log mục 6). Thao tác bị từ chối, không lưu gì hoặc không đổi gì thì không ghi dòng nào.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Kysely } from 'kysely';
import type { Client } from 'pg';
import type { DB } from '../../src/database/schema';
import { AttendanceDaysRepository } from '../../src/modules/attendance/attendance-days.repository';
import { AttendanceDaysService } from '../../src/modules/attendance/attendance-days.service';
import { SettingsAttendanceSettings } from '../../src/modules/attendance/attendance-settings.port';
import type { AuditLog } from '../../src/modules/audit/audit-log';
import { PayrollRepository } from '../../src/modules/payroll/payroll.repository';
import { PayrollService } from '../../src/modules/payroll/payroll.service';
import { PeriodsRepository } from '../../src/modules/periods/periods.repository';
import { PeriodsService } from '../../src/modules/periods/periods.service';
import { SettingsReader } from '../../src/modules/settings/settings-reader';
import { SettingsRepository } from '../../src/modules/settings/settings.repository';
import { auditKit } from './helpers/audit-pg';
import { withTempDb } from './helpers/pg-temp-db';

const MONTH = '2026-10';

// Hai nhân sự nv bậc 1, uuid khác tên đăng nhập như DB thật. Ngày hiện tại cố định sau tháng 10 để Chốt công được.
async function setup(db: Kysely<DB>, client: Client) {
  await client.query(
    `INSERT INTO staff (username, name, type, level, pass_hash, created_at, contract, uuid)
     VALUES ('pg-user', 'Nhân viên PG', 'nv', 1, 'x', $1, 'long', 'pg-uuid-1'),
            ('pg-user-2', 'Nhân viên PG 2', 'nv', 1, 'x', $1, 'long', 'pg-uuid-2')`,
    [new Date().toISOString()]
  );
  const kit = auditKit(db);
  const periods = new PeriodsService(new PeriodsRepository(db), kit.tx, kit.log);
  periods.now = () => new Date('2026-11-01T08:00:00+07:00');
  // Phiếu dựng từ dòng ngày công (attendance-core T6): bảng lương ghi lại dòng của tháng rồi đọc chúng.
  const days = new AttendanceDaysService(
    new AttendanceDaysRepository(db),
    new SettingsAttendanceSettings(new SettingsReader(new SettingsRepository(db))),
    kit.tx
  );
  const make = (log: AuditLog) => new PayrollService(new PayrollRepository(db), undefined, days, kit.tx, periods, log);
  // Nhật ký kỳ (period.lock…) do module kỳ lương ghi; ở đây chỉ xem ba mã của lương.
  const payrollRows = async () => (await kit.rows()).filter(r => !r.action.startsWith('period.'));
  return { ...kit, periods, svc: make(kit.log), failing: make(kit.failingLog), payrollRows };
}

const plain = (r: { requestId: unknown }) => ({ ...r, requestId: undefined });

const calcRow = (actor: string, before: unknown, after: unknown) => ({
  actor,
  action: 'payroll.calculate',
  entityKind: 'period',
  entityId: MONTH,
  subject: null,
  month: MONTH,
  before,
  after,
  reason: null,
  sensitivity: 'normal',
  requestId: undefined
});

test('payroll.calculate records every stored run: number, payslips, errors and who was recalculated', async t => {
  await withTempDb(t, 'audit_payroll', async (db, client) => {
    const { svc, periods, payrollRows, verify } = await setup(db, client);
    await periods.lock(MONTH, 'admin');

    await svc.calculatePeriodPayslips(MONTH, undefined, 'admin');
    await svc.calculatePeriodPayslips(MONTH, ['pg-uuid-1'], 'admin2');

    const written = await payrollRows();
    assert.deepEqual(written.map(plain), [
      calcRow('admin', null, { run: 1, slips: 2, errors: 0 }),
      calcRow('admin2', { run: 1 }, { run: 2, slips: 2, errors: 0, people: ['pg-user'] })
    ]);
    assert.match(String(written[0].requestId), /^[0-9a-f-]{36}$/);
    assert.deepEqual(await verify(), { ok: true, checked: 3, firstBadId: null, reason: null });
  });
});

test('a calculation that stores no run writes no row', async t => {
  await withTempDb(t, 'audit_payroll', async (db, client) => {
    const { svc, payrollRows } = await setup(db, client);
    const result = await svc.calculatePeriodPayslips(MONTH, ['khong-co-ai'], 'admin');
    assert.equal(result.runId, null);
    assert.equal((await payrollRows()).length, 0);
  });
});

test('when the audit write fails, the run is rolled back and the period does not move', async t => {
  await withTempDb(t, 'audit_payroll', async (db, client) => {
    const { failing, periods, payrollRows } = await setup(db, client);
    await periods.lock(MONTH, 'admin');

    await assert.rejects(failing.calculatePeriodPayslips(MONTH, undefined, 'admin'), /audit boom/);

    const runs = await client.query('SELECT id FROM payroll_runs WHERE month = $1', [MONTH]);
    assert.equal(runs.rows.length, 0);
    assert.equal((await periods.snapshot(MONTH)).status, 'attendance_locked');
    assert.equal((await payrollRows()).length, 0);
  });
});

const decideRow = (before: string, after: string, reason: string | null) => ({
  actor: 'admin',
  action: 'payroll.decide',
  entityKind: 'payslip',
  entityId: 'pg-user',
  subject: 'pg-user',
  month: MONTH,
  before: { status: before },
  after: { status: after },
  reason,
  sensitivity: 'normal',
  requestId: undefined
});

test('payroll.decide records each decision with its note; repeating the same decision writes nothing', async t => {
  await withTempDb(t, 'audit_payroll', async (db, client) => {
    const { svc, periods, payrollRows, verify } = await setup(db, client);
    await periods.lock(MONTH, 'admin');
    await svc.calculatePeriodPayslips(MONTH, undefined, 'admin');

    await svc.decidePayslip(MONTH, 'pg-user', 'approved', 'admin');
    await svc.decidePayslip(MONTH, 'pg-user', 'rejected', 'admin', ' Thiếu điểm KPI ');
    await svc.decidePayslip(MONTH, 'pg-user', 'rejected', 'admin', 'Thiếu điểm KPI');
    assert.equal(await svc.decidePayslip(MONTH, 'khong-co-ai', 'approved', 'admin'), null);

    const decided = (await payrollRows()).filter(r => r.action === 'payroll.decide');
    assert.deepEqual(decided.map(plain), [
      decideRow('draft', 'approved', null),
      decideRow('approved', 'rejected', 'Thiếu điểm KPI')
    ]);
    assert.equal((await verify()).ok, true);
  });
});

test('when the audit write fails, the decision is rolled back', async t => {
  await withTempDb(t, 'audit_payroll', async (db, client) => {
    const { svc, failing, periods, payrollRows } = await setup(db, client);
    await periods.lock(MONTH, 'admin');
    await svc.calculatePeriodPayslips(MONTH, undefined, 'admin');

    await assert.rejects(failing.decidePayslip(MONTH, 'pg-user', 'approved', 'admin', 'ok'), /audit boom/);

    const slip = await svc.getPayslip(MONTH, 'pg-user');
    assert.equal(slip?.status, 'draft');
    assert.equal(slip?.decidedBy, null);
    assert.equal((await payrollRows()).filter(r => r.action === 'payroll.decide').length, 0);
  });
});

const kpiRow = (before: Record<string, unknown>, after: Record<string, unknown>) => ({
  actor: 'admin',
  action: 'kpi.score',
  entityKind: 'kpi',
  entityId: 'pg-user',
  subject: 'pg-user',
  month: MONTH,
  before,
  after,
  reason: null,
  sensitivity: 'pay',
  requestId: undefined
});

test('kpi.score records only the parts that changed, in points; an unchanged save writes nothing', async t => {
  await withTempDb(t, 'audit_payroll', async (db, client) => {
    const { svc, payrollRows, verify } = await setup(db, client);

    await svc.setKpiScore('pg-user', MONTH, { wework: 80, peer: 90.5 }, 'admin');
    await svc.setKpiScore('pg-user', MONTH, { wework: 85, peer: 90.5 }, 'admin');
    await svc.setKpiScore('pg-user', MONTH, { wework: 85 }, 'admin');
    await svc.setKpiScore('pg-user', MONTH, { peer: null, selfScore: 70 }, 'admin');

    assert.deepEqual((await payrollRows()).map(plain), [
      kpiRow({ wework: null, peer: null }, { wework: 80, peer: 90.5 }),
      kpiRow({ wework: 80 }, { wework: 85 }),
      kpiRow({ peer: 90.5, self: null }, { peer: null, self: 70 })
    ]);
    assert.equal((await verify()).ok, true);
  });
});

test('a refused KPI save writes no row', async t => {
  await withTempDb(t, 'audit_payroll', async (db, client) => {
    const { svc, payrollRows } = await setup(db, client);
    await assert.rejects(svc.setKpiScore('pg-user', MONTH, { wework: 101 }, 'admin'));
    await assert.rejects(svc.setKpiScore('khong-co-ai', MONTH, { wework: 50 }, 'admin'));
    assert.equal((await payrollRows()).length, 0);
  });
});

test('when the audit write fails, the KPI save is rolled back', async t => {
  await withTempDb(t, 'audit_payroll', async (db, client) => {
    const { failing, payrollRows } = await setup(db, client);
    await assert.rejects(failing.setKpiScore('pg-user', MONTH, { wework: 80 }, 'admin'), /audit boom/);
    const saved = await client.query('SELECT 1 FROM kpi_scores WHERE username = $1 AND month = $2', ['pg-user', MONTH]);
    assert.equal(saved.rows.length, 0);
    assert.equal((await payrollRows()).length, 0);
  });
});

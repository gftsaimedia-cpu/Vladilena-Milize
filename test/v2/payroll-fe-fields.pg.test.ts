import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Kysely } from 'kysely';
import type { Client } from 'pg';
import type { DB } from '../../src/database/schema';
import { TransactionCoordinator } from '../../src/database/transaction';
import { AttendanceDaysRepository } from '../../src/modules/attendance/attendance-days.repository';
import { AttendanceDaysService } from '../../src/modules/attendance/attendance-days.service';
import { SettingsAttendanceSettings } from '../../src/modules/attendance/attendance-settings.port';
import { AuditLog } from '../../src/modules/audit/audit-log';
import { AuditRepository } from '../../src/modules/audit/audit.repository';
import { payrollTotalsOf } from '../../src/modules/payroll/domain';
import { PayrollRepository } from '../../src/modules/payroll/payroll.repository';
import { PayrollService } from '../../src/modules/payroll/payroll.service';
import { SettingsChanges } from '../../src/modules/settings/settings-changes';
import { SettingsReader } from '../../src/modules/settings/settings-reader';
import { SettingsRepository } from '../../src/modules/settings/settings.repository';
import { SettingsService } from '../../src/modules/settings/settings.service';
import { withTempDb } from './helpers/pg-temp-db';

// Các trường để FE chỉ hiện (docs/audit-fe-business-logic.md #1-7, 21, 26, 27): rates theo cài đặt của kỳ, số phút đi
// muộn, workPay, calendar, deductionTotal trên phiếu; totals trên danh sách. Cần PostgreSQL thật (PG_TEST_URL).
const BINH = '11111111-1111-4111-8111-111111111111';
const NOW = new Date('2026-11-05T03:00:00Z');

async function addStaff(client: Client) {
  await client.query(
    `INSERT INTO staff (username, name, type, level, pass_hash, created_at, contract, uuid, start_date)
     VALUES ('nv-binh', 'nv-binh', 'nv', 1, 'x', '2026-01-01', 'long', $1, '2026-11-02')`,
    [BINH]
  );
}

async function punch(client: Client, date: string, inTime: string, outTime: string) {
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

function build(db: Kysely<DB>, now: Date) {
  const coordinator = new TransactionCoordinator(db);
  const settingsRepo = new SettingsRepository(db);
  const reader = new SettingsReader(settingsRepo);
  const days = new AttendanceDaysService(new AttendanceDaysRepository(db), new SettingsAttendanceSettings(reader), coordinator);
  const repo = new PayrollRepository(db);
  const payroll = new PayrollService(repo, reader, days, coordinator);
  payroll.now = () => now;
  const settings = new SettingsService(settingsRepo, reader, coordinator, new SettingsChanges(), new AuditLog(new AuditRepository(), coordinator));
  return { payroll, repo, settings };
}

describe('Phiếu lương trả sẵn số để FE chỉ hiện (PostgreSQL)', () => {
  it('rates, số phút đi muộn, workPay, calendar và deductionTotal', async t => {
    await withTempDb(t, 'payroll_fe_fields', async (db, client) => {
      await addStaff(client);
      await punch(client, '2026-11-02', '08:00', '17:00');
      await punch(client, '2026-11-03', '08:40', '17:00'); // muộn 40 phút, quá ân hạn 15
      await punch(client, '2026-11-04', '08:10', '17:00'); // muộn 10 phút, trong ân hạn
      const { payroll } = build(db, new Date('2026-11-06T03:00:00Z'));
      const slip = (await payroll.generateMonthlyPayslip(BINH, '2026-11')).toJSON();

      // Cài đặt mặc định của kỳ.
      assert.deepEqual(slip.rates, {
        kpiWeights: { wework: 40, user: 24, peer: 18, manager: 12, self: 6 },
        insurancePct: { bhxh: 8, bhyt: 1.5, bhtn: 1, total: 10.5 },
        otMultipliers: { weekday: 1.5, weekend: 2, holiday: 3 },
        lateGraceMinutes: 15
      });
      // Chỉ phút quá ân hạn được ghi: 40 (ngày 03), không tính 10 phút ngày 04.
      assert.equal(slip.lateMinutes, 40);
      assert.equal(slip.workPay, slip.baseSalaryActual + slip.paidLeavePay + slip.leaveSettlementPay + slip.isatPay + slip.holidayPay);
      assert.equal(slip.deductionTotal, slip.insuranceDeduction + slip.personalIncomeTax + slip.advanceDeduction);

      // Lịch tháng: đủ 30 ngày; trước ngày vào làm là unpaid, Chủ nhật nghỉ tuần là rest, ngày chưa xét là future.
      const kindOf = (d: string) => slip.calendar.find(c => c.date === d)?.kind;
      assert.equal(slip.calendar.length, 30);
      assert.deepEqual(
        ['2026-11-01', '2026-11-02', '2026-11-03', '2026-11-08', '2026-11-20'].map(kindOf),
        ['unpaid', 'work', 'work', 'rest', 'future']
      );
    });
  });

  it('rates theo cài đặt đang áp cho kỳ, không phải hằng số', async t => {
    await withTempDb(t, 'payroll_fe_rates', async (db, client) => {
      await addStaff(client);
      await punch(client, '2026-11-02', '08:00', '17:00');
      const { payroll, settings } = build(db, new Date('2026-11-06T03:00:00Z'));
      const eff = '2026-11';
      await settings.saveGroup('insurance', { effectiveMonth: eff, values: { bhxhPct: 9, bhytPct: 2, bhtnPct: 1 }, stamp: 0 }, 'admin', NOW);
      await settings.saveGroup('kpi-weights', { effectiveMonth: eff, values: { wework: 50, user: 20, peer: 15, manager: 10, self: 5 }, stamp: 0 }, 'admin', NOW);
      await settings.saveGroup('attendance', { effectiveMonth: eff, values: { lateGraceMinutes: 10 }, stamp: 0 }, 'admin', NOW);
      await settings.saveGroup('overtime', { effectiveMonth: eff, values: { weekdayRate: 1.8 }, stamp: 0 }, 'admin', NOW);

      const slip = (await payroll.generateMonthlyPayslip(BINH, '2026-11')).toJSON();
      assert.deepEqual(slip.rates, {
        kpiWeights: { wework: 50, user: 20, peer: 15, manager: 10, self: 5 },
        insurancePct: { bhxh: 9, bhyt: 2, bhtn: 1, total: 12 },
        otMultipliers: { weekday: 1.8, weekend: 2, holiday: 3 },
        lateGraceMinutes: 10
      });
      // Phiếu đã lưu giữ đúng các tỉ lệ lúc tính.
      await payroll.calculatePeriodPayslips('2026-11', [BINH], 'tester');
      const stored = await payroll.getPayslip('2026-11', BINH);
      assert.equal(stored!.details.rates.insurancePct.total, 12);
    });
  });

  it('GET /payroll/:month có totals cộng đúng từng cột', async t => {
    await withTempDb(t, 'payroll_fe_totals', async (db, client) => {
      await addStaff(client);
      await client.query(
        `INSERT INTO staff (username, name, type, level, pass_hash, created_at, contract, uuid, start_date)
         VALUES ('nv-an', 'nv-an', 'nv', 1, 'x', '2026-01-01', 'long', '22222222-2222-4222-8222-222222222222', '2026-11-02')`
      );
      await punch(client, '2026-11-02', '08:00', '17:00');
      const { payroll } = build(db, new Date('2026-11-06T03:00:00Z'));
      await payroll.calculatePeriodPayslips('2026-11', undefined, 'tester');
      const items = await payroll.listPayslips('2026-11');
      assert.equal(items.length, 2);

      const totals = payrollTotalsOf(items);
      const sum = (pick: (i: (typeof items)[number]) => number) => items.reduce((a, i) => a + pick(i), 0);
      assert.equal(totals.count, 2);
      assert.equal(totals.gross, sum(i => i.gross));
      assert.equal(totals.net, sum(i => i.net));
      assert.equal(totals.baseSalaryActual, sum(i => i.details.baseSalaryActual));
      assert.equal(totals.allowance, sum(i => i.details.totalAllowanceActual));
      assert.equal(totals.deductions, totals.insurance + totals.tax + totals.advance);
      assert.equal(totals.netShare, Math.round((totals.net / totals.gross) * 100));
    });
  });
});

describe('payrollTotalsOf', () => {
  it('phiếu lưu trước khi có trường chi tiết tính 0; tổng gross 0 thì netShare 0; trừ giờ là số dương', () => {
    const empty = payrollTotalsOf([]);
    assert.deepEqual([empty.count, empty.gross, empty.netShare, empty.deductions], [0, 0, 0, 0]);

    const t = payrollTotalsOf([
      { gross: 100, insurance: 10, tax: 5, advance: 1, net: 84, details: { lateEarlyDeductionAmount: -7, baseSalaryActual: 60 } },
      { gross: 100, insurance: 10, tax: 5, advance: 1, net: 84, details: {} },
      { gross: 100, insurance: 10, tax: 5, advance: 1, net: 84 }
    ]);
    assert.equal(t.lateDeduction, 7);
    assert.equal(t.baseSalaryActual, 60);
    assert.equal(t.deductions, 48);
    assert.equal(t.netShare, 84);
  });

  it('đếm phiếu theo trạng thái: final tính là đã duyệt, trạng thái lạ tính là nháp, bốn số cộng lại bằng all', () => {
    const slip = (status?: string) => ({ status, gross: 1, insurance: 0, tax: 0, advance: 0, net: 1 });
    assert.deepEqual(payrollTotalsOf([]).statusCounts, { all: 0, draft: 0, approved: 0, rejected: 0 });
    const t = payrollTotalsOf([slip('draft'), slip('approved'), slip('final'), slip('rejected'), slip('rejected'), slip('lạ'), slip()]);
    assert.deepEqual(t.statusCounts, { all: 7, draft: 3, approved: 2, rejected: 2 });
    const c = t.statusCounts;
    assert.equal(c.draft + c.approved + c.rejected, c.all);
  });
});

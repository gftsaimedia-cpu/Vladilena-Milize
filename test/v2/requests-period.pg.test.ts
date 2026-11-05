import assert from 'node:assert/strict';
import { test } from 'node:test';
import 'reflect-metadata';
import { Global, Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { Kysely } from 'kysely';
import type { Client } from 'pg';
import { KYSELY_DB } from '../../src/database/kysely';
import { TransactionCoordinator } from '../../src/database/transaction';
import type { DB } from '../../src/database/schema';
import { AttendanceRepository } from '../../src/modules/attendance/attendance.repository';
import { AuditLog } from '../../src/modules/audit/audit-log';
import { AuditRepository } from '../../src/modules/audit/audit.repository';
import { HolidaysRepository } from '../../src/modules/holidays/holidays.repository';
import { PayrollRepository } from '../../src/modules/payroll/payroll.repository';
import { PayrollService } from '../../src/modules/payroll/payroll.service';
import { PeriodGate } from '../../src/modules/periods/period-gate';
import { PeriodLockedError } from '../../src/modules/periods/periods.errors';
import { PeriodsRepository } from '../../src/modules/periods/periods.repository';
import { PeriodsService } from '../../src/modules/periods/periods.service';
import { DayStatusRepository } from '../../src/modules/requests/day-status.repository';
import { RequestsController } from '../../src/modules/requests/requests.controller';
import { RequestsModule } from '../../src/modules/requests/requests.module';
import { RequestsRepository } from '../../src/modules/requests/requests.repository';
import { RequestsService } from '../../src/modules/requests/requests.service';
import { withTempDb } from './helpers/pg-temp-db';

const MONTH = '2026-10';
// "Hôm nay" là 05/11/2026: các ngày tháng 10 đã qua, nên giải trình được và Chốt công được.
const NOW = () => new Date('2026-11-05T09:00:00+07:00');

interface Fixture {
  service: RequestsService;
  /** RequestsService đầy đủ (khoá thật, cổng kỳ thật) dùng `payroll` cho bước tự tính lại. */
  requestsWith: (payroll: PayrollService) => RequestsService;
  payroll: PayrollService;
  payrollRepo: PayrollRepository;
  periods: PeriodsService;
  tx: TransactionCoordinator;
}

// Hai nhân sự nv bậc 1, uuid khác tên đăng nhập như DB thật. Người duyệt đã bị khoá (locked_at) để không vào kỳ lương:
// tính cả kỳ chỉ có hai phiếu, và reviewed_by vẫn ghi được uuid của người duyệt.
async function build(db: Kysely<DB>, client: Client): Promise<Fixture> {
  await client.query(
    `INSERT INTO staff (username, name, type, level, pass_hash, created_at, contract, uuid, locked_at)
     VALUES ('pg-user', 'Nhân viên PG', 'nv', 1, 'x', $1, 'long', 'pg-uuid-1', NULL),
            ('pg-user-2', 'Nhân viên PG 2', 'nv', 1, 'x', $1, 'long', 'pg-uuid-2', NULL),
            ('admin-username', 'Quản trị PG', 'nv', 1, 'x', $1, 'long', 'admin-uuid', $1)`,
    [new Date().toISOString()]
  );
  const tx = new TransactionCoordinator(db);
  const periodsRepo = new PeriodsRepository(db);
  const periods = new PeriodsService(periodsRepo, tx, new AuditLog(new AuditRepository(), new TransactionCoordinator(db)));
  periods.now = NOW;
  const payrollRepo = new PayrollRepository(db);
  const payroll = new PayrollService(payrollRepo, tx, periods);
  const requestsWith = (p: PayrollService) => {
    const service = new RequestsService(
      new RequestsRepository(db),
      new AttendanceRepository(db),
      tx,
      new HolidaysRepository(db),
      new DayStatusRepository(db),
      new PeriodGate(periodsRepo),
      p
    );
    service.now = NOW;
    return service;
  };
  return { service: requestsWith(payroll), requestsWith, payroll, payrollRepo, periods, tx };
}

/** Chốt công tháng 10, tính cả kỳ (kỳ sang `calculated`), rồi duyệt cả hai phiếu. */
async function calculatedAndApproved(f: Fixture): Promise<void> {
  await f.periods.lock(MONTH, 'admin');
  await f.payroll.calculatePeriodPayslips(MONTH, undefined, 'admin');
  await f.payroll.decidePayslip(MONTH, 'pg-user', 'approved', 'checker', 'ok');
  await f.payroll.decidePayslip(MONTH, 'pg-user-2', 'approved', 'checker', 'ok');
}

const setPeriod = (client: Client, status: string, month = MONTH) =>
  client.query(
    `INSERT INTO payroll_periods (month, status) VALUES ($1, $2) ON CONFLICT (month) DO UPDATE SET status = EXCLUDED.status`,
    [month, status]
  );

const count = async (client: Client, table: string): Promise<number> =>
  Number((await client.query(`SELECT count(*) AS n FROM ${table}`)).rows[0].n);

/** Phiếu của lần chạy nháp hiện tại (lần mới nhất) của tháng 10, theo tên đăng nhập. */
const currentSlips = async (client: Client) =>
  (
    await client.query(
      `SELECT p.username, p.status, p.decided_by FROM payslips p
       WHERE p.run_id = (SELECT id FROM payroll_runs WHERE month = $1 AND status = 'draft' ORDER BY run_no DESC LIMIT 1)
       ORDER BY p.username`,
      [MONTH]
    )
  ).rows;

const lockedIn = (month: string, status?: string) => (e: any) => {
  assert.ok(e instanceof PeriodLockedError, String(e?.message ?? e));
  assert.equal(e.status, 409);
  assert.equal(e.details.code, 'PERIOD_LOCKED');
  assert.equal(e.details.month, month);
  if (status) assert.equal(e.details.status, status);
  return true;
};

const leave = (employeeId: string, startDate: string, endDate = startDate) => ({
  employeeId,
  title: 'Nghỉ',
  reason: 'Việc nhà',
  leaveType: 'PERSONAL_UNPAID',
  startDate,
  endDate
});

const explanation = (employeeId: string, workDate: string) => ({
  employeeId,
  title: 'Giải trình',
  reason: 'Quên chấm công',
  workDate,
  cases: ['LATE_CHECK_IN']
});

test('filing leave, OT, shift change, makeup or advance into a locked month is refused', async t => {
  await withTempDb(t, 'req_period_file', async (db, client) => {
    const { service } = await build(db, client);
    await setPeriod(client, 'attendance_locked');
    const locked = lockedIn(MONTH, 'attendance_locked');

    await assert.rejects(service.createLeaveRequest(leave('pg-user', '2026-10-20')), locked);
    await assert.rejects(
      service.createOvertimeRequest({
        employeeId: 'pg-user',
        title: 'OT',
        reason: 'Gấp',
        otDate: '2026-10-20',
        startTime: '18:00',
        endTime: '20:00'
      }),
      locked
    );
    await assert.rejects(
      service.createShiftChangeRequest({
        employeeId: 'pg-user',
        title: 'Đổi ca',
        reason: 'Việc nhà',
        startDate: '2026-10-20',
        endDate: '2026-10-20',
        shiftType: 'NORMAL',
        startTime: '10:00'
      }),
      locked
    );
    await assert.rejects(
      service.createLeaveWithMakeupRequest({
        employeeId: 'pg-user',
        title: 'Nghỉ bù',
        reason: 'Việc nhà',
        startDate: '2026-10-20',
        endDate: '2026-10-20',
        slots: [
          { date: '2026-10-21', startTime: '18:00', endTime: '22:00' },
          { date: '2026-10-22', startTime: '18:00', endTime: '22:00' }
        ]
      }),
      locked
    );
    await assert.rejects(
      service.createAdvanceRequest({ employeeId: 'pg-user', title: 'Tạm ứng', reason: 'Việc nhà', amount: 1_000_000, period: MONTH }),
      locked
    );

    assert.equal(await count(client, 'system_requests'), 0);
    assert.equal(await count(client, 'day_status'), 0);
    assert.equal(await count(client, 'makeup_slots'), 0);
  });
});

test('iSAT for a Saturday of a locked month is refused', async t => {
  await withTempDb(t, 'req_period_isat', async (db, client) => {
    const { service } = await build(db, client);
    // iSAT chỉ nhận Thứ Bảy sắp tới, nên đặt tay tháng 11 là đã chốt để thử cổng của đơn iSAT.
    await setPeriod(client, 'attendance_locked', '2026-11');
    await assert.rejects(
      service.createIsatRequest({
        employeeId: 'pg-user',
        saturday: '2026-11-14',
        team: 'VN Pod',
        conditions: { NO_VIOLATION: true, REPORTS_DONE: true, WORK_COMPLETED: true, OFFICIAL_EMPLOYEE: true }
      }),
      lockedIn('2026-11', 'attendance_locked')
    );
    assert.equal(await count(client, 'system_requests'), 0);
    assert.equal(await count(client, 'isat_registrations'), 0);
  });
});

test('a leave across 30/10–02/11 is refused when only October is locked', async t => {
  await withTempDb(t, 'req_period_span', async (db, client) => {
    const { service } = await build(db, client);
    await setPeriod(client, 'attendance_locked');

    await assert.rejects(service.createLeaveRequest(leave('pg-user', '2026-10-30', '2026-11-02')), (e: any) => {
      lockedIn(MONTH, 'attendance_locked')(e);
      assert.equal(e.message, 'Tháng 10/2026 đã chốt công');
      return true;
    });
    assert.equal(await count(client, 'system_requests'), 0);
    assert.equal(await count(client, 'day_status'), 0);
  });
});

test('an explanation for a locked month is still accepted, but not once approved', async t => {
  await withTempDb(t, 'req_period_explain', async (db, client) => {
    const { service } = await build(db, client);
    await setPeriod(client, 'attendance_locked');
    const accepted = await service.createExplanationRequest(explanation('pg-user', '2026-10-28'));
    assert.equal(accepted.status, 'PENDING');

    await setPeriod(client, 'approved');
    await assert.rejects(service.createExplanationRequest(explanation('pg-user', '2026-10-27')), (e: any) => {
      lockedIn(MONTH, 'approved')(e);
      assert.equal(e.message, 'Kỳ lương tháng 10/2026 đã phê duyệt');
      return true;
    });
    assert.equal(await count(client, 'system_requests'), 1);
  });
});

test('approving an explanation in a calculated month recalculates only that person', async t => {
  await withTempDb(t, 'req_period_recalc', async (db, client) => {
    const f = await build(db, client);
    await calculatedAndApproved(f);
    const runsBefore = await count(client, 'payroll_runs');

    const created = await f.service.createExplanationRequest(explanation('pg-user', '2026-10-29'));
    const result = await f.service.reviewAndRecalculate(created.id, 'admin-username', 'APPROVE');

    assert.equal(result.request.status, 'APPROVED');
    assert.equal(result.request.reviewedBy, 'admin-uuid');
    assert.deepEqual(result.recalculated, [{ month: MONTH, ok: true }]);
    assert.equal(await count(client, 'payroll_runs'), runsBefore + 1);
    assert.deepEqual(await currentSlips(client), [
      { username: 'pg-user', status: 'draft', decided_by: null },
      { username: 'pg-user-2', status: 'approved', decided_by: 'checker' }
    ]);
    // Tính lại một người giữ kỳ ở `calculated` và lần chạy mới thành lần chạy hiện tại của kỳ.
    const period = (await client.query('SELECT status, current_run_id FROM payroll_periods WHERE month = $1', [MONTH])).rows[0];
    const latest = (await client.query('SELECT max(id) AS id FROM payroll_runs WHERE month = $1', [MONTH])).rows[0];
    assert.equal(period.status, 'calculated');
    assert.equal(Number(period.current_run_id), Number(latest.id));
  });
});

test('reviewing in an attendance_locked month does not recalculate', async t => {
  await withTempDb(t, 'req_period_norecalc', async (db, client) => {
    const f = await build(db, client);
    // Một lần tính khi tháng còn mở, rồi Chốt công: kỳ ở `attendance_locked`, đã có một lần chạy.
    await f.payroll.calculatePeriodPayslips(MONTH, undefined, 'admin');
    await f.periods.lock(MONTH, 'admin');
    const runsBefore = await count(client, 'payroll_runs');

    const created = await f.service.createExplanationRequest(explanation('pg-user', '2026-10-29'));
    const result = await f.service.reviewAndRecalculate(created.id, 'admin-username', 'APPROVE');

    assert.equal(result.request.status, 'APPROVED');
    assert.deepEqual(result.recalculated, []);
    assert.equal(await count(client, 'payroll_runs'), runsBefore);
  });
});

test('a failed recalculation puts the old payslip back to draft', async t => {
  await withTempDb(t, 'req_period_fail', async (db, client) => {
    const f = await build(db, client);
    await calculatedAndApproved(f);
    class FailingPayroll extends PayrollService {
      override async calculatePeriodPayslips(): Promise<never> {
        throw new Error('Thiếu cấu hình bậc 9');
      }
    }
    const service = f.requestsWith(new FailingPayroll(f.payrollRepo, f.tx, f.periods));

    const created = await service.createExplanationRequest(explanation('pg-user', '2026-10-29'));
    const result = await service.reviewAndRecalculate(created.id, 'admin-username', 'APPROVE');

    assert.deepEqual(result.recalculated, [{ month: MONTH, ok: false, error: 'Thiếu cấu hình bậc 9' }]);
    assert.equal(result.request.status, 'APPROVED');
    assert.deepEqual(await currentSlips(client), [
      { username: 'pg-user', status: 'draft', decided_by: null },
      { username: 'pg-user-2', status: 'approved', decided_by: 'checker' }
    ]);
    const row = await client.query('SELECT status FROM system_requests WHERE id = $1', [created.id]);
    assert.deepEqual(row.rows, [{ status: 'APPROVED' }]);
  });
});

test('a recalculation that reports errors also puts the old payslip back to draft', async t => {
  await withTempDb(t, 'req_period_errs', async (db, client) => {
    const f = await build(db, client);
    await calculatedAndApproved(f);
    class ErroringPayroll extends PayrollService {
      override async calculatePeriodPayslips(month: string, employeeIds?: string[]) {
        return { runId: null, items: [], errors: (employeeIds ?? []).map(employeeId => ({ employeeId, message: `Thiếu lương cơ bản ${month}` })) };
      }
    }
    const service = f.requestsWith(new ErroringPayroll(f.payrollRepo, f.tx, f.periods));

    const created = await service.createExplanationRequest(explanation('pg-user', '2026-10-29'));
    const result = await service.reviewAndRecalculate(created.id, 'admin-username', 'REJECT', 'Không hợp lệ');

    assert.equal(result.request.status, 'REJECTED');
    assert.deepEqual(result.recalculated, [{ month: MONTH, ok: false, error: 'Thiếu lương cơ bản 2026-10' }]);
    assert.deepEqual(await currentSlips(client), [
      { username: 'pg-user', status: 'draft', decided_by: null },
      { username: 'pg-user-2', status: 'approved', decided_by: 'checker' }
    ]);
  });
});

test('reviewing a request of an approved month is refused', async t => {
  await withTempDb(t, 'req_period_review', async (db, client) => {
    const { service } = await build(db, client);
    const id = (
      await client.query(
        `INSERT INTO system_requests (id, employee_id, title, type, reason, status, ot_date, ot_start_time, ot_end_time, ot_hours, created_at, updated_at)
         VALUES (gen_random_uuid(), 'pg-uuid-1', 'OT', 'OVERTIME', 'Gấp', 'PENDING', '2026-10-20', '18:00', '20:00', 2, now(), now())
         RETURNING id`
      )
    ).rows[0].id;
    await setPeriod(client, 'approved');

    await assert.rejects(service.reviewRequest(id, 'admin-username', 'APPROVE'), lockedIn(MONTH, 'approved'));
    await assert.rejects(service.reviewAndRecalculate(id, 'admin-username', 'REJECT'), lockedIn(MONTH, 'approved'));
    const row = await client.query('SELECT status, reviewed_by FROM system_requests WHERE id = $1', [id]);
    assert.deepEqual(row.rows, [{ status: 'PENDING', reviewed_by: null }]);
  });
});

// ---- Không cần PostgreSQL: controller với service giả, và dây nối DI của RequestsModule ----

const ADMIN: any = { uuid: 'u-admin', username: 'admin', role: 'admin' };

test('the review route returns the recalculated months next to the request', async () => {
  const calls: unknown[][] = [];
  const request = { id: 'r1', status: 'APPROVED' };
  const recalculated = [{ month: MONTH, ok: false, error: 'Thiếu cấu hình bậc 9' }];
  const service = {
    reviewAndRecalculate: async (...args: unknown[]) => {
      calls.push(args);
      return { request, recalculated };
    }
  } as any;

  const body = await new RequestsController(service).reviewRequest('r1', { action: 'APPROVE', note: 'ok' }, ADMIN);

  assert.deepEqual(body, { updated: true, request, recalculated });
  assert.deepEqual(calls, [['r1', 'admin', 'APPROVE', 'ok']]);
});

test('PERIOD_LOCKED passes through the create and review routes unchanged', async () => {
  const filing = new PeriodLockedError(MONTH, 'attendance_locked');
  const reviewing = new PeriodLockedError(MONTH, 'approved');
  const service = {
    createLeaveRequest: async () => {
      throw filing;
    },
    reviewAndRecalculate: async () => {
      throw reviewing;
    }
  } as any;
  const controller = new RequestsController(service);

  await assert.rejects(controller.createLeave(leave('nv01', '2026-10-20'), ADMIN), (e: any) => e === filing && e.status === 409);
  await assert.rejects(controller.reviewRequest('r1', { action: 'APPROVE' }, ADMIN), (e: any) => e === reviewing && e.status === 409);
});

test('RequestsModule hands the period gate and the payroll service to RequestsService through Nest DI', async () => {
  // Chạy bằng tsx nên không có design:paramtypes: thiếu @Inject thì tham số @Optional thành undefined mà không báo gì.
  @Global()
  @Module({
    providers: [
      { provide: KYSELY_DB, useValue: { name: 'fake-db' } },
      { provide: TransactionCoordinator, useValue: { name: 'fake-tx' } },
      { provide: AuditLog, useValue: { name: 'fake-audit' } }
    ],
    exports: [KYSELY_DB, TransactionCoordinator, AuditLog]
  })
  class FakeGlobalsModule {}

  @Module({ imports: [FakeGlobalsModule, RequestsModule] })
  class TestRootModule {}

  const app = await NestFactory.createApplicationContext(TestRootModule, { logger: false });
  try {
    const service = app.get(RequestsService, { strict: false }) as any;
    assert.ok(service.periodGate instanceof PeriodGate);
    assert.ok(service.payroll instanceof PayrollService);
    assert.equal(service.periodGate, app.get(PeriodGate, { strict: false }));
  } finally {
    await app.close();
  }
});

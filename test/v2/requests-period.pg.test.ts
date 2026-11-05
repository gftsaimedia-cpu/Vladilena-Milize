import assert from 'node:assert/strict';
import { test } from 'node:test';
import 'reflect-metadata';
import { Global, Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { Kysely } from 'kysely';
import type { Client } from 'pg';
import { KYSELY_DB } from '../../src/database/kysely';
import { TransactionCoordinator, type DatabaseTransaction } from '../../src/database/transaction';
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
import { ExplanationRemindersRepository } from '../../src/modules/requests/explanation-reminders.repository';
import { ExplanationsService } from '../../src/modules/requests/explanations.service';
import { RequestsController } from '../../src/modules/requests/requests.controller';
import { RequestsModule } from '../../src/modules/requests/requests.module';
import { RequestsRepository } from '../../src/modules/requests/requests.repository';
import { RequestsService } from '../../src/modules/requests/requests.service';
import { waitForLockWait, withTempDb } from './helpers/pg-temp-db';
import { LOCK_TRX, explanationRequest, leaveRequest, makeService, seed } from './helpers/requests-fakes';

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
  const payroll = new PayrollService(payrollRepo, undefined, tx, periods);
  const gate = new PeriodGate(periodsRepo);
  const requestsWith = (p: PayrollService) => {
    // Đơn giải trình nộp qua ExplanationsService (ngày cần giải trình, trường hợp do server tìm), cùng cổng kỳ.
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
      p,
      explanations
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

// Ngày không có dòng chấm công: thiếu cả giờ vào lẫn giờ ra, nên phải nhập cả hai giờ thực tế.
const explanation = (employeeId: string, workDate: string) => ({
  employeeId,
  reason: 'Quên chấm công',
  workDate,
  actualCheckIn: '08:00',
  actualCheckOut: '17:00'
});

test('filing leave, OT, shift change, makeup or advance into a locked month is refused', async t => {
  await withTempDb(t, 'req_period_file', async (db, client) => {
    const f = await build(db, client);
    // Số tiền tạm ứng cố định: tháng 10 không có ngày công nên bộ tính thật trả 0 và đơn bị từ chối trước cổng kỳ.
    class QuotingPayroll extends PayrollService {
      override async advanceQuote() {
        return { amount: 1_000_000, workDays: 12, from: '2026-10-01', to: '2026-10-15' };
      }
    }
    const service = f.requestsWith(new QuotingPayroll(f.payrollRepo, undefined, f.tx, f.periods));
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
    await assert.rejects(service.createAdvanceRequest({ employeeId: 'pg-user', period: MONTH }), locked);
    // Xem trước đi qua cùng cổng kỳ và báo cùng kết quả, không ghi gì.
    assert.deepEqual(await service.previewRequest('leave', leave('pg-user', '2026-10-20')), {
      ok: false,
      message: 'Tháng 10/2026 đã chốt công',
      code: 'PERIOD_LOCKED',
      month: MONTH,
      status: 'attendance_locked'
    });

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

test('an explanation for a locked or calculated month is still accepted, but not once approved or paid', async t => {
  await withTempDb(t, 'req_period_explain', async (db, client) => {
    const { service } = await build(db, client);
    // Ví dụ của người dùng: tháng 10 chốt công 01/11, Bình nộp giải trình 29/10 ngày 03/11 → được nhận.
    await setPeriod(client, 'attendance_locked');
    const accepted = await service.createExplanationRequest(explanation('pg-user', '2026-10-29'), { filedBy: 'self' });
    assert.equal(accepted.status, 'PENDING');
    assert.deepEqual(accepted.explanationCases, ['MISSING_CHECK_IN', 'MISSING_CHECK_OUT']);
    await setPeriod(client, 'calculated');
    assert.equal((await service.createExplanationRequest(explanation('pg-user', '2026-10-28'))).status, 'PENDING');

    for (const [status, message] of [
      ['approved', 'Kỳ lương tháng 10/2026 đã phê duyệt'],
      ['paid', 'Kỳ lương tháng 10/2026 đã trả lương']
    ]) {
      await setPeriod(client, status);
      for (const filedBy of ['self', 'admin'] as const) {
        await assert.rejects(service.createExplanationRequest(explanation('pg-user', '2026-10-27'), { filedBy }), (e: any) => {
          lockedIn(MONTH, status)(e);
          assert.equal(e.message, message);
          return true;
        });
      }
    }
    assert.equal(await count(client, 'system_requests'), 2);
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
    const service = f.requestsWith(new FailingPayroll(f.payrollRepo, undefined, f.tx, f.periods));

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
    const service = f.requestsWith(new ErroringPayroll(f.payrollRepo, undefined, f.tx, f.periods));

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

test('a review in a calculated month puts the slip back to draft inside its own transaction', async t => {
  await withTempDb(t, 'req_period_intrx', async (db, client) => {
    const f = await build(db, client);
    await calculatedAndApproved(f);
    // Như tiến trình dừng ngay sau khi lưu quyết định: tính lại sau commit lỗi, và bước đưa về nháp sau commit cũng
    // không chạy được. Chỉ phần làm trong giao dịch duyệt còn tác dụng.
    class CrashingPayroll extends PayrollService {
      override async calculatePeriodPayslips(): Promise<never> {
        throw new Error('Tiến trình dừng');
      }
      override async resetDecision(month: string, employeeId: string, trx?: DatabaseTransaction): Promise<boolean> {
        if (!trx) throw new Error('Tiến trình dừng');
        return super.resetDecision(month, employeeId, trx);
      }
    }
    const service = f.requestsWith(new CrashingPayroll(f.payrollRepo, undefined, f.tx, f.periods));

    const created = await service.createExplanationRequest(explanation('pg-user', '2026-10-29'));
    const result = await service.reviewAndRecalculate(created.id, 'admin-username', 'APPROVE');

    assert.equal(result.request.status, 'APPROVED');
    assert.deepEqual(result.recalculated, [{ month: MONTH, ok: false, error: 'Tiến trình dừng' }]);
    assert.deepEqual(await currentSlips(client), [
      { username: 'pg-user', status: 'draft', decided_by: null },
      { username: 'pg-user-2', status: 'approved', decided_by: 'checker' }
    ]);
    await assert.rejects(f.periods.approve(MONTH, 'admin'), (e: any) => {
      assert.equal(e.status, 409);
      assert.equal(e.details.code, 'PERIOD_BLOCKED');
      assert.equal(e.details.blockers.unapprovedSlips, 1);
      assert.equal(e.message, 'Còn 1 phiếu chưa duyệt');
      return true;
    });
  });
});

test('Phê duyệt kỳ that waits behind a review sees the slip back in draft', async t => {
  await withTempDb(t, 'req_period_race', async (db, client) => {
    const f = await build(db, client);
    await calculatedAndApproved(f);
    let paused!: () => void;
    const pausedP = new Promise<void>(resolve => (paused = resolve));
    let release!: () => void;
    const releaseP = new Promise<void>(resolve => (release = resolve));
    // Dừng giao dịch duyệt ngay sau khi phiếu về nháp, trước commit; lúc đó nó đang giữ khoá chia sẻ của tháng 10.
    class PausingPayroll extends PayrollService {
      override async resetDecision(month: string, employeeId: string, trx?: DatabaseTransaction): Promise<boolean> {
        const reset = await super.resetDecision(month, employeeId, trx);
        if (trx) {
          paused();
          await releaseP;
        }
        return reset;
      }
    }
    const service = f.requestsWith(new PausingPayroll(f.payrollRepo, undefined, f.tx, f.periods));
    const created = await service.createExplanationRequest(explanation('pg-user', '2026-10-29'));

    const review = service.reviewAndRecalculate(created.id, 'admin-username', 'APPROVE');
    let approve!: Promise<string>;
    try {
      await Promise.race([
        pausedP,
        new Promise((_, reject) => setTimeout(() => reject(new Error('Giao dịch duyệt không đưa phiếu về nháp')), 5000))
      ]);
      // Phê duyệt kỳ lấy khoá payroll_ rồi đợi khoá độc quyền của tháng tới khi giao dịch duyệt commit.
      approve = f.periods.approve(MONTH, 'admin').then(
        () => 'approved',
        (e: any) => e?.details?.code ?? String(e)
      );
      await waitForLockWait(client);
    } finally {
      release();
    }

    assert.equal(await approve, 'PERIOD_BLOCKED');
    const result = await review;
    assert.equal(result.request.status, 'APPROVED');
    assert.deepEqual(result.recalculated, [{ month: MONTH, ok: true }]);
    assert.equal((await f.periods.snapshot(MONTH)).status, 'calculated');
  });
});

test('the review transaction alone, without any recalculation, already blocks Phê duyệt kỳ', async t => {
  await withTempDb(t, 'req_period_nocalc', async (db, client) => {
    const f = await build(db, client);
    await calculatedAndApproved(f);
    const runsBefore = await count(client, 'payroll_runs');
    const slipBefore = (await client.query("SELECT rev FROM payslips WHERE username = 'pg-user'")).rows[0];

    // `reviewRequest` chỉ chạy giao dịch duyệt: giống tiến trình chết giữa commit và bước tính lại.
    const created = await f.service.createExplanationRequest(explanation('pg-user', '2026-10-29'));
    await f.service.reviewRequest(created.id, 'admin-username', 'REJECT', 'Không hợp lệ');

    assert.equal(await count(client, 'payroll_runs'), runsBefore);
    const slip = (await client.query("SELECT status, decided_by, decided_at, note, rev FROM payslips WHERE username = 'pg-user'")).rows[0];
    assert.deepEqual(
      { ...slip, rev: Number(slip.rev) },
      { status: 'draft', decided_by: null, decided_at: null, note: null, rev: Number(slipBefore.rev) + 1 }
    );
    await assert.rejects(f.periods.approve(MONTH, 'admin'), (e: any) => e.details?.code === 'PERIOD_BLOCKED');
  });
});

test('a review in an attendance_locked month leaves every payslip as it was', async t => {
  await withTempDb(t, 'req_period_keepslips', async (db, client) => {
    const f = await build(db, client);
    await calculatedAndApproved(f);
    // Mở lại công rồi Chốt công lại: kỳ ở `attendance_locked`, lần chạy nháp còn hai phiếu đã duyệt.
    await f.periods.unlock(MONTH, 'admin', 'Chấm thay cho Châu 31/10');
    await f.periods.lock(MONTH, 'admin');
    const slips = () => client.query('SELECT id, status, decided_by, note, rev FROM payslips ORDER BY id').then(r => r.rows);
    const before = await slips();

    const created = await f.service.createExplanationRequest(explanation('pg-user', '2026-10-29'));
    const result = await f.service.reviewAndRecalculate(created.id, 'admin-username', 'APPROVE');

    assert.equal(result.request.status, 'APPROVED');
    assert.deepEqual(result.recalculated, []);
    assert.deepEqual(await slips(), before);
  });
});

test('a reset that fails inside the review rolls the review back', async t => {
  await withTempDb(t, 'req_period_rollback', async (db, client) => {
    const f = await build(db, client);
    await calculatedAndApproved(f);
    class BrokenReset extends PayrollService {
      override async resetDecision(): Promise<boolean> {
        throw new Error('không ghi được phiếu');
      }
    }
    const service = f.requestsWith(new BrokenReset(f.payrollRepo, undefined, f.tx, f.periods));

    const created = await service.createExplanationRequest(explanation('pg-user', '2026-10-29'));
    await assert.rejects(service.reviewAndRecalculate(created.id, 'admin-username', 'APPROVE'), /không ghi được phiếu/);

    const row = await client.query('SELECT status, reviewed_by FROM system_requests WHERE id = $1', [created.id]);
    assert.deepEqual(row.rows, [{ status: 'PENDING', reviewed_by: null }]);
    assert.deepEqual(await currentSlips(client), [
      { username: 'pg-user', status: 'approved', decided_by: 'checker' },
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

/**
 * RequestsService trên các repository giả của `makeService`, với cổng kỳ và PayrollService giả cho bước tự tính lại.
 * `calls` ghi lại các lời gọi PayrollService theo thứ tự.
 */
function withFakeRecalc(gate: Partial<PeriodGate>, payroll: Record<string, (...args: any[]) => Promise<unknown>>) {
  const base = makeService();
  const calls: unknown[][] = [];
  const recorded = Object.fromEntries(
    Object.entries(payroll).map(([name, fn]) => [
      name,
      (...args: any[]) => {
        calls.push([name, ...args]);
        return fn(...args);
      }
    ])
  );
  const service = new RequestsService(
    base.repo,
    base.att,
    base.lock as unknown as TransactionCoordinator,
    base.holidays,
    base.days,
    { hold: async () => {}, ...gate } as PeriodGate,
    recorded as unknown as PayrollService
  );
  service.now = base.service.now;
  return { ...base, service, calls };
}

const okRun = async () => ({ runId: 1, items: [], errors: [] });

// Trong giao dịch duyệt, cổng kỳ được gọi với giao dịch của khoá (LOCK_TRX); sau commit thì không có giao dịch.
const afterCommit = (trx: unknown) => trx === undefined;

test('a review in a calculated month resets the slip on the review transaction, before the recalculation', async () => {
  const ctx = withFakeRecalc({ statusOf: async () => 'calculated' }, { calculatePeriodPayslips: okRun, resetDecision: async () => true });
  const req = await seed(ctx, explanationRequest('2026-10-29'));

  const result = await ctx.service.reviewAndRecalculate(req.id, 'admin', 'REJECT', 'Không hợp lệ');

  assert.equal(result.request.status, 'REJECTED');
  assert.deepEqual(result.recalculated, [{ month: MONTH, ok: true }]);
  assert.deepEqual(ctx.calls, [
    ['resetDecision', MONTH, req.employeeId, LOCK_TRX],
    ['calculatePeriodPayslips', MONTH, [req.employeeId], 'admin']
  ]);
});

test('a review in an attendance_locked month resets nothing and recalculates nothing', async () => {
  const ctx = withFakeRecalc({ statusOf: async () => 'attendance_locked' }, { calculatePeriodPayslips: okRun, resetDecision: async () => true });
  const req = await seed(ctx, explanationRequest('2026-10-29'));

  const result = await ctx.service.reviewAndRecalculate(req.id, 'admin', 'APPROVE');

  assert.deepEqual(result.recalculated, []);
  assert.deepEqual(ctx.calls, []);
});

test('a period status that cannot be read after the review is reported and not recalculated', async () => {
  const ctx = withFakeRecalc(
    {
      statusOf: async (trx: unknown) => {
        if (afterCommit(trx)) throw new Error('mất kết nối');
        return 'calculated';
      }
    },
    { calculatePeriodPayslips: okRun, resetDecision: async () => true }
  );
  const req = await seed(ctx, explanationRequest('2026-10-29'));

  const result = await ctx.service.reviewAndRecalculate(req.id, 'admin', 'APPROVE');

  assert.deepEqual(result.recalculated, [{ month: MONTH, ok: false, error: 'mất kết nối' }]);
  assert.equal(result.request.status, 'APPROVED');
  assert.equal(ctx.repo.storedStatus.get(req.id), 'APPROVED');
  // Phiếu đã về nháp trong giao dịch duyệt; sau commit không biết kỳ ở bước nào thì không tính lại, không đụng phiếu.
  assert.deepEqual(ctx.calls, [['resetDecision', MONTH, req.employeeId, LOCK_TRX]]);
});

test('a status read that fails for one month does not stop the next month', async () => {
  const ctx = withFakeRecalc(
    {
      statusOf: async (trx: unknown, month: string) => {
        if (afterCommit(trx) && month === MONTH) throw new Error('mất kết nối');
        return 'calculated';
      }
    },
    { calculatePeriodPayslips: okRun, resetDecision: async () => true }
  );
  const req = await seed(ctx, leaveRequest('2026-10-30', '2026-11-02'));

  const result = await ctx.service.reviewAndRecalculate(req.id, 'admin', 'APPROVE');

  assert.equal(result.request.status, 'APPROVED');
  assert.deepEqual(result.recalculated, [
    { month: MONTH, ok: false, error: 'mất kết nối' },
    { month: '2026-11', ok: true }
  ]);
  assert.deepEqual(ctx.calls, [
    ['resetDecision', MONTH, req.employeeId, LOCK_TRX],
    ['resetDecision', '2026-11', req.employeeId, LOCK_TRX],
    ['calculatePeriodPayslips', '2026-11', [req.employeeId], 'admin']
  ]);
});

test('a reset that fails after a failed recalculation still reports the recalculation error', async () => {
  const ctx = withFakeRecalc(
    { statusOf: async () => 'calculated' },
    {
      calculatePeriodPayslips: async () => {
        throw new Error('Thiếu cấu hình bậc 9');
      },
      resetDecision: async (_month: string, _employeeId: string, trx?: unknown) => {
        if (afterCommit(trx)) throw new Error('không ghi được phiếu');
        return true;
      }
    }
  );
  const req = await seed(ctx, explanationRequest('2026-10-29'));

  const result = await ctx.service.reviewAndRecalculate(req.id, 'admin', 'APPROVE');

  assert.deepEqual(result.recalculated, [{ month: MONTH, ok: false, error: 'Thiếu cấu hình bậc 9' }]);
  assert.equal(result.request.status, 'APPROVED');
  assert.equal(ctx.repo.storedStatus.get(req.id), 'APPROVED');
  // Lần đưa về nháp sau commit lỗi cũng vô hại: phiếu đã về nháp trong giao dịch duyệt.
  assert.deepEqual(
    ctx.calls.map(c => [c[0], c[3]]),
    [
      ['resetDecision', LOCK_TRX],
      ['calculatePeriodPayslips', 'admin'],
      ['resetDecision', undefined]
    ]
  );
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

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
import { PayrollRepository } from '../../src/modules/payroll/payroll.repository';
import { PayrollService } from '../../src/modules/payroll/payroll.service';
import { PeriodsRepository } from '../../src/modules/periods/periods.repository';
import { PeriodsService } from '../../src/modules/periods/periods.service';
import { SettingsReader } from '../../src/modules/settings/settings-reader';
import { SettingsRepository } from '../../src/modules/settings/settings.repository';
import { withTempDb } from './helpers/pg-temp-db';

const MONTH = '2026-10';

interface Fixture {
  payroll: PayrollService;
  periods: PeriodsService;
}

// Hai nhân sự nv bậc 1 (uuid khác tên đăng nhập), Chốt công tháng 10, tính cả kỳ; sau đó "hôm nay" là 05/11.
async function ready(db: Kysely<DB>, client: Client): Promise<Fixture> {
  await client.query(
    `INSERT INTO staff (username, name, type, level, pass_hash, created_at, contract, uuid)
     VALUES ('pg-user', 'Nhân viên PG', 'nv', 1, 'x', $1, 'long', 'pg-uuid-1'),
            ('pg-user-2', 'Nhân viên PG 2', 'nv', 1, 'x', $1, 'long', 'pg-uuid-2')`,
    [new Date().toISOString()]
  );
  const tx = new TransactionCoordinator(db);
  const periods = new PeriodsService(
    new PeriodsRepository(db),
    tx,
    new AuditLog(new AuditRepository(), new TransactionCoordinator(db))
  );
  periods.now = () => new Date('2026-11-01T08:00:00+07:00');
  // Phiếu dựng từ dòng ngày công (attendance-core T6): bảng lương ghi lại dòng của tháng rồi đọc chúng.
  const days = new AttendanceDaysService(new AttendanceDaysRepository(db), new SettingsAttendanceSettings(new SettingsReader(new SettingsRepository(db))), tx);
  const payroll = new PayrollService(new PayrollRepository(db), undefined, days, tx, periods);
  await periods.lock(MONTH, 'admin');
  await payroll.calculatePeriodPayslips(MONTH, undefined, 'admin');
  periods.now = () => new Date('2026-11-05T09:00:00+07:00');
  return { payroll, periods };
}

const approveAll = async ({ payroll }: Fixture): Promise<void> => {
  await payroll.decidePayslip(MONTH, 'pg-user', 'approved', 'checker', 'ok');
  await payroll.decidePayslip(MONTH, 'pg-user-2', 'approved', 'checker', 'ok');
};

const insertRequest = (client: Client, type: string, col: string, value: string, status = 'PENDING') =>
  client.query(
    `INSERT INTO system_requests (id, employee_id, title, type, reason, status, ${col}, created_at, updated_at)
     VALUES (gen_random_uuid(), 'pg-uuid-1', 't', $1, 'r', $2, $3, now(), now())`,
    [type, status, value]
  );

test('approve is blocked by unapproved payslips, pending requests and people without a payslip', async t => {
  await withTempDb(t, 'periods_appr', async (db, client) => {
    const f = await ready(db, client);
    await f.payroll.decidePayslip(MONTH, 'pg-user', 'approved', 'checker', 'ok');
    await client.query(
      `INSERT INTO system_requests (id, employee_id, title, type, reason, leave_type, leave_start_date, leave_end_date, created_at, updated_at)
       VALUES (gen_random_uuid(), 'pg-uuid-1', 't', 'LEAVE', 'r', 'ANNUAL', '2026-10-30', '2026-10-30', now(), now())`
    );
    await client.query(
      `INSERT INTO staff (username, name, type, level, pass_hash, created_at, contract, uuid, locked_at)
       VALUES ('pg-user-3', 'Nhân viên PG 3', 'nv', 1, 'x', $1, 'long', 'pg-uuid-3', NULL),
              ('pg-user-4', 'Nhân viên PG 4', 'nv', 1, 'x', $1, 'long', 'pg-uuid-4', $1)`,
      [new Date().toISOString()]
    );
    // Tài khoản admin không thuộc diện tính lương: không bao giờ bị tính là "chưa có phiếu".
    await client.query(
      `INSERT INTO staff (username, name, type, level, pass_hash, created_at, contract, uuid, locked_at, role)
       VALUES ('pg-admin', 'Quản trị PG', 'ql', 0, 'x', $1, 'long', 'pg-uuid-admin', NULL, 'admin')`,
      [new Date().toISOString()]
    );

    const blockers = {
      pendingRequests: 1,
      unapprovedSlips: 1,
      missingSlips: [{ username: 'pg-user-3', name: 'Nhân viên PG 3' }],
    };
    await assert.rejects(f.periods.approve(MONTH, 'admin'), (e: any) => {
      assert.equal(e.status, 409);
      assert.equal(e.details.code, 'PERIOD_BLOCKED');
      assert.equal(e.message, 'Còn 1 người chưa có phiếu · 1 phiếu chưa duyệt · 1 đơn chờ duyệt');
      assert.deepEqual(e.details.blockers, blockers);
      return true;
    });
    const view = await f.periods.view(MONTH);
    assert.equal(view.status, 'calculated');
    assert.deepEqual(view.actions.approve, {
      enabled: false,
      reason: 'Còn 1 người chưa có phiếu · 1 phiếu chưa duyệt · 1 đơn chờ duyệt',
      blockers,
    });
    const runs = await client.query("SELECT id FROM payroll_runs WHERE status = 'final'");
    assert.equal(runs.rows.length, 0);
  });
});

// R2 (06/11): "chưa có phiếu" chỉ tính người có làm việc ít nhất một ngày trong tháng (vào làm ≤ cuối tháng, chưa nghỉ
// việc trước đầu tháng); ngoài thời gian làm việc thì không vắng, không lương.
test('people not employed on any day of the month never count as without a payslip', async t => {
  await withTempDb(t, 'periods_appr', async (db, client) => {
    const f = await ready(db, client);
    await approveAll(f);
    await client.query(
      `INSERT INTO staff (username, name, type, level, pass_hash, created_at, contract, uuid, start_date, resigned_on)
       VALUES ('chi', 'Chi vào 11/11', 'nv', 1, 'x', $1, 'long', 'uuid-chi', '2026-11-11', NULL),
              ('dung', 'Dũng nghỉ 30/09', 'nv', 1, 'x', $1, 'long', 'uuid-dung', '2026-01-05', '2026-09-30'),
              ('em', 'Em vào 31/10', 'nv', 1, 'x', $1, 'long', 'uuid-em', '2026-10-31', NULL),
              ('phuong', 'Phương nghỉ 01/10', 'nv', 1, 'x', $1, 'long', 'uuid-phuong', '2026-01-05', '2026-10-01'),
              ('giang', 'Giang nghỉ 30/09 (có khoảng trắng)', 'nv', 1, 'x', $1, 'long', 'uuid-giang', ' ', ' 2026-09-30 '),
              ('hoa', 'Hoa ngày vào sai dạng', 'nv', 1, 'x', $1, 'long', 'uuid-hoa', '11/11/2026', '')`,
      [new Date().toISOString()]
    );
    // Ngày trống hay sai dạng coi như không ghi (Hoa vẫn tính); ngày có khoảng trắng hai đầu vẫn đọc được (Giang không tính).
    const view = await f.periods.view(MONTH);
    assert.deepEqual(view.actions.approve?.blockers?.missingSlips, [
      { username: 'em', name: 'Em vào 31/10' },
      { username: 'hoa', name: 'Hoa ngày vào sai dạng' },
      { username: 'phuong', name: 'Phương nghỉ 01/10' }
    ]);
  });
});

test('a full run skips people not employed in the month, so Chi (from 11/11) never blocks October', async t => {
  await withTempDb(t, 'periods_appr', async (db, client) => {
    await client.query(
      `INSERT INTO staff (username, name, type, level, pass_hash, created_at, contract, uuid, start_date)
       VALUES ('chi', 'Chi vào 11/11', 'nv', 1, 'x', $1, 'long', 'uuid-chi', '2026-11-11')`,
      [new Date().toISOString()]
    );
    const f = await ready(db, client);
    const slips = await client.query(
      `SELECT p.username FROM payslips p JOIN payroll_runs r ON r.id = p.run_id WHERE r.month = $1 ORDER BY p.username`,
      [MONTH]
    );
    assert.deepEqual(slips.rows.map(r => r.username), ['pg-user', 'pg-user-2']);
    await approveAll(f);
    assert.equal((await f.periods.approve(MONTH, 'admin')).status, 'approved');
  });
});

test('a pending request of another month does not block', async t => {
  await withTempDb(t, 'periods_appr', async (db, client) => {
    const f = await ready(db, client);
    await approveAll(f);
    await insertRequest(client, 'OVERTIME', 'ot_date', '2026-11-03');
    const view = await f.periods.view(MONTH);
    assert.deepEqual(view.actions.approve, {
      enabled: true,
      blockers: { pendingRequests: 0, unapprovedSlips: 0, missingSlips: [] },
    });
    assert.equal((await f.periods.approve(MONTH, 'admin')).status, 'approved');
  });
});

test('pending makeup and iSAT dates count, decided requests do not', async t => {
  await withTempDb(t, 'periods_appr', async (db, client) => {
    const f = await ready(db, client);
    await approveAll(f);
    // Đơn nghỉ có làm bù: nghỉ tháng 11, nhưng ngày làm bù rơi vào tháng 10.
    const makeup = (
      await client.query(
        `INSERT INTO system_requests (id, employee_id, title, type, reason, leave_type, leave_start_date, leave_end_date, created_at, updated_at)
         VALUES (gen_random_uuid(), 'pg-uuid-1', 't', 'LEAVE_WITH_MAKEUP', 'r', 'ANNUAL', '2026-11-04', '2026-11-04', now(), now())
         RETURNING id`
      )
    ).rows[0].id;
    await client.query(
      `INSERT INTO makeup_slots (request_id, work_date, start_time, end_time, work_minutes) VALUES ($1, '2026-10-31', '08:00', '17:00', 480)`,
      [makeup]
    );
    // Đơn iSAT đã duyệt: không tính dù Thứ Bảy nằm trong tháng 10.
    const isat = (
      await client.query(
        `INSERT INTO system_requests (id, employee_id, title, type, reason, status, created_at, updated_at)
         VALUES (gen_random_uuid(), 'pg-uuid-1', 't', 'ISAT', 'r', 'APPROVED', now(), now()) RETURNING id`
      )
    ).rows[0].id;
    await client.query(
      `INSERT INTO isat_registrations (request_id, saturday, full_name, team, position_type, position_level, shift_type, shift_start_time, shift_end_time)
       VALUES ($1, '2026-10-17', 'n', 't', 'nv', 1, 'NORMAL', '08:00', '17:00')`,
      [isat]
    );
    const view = await f.periods.view(MONTH);
    assert.equal(view.actions.approve?.blockers?.pendingRequests, 1);
    assert.equal(view.actions.approve?.reason, 'Còn 1 đơn chờ duyệt');
  });
});

// Đơn chờ của mọi loại chạm tới tháng 10 thì tính, kể cả khoảng ngày đi qua cả tháng 10; đơn chỉ ở tháng khác thì không.
test('pending requests count by the months they touch: ranges across October, each date kind, and nothing outside', async t => {
  await withTempDb(t, 'periods_appr', async (db, client) => {
    const f = await ready(db, client);
    await approveAll(f);
    const add = async (type: string, cols: Record<string, string>): Promise<string> => {
      const names = Object.keys(cols).map(n => `${n}, `).join('');
      const values = Object.values(cols);
      const placeholders = values.map((_, i) => `$${i + 2}, `).join('');
      return (
        await client.query(
          `INSERT INTO system_requests (id, employee_id, title, type, reason, ${names}created_at, updated_at)
           VALUES (gen_random_uuid(), 'pg-uuid-1', 't', $1, 'r', ${placeholders}now(), now()) RETURNING id`,
          [type, ...values]
        )
      ).rows[0].id;
    };
    // Tính (7): nghỉ 30/09–01/11 đi qua cả tháng 10; nghỉ 31/10–02/11; đổi ca 28/09–01/10; OT 01/10; giải trình 31/10;
    // tạm ứng kỳ 2026-10; iSAT chờ duyệt Thứ Bảy 24/10.
    await add('LEAVE', { leave_type: 'ANNUAL', leave_start_date: '2026-09-30', leave_end_date: '2026-11-01' });
    await add('LEAVE', { leave_type: 'ANNUAL', leave_start_date: '2026-10-31', leave_end_date: '2026-11-02' });
    await add('SHIFT_CHANGE', { change_start_date: '2026-09-28', change_end_date: '2026-10-01' });
    await add('OVERTIME', { ot_date: '2026-10-01' });
    await add('EXPLANATION', { explanation_date: '2026-10-31' });
    await add('ADVANCE', { advance_period: '2026-10' });
    const isat = await add('ISAT', {});
    await client.query(
      `INSERT INTO isat_registrations (request_id, saturday, full_name, team, position_type, position_level, shift_type, shift_start_time, shift_end_time)
       VALUES ($1, '2026-10-24', 'n', 't', 'nv', 1, 'NORMAL', '08:00', '17:00')`,
      [isat]
    );
    // Không tính (5): nghỉ cả trong tháng 9; đổi ca 01–02/11; OT 30/09; tạm ứng kỳ 2026-11; làm bù chỉ trong tháng 11.
    await add('LEAVE', { leave_type: 'ANNUAL', leave_start_date: '2026-09-01', leave_end_date: '2026-09-30' });
    await add('SHIFT_CHANGE', { change_start_date: '2026-11-01', change_end_date: '2026-11-02' });
    await add('OVERTIME', { ot_date: '2026-09-30' });
    await add('ADVANCE', { advance_period: '2026-11' });
    const makeup = await add('LEAVE_WITH_MAKEUP', { leave_type: 'ANNUAL', leave_start_date: '2026-11-03', leave_end_date: '2026-11-03' });
    await client.query(
      `INSERT INTO makeup_slots (request_id, work_date, start_time, end_time, work_minutes) VALUES ($1, '2026-11-07', '08:00', '17:00', 480)`,
      [makeup]
    );
    assert.equal((await f.periods.view(MONTH)).actions.approve?.blockers?.pendingRequests, 7);
  });
});

test('approve freezes the run', async t => {
  await withTempDb(t, 'periods_appr', async (db, client) => {
    const f = await ready(db, client);
    await approveAll(f);
    const view = await f.periods.approve(MONTH, 'boss');
    assert.equal(view.status, 'approved');
    assert.equal(view.steps.approvedBy, 'boss');
    assert.ok(view.steps.approvedAt);

    const run = (await client.query('SELECT id, status FROM payroll_runs WHERE month = $1', [MONTH])).rows;
    assert.equal(run.length, 1);
    assert.equal(run[0].status, 'final');
    const period = await new PeriodsRepository(db).find(MONTH);
    assert.equal(Number(period?.current_run_id), Number(run[0].id));

    await assert.rejects(
      client.query("UPDATE payslips SET note = 'x' WHERE run_id = $1", [run[0].id]),
      (e: any) => e.code === '23000'
    );
    const audit = await client.query("SELECT actor, before_json, after_json FROM audit_log WHERE action = 'period.approve'");
    assert.equal(audit.rows.length, 1);
    assert.equal(audit.rows[0].actor, 'boss');
    assert.equal(audit.rows[0].before_json, '{"status":"calculated"}');
    assert.equal(audit.rows[0].after_json, '{"status":"approved"}');
  });
});

test('two approves at once: one wins', async t => {
  await withTempDb(t, 'periods_appr', async (db, client) => {
    const f = await ready(db, client);
    await approveAll(f);
    const results = await Promise.allSettled([f.periods.approve(MONTH, 'a'), f.periods.approve(MONTH, 'b')]);
    assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
    const rejected = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
    assert.equal(rejected.length, 1);
    assert.equal((rejected[0].reason as any).details.code, 'PERIOD_STATE');
    const finals = await client.query("SELECT count(*)::int AS n FROM payroll_runs WHERE month = $1 AND status = 'final'", [MONTH]);
    assert.equal(finals.rows[0].n, 1);
    const audit = await client.query("SELECT 1 FROM audit_log WHERE action = 'period.approve'");
    assert.equal(audit.rows.length, 1);
  });
});

test('unlock is not allowed after approval', async t => {
  await withTempDb(t, 'periods_appr', async (db, client) => {
    const f = await ready(db, client);
    await approveAll(f);
    await f.periods.approve(MONTH, 'admin');
    await assert.rejects(
      f.periods.unlock(MONTH, 'admin', 'lý do'),
      (e: any) => e.status === 409 && e.details.code === 'PERIOD_STATE'
    );
  });
});

test('unapprove keeps the approved payslips in a new draft run', async t => {
  await withTempDb(t, 'periods_appr', async (db, client) => {
    const f = await ready(db, client);
    await approveAll(f);
    await f.periods.approve(MONTH, 'admin');
    const before = (await client.query('SELECT * FROM payroll_runs WHERE month = $1', [MONTH])).rows[0];
    const slipsBefore = (await client.query('SELECT * FROM payslips WHERE run_id = $1 ORDER BY username', [before.id])).rows;
    assert.equal(slipsBefore.length, 2);

    await assert.rejects(
      f.periods.unapprove(MONTH, 'admin', '   '),
      (e: any) => e.status === 400 && e.details.code === 'REASON_REQUIRED'
    );
    assert.equal((await f.periods.view(MONTH)).status, 'approved');

    const view = await f.periods.unapprove(MONTH, 'admin', '  sai KPI Bình ');
    assert.equal(view.status, 'calculated');
    assert.equal(view.steps.approvedAt, null);
    assert.equal(view.steps.approvedBy, null);
    assert.ok(view.actions.unlock);

    const runs = (await client.query('SELECT * FROM payroll_runs WHERE month = $1 ORDER BY run_no', [MONTH])).rows;
    assert.equal(runs.length, 2);
    assert.equal(runs[0].id, before.id);
    assert.equal(runs[0].status, 'superseded');
    assert.equal(runs[1].status, 'draft');
    assert.equal(Number(runs[1].run_no), Number(before.run_no) + 1);
    assert.equal(runs[1].created_by, 'admin');
    assert.equal(runs[1].engine_version, before.engine_version);
    assert.equal(runs[1].params_hash, before.params_hash);
    assert.equal(runs[1].params_json, before.params_json);
    assert.equal(runs[1].switches_json, before.switches_json);
    assert.equal(Number(runs[1].slips_total), Number(before.slips_total));
    assert.equal(runs[1].created_at, runs[1].finished_at);

    const slips = (await client.query('SELECT * FROM payslips WHERE run_id = $1 ORDER BY username', [runs[1].id])).rows;
    assert.equal(slips.length, 2);
    slips.forEach((s, i) => {
      const old = slipsBefore[i];
      assert.equal(s.username, old.username);
      assert.equal(s.status, 'approved');
      assert.equal(s.decided_by, 'checker');
      assert.equal(s.decided_at, old.decided_at);
      assert.equal(s.note, 'ok');
      assert.equal(Number(s.rev), Number(old.rev));
      assert.equal(Number(s.net), Number(old.net));
      assert.equal(s.override_json, old.override_json);
      assert.equal(s.flags_json, old.flags_json);
      assert.ok(Buffer.compare(s.snapshot_gz, old.snapshot_gz) === 0);
    });
    // Phiếu của lần chạy cũ không đổi.
    const old = (await client.query('SELECT count(*)::int AS n FROM payslips WHERE run_id = $1', [before.id])).rows[0];
    assert.equal(old.n, 2);

    const period = await new PeriodsRepository(db).find(MONTH);
    assert.equal(Number(period?.current_run_id), Number(runs[1].id));
    const listed = await f.payroll.listPayslips(MONTH);
    assert.equal(listed.length, 2);
    assert.ok(listed.every(s => s.runId === Number(runs[1].id) && s.status === 'approved'));

    const audit = await client.query("SELECT reason, before_json, after_json FROM audit_log WHERE action = 'period.unapprove'");
    assert.equal(audit.rows.length, 1);
    assert.equal(audit.rows[0].reason, 'sai KPI Bình');
    assert.equal(audit.rows[0].before_json, '{"status":"approved"}');
    assert.equal(audit.rows[0].after_json, '{"status":"calculated"}');

    // Sau Huỷ phê duyệt tính lại được, rồi phê duyệt lại được.
    await f.payroll.calculatePeriodPayslips(MONTH, undefined, 'admin');
    await approveAll(f);
    assert.equal((await f.periods.approve(MONTH, 'admin')).status, 'approved');
  });
});

test('unapprove with a reason over 1000 characters is a 400, a trimmed 1000 is fine', async t => {
  await withTempDb(t, 'periods_appr', async (db, client) => {
    const f = await ready(db, client);
    await approveAll(f);
    await f.periods.approve(MONTH, 'admin');
    const runs = () => client.query('SELECT count(*)::int AS n FROM payroll_runs WHERE month = $1', [MONTH]).then(r => r.rows[0].n);
    const runsBefore = await runs();

    await assert.rejects(f.periods.unapprove(MONTH, 'admin', 'x'.repeat(1001)), (e: any) => {
      assert.equal(e.status, 400);
      assert.equal(e.details.code, 'REASON_TOO_LONG');
      assert.equal(e.message, 'Lý do tối đa 1000 ký tự');
      return true;
    });
    assert.equal((await f.periods.view(MONTH)).status, 'approved');
    assert.equal(await runs(), runsBefore);
    await assert.rejects(f.periods.unapprove(MONTH, 'admin', 'Sửa KPI\u0000'), (e: any) => {
      assert.equal(e.status, 400);
      assert.deepEqual(e.details, { code: 'REASON_INVALID' });
      return true;
    });
    assert.equal((await f.periods.view(MONTH)).status, 'approved');
    assert.equal(await runs(), runsBefore);

    const view = await f.periods.unapprove(MONTH, 'admin', ` ${'y'.repeat(1000)}  `);
    assert.equal(view.status, 'calculated');
    const audit = await client.query("SELECT reason FROM audit_log WHERE action = 'period.unapprove'");
    assert.deepEqual(audit.rows, [{ reason: 'y'.repeat(1000) }]);
  });
});

test('pay only from payday, then nothing more', async t => {
  await withTempDb(t, 'periods_appr', async (db, client) => {
    const f = await ready(db, client);
    await approveAll(f);
    await f.periods.approve(MONTH, 'admin');

    f.periods.now = () => new Date('2026-11-09T12:00:00+07:00');
    assert.equal((await f.periods.view(MONTH)).actions.pay, undefined);
    await assert.rejects(
      f.periods.pay(MONTH, 'admin'),
      (e: any) => e.status === 409 && e.details.code === 'BEFORE_PAYDAY' && e.details.payday === '2026-11-10'
    );
    assert.equal((await f.periods.view(MONTH)).status, 'approved');

    f.periods.now = () => new Date('2026-11-10T00:30:00+07:00');
    const view = await f.periods.pay(MONTH, 'boss');
    assert.equal(view.status, 'paid');
    assert.equal(view.steps.paidBy, 'boss');
    assert.ok(view.steps.paidAt);
    assert.deepEqual(view.actions, {});
    await assert.rejects(
      f.periods.unapprove(MONTH, 'admin', 'lý do'),
      (e: any) => e.status === 409 && e.details.code === 'PERIOD_STATE'
    );
    await assert.rejects(
      f.periods.pay(MONTH, 'admin'),
      (e: any) => e.status === 409 && e.details.code === 'PERIOD_STATE'
    );
    const audit = await client.query("SELECT actor FROM audit_log WHERE action = 'period.pay'");
    assert.deepEqual(audit.rows, [{ actor: 'boss' }]);
  });
});

// Kho cài đặt bắt đầu từ 2000-01 (dữ liệu nạp sẵn): tháng trước đó không có ngày trả lương, nên không có kỳ lương.
test('a month before the first settings version is a 400 NO_SETTINGS, not a 500, and locking it saves nothing', async t => {
  await withTempDb(t, 'periods_appr', async (db, client) => {
    const periods = new PeriodsService(
      new PeriodsRepository(db),
      new TransactionCoordinator(db),
      new AuditLog(new AuditRepository(), new TransactionCoordinator(db)),
      new SettingsReader(new SettingsRepository(db))
    );
    periods.now = () => new Date('2026-11-05T09:00:00+07:00');
    const noSettings = (e: any) => {
      assert.equal(e.status, 400);
      assert.deepEqual(e.details, { code: 'NO_SETTINGS', month: '1999-12' });
      assert.equal(e.message, 'Tháng 12/1999 chưa có cài đặt lương');
      return true;
    };
    await assert.rejects(periods.view('1999-12'), noSettings);
    await assert.rejects(periods.lock('1999-12', 'admin'), noSettings);
    assert.equal(Number((await client.query('SELECT count(*) AS n FROM payroll_periods')).rows[0].n), 0);
    assert.equal((await periods.view('2000-01')).payday, '2000-02-10');
  });
});

test('pay follows the payday set in the settings store (Lịch trả lương), read for the month of the period', async t => {
  await withTempDb(t, 'periods_appr', async (db, client) => {
    const f = await ready(db, client);
    await approveAll(f);
    await f.periods.approve(MONTH, 'admin');
    // Từ tháng 10: trả lương ngày 15 tháng sau. Tháng 11 trở đi về lại ngày 10, để thấy ngày đọc theo tháng của kỳ.
    await client.query(
      `INSERT INTO pay_calendar (effective_month, pay_day, updated_by, updated_at)
       VALUES ('2026-10', 15, 'admin', now()), ('2026-11', 10, 'admin', now())`
    );
    const periods = new PeriodsService(
      new PeriodsRepository(db),
      new TransactionCoordinator(db),
      new AuditLog(new AuditRepository(), new TransactionCoordinator(db)),
      new SettingsReader(new SettingsRepository(db))
    );

    periods.now = () => new Date('2026-11-14T12:00:00+07:00');
    const before = await periods.view(MONTH);
    assert.equal(before.payday, '2026-11-15');
    assert.equal(before.actions.pay, undefined);
    await assert.rejects(periods.pay(MONTH, 'admin'), (e: any) => {
      assert.equal(e.status, 409);
      assert.deepEqual(e.details, { code: 'BEFORE_PAYDAY', payday: '2026-11-15' });
      assert.equal(e.message, 'Chưa tới ngày trả lương 15/11/2026');
      return true;
    });
    assert.equal((await periods.view(MONTH)).status, 'approved');
    // Tháng 11 đọc phiên bản của chính nó (ngày 10).
    assert.equal((await periods.view('2026-11')).payday, '2026-12-10');

    periods.now = () => new Date('2026-11-15T00:30:00+07:00');
    assert.deepEqual((await periods.view(MONTH)).actions.pay, { enabled: true });
    const view = await periods.pay(MONTH, 'boss');
    assert.equal(view.status, 'paid');
    assert.equal(view.payday, '2026-11-15');
  });
});

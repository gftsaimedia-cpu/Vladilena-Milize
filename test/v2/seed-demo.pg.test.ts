import assert from 'node:assert/strict';
import { test } from 'node:test';
import { seedDemo } from '../../scripts/dev/seed-demo/index';

// Cần PostgreSQL thật (PG_TEST_URL, vai trò được CREATE/DROP DATABASE). Nạp DB demo 3 tháng vào một DB tạm
// rồi đếm từng trường hợp kịch bản phải có (docs/superpowers/specs/2026-11-06-demo-db-scenario.md).
const CONTROL_URL = process.env.PG_TEST_URL;

test('DB demo 3 tháng: mọi trường hợp của kịch bản đều có dữ liệu', { timeout: 300_000 }, async t => {
  if (!CONTROL_URL) {
    t.skip('PG_TEST_URL chưa đặt');
    return;
  }
  const name = `seed_demo_${process.pid}_${Date.now()}`;
  const url = new URL(CONTROL_URL);
  url.pathname = `/${name}`;
  const demo = await seedDemo(url.toString());
  try {
    const q = (sql: string, params: unknown[] = []) => demo.q(sql, params);

    // Kỳ lương: tháng 9 đã trả, tháng 10 đã phê duyệt, tháng 11 chưa có kỳ.
    assert.deepEqual(
      (await q(`SELECT month, status FROM payroll_periods ORDER BY month`)).map(r => [r.month, r.status]),
      [['2026-09', 'paid'], ['2026-10', 'approved']]
    );

    // Mỗi loại đơn có đủ trạng thái đã nêu trong kịch bản.
    const have = new Set((await q(`SELECT type || '/' || status AS k FROM system_requests`)).map(r => r.k));
    for (const k of [
      'LEAVE/APPROVED', 'LEAVE/REJECTED', 'LEAVE/CANCELLED', 'LEAVE/PENDING',
      'LEAVE_WITH_MAKEUP/APPROVED', 'LEAVE_WITH_MAKEUP/REJECTED', 'LEAVE_WITH_MAKEUP/PENDING',
      'OVERTIME/APPROVED', 'OVERTIME/REJECTED', 'OVERTIME/CANCELLED', 'OVERTIME/PENDING',
      'SHIFT_CHANGE/APPROVED', 'SHIFT_CHANGE/REJECTED', 'SHIFT_CHANGE/PENDING',
      'ADVANCE/APPROVED', 'ADVANCE/REJECTED', 'ADVANCE/CANCELLED',
      'EXPLANATION/APPROVED', 'EXPLANATION/REJECTED', 'EXPLANATION/CANCELLED', 'EXPLANATION/PENDING',
      'ISAT/APPROVED', 'ISAT/PENDING'
    ]) {
      assert.ok(have.has(k), `thiếu đơn ${k}`);
    }

    // Đủ 6 loại nghỉ đã duyệt.
    const leaveTypes = new Set((await q(`SELECT DISTINCT leave_type FROM system_requests WHERE type='LEAVE' AND status='APPROVED'`)).map(r => r.leave_type));
    for (const k of ['ANNUAL', 'PERSONAL_PAID', 'PERSONAL_UNPAID', 'SOCIAL_INSURANCE', 'WELFARE', 'UNPAID']) assert.ok(leaveTypes.has(k), `thiếu loại nghỉ ${k}`);

    // Phiếu lương: mọi người có phiếu ở hai kỳ; kỳ trả/phê duyệt đều đã duyệt; một phiếu từng bị từ chối (lần chạy cũ).
    for (const month of ['2026-09', '2026-10']) {
      const slips = await q(
        `SELECT s.username, s.status FROM payslips s JOIN payroll_periods p ON p.current_run_id = s.run_id WHERE p.month = $1`,
        [month]
      );
      // Người đã nghỉ việc (tài khoản khoá) không có phiếu theo R2 của thiết kế kỳ lương: tháng 10 thiếu `minh`.
      assert.equal(slips.length, month === '2026-09' ? 13 : 12, `${month}: số phiếu`);
      assert.ok(slips.every(s => s.status === 'approved'), `${month}: mọi phiếu đã duyệt`);
    }
    assert.ok(Number((await q(`SELECT count(*) n FROM payslips WHERE status = 'rejected'`))[0].n) >= 1, 'có phiếu từng bị từ chối');
    assert.ok(Number((await q(`SELECT count(*) n FROM kpi_scores`))[0].n) >= 1, 'có KPI');

    // Chấm công: có ngày đi muộn, ra sớm, thiếu giờ, vắng, ca đêm, OT cuối tuần và hôm nay.
    const days = new Set((await q(`SELECT DISTINCT status FROM timesheet_entries`)).map(r => r.status));
    for (const k of ['PRESENT', 'ABSENT', 'HOLIDAY', 'LEAVE_PAID', 'LEAVE_UNPAID', 'LEAVE_MAKEUP', 'ISAT', 'EXTRA', 'PENDING']) assert.ok(days.has(k), `thiếu trạng thái ngày ${k}`);
    assert.equal(Number((await q(`SELECT count(*) n FROM timesheet_entries WHERE work_date < '2026-09-01' AND status <> 'OUTSIDE'`))[0].n), 0, 'trước kỳ demo chỉ có ngày ngoài thời gian làm việc');
    assert.ok(Number((await q(`SELECT count(*) n FROM punch_events`))[0].n) > 1000, 'đủ lượt chấm công');
    assert.equal(Number((await q(`SELECT count(*) n FROM punch_events WHERE work_date = '2026-11-06'`))[0].n), 3, 'hôm nay: 3 người đã vào');

    // Nhân sự: đủ trạng thái và phòng ban.
    const emp = await demo.admin.get('/api/v2/employees');
    assert.equal(emp.status, 200);
    const status = new Map<string, string>(emp.body.employees.map((e: any) => [e.account.username, e.staffStatus]));
    assert.equal(status.get('khoa'), 'probation');
    assert.equal(status.get('lan'), 'on_leave');
    assert.equal(status.get('minh'), 'resigned');
    assert.equal(status.get('an'), 'working');
    assert.equal(emp.body.employees.find((e: any) => e.account.username === 'oanh').departmentId, null);

    // Nhật ký còn nguyên chuỗi băm và nhân viên đăng nhập được.
    const verify = await demo.admin.get('/api/v2/system/audit/verify');
    assert.equal(verify.status, 200, JSON.stringify(verify.body));
    assert.equal((await demo.as('an').get('/api/v2/me/profile')).status, 200);
  } finally {
    await demo.stop();
    const { Client } = await import('pg');
    const control = new Client({ connectionString: CONTROL_URL });
    await control.connect();
    await control.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
    await control.end();
  }
});

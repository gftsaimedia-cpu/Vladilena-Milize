import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import { ADMIN, type Api, ScenarioEnv, ZONE, msg, workDay } from '../helpers/scenario-env';

// Toàn vẹn dữ liệu sau một chuỗi thao tác hỗn hợp (chấm công, đơn từ, kỳ lương, hồ sơ, cài đặt), kiểm bằng SQL trực tiếp.
const env = new ScenarioEnv();
const enabled = ScenarioEnv.enabled();
let admin: Api;
let nv1: Api;
let nv2: Api;

before(async () => {
  if (enabled) await env.start('sc_integrity');
});
after(async () => {
  if (enabled) await env.stop();
});
beforeEach(async () => {
  if (!enabled) return;
  await env.reset();
  await env.staff({ username: 'nv1', leaveTotal: 6 });
  await env.staff({ username: 'nv2', contract: 'short' });
  env.at('2026-10-20T09:00:00+07:00');
  admin = await env.login(ADMIN);
  nv1 = await env.login('nv1');
  nv2 = await env.login('nv2');
});

const IN = { kind: 'IN', lat: ZONE.lat, lng: ZONE.lng, accuracyM: 5 };

/** Chạy một chuỗi thao tác đa dạng, kể cả thao tác sẽ bị từ chối; không được ném lỗi 5xx. */
async function churn(): Promise<void> {
  const all: Array<Promise<{ status: number }> | { status: number }> = [];
  const track = async (p: Promise<{ status: number }>) => {
    const r = await p;
    assert.ok(r.status < 500, `5xx: ${JSON.stringify(r)}`);
    return r;
  };
  const u1 = env.uuid('nv1');
  const u2 = env.uuid('nv2');
  for (const d of ['01', '02', '03', '05', '06', '07', '08', '09', '10']) {
    await track(workDay(admin, u1, `2026-10-${d}`).then(r => r[1]));
    await track(workDay(admin, u2, `2026-10-${d}`, '08:40', '16:30').then(r => r[1]));
  }
  // Đơn từ: nghỉ, OT, đổi ca, giải trình, iSAT; duyệt/từ chối/huỷ lẫn lộn.
  const leave = await track(nv1.post('/api/v2/me/requests/leave', { leaveType: 'ANNUAL', reason: 'x', startDate: '2026-10-22', endDate: '2026-10-23' }));
  const ot = await track(nv1.post('/api/v2/me/requests/overtime', { reason: 'x', otDate: '2026-10-26', startTime: '18:00', endTime: '21:00' }));
  const sc = await track(nv2.post('/api/v2/me/requests/shift-change', { reason: 'x', startDate: '2026-10-27', endDate: '2026-10-28', shiftType: 'FLEX', startTime: '13:00' }));
  const ex = await track(nv2.post('/api/v2/me/requests/explanation', { reason: 'x', workDate: '2026-10-02' }));
  await track(nv2.post('/api/v2/me/requests/isat', { saturday: '2026-10-24', team: 'T', conditions: { NO_VIOLATION: true, REPORTS_DONE: true, WORK_COMPLETED: true, OFFICIAL_EMPLOYEE: true } }));
  const body = (r: any) => (r as any).body?.request?.id as string;
  await track(admin.patch(`/api/v2/requests/${body(leave)}/review`, { action: 'APPROVE', note: 'ok' }));
  await track(admin.patch(`/api/v2/requests/${body(ot)}/review`, { action: 'REJECT' }));
  await track(nv2.patch(`/api/v2/me/requests/${body(sc)}/cancel`, {}));
  await track(admin.patch(`/api/v2/requests/${body(ex)}/review`, { action: 'APPROVE' }));
  await track(admin.patch(`/api/v2/requests/${body(ex)}/review`, { action: 'APPROVE' })); // lần hai: bị từ chối
  await track(admin.post('/api/v2/holidays', { date: '2026-10-29', name: 'Lễ' }));
  await track(admin.post('/api/v2/requests/advance', { employeeId: 'nv1', period: '2026-10' }));
  // Chấm đồng thời + tài khoản
  env.at('2026-10-21T08:00:00+07:00');
  await Promise.all([nv1.post('/api/v2/me/punches', IN), nv1.post('/api/v2/me/punches', IN), nv2.post('/api/v2/me/punches', IN)]);
  await track(admin.put('/api/v2/employees/nv2', { dependants: 1 }));
  // Kỳ lương đầy đủ
  env.at('2026-11-02T09:00:00+07:00');
  await track(admin.post('/api/v2/system/periods/2026-10/lock'));
  await track(admin.post('/api/v2/payroll/2026-10/calculate', {}));
  await track(admin.post('/api/v2/payroll/2026-10/nv1/decision', { decision: 'approve' }));
  await track(admin.post('/api/v2/payroll/2026-10/nv2/decision', { decision: 'reject', note: 'thiếu giờ' }));
  await track(admin.post('/api/v2/system/periods/2026-10/unlock', { reason: 'Sửa công nv2' }));
  await track(workDay(admin, u2, '2026-10-12').then(r => r[1]));
  await track(admin.post('/api/v2/system/periods/2026-10/lock'));
  await track(admin.post('/api/v2/payroll/2026-10/calculate', {}));
  void all;
}

describe('toàn vẹn dữ liệu', { skip: !enabled }, () => {
  it('sau chuỗi thao tác hỗn hợp: chuỗi băm nhật ký hợp lệ và các bất biến SQL đều đúng', async () => {
    await churn();

    const verify = await admin.get('/api/v2/system/audit/verify');
    assert.equal(verify.status, 200, msg(verify));
    assert.equal(verify.body.ok, true, JSON.stringify(verify.body));

    // 1. Mỗi (người, ngày) tối đa một dòng công; mỗi (người, ngày) một dòng day_status.
    assert.equal((await env.q(`SELECT 1 FROM timesheet_entries GROUP BY employee_id, work_date HAVING count(*) > 1`)).length, 0);
    assert.equal((await env.q(`SELECT 1 FROM day_status GROUP BY employee_id, work_date HAVING count(*) > 1`)).length, 0);

    // 2. Công/giờ không âm vô lý; giờ ra không trước giờ vào.
    const bad = await env.q(`SELECT employee_id, work_date::text d FROM timesheet_entries
       WHERE work_hours < 0 OR ot_hours < 0 OR late_minutes < 0 OR early_minutes < 0 OR deduction_minutes < 0 OR makeup_minutes < 0
          OR work_units < 0 OR pay_units NOT IN (0, 1)
          OR (actual_check_in IS NOT NULL AND actual_check_out IS NOT NULL AND actual_check_out < actual_check_in)`);
    assert.deepEqual(bad, []);

    // 3. Mỗi dòng công khớp lần chấm: giờ vào = lần IN sớm nhất, giờ ra = lần OUT muộn nhất của ngày công.
    const mismatch = await env.q(`
      SELECT t.employee_id, t.work_date::text d FROM timesheet_entries t
       WHERE t.actual_check_in IS DISTINCT FROM (SELECT min(punched_at) FROM punch_events p WHERE p.employee_id = t.employee_id AND p.work_date = t.work_date AND p.type = 'IN')
          OR t.actual_check_out IS DISTINCT FROM (SELECT max(punched_at) FROM punch_events p WHERE p.employee_id = t.employee_id AND p.work_date = t.work_date AND p.type = 'OUT')`);
    assert.deepEqual(mismatch, [], 'dòng công lệch với lần chấm');

    // 4. Ngày công của lần chấm đúng ngày VN của thời điểm chấm (ca ngày).
    const wrongDay = await env.q(`SELECT id FROM punch_events WHERE work_date <> (punched_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date`);
    assert.deepEqual(wrongDay, []);

    // 5. day_status chỉ trỏ tới đơn đang chờ/đã duyệt; mọi đơn nghỉ đã duyệt có lịch ON_LEAVE tương ứng, và ngược lại.
    assert.deepEqual(await env.q(`SELECT d.request_id FROM day_status d JOIN system_requests r ON r.id = d.request_id WHERE r.status NOT IN ('PENDING','APPROVED')`), []);
    assert.deepEqual(await env.q(`SELECT w.id FROM work_schedules w LEFT JOIN system_requests r ON r.id = w.source_request_id WHERE w.status = 'ON_LEAVE' AND (r.id IS NULL OR r.status <> 'APPROVED')`), []);
    assert.deepEqual(await env.q(`SELECT d.request_id FROM day_status d JOIN system_requests r ON r.id = d.request_id
        WHERE r.status = 'APPROVED' AND d.status = 'LEAVE' AND NOT EXISTS (SELECT 1 FROM work_schedules w WHERE w.employee_id = d.employee_id AND w.work_date = d.work_date AND w.status = 'ON_LEAVE')`), []);

    // 6. Phiếu: net = gross − BH − thuế − ứng; mỗi người một phiếu mỗi run; không số âm ở các khoản trừ.
    const slips = await env.q(`SELECT username, gross, insurance, tax, advance, net FROM payslips WHERE gross IS NOT NULL`);
    assert.ok(slips.length > 0);
    for (const s of slips) {
      assert.equal(Number(s.net), Number(s.gross) - Number(s.insurance) - Number(s.tax) - Number(s.advance), s.username);
      assert.ok(Number(s.insurance) >= 0 && Number(s.tax) >= 0 && Number(s.advance) >= 0 && Number(s.gross) >= 0, s.username);
    }
    assert.equal((await env.q(`SELECT 1 FROM payslips GROUP BY run_id, username HAVING count(*) > 1`)).length, 0);
    // Tổng phiếu của lần chạy hiện tại = tổng thành phần đã công bố ở API.
    const items = (await admin.get('/api/v2/payroll/2026-10')).body.items as any[];
    const sum = (k: string) => items.reduce((a, i) => a + Number(i[k]), 0);
    assert.equal(sum('net'), sum('gross') - sum('insurance') - sum('tax') - sum('advance'));

    // 7. Kỳ chỉ có một lần chạy hiện hành, trỏ tới run chưa bị thay thế.
    const period = (await env.q(`SELECT status, current_run_id FROM payroll_periods WHERE month = '2026-10'`))[0];
    assert.equal(period.status, 'calculated');
    const run = (await env.q(`SELECT status FROM payroll_runs WHERE id = $1`, [period.current_run_id]))[0];
    assert.equal(run.status, 'draft');
    assert.equal((await env.q(`SELECT 1 FROM payroll_runs WHERE month = '2026-10' AND status = 'draft'`)).length, 1);

    // 8. Mốc thời gian nhật ký là ISO UTC (hậu tố Z) và không đi lùi theo thứ tự id.
    const audit = await env.q(`SELECT id, at FROM audit_log ORDER BY id`);
    assert.ok(audit.length > 5);
    let last = 0;
    for (const a of audit) {
      assert.match(a.at, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/);
      const t = Date.parse(a.at);
      assert.ok(t >= last, `nhật ký #${a.id} lùi giờ`);
      last = t;
    }
  });

  it('phá chuỗi băm nhật ký (sửa ngoài luồng) bị verify phát hiện', async () => {
    await admin.post('/api/v2/holidays', { date: '2026-11-10', name: 'Lễ A' });
    await admin.post('/api/v2/holidays', { date: '2026-11-11', name: 'Lễ B' });
    assert.equal((await admin.get('/api/v2/system/audit/verify')).body.ok, true);
    // Trigger chặn UPDATE; tắt trigger như người có quyền DB sửa tay.
    await env.q(`ALTER TABLE audit_log DISABLE TRIGGER audit_log_no_update`);
    await env.q(`UPDATE audit_log SET reason = 'sửa tay' WHERE id = (SELECT min(id) FROM audit_log)`);
    await env.q(`ALTER TABLE audit_log ENABLE TRIGGER audit_log_no_update`);
    const v = await admin.get('/api/v2/system/audit/verify');
    assert.equal(v.body.ok, false, JSON.stringify(v.body));
  });

  it('ràng buộc DB không thể bị bypass qua API: pay_units chỉ 0/1, status hợp lệ, UNIQUE công (người, ngày)', async () => {
    const u = env.uuid('nv1');
    await workDay(admin, u, '2026-10-05');
    await assert.rejects(env.q(`UPDATE timesheet_entries SET pay_units = 0.5`), /pay_units|check/i);
    await assert.rejects(env.q(`UPDATE timesheet_entries SET status = 'KHONG_CO'`), /check/i);
    await assert.rejects(
      env.q(`INSERT INTO timesheet_entries (id, employee_id, work_date, status, created_at, updated_at) VALUES (gen_random_uuid(), $1, '2026-10-05', 'REST', now(), now())`, [u]),
      /uq_timesheet_emp_date|duplicate/
    );
  });
});

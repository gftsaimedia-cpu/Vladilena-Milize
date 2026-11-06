import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import { ADMIN, type Api, ScenarioEnv, msg, workDay } from '../helpers/scenario-env';

// Tranh chấp giữa các thao tác kỳ lương / duyệt đơn / chấm công chạy cùng lúc. Không được 5xx, không được trạng thái mâu thuẫn.
const env = new ScenarioEnv();
const enabled = ScenarioEnv.enabled();
let admin: Api;
let nv: Api;
let u1: string;
const M = '2026-10';
const P = '/api/v2/system/periods';

before(async () => {
  if (enabled) await env.start('sc_conc');
});
after(async () => {
  if (enabled) await env.stop();
});
beforeEach(async () => {
  if (!enabled) return;
  await env.reset();
  u1 = await env.staff({ username: 'nv1' });
  await env.staff({ username: 'nv2' });
  env.at('2026-11-02T09:00:00+07:00');
  admin = await env.login(ADMIN);
  nv = await env.login('nv1');
  for (const d of ['01', '02', '03']) {
    await workDay(admin, u1, `2026-10-${d}`);
    await workDay(admin, env.uuid('nv2'), `2026-10-${d}`);
  }
});

const no5xx = (rs: Array<{ status: number }>) => assert.ok(rs.every(r => r.status < 500), rs.map(r => r.status).join(','));

describe('kỳ lương: đồng thời', { skip: !enabled }, () => {
  it('tính cả kỳ 3 lần song song: không 5xx; đúng một lần chạy hiện hành, phiếu mỗi người một cái', async () => {
    await admin.post(`${P}/${M}/lock`);
    const rs = await Promise.all([1, 2, 3].map(() => admin.post(`/api/v2/payroll/${M}/calculate`, {})));
    no5xx(rs);
    const live = await env.q(`SELECT id FROM payroll_runs WHERE month = $1 AND status = 'draft'`, [M]);
    assert.equal(live.length, 1);
    const slips = await env.q(`SELECT username FROM payslips WHERE run_id = $1 ORDER BY username`, [live[0].id]);
    assert.deepEqual(slips.map(s => s.username), ['nv1', 'nv2']);
    assert.equal((await admin.get(`${P}/${M}`)).body.status, 'calculated');
  });

  it('phê duyệt kỳ 3 lần song song: đúng một lần thành công, nhật ký period.approve một dòng', async () => {
    await admin.post(`${P}/${M}/lock`);
    await admin.post(`/api/v2/payroll/${M}/calculate`, {});
    for (const u of ['nv1', 'nv2']) await admin.post(`/api/v2/payroll/${M}/${u}/decision`, { decision: 'approve' });
    const rs = await Promise.all([1, 2, 3].map(() => admin.post(`${P}/${M}/approve`)));
    assert.equal(rs.filter(r => r.status === 201).length, 1, rs.map(msg).join('\n'));
    assert.ok(rs.filter(r => r.status !== 201).every(r => r.status === 409));
    assert.equal(Number((await env.q(`SELECT count(*) n FROM audit_log WHERE action = 'period.approve'`))[0].n), 1);
  });

  it('phê duyệt kỳ cùng lúc với duyệt đơn giải trình của tháng: kỳ không bao giờ approved khi còn phiếu cũ của người nộp', async () => {
    await workDay(admin, u1, '2026-10-05', '08:40');
    const ex = await nv.post('/api/v2/me/requests/explanation', { reason: 'x', workDate: '2026-10-05' });
    assert.equal(ex.status, 201, msg(ex));
    await admin.post(`${P}/${M}/lock`);
    await admin.post(`/api/v2/payroll/${M}/calculate`, {});
    for (const u of ['nv1', 'nv2']) await admin.post(`/api/v2/payroll/${M}/${u}/decision`, { decision: 'approve' });
    const [rv, ap] = await Promise.all([
      admin.patch(`/api/v2/requests/${ex.body.request.id}/review`, { action: 'APPROVE' }),
      admin.post(`${P}/${M}/approve`)
    ]);
    no5xx([rv, ap]);
    const period = (await env.q(`SELECT status FROM payroll_periods WHERE month = $1`, [M]))[0].status;
    const reqStatus = (await env.q(`SELECT status FROM system_requests WHERE id = $1`, [ex.body.request.id]))[0].status;
    if (period === 'approved') {
      // Kỳ đã duyệt thì đơn phải được duyệt TRƯỚC và phiếu đã duyệt lại sau đó: không còn đơn chờ.
      assert.notEqual(reqStatus, 'PENDING', 'kỳ đã phê duyệt khi vẫn còn đơn chờ');
    } else {
      assert.equal(period, 'calculated');
    }
  });

  it('sửa công (chấm hộ) đồng thời với chốt công: không dòng nào lọt vào tháng đã chốt sau khi chốt xong', async () => {
    const punch = (d: string) => admin.post('/api/v2/attendance/punches', { employeeId: u1, type: 'IN', punchedAt: `2026-10-${d}T08:00:00+07:00` });
    const rs = await Promise.all([
      admin.post(`${P}/${M}/lock`),
      punch('05'), punch('06'), punch('07'), punch('08')
    ]);
    no5xx(rs);
    // Mọi lần chấm đã nhận (201) phải có dòng công khớp; lần bị chặn (409) thì không để lại gì.
    const accepted = rs.slice(1).filter(r => r.status === 201).length;
    const stored = Number((await env.q(`SELECT count(*) n FROM punch_events WHERE employee_id = $1 AND work_date >= '2026-10-05'`, [u1]))[0].n);
    assert.equal(stored, accepted);
    const orphan = await env.q(`SELECT p.work_date::text d FROM punch_events p LEFT JOIN timesheet_entries t ON t.employee_id = p.employee_id AND t.work_date = p.work_date WHERE t.id IS NULL`);
    assert.deepEqual(orphan, []);
  });

  it('duyệt hai phiếu khác nhau cùng lúc và tính lại một phần: phiếu không mất, không 5xx', async () => {
    await admin.post(`${P}/${M}/lock`);
    await admin.post(`/api/v2/payroll/${M}/calculate`, {});
    const rs = await Promise.all([
      admin.post(`/api/v2/payroll/${M}/nv1/decision`, { decision: 'approve' }),
      admin.post(`/api/v2/payroll/${M}/nv2/decision`, { decision: 'approve' }),
      admin.post(`/api/v2/payroll/${M}/calculate`, { employeeIds: ['nv1'] })
    ]);
    no5xx(rs);
    const items = (await admin.get(`/api/v2/payroll/${M}`)).body.items as any[];
    assert.deepEqual(items.map(i => i.username).sort(), ['nv1', 'nv2']);
  });

  it('mở lại công đồng thời với tính lương: không 5xx, kỳ ở trạng thái hợp lệ', async () => {
    await admin.post(`${P}/${M}/lock`);
    const rs = await Promise.all([
      admin.post(`${P}/${M}/unlock`, { reason: 'Sửa công' }),
      admin.post(`/api/v2/payroll/${M}/calculate`, {}),
      admin.post(`/api/v2/payroll/${M}/calculate`, {})
    ]);
    no5xx(rs);
    const st = (await admin.get(`${P}/${M}`)).body;
    assert.ok(['open', 'attendance_locked', 'calculated'].includes(st.status), st.status);
    if (st.status === 'open') assert.equal(st.steps.lockedAt, null);
  });
});

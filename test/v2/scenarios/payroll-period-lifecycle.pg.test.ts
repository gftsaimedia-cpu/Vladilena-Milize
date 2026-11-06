import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import { ADMIN, type Api, ScenarioEnv, msg, workDay } from '../helpers/scenario-env';

// Vòng đời kỳ lương tháng 10/2026: lock → calculate → decision → approve → unapprove → pay, qua HTTP thật.
const env = new ScenarioEnv();
const enabled = ScenarioEnv.enabled();
let admin: Api;
let nv: Api;
let u1: string;
let u2: string;
const M = '2026-10';
const P = '/api/v2/system/periods';

// Ngày làm T2–T7 của tháng 10/2026.
const octDays = (n = 99): string[] => {
  const out: string[] = [];
  for (let d = 1; d <= 31 && out.length < n; d++) {
    const date = `2026-10-${String(d).padStart(2, '0')}`;
    if (new Date(`${date}T00:00:00Z`).getUTCDay() !== 0) out.push(date);
  }
  return out;
};

before(async () => {
  if (enabled) await env.start('sc_period');
});
after(async () => {
  if (enabled) await env.stop();
});
beforeEach(async () => {
  if (!enabled) return;
  await env.reset();
  u1 = await env.staff({ username: 'nv1' });
  u2 = await env.staff({ username: 'nv2' });
  env.at('2026-11-02T09:00:00+07:00');
  admin = await env.login(ADMIN);
  nv = await env.login('nv1');
  for (const d of octDays(6)) {
    await workDay(admin, u1, d);
    await workDay(admin, u2, d);
  }
  await workDay(admin, u1, '2026-10-08', '08:40'); // đi muộn: có thể giải trình
});

const status = async (month = M) => (await admin.get(`${P}/${month}`)).body.status;
const lockAndCalc = async () => {
  assert.equal((await admin.post(`${P}/${M}/lock`)).status, 201);
  const c = await admin.post(`/api/v2/payroll/${M}/calculate`, {});
  assert.equal(c.status, 201, msg(c));
  return c;
};
const decideAll = async (decision = 'approve') => {
  for (const u of ['nv1', 'nv2']) {
    const r = await admin.post(`/api/v2/payroll/${M}/${u}/decision`, { decision });
    assert.equal(r.status, 201, msg(r));
  }
};
const slips = async () => (await admin.get(`/api/v2/payroll/${M}`)).body.items as any[];

describe('kỳ lương: các bước và cổng', { skip: !enabled }, () => {
  it('chốt công trước khi hết tháng bị chặn, biên 00:00 giờ VN ngày 01/11 (= 31/10 17:00Z)', async () => {
    env.at('2026-10-31T16:59:59Z');
    const early = await admin.post(`${P}/${M}/lock`);
    assert.equal(early.status, 409, msg(early));
    assert.equal(early.body.code, 'MONTH_NOT_ENDED');
    assert.equal(await status(), 'open');
    env.at('2026-10-31T17:00:00Z');
    assert.equal((await admin.post(`${P}/${M}/lock`)).status, 201);
  });

  it('lock hai lần: 409 PERIOD_STATE; lock đồng thời: đúng một lần thành công, một dòng nhật ký', async () => {
    const res = await Promise.all([1, 2, 3].map(() => admin.post(`${P}/${M}/lock`)));
    assert.equal(res.filter(r => r.status === 201).length, 1, res.map(msg).join('\n'));
    assert.ok(res.filter(r => r.status !== 201).every(r => r.status === 409 && r.body.code === 'PERIOD_STATE'));
    assert.equal(Number((await env.q(`SELECT count(*) n FROM audit_log WHERE action='period.lock'`))[0].n), 1);
  });

  it('tính lương khi kỳ còn open chỉ là nháp, kỳ giữ open; duyệt phiếu chưa thể', async () => {
    const c = await admin.post(`/api/v2/payroll/${M}/calculate`, {});
    assert.equal(c.status, 201, msg(c));
    assert.equal(await status(), 'open');
    const d = await admin.post(`/api/v2/payroll/${M}/nv1/decision`, { decision: 'approve' });
    assert.equal(d.status, 409, msg(d));
    assert.equal(d.body.code, 'PAYSLIP_NOT_DECIDABLE');
  });

  it('tính một phần sau chốt công giữ attendance_locked, tính cả kỳ chuyển calculated', async () => {
    await admin.post(`${P}/${M}/lock`);
    const part = await admin.post(`/api/v2/payroll/${M}/calculate`, { employeeIds: ['nv1'] });
    assert.equal(part.status, 201, msg(part));
    assert.equal(await status(), 'attendance_locked');
    await admin.post(`/api/v2/payroll/${M}/calculate`, {});
    assert.equal(await status(), 'calculated');
    const items = await slips();
    assert.deepEqual(items.map(i => i.username).sort(), ['boss', 'nv1', 'nv2'].filter(u => u !== 'boss'));
  });

  it('employeeIds sai kiểu bị từ chối trước khi tính; id lạ vào errors, không có phiếu', async () => {
    await admin.post(`${P}/${M}/lock`);
    for (const bad of ['nv1', [1], [''], ['  '], null]) {
      const r = await admin.post(`/api/v2/payroll/${M}/calculate`, { employeeIds: bad });
      assert.equal(r.status, 400, JSON.stringify(bad) + msg(r));
      assert.equal(r.body.code, 'INVALID_EMPLOYEE_IDS');
    }
    const r = await admin.post(`/api/v2/payroll/${M}/calculate`, { employeeIds: ['khong-co'] });
    assert.equal(r.status, 201, msg(r));
    assert.equal(r.body.runId, null);
    assert.equal(r.body.errors.length, 1);
    assert.equal((await slips()).length, 0);
  });

  it('tháng sai định dạng: 400 INVALID_MONTH trên mọi route kỳ/lương', async () => {
    for (const m of ['2026-13', '2026-00', 'abc', '2026-1']) {
      for (const [method, path] of [
        ['post', `${P}/${m}/lock`],
        ['get', `${P}/${m}`],
        ['post', `/api/v2/payroll/${m}/calculate`],
        ['get', `/api/v2/payroll/${m}`],
        ['post', `/api/v2/payroll/${m}/nv1/decision`]
      ] as const) {
        const r = await (admin as any)[method](path, method === 'post' ? { decision: 'approve', reason: 'x' } : undefined);
        assert.equal(r.status, 400, `${method} ${path} ${msg(r)}`);
      }
    }
  });

  it('chặn phê duyệt kỳ: phiếu chưa duyệt, đơn chờ, người thiếu phiếu; lý do liệt kê đúng', async () => {
    await lockAndCalc();
    const r1 = await admin.post(`${P}/${M}/approve`);
    assert.equal(r1.status, 409, msg(r1));
    assert.equal(r1.body.code, 'PERIOD_BLOCKED');
    assert.equal(r1.body.blockers.unapprovedSlips, 2);
    await decideAll();
    // Đơn giải trình chờ cho một ngày tháng 10 → chặn.
    const ex = await nv.post('/api/v2/me/requests/explanation', { reason: 'x', workDate: '2026-10-08' });
    assert.equal(ex.status, 201, msg(ex));
    const r2 = await admin.post(`${P}/${M}/approve`);
    assert.equal(r2.status, 409, msg(r2));
    assert.equal(r2.body.blockers.pendingRequests, 1);
    // Duyệt đơn: phiếu của người nộp về nháp (kỳ calculated) → vẫn chặn tới khi duyệt lại.
    const rv = await admin.patch(`/api/v2/requests/${ex.body.request.id}/review`, { action: 'APPROVE' });
    assert.equal(rv.status, 200, msg(rv));
    assert.deepEqual(rv.body.recalculated, [{ month: M, ok: true }]);
    const r3 = await admin.post(`${P}/${M}/approve`);
    assert.equal(r3.status, 409, msg(r3));
    assert.equal(r3.body.blockers.unapprovedSlips, 1);
    // Người mới vào sau lần tính: thiếu phiếu.
    await env.staff({ username: 'nv3', startDate: '2026-01-05' });
    await admin.post(`/api/v2/payroll/${M}/nv1/decision`, { decision: 'approve' });
    const r4 = await admin.post(`${P}/${M}/approve`);
    assert.equal(r4.status, 409, msg(r4));
    assert.deepEqual(r4.body.blockers.missingSlips.map((s: any) => s.username), ['nv3']);
    // Khoá người đó thì không còn thiếu phiếu.
    await env.q(`UPDATE staff SET locked_at = now()::text WHERE username = 'nv3'`);
    const ok = await admin.post(`${P}/${M}/approve`);
    assert.equal(ok.status, 201, msg(ok));
    assert.equal(ok.body.status, 'approved');
  });

  it('sau phê duyệt: mọi cửa ghi vào tháng 10 bị chặn; unapprove cần lý do; pay chờ ngày trả lương', async () => {
    await lockAndCalc();
    await decideAll();
    assert.equal((await admin.post(`${P}/${M}/approve`)).status, 201);
    const frozen = [
      await admin.post(`/api/v2/payroll/${M}/calculate`, {}),
      await admin.put(`/api/v2/payroll/${M}/kpi/nv1`, { wework: 80 }),
      await admin.post(`/api/v2/payroll/${M}/nv1/decision`, { decision: 'reject' }),
      await admin.post(`${P}/${M}/lock`),
      await admin.post(`${P}/${M}/unlock`, { reason: 'x' }),
      await admin.post('/api/v2/attendance/punches', { employeeId: u1, type: 'IN', punchedAt: '2026-10-20T08:00:00+07:00' }),
      await admin.post('/api/v2/attendance/recalculate', { employeeId: u1, workDate: '2026-10-20' }),
      await nv.post('/api/v2/me/requests/explanation', { reason: 'x', workDate: '2026-10-08' })
    ];
    for (const r of frozen) assert.ok(r.status === 409, msg(r));
    assert.equal((await env.q(`SELECT count(*) n FROM punch_events WHERE work_date='2026-10-20'`))[0].n, 0);
    const before = JSON.stringify(await slips());

    for (const body of [{}, { reason: '   ' }, { reason: 5 }]) {
      const r = await admin.post(`${P}/${M}/unapprove`, body);
      assert.equal(r.status, 400, msg(r));
      assert.equal(r.body.code, 'REASON_REQUIRED');
    }
    assert.equal(await status(), 'approved');
    assert.equal(JSON.stringify(await slips()), before);

    const early = await admin.post(`${P}/${M}/pay`);
    assert.equal(early.status, 409, msg(early));
    assert.equal(early.body.code, 'BEFORE_PAYDAY');
    env.at('2026-11-09T16:59:59Z');
    assert.equal((await admin.post(`${P}/${M}/pay`)).status, 409);
    env.at('2026-11-09T17:00:00Z'); // 10/11 00:00 VN
    const paid = await admin.post(`${P}/${M}/pay`);
    assert.equal(paid.status, 201, msg(paid));
    assert.equal(paid.body.status, 'paid');
    const un = await admin.post(`${P}/${M}/unapprove`, { reason: 'Sai KPI' });
    assert.equal(un.status, 409, msg(un));
    assert.equal(un.body.code, 'PERIOD_STATE');
  });

  it('unapprove: về calculated, phiếu giữ quyết định, run mới; có thể duyệt lại', async () => {
    await lockAndCalc();
    await decideAll();
    await admin.post(`${P}/${M}/approve`);
    const un = await admin.post(`${P}/${M}/unapprove`, { reason: '  Sai KPI Bình ' });
    assert.equal(un.status, 201, msg(un));
    assert.equal(un.body.status, 'calculated');
    const items = await slips();
    assert.ok(items.every(i => i.status === 'approved'), 'phiếu giữ nguyên quyết định duyệt');
    const runs = await env.q(`SELECT run_no, status FROM payroll_runs WHERE month=$1 ORDER BY run_no`, [M]);
    assert.deepEqual(runs.map(r => [Number(r.run_no), r.status]), [[1, 'superseded'], [2, 'draft']]);
    assert.equal((await env.q(`SELECT reason FROM audit_log WHERE action='period.unapprove'`))[0].reason, 'Sai KPI Bình');
    assert.equal((await admin.post(`${P}/${M}/approve`)).status, 201);
  });

  it('mở lại công cần lý do; sửa công rồi chốt lại và tính lại thì phiếu đổi theo, quyết định cũ bị xoá', async () => {
    await lockAndCalc();
    await decideAll();
    const before = (await slips()).find(s => s.username === 'nv1');
    for (const body of [{}, { reason: '' }]) {
      const r = await admin.post(`${P}/${M}/unlock`, body);
      assert.equal(r.status, 400, msg(r));
    }
    assert.equal(await status(), 'calculated');
    assert.equal((await admin.post(`${P}/${M}/unlock`, { reason: 'Chấm thay ngày 09/10' })).status, 201);
    assert.equal(await status(), 'open');
    assert.equal(Number((await env.q(`SELECT reopen_count n FROM payroll_periods WHERE month=$1`, [M]))[0].n), 1);
    // Sửa công: nv1 thêm ngày 09/10.
    const [a, b] = await workDay(admin, u1, '2026-10-09');
    assert.equal(a.status + b.status, 402, msg(a) + msg(b));
    await admin.post(`${P}/${M}/lock`);
    const re = await admin.post(`/api/v2/payroll/${M}/calculate`, {});
    assert.equal(re.status, 201, msg(re));
    const after = (await slips()).find(s => s.username === 'nv1');
    assert.ok(after.gross > before.gross, `gross ${before.gross} → ${after.gross}`);
    assert.equal(after.status, 'draft');
    assert.equal(after.decidedBy, null);
    assert.equal(after.net, after.gross - after.insurance - after.tax - after.advance);
  });

  it('nhân viên không gọi được route kỳ/lương (403), chưa đăng nhập 401', async () => {
    for (const [m, p] of [
      ['post', `${P}/${M}/lock`],
      ['post', `${P}/${M}/approve`],
      ['post', `/api/v2/payroll/${M}/calculate`],
      ['post', `/api/v2/payroll/${M}/nv1/decision`],
      ['put', `/api/v2/payroll/${M}/kpi/nv1`],
      ['get', `/api/v2/payroll/${M}`]
    ] as const) {
      assert.equal((await (nv as any)[m](p, {})).status, 403, p);
      assert.equal((await (env.apiWith(null) as any)[m](p, {})).status, 401, p);
    }
    assert.equal(await status(), 'open');
  });

  it('duyệt phiếu: decision sai 400; người không có phiếu 404; từ chối rồi duyệt lại (ghi đè)', async () => {
    await lockAndCalc();
    for (const body of [{}, { decision: 'maybe' }, { decision: 'APPROVE' }]) {
      const r = await admin.post(`/api/v2/payroll/${M}/nv1/decision`, body);
      assert.equal(r.status, 400, msg(r));
      assert.equal(r.body.code, 'INVALID_DECISION');
    }
    assert.equal((await admin.post(`/api/v2/payroll/${M}/ghost/decision`, { decision: 'approve' })).status, 404);
    await admin.post(`/api/v2/payroll/${M}/nv1/decision`, { decision: 'reject', note: '  thiếu giờ ' });
    let s = (await slips()).find(x => x.username === 'nv1');
    assert.deepEqual([s.status, s.note, s.decidedBy], ['rejected', 'thiếu giờ', 'boss']);
    await admin.post(`/api/v2/payroll/${M}/nv1/decision`, { decision: 'approve' });
    s = (await slips()).find(x => x.username === 'nv1');
    assert.deepEqual([s.status, s.note], ['approved', null]);
  });
});

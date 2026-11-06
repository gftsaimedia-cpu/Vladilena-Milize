import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import { ADMIN, type Api, ScenarioEnv, msg, workDay } from '../helpers/scenario-env';

// Số tiền trên phiếu lương tháng 10/2026 qua HTTP: bảo hiểm/thuế theo hợp đồng, tạm ứng khấu trừ một lần, nghỉ phép, OT.
const env = new ScenarioEnv();
const enabled = ScenarioEnv.enabled();
let admin: Api;
let ids: Record<string, string>;
const M = '2026-10';

const octDays = (): string[] => {
  const out: string[] = [];
  for (let d = 1; d <= 31; d++) {
    const date = `2026-10-${String(d).padStart(2, '0')}`;
    if (new Date(`${date}T00:00:00Z`).getUTCDay() !== 0) out.push(date);
  }
  return out;
};

before(async () => {
  if (enabled) await env.start('sc_amounts');
});
after(async () => {
  if (enabled) await env.stop();
});
beforeEach(async () => {
  if (!enabled) return;
  await env.reset();
  ids = {
    nv1: await env.staff({ username: 'nv1' }),
    sh1: await env.staff({ username: 'sh1', contract: 'short' }),
    idle: await env.staff({ username: 'idle' })
  };
  env.at('2026-11-02T09:00:00+07:00');
  admin = await env.login(ADMIN);
  for (const d of octDays()) {
    await workDay(admin, ids.nv1, d);
    await workDay(admin, ids.sh1, d);
  }
});

const calc = async (employeeIds?: string[]) => {
  const r = await admin.post(`/api/v2/payroll/${M}/calculate`, employeeIds ? { employeeIds } : {});
  assert.equal(r.status, 201, msg(r));
  return r;
};
const slip = async (u: string, month = M) => (await admin.get(`/api/v2/payroll/${month}/${u}`)).body.payslip;
const advanceFor = async (u: string, period: string, approve = true) => {
  const a = await admin.post('/api/v2/requests/advance', { employeeId: u, period });
  assert.equal(a.status, 201, msg(a));
  if (approve) assert.equal((await admin.patch(`/api/v2/requests/${a.body.request.id}/review`, { action: 'APPROVE' })).status, 200);
  return a.body.request;
};

describe('phiếu lương: số tiền', { skip: !enabled }, () => {
  it('mọi phiếu: net = gross − bảo hiểm − thuế − tạm ứng; các thành phần không âm', async () => {
    await admin.post(`/api/v2/system/periods/${M}/lock`);
    await calc();
    const items = (await admin.get(`/api/v2/payroll/${M}`)).body.items as any[];
    assert.equal(items.length, 3);
    for (const s of items) {
      assert.equal(s.net, s.gross - s.insurance - s.tax - s.advance, s.username);
      for (const k of ['gross', 'insurance', 'tax', 'advance']) assert.ok(s[k] >= 0, `${s.username}.${k} = ${s[k]}`);
      const d = s.details;
      assert.ok(d.actualWorkDays >= 0 && d.totalOtHours >= 0 && d.lateMinutes >= 0 && d.lateEarlyHours >= 0, s.username);
    }
  });

  it('hợp đồng dài đóng bảo hiểm 10,5% lương chính sách; hợp đồng ngắn không đóng nhưng chịu thuế 10% gộp', async () => {
    await calc();
    const long = (await slip('nv1')).details;
    const short = (await slip('sh1')).details;
    assert.equal(long.actualWorkDays, short.actualWorkDays);
    assert.equal(long.grossIncome, short.grossIncome);
    assert.equal(long.insuranceDeduction, Math.round(long.baseSalaryPolicy * 0.105));
    assert.equal(short.insuranceDeduction, 0);
    assert.equal(short.personalIncomeTax, Math.round(short.grossIncome * 0.1));
    assert.equal(long.personalIncomeTax, 0); // 8,7 triệu − bảo hiểm < giảm trừ bản thân 15,5 triệu
  });

  it('phiếu người không có công: tính được, không ném lỗi; thực lĩnh âm do bảo hiểm cố định được ghi nhận đúng số học', async () => {
    await calc();
    const s = await slip('idle');
    assert.equal(s.gross, 0);
    assert.equal(s.net, s.gross - s.insurance - s.tax - s.advance);
  });

  it('tạm ứng được khấu trừ đúng một lần: tính lại nhiều lần không nhân đôi, tháng khác không bị trừ', async () => {
    await advanceFor('nv1', M);
    await calc();
    const first = await slip('nv1');
    assert.ok(first.advance > 0);
    await calc();
    await calc(['nv1']);
    const again = await slip('nv1');
    assert.equal(again.advance, first.advance);
    assert.equal(again.net, again.gross - again.insurance - again.tax - again.advance);
    // Tháng 11 chưa có công, không bị trừ khoản ứng của tháng 10.
    await admin.post('/api/v2/payroll/2026-11/calculate', {});
    assert.equal((await slip('nv1', '2026-11')).advance, 0);
    // Đơn tạm ứng chưa duyệt, bị từ chối không bị trừ.
    const pending = await advanceFor('sh1', M, false);
    await calc();
    assert.equal((await slip('sh1')).advance, 0);
    await admin.patch(`/api/v2/requests/${pending.id}/review`, { action: 'REJECT' });
    await calc();
    assert.equal((await slip('sh1')).advance, 0);
  });

  it('đơn tạm ứng nộp sau khi chốt công bị chặn 409 PERIOD_LOCKED (không lọt khoản ứng vào kỳ đã chốt)', async () => {
    await admin.post(`/api/v2/system/periods/${M}/lock`);
    await calc();
    const a = await admin.post('/api/v2/requests/advance', { employeeId: 'nv1', period: M });
    assert.equal(a.status, 409, msg(a)); // kỳ đã chốt công: không nộp được đơn loại thường
    assert.equal(a.body.code, 'PERIOD_LOCKED');
  });

  it('nghỉ phép năm đã duyệt được trả lương, nghỉ không lương không trả; phiếu đổi theo khi duyệt sau', async () => {
    // Hai ngày chưa chấm công: 08/10 phép năm, 09/10 không lương (xoá công hai ngày đó khỏi bộ test bằng người mới).
    const u = await env.staff({ username: 'lv1', leaveTotal: 5 });
    for (const d of octDays().filter(x => x !== '2026-10-08' && x !== '2026-10-09')) await workDay(admin, u, d);
    await calc(['lv1']);
    const base = (await slip('lv1')).details;
    const l1 = await admin.post('/api/v2/requests/leave', { employeeId: 'lv1', leaveType: 'ANNUAL', reason: 'x', startDate: '2026-10-08', endDate: '2026-10-08' });
    const l2 = await admin.post('/api/v2/requests/leave', { employeeId: 'lv1', leaveType: 'UNPAID', reason: 'x', startDate: '2026-10-09', endDate: '2026-10-09' });
    assert.equal(l1.status, 201, msg(l1));
    assert.equal(l2.status, 201, msg(l2));
    for (const l of [l1, l2]) await admin.patch(`/api/v2/requests/${l.body.request.id}/review`, { action: 'APPROVE' });
    await calc(['lv1']);
    const after = (await slip('lv1')).details;
    assert.equal(after.paidLeaveDays, 1);
    assert.equal(after.unpaidLeaveDays, 1);
    assert.ok(after.grossIncome > base.grossIncome, `${base.grossIncome} → ${after.grossIncome}`);
  });

  it('OT đã duyệt trả theo giờ có mặt thật trong khung; OT không có mặt không trả', async () => {
    const o1 = await admin.post('/api/v2/requests/overtime', { employeeId: 'nv1', reason: 'x', otDate: '2026-10-12', startTime: '18:00', endTime: '20:00' });
    const o2 = await admin.post('/api/v2/requests/overtime', { employeeId: 'nv1', reason: 'x', otDate: '2026-10-13', startTime: '18:00', endTime: '20:00' });
    assert.equal(o1.status, 201, msg(o1));
    assert.equal(o2.status, 201, msg(o2));
    for (const o of [o1, o2]) await admin.patch(`/api/v2/requests/${o.body.request.id}/review`, { action: 'APPROVE' });
    // Chỉ ngày 12/10 ở lại tới 20:00.
    await workDay(admin, ids.nv1, '2026-10-12', '08:00', '20:00').catch(() => null);
    await admin.post('/api/v2/attendance/recalculate', { employeeId: ids.nv1, month: M });
    await calc(['nv1']);
    const d = (await slip('nv1')).details;
    assert.ok(d.totalOtHours > 0 && d.totalOtHours <= 2.01, `OT ${d.totalOtHours}`);
  });

  it('phiếu ngoài tháng hiện hữu: ngày sau ngày nghỉ việc/trước ngày vào làm không có công', async () => {
    const u = await env.staff({ username: 'late', startDate: '2026-10-20' });
    for (const d of octDays()) await workDay(admin, u, d).catch(() => null);
    await calc(['late']);
    const d = (await slip('late')).details;
    assert.equal(d.actualWorkDays, 11, 'chỉ tính từ 20/10 (11 ngày T2–T7), dù đã có công các ngày trước đó');
  });

  it('/me/income: tạm tính khi chưa duyệt (BH, thuế = 0), chính thức khi phiếu được duyệt và khớp từng đồng với phiếu; tháng ngoài khoảng 400', async () => {
    const nv1 = await env.login('nv1');
    await advanceFor('nv1', M);
    const est = await nv1.get(`/api/v2/me/income?month=${M}`);
    assert.equal(est.status, 200, msg(est));
    assert.equal(est.body.state, 'estimate');
    assert.equal(est.body.payslip.insuranceDeduction, 0);
    assert.equal(est.body.payslip.personalIncomeTax, 0);
    assert.equal(est.body.payslip.netIncome, est.body.payslip.grossIncome - est.body.payslip.advanceDeduction);

    await admin.post(`/api/v2/system/periods/${M}/lock`);
    await calc();
    assert.equal((await nv1.get(`/api/v2/me/income?month=${M}`)).body.state, 'estimate'); // phiếu mới ở nháp
    await admin.post(`/api/v2/payroll/${M}/nv1/decision`, { decision: 'approve' });
    const off = await nv1.get(`/api/v2/me/income?month=${M}`);
    assert.equal(off.body.state, 'official');
    const stored = await slip('nv1');
    assert.equal(off.body.payslip.netIncome, stored.net);
    assert.equal(off.body.payslip.grossIncome, stored.gross);
    assert.equal(off.body.payslip.insuranceDeduction, stored.insurance);
    // Phiếu bị từ chối thì nhân viên không thấy số chính thức.
    await admin.post(`/api/v2/payroll/${M}/nv1/decision`, { decision: 'reject', note: 'sai' });
    assert.equal((await nv1.get(`/api/v2/me/income?month=${M}`)).body.state, 'estimate');

    for (const m of ['2025-01', '2027-01', '2026-13', 'abc']) {
      const r = await nv1.get(`/api/v2/me/income?month=${m}`);
      assert.equal(r.status, 400, `${m} ${msg(r)}`);
    }
  });

  it('nghỉ có làm bù: ngày bù trả theo giờ có mặt thật trong khung (spec: 240 phút ≈ 115.385đ); thiếu giờ bù thì tiền bù giảm đúng phần thiếu', async () => {
    const run = async (name: string, outAt13: string) => {
      const u = await env.staff({ username: name });
      for (const d of octDays().filter(x => !['2026-10-08', '2026-10-12', '2026-10-13'].includes(x))) await workDay(admin, u, d);
      const mk = await admin.post('/api/v2/requests/leave-with-makeup', {
        employeeId: name, reason: 'x', startDate: '2026-10-08', endDate: '2026-10-08',
        slots: [{ date: '2026-10-12', startTime: '18:00', endTime: '22:00' }, { date: '2026-10-13', startTime: '18:00', endTime: '22:00' }]
      });
      assert.equal(mk.status, 201, msg(mk));
      assert.equal((await admin.patch(`/api/v2/requests/${mk.body.request.id}/review`, { action: 'APPROVE' })).status, 200);
      await workDay(admin, u, '2026-10-12', '08:00', '22:00');
      await workDay(admin, u, '2026-10-13', '08:00', outAt13);
      await calc([name]);
      return (await slip(name)).details;
    };
    const full = await run('mk_full', '22:00');
    const half = await run('mk_half', '18:00'); // ngày 13 về lúc 18:00: không có mặt trong khung bù
    const mins = async (name: string) =>
      Number((await env.q(`SELECT coalesce(sum(makeup_minutes),0) n FROM timesheet_entries WHERE employee_id = $1`, [env.uuid(name)]))[0].n);
    assert.equal(await mins('mk_full'), 480);
    assert.equal(await mins('mk_half'), 240);
    assert.ok(Math.abs(full.makeupPay - 230769) <= 2, `makeupPay đủ = ${full.makeupPay}`);
    assert.ok(Math.abs(half.makeupPay - 115385) <= 2, `makeupPay một nửa = ${half.makeupPay}`);
    assert.ok(full.grossIncome >= half.grossIncome, 'thiếu giờ bù không được nhiều tiền hơn');
    assert.equal(full.makeupPay > half.makeupPay, true);
  });
});

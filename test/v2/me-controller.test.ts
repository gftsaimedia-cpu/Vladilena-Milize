import assert from 'node:assert/strict';
import { describe, it, mock } from 'node:test';
import 'reflect-metadata';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { ACCESS_KEY } from '../../src/common';
import { PunchRefusedError } from '../../src/modules/attendance/attendance.errors';
import { MeController } from '../../src/modules/me/me.controller';

const NAM: any = { uuid: 'u-nam', username: 'nam', name: 'Nam', role: 'staff', type: 'nv', level: 1, payrollSubject: true };
const req = (user: any = NAM) => ({ user }) as any;
// Hồ sơ của Nam: vào làm 04/03/2024, nên xem được từ tháng 03/2024 tới tháng hiện tại.
const namEmployee = (effectiveFrom: string | null = '2024-03-04') => ({ toDTO: () => ({ contract: { effectiveFrom } }) });

// Service giả ghi lại tham số theo tên hàm; `impl` thay hành vi của từng hàm.
function fake(impl: Record<string, (...a: any[]) => any> = {}) {
  const calls: Record<string, any[]> = {};
  const proxy = new Proxy({} as any, {
    get: (_t, name: string) => async (...args: any[]) => {
      calls[name] = args;
      return impl[name] ? impl[name](...args) : {};
    }
  });
  return { proxy, calls };
}

const MON_SAT = [1, 2, 3, 4, 5, 6];
const BINH = [1, 2, 3, 4, 5];
const ZONE = { lat: 10.7769, lng: 106.7009, radiusM: 150 };
// Cài đặt giả: tuần làm (mặc định T2–T7), vùng chấm công và ngày trả lương 10.
const settingsFake = (over: Record<string, (...a: any[]) => any> = {}) =>
  fake({
    workWeekOf: () => ({ weekdays: MON_SAT, standardWorkdays: 26 }),
    settingsFor: () => ({ payCalendar: { payDay: 10 } }),
    zone: () => ZONE,
    ...over
  });

function controller(over: Partial<Record<'att' | 'reqs' | 'pay' | 'emp' | 'sys' | 'set', ReturnType<typeof fake>>> = {}) {
  const att = over.att ?? fake({ listTimesheets: () => [], recordPunch: () => ({ punch: {} }), workdayOf: () => true });
  const reqs = over.reqs ?? fake({ listRequests: () => ({ items: [], total: 0 }) });
  const pay = over.pay ?? fake();
  const emp = over.emp ?? fake({ findByUsernameOrUuid: () => namEmployee() });
  const sys = over.sys ?? fake({ getPeriod: () => null });
  const set = over.set ?? settingsFake();
  return { ctl: new MeController(att.proxy, reqs.proxy, pay.proxy, emp.proxy, sys.proxy, set.proxy), att, reqs, pay, emp, sys, set };
}

describe('MeController', () => {
  it('every handler only needs a session', () => {
    const proto = MeController.prototype as any;
    const handlers = Object.getOwnPropertyNames(proto).filter(n => n !== 'constructor' && Reflect.getMetadata(METHOD_METADATA, proto[n]) !== undefined);
    assert.ok(handlers.length >= 10, handlers.join(','));
    for (const h of handlers) assert.deepEqual(Reflect.getMetadata(ACCESS_KEY, proto[h]), { kind: 'authenticated' }, h);
  });

  it('ignores foreign ids: requests are filed and listed for the session user', async () => {
    const { ctl, reqs } = controller();
    await ctl.createRequest(req(), 'leave', { employeeId: 'mallory', leaveType: 'ANNUAL' });
    assert.equal(reqs.calls.createLeaveRequest[0].employeeId, 'nam');
    await ctl.listRequests(req(), undefined);
    assert.equal(reqs.calls.listRequests[0].employeeId, 'nam');
  });

  it('ignores foreign ids: punches use the session uuid', async () => {
    const { ctl, att } = controller();
    await ctl.punch(req(), { kind: 'IN', employeeId: 'mallory', lat: 1, lng: 2, accuracyM: 10 } as any);
    assert.equal(att.calls.recordPunch[0].employeeId, 'u-nam');
    assert.equal(att.calls.recordPunch[0].type, 'IN');
    assert.equal(att.calls.recordPunch[0].latitude, 1);
    assert.deepEqual(att.calls.recordPunch[1], { checkZone: true });
  });

  it('a refused punch is a 400 with the refusal code and its details', async () => {
    const att = fake({
      recordPunch: () => {
        throw new PunchRefusedError('OUTSIDE_ZONE', 'Bạn đang cách văn phòng 600 m', { distanceM: 600, radiusM: 150 });
      }
    });
    const { ctl } = controller({ att });
    await assert.rejects(ctl.punch(req(), { kind: 'IN', lat: 1, lng: 2 }), (e: any) => {
      assert.equal(e.status, 400);
      assert.equal(e.message, 'Bạn đang cách văn phòng 600 m');
      assert.deepEqual(e.details, { code: 'OUTSIDE_ZONE', distanceM: 600, radiusM: 150 });
      return true;
    });
  });

  it("reading someone else's request is a 404", async () => {
    const { ctl } = controller({ reqs: fake({ getById: () => ({ id: 'r1', employeeId: 'ha', status: 'PENDING', createdAt: 'x', reviewedAt: null }) }) });
    await assert.rejects(ctl.getRequest(req(), 'r1'), (e: any) => e.status === 404);
  });

  it('cancelling a request that is not mine or not pending is refused', async () => {
    const { ctl } = controller({ reqs: fake({ cancelRequest: () => { throw new Error("Request with id 'x' not found"); } }) });
    await assert.rejects(ctl.cancelRequest(req(), 'x', {}), (e: any) => e.status === 404);
    const other = controller({ reqs: fake({ cancelRequest: () => { throw new Error('Không thể huỷ đơn đã duyệt'); } }) });
    await assert.rejects(other.ctl.cancelRequest(req(), 'x', {}), (e: any) => e.status === 409 && e.details?.code === 'REQUEST_NOT_CANCELLABLE');
  });

  it('income is official once my payslip is approved', async () => {
    const official = controller({ pay: fake({ getPayslip: () => ({ status: 'approved', details: { netIncome: 1 } }) }) });
    const o = (await official.ctl.income(req(), '2026-10')) as any;
    assert.equal(o.state, 'official');
    assert.deepEqual(o.payslip, { netIncome: 1 });
    assert.equal(official.pay.calls.generateMonthlyPayslip, undefined);
  });

  it('a stored payslip that is not approved yet is still an estimate', async () => {
    const full = { grossIncome: 0, insuranceDeduction: 630_000, insuranceBreakdown: { bhxh: 480_000, bhyt: 90_000, bhtn: 60_000 }, incomeAfterInsurance: -630_000, personalIncomeTax: 0, advanceDeduction: 0, netIncome: -630_000 };
    for (const status of ['draft', 'pending', 'error']) {
      const c = controller({ pay: fake({ getPayslip: () => ({ status, details: { netIncome: 1 } }), generateMonthlyPayslip: () => ({ toJSON: () => full }) }) });
      assert.equal(((await c.ctl.income(req(), '2026-10')) as any).state, 'estimate', status);
    }
  });

  it('income: estimate, unavailable', async () => {
    const full = { grossIncome: 0, insuranceDeduction: 630_000, insuranceBreakdown: { bhxh: 480_000, bhyt: 90_000, bhtn: 60_000 }, incomeAfterInsurance: -630_000, personalIncomeTax: 0, advanceDeduction: 0, netIncome: -630_000 };
    const est = controller({ pay: fake({ getPayslip: () => null, generateMonthlyPayslip: () => ({ toJSON: () => full }) }) });
    const e = (await est.ctl.income(req(), '2026-10')) as any;
    assert.equal(e.state, 'estimate');
    assert.equal(e.payslip.netIncome, 0); // tạm tính không trừ bảo hiểm, thuế
    assert.equal(e.payslip.insuranceDeduction, 0);
    assert.equal(est.pay.calls.generateMonthlyPayslip[0], 'u-nam');
    assert.equal(est.pay.calls.calculatePeriodPayslips, undefined);

    const none = controller({ pay: fake({ getPayslip: () => null, generateMonthlyPayslip: () => { throw new Error('Thiếu cấu hình'); } }) });
    const n = (await none.ctl.income(req(), '2026-10')) as any;
    assert.deepEqual([n.month, n.state, n.payslip, n.reason], ['2026-10', 'unavailable', null, 'Thiếu cấu hình']);

    await assert.rejects(est.ctl.income(req(), '2026-1'), (err: any) => err.status === 400);
  });

  it('income and attendance carry the months I may open', async () => {
    const { ctl } = controller({ pay: fake({ getPayslip: () => ({ status: 'approved', details: {} }) }) });
    const thisMonth = new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 7);
    assert.deepEqual(((await ctl.income(req(), '2026-10')) as any).range, { from: '2024-03', to: thisMonth });
    assert.deepEqual(((await ctl.attendanceMonth(req(), '2026-10')) as any).range, { from: '2024-03', to: thisMonth });
  });

  it('a month before I started or after this month is refused', async () => {
    const { ctl } = controller({ pay: fake({ getPayslip: () => ({ status: 'approved', details: {} }) }) });
    const outOfRange = (err: any) => err.status === 400 && err.details?.code === 'MONTH_OUT_OF_RANGE';
    await assert.rejects(ctl.income(req(), '2024-02'), outOfRange);
    await assert.rejects(ctl.income(req(), '2999-01'), outOfRange);
    await assert.rejects(ctl.attendanceMonth(req(), '2024-02'), outOfRange);
    await assert.rejects(ctl.attendanceMonth(req(), '2999-01'), outOfRange);
    assert.equal(((await ctl.attendanceMonth(req(), '2024-03')) as any).month, '2024-03');
  });

  it('the month is locked once Admin closed it with Chốt công', async () => {
    const { ctl, sys } = controller({ sys: fake({ getPeriod: () => ({ month: '2026-10', status: 'attendance_locked' }) }) });
    assert.equal(((await ctl.attendanceMonth(req(), '2026-10')) as any).periodState, 'locked');
    assert.equal(sys.calls.getPeriod[0], '2026-10');
    const open = controller();
    assert.equal(((await open.ctl.attendanceMonth(req(), '2026-10')) as any).periodState, 'open');
  });

  it('without a month the server picks this month, whatever the device clock says', async () => {
    const thisMonth = new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 7);
    const { ctl, att } = controller({ pay: fake({ getPayslip: () => ({ status: 'approved', details: {} }) }) });
    assert.equal(((await ctl.income(req(), undefined)) as any).month, thisMonth);
    assert.equal(((await ctl.attendanceMonth(req(), undefined)) as any).month, thisMonth);
    assert.equal(att.calls.listTimesheets[0].startDate, `${thisMonth}-01`);
  });

  it('without a start date only this month can be opened', async () => {
    const { ctl } = controller({ emp: fake({ findByUsernameOrUuid: () => namEmployee(null) }) });
    await assert.rejects(ctl.attendanceMonth(req(), '2026-10'), (err: any) => err.details?.code === 'MONTH_OUT_OF_RANGE');
  });

  it('today carries the zone and whether today is a workday', async () => {
    const { ctl, att } = controller({ att: fake({ listTimesheets: () => [], workdayOf: () => false }) });
    const t = (await ctl.today(req())) as any;
    assert.deepEqual(t.zone, ZONE);
    assert.equal(t.workday, false);
    assert.deepEqual(att.calls.workdayOf, ['u-nam', t.date]);
    const none = controller({ set: settingsFake({ zone: () => null }) });
    const n = (await none.ctl.today(req())) as any;
    assert.equal(n.zone, null);
    assert.equal(n.workday, true);
  });

  it("today's week strip follows my week", async () => {
    mock.timers.enable({ apis: ['Date'], now: Date.parse('2026-12-09T05:00:00Z') }); // thứ Tư 09/12/2026
    try {
      const { ctl, set } = controller({ set: settingsFake({ workWeekOf: () => ({ weekdays: BINH, standardWorkdays: 22 }) }) });
      const t = (await ctl.today(req())) as any;
      assert.equal(t.week[4].kind, 'future'); // thứ Sáu 11/12
      assert.equal(t.week[5].kind, 'off'); // thứ Bảy 12/12 ngoài tuần của Bình
      assert.equal(set.calls.workWeekOf[0], 'u-nam');
    } finally {
      mock.timers.reset();
    }
  });

  it('a week that spans two months asks for each month once', async () => {
    mock.timers.enable({ apis: ['Date'], now: Date.parse('2027-01-01T05:00:00Z') }); // thứ Sáu 01/01/2027
    const seen: string[] = [];
    try {
      const set = settingsFake({
        workWeekOf: (_u: string, month: string) => {
          seen.push(month);
          return { weekdays: month === '2026-12' ? BINH : MON_SAT, standardWorkdays: 22 };
        }
      });
      const { ctl } = controller({ set });
      const t = (await ctl.today(req())) as any;
      assert.deepEqual(t.week.map((d: any) => d.date), ['2026-12-28', '2026-12-29', '2026-12-30', '2026-12-31', '2027-01-01', '2027-01-02', '2027-01-03']);
      assert.equal(t.week[5].kind, 'future'); // thứ Bảy 02/01/2027: tháng 01 làm T2–T7
      assert.deepEqual([...seen].sort(), ['2026-12', '2027-01']);
    } finally {
      mock.timers.reset();
    }
  });

  it('the month view uses my week: off days and standardDays from the settings', async () => {
    const { ctl, set } = controller({ set: settingsFake({ workWeekOf: () => ({ weekdays: BINH, standardWorkdays: 22 }) }) });
    const m = (await ctl.attendanceMonth(req(), '2026-10')) as any;
    assert.equal(m.totals.standardDays, 22);
    assert.equal(m.days.find((d: any) => d.date === '2026-10-10').kind, 'off'); // thứ Bảy
    assert.equal(m.days.find((d: any) => d.date === '2026-10-09').kind, 'absent'); // thứ Sáu
    assert.deepEqual(set.calls.workWeekOf.slice(0, 2), ['u-nam', '2026-10']);
  });

  it("the single-day view uses the week of the date's month", async () => {
    const { ctl, set } = controller({
      att: fake({ getTimesheet: () => null }),
      set: settingsFake({ workWeekOf: () => ({ weekdays: BINH, standardWorkdays: 22 }) })
    });
    assert.equal(((await ctl.attendanceDay(req(), '2026-10-10')) as any).kind, 'off');
    assert.equal(((await ctl.attendanceDay(req(), '2026-10-09')) as any).kind, 'absent');
    assert.equal(set.calls.workWeekOf[1], '2026-10');
  });

  it('income carries the pay date of the month in all three states', async () => {
    const full = { grossIncome: 0, insuranceDeduction: 0, insuranceBreakdown: { bhxh: 0, bhyt: 0, bhtn: 0 }, incomeAfterInsurance: 0, personalIncomeTax: 0, advanceDeduction: 0, netIncome: 0 };
    const official = controller({ pay: fake({ getPayslip: () => ({ status: 'approved', details: {} }) }) });
    assert.equal(((await official.ctl.income(req(), '2026-11')) as any).payDate, '2026-12-10');
    assert.equal(official.set.calls.settingsFor[0], '2026-11');
    const est = controller({ pay: fake({ getPayslip: () => null, generateMonthlyPayslip: () => ({ toJSON: () => full }) }) });
    const e = (await est.ctl.income(req(), '2026-11')) as any;
    assert.deepEqual([e.state, e.payDate], ['estimate', '2026-12-10']);
    const none = controller({ pay: fake({ getPayslip: () => null, generateMonthlyPayslip: () => { throw new Error('x'); } }) });
    const n = (await none.ctl.income(req(), '2026-11')) as any;
    assert.deepEqual([n.state, n.payDate], ['unavailable', '2026-12-10']);
    const oct = controller({ pay: fake({ getPayslip: () => ({ status: 'approved', details: {} }) }), set: settingsFake({ settingsFor: () => ({ payCalendar: { payDay: 5 } }) }) });
    assert.equal(((await oct.ctl.income(req(), '2026-10')) as any).payDate, '2026-11-05');
  });

  it('there is no route for scoring my own KPI', () => {
    const proto = MeController.prototype as any;
    const paths = Object.getOwnPropertyNames(proto)
      .filter(n => n !== 'constructor' && Reflect.getMetadata(METHOD_METADATA, proto[n]) !== undefined)
      .map(n => Reflect.getMetadata(PATH_METADATA, proto[n]));
    assert.ok(paths.includes('income'), paths.join(','));
    assert.ok(!paths.some(p => String(p).includes('kpi')), paths.join(','));
  });
});

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import 'reflect-metadata';
import { METHOD_METADATA } from '@nestjs/common/constants';
import { ACCESS_KEY } from '../../src/common';
import { MeController } from '../../src/modules/me/me.controller';

const NAM: any = { uuid: 'u-nam', username: 'nam', name: 'Nam', role: 'staff', type: 'nv', level: 1, payrollSubject: true };
const req = (user: any = NAM) => ({ user }) as any;

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

function controller(over: Partial<Record<'att' | 'reqs' | 'pay' | 'emp', ReturnType<typeof fake>>> = {}) {
  const att = over.att ?? fake({ listTimesheets: () => [], recordPunch: () => ({ punch: {} }) });
  const reqs = over.reqs ?? fake({ listRequests: () => ({ items: [], total: 0 }) });
  const pay = over.pay ?? fake();
  const emp = over.emp ?? fake();
  return { ctl: new MeController(att.proxy, reqs.proxy, pay.proxy, emp.proxy), att, reqs, pay, emp };
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

  it('income: official, estimate, unavailable', async () => {
    const official = controller({ pay: fake({ getPayslip: () => ({ status: 'final', details: { netIncome: 1 } }) }) });
    assert.equal((await official.ctl.income(req(), '2026-10') as any).state, 'official');

    const est = controller({ pay: fake({ getPayslip: () => null, generateMonthlyPayslip: () => ({ toJSON: () => ({ netIncome: 2 }) }) }) });
    const e = (await est.ctl.income(req(), '2026-11')) as any;
    assert.equal(e.state, 'estimate');
    assert.equal(est.pay.calls.generateMonthlyPayslip[0], 'u-nam');
    assert.equal(est.pay.calls.calculatePeriodPayslips, undefined);

    const none = controller({ pay: fake({ getPayslip: () => null, generateMonthlyPayslip: () => { throw new Error('Thiếu cấu hình'); } }) });
    assert.deepEqual(await none.ctl.income(req(), '2026-11'), { month: '2026-11', state: 'unavailable', payslip: null, reason: 'Thiếu cấu hình' });

    await assert.rejects(official.ctl.income(req(), '2026-1'), (err: any) => err.status === 400);
  });

  it('kpi: only the self part is written', async () => {
    const { ctl, pay } = controller();
    await ctl.selfKpi(req(), '2026-11', { score: 80, wework: 100 } as any);
    assert.deepEqual(pay.calls.setKpiScore, ['nam', '2026-11', { self: 80 }, 'nam']);
  });
});

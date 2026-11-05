import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { RequestsController } from '../../src/modules/requests/requests.controller';
import { EmployeesController } from '../../src/modules/employees/employees.controller';
import { SystemController } from '../../src/modules/system/system.controller';

const ADMIN: any = { username: 'admin', name: 'Admin', role: 'admin', type: 'ql', level: 0 };

// Service giả ghi lại tham số của lần gọi cuối.
function recorder() {
  const calls: Record<string, unknown[]> = {};
  return new Proxy(
    { calls },
    {
      get: (target, prop: string) =>
        prop === 'calls'
          ? target.calls
          : async (...args: unknown[]) => {
              calls[prop] = args;
              return { id: 'r1' };
            }
    }
  ) as any;
}

describe('Người thao tác lấy từ phiên', () => {
  it('review uses the session user and ignores reviewerId in the body', async () => {
    const svc = recorder();
    await new RequestsController(svc).reviewRequest('r1', { action: 'APPROVE', reviewerId: 'mallory' } as any, ADMIN);
    assert.equal(svc.calls.reviewRequest[1], 'admin');
  });

  it('deactivate records the session user', async () => {
    const svc = recorder();
    await new EmployeesController(svc).deleteEmployee('nam', ADMIN);
    assert.equal(svc.calls.deactivate[1], 'admin');
  });

  it('setting updates record the session user', async () => {
    const svc = recorder();
    await new SystemController(svc).updateSetting('k', { value: 1 } as any, ADMIN);
    assert.equal(svc.calls.setSetting[2], 'admin');
  });

  it('creating a request for an employee needs employeeId and never falls back to system', async () => {
    const svc = recorder();
    await assert.rejects(new RequestsController(svc).createLeave({ type: 'x' }, ADMIN), (e: any) => e.status === 400);
    assert.equal(svc.calls.createLeaveRequest, undefined);
  });
});

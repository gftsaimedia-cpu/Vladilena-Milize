// Route gán ca và đổi phòng ban nhiều người, và bộ lọc chung của GET /employees: kiểm lớp HTTP, dịch vụ giả.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { DepartmentNotFoundError } from '../../src/modules/departments/departments.errors';
import { EmployeesController } from '../../src/modules/employees/employees.controller';

const USER = { username: 'admin' } as any;
const code = (e: any) => e.details?.code;

function controller(over: Record<string, unknown> = {}) {
  const calls: unknown[][] = [];
  const service = {
    assignShift: async (...a: unknown[]) => (calls.push(['shift', ...a]), { done: [], failed: [] }),
    assignDepartment: async (...a: unknown[]) => (calls.push(['dept', ...a]), { done: [], failed: [] }),
    list: async (f: unknown) => (calls.push(['list', f]), []),
    views: async (x: unknown[]) => x,
    ...over
  };
  return { ctrl: new EmployeesController(service as any), calls };
}

describe('POST employees/shift', () => {
  it('passes the usernames and the shift code to the service', async () => {
    const { ctrl, calls } = controller();
    assert.deepEqual(await ctrl.assignShift({ usernames: ['ha', ' nam '], shiftCode: 'Night1' }, USER), { done: [], failed: [] });
    assert.deepEqual(calls, [['shift', ['ha', 'nam'], 'Night1', 'admin']]);
  });

  it('refuses a bad list with INVALID_IDS and a missing code with INVALID_SHIFT_CODE', async () => {
    const { ctrl } = controller();
    for (const usernames of [undefined, [], ['a', 'a'], [1]]) {
      await assert.rejects(ctrl.assignShift({ usernames, shiftCode: 'Night1' }, USER), (e: any) => e.status === 400 && code(e) === 'INVALID_IDS');
    }
    await assert.rejects(ctrl.assignShift({ usernames: ['ha'] }, USER), (e: any) => e.status === 400 && code(e) === 'INVALID_SHIFT_CODE');
  });
});

describe('POST employees/department', () => {
  it('accepts a department id or null', async () => {
    const { ctrl, calls } = controller();
    await ctrl.assignDepartment({ usernames: ['ha'], departmentId: 2 }, USER);
    await ctrl.assignDepartment({ usernames: ['ha'], departmentId: null }, USER);
    assert.deepEqual(calls, [['dept', ['ha'], 2, 'admin'], ['dept', ['ha'], null, 'admin']]);
  });

  it('refuses a missing or non-numeric id with INVALID_DEPARTMENT_ID', async () => {
    const { ctrl } = controller();
    for (const departmentId of [undefined, '2', 0, 1.5]) {
      await assert.rejects(ctrl.assignDepartment({ usernames: ['ha'], departmentId } as any, USER), (e: any) => e.status === 400 && code(e) === 'INVALID_DEPARTMENT_ID');
    }
  });

  it('answers 404 DEPARTMENT_NOT_FOUND for the whole batch', async () => {
    const { ctrl } = controller({ assignDepartment: async () => { throw new DepartmentNotFoundError(); } });
    await assert.rejects(ctrl.assignDepartment({ usernames: ['ha'], departmentId: 9 }, USER), (e: any) => e.status === 404 && code(e) === 'DEPARTMENT_NOT_FOUND');
  });
});

describe('GET employees filters', () => {
  it('hands the shared filter to the service and leaves old q alone when no shared filter is given', async () => {
    const { ctrl, calls } = controller();
    await ctrl.listEmployees(undefined, undefined, 'Hà');
    await ctrl.listEmployees(undefined, undefined, 'Hà', 'on_leave', '2');
    const [plain, shared] = calls.map(c => c[1] as any);
    assert.deepEqual([plain.q, plain.staff], ['Hà', undefined]);
    assert.deepEqual([shared.q, shared.staff], [undefined, { staffStatus: 'on_leave', departmentId: 2, q: 'Hà' }]);
  });

  it('refuses an unknown filter with 400 INVALID_FILTER', async () => {
    const { ctrl } = controller();
    await assert.rejects(ctrl.listEmployees(undefined, undefined, undefined, 'vip'), (e: any) => e.status === 400 && code(e) === 'INVALID_FILTER');
  });
});

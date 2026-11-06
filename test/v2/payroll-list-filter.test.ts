// GET /payroll/:month với bộ lọc chung: staffStatus, departmentId, q; mỗi dòng kèm khối employee; totals theo dòng đã lọc.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { BadRequestError } from '../../src/common';
import { PayrollController } from '../../src/modules/payroll/payroll.controller';
import type { EmployeeBlock } from '../../src/modules/departments/staff-directory';
import { parseStaffFilter, matchesStaffStatus } from '../../src/modules/departments/domain';

const block = (username: string, over: Partial<EmployeeBlock> = {}): EmployeeBlock => ({
  id: `u-${username}`,
  username,
  name: username.toUpperCase(),
  departmentId: 1,
  departmentName: 'Phòng ban 1',
  jobTitle: null,
  staffStatus: 'working',
  ...over
});

const PEOPLE = [
  block('ha'),
  block('linh', { staffStatus: 'probation' }),
  block('mai', { departmentId: 2, departmentName: 'Phòng ban 2', staffStatus: 'on_leave' })
];

const slip = (username: string, net: number) => ({
  id: 1,
  runId: 7,
  username,
  status: 'draft',
  gross: net + 100,
  insurance: 0,
  tax: 0,
  advance: 0,
  net,
  warnings: [],
  details: {}
});

/** Thư mục giả: áp đúng bộ lọc thật lên PEOPLE và ghi lại bộ lọc đã nhận. */
function directory() {
  const seen: unknown[] = [];
  return {
    seen,
    find: async (filter: ReturnType<typeof parseStaffFilter>) => {
      seen.push(filter);
      return PEOPLE.filter(
        p =>
          matchesStaffStatus(filter.staffStatus, p.staffStatus) &&
          (filter.departmentId === undefined || p.departmentId === filter.departmentId) &&
          (!filter.q || p.name.toLowerCase().includes(filter.q.toLowerCase()))
      );
    }
  };
}

const controllerWith = (slips: unknown[]) => {
  const dir = directory();
  const ctrl = new PayrollController({ listPayslips: async () => slips } as any, dir as any);
  return { ctrl, dir };
};

const SLIPS = [slip('ha', 1_000), slip('linh', 2_000), slip('mai', 4_000)];

describe('GET /payroll/:month filters', () => {
  it('gives every row the employee block and keeps all rows when no filter is set', async () => {
    const { ctrl } = controllerWith(SLIPS);
    const out: any = await ctrl.listPayslips('2026-10');
    assert.deepEqual(out.items.map((i: any) => i.username), ['ha', 'linh', 'mai']);
    assert.deepEqual(out.items[0].employee, PEOPLE[0]);
    assert.equal(out.items[0].net, 1_000, 'the stored fields stay as they were');
    assert.equal(out.totals.count, 3);
    assert.equal(out.totals.net, 7_000);
  });

  it('staffStatus=working keeps working and probation rows; totals follow the shown rows', async () => {
    const { ctrl } = controllerWith(SLIPS);
    const out: any = await ctrl.listPayslips('2026-10', 'working');
    assert.deepEqual(out.items.map((i: any) => i.username), ['ha', 'linh']);
    assert.equal(out.totals.count, 2);
    assert.equal(out.totals.net, 3_000);
  });

  it('departmentId and q narrow further and are passed to the directory', async () => {
    const { ctrl, dir } = controllerWith(SLIPS);
    const out: any = await ctrl.listPayslips('2026-10', 'all', '2');
    assert.deepEqual(out.items.map((i: any) => i.username), ['mai']);
    assert.equal(out.totals.net, 4_000);
    await ctrl.listPayslips('2026-10', undefined, undefined, 'linh');
    assert.deepEqual(dir.seen.at(-1), { staffStatus: 'all', departmentId: undefined, q: 'linh' });
  });

  it('a filter that matches nobody gives no rows and zero totals', async () => {
    const { ctrl } = controllerWith(SLIPS);
    const out: any = await ctrl.listPayslips('2026-10', 'resigned');
    assert.deepEqual(out.items, []);
    assert.equal(out.totals.count, 0);
    assert.equal(out.totals.net, 0);
  });

  it('keeps a payslip whose person is not in the staff table when no filter is set, with employee null', async () => {
    const { ctrl } = controllerWith([...SLIPS, slip('ghost', 500)]);
    const all: any = await ctrl.listPayslips('2026-10');
    assert.equal(all.items.length, 4);
    assert.equal(all.items[3].employee, null);
    const working: any = await ctrl.listPayslips('2026-10', 'working');
    assert.deepEqual(working.items.map((i: any) => i.username), ['ha', 'linh']);
  });

  it('refuses an unknown filter with 400 INVALID_FILTER and a bad month with INVALID_MONTH', async () => {
    const { ctrl } = controllerWith(SLIPS);
    await assert.rejects(ctrl.listPayslips('2026-10', 'vip'), (e: any) => e instanceof BadRequestError && e.details?.code === 'INVALID_FILTER');
    await assert.rejects(ctrl.listPayslips('2026-10', 'all', 'abc'), (e: any) => e.details?.code === 'INVALID_FILTER');
    await assert.rejects(ctrl.listPayslips('2026-13'), (e: any) => e.details?.code === 'INVALID_MONTH');
  });
});

// GET /requests của tab Yêu cầu: bộ lọc nhân sự chung, khối employee mỗi dòng, sort=inbox và counts.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { RequestsController } from '../../src/modules/requests/requests.controller';
import type { EmployeeBlock } from '../../src/modules/departments/staff-directory';
import { matchesStaffStatus, type StaffFilter } from '../../src/modules/departments/domain';

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
const PEOPLE = [block('ha'), block('linh', { staffStatus: 'probation' }), block('mai', { departmentId: 2, departmentName: 'Phòng ban 2' })];

function setup(items: Array<{ id: string; employeeId: string }>) {
  const calls: any[] = [];
  const service = {
    listRequests: async (filter: unknown) => {
      calls.push(filter);
      return { items, total: items.length, counts: { marker: true } };
    }
  };
  const directory = {
    find: async (filter: StaffFilter) =>
      PEOPLE.filter(
        p =>
          matchesStaffStatus(filter.staffStatus, p.staffStatus) &&
          (filter.departmentId === undefined || p.departmentId === filter.departmentId) &&
          (!filter.q || p.name.toLowerCase().includes(filter.q.toLowerCase()))
      )
  };
  return { ctrl: new RequestsController(service as any, undefined, directory as any), calls };
}

const ITEMS = [
  { id: 'r1', employeeId: 'u-ha' },
  { id: 'r2', employeeId: 'u-mai' },
  { id: 'ghost', employeeId: 'u-ghost' }
];

describe('GET /requests', () => {
  it('without filters it asks for no staff scope, keeps every row and adds employee and counts', async () => {
    const { ctrl, calls } = setup(ITEMS);
    const out: any = await ctrl.listRequests();
    assert.equal(calls[0].staffIds, undefined);
    assert.equal(calls[0].withCounts, true);
    assert.deepEqual(out.items.map((i: any) => i.id), ['r1', 'r2', 'ghost']);
    assert.deepEqual(out.items[0].employee, PEOPLE[0]);
    assert.equal(out.items[2].employee, null, 'a person missing from the staff table does not drop the row');
    assert.equal(out.total, 3);
    assert.deepEqual(out.counts, { marker: true });
  });

  it('a staff filter passes the ids of everyone it matches, including their usernames', async () => {
    const { ctrl, calls } = setup([ITEMS[0]]);
    await ctrl.listRequests(undefined, undefined, undefined, undefined, undefined, 'working', '1');
    assert.deepEqual([...calls[0].staffIds].sort(), ['ha', 'linh', 'u-ha', 'u-linh']);
  });

  it('a filter that matches nobody passes an empty scope, not "no scope"', async () => {
    const { ctrl, calls } = setup([]);
    await ctrl.listRequests(undefined, undefined, undefined, undefined, undefined, 'resigned');
    assert.deepEqual(calls[0].staffIds, []);
  });

  it('passes the text, the sort and the other filters through', async () => {
    const { ctrl, calls } = setup([]);
    await ctrl.listRequests('ha', 'LEAVE', 'PENDING', '20', '40', 'all', undefined, 'mai', 'inbox');
    assert.deepEqual(
      { ...calls[0], staffIds: undefined },
      { employeeId: 'ha', type: 'LEAVE', status: 'PENDING', limit: 20, offset: 40, sort: 'inbox', withCounts: true, staffIds: undefined }
    );
    assert.deepEqual([...calls[0].staffIds].sort(), ['mai', 'u-mai'], 'q narrows the staff scope');
  });

  it('refuses an unknown filter or sort with 400', async () => {
    const { ctrl } = setup([]);
    await assert.rejects(ctrl.listRequests(undefined, undefined, undefined, undefined, undefined, 'vip'), (e: any) => e.status === 400 && e.details?.code === 'INVALID_FILTER');
    await assert.rejects(ctrl.listRequests(undefined, undefined, undefined, undefined, undefined, undefined, 'abc'), (e: any) => e.details?.code === 'INVALID_FILTER');
    await assert.rejects(ctrl.listRequests(undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, 'oldest'), (e: any) => e.status === 400 && e.details?.code === 'INVALID_SORT');
  });
});

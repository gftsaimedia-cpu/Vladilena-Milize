// Chuông giải trình của Admin: lọc theo nhân sự và phòng ban, khối employee mỗi dòng, và nhắc nhiều người một lúc.
import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';
import { RequestsController } from '../../src/modules/requests/requests.controller';
import { matchesStaffStatus, type StaffFilter } from '../../src/modules/departments/domain';
import type { EmployeeBlock } from '../../src/modules/departments/staff-directory';
import { ADMIN_UUID, NV_UUID, explanationRequest, makeService, seed, staffContext, timesheet } from './helpers/requests-fakes';

const NV02_UUID = '0a7c4e2e-4444-4a6b-9c1d-000000000004';
const ADMIN = { username: 'admin', name: 'Admin', role: 'admin', type: 'admin', level: 1 } as any;

const block = (id: string, username: string, over: Partial<EmployeeBlock> = {}): EmployeeBlock => ({
  id,
  username,
  name: username,
  departmentId: 1,
  departmentName: 'Phòng ban 1',
  jobTitle: null,
  staffStatus: 'working',
  ...over
});
const PEOPLE = [block(NV_UUID, 'nv01'), block(NV02_UUID, 'nv02', { departmentId: 2, departmentName: 'Phòng ban 2', staffStatus: 'probation' })];

const directory = {
  find: async (filter: StaffFilter) =>
    PEOPLE.filter(
      p =>
        matchesStaffStatus(filter.staffStatus, p.staffStatus) &&
        (filter.departmentId === undefined || p.departmentId === filter.departmentId)
    )
};

// Hôm nay 04/11/2026. nv01 vào làm 02/11: 02/11 thiếu giờ ra, 03/11 vào muộn. nv02 vào làm 03/11: 03/11 vào muộn.
describe('explanations-due và remind-many', () => {
  let ctx: ReturnType<typeof makeService>;
  const setNow = (iso: string) => {
    ctx.service.now = () => new Date(iso);
  };
  const controller = () => new RequestsController(ctx.service, ctx.explanations, directory as any);

  beforeEach(() => {
    ctx = makeService();
    ctx.repo.putStaff('nv01', staffContext({ startDate: '2026-11-02' }));
    ctx.repo.putStaff('nv02', staffContext({ employeeId: NV02_UUID, startDate: '2026-11-03' }));
    ctx.att.timesheets.push(
      timesheet('2026-11-03', '08:40', '17:05'),
      timesheet('2026-11-02', '08:00', null),
      timesheet('2026-11-03', '08:40', '17:05', NV02_UUID)
    );
    ctx.repo.filingStaff = [
      { uuid: NV02_UUID, username: 'nv02', name: 'Trần Thị B' },
      { uuid: NV_UUID, username: 'nv01', name: 'Nguyễn Văn A' }
    ];
  });

  describe('listDue with a scope', () => {
    it('only lists the people in the scope', async () => {
      const items = await ctx.explanations.listDue({ onlyIds: [NV02_UUID] });
      assert.deepEqual(items.map(i => [i.name, i.date]), [['Trần Thị B', '2026-11-03']]);
    });

    it('an empty scope lists nobody, no scope lists everybody', async () => {
      assert.deepEqual(await ctx.explanations.listDue({ onlyIds: [] }), []);
      assert.equal((await ctx.explanations.listDue()).length, 3);
    });
  });

  describe('GET explanations-due', () => {
    it('adds the employee block to each item', async () => {
      const { items } = (await controller().listExplanationsDue()) as any;
      assert.equal(items.length, 3);
      assert.deepEqual(items[0].employee, PEOPLE[0]);
      assert.ok(items.every((i: any) => i.employee !== null));
    });

    it('filters by staffStatus and departmentId', async () => {
      const probation = (await controller().listExplanationsDue('probation')) as any;
      assert.deepEqual(probation.items.map((i: any) => i.employeeId), [NV02_UUID]);
      const dept1 = (await controller().listExplanationsDue('all', '1')) as any;
      assert.deepEqual([...new Set(dept1.items.map((i: any) => i.employeeId))], [NV_UUID]);
      const nobody = (await controller().listExplanationsDue('resigned')) as any;
      assert.deepEqual(nobody.items, []);
    });

    it('refuses an unknown filter with 400 INVALID_FILTER', async () => {
      await assert.rejects(controller().listExplanationsDue('vip'), (e: any) => e.status === 400 && e.details?.code === 'INVALID_FILTER');
    });
  });

  describe('remindMany', () => {
    it('reminds every item and answers each with its time', async () => {
      setNow('2026-11-04T02:40:00Z');
      const out = await ctx.explanations.remindMany(
        [
          { employeeId: 'nv01', date: '2026-11-02' },
          { employeeId: NV02_UUID, date: '2026-11-03' }
        ],
        'admin'
      );
      assert.deepEqual(out.done, [
        { employeeId: 'nv01', date: '2026-11-02', remindedAt: '2026-11-04T02:40:00.000Z' },
        { employeeId: NV02_UUID, date: '2026-11-03', remindedAt: '2026-11-04T02:40:00.000Z' }
      ]);
      assert.deepEqual(out.failed, []);
      assert.equal(ctx.reminders.rows.size, 2);
      assert.ok([...ctx.reminders.rows.values()].every(r => r.remindedBy === ADMIN_UUID));
    });

    it('puts an explained day and a locked month into failed with their codes and keeps the rest', async () => {
      setNow('2026-11-04T02:40:00Z');
      await seed(ctx, explanationRequest('2026-11-02', ['MISSING_CHECK_OUT'], 'PENDING'));
      ctx.periods.statuses.set('2026-11', 'approved');
      const out = await ctx.explanations.remindMany(
        [
          { employeeId: 'nv01', date: '2026-11-02' },
          { employeeId: NV02_UUID, date: '2026-11-03' }
        ],
        'admin'
      );
      assert.deepEqual(out.done, []);
      assert.deepEqual(out.failed.map(f => [f.id, f.date, f.code]), [
        ['nv01', '2026-11-02', 'PERIOD_LOCKED'],
        [NV02_UUID, '2026-11-03', 'PERIOD_LOCKED']
      ]);
      ctx.periods.statuses.delete('2026-11');
      const again = await ctx.explanations.remindMany(
        [
          { employeeId: 'nv01', date: '2026-11-02' },
          { employeeId: NV02_UUID, date: '2026-11-03' }
        ],
        'admin'
      );
      assert.deepEqual(again.failed.map(f => [f.id, f.date, f.code]), [['nv01', '2026-11-02', 'BAD_REQUEST']]);
      assert.match(again.failed[0].message, /đã có đơn giải trình/);
      assert.deepEqual(again.done.map(d => d.employeeId), [NV02_UUID]);
    });
  });

  describe('POST explanations-due/remind-many', () => {
    it('reminds as the signed-in admin and returns done and failed', async () => {
      setNow('2026-11-04T02:40:00Z');
      const out: any = await controller().remindExplanationMany({ items: [{ employeeId: 'nv01', date: '2026-11-02' }] }, ADMIN);
      assert.equal(out.done.length, 1);
      assert.deepEqual(out.failed, []);
    });

    it('refuses a bad list with 400 INVALID_IDS', async () => {
      for (const body of [{}, { items: [] }, { items: [{ employeeId: 'nv01' }] }, { items: [{ employeeId: 'nv01', date: 'x' }, { employeeId: 'nv01', date: 'x' }] }, { items: 'a' }]) {
        await assert.rejects(controller().remindExplanationMany(body as any, ADMIN), (e: any) => e.status === 400 && e.details?.code === 'INVALID_IDS', JSON.stringify(body));
      }
    });
  });
});

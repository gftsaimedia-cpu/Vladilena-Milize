// Hồ sơ nhân sự có phòng ban và khoảng tạm nghỉ; staffStatus tính sẵn; bộ lọc chung; gán ca và đổi phòng ban nhiều người.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Kysely } from 'kysely';
import type { DB } from '../../src/database/schema';
import type { AuditLog } from '../../src/modules/audit/audit-log';
import { parseStaffFilter } from '../../src/modules/departments/domain';
import { DepartmentNotFoundError } from '../../src/modules/departments/departments.errors';
import { EmployeesRepository } from '../../src/modules/employees/employees.repository';
import { EmployeesService } from '../../src/modules/employees/employees.service';
import { auditKit } from './helpers/audit-pg';
import { withTempDb } from './helpers/pg-temp-db';

const NOW = new Date('2026-11-05T03:00:00.000Z'); // 05/11/2026 giờ Việt Nam

const person = (username: string, over: Record<string, unknown> = {}) => ({
  username,
  name: `Người ${username}`,
  password: 'Moi@123456',
  type: 'nv',
  level: 1,
  shiftType: 'NORMAL',
  status: 'nv',
  ...over
});

function setup(db: Kysely<DB>) {
  const kit = auditKit(db);
  const make = (log: AuditLog) => {
    const svc = new EmployeesService(new EmployeesRepository(db), kit.tx, log);
    svc.now = () => NOW;
    return svc;
  };
  return { ...kit, svc: make(kit.log), failing: make(kit.failingLog) };
}

const view = async (svc: EmployeesService, username: string) => (await svc.views([(await svc.findByUsernameOrUuid(username))!]))[0];

test('a profile keeps its department, the view names it, and the audit row records the change', async t => {
  await withTempDb(t, 'emp_dept', async db => {
    const { svc, rows } = setup(db);
    await svc.create(person('ha'), 'admin');
    assert.equal((await view(svc, 'ha')).departmentId, null);
    assert.equal((await view(svc, 'ha')).departmentName, null);

    await svc.update('ha', { contract: { departmentId: 2 } }, 'admin');
    const v = await view(svc, 'ha');
    assert.deepEqual([v.departmentId, v.departmentName, v.contract.departmentId], [2, 'Phòng ban 2', 2]);

    const change = (await rows()).filter(r => r.action === 'staff.update' && r.sensitivity === 'normal').at(-1)!;
    assert.deepEqual(change.before, { departmentId: null });
    assert.deepEqual(change.after, { departmentId: 2 });

    await svc.update('ha', { departmentId: null }, 'admin');
    assert.equal((await view(svc, 'ha')).departmentId, null, 'null puts the person back to "chưa xếp phòng"');
  });
});

test('a department that does not exist is refused, and nothing is saved', async t => {
  await withTempDb(t, 'emp_dept_missing', async db => {
    const { svc } = setup(db);
    await svc.create(person('ha'), 'admin');
    await assert.rejects(svc.update('ha', { departmentId: 99 }, 'admin'), DepartmentNotFoundError);
    await assert.rejects(svc.create(person('nam', { departmentId: 99 }), 'admin'), DepartmentNotFoundError);
    assert.equal(await svc.findByUsernameOrUuid('nam'), null);
    assert.equal((await view(svc, 'ha')).departmentId, null);
  });
});

test('the on-leave range is stored, may be open-ended, and is checked', async t => {
  await withTempDb(t, 'emp_leave_range', async db => {
    const { svc } = setup(db);
    await svc.create(person('mai'), 'admin');

    await svc.update('mai', { contract: { onLeaveFrom: '2026-11-02', onLeaveTo: '2026-11-28' } }, 'admin');
    let v = await view(svc, 'mai');
    assert.deepEqual([v.contract.onLeaveFrom, v.contract.onLeaveTo, v.staffStatus], ['2026-11-02', '2026-11-28', 'on_leave']);

    await svc.update('mai', { contract: { onLeaveTo: null } }, 'admin');
    v = await view(svc, 'mai');
    assert.deepEqual([v.contract.onLeaveTo, v.staffStatus], [null, 'on_leave'], 'open-ended: still on leave');

    await svc.update('mai', { contract: { onLeaveFrom: null } }, 'admin');
    v = await view(svc, 'mai');
    assert.deepEqual([v.contract.onLeaveFrom, v.staffStatus], [null, 'working']);

    for (const bad of [
      { onLeaveFrom: '02/11/2026' },
      { onLeaveFrom: '2026-11-10', onLeaveTo: '2026-11-09' },
      { onLeaveTo: '2026-11-09' }
    ]) {
      await assert.rejects(svc.update('mai', { contract: bad }, 'admin'), Error, JSON.stringify(bad));
    }
  });
});

test('staffStatus follows the contract: probation, resigned wins over on leave', async t => {
  await withTempDb(t, 'emp_status_view', async db => {
    const { svc } = setup(db);
    await svc.create(person('linh', { status: 'thuviec' }), 'admin');
    await svc.create(person('cu', { onLeaveFrom: '2026-11-01' }), 'admin');
    await svc.update('cu', { contract: { onLeaveFrom: '2026-11-01' } }, 'admin');
    await svc.deactivate('cu', 'admin');
    assert.equal((await view(svc, 'linh')).staffStatus, 'probation');
    assert.equal((await view(svc, 'cu')).staffStatus, 'resigned');
  });
});

test('list takes the shared staff filter beside the old ones', async t => {
  await withTempDb(t, 'emp_list_filter', async db => {
    const { svc } = setup(db);
    await svc.create(person('ha', { name: 'Nguyễn Thu Hà', departmentId: 1 }), 'admin');
    await svc.create(person('linh', { name: 'Đỗ Mai Linh', status: 'thuviec', departmentId: 1 }), 'admin');
    await svc.create(person('mai', { name: 'Hoàng Thị Mai', departmentId: 2, onLeaveFrom: '2026-11-02', onLeaveTo: '2026-11-28' }), 'admin');
    await svc.create(person('cu', { name: 'Lê Văn Cũ' }), 'admin');
    await svc.deactivate('cu', 'admin');
    const names = async (filter: Parameters<EmployeesService['list']>[0]) => (await svc.list(filter)).map(e => e.username).sort();
    const staff = (raw: Record<string, string>) => ({ staff: parseStaffFilter(raw) });

    assert.deepEqual(await names({}), ['cu', 'ha', 'linh', 'mai']);
    assert.deepEqual(await names(staff({ staffStatus: 'working' })), ['ha', 'linh']);
    assert.deepEqual(await names(staff({ staffStatus: 'on_leave' })), ['mai']);
    assert.deepEqual(await names(staff({ staffStatus: 'resigned' })), ['cu']);
    assert.deepEqual(await names(staff({ departmentId: '1' })), ['ha', 'linh']);
    assert.deepEqual(await names(staff({ departmentId: 'none' })), ['cu']);
    assert.deepEqual(await names(staff({ q: 'do mai' })), ['linh']);
    assert.deepEqual(await names({ status: 'thuviec', ...staff({ departmentId: '1' }) }), ['linh']);
  });
});

test('assignShift sets the six fixed shifts for many people and reports who could not be changed', async t => {
  await withTempDb(t, 'emp_assign_shift', async db => {
    const { svc, rows } = setup(db);
    await svc.create(person('ha'), 'admin');
    await svc.create(person('nam'), 'admin');
    await svc.create(person('cu'), 'admin');
    await svc.deactivate('cu', 'admin');
    const before = (await rows()).length;

    const out = await svc.assignShift(['ha', 'cu', 'khong-co', 'nam'], 'Night1', 'admin');

    assert.deepEqual(out.done.map(v => v.contract.shift), [
      { type: 'NIGHT', startTime: '22:00', endTime: '07:00', allowancePct: 30, isOvernight: true },
      { type: 'NIGHT', startTime: '22:00', endTime: '07:00', allowancePct: 30, isOvernight: true }
    ]);
    assert.deepEqual(out.done.map(v => v.account.username), ['ha', 'nam']);
    assert.deepEqual(out.failed.map(f => [f.id, f.code]), [
      ['cu', 'EMPLOYEE_RESIGNED'],
      ['khong-co', 'EMPLOYEE_NOT_FOUND']
    ]);
    const saved = (await rows()).slice(before).filter(r => r.action === 'staff.update');
    assert.ok(saved.every(r => r.entityId === 'ha' || r.entityId === 'nam'), 'one audit row set per person changed');
    assert.ok(saved.some(r => r.entityId === 'ha') && saved.some(r => r.entityId === 'nam'));

    const flex = await svc.assignShift(['ha'], 'Flex1', 'admin');
    assert.deepEqual(flex.done[0].contract.shift, { type: 'FLEX', startTime: '06:00', endTime: '15:00', allowancePct: 10, isOvernight: false });
    const normal = await svc.assignShift(['ha'], 'Normal2', 'admin');
    assert.deepEqual(normal.done[0].contract.shift, { type: 'NORMAL', startTime: '10:00', endTime: '19:00', allowancePct: 0, isOvernight: false });
  });
});

test('assignShift keeps the night allowance already chosen and refuses an unknown shift code for the whole batch', async t => {
  await withTempDb(t, 'emp_assign_shift_bad', async db => {
    const { svc } = setup(db);
    await svc.create(person('ha', { shiftType: 'NIGHT', allowancePct: 40 }), 'admin');
    const out = await svc.assignShift(['ha'], 'Night2', 'admin');
    assert.equal(out.done[0].contract.shift.allowancePct, 40);
    assert.deepEqual([out.done[0].contract.shift.startTime, out.done[0].contract.shift.endTime], ['21:00', '06:00']);

    await assert.rejects(svc.assignShift(['ha'], 'Morning', 'admin'), (e: any) => e.status === 400 && e.details?.code === 'INVALID_SHIFT_CODE');
  });
});

test('assignDepartment moves many people, skips the resigned and refuses an unknown department', async t => {
  await withTempDb(t, 'emp_assign_dept', async db => {
    const { svc } = setup(db);
    await svc.create(person('ha'), 'admin');
    await svc.create(person('nam'), 'admin');
    await svc.create(person('cu'), 'admin');
    await svc.deactivate('cu', 'admin');

    const out = await svc.assignDepartment(['ha', 'cu', 'nam'], 2, 'admin');

    assert.deepEqual(out.done.map(v => [v.account.username, v.departmentId, v.departmentName]), [
      ['ha', 2, 'Phòng ban 2'],
      ['nam', 2, 'Phòng ban 2']
    ]);
    assert.deepEqual(out.failed.map(f => [f.id, f.code]), [['cu', 'EMPLOYEE_RESIGNED']]);
    assert.equal((await view(svc, 'cu')).departmentId, null);

    await assert.rejects(svc.assignDepartment(['ha'], 99, 'admin'), DepartmentNotFoundError);
    assert.equal((await view(svc, 'ha')).departmentId, 2, 'a refused batch changes nobody');
  });
});

test('a person whose save fails goes to failed with BAD_EMPLOYEE_INPUT, rolled back, like the single-person route', async t => {
  await withTempDb(t, 'emp_assign_audit', async db => {
    const { failing, svc } = setup(db);
    await svc.create(person('ha'), 'admin');
    const out = await failing.assignShift(['ha'], 'Night1', 'admin');
    assert.deepEqual(out.done, []);
    assert.deepEqual(out.failed.map(f => [f.id, f.code, f.message]), [['ha', 'BAD_EMPLOYEE_INPUT', 'audit boom']]);
    assert.equal((await view(svc, 'ha')).contract.shift.type, 'NORMAL');
  });
});

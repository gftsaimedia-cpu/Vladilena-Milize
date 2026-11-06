// Phòng ban: danh sách có staffCount, thêm/sửa/xoá và dòng nhật ký department.create/update/delete trong cùng giao dịch.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Kysely } from 'kysely';
import type { DB } from '../../src/database/schema';
import type { AuditLog } from '../../src/modules/audit/audit-log';
import { DepartmentsRepository } from '../../src/modules/departments/departments.repository';
import { DepartmentsService } from '../../src/modules/departments/departments.service';
import {
  DepartmentInputError,
  DepartmentNameTakenError,
  DepartmentNotEmptyError,
  DepartmentNotFoundError
} from '../../src/modules/departments/departments.errors';
import { auditKit } from './helpers/audit-pg';
import { withTempDb } from './helpers/pg-temp-db';

const NOW = new Date('2026-11-06T03:00:00.000Z');

function setup(db: Kysely<DB>) {
  const kit = auditKit(db);
  const make = (log: AuditLog) => new DepartmentsService(new DepartmentsRepository(db), kit.tx, log);
  return { ...kit, svc: make(kit.log), failing: make(kit.failingLog) };
}

async function addStaff(db: Kysely<DB>, username: string, departmentId: number | null, contractStatus: string | null = 'official') {
  await db
    .insertInto('staff')
    .values({
      username,
      name: username,
      pass_hash: 'x',
      created_at: '2026-11-01',
      uuid: `uuid-${username}`,
      department_id: departmentId,
      contract_status: contractStatus
    })
    .execute();
}

test('list returns the seeded departments in order with staffCount of people who have not resigned', async t => {
  await withTempDb(t, 'dept_list', async db => {
    const { svc } = setup(db);
    await addStaff(db, 'a', 1);
    await addStaff(db, 'b', 1, 'probation');
    await addStaff(db, 'c', 1, 'nghiviec');
    await addStaff(db, 'd', 2);
    await addStaff(db, 'e', null);

    assert.deepEqual(await svc.list(), [
      { id: 1, name: 'Phòng ban 1', sort: 1, staffCount: 2 },
      { id: 2, name: 'Phòng ban 2', sort: 2, staffCount: 1 }
    ]);
  });
});

test('create trims the name, puts the department last and logs department.create', async t => {
  await withTempDb(t, 'dept_create', async db => {
    const { svc, rows, verify } = setup(db);
    const made = await svc.create({ name: '  Phòng ban 3 ' }, 'admin', NOW);

    assert.equal(made.name, 'Phòng ban 3');
    assert.equal(made.sort, 3);
    assert.equal(made.staffCount, 0);
    const written = await rows();
    assert.equal(written.length, 1);
    assert.deepEqual(
      { ...written[0], requestId: undefined },
      {
        actor: 'admin',
        action: 'department.create',
        entityKind: 'department',
        entityId: String(made.id),
        subject: null,
        month: null,
        before: null,
        after: { name: 'Phòng ban 3', sort: 3 },
        reason: null,
        sensitivity: 'normal',
        requestId: undefined
      }
    );
    assert.equal((await verify()).ok, true);
  });
});

test('create refuses an empty, over-long or duplicate name', async t => {
  await withTempDb(t, 'dept_create_bad', async db => {
    const { svc, rows } = setup(db);
    await assert.rejects(svc.create({ name: '   ' }, 'admin', NOW), DepartmentInputError);
    await assert.rejects(svc.create({}, 'admin', NOW), DepartmentInputError);
    await assert.rejects(svc.create({ name: 'x'.repeat(101) }, 'admin', NOW), DepartmentInputError);
    await assert.rejects(svc.create({ name: 'Phòng ban 1' }, 'admin', NOW), DepartmentNameTakenError);
    assert.equal((await rows()).length, 0);
  });
});

test('update changes the name and sort, and logs only the cells that changed', async t => {
  await withTempDb(t, 'dept_update', async db => {
    const { svc, rows } = setup(db);
    const updated = await svc.update(1, { name: 'Kỹ thuật', sort: 5 }, 'admin', NOW);
    assert.deepEqual({ id: updated.id, name: updated.name, sort: updated.sort }, { id: 1, name: 'Kỹ thuật', sort: 5 });

    const same = await svc.update(1, { name: 'Kỹ thuật' }, 'admin', NOW);
    assert.equal(same.sort, 5);

    const written = await rows();
    assert.equal(written.length, 1, 'a call that changes nothing writes no row');
    assert.equal(written[0].action, 'department.update');
    assert.equal(written[0].entityId, '1');
    assert.deepEqual(written[0].before, { name: 'Phòng ban 1', sort: 1 });
    assert.deepEqual(written[0].after, { name: 'Kỹ thuật', sort: 5 });
  });
});

test('update answers 404 for an unknown department and 409 for a taken name', async t => {
  await withTempDb(t, 'dept_update_bad', async db => {
    const { svc } = setup(db);
    await assert.rejects(svc.update(99, { name: 'X' }, 'admin', NOW), DepartmentNotFoundError);
    await assert.rejects(svc.update(1, { name: 'Phòng ban 2' }, 'admin', NOW), DepartmentNameTakenError);
    await assert.rejects(svc.update(1, {}, 'admin', NOW), DepartmentInputError);
    await assert.rejects(svc.update(1, { sort: 'a' }, 'admin', NOW), DepartmentInputError);
  });
});

test('delete refuses a department that still has people and logs department.delete otherwise', async t => {
  await withTempDb(t, 'dept_delete', async db => {
    const { svc, rows } = setup(db);
    await addStaff(db, 'a', 1);
    await assert.rejects(svc.remove(1, 'admin'), DepartmentNotEmptyError);
    assert.equal((await db.selectFrom('departments').select('id').execute()).length, 2);

    await svc.remove(2, 'admin');
    assert.deepEqual((await db.selectFrom('departments').select('id').execute()).map(r => r.id), [1]);
    const written = await rows();
    assert.equal(written.length, 1);
    assert.equal(written[0].action, 'department.delete');
    assert.equal(written[0].entityId, '2');
    assert.deepEqual(written[0].before, { name: 'Phòng ban 2', sort: 2 });
    assert.equal(written[0].after, null);

    await assert.rejects(svc.remove(2, 'admin'), DepartmentNotFoundError);
  });
});

test('delete clears the department of people who already resigned', async t => {
  await withTempDb(t, 'dept_delete_resigned', async db => {
    const { svc } = setup(db);
    await addStaff(db, 'gone', 2, 'nghiviec');
    await svc.remove(2, 'admin');
    const left = await db.selectFrom('staff').select('department_id').where('username', '=', 'gone').executeTakeFirstOrThrow();
    assert.equal(left.department_id, null);
  });
});

test('a failed audit row rolls the department change back', async t => {
  await withTempDb(t, 'dept_audit_fail', async db => {
    const { failing } = setup(db);
    await assert.rejects(failing.create({ name: 'Mới' }, 'admin', NOW), /audit boom/);
    await assert.rejects(failing.update(1, { name: 'Đổi' }, 'admin', NOW), /audit boom/);
    await assert.rejects(failing.remove(2, 'admin'), /audit boom/);
    const names = (await db.selectFrom('departments').select('name').orderBy('id').execute()).map(r => r.name);
    assert.deepEqual(names, ['Phòng ban 1', 'Phòng ban 2']);
  });
});

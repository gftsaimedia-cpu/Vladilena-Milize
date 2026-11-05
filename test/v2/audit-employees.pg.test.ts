// staff.create / staff.update / staff.delete / password.reset ghi nhật ký trong cùng transaction với hồ sơ
// (spec audit-log mục 6). Một lần lưu tách tối đa ba dòng theo mức nhạy cảm (normal, pay, pii), chung requestId.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Kysely } from 'kysely';
import type { DB } from '../../src/database/schema';
import type { AuditLog } from '../../src/modules/audit/audit-log';
import { EmployeesRepository } from '../../src/modules/employees/employees.repository';
import { EmployeesService } from '../../src/modules/employees/employees.service';
import { auditKit } from './helpers/audit-pg';
import { withTempDb } from './helpers/pg-temp-db';

const BINH = {
  username: 'binh',
  name: 'Nguyễn Văn Bình',
  birthday: '1996-11-20',
  dependants: 1,
  password: 'Moi@123456',
  type: 'nv',
  level: 2,
  jobTitle: 'Kỹ thuật',
  shiftType: 'NORMAL'
};

function setup(db: Kysely<DB>) {
  const kit = auditKit(db);
  const make = (log: AuditLog) => new EmployeesService(new EmployeesRepository(db), kit.tx, log);
  return { ...kit, svc: make(kit.log), failing: make(kit.failingLog) };
}

const staffRow = async (db: Kysely<DB>, username: string) =>
  db.selectFrom('staff').select(['level', 'locked_at', 'resigned_on']).where('username', '=', username).executeTakeFirst();

const shape = (r: { action: string; before: unknown; after: unknown; sensitivity: string }) => [r.action, r.sensitivity, r.before, r.after];

test('staff.create writes the profile split into normal, pay and pii rows', async t => {
  await withTempDb(t, 'audit_staff', async db => {
    const { svc, rows, verify } = setup(db);
    await svc.create(BINH, 'admin');

    const written = await rows();
    assert.deepEqual(written.map(shape), [
      [
        'staff.create',
        'normal',
        null,
        {
          familyName: 'Nguyễn Văn',
          givenName: 'Bình',
          roles: ['staff'],
          isLocked: false,
          jobTitle: 'Kỹ thuật',
          shiftType: 'NORMAL',
          shiftStartTime: '08:00',
          shiftEndTime: '17:00',
          status: 'nv',
          passwordSet: true
        }
      ],
      [
        'staff.create',
        'pay',
        null,
        {
          dependants: 1,
          positionType: 'nv',
          level: 2,
          shiftAllowancePct: 0,
          leaveTotalDays: 0,
          leaveUsedDays: 0,
          isUnionMember: false,
          hasTax: true,
          canAdvance: true,
          isDormResident: false
        }
      ],
      ['staff.create', 'pii', null, { changed: ['birthday'] }]
    ]);
    for (const r of written) {
      assert.equal(r.actor, 'admin');
      assert.equal(r.entityKind, 'staff');
      assert.equal(r.entityId, 'binh');
      assert.equal(r.subject, 'binh');
      assert.equal(r.month, null);
    }
    assert.match(String(written[0].requestId), /^[0-9a-f-]{36}$/);
    assert.equal(new Set(written.map(r => r.requestId)).size, 1);
    assert.deepEqual(await verify(), { ok: true, checked: 3, firstBadId: null, reason: null });
  });
});

test('staff.update writes only the changed cells, one row per sensitivity, and never the birthday value', async t => {
  await withTempDb(t, 'audit_staff', async db => {
    const { svc, rows } = setup(db);
    await svc.create(BINH, 'admin');
    await svc.update('binh', { level: 3, jobTitle: 'Trưởng ca', birthday: '1996-11-21' }, 'hr');

    const written = (await rows()).slice(3);
    assert.deepEqual(written.map(shape), [
      ['staff.update', 'normal', { jobTitle: 'Kỹ thuật' }, { jobTitle: 'Trưởng ca' }],
      ['staff.update', 'pay', { level: 2 }, { level: 3 }],
      ['staff.update', 'pii', null, { changed: ['birthday'] }]
    ]);
    assert.deepEqual([...new Set(written.map(r => [r.actor, r.subject].join()))], ['hr,binh']);
    assert.equal(new Set(written.map(r => r.requestId)).size, 1);
    assert.equal(JSON.stringify(written).includes('1996-11-2'), false);
  });
});

test('a new password writes password.reset with only passwordSet, never the hash', async t => {
  await withTempDb(t, 'audit_staff', async db => {
    const { svc, rows } = setup(db);
    await svc.create(BINH, 'admin');
    await svc.update('binh', { account: { password: 'Khac@123456' } }, 'admin');

    const written = (await rows()).slice(3);
    assert.deepEqual(written.map(shape), [['password.reset', 'normal', null, { passwordSet: true }]]);
    const raw = await db.selectFrom('audit_log').select(['before_json', 'after_json']).execute();
    assert.equal(JSON.stringify(raw).includes('scrypt'), false);
  });
});

test('an update that changes nothing, or of a missing person, writes no row', async t => {
  await withTempDb(t, 'audit_staff', async db => {
    const { svc, rows } = setup(db);
    await svc.create(BINH, 'admin');
    await svc.update('binh', { jobTitle: 'Kỹ thuật' }, 'admin');
    assert.equal(await svc.update('khong-co', { level: 3 }, 'admin'), null);
    assert.equal((await rows()).length, 3);
  });
});

test('staff.delete records the resignation and the lock', async t => {
  await withTempDb(t, 'audit_staff', async db => {
    const { svc, rows } = setup(db);
    await svc.create(BINH, 'admin');
    assert.equal(await svc.deactivate('binh', 'hr'), true);

    const [row, ...rest] = (await rows()).slice(3);
    assert.equal(rest.length, 0);
    assert.deepEqual([row.actor, row.action, row.entityId, row.subject, row.sensitivity], ['hr', 'staff.delete', 'binh', 'binh', 'normal']);
    assert.deepEqual(row.before, { status: 'nv', isLocked: false, resignedOn: null });
    const after = row.after as { status: string; isLocked: boolean; resignedOn: string };
    assert.deepEqual({ ...after, resignedOn: undefined }, { status: 'nghiviec', isLocked: true, resignedOn: undefined });
    assert.match(after.resignedOn, /^\d{4}-\d{2}-\d{2}$/);

    assert.equal(await svc.deactivate('khong-co', 'hr'), false);
    assert.equal((await rows()).length, 4);
  });
});

test('when the audit write fails, the staff change is rolled back with it', async t => {
  await withTempDb(t, 'audit_staff', async db => {
    const { svc, failing, rows } = setup(db);

    await assert.rejects(failing.create(BINH, 'admin'), /audit boom/);
    assert.equal(await staffRow(db, 'binh'), undefined);
    assert.equal((await rows()).length, 0);

    await svc.create(BINH, 'admin');
    await assert.rejects(failing.update('binh', { level: 3 }, 'admin'), /audit boom/);
    await assert.rejects(failing.deactivate('binh', 'admin'), /audit boom/);
    const row = await staffRow(db, 'binh');
    assert.equal(Number(row?.level), 2);
    assert.equal(row?.locked_at, null);
    assert.equal(row?.resigned_on, null);
    assert.equal((await rows()).length, 3);
  });
});

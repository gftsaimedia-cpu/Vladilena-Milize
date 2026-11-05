// holiday.add / holiday.remove ghi nhật ký trong cùng transaction với lịch lễ (spec audit-log mục 6).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Kysely } from 'kysely';
import type { DB } from '../../src/database/schema';
import type { AuditLog } from '../../src/modules/audit/audit-log';
import { HolidayNotFoundError, HolidaysRepository, HolidaysService } from '../../src/modules/holidays';
import { auditKit } from './helpers/audit-pg';
import { withTempDb } from './helpers/pg-temp-db';

function setup(db: Kysely<DB>) {
  const kit = auditKit(db);
  const make = (log: AuditLog) => new HolidaysService(new HolidaysRepository(db), kit.tx, log);
  return { ...kit, svc: make(kit.log), failing: make(kit.failingLog) };
}

const holidayDates = async (db: Kysely<DB>) =>
  (await db.selectFrom('company_holidays').select('name').orderBy('holiday_date').execute()).map(r => r.name);

test('holiday.add writes one row with the date, its month and the new name', async t => {
  await withTempDb(t, 'audit_holidays', async db => {
    const { svc, rows, verify } = setup(db);
    await svc.add({ date: '2026-09-02', name: ' Quốc khánh ' }, 'admin');

    const [row, ...rest] = await rows();
    assert.equal(rest.length, 0);
    assert.deepEqual({ ...row, requestId: undefined }, {
      actor: 'admin',
      action: 'holiday.add',
      entityKind: 'holiday',
      entityId: '2026-09-02',
      subject: null,
      month: '2026-09',
      before: null,
      after: { date: '2026-09-02', name: 'Quốc khánh' },
      reason: null,
      sensitivity: 'normal',
      requestId: undefined
    });
    assert.match(String(row.requestId), /^[0-9a-f-]{36}$/);
    assert.deepEqual(await verify(), { ok: true, checked: 1, firstBadId: null, reason: null });
  });
});

test('quick-add writes one row per day it really added, all with one requestId', async t => {
  await withTempDb(t, 'audit_holidays', async db => {
    const { svc, rows } = setup(db);
    await svc.add({ date: '2026-04-30', name: 'Giải phóng' }, 'admin');
    assert.deepEqual(await svc.quickAdd(2026, 'hr'), ['2026-01-01', '2026-05-01', '2026-09-02']);

    const [first, ...quick] = await rows();
    assert.deepEqual(quick.map(r => [r.actor, r.action, r.entityId, r.month, r.after]), [
      ['hr', 'holiday.add', '2026-01-01', '2026-01', { date: '2026-01-01', name: 'Tết Dương lịch' }],
      ['hr', 'holiday.add', '2026-05-01', '2026-05', { date: '2026-05-01', name: 'Quốc tế Lao động' }],
      ['hr', 'holiday.add', '2026-09-02', '2026-09', { date: '2026-09-02', name: 'Quốc khánh' }]
    ]);
    assert.equal(new Set(quick.map(r => r.requestId)).size, 1);
    assert.notEqual(quick[0].requestId, first.requestId);

    assert.deepEqual(await svc.quickAdd(2026, 'hr'), []);
    assert.equal((await rows()).length, 4);
  });
});

test('a rejected add writes no row', async t => {
  await withTempDb(t, 'audit_holidays', async db => {
    const { svc, rows } = setup(db);
    await svc.add({ date: '2026-09-02', name: 'Quốc khánh' }, 'admin');
    await assert.rejects(svc.add({ date: '2026-09-02', name: 'Lần hai' }, 'admin'), /đã có trong lịch lễ/);
    await assert.rejects(svc.add({ date: '2026-02-30', name: 'x' }, 'admin'), /Ngày lễ không hợp lệ/);
    assert.equal((await rows()).length, 1);
  });
});

test('holiday.remove keeps the removed name in before', async t => {
  await withTempDb(t, 'audit_holidays', async db => {
    const { svc, rows, verify } = setup(db);
    await svc.add({ date: '2026-10-10', name: 'Giỗ Tổ' }, 'admin');
    await svc.remove('2026-10-10', 'hr');

    const removed = (await rows())[1];
    assert.deepEqual({ ...removed, requestId: undefined }, {
      actor: 'hr',
      action: 'holiday.remove',
      entityKind: 'holiday',
      entityId: '2026-10-10',
      subject: null,
      month: '2026-10',
      before: { date: '2026-10-10', name: 'Giỗ Tổ' },
      after: null,
      reason: null,
      sensitivity: 'normal',
      requestId: undefined
    });
    assert.equal((await verify()).ok, true);

    await assert.rejects(svc.remove('2026-10-10', 'hr'), HolidayNotFoundError);
    assert.equal((await rows()).length, 2);
  });
});

test('when the audit write fails, the holiday change is rolled back with it', async t => {
  await withTempDb(t, 'audit_holidays', async db => {
    const { svc, failing, rows } = setup(db);

    await assert.rejects(failing.add({ date: '2026-09-02', name: 'Quốc khánh' }, 'admin'), /audit boom/);
    await assert.rejects(failing.quickAdd(2026, 'admin'), /audit boom/);
    assert.deepEqual(await holidayDates(db), []);
    assert.equal((await rows()).length, 0);

    await svc.add({ date: '2026-10-10', name: 'Giỗ Tổ' }, 'admin');
    await assert.rejects(failing.remove('2026-10-10', 'admin'), /audit boom/);
    assert.deepEqual(await holidayDates(db), ['Giỗ Tổ']);
    assert.deepEqual((await rows()).map(r => r.action), ['holiday.add']);
  });
});

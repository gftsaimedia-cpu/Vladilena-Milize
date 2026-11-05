import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import type { Kysely } from 'kysely';
import type { DB } from '../../src/database/schema';
import { AttendanceRepository } from '../../src/modules/attendance/attendance.repository';
import { withTempDb } from './helpers/pg-temp-db';

const NOW = new Date('2026-11-05T03:00:00.000Z');

async function seedStaff(db: Kysely<DB>) {
  await db.insertInto('staff').values({ username: 'nv-binh', name: 'Bình', type: 'nv', uuid: 'u-binh', pass_hash: 'x', created_at: '2026-11-05' }).execute();
}

async function request(
  db: Kysely<DB>,
  type: 'OVERTIME' | 'SHIFT_CHANGE' | 'LEAVE_WITH_MAKEUP',
  status: 'PENDING' | 'APPROVED' | 'REJECTED',
  extra: Record<string, unknown> = {}
): Promise<string> {
  const id = randomUUID();
  await db
    .insertInto('system_requests')
    .values({ id, employee_id: 'u-binh', title: type, type, reason: 'x', status, created_at: NOW, updated_at: NOW, ...extra } as any)
    .execute();
  return id;
}

async function makeupSlot(db: Kysely<DB>, requestId: string, workDate: string) {
  await db.insertInto('makeup_slots').values({ request_id: requestId, work_date: workDate, start_time: '08:00', end_time: '12:00', work_minutes: 240 }).execute();
}

test('hasApprovedWorkOn counts approved overtime, shift change and makeup slots on that day only', async t => {
  await withTempDb(t, 'attendance_workday', async db => {
    await seedStaff(db);
    const repo = new AttendanceRepository(db);
    const day = '2026-12-12';
    assert.equal(await repo.hasApprovedWorkOn('u-binh', day), false);

    // Chưa duyệt hoặc bị từ chối: không tính
    const pendingOt = await request(db, 'OVERTIME', 'PENDING', { ot_date: day });
    await request(db, 'OVERTIME', 'REJECTED', { ot_date: day });
    await request(db, 'SHIFT_CHANGE', 'PENDING', { change_start_date: '2026-12-10', change_end_date: '2026-12-14' });
    await request(db, 'SHIFT_CHANGE', 'REJECTED', { change_start_date: '2026-12-10', change_end_date: '2026-12-14' });
    const pendingMk = await request(db, 'LEAVE_WITH_MAKEUP', 'PENDING');
    await makeupSlot(db, pendingMk, day);
    const rejectedMk = await request(db, 'LEAVE_WITH_MAKEUP', 'REJECTED');
    await makeupSlot(db, rejectedMk, day);
    assert.equal(await repo.hasApprovedWorkOn('u-binh', day), false);
    assert.ok(pendingOt);

    // Đã duyệt nhưng ngày ngoài khoảng: không tính
    await request(db, 'OVERTIME', 'APPROVED', { ot_date: '2026-12-11' });
    await request(db, 'SHIFT_CHANGE', 'APPROVED', { change_start_date: '2026-12-13', change_end_date: '2026-12-20' });
    const farMk = await request(db, 'LEAVE_WITH_MAKEUP', 'APPROVED');
    await makeupSlot(db, farMk, '2026-12-13');
    assert.equal(await repo.hasApprovedWorkOn('u-binh', day), false);

    // Người khác không tính
    assert.equal(await repo.hasApprovedWorkOn('u-khac', day), false);
  });
});

test('hasApprovedWorkOn is true for each approved kind', async t => {
  const day = '2026-12-12';
  const cases: Array<[string, (db: Kysely<DB>) => Promise<void>]> = [
    ['overtime', async db => void (await request(db, 'OVERTIME', 'APPROVED', { ot_date: day }))],
    ['shift change covering the day', async db => void (await request(db, 'SHIFT_CHANGE', 'APPROVED', { change_start_date: '2026-12-10', change_end_date: '2026-12-14' }))],
    ['shift change on its first day', async db => void (await request(db, 'SHIFT_CHANGE', 'APPROVED', { change_start_date: day, change_end_date: '2026-12-14' }))],
    ['shift change on its last day', async db => void (await request(db, 'SHIFT_CHANGE', 'APPROVED', { change_start_date: '2026-12-10', change_end_date: day }))],
    [
      'makeup slot',
      async db => {
        const id = await request(db, 'LEAVE_WITH_MAKEUP', 'APPROVED');
        await makeupSlot(db, id, day);
      }
    ]
  ];
  for (const [name, arrange] of cases) {
    await withTempDb(t, 'attendance_workday_ok', async db => {
      await seedStaff(db);
      await arrange(db);
      assert.equal(await new AttendanceRepository(db).hasApprovedWorkOn('u-binh', day), true, name);
    });
  }
});

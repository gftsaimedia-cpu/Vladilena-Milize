// request.decide / request.cancel ghi nhật ký trong cùng transaction với đơn (spec audit-log mục 6).
// Không ghi: nhân viên tự nộp hoặc tự huỷ đơn của mình (đã có ở system_requests).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Kysely } from 'kysely';
import type { DB } from '../../src/database/schema';
import type { AuditLog } from '../../src/modules/audit/audit-log';
import { AttendanceRepository } from '../../src/modules/attendance/attendance.repository';
import { HolidaysRepository } from '../../src/modules/holidays/holidays.repository';
import { DayStatusRepository } from '../../src/modules/requests/day-status.repository';
import { RequestsRepository } from '../../src/modules/requests/requests.repository';
import { RequestsService } from '../../src/modules/requests/requests.service';
import { auditKit } from './helpers/audit-pg';
import { withTempDb } from './helpers/pg-temp-db';

async function setup(db: Kysely<DB>) {
  const now = new Date().toISOString();
  await db
    .insertInto('staff')
    .values([
      { username: 'binh', name: 'Bình', type: 'nv', level: 1, pass_hash: 'x', created_at: now, uuid: 'u-binh' },
      { username: 'admin', name: 'Quản trị', type: 'nv', level: 1, pass_hash: 'x', created_at: now, uuid: 'u-admin' }
    ])
    .execute();
  const kit = auditKit(db);
  const make = (log: AuditLog) =>
    new RequestsService(
      new RequestsRepository(db),
      new AttendanceRepository(db),
      kit.tx,
      new HolidaysRepository(db),
      new DayStatusRepository(db),
      undefined,
      undefined,
      undefined,
      undefined,
      log
    );
  const svc = make(kit.log);
  const leave = (date: string) =>
    svc.createLeaveRequest({ employeeId: 'binh', title: 'Nghỉ', reason: 'Việc nhà', leaveType: 'PERSONAL_UNPAID', startDate: date, endDate: date });
  return { ...kit, svc, failing: make(kit.failingLog), leave };
}

const row = (action: string, id: string, before: string, after: string, reason: string | null) => ({
  actor: 'admin',
  action,
  entityKind: 'request',
  entityId: id,
  subject: 'binh',
  month: null,
  before: { status: before },
  after: { status: after },
  reason,
  sensitivity: 'normal',
  requestId: undefined
});
const plain = (r: { requestId: unknown }) => ({ ...r, requestId: undefined });

test('request.decide records an approval and a rejection, with the note as the reason', async t => {
  await withTempDb(t, 'audit_requests', async db => {
    const { svc, leave, rows, verify } = await setup(db);
    const approved = await leave('2026-11-12');
    const rejected = await leave('2026-11-13');
    assert.equal((await rows()).length, 0, 'nộp đơn không ghi nhật ký');

    await svc.reviewRequest(approved.id, 'admin', 'APPROVE');
    // Người duyệt có thể truyền uuid; nhật ký vẫn ghi tên đăng nhập.
    await svc.reviewRequest(rejected.id, 'u-admin', 'REJECT', 'Không đủ người');

    const written = await rows();
    assert.deepEqual(written.map(plain), [
      row('request.decide', approved.id, 'PENDING', 'APPROVED', null),
      row('request.decide', rejected.id, 'PENDING', 'REJECTED', 'Không đủ người')
    ]);
    assert.match(String(written[0].requestId), /^[0-9a-f-]{36}$/);
    assert.deepEqual(await verify(), { ok: true, checked: 2, firstBadId: null, reason: null });
  });
});

test('a refused review writes no row', async t => {
  await withTempDb(t, 'audit_requests', async db => {
    const { svc, leave, rows } = await setup(db);
    const req = await leave('2026-11-12');
    await svc.reviewRequest(req.id, 'admin', 'APPROVE');
    await assert.rejects(svc.reviewRequest(req.id, 'admin', 'REJECT'));
    assert.equal((await rows()).length, 1);
  });
});

test('request.cancel records an Admin cancelling for the author, not the author cancelling their own', async t => {
  await withTempDb(t, 'audit_requests', async db => {
    const { svc, leave, rows } = await setup(db);
    const byAdmin = await leave('2026-11-12');
    const bySelf = await leave('2026-11-13');
    const bySelfOnAdminRoute = await leave('2026-11-16');

    await svc.cancelRequest(byAdmin.id, 'binh', 'Nhập nhầm ngày', 'admin');
    await svc.cancelRequest(bySelf.id, 'binh', 'Đổi ý');
    await svc.cancelRequest(bySelfOnAdminRoute.id, 'binh', undefined, 'binh');

    assert.deepEqual((await rows()).map(plain), [row('request.cancel', byAdmin.id, 'PENDING', 'CANCELLED', 'Nhập nhầm ngày')]);
  });
});

test('when the audit write fails, the review and the cancel are rolled back with it', async t => {
  await withTempDb(t, 'audit_requests', async db => {
    const { failing, leave, rows } = await setup(db);
    const req = await leave('2026-11-12');

    await assert.rejects(failing.reviewRequest(req.id, 'admin', 'APPROVE'), /audit boom/);
    await assert.rejects(failing.cancelRequest(req.id, 'binh', 'Nhập nhầm', 'admin'), /audit boom/);

    const stored = await db.selectFrom('system_requests').select(['status', 'reviewed_by']).where('id', '=', req.id).executeTakeFirstOrThrow();
    assert.deepEqual(stored, { status: 'PENDING', reviewed_by: null });
    const day = await db.selectFrom('work_schedules').select('status').where('employee_id', '=', 'u-binh').where('work_date', '=', '2026-11-12').executeTakeFirst();
    assert.notEqual(day?.status, 'ON_LEAVE');
    assert.equal((await rows()).length, 0);
  });
});

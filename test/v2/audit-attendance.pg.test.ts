// punch.correct: Admin thêm giờ chấm công cho nhân viên (route POST /attendance/punches) ghi nhật ký trong cùng
// transaction với lần chấm (spec audit-log mục 6). Không ghi: nhân viên tự chấm công (/me), lần chấm bị từ chối.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Kysely } from 'kysely';
import type { Client } from 'pg';
import type { DB } from '../../src/database/schema';
import type { AuditLog } from '../../src/modules/audit/audit-log';
import { AttendanceRepository } from '../../src/modules/attendance/attendance.repository';
import { AttendanceService } from '../../src/modules/attendance/attendance.service';
import { AttendanceDaysRepository } from '../../src/modules/attendance/attendance-days.repository';
import { AttendanceDaysService } from '../../src/modules/attendance/attendance-days.service';
import { SettingsAttendanceSettings } from '../../src/modules/attendance/attendance-settings.port';
import { SettingsReader } from '../../src/modules/settings/settings-reader';
import { SettingsRepository } from '../../src/modules/settings/settings.repository';
import { auditKit } from './helpers/audit-pg';
import { withTempDb } from './helpers/pg-temp-db';

const NV = '11111111-1111-4111-8111-111111111111';

async function setup(db: Kysely<DB>, client: Client) {
  const typeId = (
    await client.query(
      `INSERT INTO position_types (code, effective_month, name, workdays, flex_pct, night_pct, travel_pct,
         attendance_pct, regular_dows, makeup_dows, updated_by, updated_at)
       VALUES ('nv-test', '2000-01', 'NV', 26, 10, 30, 0, 0, '[1,2,3,4,5,6]', '[]', 'x', 'x') RETURNING id`
    )
  ).rows[0].id;
  await client.query(
    `INSERT INTO position_type_benefits (type_id, benefit, enabled) VALUES
       ($1, 'paidLeave', 1), ($1, 'paidHoliday', 1), ($1, 'isat', 0)`,
    [typeId]
  );
  await client.query(
    `INSERT INTO staff (username, name, type, level, pass_hash, created_at, uuid, start_date)
     VALUES ('nv', 'Nhân viên', 'nv-test', 1, 'x', '2026-01-01', $1, '2026-01-05')`,
    [NV]
  );
  const kit = auditKit(db);
  const days = new AttendanceDaysService(
    new AttendanceDaysRepository(db),
    new SettingsAttendanceSettings(new SettingsReader(new SettingsRepository(db))),
    kit.tx
  );
  const make = (log: AuditLog) =>
    new AttendanceService(new AttendanceRepository(db), days, undefined, kit.tx, undefined, undefined, log);
  return { ...kit, svc: make(kit.log), failing: make(kit.failingLog) };
}

const at = (local: string) => new Date(`${local}+07:00`);
const plain = (r: { requestId: unknown }) => ({ ...r, requestId: undefined });

const row = (before: unknown, after: unknown, reason: string | null) => ({
  actor: 'admin',
  action: 'punch.correct',
  entityKind: 'attendance-day',
  entityId: '2026-11-03',
  subject: 'nv',
  month: '2026-11',
  before,
  after,
  reason,
  sensitivity: 'normal',
  requestId: undefined
});

test('punch.correct records an Admin punch: the day in/out before and after, the punch added, the note', async t => {
  await withTempDb(t, 'audit_attendance', async (db, client) => {
    const { svc, rows, verify } = await setup(db, client);

    await svc.recordPunch({ employeeId: NV, type: 'IN', punchedAt: at('2026-11-03T08:40:00') }, { actor: 'admin' });
    await svc.recordPunch(
      { employeeId: NV, type: 'IN', punchedAt: at('2026-11-03T08:00:00'), note: ' Quên chấm, camera xác nhận ' },
      { actor: 'admin' }
    );

    const written = await rows();
    assert.deepEqual(written.map(plain), [
      row({ in: null, out: null }, { in: '08:40', out: null, added: 'IN 08:40' }, null),
      row({ in: '08:40', out: null }, { in: '08:00', out: null, added: 'IN 08:00' }, 'Quên chấm, camera xác nhận')
    ]);
    assert.match(String(written[0].requestId), /^[0-9a-f-]{36}$/);
    assert.deepEqual(await verify(), { ok: true, checked: 2, firstBadId: null, reason: null });
  });
});

test('a punch without an Admin actor (staff self punch) and a refused punch write no row', async t => {
  await withTempDb(t, 'audit_attendance', async (db, client) => {
    const { svc, rows } = await setup(db, client);

    await svc.recordPunch({ employeeId: NV, type: 'IN', punchedAt: at('2026-11-03T08:00:00') });
    // Trước ngày vào làm (05/01): bị chặn NOT_EMPLOYED, không ghi gì.
    await assert.rejects(
      svc.recordPunch({ employeeId: NV, type: 'IN', punchedAt: at('2026-01-02T08:00:00') }, { actor: 'admin' })
    );

    assert.equal((await rows()).length, 0);
  });
});

test('when the audit write fails, the punch and the day row are rolled back', async t => {
  await withTempDb(t, 'audit_attendance', async (db, client) => {
    const { failing, rows } = await setup(db, client);

    await assert.rejects(
      failing.recordPunch({ employeeId: NV, type: 'IN', punchedAt: at('2026-11-03T08:00:00') }, { actor: 'admin' }),
      /audit boom/
    );

    const punches = await client.query('SELECT 1 FROM punch_events WHERE employee_id = $1', [NV]);
    assert.equal(punches.rows.length, 0);
    const day = await client.query('SELECT 1 FROM timesheet_entries WHERE employee_id = $1', [NV]);
    assert.equal(day.rows.length, 0);
    assert.equal((await rows()).length, 0);
  });
});

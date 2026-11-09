import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import { createKysely, createPgPool } from '../../../src/database';
import { AttendanceDaysRepository } from '../../../src/modules/attendance/attendance-days.repository';
import { SettingsAttendanceSettings } from '../../../src/modules/attendance/attendance-settings.port';
import { CalendarService } from '../../../src/modules/calendar';
import { RequestsRepository } from '../../../src/modules/requests/requests.repository';
import { DayStatusRepository } from '../../../src/modules/requests/day-status.repository';
import { SettingsReader } from '../../../src/modules/settings/settings-reader';
import { SettingsRepository } from '../../../src/modules/settings/settings.repository';
import { ADMIN, type Api, ScenarioEnv, msg } from '../helpers/scenario-env';

// CalendarService.monthOf trên DB thật: Month dựng từ lịch, đơn đã duyệt và đơn đang chờ.
const env = new ScenarioEnv();
const enabled = ScenarioEnv.enabled();
const NOW = new Date('2026-11-05T09:00:00+07:00'); // Thứ Năm
let admin: Api;
let nv: Api;
let db: ReturnType<typeof createKysely>;
let calendar: CalendarService;
let uuid = '';

before(async () => {
  if (enabled) await env.start('sc_cal');
});
after(async () => {
  await db?.destroy();
  if (enabled) await env.stop();
});
beforeEach(async () => {
  if (!enabled) return;
  await db?.destroy();
  await env.reset();
  uuid = await env.staff({ username: 'nv1', leaveTotal: 5 });
  env.at('2026-11-05T09:00:00+07:00');
  const a = await env.rawLogin(ADMIN);
  admin = env.apiWith(String(a.headers.get('set-cookie')).split(';')[0]);
  const n = await env.rawLogin('nv1');
  nv = env.apiWith(String(n.headers.get('set-cookie')).split(';')[0]);
  db = createKysely(createPgPool(process.env.DATABASE_URL!));
  calendar = new CalendarService(
    new AttendanceDaysRepository(db),
    new SettingsAttendanceSettings(new SettingsReader(new SettingsRepository(db))),
    new DayStatusRepository(db),
    new RequestsRepository(db)
  );
});

describe('CalendarService.monthOf', { skip: !enabled }, () => {
  it('tháng không có đơn: ngày làm T2–T7, Chủ nhật nghỉ, phase theo hôm nay', async () => {
    const m = await calendar.monthOf(uuid, '2026-11', NOW);
    assert.equal(m.days.length, 30);
    assert.equal(m.day('2026-11-03').kind, 'WORK');
    assert.equal(m.day('2026-11-08').kind, 'REST');
    assert.equal(m.day('2026-11-03').phase, 'DONE');
    assert.equal(m.day('2026-11-05').phase, 'IN_PROGRESS');
    assert.equal(m.day('2026-11-06').phase, 'UPCOMING');
    assert.ok(m.days.every(d => d.claims.length === 0));
  });

  it('đơn nghỉ chờ duyệt: ngày vẫn là WORK và có claim chờ; duyệt xong thành ngày nghỉ có claim đã duyệt', async () => {
    const filed = await nv.post('/api/v2/me/requests/leave', { leaveType: 'ANNUAL', reason: 'Về quê', startDate: '2026-11-10', endDate: '2026-11-11' });
    assert.equal(filed.status, 201, msg(filed));
    const id = filed.body.request.id as string;

    const waiting = await calendar.monthOf(uuid, '2026-11', NOW);
    for (const date of ['2026-11-10', '2026-11-11']) {
      const day = waiting.day(date);
      assert.equal(day.kind, 'WORK', date);
      assert.deepEqual(day.pending.map(c => [c.requestId, c.kind]), [[id, 'LEAVE']], date);
    }
    assert.equal(waiting.day('2026-11-12').pending.length, 0);

    const ok = await admin.patch(`/api/v2/requests/${id}/review`, { action: 'APPROVE' });
    assert.equal(ok.status, 200, msg(ok));
    const approved = await calendar.monthOf(uuid, '2026-11', NOW);
    for (const date of ['2026-11-10', '2026-11-11']) {
      const day = approved.day(date);
      assert.equal(day.kind, 'LEAVE_PAID', date);
      assert.equal(day.pending.length, 0, date);
      assert.equal(day.claimOf('LEAVE')?.requestId, id, date);
      assert.equal(day.claimOf('LEAVE')?.status, 'APPROVED', date);
    }
    assert.equal(approved.day('2026-11-12').kind, 'WORK');
  });

  it('đơn bị từ chối không giữ ngày: chỉ để một claim REJECTED để lịch báo', async () => {
    const filed = await nv.post('/api/v2/me/requests/leave', { leaveType: 'ANNUAL', reason: 'Việc nhà', startDate: '2026-11-17', endDate: '2026-11-17' });
    assert.equal(filed.status, 201, msg(filed));
    const no = await admin.patch(`/api/v2/requests/${filed.body.request.id}/review`, { action: 'REJECT', note: 'Bận' });
    assert.equal(no.status, 200, msg(no));
    const m = await calendar.monthOf(uuid, '2026-11', NOW);
    const day = m.day('2026-11-17');
    assert.equal(day.kind, 'WORK');
    assert.deepEqual(day.claims.map(c => c.status), ['REJECTED']);
    assert.equal(day.pending.length, 0);
    assert.equal(day.declined?.kind, 'LEAVE');
  });

  it('ngày lễ công ty: HOLIDAY trên ngày làm', async () => {
    assert.equal((await admin.post('/api/v2/holidays', { date: '2026-11-13', name: 'Lễ thử' })).status, 201);
    const m = await calendar.monthOf(uuid, '2026-11', NOW);
    assert.equal(m.day('2026-11-13').kind, 'HOLIDAY');
  });
});

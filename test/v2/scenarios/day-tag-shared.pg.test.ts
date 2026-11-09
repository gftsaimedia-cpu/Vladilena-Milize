import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import { ADMIN, type Api, ScenarioEnv, msg, workDay } from '../helpers/scenario-env';

// Lịch Admin (hồ sơ chấm công một người) và lịch nhân viên đọc CÙNG một nhãn `tag` do BE dựng từ Month.
const env = new ScenarioEnv();
const enabled = ScenarioEnv.enabled();
let admin: Api;
let nv: Api;
let uuid: string;

before(async () => {
  if (enabled) await env.start('sc_tag');
});
after(async () => {
  if (enabled) await env.stop();
});
beforeEach(async () => {
  if (!enabled) return;
  await env.reset();
  uuid = await env.staff({ username: 'nv1', leaveTotal: 5, startDate: '2026-08-01' });
  env.at('2026-11-07T10:00:00+07:00'); // Thứ Bảy
  const a = await env.rawLogin(ADMIN);
  admin = env.apiWith(String(a.headers.get('set-cookie')).split(';')[0]);
  const n = await env.rawLogin('nv1');
  nv = env.apiWith(String(n.headers.get('set-cookie')).split(';')[0]);
});

const dayOf = (body: any, date: string) => body.days.find((d: any) => d.date === date);
const both = async () => {
  const staff = await nv.get('/api/v2/me/attendance?month=2026-11');
  const adm = await admin.get('/api/v2/attendance/employees/nv1?month=2026-11');
  assert.equal(staff.status, 200, msg(staff));
  assert.equal(adm.status, 200, msg(adm));
  return { staff: staff.body, adm: adm.body };
};
const approve = async (res: any) => {
  assert.equal(res.status, 201, msg(res));
  const r = await admin.patch(`/api/v2/requests/${res.body.request.id}/review`, { action: 'APPROVE' });
  assert.equal(r.status, 200, msg(r));
};

describe('nhãn ngày dùng chung Admin và nhân viên', { skip: !enabled }, () => {
  it('nghỉ có lương, không lương, lễ, OT ngày Chủ nhật: hai bên giống hệt nhau', async () => {
    await approve(await nv.post('/api/v2/me/requests/leave', { leaveType: 'ANNUAL', reason: 'Việc nhà', startDate: '2026-11-10', endDate: '2026-11-10' }));
    await approve(await nv.post('/api/v2/me/requests/leave', { leaveType: 'UNPAID', reason: 'Việc nhà', startDate: '2026-11-11', endDate: '2026-11-11' }));
    assert.equal((await admin.post('/api/v2/holidays', { date: '2026-11-13', name: 'Lễ thử' })).status, 201);
    await approve(await nv.post('/api/v2/me/requests/overtime', { reason: 'Gấp việc', otDate: '2026-11-15', startTime: '08:00', endTime: '12:00' }));
    const { staff, adm } = await both();

    const want: Record<string, [string, string]> = {
      '2026-11-10': ['leave_paid', 'Nghỉ có lương'],
      '2026-11-11': ['leave_unpaid', 'Nghỉ không lương'],
      '2026-11-13': ['holiday', 'Nghỉ lễ'],
      '2026-11-15': ['ot', 'Làm thêm (OT)']
    };
    for (const [date, [plan, label]] of Object.entries(want)) {
      const s = dayOf(staff, date).tag;
      assert.deepEqual([s.plan, s.planLabel], [plan, label], date);
      assert.deepEqual(dayOf(adm, date).tag, s, `Admin lệch nhân viên ở ${date}`);
    }
    assert.deepEqual(dayOf(staff, '2026-11-15').tag.extras, [{ code: 'ot', text: 'OT 08:00–12:00' }]);
    // Mọi ngày trong tháng: hai bên cùng nhãn.
    for (const d of staff.days) assert.deepEqual(dayOf(adm, d.date).tag, d.tag, d.date);
  });

  it('ngày làm có ca; ngày đi đủ là hợp lệ; thiếu giờ ra là cần giải trình', async () => {
    await workDay(admin, uuid, '2026-11-02');
    await admin.post('/api/v2/attendance/punches', { employeeId: uuid, type: 'IN', punchedAt: '2026-11-03T08:00:00+07:00' });
    await admin.post('/api/v2/attendance/recalculate', { employeeId: uuid, month: '2026-11' });
    const { staff, adm } = await both();
    const ok = dayOf(staff, '2026-11-02').tag;
    assert.deepEqual([ok.plan, ok.shift, ok.review], ['work', 'HC 08:00–17:00', 'valid']);
    assert.equal(dayOf(staff, '2026-11-03').tag.review, 'needs_explanation');
    assert.deepEqual(dayOf(adm, '2026-11-02').tag, ok);
    assert.deepEqual(dayOf(adm, '2026-11-03').tag, dayOf(staff, '2026-11-03').tag);
  });

  it('giải trình: chờ duyệt, được duyệt, bị từ chối', async () => {
    for (const d of ['04', '05', '06']) await admin.post('/api/v2/attendance/punches', { employeeId: uuid, type: 'IN', punchedAt: `2026-11-${d}T08:00:00+07:00` });
    await admin.post('/api/v2/attendance/recalculate', { employeeId: uuid, month: '2026-11' });
    const file = (workDate: string) => nv.post('/api/v2/me/requests/explanation', { workDate, reason: 'Quên bấm Check-out', actualCheckOut: '17:00' });
    const a = await file('2026-11-04');
    const b = await file('2026-11-05');
    const c = await file('2026-11-06');
    for (const r of [a, b, c]) assert.equal(r.status, 201, msg(r));
    assert.equal((await admin.patch(`/api/v2/requests/${a.body.request.id}/review`, { action: 'APPROVE' })).status, 200);
    assert.equal((await admin.patch(`/api/v2/requests/${b.body.request.id}/review`, { action: 'REJECT', reason: 'Không đủ căn cứ' })).status, 200);
    const { staff, adm } = await both();
    assert.equal(dayOf(staff, '2026-11-04').tag.review, 'approved');
    assert.equal(dayOf(staff, '2026-11-05').tag.review, 'rejected');
    assert.equal(dayOf(staff, '2026-11-06').tag.review, 'pending');
    for (const d of ['04', '05', '06']) assert.deepEqual(dayOf(adm, `2026-11-${d}`).tag, dayOf(staff, `2026-11-${d}`).tag, d);
  });

  it('đơn chờ duyệt, bị từ chối, bị huỷ: hai bên cùng nhãn; đi làm rồi thì nhãn từ chối được thay', async () => {
    const leave = (d: string) => nv.post('/api/v2/me/requests/leave', { leaveType: 'ANNUAL', reason: 'Việc nhà', startDate: d, endDate: d });
    const waiting = await leave('2026-11-10');
    const rejected = await leave('2026-11-11');
    const cancelled = await leave('2026-11-12');
    const later = await leave('2026-11-13');
    for (const r of [waiting, rejected, cancelled, later]) assert.equal(r.status, 201, msg(r));
    assert.equal((await admin.patch(`/api/v2/requests/${rejected.body.request.id}/review`, { action: 'REJECT', note: 'Bận' })).status, 200);
    assert.equal((await nv.patch(`/api/v2/me/requests/${cancelled.body.request.id}/cancel`, {})).status, 200);
    assert.equal((await admin.patch(`/api/v2/requests/${later.body.request.id}/review`, { action: 'REJECT', note: 'Bận' })).status, 200);
    const { staff, adm } = await both();
    const t = (d: string) => dayOf(staff, `2026-11-${d}`).tag;
    assert.equal(t('10').requestPending, true);
    assert.equal(t('10').declined, null);
    assert.deepEqual(t('11').declined, { status: 'rejected', text: 'Đơn nghỉ bị từ chối' });
    assert.deepEqual(t('12').declined, { status: 'cancelled', text: 'Đơn nghỉ đã huỷ' });
    assert.equal(t('11').plan, 'work');
    for (const d of ['10', '11', '12', '13']) assert.deepEqual(dayOf(adm, `2026-11-${d}`).tag, t(d), d);

    // Tới ngày 13: nhân viên vẫn đi làm dù đơn bị từ chối; sau khi chấm công thì nhãn từ chối được thay.
    env.at('2026-11-13T19:00:00+07:00');
    await workDay(admin, uuid, '2026-11-13');
    const after = await both();
    assert.equal(dayOf(after.staff, '2026-11-13').tag.declined, null);
    assert.equal(dayOf(after.staff, '2026-11-13').tag.review, 'valid');
    assert.deepEqual(dayOf(after.adm, '2026-11-13').tag, dayOf(after.staff, '2026-11-13').tag);
    assert.deepEqual(dayOf(after.staff, '2026-11-11').tag.declined, { status: 'rejected', text: 'Đơn nghỉ bị từ chối' });
  });
});

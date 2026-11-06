import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import { type Api, ScenarioEnv, msg } from '../helpers/scenario-env';

// POST /api/v2/me/requests/leave-with-makeup/plan trên request-context thật của BE.
const env = new ScenarioEnv();
const enabled = ScenarioEnv.enabled();
let nv: Api;

before(async () => {
  if (enabled) await env.start('sc_mkp');
});
after(async () => {
  if (enabled) await env.stop();
});
beforeEach(async () => {
  if (!enabled) return;
  await env.reset();
  await env.staff({ username: 'nv1', leaveTotal: 3 });
  env.at('2026-11-03T08:40:12+07:00');
  const res = await env.rawLogin('nv1');
  nv = env.apiWith(String(res.headers.get('set-cookie')).split(';')[0]);
});

describe('kế hoạch bù', { skip: !enabled }, () => {
  it('chưa đăng nhập 401; quá 20 dòng 400', async () => {
    assert.equal((await env.apiWith('').post('/api/v2/me/requests/leave-with-makeup/plan', {})).status, 401);
    const many = Array.from({ length: 21 }, () => ({ date: '', startTime: '', endTime: '' }));
    assert.equal((await nv.post('/api/v2/me/requests/leave-with-makeup/plan', { startDate: '2026-11-10', endDate: '2026-11-10', slots: many })).status, 400);
  });

  it('BE tính cần bù 480 phút/ngày, chỉnh dòng và đưa giờ chọn được; đủ giờ thì hết thêm dòng', async () => {
    const ctx = (await nv.get('/api/v2/me/request-context')).body;
    const start = ctx.choices['leave-with-makeup'].starts[0];
    const end = start;
    const pick = ctx.choices['leave-with-makeup'].ends[start].find((e: any) => e.date === end);
    assert.equal(pick.makeupMinutesRequired, 480);
    const url = '/api/v2/me/requests/leave-with-makeup/plan';
    const first = await nv.post(url, { startDate: start, endDate: end, slots: [{ date: '', startTime: '', endTime: '' }] });
    assert.equal(first.status, 200, msg(first));
    assert.deepEqual([first.body.requiredMinutes, first.body.plannedMinutes, first.body.canAdd], [480, 0, true]);
    const day = first.body.slotDates[0];
    assert.ok(day, 'phải có ngày bù chọn được');
    const second = await nv.post(url, { startDate: start, endDate: end, slots: [{ date: day, startTime: '', endTime: '' }] });
    const starts = second.body.slots[0].startOptions as string[];
    assert.ok(starts.length > 0);
    const third = await nv.post(url, { startDate: start, endDate: end, slots: [{ date: day, startTime: starts[0], endTime: '' }] });
    const ends = third.body.slots[0].endOptions as string[];
    assert.ok(ends.length > 0);
    // Giờ lạ bị BE bỏ.
    const bad = await nv.post(url, { startDate: start, endDate: end, slots: [{ date: day, startTime: '03:00', endTime: '04:00' }] });
    assert.deepEqual([bad.body.slots[0].startTime, bad.body.slots[0].endTime], ['', '']);
    // Khoảng nghỉ lạ: cần 0.
    const none = await nv.post(url, { startDate: '2020-01-01', endDate: '2020-01-01', slots: [] });
    assert.deepEqual([none.body.requiredMinutes, none.body.canAdd], [0, false]);
  });
});

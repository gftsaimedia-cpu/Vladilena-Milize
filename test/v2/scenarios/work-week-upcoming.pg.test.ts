import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import { ADMIN, type Api, ScenarioEnv, msg } from '../helpers/scenario-env';

// GET /settings/work-weeks/:username: `upcoming` (tuần đổi từ tháng sau) và `standardByDays` do BE tính.
const env = new ScenarioEnv();
const enabled = ScenarioEnv.enabled();
let admin: Api;

before(async () => {
  if (enabled) await env.start('sc_wwup');
});
after(async () => {
  if (enabled) await env.stop();
});
beforeEach(async () => {
  if (!enabled) return;
  await env.reset();
  await env.staff({ username: 'nv1' });
  env.at('2026-11-03T08:40:12+07:00');
  const res = await env.rawLogin(ADMIN);
  admin = env.apiWith(String(res.headers.get('set-cookie')).split(';')[0]);
});

describe('tuần làm việc: upcoming và công chuẩn', { skip: !enabled }, () => {
  it('chưa đổi gì: upcoming null; bảng công chuẩn 1..6 ngày', async () => {
    const r = await admin.get('/api/v2/settings/work-weeks/nv1?month=2026-11');
    assert.equal(r.status, 200, msg(r));
    assert.equal(r.body.upcoming, null);
    assert.deepEqual(r.body.standardByDays, { 1: 4, 2: 9, 3: 13, 4: 17, 5: 22, 6: 26 });
  });

  it('đặt tuần riêng từ tháng sau: tháng này thấy upcoming kèm công chuẩn; tháng đó thì hết', async () => {
    const cur = await admin.get('/api/v2/settings/work-weeks/nv1?month=2026-11');
    const save = await admin.put('/api/v2/settings/work-weeks/nv1', { weekdays: [1, 2, 3, 4, 5], effectiveMonth: '2026-12', reason: null, stamp: cur.body.stamp });
    assert.equal(save.status, 200, msg(save));
    const r = await admin.get('/api/v2/settings/work-weeks/nv1?month=2026-11');
    assert.deepEqual(r.body.upcoming, { month: '2026-12', weekdays: [1, 2, 3, 4, 5], standardWorkdays: 22 });
    const later = await admin.get('/api/v2/settings/work-weeks/nv1?month=2026-12');
    assert.equal(later.body.upcoming, null);
    assert.equal(later.body.standardWorkdays, 22);
  });

  it('quay về tuần của loại từ tháng sau: upcoming có weekdays null và công chuẩn null', async () => {
    let cur = await admin.get('/api/v2/settings/work-weeks/nv1?month=2026-11');
    const own = await admin.put('/api/v2/settings/work-weeks/nv1', { weekdays: [1, 2, 3, 4, 5], effectiveMonth: '2026-11', reason: null, stamp: cur.body.stamp });
    assert.equal(own.status, 200, msg(own));
    cur = await admin.get('/api/v2/settings/work-weeks/nv1?month=2026-11');
    const back = await admin.put('/api/v2/settings/work-weeks/nv1', { weekdays: null, effectiveMonth: '2026-12', reason: null, stamp: cur.body.stamp });
    assert.equal(back.status, 200, msg(back));
    const r = await admin.get('/api/v2/settings/work-weeks/nv1?month=2026-11');
    assert.deepEqual(r.body.upcoming, { month: '2026-12', weekdays: null, standardWorkdays: null });
  });
});

import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import { type Api, ScenarioEnv, ZONE, msg } from '../helpers/scenario-env';

// POST /api/v2/me/punches/check: BE quyết nút chấm công có khoá không, cùng luật với POST /me/punches.
const env = new ScenarioEnv();
const enabled = ScenarioEnv.enabled();
let nv: Api;

before(async () => {
  if (enabled) await env.start('sc_pchk');
});
after(async () => {
  if (enabled) await env.stop();
});
beforeEach(async () => {
  if (!enabled) return;
  await env.reset();
  await env.staff({ username: 'nv1' });
  env.at('2026-11-03T08:40:12+07:00'); // Thứ Ba
  const res = await env.rawLogin('nv1');
  nv = env.apiWith(String(res.headers.get('set-cookie')).split(';')[0]);
});

describe('kiểm khoá nút chấm công', { skip: !enabled }, () => {
  it('chưa đăng nhập 401; thiếu hoặc sai kind 400', async () => {
    assert.equal((await env.apiWith('').post('/api/v2/me/punches/check', { kind: 'IN' })).status, 401);
    for (const body of [{}, { kind: 'in' }, { kind: 'X' }]) {
      assert.equal((await nv.post('/api/v2/me/punches/check', body)).status, 400);
    }
  });

  it('ở trong vùng: mở; ngoài vùng: khoá kèm câu khoảng cách; không có vị trí: khoá', async () => {
    const inside = await nv.post('/api/v2/me/punches/check', { kind: 'IN', lat: ZONE.lat, lng: ZONE.lng });
    assert.equal(inside.status, 200, msg(inside));
    assert.equal(inside.body.locked, false);
    const far = await nv.post('/api/v2/me/punches/check', { kind: 'IN', lat: ZONE.lat + 0.05, lng: ZONE.lng });
    assert.equal(far.body.locked, true);
    assert.equal(far.body.code, 'OUTSIDE_ZONE');
    assert.match(far.body.reason, /^Bạn đang cách văn phòng \d+ m$/);
    assert.ok(far.body.distanceM > 500);
    const none = await nv.post('/api/v2/me/punches/check', { kind: 'OUT' });
    assert.deepEqual([none.body.locked, none.body.code, none.body.reason], [true, 'NO_LOCATION', 'Không lấy được vị trí']);
  });

  it('luật khớp lúc chấm thật: nơi báo khoá thì chấm cũng bị từ chối cùng mã', async () => {
    const far = { kind: 'IN', lat: ZONE.lat + 0.05, lng: ZONE.lng, accuracyM: 5 };
    const check = await nv.post('/api/v2/me/punches/check', far);
    const real = await nv.post('/api/v2/me/punches', far);
    assert.equal(real.status, 400);
    assert.equal(real.body.code, check.body.code);
    assert.equal(real.body.error ?? real.body.message, check.body.reason);
  });

  it('ngày không phải ngày làm: khoá lần vào ca dù đang ở văn phòng, nhưng không khoá ra ca', async () => {
    env.at('2026-11-08T08:40:12+07:00'); // Chủ nhật
    const inn = await nv.post('/api/v2/me/punches/check', { kind: 'IN', lat: ZONE.lat, lng: ZONE.lng });
    assert.deepEqual([inn.body.locked, inn.body.code], [true, 'NOT_A_WORKDAY']);
    const out = await nv.post('/api/v2/me/punches/check', { kind: 'OUT', lat: ZONE.lat, lng: ZONE.lng });
    assert.equal(out.body.locked, false);
  });
});

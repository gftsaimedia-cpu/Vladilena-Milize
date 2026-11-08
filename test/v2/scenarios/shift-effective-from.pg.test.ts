import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import { ADMIN, type Api, ScenarioEnv, msg, workDay } from '../helpers/scenario-env';

// Đổi ca mặc định kèm ngày áp dụng: các ngày trước đó vẫn tính theo ca cũ, từ ngày đó trở đi theo ca mới.
const env = new ScenarioEnv();
const enabled = ScenarioEnv.enabled();
let admin: Api;
let uuid = '';

before(async () => {
  if (enabled) await env.start('sc_shiftfrom');
});
after(async () => {
  if (enabled) await env.stop();
});
beforeEach(async () => {
  if (!enabled) return;
  await env.reset();
  uuid = await env.staff({ username: 'nv1', startDate: '2026-10-01' });
  env.at('2026-11-12T10:00:00+07:00'); // Thứ Năm
  const a = await env.rawLogin(ADMIN);
  admin = env.apiWith(String(a.headers.get('set-cookie')).split(';')[0]);
  // Ba ngày đi làm đủ giờ theo ca hành chính 08:00–17:00.
  for (const d of ['2026-11-02', '2026-11-03', '2026-11-04']) {
    const [a1, b1] = await workDay(admin, uuid, d);
    assert.ok(a1.status < 300 && b1.status < 300, msg(a1) + msg(b1));
  }
});

const FLEX = { contract: { shift: { type: 'FLEX', startTime: '13:00', endTime: '22:00', allowancePct: 10 } } };
const dayRow = async (date: string) => (await env.q(`SELECT status, pay_units, shift_type, shift_start_time FROM timesheet_entries WHERE employee_id = $1 AND work_date = $2`, [uuid, date]))[0];

describe('ngày áp dụng ca mới', { skip: !enabled }, () => {
  it('đổi ca từ 05/11: ngày đã đi làm trước đó giữ nguyên công, ca và tiền; từ 05/11 theo ca mới', async () => {
    const before = await dayRow('2026-11-03');
    assert.deepEqual([before.status, Number(before.pay_units), before.shift_type], ['PRESENT', 1, 'NORMAL']);

    const res = await admin.put('/api/v2/employees/nv1', { contract: { shift: { ...FLEX.contract.shift, effectiveFrom: '2026-11-05' } } });
    assert.equal(res.status, 200, msg(res));
    assert.equal(res.body.employee.shiftEffectiveFrom, '2026-11-05');
    assert.equal(res.body.employee.contract.shift.type, 'FLEX');

    for (const d of ['2026-11-02', '2026-11-03', '2026-11-04']) {
      const row = await dayRow(d);
      assert.deepEqual([row.status, Number(row.pay_units), row.shift_type, row.shift_start_time], ['PRESENT', 1, 'NORMAL', '08:00'], d);
    }
    const next = await dayRow('2026-11-06'); // ngày sau ngày áp dụng: ca mới
    assert.deepEqual([next.shift_type, next.shift_start_time], ['FLEX', '13:00']);
    const history = await env.q(`SELECT effective_from, shift_type FROM staff_shift_history WHERE employee_id = $1 ORDER BY effective_from`, [uuid]);
    assert.deepEqual(history.map(r => [r.effective_from, r.shift_type]), [['2000-01-01', 'NORMAL'], ['2026-11-05', 'FLEX']]);
  });

  it('không nói ngày: áp từ hôm nay (12/11); các ngày trước đó giữ ca cũ', async () => {
    const res = await admin.put('/api/v2/employees/nv1', FLEX);
    assert.equal(res.status, 200, msg(res));
    assert.equal(res.body.employee.shiftEffectiveFrom, '2026-11-12');
    const row = await dayRow('2026-11-03');
    assert.deepEqual([row.status, Number(row.pay_units), row.shift_type], ['PRESENT', 1, 'NORMAL']);
  });

  it('ngày sai dạng hoặc trước ngày vào làm bị từ chối, hồ sơ giữ nguyên', async () => {
    for (const [from, pattern] of [['5/11', /không hợp lệ/], ['2026-09-30', /không được trước ngày vào làm/]] as const) {
      const res = await admin.put('/api/v2/employees/nv1', { contract: { shift: { ...FLEX.contract.shift, effectiveFrom: from } } });
      assert.equal(res.status, 400, msg(res));
      assert.match(res.body.error, pattern);
    }
    const profile = await admin.get('/api/v2/employees/nv1');
    assert.equal(profile.body.employee.contract.shift.type, 'NORMAL');
    assert.equal(profile.body.employee.shiftEffectiveFrom, null);
  });

  it('tháng đã chốt công thì không áp ca mới từ một ngày trong tháng đó', async () => {
    env.at('2026-11-12T10:00:00+07:00');
    const locked = await admin.post('/api/v2/system/periods/2026-10/lock');
    assert.ok(locked.status < 300, msg(locked));
    const res = await admin.put('/api/v2/employees/nv1', { contract: { shift: { ...FLEX.contract.shift, effectiveFrom: '2026-10-20' } } });
    assert.equal(res.status, 400, msg(res));
    assert.match(res.body.error, /đã chốt công/);
  });

  it('gán ca hàng loạt nhận ngày áp dụng', async () => {
    const res = await admin.post('/api/v2/employees/shift', { usernames: ['nv1'], shiftCode: 'Flex1', effectiveFrom: '2026-11-08' });
    assert.equal(res.status, 201, msg(res));
    assert.equal(res.body.done[0].shiftEffectiveFrom, '2026-11-08');
    const row = await dayRow('2026-11-03');
    assert.equal(row.shift_type, 'NORMAL');
  });
});

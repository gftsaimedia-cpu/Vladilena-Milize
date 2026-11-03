'use strict';
// Giải trình ngày quên chấm và ngày đã khai nghỉ cả ngày: chỉ khai nghỉ đang chờ duyệt hoặc đã duyệt là ngày nghỉ (duyệt giải trình không ghi lượt Admin,
// cảnh báo EXPLANATION_NOT_RECORDED). Khai nghỉ bị từ chối thì Check-in được, ngày vẫn là ngày đi làm: duyệt giải trình ghi lượt Admin theo giờ ca.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
require('../helpers/require-isolated-database');
const F = require('../helpers/api-fixture');
const X = require('../helpers/explanation-flow');
const { ADMIN_ORIGIN } = require('../../src/domain/attendance/attendance-sessions');
const { reconcileMonthApprovals } = require('../../src/domain/approvals');

const adminRows = async (username?, date?) =>
  (await X.sessionsOn(username, date)).filter(s => s.entry.origin === ADMIN_ORIGIN);
const warningCodes = (res?) => (res.data.warnings || []).map(w => w.code);

before(async () => {
  await F.start();
  await F.at('2026-10-29T12:00:00');
  for (const name of ['tuchoi', 'cho', 'duyet']) await F.person(name);
  await F.person('admin', 'admin');
});
after(() => F.stop());

// Nhân sự đã khai ngày nghỉ date (kind) và khoản đang chờ duyệt; action: 'reject' | 'approve' | null
async function declareOff(who?, date?, kind?, action?) {
  await F.store.setSheet(who, '2026-10', { [date]: { kind } });
  await reconcileMonthApprovals(who, '2026-10', await F.store.getSetting('holidays', []), 'nv');
  if (!action) return;
  const queue = await F.call('GET', '/approvals', { who: 'admin' });
  const items = queue.data.items
    .filter(x => x.username === who && x.date === date)
    .map(x => ({ username: x.username, date: x.date, rev: x.rev, fingerprint: x.fingerprint }));
  assert.equal(items.length, 1, 'có khoản chờ duyệt của ngày khai nghỉ');
  const res = await F.call('PUT', '/approvals/decide', {
    who: 'admin',
    body: { action, items, ...(action === 'reject' ? { note: 'Không đủ người' } : {}) }
  });
  assert.equal(res.status, 200, JSON.stringify(res.data));
}

for (const [kind, date] of [
  ['leave', '2026-10-21'],
  ['isat', '2026-10-24']
])
  test(`Khai nghỉ ${kind} bị từ chối: Check-in được, duyệt giải trình ghi lượt Admin theo giờ ca, không cảnh báo`, async () => {
    await declareOff('tuchoi', date, kind, 'reject');
    await X.forgotOut('tuchoi', date, '08:40', `rj-off-${kind}`); // Check-in được (khai nghỉ bị từ chối không chặn), rồi quên Check-out
    const item = await X.askAndAnswer('tuchoi', date);
    const res = await X.decide(item.id, true);
    assert.equal(res.status, 200, JSON.stringify(res.data));
    assert.equal(res.data.item.status, 'approved');
    assert.equal(res.data.recorded, true);
    assert.deepEqual(warningCodes(res), []);
    const [mine] = await adminRows('tuchoi', date);
    assert.ok(mine, 'có lượt Admin của ngày');
    assert.equal(mine.entry.explanationId, item.id);
    assert.equal(mine.entry.presIn, X.iso(`${date}T08:00:00`));
    assert.equal(mine.entry.presOut, X.iso(`${date}T17:00:00`));
  });

test('Khai nghỉ đang chờ duyệt hoặc đã duyệt vẫn là ngày nghỉ: duyệt giải trình không ghi lượt Admin, cảnh báo EXPLANATION_NOT_RECORDED', async () => {
  for (const [who, date, action] of [
    ['cho', '2026-10-21', null],
    ['duyet', '2026-10-22', 'approve']
  ]) {
    await declareOff(who, date, 'leave', action);
    const item = await X.askAndAnswer(who, date);
    const res = await X.decide(item.id, true);
    assert.equal(res.status, 200, JSON.stringify(res.data));
    assert.equal(res.data.recorded, false, who);
    assert.deepEqual(warningCodes(res), ['EXPLANATION_NOT_RECORDED'], who);
    assert.match(res.data.warnings[0].message, /ngày đã khai là ngày nghỉ/);
    assert.equal((await adminRows(who, date)).length, 0, who);
  }
});

test('Ngày khai nghỉ bị từ chối: giải trình quên Check-out được duyệt tính lương y như ngày chấm đủ giờ', async () => {
  const date = '2026-10-26';
  await declareOff('tuchoi', date, 'leave', 'reject');
  await X.forgotOut('tuchoi', date, '08:40', 'rj-pay-forgot');
  const item = await X.askAndAnswer('tuchoi', date);
  assert.equal((await X.decide(item.id, true)).data.recorded, true);
  await declareOff('duyet', date, 'leave', 'reject');
  await X.fullDay('duyet', date, '08:00', '17:00', 'rj-pay-full');
  const a = (await X.payOf('tuchoi')).payDays[date];
  const b = (await X.payOf('duyet')).payDays[date];
  assert.deepEqual(a, b, 'cùng một cách tính lương với ngày chấm đủ giờ');
});

'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
require('../helpers/require-isolated-database');
const F = require('../helpers/api-fixture');

const ids = { in: 0, out: 0 };
const punch = async (who, type, extra = {}) =>
  await F.call('POST', '/punch', {
    who,
    body: { type, requestId: `attendance-${who}-${type}-${++ids[type]}`, ...extra }
  });

before(async () => {
  await F.start();
  await F.person('early', 'staff', { shiftCode: 'n1' });
  await F.person('late31', 'staff', { shiftCode: 'n1' });
  await F.person('night', 'staff', { shiftCode: 'g2' });
  await F.person('nightempty', 'staff', { shiftCode: 'g2' });
  await F.person('nightin', 'staff', { shiftCode: 'g2' });
  await F.person('nightout', 'staff', { shiftCode: 'g2' });
  await F.person('night-reentry', 'staff', { shiftCode: 'g2' });
  await F.person('out29', 'staff', { shiftCode: 'n1' });
  await F.person('out30', 'staff', { shiftCode: 'n1' });
  await F.person('missing-explain', 'staff', { shiftCode: 'n1' });
  await F.person('both-sides', 'staff', { shiftCode: 'n1' });
});
after(() => F.stop());

test('early checkout stores actual time and blocks re-entry to that work date only', async () => {
  await F.at('2026-11-03T08:00:00');
  const opened = await punch('early', 'in');
  assert.equal(opened.status, 200, JSON.stringify(opened.data));
  await F.at('2026-11-03T16:00:00');
  const closed = await punch('early', 'out', { sessionId: opened.data.open.id, explanation: 'Rời ca sớm' });
  assert.equal(closed.status, 200, JSON.stringify(closed.data));
  const stored = await F.store.getSession(opened.data.open.id);
  assert.equal(stored.entry.presOut, '2026-11-03T09:00:00.000Z');
  await F.at('2026-11-03T16:05:00');
  const retry = await punch('early', 'in', { explanation: 'Thử vào lại cùng ca' });
  assert.equal(retry.status, 409, JSON.stringify(retry.data));
  assert.match(retry.data.error, /không Check-in lại/);
  await F.at('2026-11-04T08:00:00');
  const nextShift = await punch('early', 'in');
  assert.equal(nextShift.status, 200, JSON.stringify(nextShift.data));
});

test('check-in over 30 minutes requires explanation and records actual time with forgotten-in flag', async () => {
  await F.at('2026-11-04T08:31:00');
  let res = await punch('late31', 'in');
  assert.equal(res.status, 409);
  assert.equal(res.data.code, 'CHECKIN_NEEDS_EXPLANATION');
  res = await punch('late31', 'in', { explanation: 'Đến muộn có lý do' });
  assert.equal(res.status, 200, JSON.stringify(res.data));
  const stored = await F.store.getSession(res.data.open.id);
  assert.equal(stored.entry.presIn, '2026-11-04T01:31:00.000Z');
  assert.equal(stored.entry.forgotIn, true);
  const explained = await F.call('GET', '/explanations?status=answered&user=late31', { who: 'late31' });
  assert.equal(explained.status, 200);
  assert.equal(explained.data.items.some(x => x.kind === 'punch-in'), true);
});

test('owner can explain a closed forgotten checkout without changing punches; other users cannot', async () => {
  await F.at('2026-11-06T18:00:00');
  const created = await F.store.createSession('missing-explain', '2026-11-06', 'closed', {
    kind: 'pending', reason: 'forgot-out', forgotIn: true, presIn: '2026-11-06T01:00:00.000Z'
  });
  const id = created.id;
  await require('../../src/domain/container').container.explanations.submitForSession({
    username: 'missing-explain', session: created, text: 'Giải trình phía vào', kind: 'punch-in', prompt: 'Quên Check-in'
  });
  const before = await F.store.getSession(id);
  let res = await F.call('POST', '/explanations', { who: 'late31', body: { sessionId: id, text: 'wrong owner' } });
  assert.equal(res.status, 404);
  assert.equal(res.data.code, 'SESSION_NOT_FOUND');
  res = await F.call('POST', '/explanations', { who: 'missing-explain', body: { sessionId: id, text: 'Em quên bấm ra' } });
  assert.equal(res.status, 200, JSON.stringify(res.data));
  assert.equal(res.data.item.kind, 'punch-out');
  assert.equal(res.data.item.status, 'answered');
  res = await F.call('POST', '/explanations', { who: 'missing-explain', body: { sessionId: id, text: 'Gửi trùng phía ra' } });
  assert.equal(res.status, 409);
  assert.equal(res.data.code, 'EXPLANATION_EXISTS');
  const after = await F.store.getSession(id);
  assert.deepEqual(after.entry, before.entry);
});

test('a late check-in explanation does not block a later forgotten checkout explanation on the same session', async () => {
  await F.at('2026-11-06T08:31:00');
  const opened = await punch('both-sides', 'in', { explanation: 'Giải trình quên vào' });
  assert.equal(opened.status, 200, JSON.stringify(opened.data));
  const id = opened.data.open.id;
  await F.at('2026-11-07T01:00:00');
  await F.call('GET', '/punch', { who: 'both-sides' }); // auto close after max-open duration
  const closed = await F.store.getSession(id);
  assert.equal(closed.entry.forgotIn, true);
  assert.equal(closed.entry.reason, 'forgot-out');
  const res = await F.call('POST', '/explanations', {
    who: 'both-sides', body: { sessionId: id, text: 'Giải trình quên ra' }
  });
  assert.equal(res.status, 200, JSON.stringify(res.data));
  assert.equal(res.data.item.kind, 'punch-out');
});


test('overnight absence is not flagged until shift end and stays on its start work date', async () => {
  const { AbsentDay } = require('../../src/domain/explanation/absent-day');
  const absentDay = new AbsentDay({ store: F.store });
  await F.at('2026-10-28T06:59:00');
  assert.equal(await absentDay.stateOf('night', '2026-10-27'), 'other');
  await F.at('2026-10-28T07:00:00');
  assert.equal(await absentDay.stateOf('night', '2026-10-27'), 'absent');
});


test('absence requires no punch on either side; an empty session does not count as a punch', async () => {
  const { AbsentDay } = require('../../src/domain/explanation/absent-day');
  const absentDay = new AbsentDay({ store: F.store });
  await F.at('2026-10-28T07:00:00');
  await F.store.createSession('nightempty', '2026-10-27', 'closed', { kind: 'pending', reason: 'review' });
  await F.store.createSession('nightin', '2026-10-27', 'closed', {
    kind: 'pending', reason: 'forgot-out', presIn: '2026-10-27T15:00:00.000Z'
  });
  await F.store.createSession('nightout', '2026-10-27', 'closed', {
    kind: 'pending', reason: 'forgot-in', presOut: '2026-10-28T00:00:00.000Z'
  });
  assert.equal(await absentDay.stateOf('nightempty', '2026-10-27'), 'absent');
  assert.equal(await absentDay.stateOf('nightin', '2026-10-27'), 'punched');
  assert.equal(await absentDay.stateOf('nightout', '2026-10-27'), 'punched');
});


test('early checkout on an overnight shift blocks re-entry after midnight until the next shift', async () => {
  await F.at('2026-10-27T22:00:00');
  const opened = await punch('night-reentry', 'in');
  assert.equal(opened.status, 200, JSON.stringify(opened.data));
  await F.at('2026-10-28T02:00:00');
  const closed = await punch('night-reentry', 'out', { sessionId: opened.data.open.id, explanation: 'R?i ca s?m' });
  assert.equal(closed.status, 200, JSON.stringify(closed.data));
  await F.at('2026-10-28T02:05:00');
  const retry = await punch('night-reentry', 'in', { explanation: 'Th? v?o l?i ca ??m' });
  assert.equal(retry.status, 409, JSON.stringify(retry.data));
  await F.at('2026-10-28T22:00:00');
  const nextShift = await punch('night-reentry', 'in');
  assert.equal(nextShift.status, 200, JSON.stringify(nextShift.data));
});

test('late checkout at 29 minutes is immediate; exactly 30 minutes requires explanation', async () => {
  await F.at('2026-11-05T08:00:00');
  const opened29 = await punch('out29', 'in');
  assert.equal(opened29.status, 200, JSON.stringify(opened29.data));
  await F.at('2026-11-05T17:29:00');
  const out29 = await punch('out29', 'out', { sessionId: opened29.data.open.id });
  assert.equal(out29.status, 200, JSON.stringify(out29.data));
  await F.at('2026-11-05T08:00:00');
  const opened30 = await punch('out30', 'in');
  assert.equal(opened30.status, 200, JSON.stringify(opened30.data));
  await F.at('2026-11-05T17:30:00');
  const needs = await punch('out30', 'out', { sessionId: opened30.data.open.id });
  assert.equal(needs.status, 409);
  assert.equal(needs.data.code, 'CHECKOUT_NEEDS_EXPLANATION');
  const explained = await punch('out30', 'out', { sessionId: opened30.data.open.id, explanation: 'Tan ca mu?n' });
  assert.equal(explained.status, 200, JSON.stringify(explained.data));
});

'use strict';
// Danh sách kiểm chốt công (src/domain/period/periods.ts → checklist): mã EXPLANATION_PENDING đếm ngày có giải trình chưa quyết định (cảnh báo, không
// chặn); ngày có giải trình bị từ chối là đã chốt "không tính công" nên không còn nằm trong FORGOT_PUNCH.
const P = require('../helpers/period-api');
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const PunchRules = require('../../src/engine/punch');

const { F, store, flow } = P;

before(F.start);
after(F.stop);

const monthOf = P.monthPool();
const SCHED = { tts: [1, 2, 3, 4, 5], ctv: [1, 2, 3, 4, 5, 6], nv: [1, 2, 3, 4, 5, 6] };
const view = async (month?) => (await F.call('GET', `/periods/${month}`)).data;
const itemOf = (v?, code?) => (v.checklist || []).find(i => i.code === code);
const countOf = (v?, code?) => (itemOf(v, code) || { count: 0 }).count;

// Phiên quên Check-out (chỉ có giờ vào) của ngày đi làm đầu tiên của tháng, đúng dạng ActualHours coi là 'forgot-out'
async function addForgotOut(username?, month?) {
  const person = flow.PEOPLE.find(p => p.username === username);
  const staff = { shiftCode: person.shiftCode, sched: SCHED[person.type] };
  const days = (await store.getSheet(username, month)).days;
  const date = P.datesOf(month).find(d => days[d] && days[d].kind === 'work' && PunchRules.planShift(staff, d));
  assert.ok(date, `${month}: phải có ngày làm việc theo ca`);
  const plan = PunchRules.planShift(staff, date);
  const entry = PunchRules.buildDay({ shiftCode: person.shiftCode }, plan.startIso, plan.endIso, 'punch', {
    plannedShift: plan,
    approveIncomplete: true
  }).entry;
  delete entry.presOut;
  entry.kind = 'pending';
  entry.reason = 'forgot-out';
  await store.createSession(username, plan.date, 'closed', entry);
  return plan.date;
}
const ask = async (username?, date?) => {
  const asked = await F.call('POST', '/explanations', {
    who: 'admin',
    body: { username, date, prompt: 'Vì sao ngày này thiếu giờ?' }
  });
  assert.equal(asked.status, 200, JSON.stringify(asked.data));
  return asked.data.item;
};
const answer = async (item?) => {
  const res = await F.call('POST', `/explanations/${item.id}/answer`, {
    who: item.username,
    body: { text: 'Em quên bấm' }
  });
  assert.equal(res.status, 200, JSON.stringify(res.data));
};
const decide = (item?, approve?) =>
  F.call('POST', `/explanations/${item.id}/decide`, { who: 'admin', body: { approve } });

test('Giải trình chưa quyết định (chờ trả lời hoặc đã trả lời) là EXPLANATION_PENDING: cảnh báo, không chặn chốt công', async () => {
  const M = monthOf();
  await P.seed(M);
  assert.equal(countOf(await view(M), 'EXPLANATION_PENDING'), 0);
  const stored = (await store.getSheet('qa_nv1', M)).days;
  const [d1, d2] = P.datesOf(M).filter(d => stored[d]);
  const first = await ask('qa_nv1', d1);
  await ask('qa_nv1', d2);
  await answer(first);
  const v = await view(M);
  const item = itemOf(v, 'EXPLANATION_PENDING');
  assert.ok(item, JSON.stringify(v.checklist));
  assert.deepEqual([item.count, item.severity, item.acknowledgeable, item.link], [2, 'warn', false, 'approvals']);
  assert.equal(countOf(v, 'PENDING_APPROVALS'), 0, 'giải trình không phải yêu cầu chờ duyệt');
  P.must(await P.step(M, 'lock-attendance'), 'chốt công không bị chặn bởi giải trình chờ');
});

test('Ngày quên Check-out có giải trình bị từ chối không còn trong FORGOT_PUNCH và không đếm vào EXPLANATION_PENDING; chờ quyết định thì vẫn là quên Check-out', async () => {
  const M = monthOf();
  await P.seed(M);
  const date = await addForgotOut('qa_nv1', M);
  assert.equal(countOf(await view(M), 'FORGOT_PUNCH'), 1);
  const item = await ask('qa_nv1', date);
  await answer(item);
  const waiting = await view(M);
  assert.equal(countOf(waiting, 'FORGOT_PUNCH'), 1);
  assert.equal(countOf(waiting, 'EXPLANATION_PENDING'), 1);

  assert.equal((await decide(item, false)).status, 200);
  const rejected = await view(M);
  assert.equal(countOf(rejected, 'FORGOT_PUNCH'), 0, 'đã chốt không tính công');
  assert.equal(countOf(rejected, 'EXPLANATION_PENDING'), 0);
  P.must(await P.step(M, 'lock-attendance'), 'chốt công');
});

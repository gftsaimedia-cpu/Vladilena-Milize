'use strict';
// Tạm ứng: nhân sự chỉ tạo được yêu cầu vào ngày 16 và 17 của tháng (giờ Việt Nam, theo đồng hồ giả của test).
//   POST /api/advance-approvals/request ngoài cửa sổ: 409 ADVANCE_WINDOW_CLOSED, không lưu gì, không ghi nhật ký
//   POST /api/advance-approvals/request cho tháng khác tháng của hôm nay: 409 ADVANCE_MONTH_NOT_CURRENT (yêu cầu tạo ngày 16 hoặc 17 của tháng M là tạm ứng của tháng M)
//   GET  /api/advance-approvals?month=                 kèm window { days: [16, 17], open }
//   Duyệt, từ chối, rút yêu cầu không bị giới hạn theo ngày
// Người bịa qa_*, DB trong bộ nhớ. Các ngày thử nằm trong chính tháng `month`; lịch của `month` khai thay lúc đồng hồ ở ngày 2 tháng sau.
const P = require('../helpers/period-api');
const { nextMonthOf } = require('../helpers/advance-window');
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { advanceApprovals } = require('../../src/domain/advance');

const { F, store } = P;

before(F.start);
after(F.stop);

const pad = (n?) => String(n).padStart(2, '0');
const datesOf = (month?) =>
  Array.from(
    { length: new Date(Date.UTC(+month.slice(0, 4), +month.slice(5, 7), 0)).getUTCDate() },
    (_, i) => `${month}-${pad(i + 1)}`
  );
const workDates = (month?) => datesOf(month).filter(d => new Date(d + 'T00:00:00Z').getUTCDay() !== 0);

const PEOPLE = ['qa_nv1', 'qa_nv2', 'qa_nv3'];
// Ba NV bậc 1 ca n1; Admin khai thay mọi ngày làm của tháng; đồng hồ: ngày 2 tháng sau
async function setup(month?) {
  await F.reset();
  await P.revokeAllRoles();
  await F.at(`${nextMonthOf(month)}-02T12:00:00`);
  await store.setSetting('holidays', []);
  await F.person('admin', 'admin', { type: 'tts', level: 0, shiftCode: null, startDate: null });
  const days = Object.fromEntries(workDates(month).map(d => [d, { kind: 'work', in: '08:00', out: '17:00' }]));
  for (const user of PEOPLE) {
    await F.person(user, 'staff', { type: 'nv', level: 1, shiftCode: 'n1', startDate: '2026-01-05', leaveAdjust: 30 });
    const res = await F.call('PUT', '/sheet', { who: 'admin', body: { month, user, days } });
    assert.equal(res.status, 200, `khai thay ${user}: ${JSON.stringify(res.data)}`);
  }
}
const ask = async (month?, who?) => await F.call('POST', '/advance-approvals/request', { who, body: { month } });
const withdraw = async (month?, who?) => await F.call('POST', '/advance-approvals/withdraw', { who, body: { month } });
const list = async (month?, who?) => await F.call('GET', `/advance-approvals?month=${month}`, { who });
const advanceAudit = async () =>
  (await store.db.prepare("SELECT COUNT(*) AS n FROM audit_log WHERE action LIKE 'advance.%'").get()).n;
// Đặt đồng hồ về `date` (YYYY-MM-DD, 12:00) rồi xin; nếu được thì rút ngay để lần xin sau cùng tháng không vướng ADVANCE_ALREADY_REQUESTED
async function tryOn(month?, date?, who = 'qa_nv1', time = '12:00:00') {
  await F.at(`${date}T${time}`);
  const res = await ask(month, who);
  if (res.status === 200) assert.equal((await withdraw(month, who)).status, 200);
  return res;
}
const closed = (res?) => {
  assert.equal(res.status, 409, JSON.stringify(res.data));
  assert.equal(res.data.code, 'ADVANCE_WINDOW_CLOSED');
};
const opened = (res?, what?) => assert.equal(res.status, 200, `${what}: ${JSON.stringify(res.data)}`);

test('ngày 15 và 18 bị chặn 409 ADVANCE_WINDOW_CLOSED; ngày 16 và 17 xin được', async () => {
  const M = '2026-10';
  await setup(M);
  closed(await tryOn(M, '2026-10-15'));
  opened(await tryOn(M, '2026-10-16'), 'ngày 16');
  opened(await tryOn(M, '2026-10-17'), 'ngày 17');
  closed(await tryOn(M, '2026-10-18'));
  closed(await tryOn(M, '2026-10-01'));
  closed(await tryOn(M, '2026-10-30'));
});

test('câu báo là một câu tiếng Việt nêu ngày 16 và 17; từ chối không lưu yêu cầu và không ghi nhật ký', async () => {
  const M = '2026-10';
  await setup(M);
  const approvalsBefore = await advanceApprovals.read(M);
  const auditBefore = await advanceAudit();
  await F.at('2026-10-18T09:00:00');
  const res = await ask(M, 'qa_nv1');
  closed(res);
  assert.match(res.data.error, /16/);
  assert.match(res.data.error, /17/);
  assert.deepEqual(await advanceApprovals.read(M), approvalsBefore);
  assert.equal(await advanceAudit(), auditBefore);
  assert.equal((await list(M, 'qa_nv1')).data.item.status, null);
});

test('tháng ngắn và cuối tháng 31 ngày: 28/02/2027, 29/02/2028 và 31/10/2026 bị chặn; 16/02 và 17/02 mở', async () => {
  await setup('2027-02');
  closed(await tryOn('2027-02', '2027-02-28'));
  opened(await tryOn('2027-02', '2027-02-16'), '16/02/2027');
  opened(await tryOn('2027-02', '2027-02-17'), '17/02/2027');
  await setup('2028-02');
  closed(await tryOn('2028-02', '2028-02-29'));
  closed(await tryOn('2028-02', '2028-02-28'));
  opened(await tryOn('2028-02', '2028-02-17'), '17/02/2028');
  await setup('2026-10');
  closed(await tryOn('2026-10', '2026-10-31'));
  opened(await tryOn('2026-10', '2026-10-16'), '16/10/2026');
});

test('chỉ xin được tạm ứng của tháng đang chạy: tháng trước và tháng sau bị chặn 409 ADVANCE_MONTH_NOT_CURRENT, không lưu gì', async () => {
  await setup('2026-10');
  const auditBefore = await advanceAudit();
  for (const date of ['2026-11-16', '2026-11-17']) {
    await F.at(`${date}T12:00:00`);
    for (const month of ['2026-10', '2026-12', '2027-03', '2026-09']) {
      const res = await ask(month, 'qa_nv1');
      assert.equal(res.status, 409, `${date} xin ${month}: ${JSON.stringify(res.data)}`);
      assert.equal(res.data.code, 'ADVANCE_MONTH_NOT_CURRENT');
      assert.match(res.data.error, /tháng/);
      assert.equal((await advanceApprovals.read(month)).rev, 0);
      assert.equal((await advanceApprovals.requests(month)).size, 0);
    }
  }
  assert.equal(await advanceAudit(), auditBefore);
  await F.at('2026-10-16T12:00:00');
  opened(await ask('2026-10', 'qa_nv1'), 'tháng của hôm nay');
  await F.at('2026-12-31T12:00:00');
  closed(await ask('2026-12', 'qa_nv2'));
});

test('ranh giới theo giờ Việt Nam: 23:59 ngày 15 đóng, 00:00 ngày 16 mở, 23:59 ngày 17 mở, 00:00 ngày 18 đóng', async () => {
  const M = '2026-10';
  await setup(M);
  closed(await tryOn(M, '2026-10-15', 'qa_nv1', '23:59:59'));
  opened(await tryOn(M, '2026-10-16', 'qa_nv1', '00:00:00'), '00:00 ngày 16');
  opened(await tryOn(M, '2026-10-17', 'qa_nv1', '23:59:59'), '23:59 ngày 17');
  closed(await tryOn(M, '2026-10-18', 'qa_nv1', '00:00:00'));
});

test('đồng hồ giả dời sang ngày 16 rồi ngày 18: xin được rồi bị chặn; người đã xin vẫn rút và được duyệt ngày 18', async () => {
  const M = '2026-10';
  await setup(M);
  await F.at('2026-10-16T09:00:00');
  opened(await ask(M, 'qa_nv1'), 'ngày 16');
  await F.at('2026-10-18T09:00:00');
  closed(await ask(M, 'qa_nv2'));
  const mine = await list(M, 'qa_nv1');
  assert.equal(mine.data.item.status, 'pending', 'yêu cầu đã gửi ngày 16 vẫn còn');
  await F.at('2026-10-17T09:00:00');
  opened(await ask(M, 'qa_nv2'), 'ngày 17');
});

test('Admin duyệt, từ chối, duyệt tất cả ngày 20 và nhân sự rút ngày 20 đều làm được', async () => {
  const M = '2026-10';
  await setup(M);
  await F.at('2026-10-16T09:00:00');
  for (const user of PEOPLE) opened(await ask(M, user), `xin ${user}`);
  await F.at('2026-10-20T09:00:00');
  const approve = await F.call('POST', '/advance-approvals/approve', { body: { month: M, username: 'qa_nv1' } });
  opened(approve, 'duyệt ngày 20');
  assert.equal(approve.data.item.status, 'approved');
  const reject = await F.call('POST', '/advance-approvals/reject', { body: { month: M, username: 'qa_nv2' } });
  opened(reject, 'từ chối ngày 20');
  assert.equal(reject.data.item.status, 'rejected');
  opened(await withdraw(M, 'qa_nv3'), 'rút ngày 20');
  await F.at('2026-10-16T09:00:00');
  opened(await ask(M, 'qa_nv3'), 'xin lại ngày 16');
  await F.at('2026-10-20T09:00:00');
  const all = await F.call('POST', '/advance-approvals/approve-all', { body: { month: M } });
  opened(all, 'duyệt tất cả ngày 20');
  assert.deepEqual(all.data.approved, ['qa_nv3']);
});

test('Admin không tạo thay được: username trong thân bị bỏ qua, Admin tự xin ngoài cửa sổ cũng 409', async () => {
  const M = '2026-10';
  await setup(M);
  await F.at('2026-10-18T09:00:00');
  const asAdmin = await F.call('POST', '/advance-approvals/request', { body: { month: M, username: 'qa_nv1' } });
  closed(asAdmin);
  assert.equal((await list(M, 'qa_nv1')).data.item.status, null);
  await F.at('2026-10-16T09:00:00');
  const onBehalf = await F.call('POST', '/advance-approvals/request', { body: { month: M, username: 'qa_nv1' } });
  assert.equal(onBehalf.status, 403, 'Admin không thuộc diện ứng nên không tạo cho ai');
  assert.equal((await list(M, 'qa_nv1')).data.item.status, null);
});

test('GET /api/advance-approvals kèm window { days: [16, 17], open } theo đồng hồ, cho nhân sự và cho Admin', async () => {
  const M = '2026-10';
  await setup(M);
  const expected = { '2026-10-15': false, '2026-10-16': true, '2026-10-17': true, '2026-10-18': false };
  for (const [date, open] of Object.entries<any>(expected)) {
    await F.at(`${date}T12:00:00`);
    for (const who of ['qa_nv1', 'admin']) {
      const res = await list(M, who);
      assert.equal(res.status, 200, JSON.stringify(res.data));
      assert.deepEqual(res.data.window, { days: [16, 17], open }, `${who} ${date}`);
    }
  }
  await F.at('2026-10-17T12:00:00');
  const mine = (await list(M, 'qa_nv1')).data;
  assert.equal(mine.item.eligible, true, 'các trường cũ còn nguyên');
  assert.equal(mine.scope, 'self');
});

'use strict';
// Tạm ứng: nhân sự không xin số; tạm ứng luôn là số theo quy tắc (advance.rate × lương cơ bản thực nhận của ngày đi làm từ ngày 1
// đến advance.untilDay) và chỉ trừ khi Admin duyệt tạm ứng của người đó trong tháng (POST /api/advance-approvals/..., test ở
// 2026-10-28-advance-approval.test.ts). File này kiểm:
//   - yêu cầu xin số đã lưu vẫn đọc được (lịch sử) nhưng số đã duyệt (granted) KHÔNG trừ vào phiếu (route gửi, duyệt, huỷ đã bỏ: advance-requests-history.test.ts)
//   - số Admin sửa trên phiếu (ô "tạm ứng") thắng số tự tính; qua chốt công và tính lương phiếu lấy đúng tạm ứng đã duyệt
//   - realtime: nhân sự xin rồi Admin duyệt / huỷ duyệt phát approvals.changed tới Admin và request.decided (kind 'advance', không ngày) chỉ tới đúng người
// Dữ liệu: NV bậc 1 ca n1, Admin khai thay mọi ngày Thứ Hai–Thứ Bảy đúng giờ ca (chỉ ngày có Check-in/out hợp lệ hoặc
// lượt Admin khai thay mới là ngày đi làm). Người bịa qa_*, đồng hồ giả, DB trong bộ nhớ.
const P = require('../helpers/period-api');
const { requestInWindow } = require('../helpers/advance-window');
const SSE = require('../helpers/sse-client');
const { DEFAULTS } = require('../../src/engine/payroll-params');
const { test, before, after, afterEach } = require('node:test');
const assert = require('node:assert/strict');

const { F, store } = P;
const { events } = SSE;
const monthOf = P.monthPool();

before(F.start);
after(F.stop);
afterEach(() => {
  events.configure({});
  events.closeAll();
});

const pad = (n?) => String(n).padStart(2, '0');
const datesOf = (month?) =>
  Array.from(
    { length: new Date(Date.UTC(+month.slice(0, 4), +month.slice(5, 7), 0)).getUTCDate() },
    (_, i) => `${month}-${pad(i + 1)}`
  );
const workDates = (month?) => datesOf(month).filter(d => new Date(d + 'T00:00:00Z').getUTCDay() !== 0);
const nextMonth02 = (month?) => {
  const y = Number(month.slice(0, 4)),
    m = Number(month.slice(5));
  return m === 12 ? `${y + 1}-01-02T12:00:00` : `${y}-${pad(m + 1)}-02T12:00:00`;
};
const ruleFigure = (month?) => {
  const n = workDates(month).filter(d => Number(d.slice(8)) <= DEFAULTS['advance.untilDay']).length;
  return Math.round((DEFAULTS['advance.rate'] * n * DEFAULTS['level.nv.1.base']) / DEFAULTS['type.nv.workdays']);
};

async function setup(month?) {
  await F.reset();
  await P.revokeAllRoles();
  await F.at(nextMonth02(month));
  await store.setSetting('holidays', []);
  await F.person('admin', 'admin', { type: 'tts', level: 0, shiftCode: null, startDate: null });
  const days = Object.fromEntries(workDates(month).map(d => [d, { kind: 'work', in: '08:00', out: '17:00' }]));
  for (const user of ['qa_nv1', 'qa_nv2']) {
    await F.person(user, 'staff', { type: 'nv', level: 1, shiftCode: 'n1', startDate: '2026-01-05', leaveAdjust: 30 });
    const res = await F.call('PUT', '/sheet', { who: 'admin', body: { month, user, days } });
    assert.equal(res.status, 200, `khai thay ${user}: ${JSON.stringify(res.data)}`);
  }
}
// Yêu cầu xin số dựng thẳng trong bảng (không còn route gửi số)
async function oldRequest(username, month, { amount, status = 'pending', granted = null }: any) {
  const at = new Date(Date.now()).toISOString();
  return Number(
    (
      await store.db
        .prepare(
          `INSERT INTO advance_requests (username, month, amount, cap, status, granted, rev, created_at, decided_by, decided_at)
         VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, ?)`
        )
        .run(username, month, amount, amount, status, granted, at, granted ? 'admin' : null, granted ? at : null)
    ).lastInsertRowid
  );
}
const estimate = async (month?, username?) =>
  (await F.call('GET', `/periods/${month}/estimates/${username}`)).data.payslip;
// Chỉ người cần mới xin: nhân sự gửi yêu cầu của chính mình rồi Admin duyệt
const approve = async (month?, username?) => {
  const asked = await requestInWindow(F, month, username);
  if (asked.status !== 200) return asked;
  return F.call('POST', '/advance-approvals/approve', { body: { month, username } });
};

test('lịch sử: yêu cầu cũ đã duyệt vẫn đọc được nhưng số đã duyệt cũ không còn trừ vào phiếu; tạm ứng chỉ theo duyệt tháng (số theo quy tắc)', async () => {
  const M = monthOf();
  await setup(M);
  oldRequest('qa_nv1', M, { amount: 1000000, status: 'approved', granted: 1000000 });
  const mine = await F.call('GET', `/advance-requests?month=${M}`, { who: 'qa_nv1' });
  assert.equal(mine.status, 200, JSON.stringify(mine.data));
  assert.equal(mine.data.items.length, 1);
  assert.equal(mine.data.items[0].granted, 1000000);
  assert.equal(mine.data.cap, ruleFigure(M), 'mức cũ chính là số theo quy tắc');
  assert.equal((await estimate(M, 'qa_nv1')).advance, 0, 'số đã duyệt cũ không trừ');
  assert.equal((await approve(M, 'qa_nv1')).status, 200);
  assert.equal(
    (await estimate(M, 'qa_nv1')).advance,
    ruleFigure(M),
    'đã duyệt tháng: số theo quy tắc, không phải 1.000.000 ₫'
  );
});

test('A1: Admin ghim tạm ứng = 0 ₫ trên phiếu ước tính của người đã duyệt tạm ứng thì thực lĩnh tăng đúng số đó, computed.advance giữ số theo quy tắc', async () => {
  const M = monthOf();
  await setup(M);
  assert.equal((await approve(M, 'qa_nv1')).status, 200);
  const old = await estimate(M, 'qa_nv1');
  assert.equal(old.advance, ruleFigure(M));
  const res = await F.call('PUT', '/slip-override', {
    body: { user: 'qa_nv1', month: M, values: { advance: 0 }, reason: 'Hoàn tạm ứng theo biên bản' }
  });
  assert.equal(res.status, 200, JSON.stringify(res.data));
  const now = await estimate(M, 'qa_nv1');
  assert.equal(now.advance, 0);
  assert.equal(now.net, old.net + ruleFigure(M));
  assert.equal(now.computed.advance, ruleFigure(M));
});

test('qua chốt công và tính lương: phiếu và tổng kỳ lấy tạm ứng đã duyệt (qa_nv1), người chưa duyệt 0 ₫; thực lĩnh = tổng lương - bảo hiểm - thuế - tạm ứng', async () => {
  const M = monthOf();
  await setup(M);
  assert.equal((await approve(M, 'qa_nv1')).status, 200);
  P.must(await P.step(M, 'lock-attendance'), 'chốt công');
  P.must(await P.step(M, 'calculate'), 'tính lương');
  const slips = await P.slipRows(M);
  assert.equal(slips.length, 2);
  for (const slip of slips) {
    assert.equal(slip.advance, slip.username === 'qa_nv1' ? ruleFigure(M) : 0, slip.username);
    assert.equal(slip.net, slip.gross - slip.insurance - slip.tax - slip.advance, slip.username);
  }
  assert.equal((await F.call('GET', `/periods/${M}`)).data.totals.advance, ruleFigure(M));
  // duyệt sau khi đã tính: lần tính thành lỗi thời (đầu vào đổi), phải tính lại
  assert.equal((await F.call('GET', `/periods/${M}`)).data.stale, false);
  assert.equal((await approve(M, 'qa_nv2')).status, 200);
  assert.equal((await F.call('GET', `/periods/${M}`)).data.stale, true);
});

test('realtime: duyệt và huỷ duyệt phát approvals.changed tới Admin, request.decided (kind advance, không ngày) chỉ tới đúng người', async () => {
  const M = monthOf();
  await setup(M);
  const [admin, target, other] = await SSE.openMany('admin', 'qa_nv1', 'qa_nv2');
  const all = [admin, target, other];
  await SSE.settle(all);
  assert.equal((await approve(M, 'qa_nv1')).status, 200);
  let [fAdmin, fTarget, fOther] = await SSE.settle(all);
  assert.ok(
    SSE.only(fAdmin, 'approvals.changed').length >= 1,
    `Admin phải nhận approvals.changed: ${SSE.namesOf(fAdmin)}`
  );
  const decided = SSE.only(fTarget, 'request.decided');
  assert.equal(decided.length, 1, `qa_nv1 phải nhận đúng một request.decided: ${SSE.namesOf(fTarget)}`);
  assert.equal(decided[0].data.month, M);
  assert.equal(decided[0].data.decision, 'approved');
  assert.equal(decided[0].data.kind, 'advance');
  assert.equal(Object.hasOwn(decided[0].data, 'date'), false);
  assert.deepEqual(SSE.only(fTarget, 'approvals.changed'), [], 'nhân sự không nhận approvals.changed');
  assert.deepEqual(SSE.only(fOther, 'request.decided'), []);
  assert.equal(
    (await F.call('POST', '/advance-approvals/cancel', { body: { month: M, username: 'qa_nv1' } })).status,
    200
  );
  [fAdmin, fTarget, fOther] = await SSE.settle(all);
  assert.ok(SSE.only(fAdmin, 'approvals.changed').length >= 1);
  assert.equal(SSE.only(fTarget, 'request.decided')[0].data.decision, 'cancelled');
  assert.deepEqual(SSE.only(fOther, 'request.decided'), []);
});

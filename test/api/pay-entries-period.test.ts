'use strict';
// Khoản điền thêm đi qua vòng đời kỳ lương: tính lương nạp khoản đã duyệt,
// phiếu có hai dòng khoanThem, khoanTru, bản chụp mang m.entries, inputs_digest đổi, kỳ đã duyệt vẫn nhận khoản kèm cảnh báo PERIOD_LOCKED (suggestMonth) và phiếu đã chốt không đổi.
// Mỗi test dùng một tháng riêng (test/helpers/period-api.ts → monthPool).
const P = require('../helpers/period-api');
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');

const { F, store } = P;
const monthOf = P.monthPool();
before(F.start);
after(F.stop);

const entryBody = (month?, extra: any = {}) => ({
  username: 'qa_nv1',
  month,
  direction: 'add',
  amount: 500000,
  label: 'Thưởng đột xuất',
  reason: 'Thưởng hoàn thành dự án quý ba',
  ...extra
});
// Lập bằng admin, duyệt bằng người C&B khác (qa_cb): vai trò phải gán lại sau mỗi lần seed vì seed thu hồi mọi vai trò
async function makeApproved(month?, extra: any = {}) {
  await F.person('qa_cb', 'staff');
  // qa_cb cũng có phiếu trong kỳ: cần ngày công để thực lĩnh không âm (phiếu thực lĩnh âm bị chặn duyệt: PAYSLIP_NEGATIVE_NET).
  // Kỳ đã tính nên khoá lịch qua API: ghi thẳng vào DB của test (dữ liệu dựng sẵn, như seed), rồi lần tính lại kế tiếp nạp lịch này
  const holidays = await store.getSetting('holidays', []);
  const days: Record<string, any> = {};
  for (const date of P.datesOf(month).filter(d => [1, 2, 3, 4, 5].includes(new Date(d + 'T00:00:00Z').getUTCDay()))) {
    if (!holidays.includes(date) && Object.keys(days).length < 15)
      days[date] = { kind: 'work', in: '08:00', out: '17:00' };
  }
  await store.setSheet('qa_cb', month, days, null, null);
  await P.grant('qa_cb', 'cb');
  const made = await F.call('POST', '/pay-entries', { body: entryBody(month, extra) });
  assert.equal(made.status, 200, JSON.stringify(made.data));
  const done = await F.call('PUT', `/pay-entries/${made.data.entry.id}/decide`, {
    who: 'qa_cb',
    body: { decision: 'approved', rev: made.data.entry.rev }
  });
  assert.equal(done.status, 200, JSON.stringify(done.data));
  return done.data.entry;
}
const rowOf = async (month?, username?) => (await P.slipRows(month)).find(r => r.username === username);

test('1c: tính lại kỳ sau khi có khoản duyệt: tổng thu nhập của người đó tăng đúng 500.000 ₫, phiếu có khoanThem, người khác không đổi và không có khoanThem; inputs_digest đổi', async () => {
  const M = monthOf();
  await P.seed(M);
  P.must(await P.step(M, 'lock-attendance'), 'chốt công');
  P.must(await P.step(M, 'calculate'), 'tính lương lần 1');
  const before = await P.slipRows(M);
  const nv1 = before.find(r => r.username === 'qa_nv1');
  assert.equal(Object.hasOwn(nv1, 'khoanThem'), false);
  const digestOf = async () =>
    (
      await store.db
        .prepare('SELECT inputs_digest FROM payroll_runs WHERE month = ? ORDER BY run_no DESC LIMIT 1')
        .get(M)
    ).inputs_digest;
  const digest1 = await digestOf();

  await makeApproved(M); // kỳ đang ở "đã tính": vẫn nhận khoản
  P.must(await P.step(M, 'calculate'), 'tính lương lần 2');
  const after = await P.slipRows(M);
  const nv1After = after.find(r => r.username === 'qa_nv1');
  assert.equal(nv1After.gross, nv1.gross + 500000);
  assert.equal(nv1After.insurance, nv1.insurance); // khoản chịu thuế, không có cờ bảo hiểm: nền bảo hiểm không đổi
  assert.equal(nv1After.net - nv1.net, 500000 - (nv1After.tax - nv1.tax)); // phần tăng sau thuế
  assert.equal(nv1After.khoanThem, 500000);
  assert.equal(nv1After.khoanTru, 0);
  // qa_cb (người duyệt) vào kỳ sau lần tính đầu nên không có phiếu cũ để so; ba người còn lại của seed không đổi
  for (const was of before.filter(r => r.username !== 'qa_nv1')) {
    const row = after.find(r => r.username === was.username);
    assert.deepEqual([row.gross, row.tax, row.net], [was.gross, was.tax, was.net], row.username);
    assert.equal(Object.hasOwn(row, 'khoanThem'), false, row.username);
  }
  assert.notEqual(await digestOf(), digest1);
  // bản chụp của phiếu mang m.entries và m.net.entriesAdd (nguồn của dòng phiếu)
  const { snapshot } = (await F.call('GET', `/periods/${M}/payslips/qa_nv1`)).data.payslip;
  assert.deepEqual(
    snapshot.entries.map(e => [e.direction, e.amount, e.label]),
    [['add', 500000, 'Thưởng đột xuất']]
  );
  assert.equal(snapshot.net.entriesAdd, 500000);
});

test('1c: khoản trừ 300.000 ₫ đã duyệt: phiếu có khoanTru, tổng thu nhập và thuế không đổi, thực lĩnh giảm đúng 300.000 ₫', async () => {
  const M = monthOf();
  await P.seed(M);
  P.must(await P.step(M, 'lock-attendance'), 'chốt công');
  P.must(await P.step(M, 'calculate'), 'tính lương lần 1');
  const nv1 = await rowOf(M, 'qa_nv1');
  await makeApproved(M, { direction: 'deduct', amount: 300000, label: 'Hoàn tạm ứng tháng trước' });
  P.must(await P.step(M, 'calculate'), 'tính lương lần 2');
  const now = await rowOf(M, 'qa_nv1');
  assert.deepEqual([now.gross, now.tax, now.insurance], [nv1.gross, nv1.tax, nv1.insurance]);
  assert.equal(now.net, nv1.net - 300000);
  assert.equal(now.khoanThem, 0);
  assert.equal(now.khoanTru, 300000);
});

test('1c: kỳ đã duyệt: lập khoản mới và huỷ khoản đã duyệt vẫn lưu kèm cảnh báo PERIOD_LOCKED (suggestMonth là tháng kế tiếp); số tiền của phiếu đã chốt không đổi', async () => {
  const M = monthOf();
  await P.seed(M);
  P.must(await P.step(M, 'lock-attendance'), 'chốt công');
  P.must(await P.step(M, 'calculate'), 'tính lương');
  const entry = await makeApproved(M);
  P.must(await P.step(M, 'calculate'), 'tính lại có khoản');
  P.must(await P.approveAllPending(M), 'duyệt phiếu');
  P.must(await P.step(M, 'approve'), 'duyệt kỳ');
  const slips = await P.slipRows(M);
  const next = `${M.slice(0, 4)}-${String(Number(M.slice(5)) + 1).padStart(2, '0')}`;
  const nextMonth = Number(M.slice(5)) === 12 ? `${Number(M.slice(0, 4)) + 1}-01` : next;
  // kiểm lại bản chụp (tính lại từ đầu vào hiện có, gồm khoản đã duyệt) không lệch một đồng
  assert.deepEqual((await F.call('GET', `/periods/${M}/verify`)).data.mismatched, []);
  const created = await F.call('POST', '/pay-entries', { body: entryBody(M) });
  assert.equal(created.status, 200, JSON.stringify(created.data));
  const locked = created.data.warnings.find(w => w.code === 'PERIOD_LOCKED');
  assert.ok(locked, JSON.stringify(created.data.warnings));
  assert.equal(locked.details.month, M);
  assert.equal(locked.details.suggestMonth, nextMonth);
  const voided = await F.call('POST', `/pay-entries/${entry.id}/void`, {
    body: { reason: 'Huỷ sau khi kỳ đã duyệt: lưu được nhưng phiếu đã chốt không đổi' }
  });
  assert.equal(voided.status, 200, JSON.stringify(voided.data));
  assert.equal(voided.data.entry.status, 'void');
  assert.ok(
    voided.data.warnings.some(w => w.code === 'PERIOD_LOCKED'),
    JSON.stringify(voided.data.warnings)
  );
  assert.deepEqual(
    await P.slipRows(M),
    slips,
    'phiếu đã duyệt giữ nguyên số đã chốt; khoản mới hay khoản huỷ chỉ vào khi tính lại'
  );
  // tháng kế tiếp lập được, không có cảnh báo khoá
  const following = await F.call('POST', '/pay-entries', { body: entryBody(nextMonth) });
  assert.equal(following.status, 200, JSON.stringify(following.data));
  assert.equal(
    (following.data.warnings || []).some(w => w.code === 'PERIOD_LOCKED'),
    false
  );
});

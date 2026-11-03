'use strict';
// Ngày trong lịch đã qua mà không có lượt Check-in/out nào, đo bằng số công và tiền của GET /me/estimate và của phiếu trong kỳ:
// không có giải trình hoặc giải trình chưa quyết định = ngày không công, 0 đồng (không giải trình là vắng không phép, chưa quyết định là ngày giữ);
// giải trình được duyệt = 1 ngày công theo giờ ca (bằng ngày đi làm đủ ca); giải trình bị từ chối = không công, 0 đồng.
// Người bịa vào làm 26/10 (3 ngày công đã qua: 26, 27, 28); mọi người chỉ khác nhau ở ngày 27/10, các ngày còn lại không ai chấm.
// Giải trình do chính nhân viên gửi và cảnh báo ngày vắng cho Admin: test/api/staff-self-explanation.test.ts.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
require('../helpers/require-isolated-database');
const F = require('../helpers/api-fixture');
const X = require('../helpers/explanation-flow');
const P = require('../helpers/period-api');

const { MONTH } = X;
const NOW = '2026-10-29T12:00:00'; // đồng hồ của helper giải trình: sau mọi ngày công được kiểm
const DAY = '2026-10-27';
const DAILY = 230769; // lương ngày NV bậc 1: 6.000.000 / 26
const TRAVEL = 34615; // phụ cấp đi lại một ngày làm

before(async () => {
  await F.start();
  await F.at(NOW);
  for (const name of ['vang', 'hoi', 'cho', 'duyet', 'tuchoi', 'doi', 'di'])
    await F.person(name, 'staff', { startDate: '2026-10-26' });
  await F.person('admin', 'admin');
  await F.store.setSetting('holidays', []);
});
after(() => F.stop());

const estimate = async (who?) => {
  await F.at(NOW);
  const res = await F.call('GET', `/me/estimate?month=${MONTH}&rows=1`, { who });
  assert.equal(res.status, 200, JSON.stringify(res.data));
  const e = res.data;
  const row = e.m.rows.find(r => r.date === DAY);
  return { e, row, count: e.m.count, noshow: e.m.noshow, unpaid: e.m.unpaid, dayPay: e.trace.tienNgayCong };
};
const ask = async (username?, text = 'Em quên bấm') => {
  await F.at(NOW);
  const asked = await F.call('POST', '/explanations', {
    who: 'admin',
    body: { username, date: DAY, prompt: 'Ngày này không có chấm công?' }
  });
  assert.equal(asked.status, 200, JSON.stringify(asked.data));
  if (text === null) return asked.data.item;
  const answered = await F.call('POST', `/explanations/${asked.data.item.id}/answer`, {
    who: username,
    body: { text }
  });
  assert.equal(answered.status, 200, JSON.stringify(answered.data));
  return answered.data.item;
};

test('Chuẩn so sánh: ngày Check-in/out đủ ca là 1 công, đủ lương ngày', async () => {
  await X.fullDay('di', DAY, '08:00', '17:00', 'np-di');
  const { row, count, noshow, dayPay } = await estimate('di');
  assert.equal(row.kind, 'work');
  assert.equal(row.hours, 8);
  assert.equal(count, 1);
  assert.equal(noshow, 2); // 26/10 và 28/10 không ai chấm
  assert.equal(dayPay, DAILY);
});

test('a1. Không giải trình: ngày là vắng không phép, 0 công, 0 đồng', async () => {
  const { row, count, noshow, unpaid, dayPay, e } = await estimate('vang');
  assert.equal(row.kind, 'noshow');
  assert.equal(row.pay, 0);
  assert.equal(count, 0);
  assert.equal(noshow, 3);
  assert.equal(unpaid, 0);
  assert.equal(dayPay, 0);
  assert.equal(e.trace.tongThuNhap, 0);
  assert.equal(e.net.net, 0);
});

test('a2. Giải trình chưa quyết định (Admin hỏi chưa trả lời, hoặc đã trả lời chưa duyệt): ngày giữ, 0 công, 0 đồng', async () => {
  await ask('hoi', null);
  const waiting = await estimate('hoi');
  await ask('cho');
  const answered = await estimate('cho');
  for (const mine of [waiting, answered]) {
    assert.equal(mine.row.kind, 'unpaid');
    assert.equal(mine.row.held, 'pending');
    assert.equal(mine.row.pay, 0);
    assert.equal(mine.count, 0);
    assert.equal(mine.unpaid, 1);
    assert.equal(mine.noshow, 2);
    assert.equal(mine.dayPay, 0);
    assert.equal(mine.e.trace.tongThuNhap, 0);
    assert.equal(mine.e.trace.gioVuotNguong, 24); // ngày giữ xét chuyên cần như ngày vắng: 3 ngày × 8 giờ
  }
});

test('b. Giải trình được duyệt: 1 công theo giờ ca, tiền bằng ngày đi làm đủ ca', async () => {
  const item = await ask('duyet');
  const ok = await X.decide(item.id, true);
  assert.equal(ok.status, 200, JSON.stringify(ok.data));
  assert.equal(ok.data.item.status, 'approved');
  assert.equal(ok.data.recorded, true);
  const mine = await estimate('duyet');
  const ref = await estimate('di');
  assert.equal(mine.row.kind, 'work');
  assert.equal(mine.row.hours, 8);
  assert.equal(mine.row.punchIn, '08:00'); // giờ vào / ra là giờ ca
  assert.equal(mine.row.punchOut, '17:00');
  assert.equal(mine.count, 1);
  assert.equal(mine.dayPay, DAILY);
  assert.equal(mine.e.trace.phuCapDiLai, TRAVEL);
  assert.equal(mine.e.trace.tongThuNhap, ref.e.trace.tongThuNhap);
  assert.equal(mine.e.trace.gioVuotNguong, ref.e.trace.gioVuotNguong);
  assert.equal(mine.e.net.net, ref.e.net.net);
  assert.equal(mine.e.net.noPayDays, ref.e.net.noPayDays);
});

test('c. Giải trình bị từ chối: ngày không công, 0 đồng, như ngày vắng', async () => {
  const item = await ask('tuchoi');
  const no = await X.decide(item.id, false);
  assert.equal(no.status, 200, JSON.stringify(no.data));
  assert.equal(no.data.item.status, 'rejected');
  assert.equal(no.data.recorded, false);
  const mine = await estimate('tuchoi');
  const absent = await estimate('vang');
  assert.equal(mine.row.kind, 'unpaid');
  assert.equal(mine.row.held, 'rejected');
  assert.equal(mine.row.pay, 0);
  assert.equal(mine.count, 0);
  assert.equal(mine.dayPay, 0);
  assert.equal(mine.e.trace.tongThuNhap, absent.e.trace.tongThuNhap);
  assert.equal(mine.e.trace.gioVuotNguong, absent.e.trace.gioVuotNguong);
  assert.equal(mine.e.net.net, absent.e.net.net);
  assert.equal(mine.e.net.noPayDays, absent.e.net.noPayDays);
});

test('Đổi quyết định: duyệt → từ chối → duyệt, số công và tiền đi theo quyết định mới nhất', async () => {
  const item = await ask('doi');
  assert.equal((await estimate('doi')).count, 0);
  assert.equal((await X.decide(item.id, true)).status, 200);
  const approved = await estimate('doi');
  assert.equal(approved.count, 1);
  assert.equal(approved.dayPay, DAILY);
  assert.equal((await X.decide(item.id, false)).status, 200);
  const rejected = await estimate('doi');
  assert.equal(rejected.count, 0);
  assert.equal(rejected.dayPay, 0);
  assert.equal(rejected.row.held, 'rejected');
  assert.equal((await X.decide(item.id, true)).status, 200);
  const again = await estimate('doi');
  assert.equal(again.count, 1);
  assert.equal(again.dayPay, DAILY);
});

test('Phiếu trong kỳ: giải trình được duyệt bằng người đi làm đủ ca, còn lại 0 công 0 đồng', async () => {
  await F.at('2026-11-02T09:00:00'); // tháng 10 đã hết
  P.must(await P.step(MONTH, 'lock-attendance'), 'chốt công');
  P.must(await P.step(MONTH, 'calculate'), 'tính lương');
  const slips = Object.fromEntries((await P.slipRows(MONTH)).map(r => [r.username, r]));
  const ref = slips.di;
  assert.equal(ref.daysWorked, 1);
  assert.equal(ref.tienNgayCong, DAILY);
  assert.equal(ref.gross, DAILY + TRAVEL); // cả tháng chỉ có 1 ngày công: mất phụ cấp chuyên cần
  for (const who of ['duyet', 'doi']) {
    assert.equal(slips[who].daysWorked, 1, who);
    assert.equal(slips[who].tienNgayCong, ref.tienNgayCong, who);
    assert.equal(slips[who].gross, ref.gross, who);
    assert.equal(slips[who].net, ref.net, who);
  }
  for (const who of ['vang', 'hoi', 'cho', 'tuchoi']) {
    assert.equal(slips[who].daysWorked, 0, who);
    assert.equal(slips[who].tienNgayCong, 0, who);
    assert.equal(slips[who].gross, 0, who);
    assert.equal(slips[who].net, 0, who);
  }
});

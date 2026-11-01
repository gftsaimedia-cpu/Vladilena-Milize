'use strict';
// period-stale: GET /api/periods/:month thêm `stale` và `staleReasons`: so inputs_digest và params_hash của
// lần chạy hiện hành với băm tính mới từ dữ liệu hiện tại. Tính kỳ rồi đổi đầu vào (số sửa phiếu, điểm KPI, hồ sơ, ngày lễ) thì stale = true với lý do
// `inputs`; tính lại thì stale = false. Đọc không ghi gì. Kỳ chưa tính (open) không có gì để lỗi thời.
// staleReasons là mảng mã lý do ('inputs', 'params').
const P = require('../helpers/position-api');
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');

const { F } = P;

before(F.start);
after(F.stop);

const period = async (month?) => (await F.call('GET', `/periods/${month}`)).data;
const override = async (month?, body?) =>
  await F.call('PUT', '/slip-override', {
    body: { user: 'qa_nv1', month, reason: 'Sửa số sau khi tính để thử cờ cần tính lại', ...body }
  });

test('period-stale: kỳ vừa tính xong có stale = false; sửa số trên phiếu sau khi tính thì stale = true với lý do inputs; tính lại thì stale = false', async () => {
  const M = await P.setupMonth();
  await P.advance(M, 'calculated');
  const fresh = await period(M);
  assert.equal(fresh.status, 'calculated');
  assert.equal(fresh.stale, false, 'vừa tính xong thì chưa lỗi thời');
  const changed = await override(M, { values: { otPay: 123000 } });
  assert.equal(changed.status, 200, JSON.stringify(changed.data));
  const stale = await period(M);
  assert.equal(stale.stale, true, 'đầu vào đổi sau khi tính');
  assert.deepEqual(stale.staleReasons, ['inputs'], 'chỉ đầu vào đổi, tham số không đổi');
  P.must(await P.step(M, 'calculate'), 'tính lại');
  const again = await period(M);
  assert.equal(again.stale, false, 'tính lại xong thì hết lỗi thời');
});

test('period-stale: đọc kỳ không ghi gì (không bảng nào đổi); kỳ chưa tính (open) không bị đánh dấu lỗi thời', async () => {
  const M = await P.setupMonth();
  const open = await period(M);
  assert.equal(open.status, 'open');
  assert.ok(open.stale === false || open.stale === undefined || open.stale === null, 'kỳ chưa tính: không lỗi thời');
  assert.ok(Object.hasOwn(open, 'stale'), 'luôn có trường stale để giao diện không phải đoán');
  const before = await F.snapshot();
  await period(M);
  await period(M);
  assert.deepEqual(F.changedTables(before, await F.snapshot()), [], 'GET không ghi gì');
});

test('period-stale: chỉ quản trị đọc được stale; nhân sự đọc kỳ vẫn bị từ chối như hôm nay (403) và không lộ staleReasons', async () => {
  const M = await P.setupMonth();
  await P.advance(M, 'calculated');
  const admin = await F.call('GET', `/periods/${M}`);
  assert.equal(admin.status, 200);
  assert.ok(Object.hasOwn(admin.data, 'stale'));
  const staff = await F.call('GET', `/periods/${M}`, { who: 'qa_nv1' });
  assert.equal(staff.status, 403);
  assert.ok(!JSON.stringify(staff.data).includes('stale'));
});

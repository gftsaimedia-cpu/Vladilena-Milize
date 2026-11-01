'use strict';
// Tên ngày lễ ("Tết Dương lịch"): lưu ở khoá riêng holiday_names của bảng settings, GET /api/holidays trả thêm names, PUT /api/holidays nhận thêm names (tuỳ chọn),
// có nhật ký; không đổi cách tính ngày lễ (danh sách ngày vẫn ở khoá holidays).
const P = require('../helpers/position-api');
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const config = require('../../src/platform/config');

const { F } = P;

before(F.start);
after(F.stop);

const put = async (body?) => await F.call('PUT', '/holidays', { who: 'admin', body });
const get = async (who?) => await F.call('GET', '/holidays', { who });
// ngày lễ thử ở năm xa để không dính kỳ đã khoá của các test khác
const D1 = '2031-01-01';
const D2 = '2031-02-16';

test('tên ngày lễ: lưu cùng danh sách, GET trả names cho mọi người đăng nhập, tên được cắt khoảng trắng', async () => {
  await P.setupMonth();
  const res = await put({ dates: [D1, D2], names: { [D1]: '  Tết Dương lịch ', [D2]: 'Tết Nguyên đán' } });
  assert.equal(res.status, 200, JSON.stringify(res.data));
  assert.deepEqual(res.data.names, { [D1]: 'Tết Dương lịch', [D2]: 'Tết Nguyên đán' });
  const staff = await get('qa_nv1');
  assert.equal(staff.status, 200);
  assert.deepEqual(staff.data.dates, [D1, D2]);
  assert.equal(staff.data.names[D1], 'Tết Dương lịch');
  assert.deepEqual(await F.store.getSetting('holidays', []), [D1, D2], 'danh sách ngày không đổi cách lưu');
});

test('tên ngày lễ: PUT không gửi names giữ tên của các ngày còn lại và bỏ tên của ngày bị bỏ khỏi danh sách', async () => {
  await P.setupMonth();
  assert.equal((await put({ dates: [D1, D2], names: { [D1]: 'A', [D2]: 'B' } })).status, 200);
  const res = await put({ dates: [D1] });
  assert.equal(res.status, 200, JSON.stringify(res.data));
  assert.deepEqual(res.data.names, { [D1]: 'A' });
  assert.deepEqual((await get('admin')).data.names, { [D1]: 'A' });
  const clear = await put({ dates: [D1], names: { [D1]: '' } });
  assert.deepEqual(clear.data.names, {}, 'chuỗi rỗng xoá tên');
});

test('tên ngày lễ: nhật ký holiday.set ghi tên trước và sau khi tên đổi', async () => {
  await P.setupMonth();
  assert.equal((await put({ dates: [D1], names: { [D1]: 'Tên một' } })).status, 200);
  const n = (await P.auditRows('holiday.set')).length;
  assert.equal((await put({ dates: [D1], names: { [D1]: 'Tên hai' } })).status, 200);
  const rows = await P.auditRows('holiday.set');
  assert.equal(rows.length, n + 1);
  const last = rows[rows.length - 1];
  assert.match(JSON.stringify(last), /Tên một/);
  assert.match(JSON.stringify(last), /Tên hai/);
});

test('tên ngày lễ: tên cho ngày ngoài danh sách, quá dài, có < >, sai kiểu bị 400 và không ghi gì', async () => {
  await P.setupMonth();
  assert.equal((await put({ dates: [D1], names: { [D1]: 'Giữ' } })).status, 200);
  const before = await F.snapshot();
  for (const names of [
    { [D2]: 'Ngoài danh sách' },
    { [D1]: 'x'.repeat(config.HOLIDAY_NAME_MAX + 1) },
    { [D1]: '<b>Lễ</b>' },
    { [D1]: 5 },
    { 'không phải ngày': 'x' },
    ['Lễ']
  ]) {
    const res = await put({ dates: [D1], names });
    assert.equal(res.status, 400, JSON.stringify([names, res.data]));
  }
  assert.deepEqual(F.changedTables(before, await F.snapshot()), []);
  assert.deepEqual((await get('admin')).data.names, { [D1]: 'Giữ' });
});

test('tên ngày lễ: người không phải Admin không ghi được (403) và chưa đăng nhập 401', async () => {
  await P.setupMonth();
  const body = { dates: [D1], names: { [D1]: 'Thử' } };
  assert.equal((await F.call('PUT', '/holidays', { who: 'qa_nv1', body })).status, 403);
  assert.equal((await F.call('PUT', '/holidays', { who: null, body })).status, 401);
});

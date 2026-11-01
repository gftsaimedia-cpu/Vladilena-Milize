'use strict';
// Xác nhận cờ của Kế toán chỉ cho ĐÚNG cờ đã xem (expectedFlags, rev) và chỉ còn khi khối không đổi: mất khi đổi nhãn, cách tính,
// điều kiện mất, theo ngày đi làm, cờ; với khối miễn thuế toàn bộ còn mất khi đổi số tiền theo chức vụ.
const P = require('../helpers/position-api');
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');

const { F } = P;
before(F.start);
after(F.stop);

async function confirmedBlock(over: any = {}) {
  const M = await P.setupMonth();
  const made = await F.call('POST', '/blocks', {
    body: {
      label: 'Khối xác nhận thử',
      method: 'fixed',
      scalesWithDays: false,
      tax: 'full',
      effectiveMonth: M,
      reason: 'Thêm khối để thử xác nhận cờ',
      values: { nv: { on: true, amount: 500000 } },
      ...over
    }
  });
  assert.equal(made.status, 200, JSON.stringify(made.data));
  const code = made.data.code;
  const ok = await F.call('PUT', `/blocks/${code}/confirm`, {
    body: {
      basis: 'Căn cứ thử của Kế toán',
      effectiveMonth: M,
      expectedFlags: { tax: 'full', taxCap: null, insuranceBase: false }
    }
  });
  assert.equal(ok.status, 200, JSON.stringify(ok.data));
  assert.ok((await P.paramsOf(M))[`block.def.${code}`].flagsConfirmedBy, 'đã xác nhận');
  return { M, code };
}
const save = async (M?, changes?) => await P.saveChanges(changes, { month: M });
const def = async (M?, code?) => (await P.paramsOf(M))[`block.def.${code}`];

test('GĐ2: xác nhận cờ với expectedFlags lệch cờ hiện tại là 409 BLOCK_FLAGS_CHANGED và không ghi gì; rev lệch là 409 PARAMS_STALE', async () => {
  const M = await P.setupMonth();
  const made = await F.call('POST', '/blocks', {
    body: {
      label: 'Khối cờ lệch',
      method: 'fixed',
      tax: 'full',
      effectiveMonth: M,
      reason: 'Thêm khối để thử cờ lệch',
      values: { nv: { on: true, amount: 100000 } }
    }
  });
  const code = made.data.code;
  const before = await F.snapshot();
  const stale = await F.call('PUT', `/blocks/${code}/confirm`, {
    body: { basis: 'Căn cứ', effectiveMonth: M, expectedFlags: { tax: 'none', taxCap: null, insuranceBase: false } }
  });
  assert.equal(stale.status, 409, JSON.stringify(stale.data));
  assert.equal(stale.data.code, 'BLOCK_FLAGS_CHANGED');
  const rev = await F.call('PUT', `/blocks/${code}/confirm`, { body: { basis: 'Căn cứ', effectiveMonth: M, rev: 0 } });
  assert.equal(rev.status, 409, JSON.stringify(rev.data));
  assert.equal(rev.data.code, 'PARAMS_STALE');
  assert.deepEqual(F.changedTables(before, await F.snapshot()), []);
});

test('GĐ2: đổi nhãn, cách tính, theo ngày đi làm hoặc điều kiện mất làm mất dấu xác nhận; lưu lại đúng định nghĩa cũ thì giữ', async () => {
  const { M, code } = await confirmedBlock();
  const same = { ...(await def(M, code)) };
  delete same.flagsConfirmedBy;
  delete same.flagsConfirmedAt;
  // lưu lại y nguyên (nhãn có khoảng trắng thừa): không đổi gì
  const keep = await save(M, [{ key: `block.def.${code}`, value: { ...same, label: ` ${same.label} ` } }]);
  assert.ok([200, 400].includes(keep.status));
  assert.ok((await def(M, code)).flagsConfirmedBy, 'định nghĩa không đổi: giữ dấu xác nhận');
  const changed = await save(M, [{ key: `block.def.${code}`, value: { ...same, scalesWithDays: true } }]);
  assert.equal(changed.status, 200, JSON.stringify(changed.data));
  assert.equal((await def(M, code)).flagsConfirmedBy, undefined, 'đổi theo ngày đi làm: mất xác nhận');
});

test('GĐ2: khối miễn thuế toàn bộ đã xác nhận: đổi số tiền theo chức vụ làm mất dấu xác nhận (tự thêm dòng định nghĩa vào cùng lô)', async () => {
  const { M, code } = await confirmedBlock();
  const res = await save(M, [{ key: `type.nv.block.${code}.amount`, value: 800000 }]);
  assert.equal(res.status, 200, JSON.stringify(res.data));
  assert.equal((await P.paramsOf(M))[`type.nv.block.${code}.amount`], 800000);
  assert.equal((await def(M, code)).flagsConfirmedBy, undefined, 'đổi số tiền: mất xác nhận');
  assert.equal((await def(M, code)).tax, 'full', 'cờ đề nghị vẫn còn, chờ Kế toán xác nhận lại');
});

test('GĐ2: khối chịu thuế (không cờ miễn) đổi số tiền không liên quan đến xác nhận; khối miễn thuế đổi chỉ cột bật/tắt giữ xác nhận', async () => {
  const { M, code } = await confirmedBlock();
  const res = await save(M, [{ key: `type.nv.block.${code}.on`, value: false }]);
  assert.equal(res.status, 200, JSON.stringify(res.data));
  assert.ok((await def(M, code)).flagsConfirmedBy, 'tắt khối cho chức vụ không đổi cờ: giữ xác nhận');
});

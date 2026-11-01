'use strict';
// API quyền lợi theo từng bậc level.<mã>.<bậc>.<đuôi> ghi bằng PUT /api/settings/params (null = kế thừa chức vụ), đọc ở GET /api/entitlements (levelCells),
// có hiệu lực ở PUT /api/sheet, GET /api/me và bộ máy.
const P = require('../helpers/position-api');
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { SHIFT } = require('../../src/engine/punch');

const { F } = P;

before(F.start);
after(F.stop);

const otDay = (person?) => {
  const [shiftIn, shiftOut] = SHIFT[person];
  const extraOut = `${String((Number(shiftOut.slice(0, 2)) + 1) % 24).padStart(2, '0')}:${shiftOut.slice(3)}`;
  return { kind: 'work', in: shiftIn, out: shiftOut, preset: person, extraKind: 'ot', extraOut };
};
const cell = async (month?, position?, level?) => {
  const res = await F.call('GET', `/entitlements?month=${month}`, { who: 'admin' });
  assert.equal(res.status, 200, JSON.stringify(res.data).slice(0, 200));
  return res.data.levelCells.find(c => c.position === position && c.level === level);
};

test('GĐ-bậc 1: GET /entitlements trả levelCells mỗi bậc một hàng; chưa ghi đè thì mọi ô kế thừa chức vụ (source position)', async () => {
  const M = await P.setupMonth();
  const res = await F.call('GET', `/entitlements?month=${M}`, { who: 'admin' });
  assert.equal(res.status, 200);
  const rows = res.data.levelCells;
  assert.equal(rows.filter(r => r.position === 'nv').length, 4);
  assert.equal(rows.filter(r => r.position === 'tts').length, 6);
  const nv2 = rows.find(r => r.position === 'nv' && r.level === 2);
  assert.equal(nv2.cells.travel.value, 0.15);
  assert.equal(nv2.cells.travel.source, 'position');
  assert.equal(nv2.cells.travel.key, 'level.nv.2.travel');
  assert.equal(nv2.cells['benefit.ot'].value, true);
  assert.deepEqual(nv2.cells.nightOptions.value, [40, 60]);
});

test('GĐ-bậc 1: ghi đi lại của NV bậc 2 = 0,2 rồi null: ô hiện source level, bộ tham số hiệu lực đổi, null trả về kế thừa', async () => {
  const M = await P.setupMonth();
  const save = await P.saveChanges([{ key: 'level.nv.2.travel', value: 0.2 }], { month: M });
  assert.equal(save.status, 200, JSON.stringify(save.data));
  const c = (await cell(M, 'nv', 2)).cells.travel;
  assert.equal(c.value, 0.2);
  assert.equal(c.source, 'level');
  assert.equal((await cell(M, 'nv', 3)).cells.travel.value, 0.15, 'bậc khác giữ nguyên');
  assert.equal((await P.paramsOf(M))['level.nv.2.travel'], 0.2);
  const back = await P.saveChanges([{ key: 'level.nv.2.travel', value: null }], { month: M });
  assert.equal(back.status, 200, JSON.stringify(back.data));
  const c2 = (await cell(M, 'nv', 2)).cells.travel;
  assert.equal(c2.value, 0.15);
  assert.equal(c2.source, 'position');
});

test('GĐ-bậc 1: giá trị sai kiểu hoặc bậc không có bị 400 và không ghi gì', async () => {
  const M = await P.setupMonth();
  const before = await F.snapshot();
  const bad = await P.saveChanges([{ key: 'level.nv.2.benefit.ot', value: 'có' }], { month: M });
  assert.equal(bad.status, 400, JSON.stringify(bad.data));
  const noLevel = await P.saveChanges([{ key: 'level.nv.9.travel', value: 0.1 }], { month: M });
  assert.equal(noLevel.status, 400, JSON.stringify(noLevel.data));
  assert.match(JSON.stringify(noLevel.data), /chưa có bậc 9/);
  const range = await P.saveChanges([{ key: 'level.nv.2.travel', value: 7 }], { month: M });
  assert.equal(range.status, 400, JSON.stringify(range.data));
  assert.deepEqual(F.changedTables(before, await F.snapshot()), []);
});

test('GĐ-bậc 1: tắt OT của NV bậc 3 thì NV bậc 3 khai OT vẫn lưu, kèm cảnh báo BENEFIT_NOT_ALLOWED, và /api/me báo ot=false; NV bậc 1 vẫn khai được (cờ theo bậc, không theo chức vụ)', async () => {
  const M = await P.setupMonth();
  const date = P.firstDow(M, 2);
  const save = await P.saveChanges([{ key: 'level.nv.3.benefit.ot', value: false }], { month: M });
  assert.equal(save.status, 200, JSON.stringify(save.data));
  const nv3 = await F.call('PUT', '/sheet', { who: 'qa_nv2', body: { month: M, days: { [date]: otDay('f2') } } }); // qa_nv2: NV bậc 3
  assert.equal(nv3.status, 200, JSON.stringify(nv3.data));
  const warning = nv3.data.warnings.find(w => w.code === 'BENEFIT_NOT_ALLOWED');
  assert.ok(warning, JSON.stringify(nv3.data.warnings));
  assert.match(warning.message, /OT/);
  const me = await F.call('GET', '/me', { who: 'qa_nv2' });
  assert.equal(me.data.benefits.ot, false);
  const me1 = await F.call('GET', '/me', { who: 'qa_nv1' });
  assert.equal(me1.data.benefits.ot, true, 'NV bậc 1 còn OT');
});

test('GĐ-bậc 1: ghi đè theo bậc cần quyền config.payroll như mọi ô khác: nhân sự 403, chưa đăng nhập 401', async () => {
  const M = await P.setupMonth();
  const body = {
    changes: [{ key: 'level.nv.2.travel', value: 0.2 }],
    effectiveMonth: M,
    reason: 'Thử quyền',
    expectedRev: await P.paramsRevOf(M)
  };
  assert.equal((await F.call('PUT', '/settings/params', { who: 'qa_nv1', body })).status, 403);
  assert.equal((await F.call('PUT', '/settings/params', { who: null, body })).status, 401);
});

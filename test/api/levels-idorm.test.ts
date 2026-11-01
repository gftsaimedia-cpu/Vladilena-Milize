'use strict';
// Cờ iDorm theo chức vụ và bậc: type.<mã>.benefit.idorm (mặc định NV Có, TTS và CTV Không: trùng điều kiện "có phụ cấp đi lại" của PUT /staff/:u),
// ghi đè theo bậc level.<mã>.<bậc>.benefit.idorm. PUT /staff/:u chỉ nhận idorm: true khi cờ của chức vụ hoặc bậc người đó bật.
const P = require('../helpers/position-api');
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const registry = require('../../src/params/registry');

const { F } = P;

before(F.start);
after(F.stop);

const profileOf = async (username?, patch: any = {}) => {
  const staff = await F.store.getStaff(username);
  return {
    name: staff.name,
    role: staff.role,
    type: staff.type,
    level: staff.level,
    shiftCode: staff.shiftCode,
    startDate: staff.startDate,
    ...patch
  };
};
const saveIdorm = async (username?, patch?) => {
  const res = await F.call('PUT', `/staff/${username}`, {
    who: 'admin',
    body: await profileOf(username, { idorm: true, ...patch })
  });
  assert.equal(res.status, 200, JSON.stringify(res.data));
  return (await F.store.getStaff(username)).idorm;
};

test('iDorm: mặc định đúng như điều kiện cũ: NV nhận idorm true, CTV không (cờ ba chức vụ mặc định)', async () => {
  const M = await P.setupMonth();
  const set = await P.paramsOf(M);
  assert.deepEqual(
    [set['type.tts.benefit.idorm'], set['type.ctv.benefit.idorm'], set['type.nv.benefit.idorm']],
    [false, false, true]
  );
  assert.equal(await saveIdorm('qa_nv1'), true);
  assert.equal(await saveIdorm('qa_ctv1'), false);
});

test('iDorm: tắt cờ của cả chức vụ NV thì NV không nhận idorm true (dù vẫn có phụ cấp đi lại); bật lại cờ thì nhận', async () => {
  const M = await P.setupMonth();
  assert.equal((await P.saveChanges([{ key: 'type.nv.benefit.idorm', value: false }], { month: M })).status, 200);
  assert.equal((await P.paramsOf(M))['type.nv.travel'] > 0, true);
  assert.equal(await saveIdorm('qa_nv1'), false);
  assert.equal((await P.saveChanges([{ key: 'type.nv.benefit.idorm', value: true }], { month: M })).status, 200);
  assert.equal(await saveIdorm('qa_nv1'), true);
});

test('iDorm: ghi đè theo bậc thắng cờ của chức vụ: tắt ở bậc 3 NV thì qa_nv2 (bậc 3) không nhận, qa_nv1 (bậc 1) vẫn nhận; bật ở bậc 2 của CTV thì qa_ctv1 nhận', async () => {
  const M = await P.setupMonth();
  const save = await P.saveChanges(
    [
      { key: 'level.nv.3.benefit.idorm', value: false },
      { key: 'level.ctv.2.benefit.idorm', value: true }
    ],
    { month: M }
  );
  assert.equal(save.status, 200, JSON.stringify(save.data));
  assert.equal(await saveIdorm('qa_nv2'), false);
  assert.equal(await saveIdorm('qa_nv1'), true);
  assert.equal(await saveIdorm('qa_ctv1'), true, 'qa_ctv1 là CTV bậc 2');
});

test('iDorm: cờ có trong /api/me, /api/positions và levelCells (ô benefit.idorm, nguồn level khi bậc ghi đè)', async () => {
  const M = await P.setupMonth();
  assert.equal((await P.saveChanges([{ key: 'level.nv.3.benefit.idorm', value: false }], { month: M })).status, 200);
  const me = await F.call('GET', '/me', { who: 'qa_nv1' });
  assert.equal(me.data.benefits.idorm, true);
  assert.equal((await F.call('GET', '/me', { who: 'qa_nv2' })).data.benefits.idorm, false);
  const positions = (await F.call('GET', `/positions?month=${M}`, { who: 'admin' })).data.positions;
  assert.equal(positions.find(p => p.code === 'nv').benefits.idorm, true);
  assert.equal(positions.find(p => p.code === 'ctv').benefits.idorm, false);
  const cells = (await F.call('GET', `/entitlements?month=${M}`, { who: 'admin' })).data.levelCells;
  const nv3 = cells.find(c => c.position === 'nv' && c.level === 3).cells['benefit.idorm'];
  assert.deepEqual([nv3.value, nv3.source], [false, 'level']);
  const nv1 = cells.find(c => c.position === 'nv' && c.level === 1).cells['benefit.idorm'];
  assert.deepEqual([nv1.value, nv1.source], [true, 'position']);
});

test('iDorm: cột iDorm có trong bảng quyền lợi của registry (toggle)', () => {
  const entry = registry.byId('type.<type>.benefit.<flag>');
  const column = entry.ui.table.columns.find(c => c.key === 'idorm');
  assert.equal(column.component, 'toggle');
});

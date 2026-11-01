'use strict';
// Chức vụ thêm bằng sao chép phải hiện trong GET /api/settings/params như ba chức vụ mặc định
// (để màn Cài đặt sửa được ô của chức vụ mới), và nhãn chức vụ, khối không chứa "<" hay ">".
const P = require('../helpers/position-api');
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');

const registry = require('../../src/params/registry');

const { F } = P;

before(F.start);
after(F.stop);

// Mọi khoá cụ thể có trong view: ô của họ khoá (instances) và bảng (hàng có keys)
function keysInView(view?) {
  const keys = new Set<any>();
  for (const group of view.groups)
    for (const entry of group.entries) {
      for (const inst of entry.instances || []) keys.add(inst.key);
      if (Array.isArray(entry.value))
        for (const row of entry.value) for (const key of Object.values<any>(row.keys || {})) keys.add(key);
    }
  return keys;
}

test('1a-6: chức vụ mới sao chép từ NV hiện ở GET /api/settings/params với đúng các khoá level.<mã>.*, type.<mã>.benefit.* và type.<mã>.* như NV', async () => {
  const M = await P.setupMonth();
  const code = await P.mustCopy(M, { label: 'Chuyên viên thử', copyFrom: 'nv' });
  const res = await F.call('GET', `/settings/params?month=${M}`, { who: 'admin' });
  assert.equal(res.status, 200, JSON.stringify(res.data).slice(0, 300));
  const keys = keysInView(res.data);
  const set = await P.paramsOf(M);
  const own = Object.keys(set).filter(key => key.startsWith(`type.${code}.`) || key.startsWith(`level.${code}.`));
  assert.ok(own.length > 10, 'chức vụ mới có khoá');
  // mọi khoá của NV nằm trong view thì khoá tương ứng của chức vụ mới cũng nằm
  const nvKeys = [...keys].filter(key => /^(type|level)\.nv\./.test(key));
  assert.ok(nvKeys.length > 10, 'NV có khoá trong view');
  const missing = nvKeys
    .map(key => key.replace(/^(type|level)\.nv\./, `$1.${code}.`))
    .filter(key => Object.hasOwn(set, key) && registry.entryFor(key) && !keys.has(key)); // type.nv.nightOptions, type.nv.maxAbsent là khoá riêng của NV, không có mẫu cho chức vụ khác
  assert.deepEqual(missing, [], 'khoá của chức vụ mới thiếu trong view');
  for (const key of [`type.${code}.travel`, `type.${code}.benefit.ot`, `level.${code}.1.base`])
    assert.ok(keys.has(key), `${key} có trong view`);
  // ô của họ khoá đi lại: có instance của chức vụ mới kèm luật nhập (rules)
  const travel = res.data.groups.flatMap(g => g.entries).find(e => e.id === 'type.<type>.travel');
  const inst = travel.instances.find(i => i.key === `type.${code}.travel`);
  assert.ok(inst, 'instance đi lại của chức vụ mới');
  assert.equal(inst.value, set[`type.${code}.travel`]);
  assert.ok(inst.rules, 'có luật nhập cho ô');
  assert.equal(inst.status, 'custom', 'khoá do bản sao ghi, không phải mặc định của mã');
});

test('1a-6: sửa ô của chức vụ vừa thêm qua PUT /api/settings/params: xem trước, áp dụng, view phản ánh giá trị mới', async () => {
  const M = await P.setupMonth();
  const code = await P.mustCopy(M, { label: 'Chuyên viên sửa', copyFrom: 'nv' });
  const view = (await F.call('GET', `/settings/params?month=${M}`, { who: 'admin' })).data;
  const key = `type.${code}.travel`;
  const changes = [{ key, value: 0.2 }];
  const preview = await F.call('POST', '/settings/params/preview', {
    who: 'admin',
    body: { changes, effectiveMonth: M }
  });
  assert.equal(preview.status, 200, JSON.stringify(preview.data).slice(0, 300));
  const saved = await F.call('PUT', '/settings/params', {
    who: 'admin',
    body: { changes, effectiveMonth: M, reason: 'Chỉnh phụ cấp đi lại của chức vụ mới', expectedRev: view.paramsRev }
  });
  assert.equal(saved.status, 200, JSON.stringify(saved.data).slice(0, 300));
  const after = (await F.call('GET', `/settings/params?month=${M}`, { who: 'admin' })).data;
  const travel = after.groups.flatMap(g => g.entries).find(e => e.id === 'type.<type>.travel');
  assert.equal(travel.instances.find(i => i.key === key).value, 0.2);
});

test('1a-6: mã chức vụ mặc định không đổi: view vẫn liệt kê đúng ba chức vụ mặc định cho họ khoá type.<mã>.travel khi chưa thêm chức vụ nào', async () => {
  const M = await P.setupMonth();
  const res = await F.call('GET', `/settings/params?month=${M}`, { who: 'admin' });
  const travel = res.data.groups.flatMap(g => g.entries).find(e => e.id === 'type.<type>.travel');
  const keys = travel.instances.map(i => i.key);
  for (const code of ['tts', 'ctv', 'nv']) assert.ok(keys.includes(`type.${code}.travel`), code);
  assert.ok(keys.every(key => /^type\.[a-z0-9]+\.travel$/.test(key)));
});

test('1a-6: tên chức vụ hoặc tên viết tắt có "<" hoặc ">" bị 400 và không thêm chức vụ nào', async () => {
  const M = await P.setupMonth();
  const before = await F.snapshot();
  const label = await F.call('POST', '/positions', {
    who: 'admin',
    body: { label: 'Chức <b>vụ', copyFrom: 'nv', effectiveMonth: M, reason: 'Thử nhãn có thẻ' }
  });
  assert.equal(label.status, 400, JSON.stringify(label.data));
  const short = await F.call('POST', '/positions', {
    who: 'admin',
    body: { label: 'Chức vụ ngắn', short: 'a>b', copyFrom: 'nv', effectiveMonth: M, reason: 'Thử viết tắt có thẻ' }
  });
  assert.equal(short.status, 400, JSON.stringify(short.data));
  assert.deepEqual(F.changedTables(before, await F.snapshot()), []);
});

test('1a-6: tên khối phụ cấp có "<" hoặc ">" bị 400 và không thêm khối nào', async () => {
  const M = await P.setupMonth();
  const before = await F.snapshot();
  const res = await F.call('POST', '/blocks', {
    who: 'admin',
    body: {
      label: 'Phụ cấp <i>',
      method: 'fixed',
      effectiveMonth: M,
      reason: 'Thử nhãn khối có thẻ',
      values: { nv: { amount: 100000 } }
    }
  });
  assert.equal(res.status, 400, JSON.stringify(res.data));
  assert.deepEqual(F.changedTables(before, await F.snapshot()), []);
});

'use strict';
// Bộ nhớ đệm phép tính nặng (src/ops/compute-cache.ts): hợp lệ khi cùng số lần ghi và chưa quá TTL; DB đổi thì tính lại ngay.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { ComputeCache } = require('../../src/ops/compute-cache');

function make({ ttlMs = 1000, maxEntries = 3 }: any = {}) {
  const state = { rev: 1, time: 0, calls: 0 };
  const cache = new ComputeCache({ revision: () => state.rev, now: () => state.time, ttlMs, maxEntries });
  const compute = (value?) => () => {
    state.calls++;
    return { value };
  };
  return { cache, state, compute };
}

test('cùng khoá, cùng số lần ghi, chưa hết hạn: tính một lần và trả cùng một đối tượng', async () => {
  const { cache, state, compute } = await make();
  const a = await cache.get('k', await compute('x'));
  const b = await cache.get('k', await compute('y'));
  assert.equal(a, b);
  assert.equal(state.calls, 1);
  assert.deepEqual(cache.stats(), { hits: 1, misses: 1, size: 1 });
});

test('DB có thay đổi (số lần ghi tăng): tính lại ngay', async () => {
  const { cache, state, compute } = await make();
  await cache.get('k', await compute('x'));
  state.rev++;
  assert.equal((await cache.get('k', await compute('y'))).value, 'y');
  assert.equal(state.calls, 2);
});

test('quá TTL: tính lại dù DB không đổi', async () => {
  const { cache, state, compute } = await make({ ttlMs: 1000 });
  await cache.get('k', await compute('x'));
  state.time = 999;
  await cache.get('k', await compute('x'));
  assert.equal(state.calls, 1);
  state.time = 1000;
  await cache.get('k', await compute('z'));
  assert.equal(state.calls, 2);
});

test('khoá khác nhau không lẫn nhau; vượt trần thì bỏ khoá cũ nhất', async () => {
  const { cache, compute } = await make({ maxEntries: 2 });
  await cache.get('a', await compute(1));
  await cache.get('b', await compute(2));
  await cache.get('c', await compute(3));
  assert.equal(cache.stats().size, 2);
  assert.equal(cache.entries.has('a'), false);
});

test('tính toán ném lỗi thì không lưu gì, lần sau tính lại', async () => {
  const { cache, state, compute } = await make();
  await assert.rejects(() => cache.get('k', () => assert.fail('lỗi thử')));
  assert.equal(cache.stats().size, 0);
  assert.equal((await cache.get('k', await compute('ok'))).value, 'ok');
  assert.equal(state.calls, 1);
});

'use strict';
// Bộ nhớ đệm phép tính nặng (lib/ops/compute-cache.js): hợp lệ khi cùng số lần ghi và chưa quá TTL; DB đổi thì tính lại ngay.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { ComputeCache } = require('../../lib/ops/compute-cache');

function make({ ttlMs = 1000, maxEntries = 3 } = {}) {
  const state = { rev: 1, time: 0, calls: 0 };
  const cache = new ComputeCache({ revision: () => state.rev, now: () => state.time, ttlMs, maxEntries });
  const compute = value => () => {
    state.calls++;
    return { value };
  };
  return { cache, state, compute };
}

test('cùng khoá, cùng số lần ghi, chưa hết hạn: tính một lần và trả cùng một đối tượng', () => {
  const { cache, state, compute } = make();
  const a = cache.get('k', compute('x'));
  const b = cache.get('k', compute('y'));
  assert.equal(a, b);
  assert.equal(state.calls, 1);
  assert.deepEqual(cache.stats(), { hits: 1, misses: 1, size: 1 });
});

test('DB có thay đổi (số lần ghi tăng): tính lại ngay', () => {
  const { cache, state, compute } = make();
  cache.get('k', compute('x'));
  state.rev++;
  assert.equal(cache.get('k', compute('y')).value, 'y');
  assert.equal(state.calls, 2);
});

test('quá TTL: tính lại dù DB không đổi', () => {
  const { cache, state, compute } = make({ ttlMs: 1000 });
  cache.get('k', compute('x'));
  state.time = 999;
  cache.get('k', compute('x'));
  assert.equal(state.calls, 1);
  state.time = 1000;
  cache.get('k', compute('z'));
  assert.equal(state.calls, 2);
});

test('khoá khác nhau không lẫn nhau; vượt trần thì bỏ khoá cũ nhất', () => {
  const { cache, compute } = make({ maxEntries: 2 });
  cache.get('a', compute(1));
  cache.get('b', compute(2));
  cache.get('c', compute(3));
  assert.equal(cache.stats().size, 2);
  assert.equal(cache.entries.has('a'), false);
});

test('tính toán ném lỗi thì không lưu gì, lần sau tính lại', () => {
  const { cache, state, compute } = make();
  assert.throws(() => cache.get('k', () => assert.fail('lỗi thử')));
  assert.equal(cache.stats().size, 0);
  assert.equal(cache.get('k', compute('ok')).value, 'ok');
  assert.equal(state.calls, 1);
});

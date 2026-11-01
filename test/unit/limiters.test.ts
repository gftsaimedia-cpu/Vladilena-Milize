'use strict';
// Bộ giới hạn tải (src/ops/limiters.ts): cổng bất đồng bộ có hàng đợi, xô token theo khoá, bộ chặn khi quá tải.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { Overloaded, AsyncGate, RateLimiter, LoadShedder } = require('../../src/ops/limiters');

const deferred = () => {
  let resolve;
  const promise = new Promise<any>(r => (resolve = r));
  return { promise, resolve };
};

test('AsyncGate: tối đa limit việc chạy cùng lúc, thừa thì xếp hàng, quá hàng đợi thì từ chối', async () => {
  const gate = new AsyncGate({ limit: 2, maxQueue: 1, retryAfterSec: 3 });
  const gates = [deferred(), deferred(), deferred()];
  const started: any[] = [];
  const run = (i?) =>
    gate.run(async () => {
      started.push(i);
      await gates[i].promise;
      return i;
    });
  const p0 = run(0),
    p1 = run(1),
    p2 = run(2);
  await Promise.resolve();
  assert.deepEqual(started, [0, 1]); // việc thứ 3 đang chờ
  assert.deepEqual(gate.stats(), { running: 2, queued: 1 });
  await assert.rejects(
    gate.run(async () => 3),
    err => err instanceof Overloaded && err.retryAfterSec === 3
  );
  gates[0].resolve();
  assert.equal(await p0, 0);
  await Promise.resolve();
  assert.deepEqual(started, [0, 1, 2]); // chỗ trống chuyển cho người chờ
  gates[1].resolve();
  gates[2].resolve();
  assert.deepEqual(await Promise.all([p1, p2]), [1, 2]);
  assert.deepEqual(gate.stats(), { running: 0, queued: 0 });
});

test('AsyncGate: việc ném lỗi vẫn trả chỗ', async () => {
  const gate = new AsyncGate({ limit: 1, maxQueue: 0, retryAfterSec: 1 });
  await assert.rejects(gate.run(async () => assert.fail('lỗi thử')));
  assert.equal(await gate.run(async () => 'ok'), 'ok');
});

test('RateLimiter: hết token thì báo số giây chờ, nạp lại theo thời gian, khoá độc lập', () => {
  const clock = { t: 0 };
  const limiter = new RateLimiter({ perMinute: 60, now: () => clock.t }); // 1 token/giây, xô 60
  for (let i = 0; i < 60; i++) assert.equal(limiter.take('an'), 0);
  assert.equal(limiter.take('an'), 1);
  assert.equal(limiter.take('binh'), 0); // người khác không bị ảnh hưởng
  clock.t = 1000;
  assert.equal(limiter.take('an'), 0);
  assert.equal(limiter.take('an'), 1);
});

test('RateLimiter: số khoá có trần', () => {
  const limiter = new RateLimiter({ perMinute: 5, maxKeys: 2 });
  limiter.take('a');
  limiter.take('b');
  limiter.take('c');
  assert.equal(limiter.buckets.size, 2);
  assert.equal(limiter.buckets.has('a'), false);
});

test('LoadShedder: từ chối khi quá tải hoặc vòng lặp nghẽn, nhận khi bình thường', async () => {
  const state = { lag: 0, inflight: 0 };
  const shedder = new LoadShedder({
    lagMs: () => state.lag,
    inflight: () => state.inflight,
    maxLagMs: 500,
    maxInflight: 10,
    retryAfterSec: 2
  });
  assert.equal(await shedder.check(), null);
  state.lag = 500;
  assert.equal(await shedder.check(), 'máy chủ đang nghẽn');
  state.lag = 0;
  state.inflight = 10;
  assert.equal(await shedder.check(), 'quá nhiều yêu cầu đang xử lý');
  assert.equal(shedder.shed, 2);
});

test('RateLimiter: đồng hồ bị lùi không làm cạn token', () => {
  const clock = { t: 100000 };
  const limiter = new RateLimiter({ perMinute: 60, now: () => clock.t });
  assert.equal(limiter.take('an'), 0);
  clock.t = 0; // lùi về quá khứ
  assert.equal(limiter.take('an'), 0);
});

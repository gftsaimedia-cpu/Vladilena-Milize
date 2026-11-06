import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { moneyOf } from '../../src/modules/payroll/domain';

// D1 (06/11): một khoản tiền = một công thức đầy đủ từ lương cơ bản, trên số lượng chưa làm tròn, làm tròn một lần.
describe('moneyOf: one formula from the base salary, rounded once', () => {
  it('pays days as base x days / standard days', () => {
    // 6.000.000 x 10 / 26 = 2.307.692,31
    assert.equal(moneyOf(6_000_000, 26, 10), 2_307_692);
  });

  it('pays hours as base x hours / (standard days x 8)', () => {
    // 6.000.000 x 8 / 208 = 230.769,23; never 2 x round(115.384,62) = 230.770
    assert.equal(moneyOf(6_000_000, 26, 8, { perHour: true }), 230_769);
    assert.equal(moneyOf(6_000_000, 26, 4, { perHour: true }), 115_385);
  });

  it('applies a rate inside the one formula', () => {
    // 1,5 x 6.000.000 x 100/60 / 208 = 72.115,38; never 2 x round(36.057,69) = 72.116
    assert.equal(moneyOf(6_000_000, 26, 100 / 60, { perHour: true, rate: 1.5 }), 72_115);
    // 0,8 x 6.000.000 x 10 / 26 = 1.846.153,85 (D2)
    assert.equal(moneyOf(6_000_000, 26, 10, { rate: 0.8 }), 1_846_154);
  });

  it('gives 0 for no quantity', () => {
    assert.equal(moneyOf(6_000_000, 26, 0), 0);
    assert.equal(moneyOf(6_000_000, 26, 0, { perHour: true, rate: 3 }), 0);
  });
});

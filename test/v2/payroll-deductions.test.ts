import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { isInsured, resolveContractTerm } from '../../src/modules/payroll/domain/contract-term';
import { DEFAULT_INSURANCE_RATES, calculateInsurance } from '../../src/modules/payroll/domain/insurance';
import {
  DEPENDANT_DEDUCTION,
  FLAT_RATE,
  FLAT_THRESHOLD,
  PERSONAL_DEDUCTION,
  calculatePersonalIncomeTax,
  progressiveTax,
  resolveTaxMethod
} from '../../src/modules/payroll/domain/personal-income-tax';

describe('calculateInsurance', () => {
  it('uses the confirmed default rates', () => {
    assert.deepEqual(DEFAULT_INSURANCE_RATES, { bhxh: 0.08, bhyt: 0.015, bhtn: 0.01 });
  });

  it('splits the base into BHXH, BHYT and BHTN for an insured employee', () => {
    assert.deepEqual(calculateInsurance(6_000_000, true), {
      base: 6_000_000,
      bhxh: 480_000,
      bhyt: 90_000,
      bhtn: 60_000,
      total: 630_000
    });
  });

  it('deducts nothing for an employee who is not insured', () => {
    assert.deepEqual(calculateInsurance(6_000_000, false), { base: 6_000_000, bhxh: 0, bhyt: 0, bhtn: 0, total: 0 });
  });

  it('applies configured rates', () => {
    const r = calculateInsurance(6_000_000, true, { bhxh: 0.08, bhyt: 0.015, bhtn: 0.005 });
    assert.equal(r.bhtn, 30_000);
    assert.equal(r.total, 600_000);
  });

  it('rounds each part to a whole dong before summing', () => {
    // 5_555_555 x 8% = 444_444.4, x 1.5% = 83_333.325, x 1% = 55_555.55
    const r = calculateInsurance(5_555_555, true);
    assert.equal(r.bhxh, 444_444);
    assert.equal(r.bhyt, 83_333);
    assert.equal(r.bhtn, 55_556);
    assert.equal(r.total, 583_333);
  });
});

describe('resolveContractTerm', () => {
  it('uses the label the web form writes', () => {
    assert.equal(resolveContractTerm('long', 'tts'), 'long');
    assert.equal(resolveContractTerm('short', 'nv'), 'short');
  });

  it('defaults an empty label by employee type: tts short, everyone else long', () => {
    assert.equal(resolveContractTerm(null, 'nv'), 'long');
    assert.equal(resolveContractTerm(null, 'CTV'), 'long');
    assert.equal(resolveContractTerm(null, 'tts'), 'short');
    assert.equal(resolveContractTerm(null, 'TTS'), 'short');
    assert.equal(resolveContractTerm('', 'nv'), 'long');
    assert.equal(resolveContractTerm(undefined, undefined), 'long');
    assert.equal(resolveContractTerm(null, null), 'long');
    assert.equal(resolveContractTerm(null, 'unknown'), 'long');
  });

  it('treats any other value, such as a date text, as no label', () => {
    assert.equal(resolveContractTerm('2026-12-31', 'tts'), 'short');
    assert.equal(resolveContractTerm('2026-12-31', 'nv'), 'long');
    assert.equal(resolveContractTerm('LONG', 'tts'), 'short');
    assert.equal(resolveContractTerm(3, 'tts'), 'short');
  });
});

describe('isInsured', () => {
  it('always insures a contract of three months or more', () => {
    assert.equal(isInsured('long', 0), true);
    assert.equal(isInsured('long', null), true);
    assert.equal(isInsured('long', 1), true);
  });

  it('insures a shorter contract only when the insured flag is set and not 0', () => {
    assert.equal(isInsured('short', 1), true);
    assert.equal(isInsured('short', 0), false);
    assert.equal(isInsured('short', null), false);
  });
});

describe('resolveTaxMethod', () => {
  it('is progressive for a contract of three months or more', () => {
    assert.equal(resolveTaxMethod('long'), 'progressive');
  });

  it('is flat10 for a shorter contract', () => {
    assert.equal(resolveTaxMethod('short'), 'flat10');
  });
});

describe('progressiveTax', () => {
  it('is 0 for nothing to assess', () => {
    assert.equal(progressiveTax(0), 0);
    assert.equal(progressiveTax(-1_000_000), 0);
  });

  it('taxes each bracket at its own rate', () => {
    assert.equal(progressiveTax(10_000_000), 500_000);
    assert.equal(progressiveTax(45_000_000), 5_500_000);
    assert.equal(progressiveTax(150_000_000), 38_000_000);
  });

  it('rounds to a whole dong', () => {
    assert.equal(progressiveTax(1_234_567), 61_728);
  });
});

describe('calculatePersonalIncomeTax', () => {
  it('uses the confirmed deductions and flat rate constants', () => {
    assert.equal(PERSONAL_DEDUCTION, 15_500_000);
    assert.equal(DEPENDANT_DEDUCTION, 6_200_000);
    assert.equal(FLAT_RATE, 0.1);
    assert.equal(FLAT_THRESHOLD, 5_000_000);
  });

  it('deducts exemptions, insurance, personal and dependant allowances before the brackets', () => {
    const r = calculatePersonalIncomeTax({
      method: 'progressive',
      grossIncome: 30_000_000,
      exemptIncome: 500_000,
      insurance: 630_000,
      dependants: 1
    });
    assert.deepEqual(r, {
      method: 'progressive',
      taxableIncome: 29_500_000,
      assessableIncome: 7_170_000,
      tax: 358_500
    });
  });

  it('owes no tax when deductions cover the taxable income', () => {
    const r = calculatePersonalIncomeTax({
      method: 'progressive',
      grossIncome: 12_000_000,
      exemptIncome: 0,
      insurance: 630_000,
      dependants: 0
    });
    assert.deepEqual(r, { method: 'progressive', taxableIncome: 12_000_000, assessableIncome: 0, tax: 0 });
  });

  it('never lets exempt income push taxable income below 0', () => {
    const r = calculatePersonalIncomeTax({
      method: 'progressive',
      grossIncome: 1_000_000,
      exemptIncome: 3_000_000,
      insurance: 0,
      dependants: 0
    });
    assert.deepEqual(r, { method: 'progressive', taxableIncome: 0, assessableIncome: 0, tax: 0 });
  });

  it('taxes 10% of gross when gross reaches the threshold', () => {
    const at = calculatePersonalIncomeTax({
      method: 'flat10',
      grossIncome: 5_000_000,
      exemptIncome: 0,
      insurance: 525_000,
      dependants: 2
    });
    assert.deepEqual(at, { method: 'flat10', taxableIncome: 5_000_000, assessableIncome: 5_000_000, tax: 500_000 });

    const below = calculatePersonalIncomeTax({
      method: 'flat10',
      grossIncome: 4_999_999,
      exemptIncome: 0,
      insurance: 0,
      dependants: 0
    });
    assert.deepEqual(below, { method: 'flat10', taxableIncome: 4_999_999, assessableIncome: 0, tax: 0 });
  });

  it('applies the 10% rate to gross, not to gross minus exempt income', () => {
    const r = calculatePersonalIncomeTax({
      method: 'flat10',
      grossIncome: 8_000_000,
      exemptIncome: 500_000,
      insurance: 0,
      dependants: 0
    });
    assert.deepEqual(r, { method: 'flat10', taxableIncome: 7_500_000, assessableIncome: 8_000_000, tax: 800_000 });
  });

  it('checks the threshold against gross, not taxable income', () => {
    const r = calculatePersonalIncomeTax({
      method: 'flat10',
      grossIncome: 5_500_000,
      exemptIncome: 1_000_000,
      insurance: 0,
      dependants: 0
    });
    assert.equal(r.taxableIncome, 4_500_000);
    assert.equal(r.tax, 550_000);
  });

  it('rounds the 10% tax to a whole dong', () => {
    const r = calculatePersonalIncomeTax({
      method: 'flat10',
      grossIncome: 5_000_005,
      exemptIncome: 0,
      insurance: 0,
      dependants: 0
    });
    assert.equal(r.tax, 500_001);
  });

  it('owes nothing when the employee has no income tax', () => {
    const r = calculatePersonalIncomeTax({
      method: 'none',
      grossIncome: 50_000_000,
      exemptIncome: 500_000,
      insurance: 630_000,
      dependants: 1
    });
    assert.deepEqual(r, { method: 'none', taxableIncome: 49_500_000, assessableIncome: 0, tax: 0 });
  });
});

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { KPI_WEIGHTS, calculateKpiPay, KpiCap } from '../../src/modules/payroll/domain/kpi-pay';
import { WARNING_MESSAGES, warning } from '../../src/modules/payroll/domain/payroll-warning';

const cap: KpiCap = { applicable: true, kpiMax: 6_000_000 };
const fullScores = { wework: 9000, user: 8000, peer: 7000, manager: 8500, self: 10000 };

describe('payroll warnings', () => {
  it('builds a warning with its fixed message and fields', () => {
    assert.deepEqual(warning('KPI_SCORE_MISSING', ['peer']), {
      code: 'KPI_SCORE_MISSING',
      message: WARNING_MESSAGES.KPI_SCORE_MISSING,
      fields: ['peer']
    });
  });

  it('omits the fields key when no fields are given', () => {
    const w = warning('KPI_PROPOSAL_MISSING');
    assert.deepEqual(w, { code: 'KPI_PROPOSAL_MISSING', message: WARNING_MESSAGES.KPI_PROPOSAL_MISSING });
    assert.equal('fields' in w, false);
  });

  it('keeps the confirmed message texts', () => {
    assert.deepEqual(WARNING_MESSAGES, {
      KPI_PROPOSAL_MISSING: 'Chưa nhập lương KPI đề xuất của tháng; lương KPI tạm tính 0.',
      KPI_SCORE_MISSING: 'Thiếu điểm KPI; cột thiếu tính 0 điểm.',
      KPI_PROPOSAL_EXCEEDS_MAX: 'Lương KPI đề xuất vượt mức KPI của bậc; đã tính theo mức của bậc.'
    });
  });
});

describe('calculateKpiPay', () => {
  it('uses the confirmed weights', () => {
    assert.deepEqual(KPI_WEIGHTS, { wework: 40, user: 24, peer: 18, manager: 12, self: 6 });
  });

  it('pays weighted percent of the proposal when every score is entered', () => {
    const r = calculateKpiPay({ scores: fullScores, proposedAmount: 5_000_000 }, cap);
    assert.equal(r.applicable, true);
    assert.equal(r.weightedPct, 84);
    assert.equal(r.proposedAmount, 5_000_000);
    assert.equal(r.appliedAmount, 5_000_000);
    assert.equal(r.amount, 4_200_000);
    assert.deepEqual(r.warnings, []);
  });

  it('reports component scores as points 0-100', () => {
    const r = calculateKpiPay({ scores: { ...fullScores, user: 9225, peer: 6667, self: 0 }, proposedAmount: 1 }, cap);
    assert.deepEqual(r.scores, { wework: 90, user: 92.25, peer: 66.67, manager: 85, self: 0 });
  });

  it('counts a missing component as 0 and flags it', () => {
    const r = calculateKpiPay({ scores: { ...fullScores, peer: null }, proposedAmount: 5_000_000 }, cap);
    assert.equal(r.weightedPct, 71.4);
    assert.equal(r.amount, 3_570_000);
    assert.equal(r.scores.peer, null);
    assert.deepEqual(r.warnings, [warning('KPI_SCORE_MISSING', ['peer'])]);
  });

  it('treats an absent key like a null score', () => {
    const withoutPeer = { wework: 9000, user: 8000, manager: 8500, self: 10000 };
    const r = calculateKpiPay({ scores: withoutPeer, proposedAmount: 5_000_000 }, cap);
    assert.equal(r.amount, 3_570_000);
    assert.deepEqual(r.warnings, [warning('KPI_SCORE_MISSING', ['peer'])]);
  });

  it('lists several missing components in weight order', () => {
    const r = calculateKpiPay({ scores: { wework: 9000, manager: 8500 }, proposedAmount: 5_000_000 }, cap);
    assert.deepEqual(r.warnings, [warning('KPI_SCORE_MISSING', ['user', 'peer', 'self'])]);
  });

  it('pays 0 and flags a missing proposal', () => {
    const r = calculateKpiPay({ scores: fullScores, proposedAmount: null }, cap);
    assert.equal(r.proposedAmount, null);
    assert.equal(r.appliedAmount, 0);
    assert.equal(r.amount, 0);
    assert.equal(r.weightedPct, 84);
    assert.deepEqual(r.warnings, [warning('KPI_PROPOSAL_MISSING')]);
  });

  it('flags every gap when no KPI input exists', () => {
    const r = calculateKpiPay(null, cap);
    assert.equal(r.applicable, true);
    assert.equal(r.amount, 0);
    assert.equal(r.weightedPct, 0);
    assert.equal(r.proposedAmount, null);
    assert.deepEqual(r.scores, { wework: null, user: null, peer: null, manager: null, self: null });
    assert.deepEqual(r.warnings, [
      warning('KPI_PROPOSAL_MISSING'),
      warning('KPI_SCORE_MISSING', ['wework', 'user', 'peer', 'manager', 'self'])
    ]);
  });

  it('rounds the money amount to a whole dong', () => {
    const scores = { wework: 8750, user: 9225, peer: 6667, manager: 7000, self: 9500 };
    const r = calculateKpiPay({ scores, proposedAmount: 6_000_000 }, cap);
    assert.equal(r.weightedPct, 83.24);
    assert.equal(r.amount, 4_994_436);
  });

  it('caps the proposal at the level maximum and flags it', () => {
    const r = calculateKpiPay({ scores: fullScores, proposedAmount: 7_000_000 }, cap);
    assert.equal(r.proposedAmount, 7_000_000);
    assert.equal(r.appliedAmount, 6_000_000);
    assert.equal(r.amount, 5_040_000);
    assert.deepEqual(r.warnings, [warning('KPI_PROPOSAL_EXCEEDS_MAX')]);
  });

  it('does not flag a proposal equal to the level maximum', () => {
    const r = calculateKpiPay({ scores: fullScores, proposedAmount: 6_000_000 }, cap);
    assert.equal(r.appliedAmount, 6_000_000);
    assert.deepEqual(r.warnings, []);
  });

  it('orders flags: proposal missing, exceeds max, score missing', () => {
    const r = calculateKpiPay({ scores: { ...fullScores, self: null }, proposedAmount: 9_000_000 }, cap);
    assert.deepEqual(r.warnings, [warning('KPI_PROPOSAL_EXCEEDS_MAX'), warning('KPI_SCORE_MISSING', ['self'])]);
    const none = calculateKpiPay({ scores: { ...fullScores, self: null }, proposedAmount: null }, cap);
    assert.deepEqual(none.warnings, [warning('KPI_PROPOSAL_MISSING'), warning('KPI_SCORE_MISSING', ['self'])]);
  });

  it('pays nothing and raises no flag when KPI does not apply to the level', () => {
    const notApplicable: KpiCap = { applicable: false, kpiMax: null };
    const empty = calculateKpiPay(null, notApplicable);
    assert.equal(empty.applicable, false);
    assert.equal(empty.amount, 0);
    assert.deepEqual(empty.warnings, []);

    const entered = calculateKpiPay({ scores: fullScores, proposedAmount: 5_000_000 }, notApplicable);
    assert.equal(entered.applicable, false);
    assert.equal(entered.proposedAmount, 5_000_000);
    assert.equal(entered.appliedAmount, 0);
    assert.equal(entered.amount, 0);
    assert.deepEqual(entered.warnings, []);
  });
});

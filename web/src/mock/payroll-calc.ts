// Bản tính của mockup theo luật đã chốt. Phép tính thật nằm ở BE; xoá file này khi FE nối lại BE.
export type KpiPart = 'wework' | 'user' | 'peer' | 'manager' | 'self';
export type KpiScores = Record<KpiPart, number | null>;

import { KPI_WEIGHTS as MOCK_KPI_WEIGHTS } from '../constants/labels';
export { MOCK_KPI_WEIGHTS };
const PARTS: KpiPart[] = ['wework', 'user', 'peer', 'manager', 'self'];

const STANDARD_DAYS = 26;
const PERSONAL_DEDUCTION = 15_500_000;
const DEPENDANT_DEDUCTION = 6_200_000;
// [mức trên cùng của bậc, thuế suất %]
const TAX_BRACKETS: [number, number][] = [
  [10e6, 5],
  [30e6, 10],
  [60e6, 20],
  [100e6, 30],
  [Infinity, 35]
];

export type SlipInput = {
  base: number;
  dependants: number;
  days: { work: number };
  leavePay: number;
  isatPay: number;
  allowances: { actual: number }[];
  ot: { pay: number };
  late: { cut: number };
  exempt: number;
  advance: number;
  kpi: { scores: KpiScores; proposal: number };
};

export type SlipCalc = {
  baseActual: number;
  workPay: number;
  kpiPercent: number;
  kpiMissing: KpiPart[];
  kpiPay: number;
  allowanceTotal: number;
  gross: number;
  taxable: number;
  insurance: number;
  afterInsurance: number;
  tax: number;
  net: number;
};

/** Điểm KPI là phần trăm nguyên 0-100: kẹp vào khoảng, làm tròn về số nguyên; trống hoặc không phải số là thiếu điểm (null), không phải 0. */
export const normalizeScore = (v: number | null | undefined): number | null =>
  v == null || !Number.isFinite(v) ? null : Math.min(100, Math.max(0, Math.round(v)));

/** Điểm trống tính 0 và tên cột vào `missing`. Điểm × trọng số là số nguyên nên tổng không lệch số lẻ. */
export function kpiScore(scores: KpiScores): { percent: number; missing: KpiPart[] } {
  const points = PARTS.reduce((sum, p) => sum + (scores[p] ?? 0) * MOCK_KPI_WEIGHTS[p], 0);
  return { percent: points / 100, missing: PARTS.filter(p => scores[p] == null) };
}

export const kpiPay = (percent: number, proposal: number): number => Math.round((proposal * percent) / 100);

export const baseActual = (base: number, days: number): number => Math.round((base * days) / STANDARD_DAYS);

export const insurance = (base: number): number => Math.round(base * 0.105);

export function incomeTax(assessable: number): number {
  const income = Math.max(0, assessable);
  let tax = 0;
  let lower = 0;
  for (const [upper, rate] of TAX_BRACKETS) {
    if (income > lower) tax += ((Math.min(income, upper) - lower) * rate) / 100;
    lower = upper;
  }
  return Math.round(tax);
}

export function recomputeSlip<T extends SlipInput>(slip: T): T & { calc: SlipCalc } {
  const actual = baseActual(slip.base, slip.days.work);
  const workPay = actual + slip.leavePay + slip.isatPay;
  const { percent, missing } = kpiScore(slip.kpi.scores);
  const pay = kpiPay(percent, slip.kpi.proposal);
  const allowanceTotal = slip.allowances.reduce((sum, a) => sum + a.actual, 0);
  const gross = workPay + pay + allowanceTotal + slip.ot.pay - slip.late.cut;
  const taxable = gross - slip.exempt;
  const ins = insurance(slip.base);
  const tax = incomeTax(taxable - ins - PERSONAL_DEDUCTION - DEPENDANT_DEDUCTION * slip.dependants);
  const calc: SlipCalc = {
    baseActual: actual,
    workPay,
    kpiPercent: percent,
    kpiMissing: missing,
    kpiPay: pay,
    allowanceTotal,
    gross,
    taxable,
    insurance: ins,
    afterInsurance: gross - ins,
    tax,
    net: gross - ins - tax - slip.advance
  };
  return { ...slip, calc };
}

import { ContractTerm } from './contract-term';

export type TaxMethod = 'progressive' | 'flat10' | 'none';

export const PERSONAL_DEDUCTION = 15_500_000;
export const DEPENDANT_DEDUCTION = 6_200_000;
export const FLAT_RATE = 0.1;
export const FLAT_THRESHOLD = 5_000_000;

// [upper bound of the bracket, rate]
const BRACKETS: Array<[number, number]> = [
  [10_000_000, 0.05],
  [30_000_000, 0.1],
  [60_000_000, 0.2],
  [100_000_000, 0.3],
  [Infinity, 0.35]
];

// A contract of 3 months or more -> progressive; a shorter one -> flat 10% of gross.
export function resolveTaxMethod(term: ContractTerm): TaxMethod {
  return term === 'long' ? 'progressive' : 'flat10';
}

export function progressiveTax(assessable: number): number {
  let tax = 0;
  let lower = 0;
  for (const [upper, rate] of BRACKETS) {
    if (assessable <= lower) break;
    tax += (Math.min(assessable, upper) - lower) * rate;
    lower = upper;
  }
  return Math.round(tax);
}

export interface TaxInput {
  method: TaxMethod;
  grossIncome: number;
  exemptIncome: number;
  insurance: number;
  dependants: number;
}

export interface TaxResult {
  method: TaxMethod;
  taxableIncome: number;
  assessableIncome: number;
  tax: number;
}

export function calculatePersonalIncomeTax(input: TaxInput): TaxResult {
  const { method, grossIncome, exemptIncome, insurance, dependants } = input;
  const taxableIncome = Math.max(0, grossIncome - exemptIncome);

  if (method === 'none') return { method, taxableIncome, assessableIncome: 0, tax: 0 };

  // Flat 10% is taken on gross (not gross minus exempt income) once gross reaches the threshold.
  if (method === 'flat10') {
    if (grossIncome < FLAT_THRESHOLD) return { method, taxableIncome, assessableIncome: 0, tax: 0 };
    return { method, taxableIncome, assessableIncome: grossIncome, tax: Math.round(grossIncome * FLAT_RATE) };
  }

  const deductions = insurance + PERSONAL_DEDUCTION + DEPENDANT_DEDUCTION * dependants;
  const assessableIncome = Math.max(0, taxableIncome - deductions);
  return { method, taxableIncome, assessableIncome, tax: progressiveTax(assessableIncome) };
}

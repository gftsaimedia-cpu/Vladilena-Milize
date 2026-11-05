import { ContractTerm } from './contract-term';

export type TaxMethod = 'progressive' | 'flat10' | 'none';

export const PERSONAL_DEDUCTION = 15_500_000;
export const DEPENDANT_DEDUCTION = 6_200_000;
export const FLAT_RATE = 0.1;
export const FLAT_THRESHOLD = 5_000_000;

/** One bracket of the progressive tax: income up to `upTo` (null = no upper bound, last bracket only) at `ratePct` %. */
export interface TaxBracket {
  upTo: number | null;
  ratePct: number;
}

/** The tax rules of a month, as the settings store keeps them (percentages are % numbers: 10 means 10%). */
export interface TaxRules {
  personalDeduction: number;
  dependantDeduction: number;
  shortContractPct: number; // the 'flat10' method: this % of gross for a contract under three months
  shortContractThreshold: number; // ... once gross reaches this amount
  brackets: TaxBracket[];
}

/** The default rules: the constants above and the brackets 10M 5%, 30M 10%, 60M 20%, 100M 30%, above 35%. */
export const DEFAULT_TAX_RULES: TaxRules = {
  personalDeduction: PERSONAL_DEDUCTION,
  dependantDeduction: DEPENDANT_DEDUCTION,
  shortContractPct: 10,
  shortContractThreshold: FLAT_THRESHOLD,
  brackets: [
    { upTo: 10_000_000, ratePct: 5 },
    { upTo: 30_000_000, ratePct: 10 },
    { upTo: 60_000_000, ratePct: 20 },
    { upTo: 100_000_000, ratePct: 30 },
    { upTo: null, ratePct: 35 }
  ]
};

// A contract of 3 months or more -> progressive; a shorter one -> the flat % of gross ('flat10', named after 10%).
export function resolveTaxMethod(term: ContractTerm): TaxMethod {
  return term === 'long' ? 'progressive' : 'flat10';
}

export function progressiveTax(assessable: number, brackets: TaxBracket[] = DEFAULT_TAX_RULES.brackets): number {
  let tax = 0;
  let lower = 0;
  for (const { upTo, ratePct } of brackets) {
    if (assessable <= lower) break;
    const upper = upTo ?? Infinity;
    tax += (Math.min(assessable, upper) - lower) * (ratePct / 100);
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

export function calculatePersonalIncomeTax(input: TaxInput, rules: TaxRules = DEFAULT_TAX_RULES): TaxResult {
  const { method, grossIncome, exemptIncome, insurance, dependants } = input;
  const taxableIncome = Math.max(0, grossIncome - exemptIncome);

  if (method === 'none') return { method, taxableIncome, assessableIncome: 0, tax: 0 };

  // The flat % is taken on gross (not gross minus exempt income) once gross reaches the threshold.
  if (method === 'flat10') {
    if (grossIncome < rules.shortContractThreshold) return { method, taxableIncome, assessableIncome: 0, tax: 0 };
    const tax = Math.round(grossIncome * (rules.shortContractPct / 100));
    return { method, taxableIncome, assessableIncome: grossIncome, tax };
  }

  const deductions = insurance + rules.personalDeduction + rules.dependantDeduction * dependants;
  const assessableIncome = Math.max(0, taxableIncome - deductions);
  return { method, taxableIncome, assessableIncome, tax: progressiveTax(assessableIncome, rules.brackets) };
}

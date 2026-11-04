export interface InsuranceRates {
  bhxh: number;
  bhyt: number;
  bhtn: number;
}

export const DEFAULT_INSURANCE_RATES: InsuranceRates = { bhxh: 0.08, bhyt: 0.015, bhtn: 0.01 };

export interface InsuranceDeduction {
  base: number;
  bhxh: number;
  bhyt: number;
  bhtn: number;
  total: number;
}

// Each part is rounded to a whole dong on its own; total is the sum of the rounded parts.
export function calculateInsurance(
  base: number,
  insured: boolean,
  rates: InsuranceRates = DEFAULT_INSURANCE_RATES
): InsuranceDeduction {
  const part = (rate: number) => (insured ? Math.round(base * rate) : 0);
  const bhxh = part(rates.bhxh);
  const bhyt = part(rates.bhyt);
  const bhtn = part(rates.bhtn);
  return { base, bhxh, bhyt, bhtn, total: bhxh + bhyt + bhtn };
}

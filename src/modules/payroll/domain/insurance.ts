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

/** The rates as the percentages printed on the payslip (0.015 -> 1.5); total is the sum of the three. */
export interface InsurancePct {
  bhxh: number;
  bhyt: number;
  bhtn: number;
  total: number;
}

export function insurancePctOf(rates: InsuranceRates): InsurancePct {
  const pct = (rate: number) => Math.round(rate * 10000) / 100;
  const bhxh = pct(rates.bhxh);
  const bhyt = pct(rates.bhyt);
  const bhtn = pct(rates.bhtn);
  return { bhxh, bhyt, bhtn, total: Math.round((bhxh + bhyt + bhtn) * 100) / 100 };
}

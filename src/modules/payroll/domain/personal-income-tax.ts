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

const CONTRACT_MONTHS_FOR_PROGRESSIVE = 3;

const pad = (n: number) => String(n).padStart(2, '0');

// Works on the numeric parts of 'YYYY-MM-DD' so the result never depends on the machine time zone.
// The day is clamped to the last day of the target month (31 Nov + 3 months -> 28 Feb).
function addMonths(date: string, months: number): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(date);
  if (!m) return null;
  const index = Number(m[1]) * 12 + (Number(m[2]) - 1) + months;
  const year = Math.floor(index / 12);
  const month = (index % 12) + 1;
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return `${year}-${pad(month)}-${pad(Math.min(Number(m[3]), lastDay))}`;
}

// The calendar day after a 'YYYY-MM-DD' date, on its numeric parts like addMonths.
function nextDay(date: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(date);
  if (!m) return null;
  const next = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]) + 1));
  return `${next.getUTCFullYear()}-${pad(next.getUTCMonth() + 1)}-${pad(next.getUTCDate())}`;
}

// Contract shorter than 3 months -> flat 10%; otherwise (also when a date is missing) progressive.
// The end date is the last day of the contract (01/10 to 31/12 is three months), so the contract is short only
// when the day after the end date comes before start + 3 months.
export function resolveTaxMethod(c: { hasTax: boolean; startDate: string | null; endDate: string | null }): TaxMethod {
  if (!c.hasTax) return 'none';
  if (!c.startDate || !c.endDate) return 'progressive';
  const threshold = addMonths(c.startDate, CONTRACT_MONTHS_FOR_PROGRESSIVE);
  const dayAfterEnd = nextDay(c.endDate);
  if (threshold !== null && dayAfterEnd !== null && dayAfterEnd < threshold) return 'flat10';
  return 'progressive';
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

  if (method === 'flat10') {
    const tax = grossIncome >= FLAT_THRESHOLD ? Math.round(taxableIncome * FLAT_RATE) : 0;
    return { method, taxableIncome, assessableIncome: taxableIncome, tax };
  }

  const deductions = insurance + PERSONAL_DEDUCTION + DEPENDANT_DEDUCTION * dependants;
  const assessableIncome = Math.max(0, taxableIncome - deductions);
  return { method, taxableIncome, assessableIncome, tax: progressiveTax(assessableIncome) };
}

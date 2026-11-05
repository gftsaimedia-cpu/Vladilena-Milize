import type { ExplanationCase } from './explanation-cases';

export interface ExplanationNeeds { checkIn: boolean; checkOut: boolean }

export interface DetectInput {
  date: string;
  today: string;
  shiftStart: string;
  shiftEnd: string;
  checkIn: Date | null;
  checkOut: Date | null;
  hasOt: boolean;
}

const MINUTE_MS = 60_000;
const DAY_MS = 24 * 60 * MINUTE_MS;
const IN_TOLERANCE_MIN = 15;
const OUT_TOLERANCE_MIN = 30;

export function explanationCasesOf(input: DetectInput): { cases: ExplanationCase[]; needs: ExplanationNeeds } {
  const start = new Date(`${input.date}T${input.shiftStart}:00+07:00`).getTime();
  let end = new Date(`${input.date}T${input.shiftEnd}:00+07:00`).getTime();
  if (input.shiftEnd <= input.shiftStart) end += DAY_MS;
  const past = input.date < input.today;

  const cases: ExplanationCase[] = [];

  if (input.checkIn) {
    const diff = (input.checkIn.getTime() - start) / MINUTE_MS;
    if (diff < -IN_TOLERANCE_MIN) cases.push('EARLY_CHECK_IN');
    else if (diff > IN_TOLERANCE_MIN) cases.push('LATE_CHECK_IN');
  } else if (input.checkOut || past) {
    cases.push('MISSING_CHECK_IN');
  }

  if (input.checkOut) {
    const diff = (input.checkOut.getTime() - end) / MINUTE_MS;
    if (diff < 0) cases.push('EARLY_CHECK_OUT');
    else if (diff > OUT_TOLERANCE_MIN && !input.hasOt) cases.push('FORGOT_CHECK_OUT');
  } else if (past) {
    cases.push('MISSING_CHECK_OUT');
  }

  return {
    cases,
    needs: {
      checkIn: cases.includes('MISSING_CHECK_IN'),
      checkOut: cases.includes('MISSING_CHECK_OUT')
    }
  };
}

export type ExplanationCase =
  'LATE_CHECK_IN' | 'EARLY_CHECK_OUT' | 'MISSING_CHECK_IN' | 'MISSING_CHECK_OUT'
  | 'EARLY_CHECK_IN' | 'LATE_CHECK_OUT' | 'FORGOT_CHECK_OUT';

export const EXPLANATION_CASES: ReadonlyArray<{ readonly code: ExplanationCase; readonly label: string }> = [
  { code: 'LATE_CHECK_IN', label: 'Vào muộn quá 15 phút' },
  { code: 'EARLY_CHECK_OUT', label: 'Ra sớm' },
  { code: 'MISSING_CHECK_IN', label: 'Thiếu giờ vào' },
  { code: 'MISSING_CHECK_OUT', label: 'Thiếu giờ ra' },
  { code: 'EARLY_CHECK_IN', label: 'Vào sớm quá 15 phút' },
  { code: 'LATE_CHECK_OUT', label: 'Ra muộn quá 15 phút khi không có OT' },
  { code: 'FORGOT_CHECK_OUT', label: 'Quên check-out (ra muộn quá 30 phút)' }
];

export function isExplanationCase(value: unknown): value is ExplanationCase {
  return EXPLANATION_CASES.some(c => c.code === value);
}

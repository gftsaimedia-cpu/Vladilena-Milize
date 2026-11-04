export type LeaveType =
  'ANNUAL' | 'PERSONAL_PAID' | 'PERSONAL_UNPAID' | 'SOCIAL_INSURANCE' | 'WELFARE' | 'UNPAID';

export type LeavePayGroup = 'PAID' | 'UNPAID' | 'SOCIAL_INSURANCE';

export const LEAVE_TYPES: ReadonlyArray<{
  readonly code: LeaveType;
  readonly label: string;
  readonly payGroup: LeavePayGroup;
}> = [
  { code: 'ANNUAL', label: 'Phép năm', payGroup: 'PAID' },
  { code: 'PERSONAL_PAID', label: 'Việc riêng có lương', payGroup: 'PAID' },
  { code: 'PERSONAL_UNPAID', label: 'Việc riêng không lương', payGroup: 'UNPAID' },
  { code: 'SOCIAL_INSURANCE', label: 'Chế độ BHXH', payGroup: 'SOCIAL_INSURANCE' },
  { code: 'WELFARE', label: 'Phúc lợi nội bộ', payGroup: 'PAID' },
  { code: 'UNPAID', label: 'Không lương', payGroup: 'UNPAID' }
];

export function isLeaveType(value: unknown): value is LeaveType {
  return LEAVE_TYPES.some(t => t.code === value);
}

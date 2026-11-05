import type { Capability } from '../../../common';

export const ALL_CAPS: readonly Capability[] = Object.freeze([
  'config.read',
  'config.write',
  'payroll.calculate',
  'payroll.approve',
  'attendance.correct',
  'attendance.lock',
  'audit.read',
  'staff.manage',
  'requests.review',
] as const);

// Đợt đầu chỉ có hai vai trò: admin có mọi năng lực, staff không có năng lực quản trị nào.
const ROLE_CAPS: Record<string, readonly Capability[]> = {
  admin: ALL_CAPS,
  staff: [],
};

/** Năng lực của một vai trò; vai trò lạ không có năng lực nào. */
export function capsOf(role: string): Capability[] {
  return [...(ROLE_CAPS[role] ?? [])];
}

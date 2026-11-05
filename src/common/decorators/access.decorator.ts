import { SetMetadata } from '@nestjs/common';

// Năng lực mà một route có thể đòi. Bảng vai trò → năng lực nằm ở src/modules/auth/domain/capabilities.ts.
export type Capability =
  | 'config.read'
  | 'config.write'
  | 'payroll.calculate'
  | 'payroll.approve'
  | 'attendance.correct'
  | 'attendance.lock'
  | 'audit.read'
  | 'staff.manage'
  | 'requests.review';

export type AccessRule = { kind: 'public' } | { kind: 'authenticated' } | { kind: 'cap'; cap: Capability };

export const ACCESS_KEY = 'access';

// Mỗi handler mang đúng một dấu; AuthGuard từ chối handler không có dấu nào (mặc định đóng).
/** Không cần đăng nhập. */
export const Public = () => SetMetadata(ACCESS_KEY, { kind: 'public' } satisfies AccessRule);
/** Chỉ cần phiên hợp lệ. */
export const Authenticated = () => SetMetadata(ACCESS_KEY, { kind: 'authenticated' } satisfies AccessRule);
/** Cần phiên hợp lệ và năng lực `cap`. */
export const RequireCap = (cap: Capability) => SetMetadata(ACCESS_KEY, { kind: 'cap', cap } satisfies AccessRule);

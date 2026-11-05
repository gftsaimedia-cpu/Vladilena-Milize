// Các dòng nhật ký của một lần lưu hồ sơ nhân sự (spec audit-log mục 6), tách theo mức nhạy cảm như v1
// (253c52a^:src/platform/audit.ts): normal = thông tin chung, pay = các ô ảnh hưởng lương,
// pii = ngày sinh (chỉ ghi tên ô, không ghi giá trị). Mật khẩu chỉ ghi cờ passwordSet, không bao giờ ghi hash.
// Ô suy ra từ ô khác (fullName, primaryRole, isOvernight, remainingDays) và ô máy tự đặt (uuid, lockedAt...) không ghi.
import type { AuditSensitivity } from '../../audit/domain/audit-entry';
import type { EmployeeDTO } from './employee';

export type StaffAuditAction = 'staff.create' | 'staff.update' | 'staff.delete' | 'password.reset';

export interface StaffAuditRow {
  action: StaffAuditAction;
  sensitivity: AuditSensitivity;
  before: Record<string, unknown> | null;
  after: Record<string, unknown>;
}

type Field = (e: EmployeeDTO) => unknown;

const NORMAL: Record<string, Field> = {
  familyName: e => e.profile.familyName,
  givenName: e => e.profile.givenName,
  roles: e => e.account.roles,
  isLocked: e => e.account.isLocked,
  jobTitle: e => e.contract.position.jobTitle,
  shiftType: e => e.contract.shift.type,
  shiftStartTime: e => e.contract.shift.startTime,
  shiftEndTime: e => e.contract.shift.endTime,
  status: e => e.contract.status,
  effectiveFrom: e => e.contract.effectiveFrom,
  resignedOn: e => e.contract.resignedOn
};

const PAY: Record<string, Field> = {
  dependants: e => e.profile.dependants,
  positionType: e => e.contract.position.type,
  level: e => e.contract.position.level,
  shiftAllowancePct: e => e.contract.shift.allowancePct,
  leaveTotalDays: e => e.contract.leave.totalDays,
  leaveUsedDays: e => e.contract.leave.usedDays,
  term: e => e.contract.term,
  hasInsurance: e => e.contract.hasInsurance,
  isUnionMember: e => e.contract.isUnionMember,
  hasTax: e => e.contract.hasTax,
  canAdvance: e => e.contract.canAdvance,
  isDormResident: e => e.contract.isDormResident
};

const PII: Record<string, Field> = {
  birthday: e => e.profile.birthday
};

/** Ba ô mà "Xoá nhân sự" (cho nghỉ việc và khoá tài khoản) thay đổi. */
const RESIGN = ['status', 'isLocked', 'resignedOn'];

const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/** Các ô khác nhau giữa prev và next. Tạo mới (prev null): mọi ô có giá trị, before = null. */
function changes(fields: Record<string, Field>, prev: EmployeeDTO | null, next: EmployeeDTO) {
  const before: Record<string, unknown> = {};
  const after: Record<string, unknown> = {};
  for (const [key, read] of Object.entries(fields)) {
    const was = prev ? read(prev) : null;
    const now = read(next);
    if (same(was, now)) continue;
    before[key] = was ?? null;
    after[key] = now ?? null;
  }
  return Object.keys(after).length ? { before: prev ? before : null, after } : null;
}

/**
 * Dòng của một lần tạo (prev null) hoặc sửa hồ sơ. Tạo mới luôn có dòng normal, kèm passwordSet nếu có đặt mật khẩu.
 * Sửa chỉ ghi các ô đổi; đổi mật khẩu thành một dòng password.reset riêng. Không đổi gì thì không có dòng nào.
 */
export function staffSaveRows(prev: EmployeeDTO | null, next: EmployeeDTO, passwordSet: boolean): StaffAuditRow[] {
  const action: StaffAuditAction = prev ? 'staff.update' : 'staff.create';
  const rows: StaffAuditRow[] = [];
  const plain = changes(NORMAL, prev, next);
  if (!prev) {
    rows.push({ action, sensitivity: 'normal', before: null, after: { ...plain?.after, ...(passwordSet ? { passwordSet: true } : {}) } });
  } else if (plain) {
    rows.push({ action, sensitivity: 'normal', ...plain });
  }
  const pay = changes(PAY, prev, next);
  if (pay) rows.push({ action, sensitivity: 'pay', ...pay });
  const pii = changes(PII, prev, next);
  if (pii) rows.push({ action, sensitivity: 'pii', before: null, after: { changed: Object.keys(pii.after) } });
  if (prev && passwordSet) rows.push({ action: 'password.reset', sensitivity: 'normal', before: null, after: { passwordSet: true } });
  return rows;
}

/** Dòng của "Xoá nhân sự": trạng thái, khoá và ngày nghỉ việc trước và sau. */
export function staffDeleteRow(prev: EmployeeDTO, next: EmployeeDTO): StaffAuditRow {
  const pick = (e: EmployeeDTO) => Object.fromEntries(RESIGN.map(key => [key, NORMAL[key](e) ?? null]));
  return { action: 'staff.delete', sensitivity: 'normal', before: pick(prev), after: pick(next) };
}

import { STAFF_STATUS_FILTERS, type StaffStatusFilter } from './staff-status';

export interface StaffFilter {
  staffStatus: StaffStatusFilter;
  /** Số, hoặc 'none' cho người chưa xếp phòng; undefined = không lọc theo phòng. */
  departmentId: number | 'none' | undefined;
  q: string;
}

export class InvalidStaffFilterError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidStaffFilterError';
  }
}

const present = (text: string | undefined): string | undefined => (text === undefined || text === '' ? undefined : text);

/** Đọc ba tham số lọc chung của các route danh sách; giá trị lạ ném InvalidStaffFilterError (400 INVALID_FILTER). */
export function parseStaffFilter(raw: { staffStatus?: string; departmentId?: string; q?: string }): StaffFilter {
  const status = present(raw.staffStatus) ?? 'all';
  if (!(STAFF_STATUS_FILTERS as readonly string[]).includes(status)) {
    throw new InvalidStaffFilterError(`staffStatus không hợp lệ: ${status}`);
  }

  let departmentId: StaffFilter['departmentId'];
  const dept = present(raw.departmentId);
  if (dept === 'none') departmentId = 'none';
  else if (dept !== undefined) {
    const n = Number(dept);
    if (!/^\d+$/.test(dept) || !Number.isSafeInteger(n) || n < 1) {
      throw new InvalidStaffFilterError(`departmentId không hợp lệ: ${dept}`);
    }
    departmentId = n;
  }

  return { staffStatus: status as StaffStatusFilter, departmentId, q: (raw.q ?? '').trim() };
}

/** Bộ lọc không loại ai (all hoặc mine, không phòng, không tên). */
export function isNeutralStaffFilter(filter: StaffFilter): boolean {
  return (filter.staffStatus === 'all' || filter.staffStatus === 'mine') && filter.departmentId === undefined && filter.q === '';
}

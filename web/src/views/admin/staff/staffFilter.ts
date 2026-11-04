// Lọc danh sách nhân sự theo chữ tìm (tên, mã, email) và công tắc "Chưa kích hoạt tài khoản".
import { fold } from '@/builders/admin-attendance/common';
import type { StaffRow } from '@/mock/staff';

export type StaffFilterOpts = { q: string; inactiveOnly: boolean };

export function filterStaff(rows: StaffRow[], opts: StaffFilterOpts): StaffRow[] {
  const needle = fold(opts.q).trim();
  return rows.filter(r => {
    if (opts.inactiveOnly && r.activated) return false;
    if (!needle) return true;
    return [r.name, r.code, r.email].some(v => fold(v).includes(needle));
  });
}

export const isFiltered = (opts: StaffFilterOpts): boolean => fold(opts.q).trim() !== '' || opts.inactiveOnly;

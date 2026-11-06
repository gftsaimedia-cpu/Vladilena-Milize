// Lọc danh sách nhân sự theo chữ tìm (tên, mã, email) và bộ lọc nhân sự dùng chung (trạng thái nhân sự, phòng ban).
import { fold } from '@/builders/admin-attendance/common';
import { matchScope, type StaffScope } from '@/components/staff-scope/staffScope';
import type { StaffRow } from '@/mock/staff';

export type StaffFilterOpts = { q: string; scope: StaffScope; mine: string[] | null };

export function filterStaff(rows: StaffRow[], opts: StaffFilterOpts): StaffRow[] {
  const needle = fold(opts.q).trim();
  return rows.filter(r => {
    if (!matchScope({ dept: r.dept, ps: r.status }, opts.scope, opts.mine)) return false;
    if (!needle) return true;
    return [r.name, r.code, r.email].some(v => fold(v).includes(needle));
  });
}

export const isFiltered = (opts: StaffFilterOpts): boolean =>
  fold(opts.q).trim() !== '' || opts.scope.pst !== 'all' || opts.scope.dept !== '';

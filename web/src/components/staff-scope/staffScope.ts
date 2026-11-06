// Bộ lọc nhân sự dùng chung (06/11): mọi màn có danh sách nhân sự lọc theo trạng thái nhân sự và phòng ban.
// "Đang làm việc" gồm cả người thử việc; "Tài khoản tôi quản lý" là các phòng người đăng nhập quản lý (null = tất cả).
// Máy chủ thật chưa trả trạng thái nhân sự và phòng ban (docs/fe-yeu-cau/admin-loc-nhan-su-chon-nhieu--api-be.md):
// dòng thiếu trạng thái coi là đang làm việc chính thức.
import { MOCK_MINE } from '@/mock/people-status';

export type PersonStatus = 'ok' | 'try' | 'off' | 'out';
export type StaffPst = 'all' | 'work' | 'mine' | 'try' | 'off' | 'out';
export type StaffScope = { pst: StaffPst; dept: string };

export const PST_OPTIONS: { value: StaffPst; label: string }[] = [
  { value: 'all', label: 'Tất cả nhân sự' },
  { value: 'work', label: 'Đang làm việc' },
  { value: 'mine', label: 'Tài khoản tôi quản lý' },
  { value: 'try', label: 'Đang thử việc' },
  { value: 'off', label: 'Đang tạm nghỉ' },
  { value: 'out', label: 'Đã nghỉ việc' }
];

export const isPst = (v: unknown): v is StaffPst => PST_OPTIONS.some(o => o.value === v);

/** Người này có khớp bộ lọc không. `dept` rỗng = mọi phòng ban; `mine` null = quản lý tất cả. */
export function matchScope(
  person: { dept: string; ps?: PersonStatus },
  scope: StaffScope,
  mine: string[] | null
): boolean {
  if (scope.dept && person.dept !== scope.dept) return false;
  const ps = person.ps ?? 'ok';
  switch (scope.pst) {
    case 'all':
      return true;
    case 'work':
      return ps === 'ok' || ps === 'try';
    case 'mine':
      return mine === null || mine.includes(person.dept);
    default:
      return ps === scope.pst;
  }
}

const NO_DEPT = new Set(['', '—']);

/** Các phòng ban khác nhau của những dòng đang có, sắp theo tiếng Việt; bỏ ô trống và "—". */
export function deptOptions(rows: { dept: string }[]): string[] {
  return [...new Set(rows.map(r => r.dept).filter(d => !NO_DEPT.has(d)))].sort((a, b) => a.localeCompare(b, 'vi'));
}

/** Các phòng người đăng nhập quản lý: dữ liệu giả = phòng Sản xuất như board; máy chủ thật chưa có phạm vi nên là tất cả. */
export function useMineDepts(): string[] | null {
  return __MOCK__ ? MOCK_MINE : null;
}

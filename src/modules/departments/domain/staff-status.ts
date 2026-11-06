/** Trạng thái nhân sự tính sẵn ở BE, một bộ giá trị cho mọi màn (docs/fe-yeu-cau/admin-loc-nhan-su-chon-nhieu--api-be.md §2.2). */
export type StaffStatus = 'probation' | 'working' | 'on_leave' | 'resigned';

/** Giá trị của bộ lọc: `all` và `mine` chỉ dùng để lọc, không bao giờ là trạng thái của một người. */
export type StaffStatusFilter = 'all' | 'mine' | 'working' | StaffStatus;

export const STAFF_STATUS_FILTERS: readonly StaffStatusFilter[] = [
  'all',
  'working',
  'mine',
  'probation',
  'on_leave',
  'resigned'
];

export interface StaffStatusInput {
  /** Giá trị lưu ở staff.contract_status (probation, official, tts, ctv, nghiviec) hoặc mã domain (thuviec, nv). */
  contractStatus: string | null;
  /** Khoảng tạm nghỉ do Admin đặt, 'YYYY-MM-DD'; ngày về để trống = chưa rõ. */
  onLeaveFrom: string | null;
  onLeaveTo: string | null;
}

/** Nghỉ việc luôn thắng tạm nghỉ; hôm nay nằm trong khoảng tạm nghỉ (hai đầu tính vào) thì là tạm nghỉ. */
export function staffStatusOf(person: StaffStatusInput, today: string): StaffStatus {
  const contract = (person.contractStatus ?? '').trim().toLowerCase();
  if (contract === 'nghiviec') return 'resigned';
  const { onLeaveFrom, onLeaveTo } = person;
  if (onLeaveFrom && onLeaveFrom <= today && (!onLeaveTo || today <= onLeaveTo)) return 'on_leave';
  return contract === 'probation' || contract === 'thuviec' ? 'probation' : 'working';
}

/** "Đang làm việc" gồm cả người thử việc. `mine` bằng `all` cho tới khi có phạm vi quản lý theo bậc. */
export function matchesStaffStatus(filter: StaffStatusFilter, status: StaffStatus): boolean {
  if (filter === 'all' || filter === 'mine') return true;
  if (filter === 'working') return status === 'working' || status === 'probation';
  return filter === status;
}

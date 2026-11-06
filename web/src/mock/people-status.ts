// Trạng thái nhân sự giả dùng chung cho mọi màn (06/11): giống bảng Nhân sự (I); ai không có trong danh sách là đang làm chính thức.
// Các mock của từng màn dùng mã người khác nhau nên tra theo họ tên.
import type { PersonStatus } from '@/components/staff-scope/staffScope';

const NOT_OK: Record<string, PersonStatus> = {
  'Đỗ Mai Linh': 'try',
  'Phan Minh Khoa': 'try',
  'Lý Thanh Tâm': 'try', // phiếu lương giả ghi đang thử việc
  'Hoàng Thị Mai': 'off',
  'Đặng Văn Phúc': 'out'
};

export const personStatusOf = (name: string): PersonStatus => NOT_OK[name] ?? 'ok';

/** Mẫu: người đăng nhập quản lý phòng Sản xuất (phạm vi thật theo Phân quyền, chưa chốt). */
export const MOCK_MINE = ['Sản xuất'];

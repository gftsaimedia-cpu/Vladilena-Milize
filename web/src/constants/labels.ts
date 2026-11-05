// Nhãn hiển thị dùng chung cho dữ liệu giả và dữ liệu thật. Đặt ngoài src/mock để màn hình import mà không kéo
// dữ liệu giả vào bản build thật.
import type { GroupKey } from '@/mock/attendance';
import type { InboxGroup } from '@/mock/inbox';
import type { KpiPart } from '@/mock/payroll-calc';

export const KPI_LABELS: Record<KpiPart, string> = {
  wework: 'Base Wework',
  user: 'Người dùng',
  peer: 'Đồng nghiệp',
  manager: 'Quản lý trực tiếp',
  self: 'Tự đánh giá'
};

// Trọng số % của 5 phần KPI.
export const KPI_WEIGHTS: Record<KpiPart, number> = { wework: 40, user: 24, peer: 18, manager: 12, self: 6 };

export const ATTENDANCE_GROUPS: { key: GroupKey; label: string }[] = [
  { key: 'work', label: 'Đi làm' },
  { key: 'late', label: 'Đi muộn, về sớm' },
  { key: 'leave', label: 'Nghỉ có phép' },
  { key: 'absent', label: 'Vắng' },
  { key: 'todo', label: 'Cần xử lý' }
];

export const INBOX_GROUPS: { key: InboxGroup; label: string }[] = [
  { key: 'att', label: 'Chấm công' },
  { key: 'leave', label: 'Đơn nghỉ' },
  { key: 'ot', label: 'Làm thêm, làm bù' },
  { key: 'exp', label: 'Giải trình' },
  { key: 'adv', label: 'Tạm ứng' }
];

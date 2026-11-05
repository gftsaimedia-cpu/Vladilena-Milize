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

// Loại nhân sự (staff.type) như BE gửi: nv / ctv / tts; loại lạ in chữ hoa, chưa có loại in "—".
const EMPLOYEE_TYPES: Record<string, string> = { nv: 'NV', ctv: 'CTV', tts: 'TTS' };
export const employeeTypeLabel = (t?: string | null): string => (t ? (EMPLOYEE_TYPES[t] ?? t.toUpperCase()) : '—');

// Trạng thái nhân sự (staff.contract_status) như BE gửi trên phiếu; khác nhãn hợp đồng ("HĐLĐ từ 3 tháng").
const EMPLOYMENT_STATUSES: Record<string, string> = { probation: 'Thử việc', official: 'Chính thức' };
export const employmentStatusLabel = (s?: string | null): string | null => (s ? (EMPLOYMENT_STATUSES[s] ?? null) : null);

/** "NV · Bậc 2"; chưa có cả loại lẫn bậc (phiếu lưu trước khi BE có hai trường này) → "—". */
export const kindLevelText = (kind: string, level: number | null): string =>
  kind === '—' && level == null ? '—' : `${kind} · Bậc ${level ?? '—'}`;

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

// Nhóm cuối của chuông: tin hệ thống, đứng sau các nhóm việc chờ duyệt.
export const SYSTEM_GROUP_LABEL = 'Hệ thống';

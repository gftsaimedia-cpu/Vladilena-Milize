// Dựng dữ liệu hiển thị cho các màn Cài đặt chỉ đọc từ phản hồi của kho cài đặt. Thuần: chỉ import tương đối.
import type { SettingsResponse } from './settings';

/** Tên năm thành phần KPI theo thứ tự hiển thị. */
export const KPI_NAMES: Record<string, string> = {
  wework: 'Base Wework',
  user: 'Người dùng',
  peer: 'Đồng nghiệp',
  manager: 'Quản lý',
  self: 'Tự đánh giá'
};

/** Năm trọng số KPI đang hiệu lực và tổng của chúng. */
export function kpiRulesView(s: SettingsResponse): { weights: { label: string; percent: number }[]; total: number } {
  const values = s.groups.kpiWeights.values;
  const weights = Object.entries(KPI_NAMES).map(([key, label]) => ({ label, percent: Number(values[key]) }));
  return { weights, total: weights.reduce((n, w) => n + w.percent, 0) };
}

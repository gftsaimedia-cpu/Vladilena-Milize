// Bốn thẻ chỉ số màn Nhân sự từ `summary` của GET /api/v2/employees. Số, hướng tăng giảm và tháng so sánh do BE tính;
// ở đây chỉ ghép chữ. Import tương đối để chạy được bằng node:test và dùng chung với dữ liệu giả.
import type { StaffStat } from '../../mock/staff';

export type MetricDTO = { value: number; prev: number; delta: { dir: 'up' | 'down'; value: number } };
export type StaffSummaryDTO = {
  month: string;
  asOf: string;
  prevMonth: string;
  compareYear: number;
  total: number;
  active: MetricDTO;
  joined: MetricDTO;
  left: MetricDTO;
  tenure: MetricDTO;
  inactiveAccounts: number;
  byType: Record<string, number>;
  byLevel: Record<string, Record<string, number>>;
  byTerm: { long: number; short: number; unset: number };
  byStatus: { ok: number; try: number; off: number; out: number };
};

const monthNo = (ym: string) => Number(ym.slice(5, 7));
const oneDecimal = (n: number) => n.toFixed(1).replace('.', ',');

export function staffStatsFromSummary(s: StaffSummaryDTO): StaffStat[] {
  const note = `so với tháng ${monthNo(s.prevMonth)}`;
  const count = (m: MetricDTO) => ({ dir: m.delta.dir, text: String(m.delta.value) });
  return [
    { key: 'active', label: 'Nhân sự đang làm', value: String(s.active.value), unit: 'người', delta: count(s.active), note, dark: true },
    { key: 'joined', label: `Vào làm tháng ${monthNo(s.month)}`, value: String(s.joined.value), unit: 'người', delta: count(s.joined), note, dark: false },
    { key: 'left', label: `Nghỉ việc tháng ${monthNo(s.month)}`, value: String(s.left.value), unit: 'người', delta: count(s.left), note, dark: false },
    {
      key: 'tenure',
      label: 'Thâm niên trung bình',
      value: oneDecimal(s.tenure.value),
      unit: 'năm',
      delta: { dir: s.tenure.delta.dir, text: `${oneDecimal(s.tenure.delta.value)} năm` },
      note: `so với năm ${s.compareYear}`,
      dark: false
    }
  ];
}

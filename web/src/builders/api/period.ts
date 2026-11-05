// Thanh kỳ lương từ một dòng payroll_periods (GET /api/v2/system/periods). Mỗi bước xong khi có mốc thời gian tương
// ứng; bước đầu tiên chưa xong là bước hiện tại. Tháng chưa có dòng kỳ thì đang chấm công.
export type PeriodDTO = {
  month: string;
  status: string;
  attendance_locked_at: string | null;
  calculated_at: string | null;
  approved_at: string | null;
  paid_at: string | null;
};

const LABELS = ['Chấm công', 'Chốt công', 'Chấm KPI', 'Tính lương', 'Phê duyệt', 'Trả lương'];
// Trạng thái hiển thị theo bước hiện tại (chỉ số trong LABELS); hết bước = đã trả lương.
const STATE_AT = ['Đang chấm công', 'Đang chốt công', 'Đang chấm KPI', 'Đang tính lương', 'Chờ phê duyệt', 'Chờ trả lương'];

const monthTitle = (month: string) => `Tháng ${Number(month.slice(5, 7))}/${month.slice(0, 4)}`;

export function periodStripFromPeriod(p: PeriodDTO | null, month: string) {
  const locked = !!p?.attendance_locked_at;
  const calculated = !!p?.calculated_at;
  // Chấm công và chốt công cùng xong khi khoá công; KPI coi như xong khi đã tính lương (BE chưa có mốc riêng).
  const done = [locked, locked, calculated, calculated, !!p?.approved_at, !!p?.paid_at];
  const cur = done.indexOf(false);
  return {
    month: monthTitle(month),
    state: cur < 0 ? 'Đã trả lương' : STATE_AT[cur],
    stateCls: cur < 0 ? 'ok' : 'draft',
    steps: LABELS.map((label, i) => [done[i] ? 'done' : i === cur ? 'cur' : '', label] as [string, string])
  };
}

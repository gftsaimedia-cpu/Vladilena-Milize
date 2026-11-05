// Thanh kỳ lương từ trạng thái kỳ của máy chủ (GET /api/v2/system/periods/:month). Mỗi bước xong khi có mốc thời gian
// tương ứng; bước đầu tiên chưa xong là bước hiện tại. Tháng chưa có dòng kỳ thì đang chấm công.
export type PeriodAction = 'lock' | 'unlock' | 'approve' | 'unapprove' | 'pay';
export type ApproveBlockers = {
  pendingRequests: number;
  unapprovedSlips: number;
  missingSlips: { username: string; name: string }[];
};
export type ActionState = { enabled: boolean; reason?: string; blockers?: ApproveBlockers };
export type PeriodView = {
  month: string;
  status: 'open' | 'attendance_locked' | 'calculated' | 'approved' | 'paid';
  steps: {
    lockedAt: string | null;
    calculatedAt: string | null;
    approvedAt: string | null;
    paidAt: string | null;
  };
  payday: string;
  actions: Partial<Record<PeriodAction, ActionState>>;
};

const LABELS = ['Chấm công', 'Chốt công', 'Chấm KPI', 'Tính lương', 'Phê duyệt', 'Trả lương'];
// Trạng thái hiển thị theo bước hiện tại (chỉ số trong LABELS); hết bước = đã trả lương.
const STATE_AT = ['Đang chấm công', 'Đang chốt công', 'Đang chấm KPI', 'Đang tính lương', 'Chờ phê duyệt', 'Chờ trả lương'];

const monthTitle = (month: string) => `Tháng ${Number(month.slice(5, 7))}/${month.slice(0, 4)}`;

export function periodStripFromView(p: PeriodView | null, month: string) {
  const locked = !!p?.steps.lockedAt;
  const calculated = !!p?.steps.calculatedAt;
  // Chấm công và chốt công cùng xong khi khoá công; KPI coi như xong khi đã tính lương (BE chưa có mốc riêng).
  const done = [locked, locked, calculated, calculated, !!p?.steps.approvedAt, !!p?.steps.paidAt];
  const cur = done.indexOf(false);
  return {
    month: monthTitle(month),
    state: cur < 0 ? 'Đã trả lương' : STATE_AT[cur],
    stateCls: cur < 0 ? 'ok' : 'draft',
    steps: LABELS.map((label, i) => [done[i] ? 'done' : i === cur ? 'cur' : '', label] as [string, string])
  };
}

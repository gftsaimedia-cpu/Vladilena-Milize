// Kiểu dữ liệu của luồng tạo và huỷ yêu cầu (spec staff-requests 2.1, 2.2): request-context, thân đơn, kết quả xem trước.
// Dùng chung cho mock/staff-requests, builders/api/staff-requests và services/staff-requests; không có mã chạy.
export type RequestKind =
  | 'leave'
  | 'leave-with-makeup'
  | 'half-shift-leave'
  | 'overtime'
  | 'shift-change'
  | 'explanation'
  | 'advance';
export type ClaimStatus = 'LEAVE' | 'LEAVE_WITH_MAKEUP' | 'HALF_SHIFT' | 'SHIFT_CHANGE' | 'ISAT';
/** Nửa ca nhân viên **làm** (BE): FIRST là nửa đầu, SECOND là nửa sau. */
export type HalfShift = 'FIRST' | 'SECOND';
export type TimeRange = { start: string; end: string };
/** Hai cách chia ca của một ngày (BE tính): nửa làm và nửa nghỉ. */
export type HalfShiftOptions = Record<HalfShift, { work: TimeRange; leave: TimeRange }>;
/** Nợ nghỉ giữa ca của tháng, tính bằng phút (BE): nợ, phần khung OT đã đăng ký xếp vào trả nợ, phần còn lại. */
export type HalfShiftDebt = { owedMinutes: number; registeredMinutes: number; remainingMinutes: number };
export type ExplanationCase =
  | 'LATE_CHECK_IN'
  | 'EARLY_CHECK_IN'
  | 'EARLY_CHECK_OUT'
  | 'FORGOT_CHECK_OUT'
  | 'MISSING_CHECK_IN'
  | 'MISSING_CHECK_OUT';
export type ExplanationNeeds = { checkIn: boolean; checkOut: boolean };

/** Một giờ kết thúc hợp lệ của một giờ bắt đầu, kèm số phút làm việc. */
export type HourEnd = { end: number; minutes: number };
export type HourSlot = { start: number; ends: HourEnd[] };
export type ContextDay = {
  date: string;
  workday: boolean;
  shift: { type: string; start: string; end: string } | null;
  holiday: string | null;
  claim: { status: ClaimStatus; pending: boolean } | null;
  hours: HourSlot[];
  /** Ngày đơn nghỉ giữ khi nằm trong khoảng nghỉ (BE quyết). */
  leaveCounted: boolean;
  /** Ngày đơn đổi ca đổi được (BE quyết). */
  shiftChangeable: boolean;
  /** Giờ OT chọn được của ngày (BE đã trừ giờ OT còn lại của tháng). */
  otHours: HourSlot[];
  /** Hai nửa ca chọn được cho Nghỉ giữa ca; null khi ngày không chọn được. Thiếu khi BE chưa có loại này. */
  halfShift?: HalfShiftOptions | null;
};
export type ExplanationDay = {
  date: string;
  cases: ExplanationCase[];
  needs: ExplanationNeeds;
  remindedAt: string | null;
  checkIn: string | null; // giờ vào/ra thực của ngày ('07:52'); null khi chưa có
  checkOut: string | null;
};
export type ContextKind = { kind: RequestKind; enabled: boolean; reason?: string };
export type ContextMonth = {
  month: string;
  closed: boolean;
  otMinutes: number;
  otCapMinutes: number;
  otLeftMinutes: number;
  /** Tháng có OT thật (khung đăng ký ngoài phần trả nợ nghỉ giữa ca). */
  hasOvertime: boolean;
  hasMakeupLeave: boolean;
  /** Thiếu khi BE chưa có Nghỉ giữa ca. */
  halfShiftDebt?: HalfShiftDebt | null;
};
// windowEnd: ngày cuối nộp tạm ứng ('2026-10-17'); ordersThisMonth: số đơn tạm ứng chờ duyệt hay đã duyệt của tháng, kể cả
// đơn đang nộp (mỗi tháng một đơn nên form mở được thì là 1; đơn bị từ chối hay đã huỷ không tính).
export type AdvanceInfo = {
  month: string;
  amount: number;
  workDays: number;
  from: string;
  to: string;
  windowEnd: string;
  ordersThisMonth: number;
  ratePct: number;
};
/** Một "Đến ngày" chọn được, kèm số liệu của khoảng do BE tính. */
export type RangeChoice = {
  date: string;
  daysCount: number;
  annualLeaveLeftAfter?: number | null;
  makeupMinutesRequired?: number;
};
export type RangeChoices = { starts: string[]; ends: Record<string, RangeChoice[]> };
export type RequestChoices = {
  leave: RangeChoices;
  'leave-with-makeup': RangeChoices & { slotDates: Record<string, string[]> };
  overtime: { dates: string[] };
  'shift-change': RangeChoices;
  /** Thiếu khi BE chưa có Nghỉ giữa ca. */
  'half-shift-leave'?: { dates: string[] };
};
export type RequestRules = {
  makeupMinutesPerLeaveDay: number;
  dayCapMinutes: number;
  monthOtCapMinutes: number;
  halfShiftOwedMinutes?: number;
};
export type RequestContext = {
  today: string;
  window: { from: string; to: string };
  kinds: ContextKind[];
  months: ContextMonth[];
  leaveTypes: { code: string; label: string }[];
  annualLeaveLeft: number | null;
  shiftFrames: { shiftType: string; start: string; end: string }[];
  days: ContextDay[];
  explanationDays: ExplanationDay[];
  advance: AdvanceInfo | null;
  choices: RequestChoices;
  rules: RequestRules;
};

// Thân đơn, dùng đúng tên trường của BE.
export type LeaveDraft = { leaveType: string; startDate: string; endDate: string; reason: string };
export type MakeupSlot = { date: string; startTime: string; endTime: string };
export type MakeupDraft = { startDate: string; endDate: string; slots: MakeupSlot[]; reason: string };
export type HalfShiftDraft = { date: string; half: HalfShift; reason: string };
export type OvertimeDraft = { otDate: string; startTime: string; endTime: string; reason: string };
export type ShiftChangeDraft = { startDate: string; endDate: string; shiftType: string; startTime: string; reason: string };
export type ExplanationDraft = { workDate: string; actualCheckIn?: string; actualCheckOut?: string; reason: string };
export type AdvanceDraft = Record<string, never>;
export type RequestDraft = {
  leave: LeaveDraft;
  'leave-with-makeup': MakeupDraft;
  'half-shift-leave': HalfShiftDraft;
  overtime: OvertimeDraft;
  'shift-change': ShiftChangeDraft;
  explanation: ExplanationDraft;
  advance: AdvanceDraft;
};

export type PreviewSummary = {
  leave: { dates: string[]; daysCount: number; annualLeaveLeftAfter: number | null };
  'leave-with-makeup': { dates: string[]; daysCount: number; makeupMinutesRequired: number; makeupMinutesPlanned: number };
  'half-shift-leave': { date: string; half: HalfShift; work: TimeRange; leave: TimeRange; owedMinutes: number };
  overtime: { minutes: number; monthMinutesAfter: number };
  'shift-change': { dates: string[]; keptDates: string[] };
  explanation: { cases: ExplanationCase[]; needs: ExplanationNeeds };
  advance: { month: string; amount: number; workDays: number };
};
export type PreviewResult<K extends RequestKind = RequestKind> =
  | { ok: true; title: string; summary: PreviewSummary[K]; warnings: string[] }
  | { ok: false; message: string; code?: 'DAY_CONFLICT' | 'PERIOD_LOCKED' | 'NOT_EMPLOYED' };
/** Câu từ chối của server (xem trước, tạo, huỷ). */
export type Refusal = Extract<PreviewResult, { ok: false }>;

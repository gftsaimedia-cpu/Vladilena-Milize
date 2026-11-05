// Kiểu dữ liệu của luồng tạo và huỷ yêu cầu (spec staff-requests 2.1, 2.2): request-context, thân đơn, kết quả xem trước.
// Dùng chung cho mock/staff-requests, builders/api/staff-requests và services/staff-requests; không có mã chạy.
export type RequestKind = 'leave' | 'leave-with-makeup' | 'overtime' | 'shift-change' | 'explanation' | 'advance';
export type ClaimStatus = 'LEAVE' | 'LEAVE_WITH_MAKEUP' | 'SHIFT_CHANGE' | 'ISAT';
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
};
export type ExplanationDay = {
  date: string;
  cases: ExplanationCase[];
  needs: ExplanationNeeds;
  remindedAt: string | null;
};
export type ContextKind = { kind: RequestKind; enabled: boolean; reason?: string };
export type ContextMonth = {
  month: string;
  closed: boolean;
  otMinutes: number;
  otCapMinutes: number;
  hasOvertime: boolean;
  hasMakeupLeave: boolean;
};
// windowEnd: ngày cuối nộp tạm ứng ('2026-10-17'); ordersThisMonth: số đơn tạm ứng của tháng sau khi nộp đơn này (luôn 1).
export type AdvanceInfo = {
  month: string;
  amount: number;
  workDays: number;
  from: string;
  to: string;
  windowEnd: string;
  ordersThisMonth: number;
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
};

// Thân đơn, dùng đúng tên trường của BE.
export type LeaveDraft = { leaveType: string; startDate: string; endDate: string; reason: string };
export type MakeupSlot = { date: string; startTime: string; endTime: string };
export type MakeupDraft = { startDate: string; endDate: string; slots: MakeupSlot[]; reason: string };
export type OvertimeDraft = { otDate: string; startTime: string; endTime: string; reason: string };
export type ShiftChangeDraft = { startDate: string; endDate: string; shiftType: string; startTime: string; reason: string };
export type ExplanationDraft = { workDate: string; actualCheckIn?: string; actualCheckOut?: string; reason: string };
export type AdvanceDraft = Record<string, never>;
export type RequestDraft = {
  leave: LeaveDraft;
  'leave-with-makeup': MakeupDraft;
  overtime: OvertimeDraft;
  'shift-change': ShiftChangeDraft;
  explanation: ExplanationDraft;
  advance: AdvanceDraft;
};

export type PreviewSummary = {
  leave: { dates: string[]; daysCount: number; annualLeaveLeftAfter: number | null };
  'leave-with-makeup': { dates: string[]; daysCount: number; makeupMinutesRequired: number; makeupMinutesPlanned: number };
  overtime: { minutes: number; monthMinutesAfter: number };
  'shift-change': { dates: string[]; keptDates: string[] };
  explanation: { cases: ExplanationCase[]; needs: ExplanationNeeds };
  advance: { month: string; amount: number; workDays: number };
};
export type PreviewResult<K extends RequestKind = RequestKind> =
  | { ok: true; title: string; summary: PreviewSummary[K]; warnings: string[] }
  | { ok: false; message: string; code?: 'DAY_CONFLICT' };
/** Câu từ chối của server (xem trước, tạo, huỷ). */
export type Refusal = Extract<PreviewResult, { ok: false }>;

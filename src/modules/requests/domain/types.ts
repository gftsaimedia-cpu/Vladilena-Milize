import type { IsatProfileSnapshot, IsatRegistration, IsatRegistrationDTO } from './isat';
import type { LeaveType } from './leave-types';
import type { ExplanationCase } from './explanation-cases';

export type { LeaveType } from './leave-types';

export type RequestType =
  'LEAVE' | 'OVERTIME' | 'ADVANCE' | 'SHIFT_CHANGE' | 'LEAVE_WITH_MAKEUP' | 'EXPLANATION' | 'ISAT';

export type RequestStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED';

/** Một khung làm bù của đơn nghỉ có làm bù; `workMinutes` là giờ thực làm (§5.4). */
export interface MakeupSlot {
  date: string;
  startTime: string;
  endTime: string;
  workMinutes: number;
}

export interface MakeupSlotRow {
  request_id: string;
  work_date: string;
  start_time: string;
  end_time: string;
  work_minutes: number;
}

export interface ExplanationCaseRow {
  request_id: string;
  case_code: ExplanationCase;
}

export interface SystemRequestProps {
  id: string;
  employeeId: string;
  title: string;
  type: RequestType;
  reason: string;
  status: RequestStatus;
  reviewedBy?: string | null;
  reviewedAt?: Date | null;
  reviewNote?: string | null;
  createdAt?: Date;
  updatedAt?: Date;

  // LEAVE & LEAVE_WITH_MAKEUP
  leaveType?: LeaveType | null;
  leaveStartDate?: string | null;
  leaveEndDate?: string | null;
  leaveDaysCount?: number | null;
  makeupSlots?: MakeupSlot[];

  // EXPLANATION
  explanationDate?: string | null;
  explanationCases?: ExplanationCase[];
  actualCheckIn?: string | null;
  actualCheckOut?: string | null;

  // OVERTIME
  otDate?: string | null;
  otStartTime?: string | null;
  otEndTime?: string | null;
  otHours?: number | null;

  // ADVANCE
  advanceAmount?: bigint | number | null;
  advancePeriod?: string | null;

  // SHIFT_CHANGE
  changeStartDate?: string | null;
  changeEndDate?: string | null;
  newShiftType?: string | null;
  newStartTime?: string | null;
  newEndTime?: string | null;

  // ISAT
  isat?: IsatRegistration | null;
}

export interface CreateLeaveParams {
  employeeId: string;
  title: string;
  reason: string;
  leaveType: LeaveType;
  startDate: string;
  endDate: string;
  daysCount: number;
}

export interface CreateShiftChangeParams {
  employeeId: string;
  title: string;
  reason: string;
  changeDate: string;
  newShiftType: string;
  newStartTime: string;
  newEndTime: string;
}

export interface CreateLeaveWithMakeupParams {
  employeeId: string;
  title: string;
  reason: string;
  leaveDate: string;
  makeupDate: string;
  makeupStartTime: string;
  makeupEndTime: string;
}

export interface CreateOvertimeParams {
  employeeId: string;
  title: string;
  reason: string;
  otDate: string;
  startTime: string;
  endTime: string;
  hours: number;
}

export interface CreateAdvanceParams {
  employeeId: string;
  title: string;
  reason: string;
  amount: bigint | number;
  period: string;
}

export interface CreateExplanationParams {
  employeeId: string;
  title: string;
  reason: string;
  workDate: string;
  actualCheckIn?: string | null;
  actualCheckOut?: string | null;
}

export interface CreateIsatParams {
  employeeId: string;
  saturday: unknown;
  team: unknown;
  conditions: unknown;
  profile: IsatProfileSnapshot;
}

export interface SystemRequestRow {
  id: string;
  employee_id: string;
  title: string;
  type: RequestType;
  reason: string;
  status: RequestStatus;
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_note: string | null;
  created_at: string;
  updated_at: string;

  leave_type: LeaveType | null;
  leave_start_date: string | null;
  leave_end_date: string | null;
  leave_days_count: number | null;

  explanation_date: string | null;
  actual_check_in: string | null;
  actual_check_out: string | null;

  ot_date: string | null;
  ot_start_time: string | null;
  ot_end_time: string | null;
  ot_hours: number | null;

  advance_amount: string | number | null;
  advance_period: string | null;

  change_start_date: string | null;
  change_end_date: string | null;
  new_shift_type: string | null;
  new_start_time: string | null;
  new_end_time: string | null;
}

export interface SystemRequestDTO {
  id: string;
  employeeId: string;
  title: string;
  type: RequestType;
  reason: string;
  status: RequestStatus;
  reviewedBy: string | null;
  reviewedAt: string | null;
  reviewNote: string | null;
  createdAt: string;
  updatedAt: string;

  leaveType: LeaveType | null;
  leaveStartDate: string | null;
  leaveEndDate: string | null;
  leaveDaysCount: number | null;
  /** 480 × `leaveDaysCount` với đơn nghỉ có làm bù, null với loại khác. */
  owedMinutes: number | null;
  makeupSlots: MakeupSlot[];

  explanationDate: string | null;
  explanationCases: ExplanationCase[];
  actualCheckIn: string | null;
  actualCheckOut: string | null;

  otDate: string | null;
  otStartTime: string | null;
  otEndTime: string | null;
  otHours: number | null;

  advanceAmount: number | string | null;
  advancePeriod: string | null;

  changeStartDate: string | null;
  changeEndDate: string | null;
  newShiftType: string | null;
  newStartTime: string | null;
  newEndTime: string | null;

  isat: IsatRegistrationDTO | null;
}

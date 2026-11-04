export type RequestType =
  'LEAVE' | 'TIME_CORRECTION' | 'OVERTIME' | 'ADVANCE' | 'SHIFT_CHANGE' | 'LEAVE_WITH_MAKEUP' | 'EXPLANATION';

export type RequestStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED';

export type LeaveType = 'PAID' | 'UNPAID';

export type CorrectionPunchType = 'IN' | 'OUT';

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

  // LEAVE
  leaveType?: LeaveType | null;
  leaveStartDate?: string | null;
  leaveEndDate?: string | null;
  leaveDaysCount?: number | null;

  // TIME_CORRECTION
  correctionDate?: string | null;
  correctionPunchType?: CorrectionPunchType | null;
  correctionActualTime?: string | null;

  // OVERTIME
  otDate?: string | null;
  otStartTime?: string | null;
  otEndTime?: string | null;
  otHours?: number | null;

  // ADVANCE
  advanceAmount?: bigint | number | null;
  advancePeriod?: string | null;

  // SHIFT_CHANGE & MAKEUP
  newShiftType?: string | null;
  newStartTime?: string | null;
  newEndTime?: string | null;
  makeupStartTime?: string | null;
  makeupEndTime?: string | null;
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

export interface CreateCorrectionParams {
  employeeId: string;
  title: string;
  reason: string;
  correctionDate: string;
  punchType: CorrectionPunchType;
  actualTime: string;
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

  correction_date: string | null;
  correction_punch_type: CorrectionPunchType | null;
  correction_actual_time: string | null;

  ot_date: string | null;
  ot_start_time: string | null;
  ot_end_time: string | null;
  ot_hours: number | null;

  advance_amount: string | number | null;
  advance_period: string | null;

  new_shift_type?: string | null;
  new_start_time?: string | null;
  new_end_time?: string | null;
  makeup_start_time?: string | null;
  makeup_end_time?: string | null;
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

  correctionDate: string | null;
  correctionPunchType: CorrectionPunchType | null;
  correctionActualTime: string | null;

  otDate: string | null;
  otStartTime: string | null;
  otEndTime: string | null;
  otHours: number | null;

  advanceAmount: number | string | null;
  advancePeriod: string | null;

  newShiftType?: string | null;
  newStartTime?: string | null;
  newEndTime?: string | null;
  makeupStartTime?: string | null;
  makeupEndTime?: string | null;
}

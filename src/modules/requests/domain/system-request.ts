import { randomUUID } from 'node:crypto';
import { toDateText } from '../../../common/date-text';
import {
  RequestType,
  RequestStatus,
  LeaveType,
  MakeupSlot,
  MakeupSlotRow,
  ExplanationCaseRow,
  SystemRequestProps,
  CreateLeaveParams,
  CreateOvertimeParams,
  CreateAdvanceParams,
  CreateShiftChangeParams,
  CreateLeaveWithMakeupParams,
  CreateExplanationParams,
  CreateIsatParams,
  SystemRequestRow,
  SystemRequestDTO
} from './types';
import { IsatRegistration } from './isat';
import type { ExplanationCase } from './explanation-cases';
import { workMinutes } from './time-window';

/** Mỗi ngày nghỉ của đơn nghỉ có làm bù nợ 480 phút làm bù. */
const OWED_MINUTES_PER_LEAVE_DAY = 480;

function isValidDateString(dateStr: string): boolean {
  if (typeof dateStr !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(dateStr)) {
    return false;
  }
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

function isValidTimeString(timeStr: string): boolean {
  return typeof timeStr === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(timeStr);
}

function isValidPeriodString(periodStr: string): boolean {
  return typeof periodStr === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(periodStr);
}

function requireNonEmptyString(val: any, fieldName: string): string {
  if (typeof val !== 'string' || val.trim().length === 0) {
    throw new Error(`${fieldName} must be a non-empty string`);
  }
  return val.trim();
}

export class SystemRequest {
  id: string;
  employeeId: string;
  title: string;
  type: RequestType;
  reason: string;
  status: RequestStatus;
  reviewedBy: string | null;
  reviewedAt: Date | null;
  reviewNote: string | null;
  createdAt: Date;
  updatedAt: Date;

  // LEAVE & LEAVE_WITH_MAKEUP
  leaveType: LeaveType | null;
  leaveStartDate: string | null;
  leaveEndDate: string | null;
  leaveDaysCount: number | null;
  makeupSlots: MakeupSlot[];

  // EXPLANATION
  explanationDate: string | null;
  explanationCases: ExplanationCase[];
  actualCheckIn: string | null;
  actualCheckOut: string | null;

  // OVERTIME
  otDate: string | null;
  otStartTime: string | null;
  otEndTime: string | null;
  otHours: number | null;

  // ADVANCE
  advanceAmount: bigint | number | null;
  advancePeriod: string | null;

  // SHIFT_CHANGE
  changeStartDate: string | null;
  changeEndDate: string | null;
  newShiftType: string | null;
  newStartTime: string | null;
  newEndTime: string | null;

  // ISAT
  isat: IsatRegistration | null;

  constructor(props: SystemRequestProps) {
    if (!props || typeof props !== 'object') {
      throw new Error('SystemRequest props are required');
    }

    this.id = requireNonEmptyString(props.id, 'id');
    this.employeeId = requireNonEmptyString(props.employeeId, 'employeeId');
    this.title = requireNonEmptyString(props.title, 'title');
    this.reason = requireNonEmptyString(props.reason, 'reason');
    this.type = props.type;
    this.status = props.status;

    this.reviewedBy = props.reviewedBy ?? null;
    this.reviewedAt = props.reviewedAt ?? null;
    this.reviewNote = props.reviewNote ?? null;
    this.createdAt = props.createdAt ?? new Date();
    this.updatedAt = props.updatedAt ?? new Date();

    this.leaveType = props.leaveType ?? null;
    this.leaveStartDate = props.leaveStartDate ?? null;
    this.leaveEndDate = props.leaveEndDate ?? null;
    this.leaveDaysCount = props.leaveDaysCount ?? null;
    this.makeupSlots = [...(props.makeupSlots ?? [])];

    this.explanationDate = props.explanationDate ?? null;
    this.explanationCases = [...(props.explanationCases ?? [])];
    this.actualCheckIn = props.actualCheckIn ?? null;
    this.actualCheckOut = props.actualCheckOut ?? null;

    this.otDate = props.otDate ?? null;
    this.otStartTime = props.otStartTime ?? null;
    this.otEndTime = props.otEndTime ?? null;
    this.otHours = props.otHours ?? null;

    this.advanceAmount = props.advanceAmount ?? null;
    this.advancePeriod = props.advancePeriod ?? null;

    this.changeStartDate = props.changeStartDate ?? null;
    this.changeEndDate = props.changeEndDate ?? null;
    this.newShiftType = props.newShiftType ?? null;
    this.newStartTime = props.newStartTime ?? null;
    this.newEndTime = props.newEndTime ?? null;

    this.isat = props.isat ?? null;
  }

  static createLeaveRequest(params: CreateLeaveParams): SystemRequest {
    const employeeId = requireNonEmptyString(params?.employeeId, 'employeeId');
    const title = requireNonEmptyString(params?.title, 'title');
    const reason = requireNonEmptyString(params?.reason, 'reason');

    if (params?.leaveType !== 'PAID' && params?.leaveType !== 'UNPAID') {
      throw new Error(`leaveType must be 'PAID' or 'UNPAID', got: ${params?.leaveType}`);
    }

    if (!isValidDateString(params?.startDate)) {
      throw new Error(`startDate must be a valid YYYY-MM-DD date string, got: ${params?.startDate}`);
    }

    if (!isValidDateString(params?.endDate)) {
      throw new Error(`endDate must be a valid YYYY-MM-DD date string, got: ${params?.endDate}`);
    }

    if (params.startDate > params.endDate) {
      throw new Error(`endDate (${params.endDate}) cannot be earlier than startDate (${params.startDate})`);
    }

    if (typeof params?.daysCount !== 'number' || isNaN(params.daysCount) || params.daysCount <= 0) {
      throw new Error(`daysCount must be a positive number, got: ${params?.daysCount}`);
    }

    const now = new Date();
    return new SystemRequest({
      id: randomUUID(),
      employeeId,
      title,
      type: 'LEAVE',
      reason,
      status: 'PENDING',
      leaveType: params.leaveType,
      leaveStartDate: params.startDate,
      leaveEndDate: params.endDate,
      leaveDaysCount: params.daysCount,
      reviewedBy: null,
      reviewedAt: null,
      reviewNote: null,
      createdAt: now,
      updatedAt: now
    });
  }

  static createOvertimeRequest(params: CreateOvertimeParams): SystemRequest {
    const employeeId = requireNonEmptyString(params?.employeeId, 'employeeId');
    const title = requireNonEmptyString(params?.title, 'title');
    const reason = requireNonEmptyString(params?.reason, 'reason');

    if (!isValidDateString(params?.otDate)) {
      throw new Error(`otDate must be a valid YYYY-MM-DD date string, got: ${params?.otDate}`);
    }

    if (!isValidTimeString(params?.startTime)) {
      throw new Error(`startTime must be a valid HH:mm time string, got: ${params?.startTime}`);
    }

    if (!isValidTimeString(params?.endTime)) {
      throw new Error(`endTime must be a valid HH:mm time string, got: ${params?.endTime}`);
    }

    if (typeof params?.hours !== 'number' || isNaN(params.hours) || params.hours <= 0) {
      throw new Error(`hours must be a positive number, got: ${params?.hours}`);
    }

    const now = new Date();
    return new SystemRequest({
      id: randomUUID(),
      employeeId,
      title,
      type: 'OVERTIME',
      reason,
      status: 'PENDING',
      otDate: params.otDate,
      otStartTime: params.startTime,
      otEndTime: params.endTime,
      otHours: params.hours,
      reviewedBy: null,
      reviewedAt: null,
      reviewNote: null,
      createdAt: now,
      updatedAt: now
    });
  }

  static createAdvanceRequest(params: CreateAdvanceParams): SystemRequest {
    const employeeId = requireNonEmptyString(params?.employeeId, 'employeeId');
    const title = requireNonEmptyString(params?.title, 'title');
    const reason = requireNonEmptyString(params?.reason, 'reason');

    if (
      (typeof params?.amount !== 'number' && typeof params?.amount !== 'bigint') ||
      (typeof params?.amount === 'number' && (isNaN(params.amount) || params.amount <= 0)) ||
      (typeof params?.amount === 'bigint' && params.amount <= 0n)
    ) {
      throw new Error(`amount must be a positive number or bigint, got: ${params?.amount}`);
    }

    if (!isValidPeriodString(params?.period)) {
      throw new Error(`period must be a valid YYYY-MM period string, got: ${params?.period}`);
    }

    const now = new Date();
    return new SystemRequest({
      id: randomUUID(),
      employeeId,
      title,
      type: 'ADVANCE',
      reason,
      status: 'PENDING',
      advanceAmount: params.amount,
      advancePeriod: params.period,
      reviewedBy: null,
      reviewedAt: null,
      reviewNote: null,
      createdAt: now,
      updatedAt: now
    });
  }

  static createExplanationRequest(params: CreateExplanationParams): SystemRequest {
    const employeeId = requireNonEmptyString(params?.employeeId, 'employeeId');
    const title = requireNonEmptyString(params?.title, 'title');
    const reason = requireNonEmptyString(params?.reason, 'reason');

    if (!isValidDateString(params?.workDate)) {
      throw new Error(`workDate must be a valid YYYY-MM-DD date string, got: ${params?.workDate}`);
    }

    const now = new Date();
    return new SystemRequest({
      id: randomUUID(),
      employeeId,
      title,
      type: 'EXPLANATION',
      reason,
      status: 'PENDING',
      explanationDate: params.workDate,
      actualCheckIn: params.actualCheckIn || null,
      actualCheckOut: params.actualCheckOut || null,
      reviewedBy: null,
      reviewedAt: null,
      reviewNote: null,
      createdAt: now,
      updatedAt: now
    });
  }

  static createShiftChangeRequest(params: CreateShiftChangeParams): SystemRequest {
    const employeeId = requireNonEmptyString(params?.employeeId, 'employeeId');
    const title = requireNonEmptyString(params?.title, 'title');
    const reason = requireNonEmptyString(params?.reason, 'reason');
    if (!isValidDateString(params?.changeDate)) {
      throw new Error(`changeDate must be a valid YYYY-MM-DD date string, got: ${params?.changeDate}`);
    }
    if (!isValidTimeString(params?.newStartTime)) {
      throw new Error(`newStartTime must be a valid HH:mm time string, got: ${params?.newStartTime}`);
    }
    if (!isValidTimeString(params?.newEndTime)) {
      throw new Error(`newEndTime must be a valid HH:mm time string, got: ${params?.newEndTime}`);
    }

    const now = new Date();
    return new SystemRequest({
      id: randomUUID(),
      employeeId,
      title,
      type: 'SHIFT_CHANGE',
      reason,
      status: 'PENDING',
      changeStartDate: params.changeDate,
      changeEndDate: params.changeDate,
      newShiftType: params.newShiftType,
      newStartTime: params.newStartTime,
      newEndTime: params.newEndTime,
      reviewedBy: null,
      reviewedAt: null,
      reviewNote: null,
      createdAt: now,
      updatedAt: now
    });
  }

  static createLeaveWithMakeupRequest(params: CreateLeaveWithMakeupParams): SystemRequest {
    const employeeId = requireNonEmptyString(params?.employeeId, 'employeeId');
    const title = requireNonEmptyString(params?.title, 'title');
    const reason = requireNonEmptyString(params?.reason, 'reason');
    if (!isValidDateString(params?.leaveDate)) {
      throw new Error(`leaveDate must be a valid YYYY-MM-DD date string, got: ${params?.leaveDate}`);
    }
    if (!isValidDateString(params?.makeupDate)) {
      throw new Error(`makeupDate must be a valid YYYY-MM-DD date string, got: ${params?.makeupDate}`);
    }
    if (!isValidTimeString(params?.makeupStartTime)) {
      throw new Error(`makeupStartTime must be a valid HH:mm time string, got: ${params?.makeupStartTime}`);
    }
    if (!isValidTimeString(params?.makeupEndTime)) {
      throw new Error(`makeupEndTime must be a valid HH:mm time string, got: ${params?.makeupEndTime}`);
    }

    const now = new Date();
    return new SystemRequest({
      id: randomUUID(),
      employeeId,
      title,
      type: 'LEAVE_WITH_MAKEUP',
      reason,
      status: 'PENDING',
      leaveStartDate: params.leaveDate,
      leaveEndDate: params.leaveDate,
      leaveType: null,
      leaveDaysCount: 1,
      makeupSlots: [
        {
          date: params.makeupDate,
          startTime: params.makeupStartTime,
          endTime: params.makeupEndTime,
          workMinutes: workMinutes(params.makeupStartTime, params.makeupEndTime)
        }
      ],
      reviewedBy: null,
      reviewedAt: null,
      reviewNote: null,
      createdAt: now,
      updatedAt: now
    });
  }

  static createIsatRequest(params: CreateIsatParams): SystemRequest {
    const employeeId = requireNonEmptyString(params?.employeeId, 'employeeId');
    const isat = IsatRegistration.assess({
      saturday: params?.saturday,
      team: params?.team,
      conditions: params?.conditions,
      profile: params?.profile
    });

    const [year, month, day] = isat.saturday.split('-');
    const accepted = isat.allPassed;
    const { passedCount, totalCount } = isat;
    const rejectNote = `Tự đánh giá chưa đạt ${totalCount}/${totalCount} (đạt ${passedCount}/${totalCount})`;
    const now = new Date();
    return new SystemRequest({
      id: randomUUID(),
      employeeId,
      title: `Đăng ký iSAT Thứ Bảy ${day}/${month}/${year}`,
      type: 'ISAT',
      reason: `Tự đánh giá đạt ${passedCount}/${totalCount} điều kiện`,
      status: accepted ? 'PENDING' : 'REJECTED',
      reviewedBy: null,
      reviewedAt: accepted ? null : now,
      reviewNote: accepted ? null : rejectNote,
      isat,
      createdAt: now,
      updatedAt: now
    });
  }

  approve(reviewerId: string, note?: string): SystemRequest {
    if (this.status !== 'PENDING') {
      throw new Error(`Cannot approve request with status '${this.status}'; must be 'PENDING'`);
    }
    const cleanReviewerId = requireNonEmptyString(reviewerId, 'reviewerId');

    this.status = 'APPROVED';
    this.reviewedBy = cleanReviewerId;
    this.reviewedAt = new Date();
    this.reviewNote = note && note.trim().length > 0 ? note.trim() : null;
    this.updatedAt = new Date();
    return this;
  }

  reject(reviewerId: string, note?: string): SystemRequest {
    if (this.status !== 'PENDING') {
      throw new Error(`Cannot reject request with status '${this.status}'; must be 'PENDING'`);
    }
    const cleanReviewerId = requireNonEmptyString(reviewerId, 'reviewerId');

    this.status = 'REJECTED';
    this.reviewedBy = cleanReviewerId;
    this.reviewedAt = new Date();
    this.reviewNote = note && note.trim().length > 0 ? note.trim() : null;
    this.updatedAt = new Date();
    return this;
  }

  cancel(cancellerId: string, reason?: string): SystemRequest {
    if (this.status !== 'PENDING') {
      throw new Error(`Cannot cancel request with status '${this.status}'; must be 'PENDING'`);
    }
    const cleanCancellerId = requireNonEmptyString(cancellerId, 'cancellerId');
    if (cleanCancellerId !== this.employeeId) {
      throw new Error(`Only the request author (employee '${this.employeeId}') can cancel this request`);
    }

    this.status = 'CANCELLED';
    if (reason && reason.trim().length > 0) {
      this.reviewNote = reason.trim();
    }
    this.updatedAt = new Date();
    return this;
  }

  toRow(): SystemRequestRow {
    return {
      id: this.id,
      employee_id: this.employeeId,
      title: this.title,
      type: this.type,
      reason: this.reason,
      status: this.status,
      reviewed_by: this.reviewedBy,
      reviewed_at: this.reviewedAt ? this.reviewedAt.toISOString() : null,
      review_note: this.reviewNote,
      created_at: this.createdAt.toISOString(),
      updated_at: this.updatedAt.toISOString(),

      leave_type: this.leaveType,
      leave_start_date: this.leaveStartDate,
      leave_end_date: this.leaveEndDate,
      leave_days_count: this.leaveDaysCount,

      explanation_date: this.explanationDate,
      actual_check_in: this.actualCheckIn,
      actual_check_out: this.actualCheckOut,

      ot_date: this.otDate,
      ot_start_time: this.otStartTime,
      ot_end_time: this.otEndTime,
      ot_hours: this.otHours,

      advance_amount:
        this.advanceAmount !== null && this.advanceAmount !== undefined
          ? typeof this.advanceAmount === 'bigint'
            ? this.advanceAmount.toString()
            : this.advanceAmount
          : null,
      advance_period: this.advancePeriod,

      change_start_date: this.changeStartDate,
      change_end_date: this.changeEndDate,
      new_shift_type: this.newShiftType,
      new_start_time: this.newStartTime,
      new_end_time: this.newEndTime
    };
  }

  toMakeupSlotRows(): MakeupSlotRow[] {
    return this.makeupSlots.map(slot => ({
      request_id: this.id,
      work_date: slot.date,
      start_time: slot.startTime,
      end_time: slot.endTime,
      work_minutes: slot.workMinutes
    }));
  }

  toExplanationCaseRows(): ExplanationCaseRow[] {
    return this.explanationCases.map(code => ({ request_id: this.id, case_code: code }));
  }

  static fromRow(
    row: any,
    isat: IsatRegistration | null = null,
    children: { makeupSlots?: MakeupSlot[]; explanationCases?: ExplanationCase[] } = {}
  ): SystemRequest {
    if (!row || typeof row !== 'object') {
      throw new Error('row must be an object');
    }

    const parseDate = (val: any): Date | null => {
      if (!val) return null;
      if (val instanceof Date) return val;
      const d = new Date(val);
      return isNaN(d.getTime()) ? null : d;
    };

    const formatDateStr = (val: any): string | null => (val ? toDateText(val) : null);

    let advanceAmount: bigint | number | null = null;
    const rawAdv = row.advance_amount ?? row.advanceAmount;
    if (rawAdv !== undefined && rawAdv !== null) {
      advanceAmount = typeof rawAdv === 'string' ? BigInt(rawAdv) : rawAdv;
    }

    const leaveDaysCount =
      row.leave_days_count !== undefined
        ? row.leave_days_count !== null
          ? Number(row.leave_days_count)
          : null
        : row.leaveDaysCount !== undefined && row.leaveDaysCount !== null
          ? Number(row.leaveDaysCount)
          : null;

    const otHours =
      row.ot_hours !== undefined
        ? row.ot_hours !== null
          ? Number(row.ot_hours)
          : null
        : row.otHours !== undefined && row.otHours !== null
          ? Number(row.otHours)
          : null;

    return new SystemRequest({
      id: row.id,
      employeeId: row.employee_id ?? row.employeeId,
      title: row.title,
      type: row.type,
      reason: row.reason,
      status: row.status,
      reviewedBy: row.reviewed_by ?? row.reviewedBy ?? null,
      reviewedAt: parseDate(row.reviewed_at ?? row.reviewedAt),
      reviewNote: row.review_note ?? row.reviewNote ?? null,
      createdAt: parseDate(row.created_at ?? row.createdAt) ?? new Date(),
      updatedAt: parseDate(row.updated_at ?? row.updatedAt) ?? new Date(),

      leaveType: row.leave_type ?? row.leaveType ?? null,
      leaveStartDate: formatDateStr(row.leave_start_date ?? row.leaveStartDate),
      leaveEndDate: formatDateStr(row.leave_end_date ?? row.leaveEndDate),
      leaveDaysCount,
      makeupSlots: children.makeupSlots ?? [],

      explanationDate: formatDateStr(row.explanation_date ?? row.explanationDate),
      explanationCases: children.explanationCases ?? [],
      actualCheckIn: row.actual_check_in ?? row.actualCheckIn ?? null,
      actualCheckOut: row.actual_check_out ?? row.actualCheckOut ?? null,

      otDate: formatDateStr(row.ot_date ?? row.otDate),
      otStartTime: row.ot_start_time ?? row.otStartTime ?? null,
      otEndTime: row.ot_end_time ?? row.otEndTime ?? null,
      otHours,

      advanceAmount,
      advancePeriod: row.advance_period ?? row.advancePeriod ?? null,

      changeStartDate: formatDateStr(row.change_start_date ?? row.changeStartDate),
      changeEndDate: formatDateStr(row.change_end_date ?? row.changeEndDate),
      newShiftType: row.new_shift_type ?? row.newShiftType ?? null,
      newStartTime: row.new_start_time ?? row.newStartTime ?? null,
      newEndTime: row.new_end_time ?? row.newEndTime ?? null,

      isat
    });
  }

  toJSON(): SystemRequestDTO {
    return {
      id: this.id,
      employeeId: this.employeeId,
      title: this.title,
      type: this.type,
      reason: this.reason,
      status: this.status,
      reviewedBy: this.reviewedBy,
      reviewedAt: this.reviewedAt ? this.reviewedAt.toISOString() : null,
      reviewNote: this.reviewNote,
      createdAt: this.createdAt.toISOString(),
      updatedAt: this.updatedAt.toISOString(),

      leaveType: this.leaveType,
      leaveStartDate: this.leaveStartDate,
      leaveEndDate: this.leaveEndDate,
      leaveDaysCount: this.leaveDaysCount,
      owedMinutes:
        this.type === 'LEAVE_WITH_MAKEUP' && this.leaveDaysCount !== null
          ? OWED_MINUTES_PER_LEAVE_DAY * this.leaveDaysCount
          : null,
      makeupSlots: this.makeupSlots.map(slot => ({ ...slot })),

      explanationDate: this.explanationDate,
      explanationCases: [...this.explanationCases],
      actualCheckIn: this.actualCheckIn,
      actualCheckOut: this.actualCheckOut,

      otDate: this.otDate,
      otStartTime: this.otStartTime,
      otEndTime: this.otEndTime,
      otHours: this.otHours,

      advanceAmount:
        this.advanceAmount !== null && this.advanceAmount !== undefined
          ? typeof this.advanceAmount === 'bigint'
            ? Number(this.advanceAmount)
            : this.advanceAmount
          : null,
      advancePeriod: this.advancePeriod,

      changeStartDate: this.changeStartDate,
      changeEndDate: this.changeEndDate,
      newShiftType: this.newShiftType,
      newStartTime: this.newStartTime,
      newEndTime: this.newEndTime,

      isat: this.isat ? this.isat.toJSON() : null
    };
  }
}

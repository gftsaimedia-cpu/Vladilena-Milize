import { Injectable, Optional, Inject } from '@nestjs/common';
import { TransactionCoordinator } from '../../database';
import {
  SystemRequest,
  RequestType,
  RequestStatus,
  LeaveType,
  SystemRequestDTO
} from './domain';
import { RequestsRepository, RequestListFilter } from './requests.repository';
import { AttendanceRepository } from '../attendance/attendance.repository';
import { businessMonthText } from '../../common/business-date';

export interface CreateLeaveInput {
  employeeId: string;
  title: string;
  reason: string;
  leaveType: LeaveType;
  startDate: string;
  endDate: string;
  daysCount: number;
}

export interface CreateShiftChangeInput {
  employeeId: string;
  title: string;
  reason: string;
  changeDate: string;
  newShiftType: string;
  newStartTime: string;
  newEndTime: string;
}

export interface CreateLeaveWithMakeupInput {
  employeeId: string;
  title: string;
  reason: string;
  leaveDate: string;
  makeupDate: string;
  makeupStartTime: string;
  makeupEndTime: string;
}

export interface CreateOvertimeInput {
  employeeId: string;
  title: string;
  reason: string;
  targetDate?: string;
  otDate?: string;
  startTime?: string;
  endTime?: string;
  otHours?: number;
  hours?: number;
}

export interface CreateAdvanceInput {
  employeeId: string;
  title: string;
  reason: string;
  amount: number | bigint;
  period?: string;
}

export interface CreateExplanationInput {
  employeeId: string;
  title: string;
  reason: string;
  workDate: string;
  actualCheckIn?: string | null;
  actualCheckOut?: string | null;
}

export interface CreateIsatInput {
  employeeId: string;
  saturday?: unknown;
  team?: unknown;
  conditions?: unknown;
}

@Injectable()
export class RequestsService {
  constructor(
    @Inject(RequestsRepository) private readonly repo: RequestsRepository,
    @Optional() @Inject(AttendanceRepository) private readonly attendanceRepo?: AttendanceRepository,
    @Optional() @Inject(TransactionCoordinator) private readonly txCoordinator?: TransactionCoordinator,
  ) {}

  async createLeaveRequest(input: CreateLeaveInput): Promise<SystemRequestDTO> {
    const req = SystemRequest.createLeaveRequest({
      employeeId: input.employeeId,
      title: input.title,
      reason: input.reason,
      leaveType: input.leaveType,
      startDate: input.startDate,
      endDate: input.endDate,
      daysCount: input.daysCount
    });

    // Chống trùng lặp thời gian nghỉ phép với các đơn đang chờ hoặc đã duyệt
    const existingLeaves = await this.repo.list({
      employeeId: input.employeeId,
      type: 'LEAVE'
    });
    const start = req.leaveStartDate!;
    const end = req.leaveEndDate!;
    for (const item of existingLeaves) {
      if (item.status === 'PENDING' || item.status === 'APPROVED') {
        const itemStart = item.leaveStartDate!;
        const itemEnd = item.leaveEndDate || itemStart;
        if (start <= itemEnd && end >= itemStart) {
          throw new Error(`Đã có đơn nghỉ phép trùng trong khoảng thời gian ${start} đến ${end}`);
        }
      }
    }

    await this.repo.save(req);
    return req.toJSON();
  }

  async createShiftChangeRequest(input: CreateShiftChangeInput): Promise<SystemRequestDTO> {
    const req = SystemRequest.createShiftChangeRequest({
      employeeId: input.employeeId,
      title: input.title,
      reason: input.reason,
      changeDate: input.changeDate,
      newShiftType: input.newShiftType,
      newStartTime: input.newStartTime,
      newEndTime: input.newEndTime
    });

    await this.repo.save(req);
    return req.toJSON();
  }

  async createLeaveWithMakeupRequest(input: CreateLeaveWithMakeupInput): Promise<SystemRequestDTO> {
    const req = SystemRequest.createLeaveWithMakeupRequest({
      employeeId: input.employeeId,
      title: input.title,
      reason: input.reason,
      leaveDate: input.leaveDate,
      makeupDate: input.makeupDate,
      makeupStartTime: input.makeupStartTime,
      makeupEndTime: input.makeupEndTime
    });

    await this.repo.save(req);
    return req.toJSON();
  }

  async createOvertimeRequest(input: CreateOvertimeInput): Promise<SystemRequestDTO> {
    const otDate = input.otDate || input.targetDate || '';
    const hours = input.hours ?? input.otHours ?? 0;

    // 1. Trần giờ ngày: ca chính (8h) + OT tối đa 12h/ngày -> giờ OT tối đa 4h/ngày
    if (hours > 4) {
      throw new Error(`Giờ làm thêm một ngày không được vượt quá 4 giờ (tổng giờ làm việc ngày không quá 12 giờ)`);
    }

    // 2. Chống trùng ngày đăng ký làm thêm
    const existingOt = await this.repo.list({
      employeeId: input.employeeId,
      type: 'OVERTIME'
    });
    for (const item of existingOt) {
      if ((item.status === 'PENDING' || item.status === 'APPROVED') && item.otDate === otDate) {
        throw new Error(`Đã có đơn làm thêm giờ vào ngày ${otDate}`);
      }
    }

    // 3. Trần OT tháng: tối đa 40 giờ theo Điều 107 Bộ luật Lao động
    const month = otDate.slice(0, 7);
    let totalMonthOt = 0;
    for (const item of existingOt) {
      if ((item.status === 'PENDING' || item.status === 'APPROVED') && item.otDate?.startsWith(month)) {
        totalMonthOt += item.otHours || 0;
      }
    }
    if (totalMonthOt + hours > 40) {
      throw new Error(`Tổng số giờ làm thêm trong tháng ${month} không được vượt quá 40 giờ theo Luật Lao động (đã có ${totalMonthOt}h, đăng ký thêm ${hours}h)`);
    }

    let startTime = input.startTime;
    let endTime = input.endTime;

    if (!startTime && !endTime) {
      startTime = '18:00';
      const startH = 18;
      const endH = Math.min(23, Math.round(startH + hours));
      endTime = `${String(endH).padStart(2, '0')}:00`;
    } else if (startTime && !endTime) {
      const [h, m] = startTime.split(':').map(Number);
      const endH = Math.min(23, Math.round(h + hours));
      endTime = `${String(endH).padStart(2, '0')}:${String(m || 0).padStart(2, '0')}`;
    } else if (!startTime && endTime) {
      const [h, m] = endTime.split(':').map(Number);
      const startH = Math.max(0, Math.round(h - hours));
      startTime = `${String(startH).padStart(2, '0')}:${String(m || 0).padStart(2, '0')}`;
    }

    const req = SystemRequest.createOvertimeRequest({
      employeeId: input.employeeId,
      title: input.title,
      reason: input.reason,
      otDate,
      startTime: startTime || '',
      endTime: endTime || '',
      hours
    });

    await this.repo.save(req);
    return req.toJSON();
  }

  async createAdvanceRequest(input: CreateAdvanceInput): Promise<SystemRequestDTO> {
    const period = input.period || businessMonthText();
    const req = SystemRequest.createAdvanceRequest({
      employeeId: input.employeeId,
      title: input.title,
      reason: input.reason,
      amount: input.amount,
      period
    });

    await this.repo.save(req);
    return req.toJSON();
  }

  async createExplanationRequest(input: CreateExplanationInput): Promise<SystemRequestDTO> {
    const req = SystemRequest.createExplanationRequest({
      employeeId: input.employeeId,
      title: input.title,
      reason: input.reason,
      workDate: input.workDate,
      actualCheckIn: input.actualCheckIn,
      actualCheckOut: input.actualCheckOut
    });

    await this.repo.save(req);
    return req.toJSON();
  }

  async createIsatRequest(input: CreateIsatInput): Promise<SystemRequestDTO> {
    const profile = await this.repo.findIsatProfile(input.employeeId, businessMonthText());
    if (!profile) {
      throw new Error(`Không tìm thấy nhân sự: ${input.employeeId}`);
    }
    if (!profile.isatEnabled) {
      throw new Error('iSAT chỉ áp dụng cho nhóm Nhân viên');
    }

    // Đơn lưu theo uuid của nhân sự (input có thể là username); domain kiểm tra form và tự REJECT khi chưa đạt đủ điều kiện
    const req = SystemRequest.createIsatRequest({
      employeeId: profile.employeeId,
      saturday: input.saturday,
      team: input.team,
      conditions: input.conditions,
      profile: profile.snapshot
    });

    // Chống trùng Thứ Bảy với các đơn đang chờ hoặc đã duyệt (đơn đã bị từ chối không chặn)
    const saturday = req.isat!.saturday;
    const existing = await this.repo.list({
      employeeId: profile.employeeId,
      type: 'ISAT'
    });
    for (const item of existing) {
      if ((item.status === 'PENDING' || item.status === 'APPROVED') && item.isat?.saturday === saturday) {
        const [year, month, day] = saturday.split('-');
        throw new Error(`Đã có đơn iSAT cho Thứ Bảy ${day}/${month}/${year}`);
      }
    }

    await this.repo.save(req);
    return req.toJSON();
  }

  async reviewRequest(
    id: string,
    reviewerId: string,
    action: 'APPROVE' | 'REJECT',
    note?: string
  ): Promise<SystemRequestDTO> {
    const doReview = async () => {
      const req = await this.repo.findById(id);
      if (!req) {
        throw new Error(`Request with id '${id}' not found`);
      }

      if (action === 'APPROVE') {
        // Đơn iSAT mất dòng đăng ký thì không biết Thứ Bảy nào để ghi lịch: báo lỗi trước khi đổi trạng thái
        if (req.type === 'ISAT' && req.isat === null) {
          throw new Error(`Đơn iSAT thiếu dữ liệu đăng ký: ${req.id}`);
        }
        req.approve(reviewerId, note);

        if (this.attendanceRepo) {
          // Duyệt OT không ghi lịch (§7); khung bù của đơn nghỉ có làm bù cũng không ghi vào lịch.
          if (req.type === 'SHIFT_CHANGE') {
            const date = req.changeStartDate;
            if (date) {
              const sched = await this.attendanceRepo.ensureDefaultSchedule(req.employeeId, date);
              const updated = sched.withShiftChange(req.newShiftType as any, req.newStartTime!, req.newEndTime!, req.id);
              await this.attendanceRepo.saveSchedule(updated);
            }
          } else if (req.type === 'LEAVE' || req.type === 'LEAVE_WITH_MAKEUP') {
            const start = req.leaveStartDate;
            const end = req.leaveEndDate || start;
            if (start) {
              let cur = new Date(`${start}T00:00:00.000Z`);
              const endDate = new Date(`${end}T00:00:00.000Z`);
              while (cur.getTime() <= endDate.getTime()) {
                const curStr = cur.toISOString().slice(0, 10);
                const sched = await this.attendanceRepo.ensureDefaultSchedule(req.employeeId, curStr);
                await this.attendanceRepo.saveSchedule(sched.withLeave(req.id));
                cur = new Date(cur.getTime() + 86400000);
              }
            }
          } else if (req.type === 'ISAT' && req.isat) {
            const sched = await this.attendanceRepo.ensureDefaultSchedule(req.employeeId, req.isat.saturday);
            await this.attendanceRepo.saveSchedule(sched.withIsat(req.id));
          } else if (req.type === 'EXPLANATION') {
            const workDate = req.explanationDate;
            if (workDate) {
              await this.attendanceRepo.updateDayStatus(req.employeeId, workDate, 'VALID');
            }
          }
        }
      } else if (action === 'REJECT') {
        req.reject(reviewerId, note);
      } else {
        throw new Error(`Invalid review action '${action}'; must be 'APPROVE' or 'REJECT'`);
      }

      await this.repo.save(req);
      return req.toJSON();
    };

    if (this.txCoordinator) {
      return await this.txCoordinator.withLock(`request_${id}`, doReview);
    }
    return await doReview();
  }

  async cancelRequest(id: string, employeeId: string, reason?: string): Promise<SystemRequestDTO> {
    const req = await this.repo.findById(id);
    if (!req) {
      throw new Error(`Request with id '${id}' not found`);
    }

    // Đơn iSAT lưu theo uuid còn phiên đăng nhập gửi username: đổi sang uuid khi trùng tác giả, người lạ vẫn bị từ chối.
    let cancellerId = employeeId;
    if (employeeId !== req.employeeId) {
      const uuid = await this.repo.resolveStaffUuid(employeeId);
      if (uuid === req.employeeId) cancellerId = uuid;
    }

    req.cancel(cancellerId, reason);
    await this.repo.save(req);
    return req.toJSON();
  }

  async getById(id: string): Promise<SystemRequestDTO | null> {
    const req = await this.repo.findById(id);
    return req ? req.toJSON() : null;
  }

  async listRequests(filter: RequestListFilter = {}): Promise<{ items: SystemRequestDTO[]; total: number }> {
    // Đơn iSAT lưu theo uuid, các loại khác có thể lưu theo username: lọc theo cả hai khi biết uuid của nhân sự.
    const { employeeId, ...rest } = filter;
    const scoped: RequestListFilter = employeeId ? { ...rest, employeeIds: await this.employeeIdsFor(employeeId) } : filter;

    const [items, total] = await Promise.all([
      this.repo.list(scoped),
      this.repo.count({
        employeeId: scoped.employeeId,
        employeeIds: scoped.employeeIds,
        type: scoped.type,
        status: scoped.status
      })
    ]);

    return {
      items: items.map(r => r.toJSON()),
      total
    };
  }

  private async employeeIdsFor(employeeId: string): Promise<string[]> {
    const uuid = await this.repo.resolveStaffUuid(employeeId);
    return [...new Set([employeeId, uuid].filter((id): id is string => !!id))];
  }
}

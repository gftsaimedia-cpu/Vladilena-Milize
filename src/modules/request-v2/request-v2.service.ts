import { Injectable } from '@nestjs/common';
import {
  SystemRequest,
  RequestType,
  RequestStatus,
  LeaveType,
  CorrectionPunchType,
  SystemRequestDTO
} from '../../domain/request-v2';
import { RequestV2Repository, RequestListFilter } from '../../data/request-v2.repository';

export interface CreateLeaveInput {
  employeeId: string;
  title: string;
  reason: string;
  leaveType: LeaveType;
  startDate: string;
  endDate: string;
  daysCount: number;
}

export interface CreateCorrectionInput {
  employeeId: string;
  title: string;
  reason: string;
  targetDate?: string;
  correctionDate?: string;
  punchType?: CorrectionPunchType;
  actualTime?: string;
  correctedCheckIn?: Date | string | null;
  correctedCheckOut?: Date | string | null;
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

function formatTimeToHHmm(val: Date | string): string {
  if (typeof val === 'string') {
    const trimmed = val.trim();
    if (/^([01]\d|2[0-3]):[0-5]\d$/.test(trimmed)) {
      return trimmed;
    }
    const d = new Date(trimmed);
    if (!isNaN(d.getTime())) {
      const hh = String(d.getUTCHours()).padStart(2, '0');
      const mm = String(d.getUTCMinutes()).padStart(2, '0');
      return `${hh}:${mm}`;
    }
    return trimmed;
  }
  if (val instanceof Date && !isNaN(val.getTime())) {
    const hh = String(val.getUTCHours()).padStart(2, '0');
    const mm = String(val.getUTCMinutes()).padStart(2, '0');
    return `${hh}:${mm}`;
  }
  return '';
}

@Injectable()
export class RequestV2Service {
  constructor(private readonly repo: RequestV2Repository) {}

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

    await this.repo.save(req);
    return req.toJSON();
  }

  async createCorrectionRequest(input: CreateCorrectionInput): Promise<SystemRequestDTO> {
    const correctionDate = input.correctionDate || input.targetDate || '';
    let punchType: CorrectionPunchType = input.punchType as CorrectionPunchType;
    let actualTime: string = input.actualTime || '';

    if (!punchType && input.correctedCheckIn != null) {
      punchType = 'IN';
      actualTime = formatTimeToHHmm(input.correctedCheckIn);
    } else if (!punchType && input.correctedCheckOut != null) {
      punchType = 'OUT';
      actualTime = formatTimeToHHmm(input.correctedCheckOut);
    }

    const req = SystemRequest.createCorrectionRequest({
      employeeId: input.employeeId,
      title: input.title,
      reason: input.reason,
      correctionDate,
      punchType,
      actualTime
    });

    await this.repo.save(req);
    return req.toJSON();
  }

  async createOvertimeRequest(input: CreateOvertimeInput): Promise<SystemRequestDTO> {
    const otDate = input.otDate || input.targetDate || '';
    const hours = input.hours ?? input.otHours ?? 0;
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
    const period = input.period || new Date().toISOString().slice(0, 7);
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

  async reviewRequest(
    id: string,
    reviewerId: string,
    action: 'APPROVE' | 'REJECT',
    note?: string
  ): Promise<SystemRequestDTO> {
    const req = await this.repo.findById(id);
    if (!req) {
      throw new Error(`Request with id '${id}' not found`);
    }

    if (action === 'APPROVE') {
      req.approve(reviewerId, note);
    } else if (action === 'REJECT') {
      req.reject(reviewerId, note);
    } else {
      throw new Error(`Invalid review action '${action}'; must be 'APPROVE' or 'REJECT'`);
    }

    await this.repo.save(req);
    return req.toJSON();
  }

  async cancelRequest(id: string, employeeId: string, reason?: string): Promise<SystemRequestDTO> {
    const req = await this.repo.findById(id);
    if (!req) {
      throw new Error(`Request with id '${id}' not found`);
    }

    req.cancel(employeeId, reason);
    await this.repo.save(req);
    return req.toJSON();
  }

  async getById(id: string): Promise<SystemRequestDTO | null> {
    const req = await this.repo.findById(id);
    return req ? req.toJSON() : null;
  }

  async listRequests(filter: RequestListFilter = {}): Promise<{ items: SystemRequestDTO[]; total: number }> {
    const [items, total] = await Promise.all([
      this.repo.list(filter),
      this.repo.count({
        employeeId: filter.employeeId,
        type: filter.type,
        status: filter.status
      })
    ]);

    return {
      items: items.map(r => r.toJSON()),
      total
    };
  }
}

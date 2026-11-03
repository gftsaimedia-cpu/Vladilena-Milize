import { Controller, Get, Post, Put, Patch, Delete, Inject, Param } from '@nestjs/common';
import { AUTH } from '../../core/tokens';
import { Ctx, ApiContext } from '../../http/api-context';
import { EmployeeV2Service } from './employee-v2.service';
import { Position } from '../../domain/employee-v2/position';
import { Shift, ShiftType } from '../../domain/employee-v2/shift';
import { Leave } from '../../domain/employee-v2/leave';

const { HttpError, readJson } = require('../../platform/http');

@Controller('api/v2/employees')
export class EmployeeV2Controller {
  constructor(
    @Inject(EmployeeV2Service) private readonly service: EmployeeV2Service,
    @Inject(AUTH) private readonly auth: any
  ) {}

  @Get()
  async listEmployees(@Ctx() c: ApiContext): Promise<unknown> {
    const shiftType = c.url.searchParams.get('shiftType') || undefined;
    const status = c.url.searchParams.get('status') || undefined;
    const q = c.url.searchParams.get('q') || undefined;

    const employees = await this.service.list({ shiftType, status, q });
    return { employees: employees.map(e => e.toDTO()) };
  }

  @Get(':username')
  async getEmployee(@Ctx() c: ApiContext, @Param('username') paramUser?: string): Promise<unknown> {
    const username = paramUser || c.seg[3];
    const employee = await this.service.findByUsernameOrUuid(username);
    if (!employee) {
      throw new HttpError(404, 'Không tìm thấy nhân viên', { code: 'EMPLOYEE_NOT_FOUND' });
    }
    return { employee: employee.toDTO() };
  }

  @Post()
  async createEmployee(@Ctx() c: ApiContext): Promise<unknown> {
    const body = (await readJson(c.req)) || {};
    let employee: any;
    try {
      employee = this.service.buildEmployeeFromInput(body);
    } catch (err: any) {
      throw new HttpError(400, err.message, { code: 'BAD_EMPLOYEE_INPUT' });
    }
    await this.service.save(employee, c.me?.username || 'system');
    return { created: true, employee: employee.toDTO() };
  }

  @Put(':username')
  async putEmployee(@Ctx() c: ApiContext, @Param('username') paramUser?: string): Promise<unknown> {
    const username = paramUser || c.seg[3];
    const existing = await this.service.findByUsernameOrUuid(username);
    if (!existing) {
      throw new HttpError(404, 'Không tìm thấy nhân viên', { code: 'EMPLOYEE_NOT_FOUND' });
    }
    const body = (await readJson(c.req)) || {};
    let updated: any;
    try {
      updated = this.service.buildEmployeeFromInput({ ...body, username: existing.username }, existing);
    } catch (err: any) {
      throw new HttpError(400, err.message, { code: 'BAD_EMPLOYEE_INPUT' });
    }
    await this.service.save(updated, c.me?.username || 'system');
    return { updated: true, employee: updated.toDTO() };
  }

  @Patch(':username/profile')
  async patchProfile(@Ctx() c: ApiContext, @Param('username') paramUser?: string): Promise<unknown> {
    const username = paramUser || c.seg[3];
    const existing = await this.service.findByUsernameOrUuid(username);
    if (!existing) {
      throw new HttpError(404, 'Không tìm thấy nhân viên', { code: 'EMPLOYEE_NOT_FOUND' });
    }
    const body = (await readJson(c.req)) || {};
    let updated: any;
    try {
      const patch = { ...body };
      if (
        patch.fullName !== undefined &&
        patch.familyName === undefined &&
        patch.givenName === undefined &&
        patch.name === undefined
      ) {
        patch.name = patch.fullName;
      }
      updated = existing.updateProfile(patch);
    } catch (err: any) {
      throw new HttpError(400, err.message, { code: 'BAD_EMPLOYEE_INPUT' });
    }
    await this.service.save(updated, c.me?.username || 'system');
    return { updated: true, employee: updated.toDTO() };
  }

  @Patch(':username/account')
  async patchAccount(@Ctx() c: ApiContext, @Param('username') paramUser?: string): Promise<unknown> {
    const username = paramUser || c.seg[3];
    const existing = await this.service.findByUsernameOrUuid(username);
    if (!existing) {
      throw new HttpError(404, 'Không tìm thấy nhân viên', { code: 'EMPLOYEE_NOT_FOUND' });
    }
    const body = (await readJson(c.req)) || {};
    const patch: any = {};
    if (body.password) {
      patch.passwordHash = this.auth.hashPassword(body.password);
    } else if (body.passwordHash) {
      patch.passwordHash = body.passwordHash;
    }
    if (body.roles !== undefined) {
      patch.roles = body.roles;
    }
    if (body.isLocked !== undefined) {
      patch.isLocked = Boolean(body.isLocked);
      if (body.isLocked) {
        patch.lockedAt = body.lockedAt || new Date().toISOString();
        patch.lockedBy = body.lockedBy || c.me?.username || 'system';
      } else {
        patch.lockedAt = null;
        patch.lockedBy = null;
      }
    }
    let updated: any;
    try {
      updated = existing.updateAccount(patch);
    } catch (err: any) {
      throw new HttpError(400, err.message, { code: 'BAD_EMPLOYEE_INPUT' });
    }
    await this.service.save(updated, c.me?.username || 'system');
    return { updated: true, employee: updated.toDTO() };
  }

  @Patch(':username/contract')
  async patchContract(@Ctx() c: ApiContext, @Param('username') paramUser?: string): Promise<unknown> {
    const username = paramUser || c.seg[3];
    const existing = await this.service.findByUsernameOrUuid(username);
    if (!existing) {
      throw new HttpError(404, 'Không tìm thấy nhân viên', { code: 'EMPLOYEE_NOT_FOUND' });
    }
    const body = (await readJson(c.req)) || {};
    let updated: any;
    try {
      updated = existing.updateContract(body);
    } catch (err: any) {
      throw new HttpError(400, err.message, { code: 'BAD_EMPLOYEE_INPUT' });
    }
    await this.service.save(updated, c.me?.username || 'system');
    return { updated: true, employee: updated.toDTO() };
  }

  @Patch(':username/position')
  async patchPosition(@Ctx() c: ApiContext, @Param('username') paramUser?: string): Promise<unknown> {
    const username = paramUser || c.seg[3];
    const existing = await this.service.findByUsernameOrUuid(username);
    if (!existing) {
      throw new HttpError(404, 'Không tìm thấy nhân viên', { code: 'EMPLOYEE_NOT_FOUND' });
    }
    const body = (await readJson(c.req)) || {};
    let updated: any;
    try {
      const pos = new Position({
        type: body.type ?? existing.contract.position.type,
        level: body.level ?? existing.contract.position.level,
        jobTitle: body.jobTitle !== undefined ? body.jobTitle : existing.contract.position.jobTitle
      });
      updated = existing.changePosition({
        type: pos.type,
        level: pos.level,
        jobTitle: pos.jobTitle
      });
    } catch (err: any) {
      throw new HttpError(400, err.message, { code: 'BAD_EMPLOYEE_INPUT' });
    }
    await this.service.save(updated, c.me?.username || 'system');
    return { updated: true, employee: updated.toDTO() };
  }

  @Patch(':username/shift')
  async patchShift(@Ctx() c: ApiContext, @Param('username') paramUser?: string): Promise<unknown> {
    const username = paramUser || c.seg[3];
    const existing = await this.service.findByUsernameOrUuid(username);
    if (!existing) {
      throw new HttpError(404, 'Không tìm thấy nhân viên', { code: 'EMPLOYEE_NOT_FOUND' });
    }
    const body = (await readJson(c.req)) || {};
    let updated: any;
    try {
      const nextType = (body.type ?? existing.contract.shift.type) as ShiftType;
      let nextAllowance = body.allowancePct;
      if (nextAllowance === undefined) {
        if (body.type !== undefined && body.type !== existing.contract.shift.type) {
          nextAllowance = undefined;
        } else {
          nextAllowance = existing.contract.shift.allowancePct;
        }
      }
      const shift = new Shift({
        type: nextType,
        startTime: body.startTime ?? existing.contract.shift.startTime,
        endTime: body.endTime ?? existing.contract.shift.endTime,
        allowancePct: nextAllowance
      });
      updated = existing.changeShift({
        type: shift.type,
        startTime: shift.startTime,
        endTime: shift.endTime,
        allowancePct: shift.allowancePct
      });
    } catch (err: any) {
      throw new HttpError(400, err.message, { code: 'BAD_EMPLOYEE_INPUT' });
    }
    await this.service.save(updated, c.me?.username || 'system');
    return { updated: true, employee: updated.toDTO() };
  }

  @Patch(':username/leave')
  async patchLeave(@Ctx() c: ApiContext, @Param('username') paramUser?: string): Promise<unknown> {
    const username = paramUser || c.seg[3];
    const existing = await this.service.findByUsernameOrUuid(username);
    if (!existing) {
      throw new HttpError(404, 'Không tìm thấy nhân viên', { code: 'EMPLOYEE_NOT_FOUND' });
    }
    const body = (await readJson(c.req)) || {};
    let updated: any;
    try {
      if (body.useDays !== undefined) {
        const curLeave = new Leave({
          totalDays: existing.contract.leave.totalDays,
          usedDays: existing.contract.leave.usedDays
        });
        const afterUse = curLeave.useLeave(body.useDays);
        updated = existing.updateLeave({
          totalDays: afterUse.totalDays,
          usedDays: afterUse.usedDays
        });
      } else {
        const lv = new Leave({
          totalDays: body.totalDays ?? existing.contract.leave.totalDays,
          usedDays: body.usedDays ?? existing.contract.leave.usedDays
        });
        updated = existing.updateLeave({
          totalDays: lv.totalDays,
          usedDays: lv.usedDays
        });
      }
    } catch (err: any) {
      throw new HttpError(400, err.message, { code: 'BAD_EMPLOYEE_INPUT' });
    }
    await this.service.save(updated, c.me?.username || 'system');
    return { updated: true, employee: updated.toDTO() };
  }

  @Delete(':username')
  async deleteEmployee(@Ctx() c: ApiContext, @Param('username') paramUser?: string): Promise<unknown> {
    const username = paramUser || c.seg[3];
    const existing = await this.service.findByUsernameOrUuid(username);
    if (!existing) {
      throw new HttpError(404, 'Không tìm thấy nhân viên', { code: 'EMPLOYEE_NOT_FOUND' });
    }
    await this.service.delete(existing.username);
    return { deleted: true, username: existing.username };
  }
}

import { Injectable, Inject } from '@nestjs/common';
import crypto from 'node:crypto';
import { STORE, AUTH } from '../../core/tokens';
import { Employee, EmployeeDTO } from '../../domain/employee-v2/employee';
import { EmployeeProfile } from '../../domain/employee-v2/employee-profile';
import { EmployeeAccount } from '../../domain/employee-v2/employee-account';
import { EmployeeContract } from '../../domain/employee-v2/employee-contract';
import { PersonName } from '../../domain/employee-v2/person-name';
import { Position } from '../../domain/employee-v2/position';
import { Shift, ShiftType } from '../../domain/employee-v2/shift';
import { Leave } from '../../domain/employee-v2/leave';
import { ContractStatus } from '../../domain/employee-v2/types';

@Injectable()
export class EmployeeV2Service {
  constructor(
    @Inject(STORE) private readonly store: any,
    @Inject(AUTH) private readonly auth: any
  ) {}

  rowToEmployee(row: any, activeRoles: string[]): Employee {
    const rawShiftType = (row.shift_type || '').toUpperCase();
    const shiftType: ShiftType = ['NORMAL', 'FLEX', 'NIGHT'].includes(rawShiftType)
      ? (rawShiftType as ShiftType)
      : 'NORMAL';

    let allowancePct = 0;
    if (shiftType === 'NORMAL') {
      allowancePct = 0;
    } else if (shiftType === 'FLEX') {
      allowancePct = 10;
    } else {
      const pct = row.shift_allowance_pct != null ? Number(row.shift_allowance_pct) : 30;
      allowancePct = [30, 40, 60].includes(pct) ? pct : 30;
    }

    const shiftStartTime = row.shift_start_time || (shiftType === 'NIGHT' ? '21:00' : '08:00');
    const shiftEndTime = row.shift_end_time || (shiftType === 'NIGHT' ? '06:00' : '17:00');

    const totalDays =
      row.leave_total_days != null
        ? Number(row.leave_total_days)
        : row.leave_balance != null
          ? Number(row.leave_balance)
          : 0;
    const usedDays = row.leave_used_days != null ? Number(row.leave_used_days) : 0;

    let contractStatus: ContractStatus = 'nv';
    if (row.contract_status === 'probation') {
      contractStatus = 'thuviec';
    } else if (row.contract_status === 'official') {
      contractStatus = 'nv';
    } else if (['tts', 'ctv', 'thuviec', 'nv', 'nghiviec'].includes(row.contract_status)) {
      contractStatus = row.contract_status as ContractStatus;
    } else if (['tts', 'ctv', 'thuviec', 'nv', 'nghiviec'].includes(row.type)) {
      contractStatus = row.type as ContractStatus;
    }

    return new Employee({
      profile: new EmployeeProfile({
        uuid: row.uuid || undefined,
        name: {
          familyName: row.family_name || undefined,
          givenName: row.given_name || undefined,
          fullName: row.name || undefined
        },
        birthday: row.birthday || null,
        dependants: Number(row.dependants) || 0
      }),
      account: new EmployeeAccount({
        username: row.username,
        passwordHash: row.pass_hash,
        roles: activeRoles.length > 0 ? activeRoles : [row.role || 'staff'],
        isLocked: Boolean(row.locked_at),
        lockedAt: row.locked_at || null,
        lockedBy: row.locked_by || null,
        createdAt: row.created_at || new Date().toISOString()
      }),
      contract: new EmployeeContract({
        position: new Position({
          type: row.type || 'nv',
          level: Number(row.level) || 1,
          jobTitle: row.job_title || null
        }),
        shift: new Shift({
          type: shiftType,
          startTime: shiftStartTime,
          endTime: shiftEndTime,
          allowancePct
        }),
        leave: new Leave({
          totalDays,
          usedDays
        }),
        status: contractStatus,
        effectiveFrom: row.start_date || null,
        endDate: row.contract || null,
        resignedOn: row.resigned_on || null,
        hasInsurance: row.insured != null ? Boolean(row.insured) : true,
        isUnionMember: row.deduct_on != null ? Boolean(row.deduct_on) : false,
        hasTax: row.tax_on != null ? Boolean(row.tax_on) : true,
        canAdvance: row.advance_on != null ? Boolean(row.advance_on) : true,
        isDormResident: row.idorm != null ? Boolean(row.idorm) : false
      })
    });
  }

  async findByUsernameOrUuid(identifier: string): Promise<Employee | null> {
    const id = String(identifier || '').trim();
    if (!id) return null;

    const row = await this.store.queryBuilder
      .selectFrom('staff')
      .selectAll()
      .where((eb: any) => eb.or([eb('username', '=', id.toLowerCase()), eb('uuid', '=', id)]))
      .executeTakeFirst();

    if (!row) return null;
    const roles = await this.store.roles.activeRoles(row.username);
    return this.rowToEmployee(row, roles);
  }

  async list(filter?: { shiftType?: string; status?: string; q?: string }): Promise<Employee[]> {
    let query = this.store.queryBuilder.selectFrom('staff').selectAll();

    if (filter?.shiftType) {
      query = query.where('shift_type', '=', filter.shiftType.toUpperCase());
    }
    if (filter?.status) {
      query = query.where('contract_status', '=', filter.status);
    }

    const rows = await query.orderBy('username').execute();
    const employees: Employee[] = [];
    for (const row of rows) {
      const roles = await this.store.roles.activeRoles(row.username);
      const emp = this.rowToEmployee(row, roles);
      if (filter?.q) {
        const q = filter.q.toLowerCase();
        const match =
          emp.username.toLowerCase().includes(q) ||
          emp.fullName.toLowerCase().includes(q) ||
          emp.profile.givenName.toLowerCase().includes(q) ||
          emp.profile.familyName.toLowerCase().includes(q) ||
          emp.uuid.toLowerCase().includes(q);
        if (!match) continue;
      }
      employees.push(emp);
    }
    return employees;
  }

  async save(employee: Employee, by = 'system'): Promise<Employee> {
    const { profile, account, contract } = employee;
    const remainingDays =
      typeof contract.leave.remainingDays === 'function'
        ? contract.leave.remainingDays()
        : Math.max(0, contract.leave.totalDays - contract.leave.usedDays);

    let dbContractStatus: string | null = null;
    if (contract.status === 'thuviec' || (contract.status as string) === 'probation') {
      dbContractStatus = 'probation';
    } else if (contract.status === 'nv' || (contract.status as string) === 'official') {
      dbContractStatus = 'official';
    } else {
      dbContractStatus = null;
    }

    const row = {
      username: account.username,
      uuid: profile.uuid,
      name: profile.fullName,
      family_name: profile.familyName || null,
      given_name: profile.givenName || null,
      birthday: profile.birthday,
      dependants: profile.dependants,
      pass_hash: account.passwordHash,
      role: account.roles[0] || 'staff',
      locked_at: account.lockedAt,
      locked_by: account.lockedBy,
      created_at: account.createdAt,
      type: contract.position.type,
      level: contract.position.level,
      job_title: contract.position.jobTitle,
      shift_type: contract.shift.type,
      shift_start_time: contract.shift.startTime,
      shift_end_time: contract.shift.endTime,
      shift_allowance_pct: contract.shift.allowancePct,
      leave_total_days: contract.leave.totalDays,
      leave_used_days: contract.leave.usedDays,
      leave_balance: remainingDays,
      contract_status: dbContractStatus,
      start_date: contract.effectiveFrom,
      contract: contract.endDate,
      resigned_on: contract.resignedOn,
      insured: contract.hasInsurance ? 1 : 0,
      deduct_on: contract.isUnionMember ? 1 : 0,
      tax_on: contract.hasTax ? 1 : 0,
      advance_on: contract.canAdvance ? 1 : 0,
      idorm: contract.isDormResident ? 1 : 0,
      payroll_subject: contract.status === 'nghiviec' ? 0 : 1
    };

    await this.store.queryBuilder
      .insertInto('staff')
      .values(row)
      .onConflict((oc: any) =>
        oc.column('username').doUpdateSet({
          uuid: row.uuid,
          name: row.name,
          family_name: row.family_name,
          given_name: row.given_name,
          birthday: row.birthday,
          dependants: row.dependants,
          pass_hash: row.pass_hash,
          role: row.role,
          locked_at: row.locked_at,
          locked_by: row.locked_by,
          type: row.type,
          level: row.level,
          job_title: row.job_title,
          shift_type: row.shift_type,
          shift_start_time: row.shift_start_time,
          shift_end_time: row.shift_end_time,
          shift_allowance_pct: row.shift_allowance_pct,
          leave_total_days: row.leave_total_days,
          leave_used_days: row.leave_used_days,
          leave_balance: row.leave_balance,
          contract_status: row.contract_status,
          start_date: row.start_date,
          contract: row.contract,
          resigned_on: row.resigned_on,
          insured: row.insured,
          deduct_on: row.deduct_on,
          tax_on: row.tax_on,
          advance_on: row.advance_on,
          idorm: row.idorm,
          payroll_subject: row.payroll_subject
        })
      )
      .execute();

    if (account.roles && account.roles.length > 0) {
      const currentRoles = await this.store.roles.activeRoles(account.username);
      const targetRoles = [...account.roles];
      for (const r of currentRoles) {
        if (!targetRoles.includes(r)) {
          await this.store.roles.revoke(account.username, r);
        }
      }
      for (const r of targetRoles) {
        if (!currentRoles.includes(r)) {
          await this.store.roles.grant(account.username, r, by || 'admin');
        }
      }
    }

    return employee;
  }

  async delete(username: string): Promise<boolean> {
    await this.store.queryBuilder
      .updateTable('staff_roles')
      .set({ revoked_at: new Date().toISOString() })
      .where('username', '=', username)
      .where('revoked_at', 'is', null)
      .execute();
    const res = await this.store.queryBuilder.deleteFrom('staff').where('username', '=', username).executeTakeFirst();
    return Number(res.numDeletedRows) > 0;
  }

  buildEmployeeFromInput(body: any, existing?: Employee): Employee {
    const rawUsername = body.account?.username || body.username || existing?.username;
    if (!rawUsername) {
      throw new Error('Username must be non-empty');
    }
    const username = String(rawUsername).trim().toLowerCase();

    let passwordHash = existing?.account.passwordHash || '';
    if (body.account?.password || body.password) {
      passwordHash = this.auth.hashPassword(body.account?.password || body.password);
    } else if (body.account?.passwordHash || body.passwordHash) {
      passwordHash = body.account?.passwordHash || body.passwordHash;
    } else if (!passwordHash) {
      passwordHash = this.auth.hashPassword(crypto.randomBytes(16).toString('hex'));
    }

    const roles =
      body.account?.roles || body.roles || (existing?.account.roles ? [...existing.account.roles] : ['staff']);

    const isLocked =
      body.account?.isLocked !== undefined
        ? Boolean(body.account.isLocked)
        : body.isLocked !== undefined
          ? Boolean(body.isLocked)
          : (existing?.account.isLocked ?? false);

    const lockedAt = isLocked
      ? body.account?.lockedAt || body.lockedAt || existing?.account.lockedAt || new Date().toISOString()
      : null;
    const lockedBy = isLocked
      ? body.account?.lockedBy || body.lockedBy || existing?.account.lockedBy || 'system'
      : null;

    const uuid = body.profile?.uuid || body.uuid || existing?.uuid || crypto.randomUUID();

    const name =
      body.profile?.name ??
      body.name ??
      (body.profile?.fullName || body.fullName
        ? { fullName: body.profile?.fullName || body.fullName }
        : body.profile?.familyName || body.familyName || body.profile?.givenName || body.givenName
          ? {
              familyName: body.profile?.familyName ?? body.familyName,
              givenName: body.profile?.givenName ?? body.givenName
            }
          : (existing?.profile.name ?? 'Nhân viên mới'));

    const birthday =
      body.profile?.birthday !== undefined
        ? body.profile.birthday
        : body.birthday !== undefined
          ? body.birthday
          : (existing?.profile.birthday ?? null);

    const dependants =
      body.profile?.dependants !== undefined
        ? body.profile.dependants
        : body.dependants !== undefined
          ? body.dependants
          : (existing?.profile.dependants ?? 0);

    const posType =
      body.contract?.position?.type || body.position?.type || body.type || existing?.contract.position.type || 'nv';
    const posLevel =
      body.contract?.position?.level ?? body.position?.level ?? body.level ?? existing?.contract.position.level ?? 1;
    const posJobTitle =
      body.contract?.position?.jobTitle !== undefined
        ? body.contract.position.jobTitle
        : body.position?.jobTitle !== undefined
          ? body.position.jobTitle
          : body.jobTitle !== undefined
            ? body.jobTitle
            : (existing?.contract.position.jobTitle ?? null);
    const position = new Position({ type: posType, level: posLevel, jobTitle: posJobTitle });

    const shiftType = (body.contract?.shift?.type ||
      body.shift?.type ||
      body.shiftType ||
      existing?.contract.shift.type ||
      'NORMAL') as ShiftType;

    const shiftStartTime =
      body.contract?.shift?.startTime ||
      body.shift?.startTime ||
      body.shiftStartTime ||
      body.startTime ||
      (existing?.contract.shift.type === shiftType
        ? existing?.contract.shift.startTime
        : shiftType === 'NIGHT'
          ? '21:00'
          : '08:00');

    const shiftEndTime =
      body.contract?.shift?.endTime ||
      body.shift?.endTime ||
      body.shiftEndTime ||
      body.endTime ||
      (existing?.contract.shift.type === shiftType
        ? existing?.contract.shift.endTime
        : shiftType === 'NIGHT'
          ? '06:00'
          : '17:00');

    let shiftAllowance =
      body.contract?.shift?.allowancePct ?? body.shift?.allowancePct ?? body.shiftAllowancePct ?? body.allowancePct;
    if (shiftAllowance === undefined) {
      if (existing?.contract.shift.type === shiftType) {
        shiftAllowance = existing.contract.shift.allowancePct;
      } else {
        shiftAllowance = shiftType === 'FLEX' ? 10 : shiftType === 'NIGHT' ? 30 : 0;
      }
    }
    const shift = new Shift({
      type: shiftType,
      startTime: shiftStartTime,
      endTime: shiftEndTime,
      allowancePct: shiftAllowance
    });

    const leaveTotal =
      body.contract?.leave?.totalDays ??
      body.leave?.totalDays ??
      body.leaveTotalDays ??
      body.totalDays ??
      existing?.contract.leave.totalDays ??
      0;
    const leaveUsed =
      body.contract?.leave?.usedDays ??
      body.leave?.usedDays ??
      body.leaveUsedDays ??
      body.usedDays ??
      existing?.contract.leave.usedDays ??
      0;
    const leave = new Leave({ totalDays: leaveTotal, usedDays: leaveUsed });

    const status = (body.contract?.status || body.status || existing?.contract.status || 'nv') as ContractStatus;
    const effectiveFrom =
      body.contract?.effectiveFrom !== undefined
        ? body.contract.effectiveFrom
        : body.effectiveFrom !== undefined
          ? body.effectiveFrom
          : (existing?.contract.effectiveFrom ?? null);
    const endDate =
      body.contract?.endDate !== undefined
        ? body.contract.endDate
        : body.endDate !== undefined
          ? body.endDate
          : (existing?.contract.endDate ?? null);
    const resignedOn =
      body.contract?.resignedOn !== undefined
        ? body.contract.resignedOn
        : body.resignedOn !== undefined
          ? body.resignedOn
          : (existing?.contract.resignedOn ?? null);

    const hasInsurance =
      body.contract?.hasInsurance !== undefined
        ? Boolean(body.contract.hasInsurance)
        : body.hasInsurance !== undefined
          ? Boolean(body.hasInsurance)
          : (existing?.contract.hasInsurance ?? true);

    const isUnionMember =
      body.contract?.isUnionMember !== undefined
        ? Boolean(body.contract.isUnionMember)
        : body.isUnionMember !== undefined
          ? Boolean(body.isUnionMember)
          : (existing?.contract.isUnionMember ?? false);

    const hasTax =
      body.contract?.hasTax !== undefined
        ? Boolean(body.contract.hasTax)
        : body.hasTax !== undefined
          ? Boolean(body.hasTax)
          : (existing?.contract.hasTax ?? true);

    const canAdvance =
      body.contract?.canAdvance !== undefined
        ? Boolean(body.contract.canAdvance)
        : body.canAdvance !== undefined
          ? Boolean(body.canAdvance)
          : (existing?.contract.canAdvance ?? true);

    const isDormResident =
      body.contract?.isDormResident !== undefined
        ? Boolean(body.contract.isDormResident)
        : body.isDormResident !== undefined
          ? Boolean(body.isDormResident)
          : (existing?.contract.isDormResident ?? false);

    return new Employee({
      profile: new EmployeeProfile({
        uuid,
        name,
        birthday,
        dependants
      }),
      account: new EmployeeAccount({
        username,
        passwordHash,
        roles,
        isLocked,
        lockedAt,
        lockedBy,
        createdAt: existing?.account.createdAt
      }),
      contract: new EmployeeContract({
        position,
        shift,
        leave,
        status,
        effectiveFrom,
        endDate,
        resignedOn,
        hasInsurance,
        isUnionMember,
        hasTax,
        canAdvance,
        isDormResident
      })
    });
  }
}

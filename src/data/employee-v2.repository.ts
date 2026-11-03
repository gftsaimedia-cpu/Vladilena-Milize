import crypto from 'node:crypto';
import type { Insertable, Kysely, Selectable } from 'kysely';
import type { Schema } from './schema.generated';
import {
  Employee,
  EmployeeProfile,
  EmployeeAccount,
  EmployeeContract,
  Position,
  Shift,
  Leave,
  PersonName,
  ContractStatus
} from '../domain/employee-v2';

export type StaffRow = Selectable<Schema['staff']>;

const TIME_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/;
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

export class EmployeeV2Repository {
  constructor(private readonly qb: Kysely<Schema>) {}

  /**
   * Ánh xạ dòng cơ sở dữ liệu `staff` và danh sách vai trò mở rộng sang đối tượng tổng hợp `Employee`.
   */
  static fromRow(row: StaffRow, extraRoles?: string[]): Employee {
    let personName: PersonName;
    const hasFamilyOrGiven = Boolean(
      (row.family_name != null && String(row.family_name).trim()) ||
      (row.given_name != null && String(row.given_name).trim())
    );
    if (hasFamilyOrGiven) {
      personName = new PersonName({
        familyName: row.family_name ?? '',
        givenName: row.given_name ?? '',
        fullName: row.name ?? undefined
      });
    } else {
      const rawName = row.name && String(row.name).trim() ? String(row.name).trim() : (row.username || 'Staff');
      personName = PersonName.fromFullName(rawName);
    }

    const uuid = row.uuid && String(row.uuid).trim() ? String(row.uuid).trim() : crypto.randomUUID();
    const birthday = row.birthday && DATE_REGEX.test(String(row.birthday).trim())
      ? String(row.birthday).trim()
      : null;
    const dependants = Math.max(0, Math.floor(Number(row.dependants || 0)));

    const profile = new EmployeeProfile({
      uuid,
      name: personName,
      birthday,
      dependants
    });

    const primaryRole = row.role && String(row.role).trim() ? String(row.role).trim() : 'staff';
    const rawRoles = [primaryRole, ...(extraRoles || [])];
    const roles = Array.from(new Set(rawRoles.map(r => String(r).trim()).filter(Boolean)));
    const account = new EmployeeAccount({
      username: row.username,
      passwordHash: row.pass_hash && String(row.pass_hash).trim() ? String(row.pass_hash).trim() : 'none',
      roles: roles.length > 0 ? roles : ['staff'],
      lockedAt: row.locked_at ? String(row.locked_at).trim() : null,
      lockedBy: row.locked_by ? String(row.locked_by).trim() : null,
      createdAt: row.created_at ? String(row.created_at).trim() : undefined
    });

    const posType = row.type && String(row.type).trim() ? String(row.type).trim() : 'nv';
    const posLevel = Math.max(1, Math.floor(Number(row.level || 1)));
    const posJobTitle = row.job_title && String(row.job_title).trim() ? String(row.job_title).trim() : null;
    const position = new Position({
      type: posType,
      level: posLevel,
      jobTitle: posJobTitle
    });

    const rawShiftType = String(row.shift_type || '').trim().toUpperCase();
    let shiftType: 'NORMAL' | 'FLEX' | 'NIGHT' = 'NORMAL';
    if (rawShiftType === 'NORMAL' || rawShiftType === 'FLEX' || rawShiftType === 'NIGHT') {
      shiftType = rawShiftType;
    }

    const startTime = (row.shift_start_time && TIME_REGEX.test(String(row.shift_start_time).trim()))
      ? String(row.shift_start_time).trim()
      : '08:00';
    const endTime = (row.shift_end_time && TIME_REGEX.test(String(row.shift_end_time).trim()))
      ? String(row.shift_end_time).trim()
      : '17:00';

    let allowancePct = 0;
    if (shiftType === 'NORMAL') {
      allowancePct = 0;
    } else if (shiftType === 'FLEX') {
      allowancePct = 10;
    } else {
      const candidate = Number(row.shift_allowance_pct ?? 30);
      if ([30, 40, 60].includes(candidate)) {
        allowancePct = candidate;
      } else {
        allowancePct = 30;
      }
    }

    const shift = new Shift({
      type: shiftType,
      startTime,
      endTime,
      allowancePct
    });

    const totalDays = Math.max(0, Number(row.leave_total_days || 0));
    const usedDays = Math.max(0, Number(row.leave_used_days || 0));
    const leave = new Leave({
      totalDays,
      usedDays
    });

    const rawStatus = String(row.contract_status || '').trim().toLowerCase();
    let contractStatus: ContractStatus = 'nv';
    if (['tts', 'ctv', 'thuviec', 'nv', 'nghiviec'].includes(rawStatus)) {
      contractStatus = rawStatus as ContractStatus;
    } else if (rawStatus === 'probation') {
      contractStatus = 'thuviec';
    } else if (rawStatus === 'official') {
      contractStatus = 'nv';
    }

    const effectiveFrom = row.start_date && DATE_REGEX.test(String(row.start_date).trim())
      ? String(row.start_date).trim()
      : null;
    const endDate = row.contract && DATE_REGEX.test(String(row.contract).trim())
      ? String(row.contract).trim()
      : null;
    const resignedOn = row.resigned_on && DATE_REGEX.test(String(row.resigned_on).trim())
      ? String(row.resigned_on).trim()
      : null;

    const contract = new EmployeeContract({
      position,
      shift,
      leave,
      status: contractStatus,
      effectiveFrom,
      endDate,
      resignedOn,
      hasInsurance: row.insured !== 0,
      isUnionMember: row.deduct_on === 1,
      hasTax: row.tax_on !== 0,
      canAdvance: row.advance_on !== 0,
      isDormResident: row.idorm === 1
    });

    return new Employee({ profile, account, contract });
  }

  /**
   * Chuyển đổi đối tượng `Employee` thành bản ghi đầy đủ `Insertable<Schema['staff']>`.
   */
  static toRow(employee: Employee): Insertable<Schema['staff']> {
    const remLeave = typeof employee.contract.leave.remainingDays === 'function'
      ? employee.contract.leave.remainingDays()
      : employee.contract.leave.totalDays - employee.contract.leave.usedDays;

    let dbContractStatus: string | null = null;
    if (employee.contract.status === 'thuviec' || (employee.contract.status as string) === 'probation') {
      dbContractStatus = 'probation';
    } else if (employee.contract.status === 'nv' || (employee.contract.status as string) === 'official') {
      dbContractStatus = 'official';
    } else {
      dbContractStatus = null;
    }

    return {
      uuid: employee.uuid,
      username: employee.username,
      name: employee.fullName,
      family_name: employee.profile.familyName,
      given_name: employee.profile.givenName,
      birthday: employee.profile.birthday,
      dependants: employee.profile.dependants,
      pass_hash: employee.account.passwordHash,
      role: employee.account.roles[0] || 'staff',
      locked_at: employee.account.lockedAt,
      locked_by: employee.account.lockedBy,
      created_at: employee.account.createdAt,
      type: employee.contract.position.type,
      level: employee.contract.position.level,
      job_title: employee.contract.position.jobTitle,
      shift_type: employee.contract.shift.type,
      shift_start_time: employee.contract.shift.startTime,
      shift_end_time: employee.contract.shift.endTime,
      shift_allowance_pct: employee.contract.shift.allowancePct,
      leave_total_days: employee.contract.leave.totalDays,
      leave_used_days: employee.contract.leave.usedDays,
      leave_balance: remLeave,
      leave_balance_on: null,
      session_version: 0,
      contract_status: dbContractStatus,
      start_date: employee.contract.effectiveFrom,
      contract: employee.contract.endDate,
      resigned_on: employee.contract.resignedOn,
      insured: employee.contract.hasInsurance ? 1 : 0,
      deduct_on: employee.contract.isUnionMember ? 1 : 0,
      tax_on: employee.contract.hasTax ? 1 : 0,
      advance_on: employee.contract.canAdvance ? 1 : 0,
      idorm: employee.contract.isDormResident ? 1 : 0,
      payroll_subject: 1
    };
  }

  /**
   * Tải toàn bộ danh sách nhân viên từ bảng `staff` kèm các vai trò hiệu lực từ `staff_roles`.
   */
  async findAll(): Promise<Employee[]> {
    const rows = await this.qb
      .selectFrom('staff')
      .selectAll()
      .orderBy('role')
      .orderBy('type')
      .orderBy('name')
      .execute();

    const roleRows = await this.qb
      .selectFrom('staff_roles')
      .select(['username', 'role'])
      .where('revoked_at', 'is', null)
      .execute();

    const rolesByUsername = new Map<string, string[]>();
    for (const r of roleRows) {
      const list = rolesByUsername.get(r.username) || [];
      list.push(r.role);
      rolesByUsername.set(r.username, list);
    }

    return rows.map(row => EmployeeV2Repository.fromRow(row, rolesByUsername.get(row.username)));
  }

  /**
   * Tìm nhân viên theo tên tài khoản `username`.
   */
  async findByUsername(username: string): Promise<Employee | null> {
    const row = await this.qb
      .selectFrom('staff')
      .selectAll()
      .where('username', '=', username)
      .executeTakeFirst();
    if (!row) return null;

    const roleRows = await this.qb
      .selectFrom('staff_roles')
      .select('role')
      .where('username', '=', username)
      .where('revoked_at', 'is', null)
      .orderBy('role')
      .execute();

    return EmployeeV2Repository.fromRow(row, roleRows.map(r => r.role));
  }

  /**
   * Tìm nhân viên theo mã định danh `uuid`.
   */
  async findByUuid(uuid: string): Promise<Employee | null> {
    const row = await this.qb
      .selectFrom('staff')
      .selectAll()
      .where('uuid', '=', uuid)
      .executeTakeFirst();
    if (!row) return null;

    const roleRows = await this.qb
      .selectFrom('staff_roles')
      .select('role')
      .where('username', '=', row.username)
      .where('revoked_at', 'is', null)
      .orderBy('role')
      .execute();

    return EmployeeV2Repository.fromRow(row, roleRows.map(r => r.role));
  }

  /**
   * Tìm nhân viên theo `username` hoặc `uuid`.
   */
  async findByUsernameOrUuid(id: string): Promise<Employee | null> {
    const row = await this.qb
      .selectFrom('staff')
      .selectAll()
      .where(eb => eb.or([eb('username', '=', id), eb('uuid', '=', id)]))
      .executeTakeFirst();
    if (!row) return null;

    const roleRows = await this.qb
      .selectFrom('staff_roles')
      .select('role')
      .where('username', '=', row.username)
      .where('revoked_at', 'is', null)
      .orderBy('role')
      .execute();

    return EmployeeV2Repository.fromRow(row, roleRows.map(r => r.role));
  }

  /**
   * Lưu hoặc ghi đè toàn bộ thông tin nhân viên vào bảng `staff`, đồng bộ vai trò phụ vào `staff_roles`.
   */
  async save(employee: Employee, actor?: string): Promise<Employee> {
    const row = EmployeeV2Repository.toRow(employee);
    await this.qb
      .insertInto('staff')
      .values(row)
      .onConflict(oc =>
        oc.column('username').doUpdateSet(eb => ({
          name: eb.ref('excluded.name'),
          family_name: eb.ref('excluded.family_name'),
          given_name: eb.ref('excluded.given_name'),
          birthday: eb.ref('excluded.birthday'),
          dependants: eb.ref('excluded.dependants'),
          pass_hash: eb.ref('excluded.pass_hash'),
          role: eb.ref('excluded.role'),
          locked_at: eb.ref('excluded.locked_at'),
          locked_by: eb.ref('excluded.locked_by'),
          created_at: eb.ref('excluded.created_at'),
          type: eb.ref('excluded.type'),
          level: eb.ref('excluded.level'),
          job_title: eb.ref('excluded.job_title'),
          shift_type: eb.ref('excluded.shift_type'),
          shift_start_time: eb.ref('excluded.shift_start_time'),
          shift_end_time: eb.ref('excluded.shift_end_time'),
          shift_allowance_pct: eb.ref('excluded.shift_allowance_pct'),
          leave_total_days: eb.ref('excluded.leave_total_days'),
          leave_used_days: eb.ref('excluded.leave_used_days'),
          leave_balance: eb.ref('excluded.leave_balance'),
          contract_status: eb.ref('excluded.contract_status'),
          start_date: eb.ref('excluded.start_date'),
          contract: eb.ref('excluded.contract'),
          resigned_on: eb.ref('excluded.resigned_on'),
          insured: eb.ref('excluded.insured'),
          deduct_on: eb.ref('excluded.deduct_on'),
          tax_on: eb.ref('excluded.tax_on'),
          advance_on: eb.ref('excluded.advance_on'),
          idorm: eb.ref('excluded.idorm'),
          payroll_subject: eb.ref('excluded.payroll_subject'),
          uuid: eb.ref('excluded.uuid')
        }))
      )
      .execute();

    // Đồng bộ vai trò phụ (các vai trò ngoài vai trò chính)
    const primaryRole = employee.account.roles[0] || 'staff';
    const desiredRoles = new Set(employee.account.roles.filter(r => r !== primaryRole));

    const existingActiveRoles = await this.qb
      .selectFrom('staff_roles')
      .select(['id', 'role'])
      .where('username', '=', employee.username)
      .where('revoked_at', 'is', null)
      .execute();

    const nowStr = new Date().toISOString();
    const actorName = actor || 'system';

    // Thu hồi các vai trò phụ không còn nằm trong danh sách mong muốn
    for (const existing of existingActiveRoles) {
      if (!desiredRoles.has(existing.role)) {
        await this.qb
          .updateTable('staff_roles')
          .set({ revoked_at: nowStr })
          .where('id', '=', existing.id)
          .execute();
      }
    }

    // Gán các vai trò phụ mới chưa có hiệu lực
    const activeRoleSet = new Set(existingActiveRoles.map(r => r.role));
    for (const role of desiredRoles) {
      if (!activeRoleSet.has(role)) {
        await this.qb
          .insertInto('staff_roles')
          .values({
            username: employee.username,
            role,
            granted_by: actorName,
            granted_at: nowStr
          } as any)
          .execute();
      }
    }

    return employee;
  }

  /**
   * Xoá tài khoản nhân viên theo `username`.
   */
  async deleteByUsername(username: string): Promise<boolean> {
    const result = await this.qb
      .deleteFrom('staff')
      .where('username', '=', username)
      .executeTakeFirst();
    return Number(result.numDeletedRows) > 0;
  }
}

import { Injectable, Inject } from '@nestjs/common';
import crypto from 'node:crypto';
import { EmployeesRepository } from './employees.repository';
import {
  Employee,
  EmployeeDTO,
  EmployeeProfile,
  EmployeeAccount,
  EmployeeContract,
  PersonName,
  PersonNameLike,
  Position,
  Shift,
  ShiftType,
  Leave,
  ContractStatus,
} from './domain';

const SALT_BYTES = 16;
const KEY_BYTES = 64;

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(SALT_BYTES).toString('hex');
  const hash = crypto.scryptSync(password, salt, KEY_BYTES).toString('hex');
  return `scrypt$${salt}$${hash}`;
}

// Cờ bảo hiểm từ thân yêu cầu: null = theo mặc định của hợp đồng; nhận true/false hoặc 1/0.
function parseInsured(value: unknown): boolean | null {
  if (value === null) return null;
  if (value === true || value === 1) return true;
  if (value === false || value === 0) return false;
  throw new Error('Đóng bảo hiểm phải là có / không');
}

export function verifyPassword(password: string, stored: string): boolean {
  if (!stored || !stored.startsWith('scrypt$')) return false;
  const parts = stored.split('$');
  if (parts.length !== 3) return false;
  const [, salt, hash] = parts;
  const want = Buffer.from(hash, 'hex');
  const got = crypto.scryptSync(password, salt, want.length || KEY_BYTES);
  return got.length === want.length && crypto.timingSafeEqual(got, want);
}

@Injectable()
export class EmployeesService {
  constructor(@Inject(EmployeesRepository) private readonly repo: EmployeesRepository) {}

  async list(filter: { shiftType?: string; status?: string; q?: string } = {}): Promise<Employee[]> {
    const list = await this.repo.findAll();
    return list.filter((emp) => {
      if (filter.status && emp.contract.status !== filter.status) return false;
      if (filter.shiftType && emp.contract.shift.type !== filter.shiftType) return false;
      if (filter.q) {
        const q = filter.q.toLowerCase();
        const matchesUsername = emp.username.toLowerCase().includes(q);
        const matchesName = emp.profile.name.fullName.toLowerCase().includes(q);
        if (!matchesUsername && !matchesName) return false;
      }
      return true;
    });
  }

  async findByUsernameOrUuid(id: string): Promise<Employee | null> {
    return await this.repo.findByUsernameOrUuid(id);
  }

  async save(employee: Employee, actor?: string): Promise<Employee> {
    return await this.repo.save(employee, actor);
  }

  async deactivate(username: string, actor?: string): Promise<boolean> {
    const existing = await this.repo.findByUsernameOrUuid(username);
    if (!existing) return false;

    const updated = this.buildEmployeeFromInput(
      {
        contract: { status: 'nghiviec', resignedOn: new Date().toISOString().slice(0, 10) },
        account: { isLocked: true, lockedBy: actor, lockedAt: new Date().toISOString() },
      },
      existing
    );

    await this.repo.save(updated, actor);
    return true;
  }

  async getPositionsCatalog(): Promise<any[]> {
    return await this.repo.listPositionCatalog();
  }

  async getShiftsCatalog(): Promise<any[]> {
    return await this.repo.listShiftCatalog();
  }

  buildEmployeeFromInput(body: any, existing?: Employee): Employee {
    const username = body.account?.username || body.username || existing?.username;
    if (!username) {
      throw new Error('Tên đăng nhập không được để trống');
    }

    const uuid = body.profile?.uuid || body.uuid || existing?.profile.uuid || crypto.randomUUID();

    let name: PersonName | PersonNameLike;
    if (body.profile?.name) {
      name = new PersonName(body.profile.name);
    } else if (body.name || body.fullName) {
      name = PersonName.fromFullName(body.name || body.fullName);
    } else if (body.familyName || body.givenName) {
      name = new PersonName({
        familyName: body.familyName || '',
        givenName: body.givenName || '',
      });
    } else if (existing) {
      name = existing.profile.name;
    } else {
      name = PersonName.fromFullName(username);
    }

    const birthday =
      body.profile?.birthday !== undefined
        ? body.profile.birthday
        : body.birthday !== undefined
          ? body.birthday
          : (existing?.profile.birthday ?? null);

    const dependants =
      body.profile?.dependants !== undefined
        ? Number(body.profile.dependants)
        : body.dependants !== undefined
          ? Number(body.dependants)
          : (existing?.profile.dependants ?? 0);

    let passwordHash = existing?.account.passwordHash || 'none';
    if (body.account?.password || body.password) {
      passwordHash = hashPassword(body.account?.password || body.password);
    } else if (body.account?.passwordHash || body.passHash) {
      passwordHash = body.account?.passwordHash || body.passHash;
    }

    const roles: string[] =
      body.account?.roles ||
      (body.role ? [body.role] : undefined) ||
      existing?.account.roles ||
      ['staff'];

    const isLocked =
      body.account?.isLocked !== undefined
        ? Boolean(body.account.isLocked)
        : body.isLocked !== undefined
          ? Boolean(body.isLocked)
          : (existing?.account.isLocked ?? false);

    // Đăng nhập và kiểm phiên chỉ đọc cột locked_at: khoá mà không ghi thời điểm thì tài khoản vẫn vào được,
    // nên khoá luôn có thời điểm (giữ thời điểm cũ nếu đã khoá) và mở khoá luôn xoá thời điểm.
    const givenLockedAt = body.account?.lockedAt !== undefined ? body.account.lockedAt : (existing?.account.lockedAt ?? null);
    const lockedAt = isLocked ? givenLockedAt || new Date().toISOString() : null;

    const lockedBy =
      body.account?.lockedBy !== undefined
        ? body.account.lockedBy
        : (existing?.account.lockedBy ?? null);

    const posType =
      body.contract?.position?.type ||
      body.position?.type ||
      body.type ||
      existing?.contract.position.type ||
      'nv';

    const posLevel =
      body.contract?.position?.level !== undefined
        ? Number(body.contract.position.level)
        : body.position?.level !== undefined
          ? Number(body.position.level)
          : body.level !== undefined
            ? Number(body.level)
            : (existing?.contract.position.level ?? 1);

    const posJobTitle =
      body.contract?.position?.jobTitle !== undefined
        ? body.contract.position.jobTitle
        : body.position?.jobTitle !== undefined
          ? body.position.jobTitle
          : body.jobTitle !== undefined
            ? body.jobTitle
            : (existing?.contract.position.jobTitle ?? null);

    const position = new Position({
      type: posType,
      level: posLevel,
      jobTitle: posJobTitle,
    });

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
      allowancePct: shiftAllowance,
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
    // Form web gửi nhãn ở cấp ngoài (contract: 'long' | 'short' | null); dạng DTO gửi contract.term.
    const termInput =
      body.contract !== null && typeof body.contract === 'object' ? body.contract.term : body.contract;
    const term =
      termInput !== undefined
        ? termInput === ''
          ? null
          : termInput
        : (existing?.contract.term ?? null);
    const resignedOn =
      body.contract?.resignedOn !== undefined
        ? body.contract.resignedOn
        : body.resignedOn !== undefined
          ? body.resignedOn
          : (existing?.contract.resignedOn ?? null);

    const insuredInput =
      body.contract?.hasInsurance !== undefined
        ? body.contract.hasInsurance
        : body.insured !== undefined
          ? body.insured
          : body.hasInsurance;
    const hasInsurance =
      insuredInput !== undefined ? parseInsured(insuredInput) : (existing?.contract.hasInsurance ?? null);

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
        dependants,
      }),
      account: new EmployeeAccount({
        username,
        passwordHash,
        roles,
        isLocked,
        lockedAt,
        lockedBy,
        createdAt: existing?.account.createdAt,
      }),
      contract: new EmployeeContract({
        position,
        shift,
        leave,
        status,
        term,
        effectiveFrom,
        resignedOn,
        hasInsurance,
        isUnionMember,
        hasTax,
        canAdvance,
        isDormResident,
      }),
    });
  }
}

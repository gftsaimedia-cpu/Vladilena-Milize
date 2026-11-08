import { Injectable, Inject, Optional } from '@nestjs/common';
import crypto from 'node:crypto';
import { businessDateText } from '../../common/business-date';
import { BadRequestError } from '../../common/exceptions/http.exception';
import { bulkFailureOf, runBulk } from '../../common/bulk';
import { DEFAULT_SHIFT, shiftByCode } from '../../common/shift-catalog';
import { TransactionCoordinator, type DatabaseTransaction } from '../../database/transaction';
import { AttendanceDaysService } from '../attendance/attendance-days.service';
import { monthOfDate, monthsBetween } from '../attendance/domain/calendar';
import { RealtimeBus } from '../realtime/realtime-bus';
import { AuditLog } from '../audit/audit-log';
import { DepartmentNotFoundError } from '../departments/departments.errors';
import { foldText, matchesStaffStatus, staffStatusOf, type StaffFilter, type StaffStatus } from '../departments/domain';
import { staffDeleteRows, staffSaveRows, type StaffAuditRow } from './domain/staff-audit';
import { EmployeesRepository, type EmploymentDates } from './employees.repository';
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
  StaffSummary,
  WorkInfo,
  asOfFor,
  summarizeStaff,
  workOf,
  sameShift,
  BASE_SHIFT_FROM,
  type ShiftSpec,
} from './domain';

const SALT_BYTES = 16;
const KEY_BYTES = 64;
export type EmployeeView = EmployeeDTO & {
  departmentId: number | null;
  departmentName: string | null;
  staffStatus: StaffStatus;
  /** Ngày ca mặc định hiện tại bắt đầu áp dụng (sau lần đổi ca gần nhất); null khi chưa đổi ca lần nào. */
  shiftEffectiveFrom: string | null;
};
export interface BulkResult<T> {
  done: T[];
  failed: Array<{ id: string; code: string; message: string }>;
}

class BulkEmployeeError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
  }
}

function parseDepartmentId(value: unknown): number | null {
  if (value === null || value === '') return null;
  const n = typeof value === 'number' ? value : typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : NaN;
  if (!Number.isSafeInteger(n) || n < 1) throw new Error('Phòng ban không hợp lệ');
  return n;
}

/** Ngày bắt đầu của ca mới nhất; không có lịch sử thì null. */
const latestShiftFrom = (versions: readonly { effectiveFrom: string }[]): string | null => {
  const last = versions[versions.length - 1];
  return last && last.effectiveFrom > BASE_SHIFT_FROM ? last.effectiveFrom : null;
};

/** pass_hash của người chưa đặt mật khẩu. */
const NO_PASSWORD = 'none';

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

/** Năm trường của T4 làm đổi cách dựng dòng ngày; sửa tên, mật khẩu, vai trò, số điện thoại… không đổi trường nào. */
export function attendanceFieldsChanged(before: EmploymentDates, after: EmploymentDates): boolean {
  return (
    before.startDate !== after.startDate ||
    before.resignedOn !== after.resignedOn ||
    before.type !== after.type ||
    before.level !== after.level ||
    before.shiftType !== after.shiftType ||
    before.shiftStart !== after.shiftStart ||
    before.shiftEnd !== after.shiftEnd
  );
}

/**
 * Các tháng cần ghi lại dòng ngày công sau khi lưu hồ sơ: từ tháng nhỏ nhất trong bốn ngày
 * (cũ và mới x vào làm và nghỉ việc, ngày rỗng bỏ qua) và tháng hiện tại, tới tháng hiện tại.
 * Hàm này chỉ tính khoảng tháng; có ghi lại hay không do `attendanceFieldsChanged` và tháng đóng băng quyết định.
 */
export function monthsAffectedByEmployment(
  before: EmploymentDates | null,
  after: EmploymentDates,
  currentMonth: string,
  extraDates: ReadonlyArray<string | null | undefined> = []
): string[] {
  const dates = [before?.startDate, before?.resignedOn, after.startDate, after.resignedOn, ...extraDates];
  const months = dates.flatMap(d => (d ? [monthOfDate(d)] : []));
  const first = [...months, currentMonth].reduce((a, b) => (b < a ? b : a));
  return monthsBetween(first, currentMonth);
}

/**
 * Tạo, sửa, xoá hồ sơ chạy trong một transaction; các dòng nhật ký ghi cuối cùng, lỗi thì huỷ cả lần lưu.
 * Sau khi transaction đó đã commit, các dòng ngày công của người đó được ghi lại từ tháng sớm nhất bị ảnh hưởng
 * tới tháng hiện tại (mỗi tháng một giao dịch riêng), bỏ qua tháng đã chốt công trở đi, và khi sửa hồ sơ chỉ ghi lại nếu
 * một trong năm trường T4 đổi (vào làm, nghỉ việc, loại, bậc, ca mặc định). Ghi lại lỗi thì lỗi trả về cho Admin và hồ sơ vẫn đã lưu
 * (không làm lại được thao tác tạo); dòng ngày được sửa bằng "Tính lại" của Admin
 * (POST /api/v2/attendance/recalculate) hoặc tác vụ chạy mỗi giờ (chỉ dòng thiếu hoặc PENDING).
 */
@Injectable()
export class EmployeesService {
  /** Thời điểm tính dòng ngày công và ngày nghỉ việc của `deactivate`; test đặt cố định. */
  now: () => Date = () => new Date();

  // `@Inject` rõ ràng: tsx không phát metadata kiểu tham số, thiếu thì Nest cấp `undefined` mà không báo lỗi.
  constructor(
    @Inject(EmployeesRepository) private readonly repo: EmployeesRepository,
    @Inject(TransactionCoordinator) private readonly tx: Pick<TransactionCoordinator, 'run'>,
    @Inject(AuditLog) private readonly audit: Pick<AuditLog, 'append'>,
    @Optional()
    @Inject(AttendanceDaysService)
    private readonly attendanceDays?: Pick<AttendanceDaysService, 'refreshMonth' | 'frozenMonths'>,
    // Báo cho Admin khác khi hồ sơ nhân sự đổi (sau commit); thiếu thì không phát.
    @Optional() @Inject(RealtimeBus) private readonly bus?: RealtimeBus
  ) {}

  private announce(username: string, change: 'created' | 'updated' | 'ended'): void {
    try {
      this.bus?.publish({ type: 'staff.changed', username, change });
    } catch (err) {
      console.error('Không phát được sự kiện realtime:', err);
    }
  }

  /**
   * Đọc lại hồ sơ sau commit rồi ghi lại các tháng bị ảnh hưởng (P4: ngoài giao dịch lưu hồ sơ).
   * Sửa hồ sơ chỉ ghi lại khi một trong năm trường T4 đổi; tạo mới và deactivate (`always`) luôn ghi.
   * Tháng có kỳ lương đã rời `open` bị bỏ qua, giống job mỗi giờ: hồ sơ hôm nay không viết lại tháng đã chốt.
   */
  private async refreshAfterSave(id: string, before: EmploymentDates | null, always = false, extraDates: string[] = []): Promise<void> {
    if (!this.attendanceDays) return;
    const after = await this.repo.employmentDates(id);
    if (!after) return;
    if (!always && before && !attendanceFieldsChanged(before, after)) return;
    const currentMonth = businessDateText(this.now()).slice(0, 7);
    const months = monthsAffectedByEmployment(before, after, currentMonth, extraDates);
    const frozen = await this.attendanceDays.frozenMonths(`${months[0]}-01`, `${currentMonth}-01`);
    for (const month of months) {
      if (frozen.has(month)) continue;
      await this.attendanceDays.refreshMonth(after.uuid, month, { now: this.now() });
    }
  }

  async list(filter: { shiftType?: string; status?: string; q?: string; staff?: StaffFilter } = {}): Promise<Employee[]> {
    const list = await this.repo.findAll();
    const today = businessDateText(this.now());
    const staff = filter.staff;
    const needle = staff ? foldText(staff.q) : '';
    return list.filter((emp) => {
      if (staff) {
        if (!matchesStaffStatus(staff.staffStatus, this.staffStatusOf(emp, today))) return false;
        const dept = emp.contract.departmentId;
        if (staff.departmentId === 'none' ? dept !== null : staff.departmentId !== undefined && dept !== staff.departmentId) return false;
        if (needle && !foldText(emp.username).includes(needle) && !foldText(emp.profile.name.fullName).includes(needle)) return false;
      }
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

  /** Hôm nay theo giờ Việt Nam. */
  today(): string {
    return businessDateText(this.now());
  }

  /** Số liệu làm việc của một người ở ngày tính của tháng `month` (mặc định: hôm nay). */
  workOf(employee: Employee, month?: string): WorkInfo {
    const today = this.today();
    return workOf(employee.toDTO(), asOfFor(month ?? today.slice(0, 7), today), today);
  }

  /** Tóm tắt toàn bộ nhân sự (không theo bộ lọc) cho tháng `month` (mặc định: tháng này). */
  async summary(month?: string): Promise<StaffSummary> {
    const today = this.today();
    const all = await this.repo.findAll();
    return summarizeStaff(all.map(e => e.toDTO()), month ?? today.slice(0, 7), today);
  }

  async findByUsernameOrUuid(id: string): Promise<Employee | null> {
    return await this.repo.findByUsernameOrUuid(id);
  }

  private staffStatusOf(emp: Employee, today: string): StaffStatus {
    return staffStatusOf(
      { contractStatus: emp.contract.status, onLeaveFrom: emp.contract.onLeaveFrom, onLeaveTo: emp.contract.onLeaveTo },
      today
    );
  }

  /** Hồ sơ kèm tên phòng ban và staffStatus tính sẵn (hôm nay theo giờ Việt Nam), đúng thứ tự đầu vào. */
  async views(employees: readonly Employee[]): Promise<EmployeeView[]> {
    const ids = [...new Set(employees.flatMap(e => (e.contract.departmentId === null ? [] : [e.contract.departmentId])))];
    const names = await this.repo.departmentNames(ids);
    const shifts = await this.repo.shiftVersionsOf(employees.map(e => e.profile.uuid));
    const today = businessDateText(this.now());
    return employees.map(emp => {
      const departmentId = emp.contract.departmentId;
      return {
        ...emp.toDTO(),
        departmentId,
        departmentName: departmentId === null ? null : (names.get(departmentId) ?? null),
        staffStatus: this.staffStatusOf(emp, today),
        shiftEffectiveFrom: latestShiftFrom(shifts.get(emp.profile.uuid) ?? [])
      };
    });
  }

  /** Phòng ban được gán phải có thật; kiểm trong cùng giao dịch với lần lưu. */
  private async requireDepartment(repo: EmployeesRepository, employee: Employee): Promise<void> {
    const id = employee.contract.departmentId;
    if (id !== null && !(await repo.departmentNames([id])).has(id)) throw new DepartmentNotFoundError();
  }

  /** Gán một trong sáu ca cố định cho nhiều người; mã ca lạ thì cả lô bị từ chối. */
  async assignShift(usernames: readonly string[], shiftCode: string, actor: string, effectiveFrom?: string): Promise<BulkResult<EmployeeView>> {
    const fixed = shiftByCode(shiftCode);
    if (!fixed) throw new BadRequestError(`Mã ca không hợp lệ: ${String(shiftCode)}`, { code: 'INVALID_SHIFT_CODE' });
    return this.assignMany(usernames, actor, (existing) => {
      const allowancePct =
        fixed.shiftType === 'NIGHT'
          ? existing.contract.shift.type === 'NIGHT'
            ? existing.contract.shift.allowancePct
            : 30
          : fixed.shiftType === 'FLEX'
            ? 10
            : 0;
      return { contract: { shift: { type: fixed.shiftType, startTime: fixed.startTime, endTime: fixed.endTime, allowancePct, effectiveFrom } } };
    });
  }

  /** Đổi phòng ban cho nhiều người (null = bỏ phòng); phòng không có thì cả lô bị từ chối. */
  async assignDepartment(usernames: readonly string[], departmentId: number | null, actor: string): Promise<BulkResult<EmployeeView>> {
    if (departmentId !== null && !(await this.repo.departmentNames([departmentId])).has(departmentId)) throw new DepartmentNotFoundError();
    return this.assignMany(usernames, actor, () => ({ contract: { departmentId } }));
  }

  /** Mỗi người một lần lưu như `update` (giao dịch, nhật ký, ghi lại ngày công); người nghỉ việc hay không có thì vào failed. */
  private async assignMany(
    usernames: readonly string[],
    actor: string,
    patchOf: (existing: Employee) => Record<string, unknown>
  ): Promise<BulkResult<EmployeeView>> {
    const out = await runBulk(
      usernames,
      (username) => username,
      async (username) => {
        const current = await this.repo.findByUsernameOrUuid(username);
        if (!current) throw new BulkEmployeeError('EMPLOYEE_NOT_FOUND', 'Không tìm thấy nhân viên');
        if (current.contract.status === 'nghiviec') throw new BulkEmployeeError('EMPLOYEE_RESIGNED', 'Nhân viên đã thôi việc');
        const saved = await this.update(username, patchOf(current), actor);
        if (!saved) throw new BulkEmployeeError('EMPLOYEE_NOT_FOUND', 'Không tìm thấy nhân viên');
        return saved;
      },
      (err) => (err instanceof BulkEmployeeError ? { code: err.code, message: err.message } : { code: 'BAD_EMPLOYEE_INPUT', message: bulkFailureOf(err).message })
    );
    for (const e of out.done) this.announce(e.username, 'updated');
    return { done: await this.views(out.done), failed: out.failed };
  }

  async create(body: any, actor: string): Promise<Employee> {
    const employee = this.buildEmployeeFromInput(body);
    const saved = await this.tx.run(async trx => {
      const repo = this.repo.withTransaction(trx);
      await this.requireDepartment(repo, employee);
      const saved = await repo.save(employee, actor, { createOnly: true });
      const stored = await this.reload(repo, saved);
      const passwordSet = stored.account.passwordHash !== NO_PASSWORD;
      await this.log(trx, actor, saved.username, staffSaveRows(null, stored.toDTO(), passwordSet));
      return saved;
    });
    await this.refreshAfterSave(saved.username, null, true);
    this.announce(saved.username, 'created');
    return saved;
  }

  /** null khi không có người `id` (username hoặc uuid). */
  async update(id: string, body: any, actor: string): Promise<Employee | null> {
    const outcome = await this.tx.run(async trx => {
      const repo = this.repo.withTransaction(trx);
      const existing = await repo.findByUsernameOrUuid(id, { forUpdate: true });
      if (!existing) return null;
      const before = this.attendanceDays ? await repo.employmentDates(existing.username) : null;
      const built = this.buildEmployeeFromInput(body, existing);
      // username và uuid là khoá của hồ sơ: đổi qua body sẽ sao chép tài khoản sang tên mới hoặc ghi đè người khác.
      if (built.username !== existing.username || built.profile.uuid !== existing.profile.uuid) {
        throw new Error('Không đổi được tên đăng nhập hoặc mã nhân sự');
      }
      await this.requireDepartment(repo, built);
      const saved = await repo.save(built, actor);
      // Đổi ca mặc định: ghi lịch sử với ngày áp dụng (mặc định hôm nay), để các ngày trước đó vẫn tính theo ca cũ.
      const shiftFrom = await this.recordShiftIfChanged(repo, existing, saved, body?.contract?.shift?.effectiveFrom, actor);
      const stored = await this.reload(repo, saved);
      const passwordChanged = stored.account.passwordHash !== existing.account.passwordHash;
      await this.log(trx, actor, saved.username, staffSaveRows(existing.toDTO(), stored.toDTO(), passwordChanged));
      return { saved, before, shiftFrom };
    });
    if (!outcome) return null;
    await this.refreshAfterSave(outcome.saved.username, outcome.before, false, outcome.shiftFrom ? [outcome.shiftFrom] : []);
    this.announce(outcome.saved.username, 'updated');
    return outcome.saved;
  }

  /** Ca mặc định của hồ sơ dạng so sánh được. */
  private shiftSpecOf(e: Employee): ShiftSpec {
    const s = e.contract.shift;
    return { type: s.type as ShiftSpec['type'], startTime: s.startTime, endTime: s.endTime, allowancePct: s.allowancePct };
  }

  /**
   * Ca mặc định đổi thì ghi lịch sử ca với ngày áp dụng `effectiveFrom` (mặc định hôm nay theo giờ Việt Nam) và trả ngày đó; không đổi
   * thì trả null. Ngày phải hợp lệ và không rơi vào tháng đã chốt công trở đi (dòng ngày của các tháng đó không ghi lại nữa).
   */
  private async recordShiftIfChanged(
    repo: EmployeesRepository,
    existing: Employee,
    saved: Employee,
    effectiveFrom: unknown,
    actor: string
  ): Promise<string | null> {
    const previous = this.shiftSpecOf(existing);
    const next = this.shiftSpecOf(saved);
    if (sameShift(previous, next)) return null;
    const today = businessDateText(this.now());
    const from = effectiveFrom === undefined || effectiveFrom === null || effectiveFrom === '' ? today : String(effectiveFrom);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || Number.isNaN(Date.parse(`${from}T00:00:00Z`)) || new Date(`${from}T00:00:00Z`).toISOString().slice(0, 10) !== from) {
      throw new Error('Ngày áp dụng ca mới không hợp lệ (định dạng YYYY-MM-DD)');
    }
    const startDate = existing.contract.effectiveFrom;
    if (startDate && from < startDate) throw new Error(`Ngày áp dụng ca mới không được trước ngày vào làm (${startDate})`);
    const currentMonth = today.slice(0, 7);
    if (this.attendanceDays && from.slice(0, 7) <= currentMonth) {
      const frozen = [...(await this.attendanceDays.frozenMonths(`${from.slice(0, 7)}-01`, `${currentMonth}-01`))].filter(
        m => m >= from.slice(0, 7) && m <= currentMonth
      );
      if (frozen.length > 0) {
        const month = frozen.sort()[0];
        throw new Error(`Tháng ${month} đã chốt công, không áp ca mới từ ngày ${from}`);
      }
    }
    await repo.recordShiftChange({ employeeId: saved.profile.uuid, previous, next, from, actor, at: this.now() });
    return from;
  }

  async deactivate(username: string, actor: string): Promise<boolean> {
    const outcome = await this.tx.run(async trx => {
      const repo = this.repo.withTransaction(trx);
      const existing = await repo.findByUsernameOrUuid(username, { forUpdate: true });
      if (!existing) return null;
      const before = this.attendanceDays ? await repo.employmentDates(existing.username) : null;

      const updated = this.buildEmployeeFromInput(
        {
          contract: { status: 'nghiviec', resignedOn: businessDateText(this.now()) },
          account: { isLocked: true, lockedBy: actor, lockedAt: this.now().toISOString() },
        },
        existing
      );

      await repo.save(updated, actor);
      const stored = await this.reload(repo, updated);
      await this.log(trx, actor, updated.username, staffDeleteRows(existing.toDTO(), stored.toDTO()));
      return { username: updated.username, before };
    });
    if (!outcome) return false;
    await this.refreshAfterSave(outcome.username, outcome.before, true);
    this.announce(outcome.username, 'ended');
    return true;
  }

  /** Bản vừa lưu đọc lại từ DB (trong cùng transaction): nhật ký so với cái đã lưu, không phải cái được gửi lên. */
  private async reload(repo: EmployeesRepository, saved: Employee): Promise<Employee> {
    const stored = await repo.findByUsername(saved.username);
    if (!stored) throw new Error(`Không đọc lại được hồ sơ ${saved.username} vừa lưu`);
    return stored;
  }

  /** Mọi dòng của một lần lưu dùng chung requestId để màn Nhật ký gộp thành "× N". */
  private async log(trx: DatabaseTransaction, actor: string, username: string, rows: StaffAuditRow[]): Promise<void> {
    const requestId = crypto.randomUUID();
    for (const row of rows) {
      await this.audit.append(trx, {
        actor,
        action: row.action,
        entityKind: 'staff',
        entityId: username,
        subject: username,
        before: row.before,
        after: row.after,
        sensitivity: row.sensitivity,
        requestId
      });
    }
  }

  async getPositionsCatalog(): Promise<any[]> {
    return await this.repo.listPositionCatalog();
  }

  async getShiftsCatalog(): Promise<any[]> {
    const rows = await this.repo.listShiftCatalog();
    return rows.map((row) => {
      const fixed = shiftByCode(row.code);
      return { ...row, startTime: fixed?.startTime ?? null, endTime: fixed?.endTime ?? null };
    });
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

    let passwordHash = existing?.account.passwordHash || NO_PASSWORD;
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
          : DEFAULT_SHIFT.startTime);

    const shiftEndTime =
      body.contract?.shift?.endTime ||
      body.shift?.endTime ||
      body.shiftEndTime ||
      body.endTime ||
      (existing?.contract.shift.type === shiftType
        ? existing?.contract.shift.endTime
        : shiftType === 'NIGHT'
          ? '06:00'
          : DEFAULT_SHIFT.endTime);

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

    const departmentInput =
      body.contract?.departmentId !== undefined ? body.contract.departmentId : body.departmentId;
    const departmentId = departmentInput !== undefined ? parseDepartmentId(departmentInput) : (existing?.contract.departmentId ?? null);
    const onLeaveFrom =
      body.contract?.onLeaveFrom !== undefined ? body.contract.onLeaveFrom : body.onLeaveFrom !== undefined ? body.onLeaveFrom : (existing?.contract.onLeaveFrom ?? null);
    const onLeaveTo =
      body.contract?.onLeaveTo !== undefined ? body.contract.onLeaveTo : body.onLeaveTo !== undefined ? body.onLeaveTo : (existing?.contract.onLeaveTo ?? null);

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
        departmentId,
        onLeaveFrom,
        onLeaveTo,
      }),
    });
  }
}

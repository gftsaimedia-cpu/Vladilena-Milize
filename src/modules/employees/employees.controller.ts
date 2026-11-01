import { AUDIT, AUTHZ, DOMAIN, RULES } from '../../core/tokens';
import { Controller, Get, Inject } from '@nestjs/common';
import { Ctx, ApiContext } from '../../http/api-context';

const config = require('../../platform/config');

const { HttpError } = require('../../platform/http');
const { validMonth } = require('../../domain/input');

const { UUID_RE } = require('../../domain/employee/employee-repository');

const bad = (message: string, code: string) => new HttpError(400, message, { code });
const notFound = () => new HttpError(404, 'Không có nhân viên này', { code: 'EMPLOYEE_NOT_FOUND' });

// Che như staffForViewer: lương bậc cần salary.read, ngày sinh cần profile.read.pii

/** Tra nhân viên theo uuid (truy vết bằng uuid, không bằng tài khoản). Sửa hồ sơ vẫn qua PUT /api/staff/:u (một đường ghi). */
@Controller('api')
export class EmployeesController {
  constructor(
    @Inject(RULES) private readonly rules: any,
    @Inject(DOMAIN) private readonly domain: any,
    @Inject(AUTHZ) private readonly authz: any,
    @Inject(AUDIT) private readonly audit: any
  ) {}

  forViewer = async (me: any, view: any) => {
    const target = { username: view.username };
    const out = { ...view, position: view.position ? { ...view.position } : null };
    if (!(await this.authz.can(me, 'salary.read', target)) && out.position) {
      delete out.position.baseSalary;
      delete out.position.kpiMax;
    }
    if (!(await this.authz.can(me, 'profile.read.pii', target))) delete out.birthday;
    return out;
  };

  /** ?month= hồ sơ + chức vụ/bậc của tháng + ca được xếp (Employee.view), che trường theo quyền như GET /api/staff */
  @Get('employees/:uuid')
  async view(@Ctx() c: ApiContext): Promise<unknown> {
    const uuid = this.uuidOf(c);
    const month = c.url.searchParams.get('month') || this.rules.vnToday().slice(0, 7);
    if (!validMonth(month)) throw bad('month phải dạng YYYY-MM', 'BAD_MONTH');
    const employee = await this.domain.employees.byUuid(uuid, month);
    if (!employee) throw notFound();
    return { month, employee: await this.forViewer(c.me, employee.view()) };
  }

  /** ?beforeId=&limit= nhật ký kiểm toán về người này, mới nhất trước (gộp cả dòng cũ ghi theo tài khoản) */
  @Get('employees/:uuid/trace')
  async trace(@Ctx() c: ApiContext): Promise<unknown> {
    const uuid = this.uuidOf(c);
    const { url, me, res } = c;
    const beforeId = url.searchParams.get('beforeId');
    if (beforeId !== null && !/^\d+$/.test(beforeId)) throw bad('beforeId phải là số nguyên không âm', 'BAD_CURSOR');
    const trace = await this.domain.employees.trace(uuid, {
      limit: Math.min(Number(url.searchParams.get('limit')) || config.AUDIT_PAGE_DEFAULT, config.AUDIT_PAGE_MAX),
      beforeId: beforeId === null ? undefined : Number(beforeId),
      sensitivities: await this.authz.auditSensitivities(me) // mức nhạy cảm theo năng lực người xem, như GET /api/audit
    });
    if (!trace) throw notFound();
    return { ...trace, items: trace.items.map(this.audit.publicRow) };
  }

  private uuidOf(c: ApiContext): string {
    const uuid = String(c.seg[2] || '').toLowerCase();
    if (!UUID_RE.test(uuid)) throw bad('uuid không hợp lệ', 'BAD_UUID');
    return uuid;
  }
}

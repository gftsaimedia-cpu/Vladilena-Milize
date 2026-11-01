import { AUDIT, AUTHZ, STORE } from '../../core/tokens';
import { Controller, Get, Inject } from '@nestjs/common';
import { Ctx, ApiContext } from '../../http/api-context';
import { vnDayIso } from './audit.helpers';

const { HttpError } = require('../../platform/http'); // tiện ích HTTP: lỗi, gửi JSON, đọc thân, tiêu đề bảo mật, file tĩnh
const { validMonth, validDate } = require('../../domain/input'); // kiểm dạng tháng, ngày, giờ, tên đăng nhập
// quyền theo năng lực: ROLE_CAPS, ROUTE_CAPS, can()
// nhật ký kiểm toán: ghi cùng giao dịch với thay đổi
const config = require('../../platform/config'); // giới hạn kỹ thuật có tên (không số trong mã)

@Controller('api')
export class AuditController {
  constructor(
    @Inject(AUTHZ) private readonly authz: any,
    @Inject(AUDIT) private readonly audit: any,
    @Inject(STORE) private readonly store: any
  ) {}

  /* ---------- nhật ký kiểm toán (chỉ đọc; không có API sửa hay xoá) ---------- */
  @Get('audit')
  async getAudit(@Ctx() c: ApiContext): Promise<unknown> {
    const { res, url, me, need } = c;
    need(); // năng lực audit.read đã kiểm ở cổng ROUTE_CAPS
    const q = url.searchParams,
      text = key => q.get(key) || undefined;
    const limit = q.has('limit') ? Number(q.get('limit')) : config.AUDIT_PAGE_DEFAULT;
    if (!Number.isInteger(limit) || limit < 1) throw new HttpError(400, 'limit phải là số nguyên dương');
    for (const key of ['afterId', 'beforeId'])
      if (q.has(key) && !/^\d+$/.test(q.get(key) ?? '')) throw new HttpError(400, `${key} phải là số nguyên không âm`);
    for (const key of ['from', 'to'])
      if (q.has(key) && !validDate(q.get(key))) throw new HttpError(400, `${key} phải dạng YYYY-MM-DD`);
    if (q.has('month') && !validMonth(q.get('month'))) throw new HttpError(400, 'month phải dạng YYYY-MM');
    const filter = {
      // Chỉ có ngày thì biên là đầu và cuối NGÀY GIỜ VIỆT NAM (không phải UTC), đổi sang ISO UTC để so với cột at
      from: q.has('from') ? vnDayIso(q.get('from'), 'start') : undefined,
      to: q.has('to') ? vnDayIso(q.get('to'), 'end') : undefined,
      actor: text('actor'),
      action: text('action'),
      entity: text('entity'),
      subject: text('subject'),
      month: text('month'),
      afterId: q.has('afterId') ? Number(q.get('afterId')) : undefined,
      beforeId: q.has('beforeId') ? Number(q.get('beforeId')) : undefined,
      // Mức nhạy cảm theo năng lực người xem
      sensitivities: await this.authz.auditSensitivities(me)
    };
    const size = Math.min(limit, config.AUDIT_PAGE_MAX);
    const rows = (await this.store.audit.list({ ...filter, limit: size })).map(this.audit.publicRow);
    return {
      rows,
      total: await this.store.audit.count(filter),
      limit: size,
      // Trang kế (mới → cũ): truyền nextBeforeId vào beforeId
      nextBeforeId: rows.length === size && !q.has('afterId') ? rows[rows.length - 1].id : null
    };
  }

  @Get('audit/verify')
  async getAuditVerify(@Ctx() c: ApiContext): Promise<unknown> {
    const { res, need } = c;
    need(); // năng lực audit.read đã kiểm ở cổng ROUTE_CAPS
    return await this.store.audit.verify();
  }
}

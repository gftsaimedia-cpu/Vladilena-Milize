import { Controller, Get, Post, Put, Res } from '@nestjs/common';
import { Ctx, ApiContext } from '../../http/api-context';
const store = require('../../../lib/db');
const events = require('../../../lib/events');
const entries = require('../../../lib/pay-entries');
const { HttpError, send, readJson } = require('../../../lib/http');
const { validMonth } = require('../../../lib/domain/input');

const ID_RE = /^[0-9]+$/;
function idOf(segment: string): number {
  if (!ID_RE.test(String(segment))) throw new HttpError(400, 'Mã khoản không hợp lệ', { code: 'BAD_ID' });
  return Number(segment);
}
// Khoản đã duyệt (hoặc có hiệu lực ngay) làm ước tính của người đó đổi: báo estimate.changed cho đúng người sau khi COMMIT
const notify = (entry: any) => {
  if (entry && entry.status === 'approved') events.emit.estimateChanged(entry.username, entry.month);
};

/**
 * Khoản điền thêm theo người theo tháng. Quyền đã kiểm ở cổng ROUTE_CAPS (lib/authz.js);
 * quy tắc, kiểm đầu vào, khoá kỳ và nhật ký ở lib/pay-entries.js.
 */
@Controller('api')
export class PayEntriesController {
  /** ?month=&username=&status= (salary.read) → { month, periodStatus, requireApproval, entries } */
  @Get('pay-entries')
  async list(@Ctx() c: ApiContext, @Res() _res: unknown): Promise<unknown> {
    const q = c.url.searchParams;
    const month = q.get('month');
    if (!validMonth(month)) throw new HttpError(400, 'month phải có dạng YYYY-MM', { code: 'BAD_MONTH' });
    const rows = await entries.list({ month, username: q.get('username') || undefined, status: q.get('status') || undefined });
    return send(c.res, 200, {
      month,
      periodStatus: await store.periods.status(month),
      requireApproval: (await entries.limitsFor(month)).requireApproval,
      entries: rows
    });
  }

  /** (salary.write) → { entry } */
  @Post('pay-entries')
  async create(@Ctx() c: ApiContext, @Res() _res: unknown): Promise<unknown> {
    const entry = await entries.create(await readJson(c.req), c.me, c.actx);
    notify(entry);
    return send(c.res, 200, { entry });
  }

  /** (salary.write) → { count, entries }; tất cả hoặc không */
  @Post('pay-entries/bulk')
  async createBulk(@Ctx() c: ApiContext, @Res() _res: unknown): Promise<unknown> {
    const made = await entries.createBulk(await readJson(c.req), c.me, c.actx);
    made.forEach(notify);
    return send(c.res, 200, { count: made.length, entries: made });
  }

  /** (salary.write) → { entry }; sửa khi chờ duyệt, cần rev */
  @Put('pay-entries/:id')
  async update(@Ctx() c: ApiContext, @Res() _res: unknown): Promise<unknown> {
    const entry = await entries.update(idOf(c.seg[2]), await readJson(c.req), c.me, c.actx);
    return send(c.res, 200, { entry });
  }

  /** { decision, note, rev } (payroll.approve) → { entry } */
  @Put('pay-entries/:id/decide')
  async decide(@Ctx() c: ApiContext, @Res() _res: unknown): Promise<unknown> {
    const entry = await entries.decide(idOf(c.seg[2]), await readJson(c.req), c.me, c.actx);
    notify(entry);
    return send(c.res, 200, { entry });
  }

  /** { rev?, reason? } (salary.write) → { entry } */
  @Post('pay-entries/:id/void')
  async void(@Ctx() c: ApiContext, @Res() _res: unknown): Promise<unknown> {
    const { entry, wasApproved } = await entries.voidEntry(idOf(c.seg[2]), await readJson(c.req), c.me, c.actx);
    if (wasApproved) events.emit.estimateChanged(entry.username, entry.month);
    return send(c.res, 200, { entry });
  }

  /** { rev } (config.legal) → { entry }; Kế toán xác nhận cờ thuế, bảo hiểm */
  @Post('pay-entries/:id/confirm-flags')
  async confirmFlags(@Ctx() c: ApiContext, @Res() _res: unknown): Promise<unknown> {
    const entry = await entries.confirmFlags(idOf(c.seg[2]), await readJson(c.req), c.me, c.actx);
    notify(entry);
    return send(c.res, 200, { entry });
  }
}

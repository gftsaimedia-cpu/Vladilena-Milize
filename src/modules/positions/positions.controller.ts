import { Controller, Get, Post } from '@nestjs/common';
import { Ctx, ApiContext } from '../../http/api-context';
const paramsSave = require('../../../lib/params/save');
const events = require('../../../lib/events');
const { HttpError, readJson } = require('../../../lib/http');
const { vnToday } = require('../../../lib/request-rules');
const { validMonth } = require('../../../lib/domain/input');
const { positionsView, entitlementsView } = require('../../../lib/domain/positions');

// Chức vụ và bảng quyền lợi theo tháng; quyền đã kiểm ở ROUTE_CAPS.
@Controller('api')
export class PositionsController {
  /** ?month= (config.read) */
  @Get('positions')
  async listPositions(@Ctx() c: ApiContext): Promise<unknown> {
    return await positionsView(this.monthOf(c));
  }

  /** ?month= (config.read) */
  @Get('entitlements')
  async listEntitlements(@Ctx() c: ApiContext): Promise<unknown> {
    return await entitlementsView(this.monthOf(c));
  }

  /** thêm chức vụ bằng sao chép */
  @Post('positions')
  async addPosition(@Ctx() c: ApiContext): Promise<unknown> {
    const saved = await paramsSave.addPosition(c.me, c.actx, await readJson(c.req));
    if (saved.notice) events.emit.paramsChanged(saved.notice);
    return saved;
  }

  /** thêm bậc cho một chức vụ */
  @Post('positions/:code/levels')
  async addLevel(@Ctx() c: ApiContext): Promise<unknown> {
    const saved = await paramsSave.addLevel(c.me, c.actx, c.seg[2], await readJson(c.req));
    if (saved.notice) events.emit.paramsChanged(saved.notice);
    return saved;
  }

  private monthOf(c: ApiContext): string {
    const month = c.url.searchParams.get('month') || vnToday().slice(0, 7);
    if (!validMonth(month)) throw new HttpError(400, 'month phải dạng YYYY-MM', { code: 'BAD_MONTH' });
    return month;
  }
}

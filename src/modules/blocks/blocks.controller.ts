import { Controller, Post, Put, Res } from '@nestjs/common';
import { Ctx, ApiContext } from '../../http/api-context';
const paramsSave = require('../../../lib/params/save');
const events = require('../../../lib/events');
const { HttpError, send, readJson } = require('../../../lib/http');

// Khối phụ cấp do C&B thêm. Cả hai route đi qua save() của lib/params/save.js (một giao dịch, tháng áp dụng, lý do, nhật ký, khoá kỳ)
// rồi báo params.changed SAU khi đã COMMIT. Quyền đã kiểm ở ROUTE_CAPS.
const CODE_RE = /^[a-z][a-z0-9]*$/;

@Controller('api')
export class BlocksController {
  /** (config.payroll) { label, method, values | positions, … } → { code, block, …kết quả save() } */
  @Post('blocks')
  async add(@Ctx() c: ApiContext, @Res() _res: unknown): Promise<unknown> {
    const saved = await paramsSave.addBlock(c.me, c.actx, await readJson(c.req));
    if (saved.notice) events.emit.paramsChanged(saved.notice);
    return send(c.res, 200, saved);
  }

  /** (config.legal) { basis, effectiveMonth? } → { code, confirmedBy, confirmedAt, … } */
  @Put('blocks/:code/confirm')
  async confirm(@Ctx() c: ApiContext, @Res() _res: unknown): Promise<unknown> {
    if (!CODE_RE.test(c.seg[2])) throw new HttpError(400, 'Mã khoản không hợp lệ', { code: 'BAD_ID' });
    const saved = await paramsSave.confirmBlock(c.me, c.actx, c.seg[2], await readJson(c.req));
    if (saved.notice) events.emit.paramsChanged(saved.notice);
    return send(c.res, 200, saved);
  }
}

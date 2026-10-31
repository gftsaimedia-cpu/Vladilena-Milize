import { Controller, Get, Res } from '@nestjs/common';
import { Ctx, ApiContext } from '../../http/api-context';
const store = require('../../../lib/db');
const { send } = require('../../../lib/http'); // tiện ích HTTP: lỗi, gửi JSON, đọc thân, tiêu đề bảo mật, file tĩnh
const events = require('../../../lib/events'); // báo cho màn đang mở (SSE), phát SAU KHI giao dịch đã COMMIT
const { monitor } = require('../../http/load-control'); // giới hạn tải dùng chung với cổng ApiGuard (src/http)

@Controller('api')
export class SystemController {
  // Cho proxy/giám sát: tiến trình còn sống, DB trả lời được, vòng lặp có đang nghẽn không. Không lộ dữ liệu nghiệp vụ.
  @Get('health')
  async getHealth(@Ctx() c: ApiContext, @Res() _res: unknown): Promise<unknown> {
    const { res } = c;
    await store.db.prepare('SELECT 1').get();
    return send(res, 200, { ok: true, ...monitor.snapshot() });
  }

  @Get('events')
  async getEvents(@Ctx() c: ApiContext, @Res() _res: unknown): Promise<unknown> {
    const { req, res, need } = c;
    const listener = need(); // mọi người đã đăng nhập; luồng này chỉ gợi ý nạp lại, không mang dữ liệu
    return await events.handleSse(req, res, listener);
  }
}

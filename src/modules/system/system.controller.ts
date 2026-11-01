import { EVENTS, STORE } from '../../core/tokens';
import { Controller, Get, Res, Inject } from '@nestjs/common';
import { Ctx, ApiContext } from '../../http/api-context';

const {} = require('../../platform/http'); // tiện ích HTTP: lỗi, gửi JSON, đọc thân, tiêu đề bảo mật, file tĩnh
// báo cho màn đang mở (SSE), phát SAU KHI giao dịch đã COMMIT
const { monitor } = require('../../http/load-control'); // giới hạn tải dùng chung với cổng ApiGuard (src/http)

@Controller('api')
export class SystemController {
  constructor(
    @Inject(STORE) private readonly store: any,
    @Inject(EVENTS) private readonly events: any
  ) {}

  // Cho proxy/giám sát: tiến trình còn sống, DB trả lời được, vòng lặp có đang nghẽn không. Không lộ dữ liệu nghiệp vụ.
  @Get('health')
  async getHealth(@Ctx() c: ApiContext): Promise<unknown> {
    const { res } = c;
    await this.store.db.prepare('SELECT 1').get();
    return { ok: true, ...monitor.snapshot() };
  }

  @Get('events')
  async getEvents(@Ctx() c: ApiContext, @Res() _res: unknown): Promise<unknown> {
    const { req, res, need } = c;
    const listener = need(); // mọi người đã đăng nhập; luồng này chỉ gợi ý nạp lại, không mang dữ liệu
    return await this.events.handleSse(req, res, listener);
  }
}

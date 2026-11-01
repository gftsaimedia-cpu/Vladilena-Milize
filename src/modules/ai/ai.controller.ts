import { Controller, Get, Post } from '@nestjs/common';
import { Ctx, ApiContext } from '../../http/api-context';
const store = require('../../../lib/db');
const { HttpError, readJson } = require('../../../lib/http'); // tiện ích HTTP: lỗi, gửi JSON, đọc thân, tiêu đề bảo mật, file tĩnh
const { validMonth } = require('../../../lib/domain/input'); // kiểm dạng tháng, ngày, giờ, tên đăng nhập
const { aiReviewResultCached } = require('../../../lib/domain/ai-review'); // kết quả soát dữ liệu của AI
const agents = require('../../../lib/agents'); // công tắc Agents
const findings = require('../../../lib/findings'); // bỏ qua phát hiện AI của phiếu, có lý do

@Controller('api')
export class AiController {
  @Get('ai/review')
  async getAiReview(@Ctx() c: ApiContext): Promise<unknown> {
    const { res, url, route, needAdmin } = c;
    needAdmin();
    await agents.assertEnabled();
    const month = url.searchParams.get('month');
    if (!validMonth(month)) throw new HttpError(400, 'month phải dạng YYYY-MM');
    // Thêm vào kết quả kiểm tra trực tiếp: trạng thái kỳ và từng phát hiện đã được bỏ qua chưa (by, at, note chỉ cho người có ai.review.read, cũng là cổng của route này)
    const review = await aiReviewResultCached(month, url.searchParams.get('impacts') === '1');
    return {
      ...review,
      findings: await findings.annotate(month, review.findings),
      period: { status: (await store.periods.get(month)).status }
    };
  }

  // route-key: POST /ai/findings
  @Post('ai/findings/dismiss')
  async postAiFindingsDismiss(@Ctx() c: ApiContext): Promise<unknown> {
    const { req, res, actx, needAdmin } = c;
    const admin = needAdmin();
    await agents.assertEnabled();
    const b = await readJson(req);
    if (!validMonth(b.month)) throw new HttpError(400, 'month phải dạng YYYY-MM');
    const dismissed = await findings.dismiss(
      { month: b.month, username: b.username, rule: b.rule, reason: b.reason, by: admin.username },
      actx
    );
    return dismissed;
  }
}

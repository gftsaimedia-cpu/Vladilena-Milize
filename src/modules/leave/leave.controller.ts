import { Controller, Get, Post, Res } from '@nestjs/common';
import { Ctx, ApiContext } from '../../http/api-context';
const store = require('../../../lib/db');
const authz = require('../../../lib/authz');
const { HttpError, send, readJson } = require('../../../lib/http');
const { USERNAME_RE } = require('../../../lib/domain/input');
const { container } = require('../../../lib/domain/container');

const bad = (message: string, code: string) => new HttpError(400, message, { code });

async function staffOf(username: string) {
  if (!USERNAME_RE.test(username)) throw bad('user không hợp lệ', 'BAD_USER');
  const staff = await store.getStaff(username);
  if (!staff) throw new HttpError(404, 'Không có nhân viên này', { code: 'STAFF_NOT_FOUND' });
  return staff;
}

/**
 * Sổ phép năm lưu sẵn (vừa lưu vừa tính, tự cập nhật khi qua tháng làm việc tròn hoặc sinh nhật).
 * Đọc sổ cũng làm mới người đó, nên số luôn đúng tới hôm nay dù hẹn giờ chưa chạy.
 */
@Controller('api')
export class LeaveController {
  /** [?user=] số dư hiện tại + các lần cộng/hết hạn của một người (mặc định chính mình); xem người khác cần profile.read */
  @Get('leave/ledger')
  async ledger(@Ctx() c: ApiContext, @Res() _res: unknown): Promise<unknown> {
    const { url, me, res } = c;
    const username = (url.searchParams.get('user') || me.username).toLowerCase();
    if (username !== me.username && !(await authz.can(me, 'profile.read', { username })))
      throw new HttpError(403, 'Không có quyền xem sổ phép của người khác', { code: 'FORBIDDEN_CAP' });
    const staff = await staffOf(username);
    const result = await container.leave.refresh(staff);
    return send(res, 200, {
      username,
      uuid: staff.uuid,
      hasAccount: !!result,
      balance: result ? result.balance : null,
      on: result ? result.on : null,
      summary: result ? result.summary : null,
      events: result ? await container.leave.ledger.eventsOf(staff.uuid) : []
    });
  }

  /** { user? } tính lại ngay một người (user) hoặc mọi người; cần profile.write */
  @Post('leave/refresh')
  async refresh(@Ctx() c: ApiContext, @Res() _res: unknown): Promise<unknown> {
    const leave = container.leave;
    const body = (await readJson(c.req)) || {};
    if (body.user) {
      const staff = await staffOf(String(body.user).toLowerCase());
      const result = await leave.refresh(staff);
      return send(c.res, 200, {
        checked: 1,
        accounts: result ? 1 : 0,
        failed: 0,
        balance: result ? result.balance : null
      });
    }
    return send(c.res, 200, await leave.refreshAll());
  }
}

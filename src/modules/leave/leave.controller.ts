import { AUTHZ, DOMAIN, STORE } from '../../core/tokens';
import { Controller, Get, Post, Inject } from '@nestjs/common';
import { Ctx, ApiContext } from '../../http/api-context';

const { HttpError, readJson } = require('../../platform/http');
const { USERNAME_RE } = require('../../domain/input');

const bad = (message: string, code: string) => new HttpError(400, message, { code });

/**
 * Sổ phép năm lưu sẵn (vừa lưu vừa tính, tự cập nhật khi qua tháng làm việc tròn hoặc sinh nhật).
 * Đọc sổ cũng làm mới người đó, nên số luôn đúng tới hôm nay dù hẹn giờ chưa chạy.
 */
@Controller('api')
export class LeaveController {
  constructor(
    @Inject(AUTHZ) private readonly authz: any,
    @Inject(DOMAIN) private readonly domain: any,
    @Inject(STORE) private readonly store: any
  ) {}

  staffOf = async (username: string) => {
    if (!USERNAME_RE.test(username)) throw bad('user không hợp lệ', 'BAD_USER');
    const staff = await this.store.getStaff(username);
    if (!staff) throw new HttpError(404, 'Không có nhân viên này', { code: 'STAFF_NOT_FOUND' });
    return staff;
  };

  /** [?user=] số dư hiện tại + các lần cộng/hết hạn của một người (mặc định chính mình); xem người khác cần profile.read */
  @Get('leave/ledger')
  async ledger(@Ctx() c: ApiContext): Promise<unknown> {
    const { url, me, res } = c;
    const username = (url.searchParams.get('user') || me.username).toLowerCase();
    if (username !== me.username && !(await this.authz.can(me, 'profile.read', { username })))
      throw new HttpError(403, 'Không có quyền xem sổ phép của người khác', { code: 'FORBIDDEN_CAP' });
    const staff = await this.staffOf(username);
    const result = await this.domain.leave.refresh(staff);
    return {
      username,
      uuid: staff.uuid,
      hasAccount: !!result,
      balance: result ? result.balance : null,
      on: result ? result.on : null,
      summary: result ? result.summary : null,
      events: result ? await this.domain.leave.ledger.eventsOf(staff.uuid) : []
    };
  }

  /** { user? } tính lại ngay một người (user) hoặc mọi người; cần profile.write */
  @Post('leave/refresh')
  async refresh(@Ctx() c: ApiContext): Promise<unknown> {
    const leave = this.domain.leave;
    const body = (await readJson(c.req)) || {};
    if (body.user) {
      const staff = await this.staffOf(String(body.user).toLowerCase());
      const result = await leave.refresh(staff);
      return {
        checked: 1,
        accounts: result ? 1 : 0,
        failed: 0,
        balance: result ? result.balance : null
      };
    }
    return await leave.refreshAll();
  }
}

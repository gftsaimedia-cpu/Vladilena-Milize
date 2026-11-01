import { AUDIT, AUTH, AUTHZ, DOMAIN, EVENTS, RULES, STORE } from '../../core/tokens';
import { Controller, Post, Get, Put, Inject } from '@nestjs/common';
import { Ctx, ApiContext } from '../../http/api-context';
import { Reply } from '../../http/reply';
import { LOCKED_MESSAGE, loginAddress } from './auth.helpers';

const { HttpError, readJson } = require('../../platform/http'); // tiện ích HTTP: lỗi, gửi JSON, đọc thân, tiêu đề bảo mật, file tĩnh
// quy tắc theo tháng của từng yêu cầu: rulesFor(tháng).<mô-đun> dựng bằng create(bộ tham số của tháng đó)
const { publicStaff } = require('../../domain/staff'); // hồ sơ gửi ra ngoài, che trường theo quyền
// các lớp của src/domain dựng một lần
// quyền theo năng lực: ROLE_CAPS, ROUTE_CAPS, can()
// nhật ký kiểm toán: ghi cùng giao dịch với thay đổi
const config = require('../../platform/config'); // giới hạn kỹ thuật có tên (không số trong mã)
const { myPosition } = require('../../domain/positions'); // cờ quyền lợi và chức vụ
// báo cho màn đang mở (SSE), phát SAU KHI giao dịch đã COMMIT
const { hashGate } = require('../../http/load-control'); // giới hạn tải dùng chung với cổng ApiGuard (src/http)

@Controller('api')
export class AuthController {
  constructor(
    @Inject(AUTH) private readonly auth: any,
    @Inject(STORE) private readonly store: any,
    @Inject(DOMAIN) private readonly domain: any,
    @Inject(EVENTS) private readonly events: any,
    @Inject(RULES) private readonly rules: any,
    @Inject(AUTHZ) private readonly authz: any,
    @Inject(AUDIT) private readonly audit: any
  ) {}

  @Post('login')
  async postLogin(@Ctx() c: ApiContext): Promise<unknown> {
    const { req, res } = c;
    const { username, password } = await readJson(req);
    const u = String(username || '')
      .trim()
      .toLowerCase();
    const key = this.auth.loginKey(loginAddress(req), u);
    const wait = this.auth.loginWait(key);
    if (wait > 0)
      return new Reply(
        429,
        { error: `Đăng nhập sai quá nhiều lần. Thử lại sau ${Math.ceil(wait / 60)} phút.` },
        { 'Retry-After': String(wait) }
      );
    const row = await this.store.getStaffRow(u);
    // Tên không có thật cũng chạy băm mật khẩu và nhận cùng thông báo, để không đoán được tên nào có thật
    if (!(await hashGate.run(() => this.auth.verifyLoginAsync(String(password || ''), row)))) {
      const { addressWait } = this.auth.loginFailed(key);
      // Lần sai vừa làm cả địa chỉ bị khoá (thử mật khẩu trên nhiều tài khoản)
      if (addressWait > 0)
        return new Reply(
          429,
          { error: `Đăng nhập sai quá nhiều lần. Thử lại sau ${Math.ceil(addressWait / 60)} phút.` },
          { 'Retry-After': String(addressWait) }
        );
      throw new HttpError(401, 'Sai tên đăng nhập hoặc mật khẩu');
    }
    // Kiểm khoá TRƯỚC khi ghi nhận thành công: mật khẩu đúng của một tài khoản đã bị khoá không được xoá bộ đếm dò
    if (row.locked_at) throw new HttpError(403, LOCKED_MESSAGE);
    this.auth.loginSucceeded(key);
    return new Reply(
      200,
      {
        user: await publicStaff(await this.store.getStaff(u)),
        holidays: await this.store.getSetting('holidays', []),
        ...(await this.domain.geofencePolicy.viewFor(await this.store.getStaff(u)))
      },
      { 'Set-Cookie': this.auth.cookieHeader(await this.auth.createSession(u), this.auth.SESSION_MAX_AGE_SEC) }
    );
  }

  @Post('logout')
  async postLogout(@Ctx() c: ApiContext): Promise<unknown> {
    const { res, me } = c;
    // Đăng xuất thu hồi phiên: mọi cookie cũ của tài khoản này hết hiệu lực, kể cả bản bị sao chép
    if (me) {
      await this.store.bumpSessionVersion(me.username);
      this.events.closeUser(me.username, 'logout');
    }
    return new Reply(200, { ok: true }, { 'Set-Cookie': this.auth.cookieHeader('', 0) });
  }

  @Get('me')
  async getMe(@Ctx() c: ApiContext): Promise<unknown> {
    const { res, me, route } = c;
    return {
      user: me ? await publicStaff(me) : null,
      serverNow: this.rules.nowIso(), // giờ máy chủ (ISO), để app nhân viên tính lệch đồng hồ điện thoại (NV.skewMs)
      // Vai trò và năng lực hiệu lực. Chế độ HR / Nhân viên là trạng thái giao diện, máy chủ luôn kiểm theo năng lực.
      roles: await this.authz.rolesOf(me),
      caps: await this.authz.capsOf(me),
      payrollSubject: !!(me && me.payrollSubject),
      holidays: await this.store.getSetting('holidays', []),
      ...(await myPosition(me)),
      ...(await this.domain.geofencePolicy.viewFor(me))
    };
  }

  @Put('password')
  async putPassword(@Ctx() c: ApiContext): Promise<unknown> {
    const { req, res, actx, need } = c;
    const u = need();
    const { current, next } = await readJson(req);
    if (
      !(await this.auth.verifyPasswordAsync(
        String(current || ''),
        (await this.store.getStaffRow(u.username)).pass_hash
      ))
    )
      throw new HttpError(400, 'Mật khẩu hiện tại không đúng');
    if (String(next || '').length < config.PASSWORD_MIN_LENGTH)
      throw new HttpError(400, `Mật khẩu mới cần ít nhất ${config.PASSWORD_MIN_LENGTH} ký tự`);
    const passHash = await this.auth.hashPasswordAsync(String(next));
    await this.store.transaction(async () => {
      await this.store.setPassword(u.username, passHash);
      // Chỉ ghi hành động, không bao giờ ghi mật khẩu hay hàm băm
      await this.audit.write(actx, {
        action: 'password.change',
        entityKind: 'staff',
        entityId: u.username,
        subject: u.username
      });
    });
    await this.store.bumpSessionVersion(u.username); // phiên cũ hết hiệu lực; cấp phiên mới cho trình duyệt đang đổi
    this.events.closeUser(u.username, 'password'); // luồng cũ gắn với cookie cũ; trình duyệt này nối lại bằng cookie mới
    return new Reply(
      200,
      { ok: true },
      { 'Set-Cookie': this.auth.cookieHeader(await this.auth.createSession(u.username), this.auth.SESSION_MAX_AGE_SEC) }
    );
  }
}

import { Controller, Post, Get, Put } from '@nestjs/common';
import { Ctx, ApiContext } from '../../http/api-context';
import { Reply } from '../../http/reply';
import { LOCKED_MESSAGE, loginAddress } from './auth.helpers';
const store = require('../../../lib/db');
const auth = require('../../../lib/auth');
const { HttpError, readJson } = require('../../../lib/http'); // tiện ích HTTP: lỗi, gửi JSON, đọc thân, tiêu đề bảo mật, file tĩnh
const { nowIso } = require('../../../lib/request-rules'); // quy tắc theo tháng của từng yêu cầu: rulesFor(tháng).<mô-đun> dựng bằng create(bộ tham số của tháng đó)
const { publicStaff } = require('../../../lib/domain/staff'); // hồ sơ gửi ra ngoài, che trường theo quyền
const { container } = require('../../../lib/domain/container'); // các lớp của lib/domain dựng một lần
const agents = require('../../../lib/agents'); // công tắc Agents
const authz = require('../../../lib/authz'); // quyền theo năng lực: ROLE_CAPS, ROUTE_CAPS, can()
const audit = require('../../../lib/audit'); // nhật ký kiểm toán: ghi cùng giao dịch với thay đổi
const config = require('../../../lib/config'); // giới hạn kỹ thuật có tên (không số trong mã)
const { myPosition } = require('../../../lib/domain/positions'); // cờ quyền lợi và chức vụ
const events = require('../../../lib/events'); // báo cho màn đang mở (SSE), phát SAU KHI giao dịch đã COMMIT
const { hashGate } = require('../../http/load-control'); // giới hạn tải dùng chung với cổng ApiGuard (src/http)

@Controller('api')
export class AuthController {
  @Post('login')
  async postLogin(@Ctx() c: ApiContext): Promise<unknown> {
    const { req, res } = c;
    const { username, password } = await readJson(req);
    const u = String(username || '')
      .trim()
      .toLowerCase();
    const key = auth.loginKey(loginAddress(req), u);
    const wait = auth.loginWait(key);
    if (wait > 0)
      return new Reply(
        429,
        { error: `Đăng nhập sai quá nhiều lần. Thử lại sau ${Math.ceil(wait / 60)} phút.` },
        { 'Retry-After': String(wait) }
      );
    const row = await store.getStaffRow(u);
    // Tên không có thật cũng chạy băm mật khẩu và nhận cùng thông báo, để không đoán được tên nào có thật
    if (!(await hashGate.run(() => auth.verifyLoginAsync(String(password || ''), row)))) {
      const { addressWait } = auth.loginFailed(key);
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
    auth.loginSucceeded(key);
    return new Reply(
      200,
      {
        user: await publicStaff(await store.getStaff(u)),
        holidays: await store.getSetting('holidays', []),
        ...(await container.geofencePolicy.viewFor(await store.getStaff(u)))
      },
      { 'Set-Cookie': auth.cookieHeader(await auth.createSession(u), auth.SESSION_MAX_AGE_SEC) }
    );
  }

  @Post('logout')
  async postLogout(@Ctx() c: ApiContext): Promise<unknown> {
    const { res, me } = c;
    // Đăng xuất thu hồi phiên: mọi cookie cũ của tài khoản này hết hiệu lực, kể cả bản bị sao chép
    if (me) {
      await store.bumpSessionVersion(me.username);
      events.closeUser(me.username, 'logout');
    }
    return new Reply(200, { ok: true }, { 'Set-Cookie': auth.cookieHeader('', 0) });
  }

  @Get('me')
  async getMe(@Ctx() c: ApiContext): Promise<unknown> {
    const { res, me, route } = c;
    return {
      user: me ? await publicStaff(me) : null,
      serverNow: nowIso(), // giờ máy chủ (ISO), để app nhân viên tính lệch đồng hồ điện thoại (NV.skewMs)
      // Vai trò và năng lực hiệu lực. Chế độ HR / Nhân viên là trạng thái giao diện, máy chủ luôn kiểm theo năng lực.
      roles: await authz.rolesOf(me),
      caps: await authz.capsOf(me),
      payrollSubject: !!(me && me.payrollSubject),
      agentsEnabled: await agents.enabled(), // công tắc Agents (route /settings/agents)
      holidays: await store.getSetting('holidays', []),
      ...(await myPosition(me)),
      ...(await container.geofencePolicy.viewFor(me))
    };
  }

  @Put('password')
  async putPassword(@Ctx() c: ApiContext): Promise<unknown> {
    const { req, res, actx, need } = c;
    const u = need();
    const { current, next } = await readJson(req);
    if (!(await auth.verifyPasswordAsync(String(current || ''), (await store.getStaffRow(u.username)).pass_hash)))
      throw new HttpError(400, 'Mật khẩu hiện tại không đúng');
    if (String(next || '').length < config.PASSWORD_MIN_LENGTH)
      throw new HttpError(400, `Mật khẩu mới cần ít nhất ${config.PASSWORD_MIN_LENGTH} ký tự`);
    const passHash = await auth.hashPasswordAsync(String(next));
    await store.transaction(async () => {
      await store.setPassword(u.username, passHash);
      // Chỉ ghi hành động, không bao giờ ghi mật khẩu hay hàm băm
      await audit.write(actx, {
        action: 'password.change',
        entityKind: 'staff',
        entityId: u.username,
        subject: u.username
      });
    });
    await store.bumpSessionVersion(u.username); // phiên cũ hết hiệu lực; cấp phiên mới cho trình duyệt đang đổi
    events.closeUser(u.username, 'password'); // luồng cũ gắn với cookie cũ; trình duyệt này nối lại bằng cookie mới
    return new Reply(
      200,
      { ok: true },
      { 'Set-Cookie': auth.cookieHeader(await auth.createSession(u.username), auth.SESSION_MAX_AGE_SEC) }
    );
  }
}

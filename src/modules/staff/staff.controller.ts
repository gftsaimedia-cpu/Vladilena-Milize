import { AUDIT, AUTH, AUTHZ, DOMAIN, EVENTS, RULES, STORE } from '../../core/tokens';
import { Controller, Get, Post, Put, Inject } from '@nestjs/common';
const crypto = require('node:crypto');
import { Ctx, ApiContext } from '../../http/api-context';
import { Reply } from '../../http/reply';
import { reasonOf } from '../../shared/reason';
const { staffView: staffScheduleView } = require('../../domain/schedule');
import { rolesOfStaff, rolesRevOf } from './staff.helpers';
const { AsyncList } = require('../../shared/async-list');

const { HttpError, readJson } = require('../../platform/http'); // tiện ích HTTP: lỗi, gửi JSON, đọc thân, tiêu đề bảo mật, file tĩnh
// quy tắc theo tháng của từng yêu cầu: rulesFor(tháng).<mô-đun> dựng bằng create(bộ tham số của tháng đó)
const { estimateSheet, schedule } = require('../../domain/sheet'); // lịch ước tính và ngày phép
const { staffForViewer, sheetForViewer, staffRevision } = require('../../domain/staff'); // hồ sơ gửi ra ngoài, che trường theo quyền
const { closeStaleFor } = require('../../domain/attendance'); // phiên Check-in/out dùng chung
const { sessionsFor } = require('../../domain/attendance/session-view');
const { sheetApprovals, reconcileStaffType } = require('../../domain/approvals'); // khoản tự khai chờ duyệt
// quyền theo năng lực: ROLE_CAPS, ROUTE_CAPS, can()
const Roles = require('../../domain/roles/roles'); // vai trò tuỳ chỉnh (dữ liệu ở settings)
// nhật ký kiểm toán: ghi cùng giao dịch với thay đổi
const config = require('../../platform/config'); // giới hạn kỹ thuật có tên (không số trong mã)
const Positions = require('../../params/positions'); // chức vụ là dữ liệu: danh sách, quyền lợi, bảng quyền lợi
const { activeCodesOf, withLeave } = require('../../domain/positions'); // cờ quyền lợi và chức vụ
// báo cho màn đang mở (SSE), phát SAU KHI giao dịch đã COMMIT
// các lớp của src/domain (danh mục ca, sổ phép, nhân viên theo uuid)
const { PersonName } = require('../../domain/employee/person-name'); // họ trước, tên sau
const warnings = require('../../platform/warnings'); // cảnh báo thay cho chặn
const { validMonth, validDate, USERNAME_RE } = require('../../domain/input'); // kiểm dạng tháng, ngày, giờ, tên đăng nhập
const { warnIf, selfDecision } = warnings;

@Controller('api')
export class StaffController {
  constructor(
    @Inject(RULES) private readonly rules: any,
    @Inject(STORE) private readonly store: any,
    @Inject(DOMAIN) private readonly domain: any,
    @Inject(AUTHZ) private readonly authz: any,
    @Inject(AUTH) private readonly auth: any,
    @Inject(AUDIT) private readonly audit: any,
    @Inject(EVENTS) private readonly events: any
  ) {}

  @Get('staff')
  async getStaff(@Ctx() c: ApiContext): Promise<unknown> {
    const { res, me, needAdmin } = c;
    needAdmin();
    const listParams = await this.rules.monthParams();
    return {
      staff: await AsyncList.map(
        await this.store.listStaff(),
        async s => await staffForViewer(me, s.payrollSubject ? await withLeave(listParams, s) : s)
      )
    };
  }

  @Get('team')
  async getTeam(@Ctx() c: ApiContext): Promise<unknown> {
    const { res, url, me, needAdmin } = c;
    needAdmin();
    const month = url.searchParams.get('month');
    if (!validMonth(month)) throw new HttpError(400, 'month phải dạng YYYY-MM');
    const kpiRows = new Map((await this.store.listKpiScores(month)).map(row => [row.username, row]));
    const teamParams = await this.rules.monthParams(month);
    const teamSchedule = await schedule.team(month); // lịch của từng loại nhân sự
    const people = (await this.store.listStaff()).filter(s => s.payrollSubject);
    await closeStaleFor(people);
    // Lượt chấm công của cả tháng nạp MỘT lần (kèm lượt bấm và điều chỉnh), rồi chia theo người
    const sessionsOf = new Map();
    for (const session of await sessionsFor({ month })) {
      if (!sessionsOf.has(session.username)) sessionsOf.set(session.username, []);
      sessionsOf.get(session.username).push(session);
    }
    const rows = await AsyncList.map(people, async s => {
      const sh = await estimateSheet(s.username, month),
        attendanceSessions = sessionsOf.get(s.username) || [],
        approvals = await sheetApprovals(s.username, month, sh.days);
      return {
        staff: await staffForViewer(me, await withLeave(teamParams, s)),
        ...(await sheetForViewer(me, s.username, sh)),
        approvals,
        kpiParts: await this.domain.kpi.partsView(
          (await this.domain.kpi.has(s, teamParams)) &&
            (await this.authz.can(me, 'salary.read', { username: s.username }))
            ? kpiRows.get(s.username)
            : null,
          month,
          me
        ),
        pendingApprovals: Object.values(approvals as Record<string, any>).filter(x => x.status === 'pending').length,
        attendanceSessions,
        pendingDays: attendanceSessions.filter(s => s.entry.kind === 'pending' && s.entry.reason !== 'open').length,
        pendingOt: attendanceSessions.filter(s => s.entry.extraKind === 'ot' && !s.entry.otReview).length
      };
    });
    return {
      month,
      rows,
      schedules: teamSchedule.schedules,
      holidays: await this.store.getSetting('holidays', [])
    };
  }

  // Đặt lại mật khẩu của tài khoản KHÁC (màn Tài khoản): cần roles.manage ở cổng; không dùng cho chính mình (PUT /password). Mọi phiên cũ của người đó hết hiệu lực.
  @Post('staff/:u/password')
  async postStaffPassword(@Ctx() c: ApiContext): Promise<unknown> {
    const { req, res, seg, actx, needAdmin } = c;
    const admin = needAdmin(),
      b = await readJson(req);
    let username;
    try {
      username = decodeURIComponent(seg[2]).toLowerCase();
    } catch {
      throw new HttpError(400, 'Tên đăng nhập không hợp lệ');
    }
    if (username === admin.username)
      throw new HttpError(400, 'Không đặt lại mật khẩu của chính mình ở đây; dùng chức năng đổi mật khẩu của tôi', {
        code: 'USE_OWN_PASSWORD'
      });
    if (!(await this.store.getStaffRow(username))) throw new HttpError(404, 'Không có tài khoản này');
    if (typeof b.password !== 'string' || b.password.length < config.PASSWORD_MIN_LENGTH)
      throw new HttpError(400, `Mật khẩu cần ít nhất ${config.PASSWORD_MIN_LENGTH} ký tự`);
    const reason = reasonOf(b.reason);
    const passHash = await this.auth.hashPasswordAsync(b.password);
    await this.store.transaction(async () => {
      await this.store.setPassword(username, passHash);
      // Chỉ ghi hành động và lý do, không bao giờ ghi mật khẩu hay hàm băm
      await this.audit.write(actx, {
        action: 'password.reset',
        entityKind: 'staff',
        entityId: username,
        subject: username,
        reason: reason || null
      });
    });
    await this.store.bumpSessionVersion(username); // mọi phiên cũ của người đó hết hiệu lực
    this.events.closeUser(username, 'password');
    return { ok: true };
  }

  @Put('staff/:u/roles')
  async putStaffRoles(@Ctx() c: ApiContext): Promise<unknown> {
    const { req, res, seg, actx, needAdmin } = c;
    const admin = needAdmin(),
      b = await readJson(req);
    let username;
    try {
      username = decodeURIComponent(seg[2]).toLowerCase();
    } catch {
      throw new HttpError(400, 'Tên đăng nhập không hợp lệ');
    }
    const target = await this.store.getStaff(username);
    if (!target) throw new HttpError(404, 'Không có tài khoản này');
    const known = [...(await Roles.knownRoleSet())];
    if (!Array.isArray(b.roles) || b.roles.some(r => typeof r !== 'string' || !known.includes(r)))
      throw new HttpError(400, `roles phải là mảng vai trò có trong hệ thống: ${known.join(', ')}`);
    const reason = reasonOf(b.reason);
    if (b.expectedRev !== undefined && b.expectedRev !== null && !Number.isInteger(b.expectedRev))
      throw new HttpError(400, 'expectedRev phải là số nguyên');
    const want = [...new Set(b.roles)].sort();
    const outcome = await this.store.transaction(async () => {
      const history = await this.store.roles.list({ username, includeRevoked: true });
      const rev = rolesRevOf(history);
      if (b.expectedRev !== undefined && b.expectedRev !== null && b.expectedRev !== rev)
        throw new HttpError(409, 'Vai trò của tài khoản này vừa được người khác đổi, tải lại rồi làm lại', {
          code: 'ROLES_STALE',
          rev
        });
      const current = await rolesOfStaff(target);
      const stored = await this.store.roles.activeRoles(username);
      const toGrant = want.filter(r => !current.includes(r));
      const toRevoke = current.filter(r => !want.includes(r));
      if (username === admin.username && current.includes('admin') && !want.includes('admin'))
        throw new HttpError(403, 'Không thể tự bỏ quyền Admin của mình', { code: 'SELF_ADMIN_REMOVAL' });
      for (const role of toRevoke)
        if (!stored.includes(role) && role !== 'staff')
          // staff dẫn xuất từ payrollSubject: gỡ được, tắt cờ ở bên dưới
          throw new HttpError(
            409,
            role === 'admin'
              ? 'Đây là tài khoản Admin gốc: đổi loại tài khoản ở Hồ sơ nhân sự, không gỡ ở đây được'
              : 'Vai trò staff là mặc định của nhân sự được trả lương, không gỡ được',
            { code: 'ROLE_DERIVED', role }
          );
      // Vai trò tuỳ chỉnh đã ngưng dùng chỉ để gỡ, không gán mới được
      const customRoles = (await this.authz.customTable()).roles;
      const deprecatedGrant = toGrant.find(r => customRoles.some(d => d.code === r && d.deprecated));
      if (deprecatedGrant)
        throw new HttpError(400, 'Vai trò đã ngưng dùng, không gán mới được', {
          code: 'ROLE_DEPRECATED',
          role: deprecatedGrant
        });
      for (const role of toGrant) await this.store.roles.grant(username, role, admin.username);
      for (const role of toRevoke) if (stored.includes(role)) await this.store.roles.revoke(username, role);
      // Vai trò staff = nhân sự được trả lương: gán thì bật payrollSubject, gỡ thì tắt (cùng giao dịch, có nhật ký staff.payrollSubject).
      // Tài khoản Admin gốc chưa có bậc lương hợp lệ (bậc 0) mà được gán staff thì phiếu báo lỗi bậc cho tới khi đặt bậc ở Hồ sơ; không tự đặt bậc thay Admin.
      if (
        (await Roles.syncPayroll(actx, username, want.includes('staff'), target.payrollSubject)) &&
        want.includes('staff') &&
        !(target.level >= 1)
      )
        warnings.warn(
          'ROLE_STAFF_NO_LEVEL',
          'Tài khoản này chưa có bậc lương hợp lệ: phiếu lương sẽ báo lỗi cho tới khi đặt chức vụ và bậc ở Hồ sơ nhân sự.'
        );
      if ((await this.store.roles.countAdmins()) < 1)
        throw new HttpError(409, 'Không được gỡ quản trị viên cuối cùng', { code: 'LAST_ADMIN' });
      // Một dòng nhật ký cho mỗi vai trò đổi (mức pii: đây là phân quyền truy cập dữ liệu cá nhân)
      for (const [role, active] of [...toGrant.map(r => [r, true]), ...toRevoke.map(r => [r, false])])
        await this.audit.write(actx, {
          action: active ? 'role.grant' : 'role.revoke',
          entityKind: 'staff_role',
          entityId: `${username}:${role}`,
          subject: username,
          before: { role, active: !active },
          after: { role, active },
          reason: reason || null,
          sensitivity: 'pii'
        });
      return {
        granted: toGrant,
        revoked: toRevoke,
        rev: rolesRevOf(await this.store.roles.list({ username, includeRevoked: true }))
      };
    });
    if (outcome.granted.length || outcome.revoked.length) await this.events.emit.rolesChanged(username);
    return { username, roles: await rolesOfStaff(await this.store.getStaff(username)), ...outcome };
  }

  @Post('staff')
  async createStaff(@Ctx() c: ApiContext): Promise<unknown> {
    const { req, needAdmin } = c;
    needAdmin();
    const body = (await readJson(req)) || {};
    const name = String(body.name || '').trim();
    if (!name) throw new HttpError(400, 'Thiếu họ tên');
    const slug =
      name
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/đ/gi, 'd')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 24) || 'nhan-vien';
    const password = crypto.randomBytes(24).toString('base64url');
    for (let attempt = 0; attempt < 8; attempt++) {
      const username = `${slug}-${crypto.randomBytes(4).toString('hex')}`;
      if (await this.store.getStaffRow(username)) continue;
      try {
        return await this.saveStaff(c, {
          username,
          body: { ...body, role: 'staff', password },
          insertOnly: true,
          credentials: { username, password }
        });
      } catch (error) {
        if (error && error.details && error.details.code === 'STAFF_USERNAME_COLLISION') continue;
        throw error;
      }
    }
    throw new HttpError(503, 'Không tạo được tên đăng nhập duy nhất, vui lòng thử lại');
  }

  @Put('staff/:u')
  async putStaff(@Ctx() c: ApiContext): Promise<unknown> {
    return await this.saveStaff(c);
  }

  private async saveStaff(
    c: ApiContext,
    options: {
      username?: string;
      body?: any;
      insertOnly?: boolean;
      credentials?: { username: string; password: string };
    } = {}
  ): Promise<unknown> {
    const { req, res, me, seg, actx, needAdmin } = c;
    const admin = needAdmin();
    let username = options.username;
    if (!username)
      try {
        username = decodeURIComponent(seg[2]).toLowerCase();
      } catch {
        throw new HttpError(400, 'Tên đăng nhập không hợp lệ');
      }
    if (!USERNAME_RE.test(username)) throw new HttpError(400, 'Tên đăng nhập: chữ thường, số, dấu . _ - (2–40 ký tự)');
    const prev = await this.store.getStaffRow(username);
    // Khoá hoặc mở khoá tài khoản đang giữ vai trò Admin cần năng lực quản lý vai trò (staff.lock gán được cho vai trò tuỳ chỉnh: không đủ để
    // khoá Admin), và không được khoá Admin chưa khoá cuối cùng (nếu không, không ai còn roles.manage để mở lại)
    const guardAdminLock = async locking => {
      if (!prev || !(prev.role === 'admin' || (await this.store.roles.activeRoles(username)).includes('admin'))) return;
      if (!(await this.authz.can(me, 'roles.manage')))
        throw new HttpError(403, 'Bạn không có quyền khoá hoặc mở khoá tài khoản Admin', {
          code: 'FORBIDDEN_CAP',
          cap: 'roles.manage'
        });
      if (locking && !prev.locked_at && (await this.store.roles.countAdmins()) < 2)
        throw new HttpError(409, 'Không được khoá quản trị viên cuối cùng', { code: 'LAST_ADMIN' });
    };
    const b = options.body || (await readJson(req));
    // expectedRev (tuỳ chọn): số phiên bản hồ sơ Admin đã thấy (trường rev của GET /api/staff); lệch thì 409 STAFF_STALE và không ghi gì.
    // Thiếu expectedRev thì ghi đè. Mọi kiểm tra và ghi sau đây chạy đồng bộ cùng một lượt xử lý, không có ai chen vào giữa.
    if (b.expectedRev !== undefined && b.expectedRev !== null) {
      if (typeof b.expectedRev !== 'string' || !b.expectedRev)
        throw new HttpError(400, 'expectedRev phải là chuỗi số phiên bản hồ sơ');
      const currentRev = await staffRevision(username);
      if (b.expectedRev !== currentRev)
        throw new HttpError(
          409,
          'Hồ sơ này vừa được người khác sửa. Tải lại hồ sơ rồi lưu lại để không ghi đè thay đổi của họ.',
          { code: 'STAFF_STALE', currentRev }
        );
    }
    if (Object.hasOwn(b, 'locked') && typeof b.locked !== 'boolean')
      throw new HttpError(400, 'locked phải là true hoặc false');
    if (Object.hasOwn(b, 'locked') && !(await this.authz.can(me, 'staff.lock')))
      throw new HttpError(403, 'Bạn không có quyền khoá hoặc mở khoá tài khoản', {
        code: 'FORBIDDEN_CAP',
        cap: 'staff.lock'
      });
    if (b.locked === true && username === admin.username)
      throw new HttpError(400, 'Không thể tự khoá tài khoản đang đăng nhập');
    if (typeof b.locked === 'boolean') await guardAdminLock(b.locked);
    // Chỉ khoá / mở khoá: không kiểm các trường hồ sơ khác (tài khoản cũ có thể thiếu ngày bắt đầu làm)
    // expectedRev đã được kiểm ở trên nên không tính vào số trường: { locked, expectedRev } vẫn là yêu cầu chỉ khoá / mở khoá
    if (Object.keys(b).filter(key => key !== 'expectedRev').length === 1 && Object.hasOwn(b, 'locked')) {
      if (!prev) throw new HttpError(404, 'Không có tài khoản này');
      await this.store.transaction(async () => {
        // Chỉ ghi nhật ký khi trạng thái khoá thật sự đổi: gửi lại locked như cũ (lưu hồ sơ) không thêm dòng khoá / mở khoá
        const changed = b.locked
          ? await this.store.lockStaff(username, admin.username)
          : await this.store.unlockStaff(username);
        if (changed) await this.audit.staffLock(actx, username, b.locked);
      });
      if (b.locked) this.events.closeUser(username, 'locked');
      return { staff: await staffForViewer(me, await this.store.getStaff(username)), created: false };
    }
    // Họ tên: name; hoặc familyName + givenName nhập riêng (họ trước, tên sau, viết hoa chữ đầu) thì name = họ + tên
    const nameParts =
      typeof b.familyName === 'string' || typeof b.givenName === 'string'
        ? new PersonName(String(b.familyName || ''), String(b.givenName || ''))
        : null;
    if (nameParts && nameParts.isEmpty())
      throw new HttpError(400, 'Thiếu tên (givenName)', { code: 'GIVEN_NAME_REQUIRED' });
    const name = nameParts ? nameParts.fullName : String(b.name || '').trim();
    if (!name) throw new HttpError(400, 'Thiếu họ tên');
    // Thử việc / chính thức (Admin nhập, chỉ hiển thị, không đổi tiền) và ngày nghỉ việc; không gửi thì giữ giá trị đang lưu
    if (b.contractStatus != null && b.contractStatus !== '' && !['probation', 'official'].includes(b.contractStatus))
      throw new HttpError(400, 'contractStatus phải là probation (thử việc) hoặc official (chính thức)', {
        code: 'BAD_CONTRACT_STATUS'
      });
    const contractStatus = b.contractStatus === undefined ? undefined : b.contractStatus || null;
    if (b.resignedOn != null && b.resignedOn !== '' && !validDate(b.resignedOn))
      throw new HttpError(400, 'Ngày nghỉ việc phải là ngày hợp lệ dạng YYYY-MM-DD', { code: 'BAD_RESIGNED_ON' });
    const resignedOn = b.resignedOn === undefined ? undefined : b.resignedOn || null;
    // Giá trị lạ bị từ chối, không đổi ngầm thành mặc định. Thiếu trường thì dùng mặc định (vai trò staff, loại tts).
    if (b.role !== undefined && b.role !== null && b.role !== 'admin' && b.role !== 'staff')
      throw new HttpError(400, 'Vai trò phải là admin hoặc staff');
    const role = b.role === 'admin' ? 'admin' : 'staff';
    // Cấp hay gỡ vai trò Admin cần năng lực quản lý vai trò (hiện chỉ Admin có)
    if (
      (role === 'admin' || prev?.role === 'admin') &&
      role !== (prev?.role ?? 'staff') &&
      !this.authz.can(me, 'roles.manage')
    )
      throw new HttpError(403, 'Bạn không có quyền đổi vai trò Admin', { code: 'FORBIDDEN_CAP', cap: 'roles.manage' });
    // Chức vụ là dữ liệu: mã phải có trong bảng chức vụ của tháng hiện tại (chức vụ ngưng dùng chỉ giữ cho người đang có); mã lạ là 400, không đổi ngầm thành mã khác
    const staffParams = await this.rules.monthParams();
    const activeCodes = activeCodesOf(staffParams);
    if (b.type !== undefined && b.type !== null && !activeCodes.includes(b.type) && !(prev && prev.type === b.type))
      throw new HttpError(400, `Loại nhân sự phải là một trong: ${activeCodes.join(', ')}`);
    const type = b.type === undefined || b.type === null ? Positions.defaultCode : b.type;
    // Vào bảng lương hay không (payrollSubject): nêu rõ thì theo đó (phải là true / false, không đổi ngầm); đổi vai trò admin ↔ staff mà không nêu thì
    // theo vai trò mới (admin: ngoài bảng lương, staff: vào bảng lương); còn lại giữ giá trị đang lưu (db: tài khoản mới theo vai trò)
    if (Object.hasOwn(b, 'payrollSubject') && typeof b.payrollSubject !== 'boolean')
      throw new HttpError(400, 'payrollSubject phải là true hoặc false');
    const roleChanged = !!prev && prev.role !== role;
    const payrollSubject = Object.hasOwn(b, 'payrollSubject')
      ? b.payrollSubject
      : roleChanged
        ? role !== 'admin'
        : undefined;
    const inPayroll = payrollSubject ?? (prev ? !!(await this.store.isPayrollSubject(username)) : role !== 'admin');
    // Người trong bảng lương (hoặc không phải Admin) cần bậc hợp lệ. Admin ngoài bảng lương giữ bậc đang lưu: đổi vai trò không làm mất bậc.
    const keptLevel = prev && Number.isInteger(prev.level) && prev.level >= 1 ? prev.level : null;
    const needsLevel = role !== 'admin' || inPayroll;
    const level = !needsLevel
      ? (prev?.level ?? 0)
      : b.level == null || b.level === ''
        ? ((roleChanged ? keptLevel : null) ?? 1)
        : Number(b.level);
    const maxLevel = this.rules.levelCountOf(staffParams, type);
    if (needsLevel && (!Number.isInteger(level) || level < 1 || level > maxLevel))
      throw new HttpError(400, `Level phải là số nguyên từ 1 đến ${maxLevel}`);
    // Phụ cấp đêm: chọn một trong bảng nightOptions của bậc (level.<loại>.<bậc>.nightOptions) hoặc của chức vụ (type.<loại>.nightOptions, chỉ NV có); loại không có bảng thì không có
    const nightOptions = this.rules.typeParam(staffParams, type, 'nightOptions', level);
    const hasNightOptions = Array.isArray(nightOptions) && nightOptions.length > 0;
    const nightGiven = b.nightPct !== undefined && b.nightPct !== null && b.nightPct !== '';
    // Phụ cấp đêm lạ bị từ chối (loại không có bảng lựa chọn thì bỏ qua trường này)
    // Thiếu trường (form Hồ sơ không có ô này): giữ giá trị đã lưu nếu còn nằm trong bảng của chức vụ / bậc, nếu không (chưa lưu hoặc không còn được phép) lấy lựa chọn đầu tiên
    // Giá trị gửi lên bằng giá trị đã lưu thì không bị kiểm lại (bảng của bậc đổi sau khi lưu không làm hỏng lần lưu không đổi gì)
    const keptNight = prev && prev.type === type && prev.night_pct != null ? Number(prev.night_pct) : null; // prev là hàng thô (cột night_pct)
    if (hasNightOptions && nightGiven && Number(b.nightPct) !== keptNight && !nightOptions.includes(Number(b.nightPct)))
      throw new HttpError(400, `Phụ cấp đêm phải là một trong: ${nightOptions.join(', ')} (%)`);
    const nightPct = hasNightOptions
      ? nightGiven
        ? Number(b.nightPct)
        : keptNight !== null && nightOptions.includes(keptNight)
          ? keptNight
          : nightOptions[0]
      : null;
    const idorm = this.rules.benefitOf(staffParams, type, 'idorm', level) && !!b.idorm; // iDorm chỉ nhận khi cờ iDorm của chức vụ hoặc bậc bật
    const givenShift = b.shiftCode == null || b.shiftCode === '' ? null : b.shiftCode;
    if (
      givenShift !== null &&
      (typeof givenShift !== 'string' || !Object.hasOwn((await this.rules.rulesFor()).punch.SHIFT, givenShift))
    )
      throw new HttpError(400, 'Ca cố định không hợp lệ');
    const shiftCode = givenShift === null ? null : (await this.domain.shifts.canonicalOf(givenShift)) || givenShift; // lưu mã của danh mục ca
    // phép năm: ngày đầu đi làm, ngày sinh, điều chỉnh tay (+/− ngày, bước 0,5)
    const startDate = b.startDate ? String(b.startDate) : null,
      birthday =
        b.birthday === undefined && prev && !(await this.authz.can(me, 'profile.read.pii'))
          ? prev.birthday || null
          : b.birthday
            ? String(b.birthday)
            : null;
    if ((startDate && !validDate(startDate)) || (birthday && !validDate(birthday)))
      throw new HttpError(400, 'Ngày bắt đầu làm / ngày sinh phải là ngày hợp lệ dạng YYYY-MM-DD');
    // Chức vụ có cờ startDateRequired cần ngày bắt đầu làm để tính phép năm; Admin thì không
    // Thiếu ngày bắt đầu làm thì phép năm của người này chưa tính được (src/engine/leave.ts → accrued cần ngày bắt đầu)
    warnIf('START_DATE_REQUIRED', needsLevel && staffParams[`type.${type}.startDateRequired`] === true && !startDate, {
      message: 'Chức vụ này cần ngày bắt đầu làm: chưa có ngày thì số phép năm của người này chưa tính được.'
    });
    const leaveAdjust =
      b.leaveAdjust === undefined ? Number(prev?.leave_adjust) || 0 : Math.round((Number(b.leaveAdjust) || 0) * 2) / 2;
    if (Math.abs(leaveAdjust) > 365) throw new HttpError(400, 'Điều chỉnh phép tối đa ±365 ngày');
    // thuế TNCN / BH bắt buộc: thiếu trường (giao diện cũ) thì giữ giá trị đang lưu; null = dùng mặc định theo loại nhân sự
    const contract =
      b.contract === undefined
        ? (prev?.contract ?? null)
        : b.contract === null || b.contract === ''
          ? null
          : b.contract;
    if (contract !== null && contract !== 'long' && contract !== 'short')
      throw new HttpError(400, 'Loại hợp đồng không hợp lệ');
    // thiếu trường: giữ đúng giá trị đang lưu trong cột (NULL = theo insurance.coverage của hợp đồng, không ghim thành giá trị suy ra)
    const insured = b.insured === undefined ? ((await this.store.getStaffRow(username))?.insured ?? null) : b.insured;
    if (insured !== null && typeof insured !== 'boolean' && insured !== 0 && insured !== 1)
      throw new HttpError(400, 'Đóng bảo hiểm phải là có / không');
    const dep = b.dependants; // chỉ nhận số nguyên hoặc chuỗi chữ số; null / '' = 0
    const dependants =
      dep === undefined
        ? (prev?.dependants ?? 0)
        : dep === null || dep === ''
          ? 0
          : typeof dep === 'number' || (typeof dep === 'string' && /^\d+$/.test(dep))
            ? Number(dep)
            : NaN;
    if (!Number.isInteger(dependants) || dependants < 0 || dependants > 20)
      throw new HttpError(400, 'Số người phụ thuộc phải là số nguyên từ 0 đến 20');
    // tên vị trí công việc (in trên phiếu lương); thiếu trường thì giữ giá trị đang lưu
    const jt = b.jobTitle === undefined ? (prev?.job_title ?? '') : (b.jobTitle ?? '');
    if (typeof jt !== 'string' || jt.trim().length > 80) throw new HttpError(400, 'Vị trí công việc tối đa 80 ký tự');
    const jobTitle = jt.trim();
    // Admin bật/tắt từng khoản: khấu trừ thuế TNCN, giảm trừ gia cảnh, tạm ứng (thiếu trường thì giữ giá trị đang lưu)
    const flags = {};
    for (const [key, col] of [
      ['taxOn', 'tax_on'],
      ['deductOn', 'deduct_on'],
      ['advanceOn', 'advance_on']
    ]) {
      const v = b[key] === undefined ? (prev?.[col] ?? null) : b[key];
      if (v !== null && typeof v !== 'boolean' && v !== 0 && v !== 1)
        throw new HttpError(400, 'Thuế TNCN / giảm trừ gia cảnh / tạm ứng phải là có / không');
      flags[key] = v;
    }
    // Quyền theo trường. Cổng ROUTE_CAPS chỉ hỏi profile.write. Trường tiền (loại, bậc, phụ cấp đêm, iDorm, hợp đồng, bảo hiểm,
    // người phụ thuộc, thuế, giảm trừ, tạm ứng) cần salary.write; tạo tài khoản mới cũng đặt loại và bậc nên cũng cần. Mật khẩu của tài khoản KHÁC
    // cần roles.manage (chưa có quyền đặt lại mật khẩu riêng). Từ chối trước khi ghi bất cứ gì.
    {
      // So SÁNH THEO GIÁ TRỊ HIỆU LỰC: nhiều tài khoản lưu null ở contract, insured, taxOn, deductOn, advanceOn, nightPct; biểu mẫu gửi lại giá trị
      // hiệu lực (long, true, 40...). Cả hai phía đi qua cùng một hàm đưa null về mặc định nên "không đổi" không bị coi là đổi tiền.
      const nightDefault = p => {
        const options = this.rules.typeParam(staffParams, p.type, 'nightOptions', p.level);
        return Array.isArray(options) && options.length ? options[0] : null;
      };
      const effectivePay = p => {
        const effectiveContract =
          p.contract === 'long' || p.contract === 'short'
            ? p.contract
            : this.rules.typeParam(staffParams, p.type, 'defaultContract') === 'short'
              ? 'short'
              : 'long';
        return {
          type: p.type,
          level: p.level,
          nightPct: p.nightPct ?? nightDefault(p),
          idorm: !!p.idorm,
          contract: effectiveContract,
          // cột NULL: theo lựa chọn insurance.coverage.<hợp đồng> của Kế toán ở tháng hiện tại (như payrollPeople), nên gửi lại giá trị mặc định không bị coi là đổi tiền
          insured: p.insured == null ? staffParams[`insurance.coverage.${effectiveContract}`] === true : !!p.insured,
          dependants: p.dependants || 0,
          taxOn: p.taxOn == null ? true : !!p.taxOn,
          deductOn: p.deductOn == null ? true : !!p.deductOn,
          advanceOn: p.advanceOn == null ? true : !!p.advanceOn
        };
      };
      const payFields = prev
        ? await (async () => {
            const was = effectivePay({
              ...(await this.store.getStaff(username)),
              insured: (await this.store.getStaffRow(username)).insured
            }); // insured thô: NULL giữ NULL
            const now = effectivePay({ type, level, nightPct, idorm, contract, insured, dependants, ...flags });
            return Object.keys(now).filter(key => now[key] !== was[key]);
          })()
        : ['type', 'level'];
      // Không ai tự sửa lương, thuế, bảo hiểm, ca, điều chỉnh phép hay mật khẩu của CHÍNH MÌNH (Admin ngoài diện lương không bị ảnh hưởng).
      // Các trường khác của chính mình không bị kiểm ở đây.
      if (prev && this.authz.isSelfDecision(me, username)) {
        const was = await this.store.getStaff(username);
        const own = [
          ...payFields,
          ...(leaveAdjust !== was.leaveAdjust ? ['leaveAdjust'] : []),
          ...((shiftCode ?? null) !== (was.shiftCode ?? null) ? ['shiftCode'] : []),
          ...(b.password ? ['password'] : [])
        ];
        // Đặt mật khẩu của chính mình qua hồ sơ luôn bị chặn (đã có đường riêng USE_OWN_PASSWORD); các trường lương, ca, phép chỉ cảnh báo
        if (own.includes('password'))
          throw new HttpError(403, `Không được tự sửa các trường này của chính mình (${own.join(', ')})`, {
            code: 'SELF_DECISION_FORBIDDEN',
            fields: own
          });
        selfDecision(own.length > 0, { doing: `sửa ${own.join(', ')}` });
      }
      if (payFields.length && !(await this.authz.can(me, 'salary.write')))
        throw new HttpError(403, `Bạn không có quyền đổi trường lương (${payFields.join(', ')})`, {
          code: 'FORBIDDEN_CAP',
          cap: 'salary.write',
          fields: payFields
        });
      if (b.password && prev && username !== admin.username && !(await this.authz.can(me, 'roles.manage')))
        throw new HttpError(403, 'Bạn không có quyền đặt lại mật khẩu của tài khoản khác', {
          code: 'FORBIDDEN_CAP',
          cap: 'roles.manage'
        });
      // Tài khoản đã có không đặt mật khẩu qua hồ sơ: dùng đường đặt lại có lý do và có nhật ký (tạo tài khoản mới vẫn nhận mật khẩu)
      if (b.password && prev)
        throw new HttpError(400, 'Tài khoản đã có: dùng chức năng Đặt lại mật khẩu (kèm lý do), không đổi qua hồ sơ', {
          code: 'USE_PASSWORD_RESET'
        });
    }
    let passHash = prev?.pass_hash;
    if (b.password) {
      if (String(b.password).length < config.PASSWORD_MIN_LENGTH)
        throw new HttpError(400, `Mật khẩu cần ít nhất ${config.PASSWORD_MIN_LENGTH} ký tự`);
      passHash = await this.auth.hashPasswordAsync(String(b.password));
    }
    if (!passHash) throw new HttpError(400, 'Tài khoản mới cần mật khẩu');
    if (username === admin.username && prev?.role === 'admin' && role !== 'admin')
      throw new HttpError(400, 'Không thể tự bỏ quyền Admin của mình');
    // Hồ sơ và dòng duyệt đổi cùng nhau hoặc không đổi gì
    const staffBefore = prev ? await this.store.getStaff(username) : null;
    let createdLeave: any = null;
    await this.store.transaction(async () => {
      const inserted = await this.store.upsertStaff(
        {
          username,
          name,
          role,
          type,
          level,
          nightPct,
          idorm,
          shiftCode,
          passHash,
          createdAt: prev?.created_at,
          startDate,
          birthday,
          leaveAdjust,
          contract,
          insured,
          dependants,
          jobTitle,
          ...(payrollSubject === undefined ? {} : { payrollSubject }),
          ...flags,
          ...(nameParts ? { familyName: nameParts.familyName, givenName: nameParts.givenName } : {}),
          contractStatus,
          resignedOn
        },
        { insertOnly: options.insertOnly }
      );
      if (!inserted)
        throw new HttpError(409, 'Tên đăng nhập vừa được tạo, đang thử tên khác', { code: 'STAFF_USERNAME_COLLISION' });
      if (needsLevel && (!prev || prev.type !== type || payrollSubject === true))
        await reconcileStaffType(username, type);
      // Hồ sơ không nhạy cảm có cũ, mới; trường tiền có mức pay; ngày sinh chỉ ghi "đã đổi"; mật khẩu chỉ ghi cờ
      const staffAfter = await this.store.getStaff(username);
      if (options.credentials) createdLeave = await this.domain.leave.refresh(staffAfter);
      // Tắt payrollSubject thì vai trò staff đã gán cũng được thu hồi (staff = nhân sự được trả lương); bật thì staff tự dẫn xuất
      if (!staffAfter.payrollSubject && (await this.store.roles.activeRoles(username)).includes('staff'))
        await this.store.roles.revoke(username, 'staff');
      await this.audit.staffSaved(actx, staffBefore, staffAfter, { passwordSet: !!b.password });
      // Vào hay ra khỏi bảng lương đổi người nhận lương: một dòng riêng (mức pay), chỉ khi tài khoản đã có và cờ đổi
      if (staffBefore && staffBefore.payrollSubject !== staffAfter.payrollSubject)
        await this.audit.write(actx, {
          action: 'staff.payrollSubject',
          entityKind: 'staff',
          entityId: username,
          subject: username,
          before: { payrollSubject: staffBefore.payrollSubject },
          after: { payrollSubject: staffAfter.payrollSubject },
          sensitivity: 'pay'
        });
    });
    // Đặt lại mật khẩu: mọi phiên cũ của người đó hết hiệu lực. Khoá / mở khoá chỉ khi yêu cầu có nói rõ.
    if (b.password && prev) {
      await this.store.bumpSessionVersion(username);
      if (username !== admin.username) this.events.closeUser(username, 'password');
    }
    if (typeof b.locked === 'boolean')
      await this.store.transaction(async () => {
        // Chỉ ghi nhật ký khi trạng thái khoá thật sự đổi: gửi lại locked như cũ (lưu hồ sơ) không thêm dòng khoá / mở khoá
        const changed = b.locked
          ? await this.store.lockStaff(username, admin.username)
          : await this.store.unlockStaff(username);
        if (changed) await this.audit.staffLock(actx, username, b.locked);
      });
    if (b.locked === true) this.events.closeUser(username, 'locked');
    let staff = await this.store.getStaff(username);
    if (createdLeave) staff = { ...staff, leave: { balance: createdLeave.balance } };
    const result: any = { staff: await staffForViewer(me, staff), created: !prev };
    if (options.credentials) result.credentials = options.credentials;
    // Admin tự đặt lại mật khẩu của mình: phiên hiện tại vừa bị thu hồi, cấp phiên mới cho trình duyệt đang dùng
    if (b.password && prev && username === admin.username)
      return new Reply(200, result, {
        'Set-Cookie': this.auth.cookieHeader(await this.auth.createSession(username), this.auth.SESSION_MAX_AGE_SEC)
      });
    return result;
  }

  /** ?month= lịch làm việc hiệu lực của một người (self-or:profile.read); kiểm quyền TRƯỚC khi tra tên để không dò được tên đăng nhập */
  @Get('staff/:u/schedule')
  async getStaffSchedule(@Ctx() c: ApiContext): Promise<unknown> {
    const { url, me, seg, res } = c;
    let username: string;
    try {
      username = decodeURIComponent(seg[2]).toLowerCase();
    } catch {
      throw new HttpError(400, 'Tên đăng nhập không hợp lệ');
    }
    if (!(await this.authz.can(me, 'profile.read', { username })))
      throw new HttpError(403, 'Không được xem lịch của người khác', { code: 'FORBIDDEN_CAP' });
    const staff = await this.store.getStaff(username);
    if (!staff) throw new HttpError(404, 'Không có nhân sự này');
    const month = url.searchParams.get('month') || this.rules.vnToday().slice(0, 7);
    if (!validMonth(month)) throw new HttpError(400, 'month phải dạng YYYY-MM', { code: 'BAD_MONTH' });
    return await staffScheduleView(staff, month);
  }
}

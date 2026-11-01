import { AUDIT, EVENTS, RULES, STORE } from '../../core/tokens';
import { SettingsHelpers } from './settings.helpers';
import { Controller, Get, Put, Post, Inject } from '@nestjs/common';
import { Ctx, ApiContext } from '../../http/api-context';

const { HttpError, readJson } = require('../../platform/http'); // tiện ích HTTP: lỗi, gửi JSON, đọc thân, tiêu đề bảo mật, file tĩnh
// quy tắc theo tháng của từng yêu cầu: rulesFor(tháng).<mô-đun> dựng bằng create(bộ tham số của tháng đó)
const { announceSetting } = require('../../platform/announce'); // báo sau COMMIT: cấu hình đổi (chấm công mới đi qua punchHints, kind 'punch')
const { validMonth, validDate } = require('../../domain/input'); // kiểm dạng tháng, ngày, giờ, tên đăng nhập
const { leaveDates } = require('../../domain/sheet'); // lịch ước tính và ngày phép
const { GeofencePolicy } = require('../../domain/attendance/geofence-policy');
const { reconcileHolidayWork } = require('../../domain/approvals'); // khoản tự khai chờ duyệt
// công tắc Agents
// nhật ký kiểm toán: ghi cùng giao dịch với thay đổi
const config = require('../../platform/config'); // giới hạn kỹ thuật có tên (không số trong mã)
const paramsStore = require('../../params/store');
const configRev = require('../../params/config-rev'); // số phiên bản chung của cấu hình (settings.config_rev)
const HolidayNames = require('../../domain/holidays'); // tên ngày lễ (nhãn hiển thị)
const paramsSave = require('../../params/save'); // lưu tham số: kiểm, xem trước tác động, ghi cả lô, hoàn tác
// báo cho màn đang mở (SSE), phát SAU KHI giao dịch đã COMMIT
const warnings = require('../../platform/warnings'); // cảnh báo thay cho chặn
const { warnIf, selfDecision } = warnings;

@Controller('api')
export class SettingsController {
  constructor(
    @Inject(STORE) private readonly store: any,
    @Inject(RULES) private readonly rules: any,
    @Inject(AUDIT) private readonly audit: any,
    @Inject(EVENTS) private readonly events: any,
    @Inject(SettingsHelpers) private readonly settingsHelpers: SettingsHelpers
  ) {}

  @Get('holidays')
  async getHolidays(@Ctx() c: ApiContext): Promise<unknown> {
    const { res, need } = c;
    need();
    return { dates: await this.store.getSetting('holidays', []), names: await HolidayNames.read() };
  }

  @Put('holidays')
  async putHolidays(@Ctx() c: ApiContext): Promise<unknown> {
    const { req, res, me, actx, needAdmin, guardPeriod } = c;
    needAdmin();
    const { dates, names } = await readJson(req);
    if (!Array.isArray(dates) || dates.some(d => !validDate(d)))
      throw new HttpError(400, 'Danh sách ngày không hợp lệ');
    const clean = [...new Set(dates)].sort();
    const namesClean = await HolidayNames.clean(names, clean); // tên hiển thị của ngày lễ; sai đầu vào là 400 trước mọi thay đổi
    // Khoá kỳ: chỉ các ngày thật sự đổi (thêm hoặc bỏ) mới bị xét, lưu lại danh sách y nguyên không bị chặn
    const holidaysBefore = await this.store.getSetting('holidays', []);
    await guardPeriod(
      holidaysBefore.filter(d => !clean.includes(d)),
      clean.filter(d => !holidaysBefore.includes(d))
    );
    await this.store.transaction(async () => {
      const conflicts: any[] = [];
      const holidayParams = await this.rules.monthParams();
      for (const staff of (await this.store.listStaff()).filter(
        s => s.payrollSubject && this.rules.benefitOf(holidayParams, s.type, 'leaveAccount', s.level)
      )) {
        const before = await leaveDates(staff),
          after = await leaveDates(staff, undefined, clean);
        for (const date of after) {
          const led = (await this.rules.rulesFor(date.slice(0, 7))).leave.ledger(staff, after, date),
            got = led.total - led.expired, // phép còn được dùng tại ngày đó: đã cộng trừ phần đã hết hạn
            used = led.used;
          const beforeDeficit = Math.max(0, before.filter(d => d <= date).length - got),
            afterDeficit = Math.max(0, used - got);
          if (afterDeficit > beforeDeficit + 1e-6)
            conflicts.push({
              username: staff.username,
              name: staff.name,
              date,
              accrued: got,
              used,
              beforeDeficit,
              afterDeficit
            });
        }
      }
      if (conflicts.length) {
        const first = conflicts[0];
        // Lưu và cảnh báo, nêu tối đa config.WARN_NAMES_MAX người. Bộ máy trả lương ngày phép theo chức vụ chứ không xét số dư,
        // nên ngày phép vượt số dư vẫn được tính lương nếu Admin duyệt (src/engine/payroll-engine.ts → kind 'leave').
        const people = [...new Set(conflicts.map(c => c.username))];
        const months = [...new Set(conflicts.map(c => c.date.slice(0, 7)))].sort();
        warnIf('HOLIDAY_LEAVE_CONFLICT', true, {
          message: () =>
            `Đổi ngày lễ làm ${people.length} người thiếu phép trong tháng ${months.join(', ')} (${people.slice(0, config.WARN_NAMES_MAX).join(', ')}${people.length > config.WARN_NAMES_MAX ? ` và ${people.length - config.WARN_NAMES_MAX} người khác` : ''}): ngày phép vượt số dư vẫn được tính lương nếu được duyệt. Hãy kiểm tra lịch nghỉ của họ.`,
          details: { count: people.length, months },
          count: people.length
        });
      }
      const otConflicts = await this.settingsHelpers.holidayOtConflicts(
        await this.store.getSetting('holidays', []),
        clean
      );
      if (otConflicts.length) {
        const first = otConflicts[0],
          source = first.source === 'estimate' ? 'Lịch ước tính' : 'Check-in/out';
        const detail =
          first.reason === 'month-limit'
            ? `tháng ${first.month} có ${Math.round(first.afterHours * 100) / 100}/${first.limit} giờ làm ngày lễ + OT`
            : `ngày ${first.date} đang có ${first.source === 'estimate' ? 'giờ làm bù/OT' : 'OT chờ hoặc đã duyệt'}`;
        const people = [...new Set(otConflicts.map(c => c.username))];
        const months = [...new Set(otConflicts.map(c => (c.month || c.date).slice(0, 7)))].sort();
        warnIf('HOLIDAY_OT_CONFLICT', true, {
          message: () =>
            `Đổi ngày lễ làm giờ làm ngày lễ + OT của ${people.length} người đổi trong tháng ${months.join(', ')} (${people.slice(0, config.WARN_NAMES_MAX).join(', ')}${people.length > config.WARN_NAMES_MAX ? ` và ${people.length - config.WARN_NAMES_MAX} người khác` : ''}). Giờ làm ngày lễ trả theo hệ số ngày lễ và bộ máy không cắt theo trần: tiền của họ có thể tăng.`,
          details: { count: people.length, months },
          count: people.length
        });
      }
      const before = await this.store.getSetting('holidays', []);
      const namesBefore = await HolidayNames.read();
      await this.store.setSetting('holidays', clean);
      const namesChanged = await HolidayNames.write(namesClean);
      await configRev.bump(); // số phiên bản chung, cùng giao dịch
      await reconcileHolidayWork(before, clean);
      await this.audit.write(actx, {
        action: 'holiday.set',
        entityKind: 'setting',
        entityId: 'holidays',
        before: { dates: before, ...(namesChanged ? { names: namesBefore } : {}) },
        after: { dates: clean, ...(namesChanged ? { names: namesClean } : {}) }
      });
    });
    const changedHolidays = [
      ...holidaysBefore.filter(d => !clean.includes(d)),
      ...clean.filter(d => !holidaysBefore.includes(d))
    ].sort();
    if (changedHolidays.length) await announceSetting('holidays', me.username, changedHolidays[0].slice(0, 7));
    return { dates: clean, names: namesClean };
  }

  @Put('settings/geofence')
  async putSettingsGeofence(@Ctx() c: ApiContext): Promise<unknown> {
    const { req, res, me, actx, needAdmin } = c;
    needAdmin();
    const b = await readJson(req, true);
    // Tắt phải nói rõ: null (hoặc { geofence: null }). Thân rỗng hay thiếu trường không được ngầm hiểu là tắt.
    const off = b === null || (Object.keys(b).length === 1 && b.geofence === null);
    const next = off ? null : GeofencePolicy.clean(b);
    await this.store.transaction(async () => {
      const was = await this.store.getSetting('geofence', null);
      await this.store.setSetting('geofence', next);
      await configRev.bump(); // số phiên bản chung, cùng giao dịch
      // Chỉ ghi bật/tắt và bán kính; KHÔNG ghi toạ độ
      const view = fence => ({ enabled: !!fence, ...(fence ? { radiusM: fence.radiusM } : {}) });
      await this.audit.write(actx, {
        action: 'setting.geofence',
        entityKind: 'setting',
        entityId: 'geofence',
        before: view(was),
        after: { ...view(next), centreChanged: !!next && (!was || was.lat !== next.lat || was.lng !== next.lng) }
      });
    });
    await announceSetting('geofence', me.username);
    return { geofence: next };
  }

  /* ---------- tham số tính lương: màn Cài đặt dựng từ registry ---------- */
  @Get('settings/params')
  async getSettingsParams(@Ctx() c: ApiContext): Promise<unknown> {
    const { res, url, route, need } = c;
    need(); // năng lực config.read đã kiểm ở cổng ROUTE_CAPS
    const month = url.searchParams.get('month') || this.rules.vnToday().slice(0, 7);
    if (!validMonth(month)) throw new HttpError(400, 'month phải dạng YYYY-MM', { code: 'BAD_MONTH' });
    if (route === 'GET /settings/first-run') return await paramsStore.firstRun(month);
    const groupText = url.searchParams.get('group');
    const group = groupText === null ? undefined : Number(groupText);
    if (group !== undefined && !Number.isInteger(group)) throw new HttpError(400, 'group phải là số nguyên');
    return await paramsStore.view(month, { group });
  }

  @Get('settings/first-run')
  async getSettingsFirstRun(@Ctx() c: ApiContext): Promise<unknown> {
    return this.getSettingsParams(c);
  }

  @Get('settings/version')
  async getSettingsVersion(@Ctx() c: ApiContext): Promise<unknown> {
    const { res, need } = c;
    need();
    return await configRev.info();
  }

  @Put('settings/params')
  async putSettingsParams(@Ctx() c: ApiContext): Promise<unknown> {
    const { req, res, me, seg, actx, need } = c;
    need(); // cổng config.read đã kiểm ở ROUTE_CAPS; năng lực sửa từng khoá kiểm trong src/params/save.ts
    const b = await readJson(req);
    if (req.method === 'PUT' && seg.length === 3) {
      const saved = await paramsSave.save(me, actx, b);
      if (saved.notice) await this.events.emit.paramsChanged(saved.notice);
      return saved;
    }
    if (req.method === 'POST' && seg[3] === 'preview') return await paramsSave.preview(me, b);
    if (req.method === 'POST' && seg[3] === 'revert') {
      const reverted = await paramsSave.revert(me, actx, b);
      if (reverted.notice) this.events.emit.paramsChanged(reverted.notice);
      return reverted;
    }
  }

  @Post('settings/params/preview')
  async postSettingsParamsPreview(@Ctx() c: ApiContext): Promise<unknown> {
    return this.putSettingsParams(c);
  }

  @Post('settings/params/revert')
  async postSettingsParamsRevert(@Ctx() c: ApiContext): Promise<unknown> {
    return this.putSettingsParams(c);
  }
}

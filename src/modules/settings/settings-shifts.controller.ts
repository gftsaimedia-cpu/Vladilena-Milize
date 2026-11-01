import { DOMAIN, EVENTS, RULES } from '../../core/tokens';
import { Controller, Get, Put, Inject } from '@nestjs/common';
import { Ctx, ApiContext } from '../../http/api-context';
const paramsSave = require('../../params/save');

const { HttpError, readJson } = require('../../platform/http');
const { validMonth } = require('../../domain/input');

const { view, shiftsOf } = require('../../domain/shifts');

const bad = (message: string, code: string) => new HttpError(400, message, { code });

/**
 * Ca làm (Cài đặt › Kỳ lương & chấm công › Ca làm): bao quanh các khoá shift.preset.<mã>.in | out của bộ tham số, nên tháng áp dụng,
 * lý do, khoá kỳ, nhật ký và kiểm giờ ca đi qua src/params/save.ts như mọi tham số. Mã ca là mã của danh mục ca (Normal1…Night2);
 * đầu vào nhận cả mã mới lẫn mã cũ.
 */
@Controller('api')
export class SettingsShiftsController {
  constructor(
    @Inject(RULES) private readonly rules: any,
    @Inject(DOMAIN) private readonly domain: any,
    @Inject(EVENTS) private readonly events: any
  ) {}

  /** ?month= → { month, paramsRev, editable, hours, shifts: [{ code, preset, name, kind, in, out }] } */
  @Get('settings/shifts')
  async get(@Ctx() c: ApiContext): Promise<unknown> {
    const month = c.url.searchParams.get('month') || this.rules.vnToday().slice(0, 7);
    if (!validMonth(month)) throw bad('month phải dạng YYYY-MM', 'BAD_MONTH');
    return await view(month);
  }

  /** { shifts: [{ code, in, out }], effectiveMonth?, reason, expectedRev? } → như lưu tham số */
  @Put('settings/shifts')
  async put(@Ctx() c: ApiContext): Promise<unknown> {
    const { req, res, me, actx } = c;
    const b = await readJson(req);
    if (!b || typeof b !== 'object' || !Array.isArray(b.shifts) || !b.shifts.length)
      throw bad('shifts phải là mảng { code, in, out }', 'SHIFTS_REQUIRED');
    const known = Object.keys((await this.rules.rulesFor()).punch.SHIFT);
    const changes: Array<{ key: string; value: unknown }> = [];
    for (const item of b.shifts) {
      const preset =
        item && typeof item === 'object' ? (await this.domain.shifts.presetOf(item.code)) || item.code : null;
      if (!preset || !known.includes(preset))
        throw bad(
          `Mã ca phải là một trong: ${(await shiftsOf(this.rules.vnToday().slice(0, 7))).map((sh: any) => sh.code).join(', ')}`,
          'SHIFT_UNKNOWN'
        );
      changes.push(
        { key: `shift.preset.${preset}.in`, value: item.in },
        { key: `shift.preset.${preset}.out`, value: item.out }
      );
    }
    // expectedRev bắt buộc (không tự điền): thiếu là 400 PARAM_REV_REQUIRED, lệch là 409 PARAMS_STALE (src/params/save.ts)
    const saved = await paramsSave.save(me, actx, {
      changes,
      effectiveMonth: b.effectiveMonth,
      reason: b.reason,
      expectedRev: b.expectedRev,
      acknowledge: b.acknowledge
    });
    if (saved.notice) this.events.emit.paramsChanged(saved.notice);
    return saved;
  }
}

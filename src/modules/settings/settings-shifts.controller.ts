import { Controller, Get, Put, Res } from '@nestjs/common';
import { Ctx, ApiContext } from '../../http/api-context';
const paramsSave = require('../../../lib/params/save');
const events = require('../../../lib/events');
const { HttpError, send, readJson } = require('../../../lib/http');
const { validMonth } = require('../../../lib/domain/input');
const { rulesFor, vnToday } = require('../../../lib/request-rules');
const { container } = require('../../../lib/domain/container');
const { view, shiftsOf } = require('../../../lib/domain/shifts');

const bad = (message: string, code: string) => new HttpError(400, message, { code });

/**
 * Ca làm (Cài đặt › Kỳ lương & chấm công › Ca làm): bao quanh các khoá shift.preset.<mã>.in | out của bộ tham số, nên tháng áp dụng,
 * lý do, khoá kỳ, nhật ký và kiểm giờ ca đi qua lib/params/save.js như mọi tham số. Mã ca là mã của danh mục ca (Normal1…Night2);
 * đầu vào nhận cả mã mới lẫn mã cũ.
 */
@Controller('api')
export class SettingsShiftsController {
  /** ?month= → { month, paramsRev, editable, hours, shifts: [{ code, preset, name, kind, in, out }] } */
  @Get('settings/shifts')
  async get(@Ctx() c: ApiContext, @Res() _res: unknown): Promise<unknown> {
    const month = c.url.searchParams.get('month') || vnToday().slice(0, 7);
    if (!validMonth(month)) throw bad('month phải dạng YYYY-MM', 'BAD_MONTH');
    return send(c.res, 200, await view(month));
  }

  /** { shifts: [{ code, in, out }], effectiveMonth?, reason, expectedRev? } → như lưu tham số */
  @Put('settings/shifts')
  async put(@Ctx() c: ApiContext, @Res() _res: unknown): Promise<unknown> {
    const { req, res, me, actx } = c;
    const b = await readJson(req);
    if (!b || typeof b !== 'object' || !Array.isArray(b.shifts) || !b.shifts.length)
      throw bad('shifts phải là mảng { code, in, out }', 'SHIFTS_REQUIRED');
    const known = Object.keys((await rulesFor()).punch.SHIFT);
    const changes: Array<{ key: string; value: unknown }> = [];
    for (const item of b.shifts) {
      const preset =
        item && typeof item === 'object' ? (await container.shifts.presetOf(item.code)) || item.code : null;
      if (!preset || !known.includes(preset))
        throw bad(
          `Mã ca phải là một trong: ${(await shiftsOf(vnToday().slice(0, 7))).map((sh: any) => sh.code).join(', ')}`,
          'SHIFT_UNKNOWN'
        );
      changes.push(
        { key: `shift.preset.${preset}.in`, value: item.in },
        { key: `shift.preset.${preset}.out`, value: item.out }
      );
    }
    // expectedRev bắt buộc (không tự điền): thiếu là 400 PARAM_REV_REQUIRED, lệch là 409 PARAMS_STALE (lib/params/save.js)
    const saved = await paramsSave.save(me, actx, {
      changes,
      effectiveMonth: b.effectiveMonth,
      reason: b.reason,
      expectedRev: b.expectedRev,
      acknowledge: b.acknowledge
    });
    if (saved.notice) events.emit.paramsChanged(saved.notice);
    return send(res, 200, saved);
  }
}

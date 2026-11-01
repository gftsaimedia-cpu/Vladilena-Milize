import { Inject, Injectable } from '@nestjs/common';
import { RULES, STORE } from '../../core/tokens';

// quy tắc theo tháng của từng yêu cầu: rulesFor(tháng).<mô-đun> dựng bằng create(bộ tham số của tháng đó)
const { actualOtHours, estimateHolidayOtHours, actualHolidayOtHours } =
  require('../../domain/overtime/worked-hours').WorkedHours; // giờ ca, OT, giờ làm ngày lễ
const { estimateSheet } = require('../../domain/sheet'); // lịch ước tính và ngày phép
const { OtLimits } = require('../../domain/overtime/ot-limits'); // trần giờ làm: MỘT nguồn đọc từ bộ tham số của tháng

// So cả hai lịch trước khi ghi. Xung đột cũ không liên quan giữ nguyên;
// xung đột mới phải xử lý trước ở luồng lịch ước tính / chấm công của nó.

@Injectable()
export class SettingsHelpers {
  constructor(
    @Inject(RULES) private readonly rules: any,
    @Inject(STORE) private readonly store: any
  ) {}

  holidayOtConflicts = async (beforeDates, afterDates) => {
    const before = new Set(beforeDates),
      after = new Set(afterDates),
      conflicts: any[] = [];
    const added = date => after.has(date) && !before.has(date);
    for (const staff of (await this.store.listStaff()).filter(s => s.payrollSubject)) {
      const identity = { username: staff.username, name: staff.name };
      const checkLimit = async (source, month, beforeHours, afterHours) => {
        const monthCap = OtLimits.of(await this.rules.monthParams(month)).monthCap;
        if (afterHours > monthCap + 1e-6 && afterHours > beforeHours + 1e-6)
          conflicts.push({
            ...identity,
            source,
            month,
            reason: 'month-limit',
            limit: monthCap,
            beforeHours,
            afterHours
          });
      };
      for (const sheet of await this.store.listSheets(staff.username)) {
        const { days } = await estimateSheet(staff.username, sheet.month);
        for (const [date, entry] of Object.entries(days as Record<string, any>))
          if (added(date) && entry.extraKind)
            conflicts.push({ ...identity, source: 'estimate', month: sheet.month, date, reason: 'holiday-extra' });
        await checkLimit(
          'estimate',
          sheet.month,
          await estimateHolidayOtHours(days, before, sheet.month),
          await estimateHolidayOtHours(days, after, sheet.month)
        );
      }
      const months = new Map();
      for (const s of await this.store.listSessions({ username: staff.username })) {
        const month = s.date.slice(0, 7);
        if (!months.has(month)) months.set(month, []);
        months.get(month).push(s);
        if (added(s.date) && actualOtHours(s.entry) > 0)
          conflicts.push({
            ...identity,
            source: 'attendance',
            month,
            date: s.date,
            sessionId: s.id,
            reason: 'holiday-ot'
          });
      }
      for (const [month, rows] of months)
        await checkLimit(
          'attendance',
          month,
          await actualHolidayOtHours(rows, before, month),
          await actualHolidayOtHours(rows, after, month)
        );
    }
    return conflicts;
  };
}

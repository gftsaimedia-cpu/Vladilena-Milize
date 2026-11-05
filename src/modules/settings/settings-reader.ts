// Cửa đọc cài đặt cho các module khác (tính lương, chấm công): chỉ đọc, không kiểm quyền, không ghi nhật ký.
import { Inject, Injectable } from '@nestjs/common';
import type { Kysely } from 'kysely';
import { versionAt } from '../../common/version-chain';
import type { DB } from '../../database/schema';
import type { Zone } from './domain/attendance-zone';
import { decodeValues, GROUP_KEYS, SETTING_GROUPS, type Bracket } from './domain/setting-groups';
import { standardWorkdaysForWeek } from './domain/work-week';
import { SettingsRepository } from './settings.repository';

type Q = Kysely<DB>;

export interface SettingsSnapshot {
  overtime: { weekdayRate: number; weekendRate: number; holidayRate: number };
  attendance: { lateGraceMinutes: number; diligenceLostFromDays: number };
  kpiWeights: { wework: number; user: number; peer: number; manager: number; self: number };
  insurance: { bhxhPct: number; bhytPct: number; bhtnPct: number };
  tax: {
    personalDeduction: number;
    dependantDeduction: number;
    shortContractPct: number;
    shortContractThreshold: number;
    brackets: Bracket[];
  };
  payCalendar: { payDay: number };
}

export interface WorkWeek {
  weekdays: number[];
  source: 'type' | 'own';
  standardWorkdays: number;
  from: string | null;
  typeWeekdays: number[];
  typeStandardWorkdays: number;
}

/** Tuần riêng lưu dạng chuỗi JSON của mảng thứ; null = theo loại nhân sự. */
const parseWeekdays = (stored: string | null): number[] | null => (stored === null ? null : (JSON.parse(String(stored)) as number[]));

@Injectable()
export class SettingsReader {
  constructor(@Inject(SettingsRepository) private readonly repo: SettingsRepository) {}

  /** Con số tính lương đang hiệu lực ở `month`: mỗi nhóm lấy phiên bản mới nhất có tháng không sau `month`. */
  async settingsFor(month: string, q: Q = this.repo.db): Promise<SettingsSnapshot> {
    const out: Record<string, unknown> = {};
    for (const g of GROUP_KEYS) {
      const chain = await this.repo.groupChain(q, g);
      const version = versionAt(chain, month);
      if (!version) throw new Error(`Không có cài đặt ${g} nào có hiệu lực ở tháng ${month}`);
      out[SETTING_GROUPS[g].responseKey] = decodeValues(g, version.values);
    }
    return out as unknown as SettingsSnapshot;
  }

  /** Tuần làm của một người ở `month`: phiên bản riêng nếu có (weekdays khác null), không thì theo loại nhân sự. */
  async workWeekOf(employeeUuid: string, month: string, q: Q = this.repo.db): Promise<WorkWeek> {
    const staff = await this.repo.staffByUuid(q, employeeUuid);
    if (!staff) throw new Error(`Không có nhân viên ${employeeUuid}`);
    const type = await this.repo.typeWeekAt(q, staff.type, month);
    if (!type) throw new Error(`Loại nhân sự ${staff.type} chưa có ở tháng ${month}`);

    const own = versionAt(await this.repo.workWeekChain(q, employeeUuid), month);
    const ownWeekdays = own ? parseWeekdays(own.values.weekdays as string | null) : null;
    if (own && ownWeekdays) {
      return {
        weekdays: ownWeekdays,
        source: 'own',
        standardWorkdays: standardWorkdaysForWeek(ownWeekdays.length),
        from: own.month,
        typeWeekdays: type.weekdays,
        typeStandardWorkdays: type.workdays
      };
    }
    return {
      weekdays: type.weekdays,
      source: 'type',
      standardWorkdays: type.workdays,
      from: null,
      typeWeekdays: type.weekdays,
      typeStandardWorkdays: type.workdays
    };
  }

  /** Tuần làm của mọi người đã có tài khoản ở `month`, khoá theo username tăng dần; cùng quyết định với `workWeekOf`. */
  async workWeeksAt(month: string, q: Q = this.repo.db): Promise<Record<string, number[]>> {
    const staff = await this.repo.staffList(q);
    const own = await this.repo.ownWeeksAt(q, month);
    const typeWeeks = new Map<string, number[] | null>();
    for (const type of new Set(staff.map(s => s.type))) {
      typeWeeks.set(type, (await this.repo.typeWeekAt(q, type, month))?.weekdays ?? null);
    }
    const out: Record<string, number[]> = {};
    for (const s of staff) {
      // Loại không có tuần ở tháng này thì bỏ qua, kể cả khi có tuần riêng (workWeekOf cũng không trả lời cho người đó).
      const typeWeekdays = typeWeeks.get(s.type);
      if (!typeWeekdays) continue;
      out[s.username] = parseWeekdays(own.get(s.uuid) ?? null) ?? typeWeekdays;
    }
    return out;
  }

  zone(q: Q = this.repo.db): Promise<Zone | null> {
    return this.repo.zone(q);
  }

  /** Id của dòng nhật ký cài đặt mới nhất (mọi cài đặt, kể cả tuần riêng và vùng chấm công); 0 khi chưa có. */
  maxChangeId(q: Q = this.repo.db): Promise<number> {
    return this.repo.maxChangeId(q);
  }
}

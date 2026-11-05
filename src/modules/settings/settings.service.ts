// Lưu và đọc kho cài đặt (spec mục 5.1): 6 nhóm con số tính lương theo tháng, lịch sử đổi và ngày trả lương.
// Mỗi lần lưu chạy trong một transaction, khoá theo nhóm, so `stamp` rồi mới ghi, nên hai Admin lưu cùng lúc thì
// đúng một người thành công và người kia nhận 409.
import { Inject, Injectable } from '@nestjs/common';
import { businessMonthText } from '../../common/business-date';
import { planChange, versionAt, type ChainVersion, type Values } from '../../common/version-chain';
import { TransactionCoordinator } from '../../database/transaction';
import { validateZone, type Zone } from './domain/attendance-zone';
import { payDateOf } from './domain/pay-days';
import { validateWeekdays } from './domain/work-week';
import { minMonthFrom } from './domain/min-month';
import {
  decodeValues,
  defaultsOf,
  encodeValues,
  GROUP_KEYS,
  isGroupKey,
  limitsOf,
  SETTING_GROUPS,
  validateGroupChange,
  type BracketLimit,
  type GroupKey,
  type GroupValues,
  type NumberLimit
} from './domain/setting-groups';
import { parseEffectiveMonth, parseMonth, parseReason, parseStamp, SEED_MONTH } from './domain/settings-input';
import { SettingsReader, type WorkWeek } from './settings-reader';
import { SettingsEmployeeNotFoundError, SettingsGroupNotFoundError, SettingsInputError, SettingsStaleError } from './settings.errors';
import { SettingsRepository, type ChangeRow, type StaffRef, type StoredChange } from './settings.repository';

type Tx = Pick<TransactionCoordinator, 'run' | 'acquireAdvisoryLock'>;

export interface GroupView {
  from: string;
  stamp: number;
  values: GroupValues;
  defaults: GroupValues;
  limits: Record<string, NumberLimit | BracketLimit>;
  sum?: number;
}

export interface HistoryItem {
  id: number;
  field: string;
  month: string | null;
  from: unknown;
  to: unknown;
  by: string;
  at: string;
  reason: string | null;
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

const monthText = (ym: string) => `${ym.slice(5)}/${ym.slice(0, 4)}`;

const WORK_WEEK = 'work-week';
const ATTENDANCE_ZONE = 'attendance-zone';
// Tháng của bản gốc ảo trong chuỗi tuần riêng, sớm hơn mọi tháng thật.
const VIRTUAL_BASE = '0000-00';

const toHistoryItem = (r: StoredChange): HistoryItem => ({
  id: r.id,
  field: r.field,
  month: r.effectiveMonth,
  from: r.oldJson === null ? null : JSON.parse(r.oldJson),
  to: JSON.parse(r.newJson),
  by: r.changedBy,
  at: r.changedAt,
  reason: r.reason
});

@Injectable()
export class SettingsService {
  constructor(
    @Inject(SettingsRepository) private readonly repo: SettingsRepository,
    @Inject(SettingsReader) readonly reader: SettingsReader,
    @Inject(TransactionCoordinator) private readonly tx: Tx
  ) {}

  async getAll(month: unknown, now: Date = new Date()): Promise<{ month: string; minMonth: string; groups: Record<string, GroupView> }> {
    const at = month === undefined ? businessMonthText(now) : parseMonth(month, 'month');
    if (at < SEED_MONTH) throw new SettingsInputError(`Tháng phải từ ${monthText(SEED_MONTH)} trở đi`, 'month');
    const q = this.repo.db;
    const minMonth = minMonthFrom(await this.repo.lastClosedMonth(q), now);
    const groups: Record<string, GroupView> = {};
    for (const g of GROUP_KEYS) {
      const spec = SETTING_GROUPS[g];
      // Đọc stamp trước chuỗi: nếu có lần lưu xen vào giữa thì stamp cũ đi với số mới, lần lưu kế tiếp vẫn bị từ chối.
      const stamp = await this.repo.stampOf(q, g, null);
      const version = versionAt(await this.repo.groupChain(q, g), at);
      if (!version) throw new Error(`Không có cài đặt ${g} nào có hiệu lực ở tháng ${at}`);
      const view: GroupView = {
        from: version.month,
        stamp,
        values: decodeValues(g, version.values),
        defaults: defaultsOf(g),
        limits: limitsOf(g)
      };
      if (spec.sum !== undefined) view.sum = spec.sum;
      groups[spec.responseKey] = view;
    }
    return { month: at, minMonth, groups };
  }

  async saveGroup(
    group: unknown,
    body: unknown,
    actor: string,
    now: Date = new Date()
  ): Promise<{ ok: true; effectiveMonth: string; changed: string[]; stamp: number }> {
    if (!isGroupKey(group)) throw new SettingsGroupNotFoundError(`Không có nhóm cài đặt "${String(group)}"`);
    const g: GroupKey = group;
    const input = isRecord(body) ? body : {};
    const changes = encodeValues(validateGroupChange(g, input.values));
    const reason = parseReason(input.reason);
    const stamp = parseStamp(input.stamp);
    const meta = { actor, at: now.toISOString() };

    return this.tx.run(async trx => {
      await this.tx.acquireAdvisoryLock(trx, `settings:${g}`);
      const minMonth = minMonthFrom(await this.repo.lastClosedMonth(trx), now);
      const month = parseEffectiveMonth(input.effectiveMonth, minMonth);

      const current = await this.repo.stampOf(trx, g, null);
      if (current !== stamp) throw new SettingsStaleError('Nhóm cài đặt này vừa được người khác lưu, hãy tải lại', current);

      const chain = await this.repo.groupChain(trx, g);
      const cur = versionAt(chain, month);
      if (!cur) throw new SettingsInputError(`Chưa có cài đặt nào có hiệu lực ở tháng ${monthText(month)}`, 'effectiveMonth');
      const plan = planChange(chain, month, changes);
      if (!plan) return { ok: true as const, effectiveMonth: month, changed: [], stamp: current };

      await this.repo.writeGroupVersion(trx, g, month, { ...cur.values, ...plan.set }, meta);
      for (const c of plan.carry) {
        const target = chain.find(v => v.month === c.month);
        if (!target) throw new Error(`Thiếu phiên bản ${c.month} của nhóm ${g} để chép tiếp`);
        await this.repo.writeGroupVersion(trx, g, c.month, { ...target.values, ...c.set }, meta);
      }

      const before = decodeValues(g, cur.values);
      const after = decodeValues(g, plan.set as Values);
      const keys = Object.keys(plan.set);
      const rows: ChangeRow[] = keys.map(field => ({
        setting: g,
        field,
        subject: null,
        effectiveMonth: month,
        oldJson: JSON.stringify(before[field]),
        newJson: JSON.stringify(after[field]),
        reason
      }));
      const ids = await this.repo.insertChanges(trx, rows, meta);
      return { ok: true as const, effectiveMonth: month, changed: keys, stamp: Math.max(...ids) };
    });
  }

  async groupHistory(group: unknown): Promise<{ items: HistoryItem[] }> {
    if (!isGroupKey(group)) throw new SettingsGroupNotFoundError(`Không có nhóm cài đặt "${String(group)}"`);
    return { items: (await this.repo.history(this.repo.db, group, null)).map(toHistoryItem) };
  }

  async workWeeks(month: unknown, now: Date = new Date()): Promise<{ month: string; weekdays: Record<string, number[]> }> {
    const at = parseMonth(month ?? businessMonthText(now), 'month');
    if (at < SEED_MONTH) throw new SettingsInputError(`Tháng phải từ ${monthText(SEED_MONTH)} trở đi`, 'month');
    return { month: at, weekdays: await this.reader.workWeeksAt(at, this.repo.db) };
  }

  async getWorkWeek(
    username: unknown,
    month: unknown,
    now: Date = new Date()
  ): Promise<{ username: string; month: string; minMonth: string } & WorkWeek & { stamp: number }> {
    const at = month === undefined ? businessMonthText(now) : parseMonth(month, 'month');
    if (at < SEED_MONTH) throw new SettingsInputError(`Tháng phải từ ${monthText(SEED_MONTH)} trở đi`, 'month');
    const q = this.repo.db;
    const staff = await this.staffOf(q, username);
    const minMonth = minMonthFrom(await this.repo.lastClosedMonth(q), now);
    // Đọc stamp trước chuỗi, cùng lý do như getAll.
    const stamp = await this.repo.stampOf(q, WORK_WEEK, staff.uuid);
    const week = await this.reader.workWeekOf(staff.uuid, at, q);
    return { username: staff.username, month: at, minMonth, ...week, stamp };
  }

  async saveWorkWeek(
    username: unknown,
    body: unknown,
    actor: string,
    now: Date = new Date()
  ): Promise<{ ok: true; weekdays: number[]; source: 'type' | 'own'; standardWorkdays: number; stamp: number }> {
    const input = isRecord(body) ? body : {};
    // weekdays null = quay về tuần của loại nhân sự; trong chuỗi phiên bản là chuỗi JSON của mảng tăng dần hoặc null.
    const weekdays = input.weekdays === null ? null : JSON.stringify(validateWeekdays(input.weekdays));
    const reason = parseReason(input.reason);
    const stamp = parseStamp(input.stamp);
    const meta = { actor, at: now.toISOString() };

    return this.tx.run(async trx => {
      const staff = await this.staffOf(trx, username);
      await this.tx.acquireAdvisoryLock(trx, `settings:${WORK_WEEK}:${staff.uuid}`);
      const minMonth = minMonthFrom(await this.repo.lastClosedMonth(trx), now);
      const month = parseEffectiveMonth(input.effectiveMonth, minMonth);

      const current = await this.repo.stampOf(trx, WORK_WEEK, staff.uuid);
      if (current !== stamp) throw new SettingsStaleError('Tuần làm việc của người này vừa được người khác lưu, hãy tải lại', current);

      // Bản gốc ảo (chưa có dòng riêng = theo loại) chỉ để planChange chạy được; không bao giờ ghi xuống DB.
      const chain: ChainVersion[] = [{ month: VIRTUAL_BASE, values: { weekdays: null } }, ...(await this.repo.workWeekChain(trx, staff.uuid))];
      const cur = versionAt(chain, month) as ChainVersion;
      const plan = planChange(chain, month, { weekdays });
      if (plan) {
        await this.repo.writeWorkWeek(trx, staff.uuid, month, weekdays, meta);
        for (const c of plan.carry) await this.repo.writeWorkWeek(trx, staff.uuid, c.month, c.set.weekdays as string | null, meta);
      }

      const [id] = plan
        ? await this.repo.insertChanges(
            trx,
            [
              {
                setting: WORK_WEEK,
                field: 'weekdays',
                subject: staff.uuid,
                effectiveMonth: month,
                oldJson: cur.values.weekdays as string | null,
                newJson: weekdays ?? 'null',
                reason
              }
            ],
            meta
          )
        : [current];
      const week = await this.reader.workWeekOf(staff.uuid, month, trx);
      return { ok: true as const, weekdays: week.weekdays, source: week.source, standardWorkdays: week.standardWorkdays, stamp: id };
    });
  }

  async workWeekHistory(username: unknown): Promise<{ items: HistoryItem[] }> {
    const staff = await this.staffOf(this.repo.db, username);
    return { items: (await this.repo.history(this.repo.db, WORK_WEEK, staff.uuid)).map(toHistoryItem) };
  }

  async getZone(): Promise<{ zone: Zone | null; stamp: number }> {
    const q = this.repo.db;
    const stamp = await this.repo.stampOf(q, ATTENDANCE_ZONE, null);
    return { zone: await this.repo.zone(q), stamp };
  }

  async saveZone(body: unknown, actor: string, now: Date = new Date()): Promise<{ ok: true; zone: Zone; stamp: number }> {
    const input = isRecord(body) ? body : {};
    const zone = validateZone(input);
    const reason = parseReason(input.reason);
    const stamp = parseStamp(input.stamp);
    const meta = { actor, at: now.toISOString() };

    return this.tx.run(async trx => {
      await this.tx.acquireAdvisoryLock(trx, `settings:${ATTENDANCE_ZONE}`);
      const current = await this.repo.stampOf(trx, ATTENDANCE_ZONE, null);
      if (current !== stamp) throw new SettingsStaleError('Vùng chấm công vừa được người khác lưu, hãy tải lại', current);

      const old = await this.repo.zone(trx);
      if (old && old.lat === zone.lat && old.lng === zone.lng && old.radiusM === zone.radiusM) return { ok: true as const, zone, stamp: current };

      await this.repo.saveZone(trx, zone, meta);
      const ids = await this.repo.insertChanges(
        trx,
        [
          {
            setting: ATTENDANCE_ZONE,
            field: 'zone',
            subject: null,
            effectiveMonth: null,
            oldJson: old ? JSON.stringify(old) : null,
            newJson: JSON.stringify(zone),
            reason
          }
        ],
        meta
      );
      return { ok: true as const, zone, stamp: Math.max(...ids) };
    });
  }

  async zoneHistory(): Promise<{ items: HistoryItem[] }> {
    return { items: (await this.repo.history(this.repo.db, ATTENDANCE_ZONE, null)).map(toHistoryItem) };
  }

  private async staffOf(q: Parameters<SettingsRepository['staffByUsername']>[0], username: unknown): Promise<StaffRef> {
    const staff = typeof username === 'string' ? await this.repo.staffByUsername(q, username) : null;
    if (!staff) throw new SettingsEmployeeNotFoundError(`Không có nhân viên "${String(username)}"`);
    return staff;
  }

  async payDays(year: unknown): Promise<{ year: number; items: Array<{ month: string; payDay: number; payDate: string }> }> {
    if (typeof year !== 'string' || !/^\d{4}$/.test(year)) throw new SettingsInputError('Năm phải có 4 chữ số', 'year');
    if (`${year}-01` < SEED_MONTH) throw new SettingsInputError(`Năm phải từ ${SEED_MONTH.slice(0, 4)} trở đi`, 'year');
    const chain = await this.repo.groupChain(this.repo.db, 'pay-calendar');
    const items = [];
    for (let m = 1; m <= 12; m++) {
      const month = `${year}-${String(m).padStart(2, '0')}`;
      const version = versionAt(chain, month);
      if (!version) throw new Error(`Không có ngày trả lương nào có hiệu lực ở tháng ${month}`);
      const payDay = Number(version.values.payDay);
      items.push({ month, payDay, payDate: payDateOf(month, payDay) });
    }
    return { year: Number(year), items };
  }
}

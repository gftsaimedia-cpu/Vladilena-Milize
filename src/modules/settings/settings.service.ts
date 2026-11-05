// Lưu và đọc kho cài đặt (spec mục 5.1): 6 nhóm con số tính lương theo tháng, lịch sử đổi và ngày trả lương.
// Mỗi lần lưu chạy trong một transaction, khoá theo nhóm, so `stamp` rồi mới ghi, nên hai Admin lưu cùng lúc thì
// đúng một người thành công và người kia nhận 409.
import { Inject, Injectable } from '@nestjs/common';
import { businessMonthText } from '../../common/business-date';
import { planChange, versionAt, type Values } from '../../common/version-chain';
import { TransactionCoordinator } from '../../database/transaction';
import { payDateOf } from './domain/pay-days';
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
import { parseEffectiveMonth, parseMonth, parseReason, parseStamp } from './domain/settings-input';
import { SettingsReader } from './settings-reader';
import { SettingsGroupNotFoundError, SettingsInputError, SettingsStaleError } from './settings.errors';
import { SettingsRepository, type ChangeRow } from './settings.repository';

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

@Injectable()
export class SettingsService {
  constructor(
    @Inject(SettingsRepository) private readonly repo: SettingsRepository,
    @Inject(SettingsReader) readonly reader: SettingsReader,
    @Inject(TransactionCoordinator) private readonly tx: Tx
  ) {}

  async getAll(month: unknown, now: Date = new Date()): Promise<{ month: string; minMonth: string; groups: Record<string, GroupView> }> {
    const at = month === undefined ? businessMonthText(now) : parseMonth(month, 'month');
    const q = this.repo.db;
    const minMonth = minMonthFrom(await this.repo.lastClosedMonth(q), now);
    const groups: Record<string, GroupView> = {};
    for (const g of GROUP_KEYS) {
      const spec = SETTING_GROUPS[g];
      const version = versionAt(await this.repo.groupChain(q, g), at);
      if (!version) throw new Error(`Không có cài đặt ${g} nào có hiệu lực ở tháng ${at}`);
      const view: GroupView = {
        from: version.month,
        stamp: await this.repo.stampOf(q, g, null),
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
        if (target) await this.repo.writeGroupVersion(trx, g, c.month, { ...target.values, ...c.set }, meta);
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
    const rows = await this.repo.history(this.repo.db, group, null);
    return {
      items: rows.map(r => ({
        id: r.id,
        field: r.field,
        month: r.effectiveMonth,
        from: r.oldJson === null ? null : JSON.parse(r.oldJson),
        to: JSON.parse(r.newJson),
        by: r.changedBy,
        at: r.changedAt,
        reason: r.reason
      }))
    };
  }

  async payDays(year: unknown): Promise<{ year: number; items: Array<{ month: string; payDay: number; payDate: string }> }> {
    if (typeof year !== 'string' || !/^\d{4}$/.test(year)) throw new SettingsInputError('Năm phải có 4 chữ số', 'year');
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

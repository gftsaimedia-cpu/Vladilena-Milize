// Đọc và ghi phiên bản chức vụ (position_types + position_type_benefits) và bậc (position_levels).
// Mọi hàm chạy trên transaction do service mở (TransactionCoordinator.run), không dùng pool riêng.
import { Injectable } from '@nestjs/common';
import { sql } from 'kysely';
import type { DatabaseTransaction } from '../../database/transaction';
import type { ChainVersion, Values } from './domain/version-chain';

export interface StoredVersion extends ChainVersion {
  id: number;
  rev: number;
}

/** reason: không có khoá thì giữ lý do cũ (khi sửa); khi tạo mới thì thiếu = null. */
export interface WriteMeta {
  actor: string;
  at: string;
  reason?: string | null;
}

const TYPE_COLUMNS: Record<string, string> = {
  name: 'name',
  workdays: 'workdays',
  flexPct: 'flex_pct',
  nightPct: 'night_pct',
  travelPct: 'travel_pct',
  attendancePct: 'attendance_pct'
};
const LEVEL_COLUMNS: Record<string, string> = {
  name: 'name',
  baseSalary: 'base_salary',
  kpiMax: 'kpi_max',
  nightPct: 'night_pct'
};
const BENEFIT = 'benefit.';

const numOrNull = (v: unknown) => (v === null || v === undefined ? null : Number(v));

/** Tách các ô cần ghi thành cột của bảng và ô tick ('benefit.<mã>'). */
function split(set: Values, columns: Record<string, string>) {
  const cols: Record<string, unknown> = {};
  const ticks: Array<[string, boolean]> = [];
  for (const [key, value] of Object.entries(set)) {
    if (key.startsWith(BENEFIT)) ticks.push([key.slice(BENEFIT.length), Boolean(value)]);
    else if (columns[key]) cols[columns[key]] = value;
    else throw new Error(`Không có ô ${key}`);
  }
  return { cols, ticks };
}

function stamp(meta: WriteMeta) {
  return {
    updated_by: meta.actor,
    updated_at: meta.at,
    ...('reason' in meta ? { reason: meta.reason ?? null } : {})
  };
}

@Injectable()
export class PositionsRepository {
  /** Các phiên bản của một chức vụ, tháng tăng dần, kèm mọi ô tick của từng phiên bản. */
  async typeChain(trx: DatabaseTransaction, code: string): Promise<StoredVersion[]> {
    const rows = await trx
      .selectFrom('position_types')
      .selectAll()
      .where('code', '=', code)
      .orderBy('effective_month', 'asc')
      .execute();
    if (!rows.length) return [];
    const ticks = await trx
      .selectFrom('position_type_benefits')
      .selectAll()
      .where('type_id', 'in', rows.map(r => r.id))
      .execute();
    return rows.map(r => ({
      id: Number(r.id),
      month: r.effective_month,
      rev: Number(r.rev),
      values: {
        name: r.name,
        workdays: Number(r.workdays),
        flexPct: Number(r.flex_pct),
        nightPct: Number(r.night_pct),
        travelPct: Number(r.travel_pct),
        attendancePct: Number(r.attendance_pct),
        ...Object.fromEntries(
          ticks.filter(b => Number(b.type_id) === Number(r.id)).map(b => [BENEFIT + b.benefit, Number(b.enabled) === 1])
        )
      }
    }));
  }

  /** Các phiên bản của một bậc, tháng tăng dần. */
  async levelChain(trx: DatabaseTransaction, code: string, level: number): Promise<StoredVersion[]> {
    const rows = await trx
      .selectFrom('position_levels')
      .selectAll()
      .where('type_code', '=', code)
      .where('level_no', '=', level)
      .orderBy('effective_month', 'asc')
      .execute();
    return rows.map(r => ({
      id: Number(r.id),
      month: r.effective_month,
      rev: Number(r.rev),
      values: {
        name: r.name,
        baseSalary: Number(r.base_salary),
        kpiMax: numOrNull(r.kpi_max),
        nightPct: numOrNull(r.night_pct)
      }
    }));
  }

  /** Số bậc lớn nhất đã có phiên bản không sau `month`; 0 khi chưa có bậc nào. */
  async maxLevelAt(trx: DatabaseTransaction, code: string, month: string): Promise<number> {
    const row = await trx
      .selectFrom('position_levels')
      .select(eb => eb.fn.max('level_no').as('max'))
      .where('type_code', '=', code)
      .where('effective_month', '<=', month)
      .executeTakeFirst();
    return Number(row?.max ?? 0) || 0;
  }

  /** Chép mọi cột và mọi ô tick của phiên bản fromId sang tháng `month`, áp `set`; trả id mới (rev 0). */
  async insertTypeFrom(
    trx: DatabaseTransaction,
    fromId: number,
    month: string,
    set: Values,
    meta: WriteMeta
  ): Promise<number> {
    const from = await trx.selectFrom('position_types').selectAll().where('id', '=', fromId).executeTakeFirstOrThrow();
    const { cols, ticks } = split(set, TYPE_COLUMNS);
    const { id: _id, ...copy } = from;
    const inserted = await trx
      .insertInto('position_types')
      .values({
        ...copy,
        ...cols,
        effective_month: month,
        rev: 0,
        reason: meta.reason ?? null,
        updated_by: meta.actor,
        updated_at: meta.at
      } as any)
      .returning('id')
      .executeTakeFirstOrThrow();
    const newId = Number(inserted.id);
    const benefits = await trx
      .selectFrom('position_type_benefits')
      .select(['benefit', 'enabled'])
      .where('type_id', '=', fromId)
      .execute();
    if (benefits.length) {
      await trx
        .insertInto('position_type_benefits')
        .values(benefits.map(b => ({ type_id: newId, benefit: b.benefit, enabled: b.enabled })))
        .execute();
    }
    await this.setTicks(trx, newId, ticks);
    return newId;
  }

  /** Sửa tại chỗ một phiên bản chức vụ: rev + 1 kể cả khi chỉ đổi ô tick. */
  async updateType(trx: DatabaseTransaction, id: number, set: Values, meta: WriteMeta): Promise<void> {
    const { cols, ticks } = split(set, TYPE_COLUMNS);
    await trx
      .updateTable('position_types')
      .set({ ...cols, ...stamp(meta), rev: sql<number>`rev + 1` } as any)
      .where('id', '=', id)
      .execute();
    await this.setTicks(trx, id, ticks);
  }

  /** Chép mọi cột của phiên bản bậc fromId sang tháng `month`, áp `set`; trả id mới (rev 0). */
  async insertLevelFrom(
    trx: DatabaseTransaction,
    fromId: number,
    month: string,
    set: Values,
    meta: WriteMeta
  ): Promise<number> {
    const from = await trx.selectFrom('position_levels').selectAll().where('id', '=', fromId).executeTakeFirstOrThrow();
    const { cols } = split(set, LEVEL_COLUMNS);
    const { id: _id, ...copy } = from;
    const inserted = await trx
      .insertInto('position_levels')
      .values({
        ...copy,
        ...cols,
        effective_month: month,
        rev: 0,
        reason: meta.reason ?? null,
        updated_by: meta.actor,
        updated_at: meta.at
      } as any)
      .returning('id')
      .executeTakeFirstOrThrow();
    return Number(inserted.id);
  }

  async updateLevel(trx: DatabaseTransaction, id: number, set: Values, meta: WriteMeta): Promise<void> {
    const { cols } = split(set, LEVEL_COLUMNS);
    await trx
      .updateTable('position_levels')
      .set({ ...cols, ...stamp(meta), rev: sql<number>`rev + 1` } as any)
      .where('id', '=', id)
      .execute();
  }

  /** Bậc mới từ tháng `month` (rev 0). */
  async insertLevel(
    trx: DatabaseTransaction,
    code: string,
    level: number,
    month: string,
    values: Values,
    meta: WriteMeta
  ): Promise<number> {
    const { cols } = split(values, LEVEL_COLUMNS);
    const inserted = await trx
      .insertInto('position_levels')
      .values({
        ...cols,
        type_code: code,
        level_no: level,
        effective_month: month,
        rev: 0,
        reason: meta.reason ?? null,
        updated_by: meta.actor,
        updated_at: meta.at
      } as any)
      .returning('id')
      .executeTakeFirstOrThrow();
    return Number(inserted.id);
  }

  private async setTicks(trx: DatabaseTransaction, typeId: number, ticks: Array<[string, boolean]>): Promise<void> {
    for (const [benefit, on] of ticks) {
      const enabled = on ? 1 : 0;
      await trx
        .insertInto('position_type_benefits')
        .values({ type_id: typeId, benefit, enabled })
        .onConflict(oc => oc.columns(['type_id', 'benefit']).doUpdateSet({ enabled }))
        .execute();
    }
  }
}

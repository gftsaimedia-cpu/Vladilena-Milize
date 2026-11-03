import { Insertable, Kysely, Selectable, sql } from 'kysely';
import { flavorOf, SqlFlavor } from './flavor';
import type { Schema } from './schema.generated';
import type { LegacySchema } from './legacy-schema';

export type WorkShiftRow = Selectable<Schema['work_shifts']>;
export type LeaveLedgerRow = Selectable<LegacySchema['leave_ledger']>;
export type ExplanationRow = Selectable<LegacySchema['explanations']>;
export type PositionTypeRow = Selectable<Schema['position_types']>;
export type PositionLevelRow = Selectable<Schema['position_levels']>;

type RevisionedTable = 'work_shifts' | 'position_types' | 'position_levels' | 'explanations';

export type RevisionedUpdate = { updated: true; rev: number } | { updated: false; current: number | null };

/** Ghi một dòng có cột `rev` bằng khoá lạc quan: chỉ ghi khi rev trong DB bằng `expectedRev` (không truyền = ghi đè), rồi tăng rev. */
export class RevisionedWrites {
  constructor(private readonly qb: Kysely<LegacySchema>) {}

  async update(
    table: RevisionedTable,
    key: string,
    id: string | number,
    expectedRev: number | null | undefined,
    sets: Record<string, unknown>
  ): Promise<RevisionedUpdate> {
    const db = this.qb as unknown as Kysely<any>;
    let query = db
      .updateTable(table)
      .set({ ...sets, rev: sql`rev + 1` })
      .where(key, '=', id);
    if (expectedRev != null) query = query.where('rev', '=', Number(expectedRev));
    const result = await query.executeTakeFirst();
    const row = await db.selectFrom(table).select('rev').where(key, '=', id).executeTakeFirst();
    if (Number(result.numUpdatedRows) === 1 && row) return { updated: true, rev: Number(row.rev) };
    return { updated: false, current: row ? Number(row.rev) : null };
  }
}

/** Bảng `work_shifts`: danh mục ca làm việc (mã mới `code`, mã cũ `preset`). */
export class WorkShiftsRepository {
  constructor(private readonly qb: Kysely<Schema>) {}

  list(includeDeprecated: boolean): Promise<WorkShiftRow[]> {
    let query = this.qb.selectFrom('work_shifts').selectAll();
    if (!includeDeprecated) query = query.where('deprecated', '=', 0);
    return query.orderBy('sort').orderBy('code').execute();
  }

  /** Ca theo mã mới hoặc mã cũ. */
  find(code: string): Promise<WorkShiftRow | undefined> {
    return this.qb
      .selectFrom('work_shifts')
      .selectAll()
      .where(eb => eb.or([eb('code', '=', code), eb('preset', '=', code)]))
      .limit(1)
      .executeTakeFirst();
  }
}

/** Bảng `leave_ledger` (sổ phép) và số dư phép lưu sẵn trên `staff`. */
export class LeaveLedgerRepository {
  private readonly flavor: SqlFlavor;

  constructor(private readonly qb: Kysely<LegacySchema>) {
    this.flavor = flavorOf(qb as any);
  }

  eventsOf(staffUuid: string): Promise<Pick<LeaveLedgerRow, 'kind' | 'on_date' | 'days'>[]> {
    return this.qb.selectFrom('leave_ledger').select(['kind', 'on_date', 'days']).where('staff_uuid', '=', staffUuid).orderBy('on_date').orderBy('id').execute();
  }

  /** Thêm dòng, hoặc đổi số ngày nếu (người, loại, ngày) đã có. */
  async upsert(row: { staffUuid: string; username: string; kind: string; onDate: string; days: number; at: string }): Promise<void> {
    await this.qb
      .insertInto('leave_ledger')
      .values({ staff_uuid: row.staffUuid, username: row.username, kind: row.kind, on_date: row.onDate, days: row.days, created_at: row.at, updated_at: row.at })
      .onConflict(oc => oc.columns(['staff_uuid', 'kind', 'on_date']).doUpdateSet({ days: row.days, updated_at: row.at }))
      .execute();
  }

  async remove(staffUuid: string, kind: string, onDate: string): Promise<void> {
    await this.qb.deleteFrom('leave_ledger').where('staff_uuid', '=', staffUuid).where('kind', '=', kind).where('on_date', '=', onDate).execute();
  }

  /** Ghi số dư lưu sẵn, chỉ khi khác số đang lưu (so cả NULL); trả true nếu có ghi. */
  async saveBalance(username: string, balance: number | null, on: string | null): Promise<boolean> {
    const result = await this.qb
      .updateTable('staff')
      .set({ leave_balance: balance, leave_balance_on: on })
      .where('username', '=', username)
      .where(eb => eb.or([this.flavor.differs('leave_balance', balance), this.flavor.differs('leave_balance_on', on)]))
      .executeTakeFirst();
    return Number(result.numUpdatedRows) > 0;
  }
}

export interface ExplanationListFilter {
  username?: string;
  status?: string;
}

/** Bảng `explanations`: giải trình (Admin yêu cầu, nhân viên trả lời, Admin duyệt). */
export class ExplanationsRepository {
  constructor(private readonly qb: Kysely<LegacySchema>) {}

  find(id: number): Promise<ExplanationRow | undefined> {
    return this.qb.selectFrom('explanations').selectAll().where('id', '=', id).executeTakeFirst();
  }

  /** Giải trình loại `kind` (và `ruleId`, null = không gắn luật) của một lượt. */
  forSession(sessionId: number, kind: string, ruleId: string | null): Promise<ExplanationRow | undefined> {
    const query = this.qb.selectFrom('explanations').selectAll().where('session_id', '=', sessionId).where('kind', '=', kind);
    return (ruleId ? query.where('rule_id', '=', ruleId) : query.where('rule_id', 'is', null)).executeTakeFirst();
  }

  ofSessions(sessionIds: number[]): Promise<ExplanationRow[]> {
    return this.qb.selectFrom('explanations').selectAll().where('session_id', 'in', sessionIds).orderBy('id').execute();
  }

  /** Check-out muộn của lượt đã có trả lời (trạng thái khác "chờ trả lời"). */
  async hasLateAnswer(sessionId: number): Promise<boolean> {
    const row = await this.qb
      .selectFrom('explanations')
      .select('id')
      .where('session_id', '=', sessionId)
      .where('kind', '=', 'late-checkout')
      .where('status', '!=', 'requested')
      .limit(1)
      .executeTakeFirst();
    return !!row;
  }

  async insert(row: Insertable<LegacySchema['explanations']>): Promise<number> {
    const result = await this.qb.insertInto('explanations').values(row).returning('id').executeTakeFirstOrThrow();
    return Number(result.id);
  }

  /** Giải trình CHƯA được duyệt có ngày trong [from, to], theo ngày. */
  notApprovedBetween(from: string, to: string): Promise<Pick<ExplanationRow, 'username' | 'date' | 'status'>[]> {
    return this.qb
      .selectFrom('explanations')
      .select(['username', 'date', 'status'])
      .where('status', '!=', 'approved')
      .where('date', '>=', from)
      .where('date', '<=', to)
      .orderBy('date')
      .execute();
  }

  /** Cặp (người, ngày) có giải trình ở bất kỳ trạng thái nào trong [from, to]. */
  daysBetween(from: string, to: string): Promise<Pick<ExplanationRow, 'username' | 'date'>[]> {
    return this.qb.selectFrom('explanations').select(['username', 'date']).distinct().where('date', '>=', from).where('date', '<=', to).execute();
  }

  async existsOnDay(username: string, date: string): Promise<boolean> {
    const row = await this.qb.selectFrom('explanations').select('id').where('username', '=', username).where('date', '=', date).limit(1).executeTakeFirst();
    return !!row;
  }

  /** Giải trình gắn ngày (không có session_id) của `usernames` trong [from, to], id tăng dần. */
  forDays(usernames: string[], from: string, to: string): Promise<ExplanationRow[]> {
    return this.qb
      .selectFrom('explanations')
      .selectAll()
      .where('session_id', 'is', null)
      .where('date', '>=', from)
      .where('date', '<=', to)
      .where('username', 'in', usernames)
      .orderBy('id')
      .execute();
  }

  list(filter: ExplanationListFilter, limit: number): Promise<ExplanationRow[]> {
    let query = this.qb.selectFrom('explanations').selectAll();
    if (filter.username) query = query.where('username', '=', filter.username);
    if (filter.status) query = query.where('status', '=', filter.status);
    return query.orderBy('id', 'desc').limit(limit).execute();
  }

  async countByStatus(status: string, username?: string): Promise<number> {
    let query = this.qb.selectFrom('explanations').select(sql<number>`COUNT(*)`.as('n')).where('status', '=', status);
    if (username) query = query.where('username', '=', username);
    const row = await query.executeTakeFirstOrThrow();
    return Number(row.n);
  }
}

/** Các bảng `position_types`, `position_levels`, `position_type_benefits`, `benefit_types`: danh mục chức vụ theo tháng áp dụng. */
export class PositionRepository {
  constructor(private readonly qb: Kysely<Schema>) {}

  async typeCodes(): Promise<string[]> {
    const rows = await this.qb.selectFrom('position_types').select('code').distinct().orderBy('code').execute();
    return rows.map(r => r.code);
  }

  async benefitCodes(): Promise<string[]> {
    const rows = await this.qb.selectFrom('benefit_types').select('code').orderBy('code').execute();
    return rows.map(r => r.code);
  }

  /** Phiên bản chức vụ hiệu lực của tháng. */
  typeAt(code: string, month: string): Promise<PositionTypeRow | undefined> {
    return this.qb
      .selectFrom('position_types')
      .selectAll()
      .where('code', '=', code)
      .where('effective_month', '<=', month)
      .orderBy('effective_month', 'desc')
      .limit(1)
      .executeTakeFirst();
  }

  levelAt(type: string, level: number, month: string): Promise<PositionLevelRow | undefined> {
    return this.qb
      .selectFrom('position_levels')
      .selectAll()
      .where('type_code', '=', type)
      .where('level_no', '=', level)
      .where('effective_month', '<=', month)
      .orderBy('effective_month', 'desc')
      .limit(1)
      .executeTakeFirst();
  }

  /** Các số bậc đã có (hiệu lực từ ≤ tháng), tăng dần. */
  async levelNumbersAt(type: string, month: string): Promise<number[]> {
    const rows = await this.qb
      .selectFrom('position_levels')
      .select('level_no')
      .distinct()
      .where('type_code', '=', type)
      .where('effective_month', '<=', month)
      .orderBy('level_no')
      .execute();
    return rows.map(r => r.level_no);
  }

  benefitsOf(typeId: number): Promise<{ benefit: string; enabled: number }[]> {
    return this.qb.selectFrom('position_type_benefits').select(['benefit', 'enabled']).where('type_id', '=', typeId).execute();
  }

  async setBenefit(typeId: number, benefit: string, enabled: boolean): Promise<void> {
    await this.qb
      .insertInto('position_type_benefits')
      .values({ type_id: typeId, benefit, enabled: enabled ? 1 : 0 })
      .onConflict(oc => oc.columns(['type_id', 'benefit']).doUpdateSet({ enabled: enabled ? 1 : 0 }))
      .execute();
  }

  async insertType(row: Insertable<Schema['position_types']>): Promise<number> {
    const result = await this.qb.insertInto('position_types').values(row).returning('id').executeTakeFirstOrThrow();
    return Number(result.id);
  }

  async insertLevel(row: Insertable<Schema['position_levels']>): Promise<number> {
    const result = await this.qb.insertInto('position_levels').values(row).returning('id').executeTakeFirstOrThrow();
    return Number(result.id);
  }

  type(id: number): Promise<PositionTypeRow | undefined> {
    return this.qb.selectFrom('position_types').selectAll().where('id', '=', id).executeTakeFirst();
  }

  level(id: number): Promise<PositionLevelRow | undefined> {
    return this.qb.selectFrom('position_levels').selectAll().where('id', '=', id).executeTakeFirst();
  }

  allTypes(): Promise<PositionTypeRow[]> {
    return this.qb.selectFrom('position_types').selectAll().orderBy('id').execute();
  }

  allLevels(): Promise<PositionLevelRow[]> {
    return this.qb.selectFrom('position_levels').selectAll().orderBy('id').execute();
  }
}

// Đọc và ghi kho cài đặt: 6 nhóm con số tính lương theo tháng, tuần làm riêng từng người, vùng chấm công và nhật ký đổi.
// Mọi hàm nhận `q` (Kysely hoặc Transaction) để service gom nhiều bước vào một transaction.
import { Inject, Injectable } from '@nestjs/common';
import { sql, type Kysely } from 'kysely';
import type { ChainVersion, Values } from '../../common/version-chain';
import { KYSELY_DB } from '../../database/kysely';
import type { DB } from '../../database/schema';
import type { Zone } from './domain/attendance-zone';
import { SETTING_GROUPS, type Bracket, type GroupKey } from './domain/setting-groups';

type Q = Kysely<DB>;
// Bảng và cột của nhóm do danh mục SETTING_GROUPS chọn lúc chạy nên không có kiểu tĩnh.
type Loose = Kysely<any>;

export interface WriteMeta {
  actor: string;
  at: string;
}

export interface ChangeRow {
  setting: string;
  field: string;
  subject: string | null;
  effectiveMonth: string | null;
  oldJson: string | null;
  newJson: string;
  reason: string | null;
}

export interface StoredChange extends ChangeRow {
  id: number;
  changedBy: string;
  changedAt: string;
}

export interface StaffRef {
  uuid: string;
  username: string;
  type: string;
}

const HISTORY_LIMIT = 200;

@Injectable()
export class SettingsRepository {
  constructor(@Inject(KYSELY_DB) readonly db: Kysely<DB>) {}

  /** Các phiên bản của một nhóm, tháng tăng dần; ô brackets của `tax` là chuỗi JSON. */
  async groupChain(q: Q, g: GroupKey): Promise<ChainVersion[]> {
    const spec = SETTING_GROUPS[g];
    const rows = (await (q as Loose).selectFrom(spec.table).selectAll().orderBy('effective_month').execute()) as Array<Record<string, any>>;

    const brackets = new Map<string, Bracket[]>();
    if (g === 'tax') {
      const bracketRows = await q
        .selectFrom('tax_brackets')
        .select(['effective_month', 'upper_bound', 'rate_pct'])
        .orderBy('effective_month')
        .orderBy('sort')
        .execute();
      for (const b of bracketRows) {
        const list = brackets.get(b.effective_month) ?? [];
        list.push({ upTo: b.upper_bound === null ? null : Number(b.upper_bound), ratePct: Number(b.rate_pct) });
        brackets.set(b.effective_month, list);
      }
    }

    return rows.map(row => {
      const values: Values = {};
      for (const f of spec.fields) {
        values[f.name] = f.kind === 'brackets' ? JSON.stringify(brackets.get(row.effective_month) ?? []) : Number(row[f.column]);
      }
      return { month: row.effective_month as string, values };
    });
  }

  /** Upsert theo tháng, ghi đủ mọi cột. Với `tax`, xoá các bậc của tháng rồi chèn lại theo sort 1..n. */
  async writeGroupVersion(q: Q, g: GroupKey, month: string, values: Values, meta: WriteMeta): Promise<void> {
    const spec = SETTING_GROUPS[g];
    const columns: Record<string, unknown> = {};
    for (const f of spec.fields) {
      if (f.kind === 'brackets') continue;
      columns[f.column] = values[f.name];
    }
    const stamp = { updated_by: meta.actor, updated_at: new Date(meta.at) };
    await (q as Loose)
      .insertInto(spec.table)
      .values({ effective_month: month, ...columns, ...stamp })
      .onConflict((oc: any) => oc.column('effective_month').doUpdateSet({ ...columns, ...stamp }))
      .execute();

    if (g !== 'tax') return;
    const brackets = JSON.parse(String(values.brackets)) as Bracket[];
    await q.deleteFrom('tax_brackets').where('effective_month', '=', month).execute();
    if (!brackets.length) return;
    await q
      .insertInto('tax_brackets')
      .values(brackets.map((b, i) => ({ effective_month: month, sort: i + 1, upper_bound: b.upTo, rate_pct: b.ratePct })))
      .execute();
  }

  /** Thêm dòng nhật ký; trả id theo đúng thứ tự `rows`. */
  async insertChanges(q: Q, rows: ChangeRow[], meta: WriteMeta): Promise<number[]> {
    const ids: number[] = [];
    for (const r of rows) {
      const inserted = await q
        .insertInto('settings_changes')
        .values({
          setting: r.setting,
          field: r.field,
          subject: r.subject,
          effective_month: r.effectiveMonth,
          old_json: r.oldJson,
          new_json: r.newJson,
          reason: r.reason,
          changed_by: meta.actor,
          changed_at: new Date(meta.at)
        })
        .returning('id')
        .executeTakeFirstOrThrow();
      ids.push(Number(inserted.id));
    }
    return ids;
  }

  /** Id dòng nhật ký mới nhất của một cài đặt (một người nếu có subject); 0 khi chưa có. */
  async stampOf(q: Q, setting: string, subject: string | null): Promise<number> {
    let query = q.selectFrom('settings_changes').select(sql<number>`COALESCE(MAX(id), 0)`.as('stamp')).where('setting', '=', setting);
    query = subject === null ? query.where('subject', 'is', null) : query.where('subject', '=', subject);
    const row = await query.executeTakeFirstOrThrow();
    return Number(row.stamp);
  }

  /** Nhật ký của một cài đặt, id giảm dần. */
  async history(q: Q, setting: string, subject: string | null, limit = HISTORY_LIMIT): Promise<StoredChange[]> {
    let query = q.selectFrom('settings_changes').selectAll().where('setting', '=', setting);
    query = subject === null ? query.where('subject', 'is', null) : query.where('subject', '=', subject);
    const rows = await query.orderBy('id', 'desc').limit(limit).execute();
    return rows.map(r => ({
      id: Number(r.id),
      setting: r.setting,
      field: r.field,
      subject: r.subject,
      effectiveMonth: r.effective_month,
      oldJson: r.old_json,
      newJson: r.new_json,
      reason: r.reason,
      changedBy: r.changed_by,
      changedAt: r.changed_at.toISOString()
    }));
  }

  async maxChangeId(q: Q): Promise<number> {
    const row = await q.selectFrom('settings_changes').select(sql<number>`COALESCE(MAX(id), 0)`.as('max')).executeTakeFirstOrThrow();
    return Number(row.max);
  }

  /** Tháng lớn nhất có kỳ lương đã duyệt hoặc đã trả; null khi chưa có. */
  async lastClosedMonth(q: Q): Promise<string | null> {
    const row = await q
      .selectFrom('payroll_periods')
      .select(sql<string | null>`MAX(month)`.as('month'))
      .where('status', 'in', ['approved', 'paid'])
      .executeTakeFirstOrThrow();
    return row.month;
  }

  async staffByUsername(q: Q, username: string): Promise<StaffRef | null> {
    return this.staffRef(q, 'username', username);
  }

  async staffByUuid(q: Q, uuid: string): Promise<StaffRef | null> {
    return this.staffRef(q, 'uuid', uuid);
  }

  private async staffRef(q: Q, by: 'username' | 'uuid', value: string): Promise<StaffRef | null> {
    const row = await q.selectFrom('staff').select(['uuid', 'username', 'type']).where(by, '=', value).executeTakeFirst();
    if (!row || row.uuid === null) return null;
    return { uuid: row.uuid, username: row.username, type: row.type };
  }

  /** Mọi nhân sự đã có tài khoản (uuid khác NULL), theo username tăng dần. */
  async staffList(q: Q): Promise<StaffRef[]> {
    const rows = await q.selectFrom('staff').select(['uuid', 'username', 'type']).where('uuid', 'is not', null).orderBy('username').execute();
    return rows.flatMap(r => (r.uuid === null ? [] : [{ uuid: r.uuid, username: r.username, type: r.type }]));
  }

  /** Tuần làm và ngày công chuẩn của loại nhân sự, theo phiên bản mới nhất có tháng không sau `month`. */
  async typeWeekAt(q: Q, typeCode: string, month: string): Promise<{ weekdays: number[]; workdays: number } | null> {
    const row = await q
      .selectFrom('position_types')
      .select(['regular_dows', 'workdays'])
      .where('code', '=', typeCode)
      .where('effective_month', '<=', month)
      .orderBy('effective_month', 'desc')
      .limit(1)
      .executeTakeFirst();
    if (!row) return null;
    const dows = JSON.parse(row.regular_dows) as unknown[];
    const weekdays = dows.filter((d): d is number => Number.isInteger(d) && (d as number) >= 1 && (d as number) <= 6).sort((a, b) => a - b);
    return { weekdays, workdays: Number(row.workdays) };
  }

  /** Các phiên bản tuần làm riêng của một người, tháng tăng dần; weekdays là chuỗi JSON hoặc null (theo loại). */
  async workWeekChain(q: Q, uuid: string): Promise<ChainVersion[]> {
    const rows = await q
      .selectFrom('staff_work_weeks')
      .select(['effective_month', 'weekdays'])
      .where('employee_id', '=', uuid)
      .orderBy('effective_month')
      .execute();
    return rows.map(r => ({ month: r.effective_month, values: { weekdays: r.weekdays } }));
  }

  /** Với mỗi người có tuần riêng: weekdays (chuỗi JSON hoặc null = theo loại) của phiên bản mới nhất có tháng không sau `month`. */
  async ownWeeksAt(q: Q, month: string): Promise<Map<string, string | null>> {
    const rows = await q
      .selectFrom('staff_work_weeks')
      .select(['employee_id', 'weekdays'])
      .distinctOn('employee_id')
      .where('effective_month', '<=', month)
      .orderBy('employee_id')
      .orderBy('effective_month', 'desc')
      .execute();
    return new Map(rows.map(r => [r.employee_id, r.weekdays]));
  }

  async writeWorkWeek(q: Q, uuid: string, month: string, weekdays: string | null, meta: WriteMeta): Promise<void> {
    const stamp = { updated_by: meta.actor, updated_at: new Date(meta.at) };
    await q
      .insertInto('staff_work_weeks')
      .values({ employee_id: uuid, effective_month: month, weekdays, ...stamp })
      .onConflict(oc => oc.columns(['employee_id', 'effective_month']).doUpdateSet({ weekdays, ...stamp }))
      .execute();
  }

  /** Vùng chấm công; null khi chưa đặt. */
  async zone(q: Q): Promise<Zone | null> {
    const row = await q.selectFrom('attendance_zone').select(['lat', 'lng', 'radius_m']).where('id', '=', 1).executeTakeFirst();
    return row ? { lat: Number(row.lat), lng: Number(row.lng), radiusM: Number(row.radius_m) } : null;
  }

  async saveZone(q: Q, zone: Zone, meta: WriteMeta): Promise<void> {
    const columns = { lat: zone.lat, lng: zone.lng, radius_m: zone.radiusM, updated_by: meta.actor, updated_at: new Date(meta.at) };
    await q
      .insertInto('attendance_zone')
      .values({ id: 1, ...columns })
      .onConflict(oc => oc.column('id').doUpdateSet(columns))
      .execute();
  }
}

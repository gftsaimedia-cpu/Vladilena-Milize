import { Injectable, Inject } from '@nestjs/common';
import { sql } from 'kysely';
import type { Kysely } from 'kysely';
import { KYSELY_DB, type DB } from '../../database';

@Injectable()
export class SystemService {
  constructor(@Inject(KYSELY_DB) private readonly qb: Kysely<DB>) {}

  async checkHealth(): Promise<{ ok: boolean; timestamp: string }> {
    await sql`SELECT 1`.execute(this.qb);
    return { ok: true, timestamp: new Date().toISOString() };
  }

  async getSetting(key: string): Promise<string | null> {
    const row = await this.qb
      .selectFrom('settings')
      .select('value_json')
      .where('key', '=', key)
      .executeTakeFirst();
    return row?.value_json ?? null;
  }

  async setSetting(key: string, value: string, actor = 'system'): Promise<void> {
    await this.qb
      .insertInto('settings')
      .values({
        key,
        value_json: value,
      })
      .onConflict((oc) =>
        oc.column('key').doUpdateSet({
          value_json: value,
        })
      )
      .execute();
  }

  async listSettings(): Promise<Array<{ key: string; value: string }>> {
    const rows = await this.qb
      .selectFrom('settings')
      .select(['key', 'value_json'])
      .execute();
    return rows.map((r) => ({ key: r.key, value: r.value_json }));
  }

  async listPeriods(): Promise<any[]> {
    return await this.qb
      .selectFrom('payroll_periods')
      .selectAll()
      .orderBy('month', 'desc')
      .execute();
  }

  async getPeriod(month: string): Promise<any | null> {
    const row = await this.qb
      .selectFrom('payroll_periods')
      .selectAll()
      .where('month', '=', month)
      .executeTakeFirst();
    return row || null;
  }

  // Chốt công: kỳ sang bước attendance_locked (CHECK của payroll_periods chỉ nhận các trạng thái viết thường).
  async lockPeriod(month: string, actor: string): Promise<void> {
    const now = new Date().toISOString();
    await this.qb
      .insertInto('payroll_periods')
      .values({
        month,
        status: 'attendance_locked',
        rev: 1,
        attendance_locked_by: actor,
        attendance_locked_at: now,
      })
      .onConflict((oc) =>
        oc.column('month').doUpdateSet({
          status: 'attendance_locked',
          attendance_locked_by: actor,
          attendance_locked_at: now,
        })
      )
      .execute();
  }
}

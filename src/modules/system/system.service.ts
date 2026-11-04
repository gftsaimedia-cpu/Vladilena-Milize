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
      .select(['value'])
      .where('key', '=', key)
      .executeTakeFirst();
    return row?.value ?? null;
  }

  async setSetting(key: string, value: string, actor = 'system'): Promise<void> {
    const now = new Date().toISOString();
    await this.qb
      .insertInto('settings')
      .values({
        key,
        value,
        updated_at: now,
        updated_by: actor,
      })
      .onConflict((oc) =>
        oc.column('key').doUpdateSet({
          value,
          updated_at: now,
          updated_by: actor,
        })
      )
      .execute();
  }

  async listSettings(): Promise<Array<{ key: string; value: string }>> {
    return await this.qb
      .selectFrom('settings')
      .select(['key', 'value'])
      .execute();
  }

  async listAuditLogs(limit = 50, offset = 0): Promise<any[]> {
    return await this.qb
      .selectFrom('audit_log')
      .selectAll()
      .orderBy('id', 'desc')
      .limit(limit)
      .offset(offset)
      .execute();
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

  async lockPeriod(month: string, actor: string): Promise<void> {
    const now = new Date().toISOString();
    await this.qb
      .insertInto('payroll_periods')
      .values({
        month,
        status: 'LOCKED',
        rev: 1,
        attendance_locked_by: actor,
        attendance_locked_at: now,
      })
      .onConflict((oc) =>
        oc.column('month').doUpdateSet({
          status: 'LOCKED',
          attendance_locked_by: actor,
          attendance_locked_at: now,
        })
      )
      .execute();
  }
}

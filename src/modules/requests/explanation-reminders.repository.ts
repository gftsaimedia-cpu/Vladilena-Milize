import { Injectable, Inject } from '@nestjs/common';
import { Kysely, sql } from 'kysely';
import { KYSELY_DB, type DB } from '../../database';

export interface ReminderRow {
  employeeId: string;
  date: string;
  remindedBy: string;
  remindedAt: string;
}

/** Cột DATE đọc qua to_char: pg không đổi thành Date theo múi giờ máy. */
const dateText = sql<string>`to_char(work_date, 'YYYY-MM-DD')`;

@Injectable()
export class ExplanationRemindersRepository {
  constructor(@Inject(KYSELY_DB) private readonly qb: Kysely<DB>) {}

  /** Bản chạy mọi truy vấn trên `trx` (giao dịch đang mở của người gọi) thay vì pool. */
  withTransaction(trx: Kysely<DB>): ExplanationRemindersRepository {
    return new ExplanationRemindersRepository(trx);
  }

  /** Ghi lần nhắc; ngày đã có dòng thì thay bằng người nhắc và giờ nhắc mới. */
  async upsert(row: { employeeId: string; date: string; remindedBy: string; remindedAt: Date }): Promise<void> {
    await this.qb
      .insertInto('explanation_reminders')
      .values({
        employee_id: row.employeeId,
        work_date: row.date,
        reminded_by: row.remindedBy,
        reminded_at: row.remindedAt
      })
      .onConflict(oc =>
        oc.columns(['employee_id', 'work_date']).doUpdateSet({
          reminded_by: row.remindedBy,
          reminded_at: row.remindedAt
        })
      )
      .execute();
  }

  /** Các lần nhắc trong [from, to], gồm cả hai đầu, theo ngày giảm dần; có `employeeId` thì chỉ của người đó. */
  async listBetween(from: string, to: string, employeeId?: string): Promise<ReminderRow[]> {
    let query = this.qb
      .selectFrom('explanation_reminders')
      .select([
        'employee_id',
        dateText.as('work_date'),
        'reminded_by',
        'reminded_at'
      ])
      .where('work_date', '>=', from)
      .where('work_date', '<=', to);
    if (employeeId !== undefined) query = query.where('employee_id', '=', employeeId);
    const rows = await query.orderBy('work_date', 'desc').orderBy('employee_id').execute();
    return rows.map(r => ({
      employeeId: r.employee_id,
      date: r.work_date,
      remindedBy: r.reminded_by,
      remindedAt: r.reminded_at.toISOString()
    }));
  }
}

import { Kysely, sql } from 'kysely';
import type { Schema } from './schema.generated';
import {
  SystemRequest,
  RequestType,
  RequestStatus
} from '../domain/request-v2';

export interface RequestListFilter {
  employeeId?: string;
  type?: RequestType;
  status?: RequestStatus;
  limit?: number;
  offset?: number;
}

export class RequestV2Repository {
  constructor(private readonly qb: Kysely<Schema>) {}

  async save(request: SystemRequest): Promise<void> {
    const row = request.toRow();
    await this.qb
      .insertInto('system_requests')
      .values(row as any)
      .onConflict(oc =>
        oc.column('id').doUpdateSet(eb => ({
          title: eb.ref('excluded.title'),
          type: eb.ref('excluded.type'),
          reason: eb.ref('excluded.reason'),
          status: eb.ref('excluded.status'),
          reviewed_by: eb.ref('excluded.reviewed_by'),
          reviewed_at: eb.ref('excluded.reviewed_at'),
          review_note: eb.ref('excluded.review_note'),
          leave_type: eb.ref('excluded.leave_type'),
          leave_start_date: eb.ref('excluded.leave_start_date'),
          leave_end_date: eb.ref('excluded.leave_end_date'),
          leave_days_count: eb.ref('excluded.leave_days_count'),
          correction_date: eb.ref('excluded.correction_date'),
          correction_punch_type: eb.ref('excluded.correction_punch_type'),
          correction_actual_time: eb.ref('excluded.correction_actual_time'),
          ot_date: eb.ref('excluded.ot_date'),
          ot_start_time: eb.ref('excluded.ot_start_time'),
          ot_end_time: eb.ref('excluded.ot_end_time'),
          ot_hours: eb.ref('excluded.ot_hours'),
          advance_amount: eb.ref('excluded.advance_amount'),
          advance_period: eb.ref('excluded.advance_period'),
          new_shift_type: eb.ref('excluded.new_shift_type'),
          new_start_time: eb.ref('excluded.new_start_time'),
          new_end_time: eb.ref('excluded.new_end_time'),
          makeup_start_time: eb.ref('excluded.makeup_start_time'),
          makeup_end_time: eb.ref('excluded.makeup_end_time'),
          updated_at: eb.ref('excluded.updated_at')
        }))
      )
      .execute();
  }

  async findById(id: string): Promise<SystemRequest | null> {
    const row = await this.qb
      .selectFrom('system_requests')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();
    if (!row) return null;
    return SystemRequest.fromRow(row);
  }

  async list(filter: RequestListFilter = {}): Promise<SystemRequest[]> {
    let query = this.qb.selectFrom('system_requests').selectAll();

    if (filter.employeeId) {
      query = query.where('employee_id', '=', filter.employeeId);
    }
    if (filter.type) {
      query = query.where('type', '=', filter.type);
    }
    if (filter.status) {
      query = query.where('status', '=', filter.status);
    }

    query = query.orderBy('created_at', 'desc');

    if (filter.limit !== undefined && filter.limit > 0) {
      query = query.limit(filter.limit);
    }
    if (filter.offset !== undefined && filter.offset > 0) {
      query = query.offset(filter.offset);
    }

    const rows = await query.execute();
    return rows.map(r => SystemRequest.fromRow(r));
  }

  async count(filter: Omit<RequestListFilter, 'limit' | 'offset'> = {}): Promise<number> {
    let query = this.qb
      .selectFrom('system_requests')
      .select(sql<number>`COUNT(*)`.as('total'));

    if (filter.employeeId) {
      query = query.where('employee_id', '=', filter.employeeId);
    }
    if (filter.type) {
      query = query.where('type', '=', filter.type);
    }
    if (filter.status) {
      query = query.where('status', '=', filter.status);
    }

    const res = await query.executeTakeFirst();
    return Number(res?.total ?? 0);
  }
}

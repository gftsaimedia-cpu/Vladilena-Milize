import { Injectable, Inject } from '@nestjs/common';
import { Kysely, sql } from 'kysely';
import { KYSELY_DB, type DB } from '../../database';
import type { ActiveStatus, ClaimStatus, DayClaim, DayStatusRow, RequestStatus } from './domain';

@Injectable()
export class DayStatusRepository {
  constructor(@Inject(KYSELY_DB) private readonly qb: Kysely<DB>) {}

  /** Bản chạy mọi truy vấn trên `trx` (giao dịch đang mở của người gọi) thay vì pool. */
  withTransaction(trx: Kysely<DB>): DayStatusRepository {
    return new DayStatusRepository(trx);
  }

  /** Các ngày của một nhân sự trong [from, to], gồm cả hai đầu, theo ngày tăng dần; chỉ dòng có đơn đang chờ hoặc đã duyệt. */
  async listBetween(employeeId: string, from: string, to: string): Promise<DayClaim[]> {
    const rows = await this.selectClaims()
      .where('d.employee_id', '=', employeeId)
      .where('d.work_date', '>=', from)
      .where('d.work_date', '<=', to)
      .orderBy('d.work_date')
      .execute();
    return rows.map(toClaim);
  }

  /** Các ngày đơn `requestId` đang giữ. */
  async listByRequest(requestId: string): Promise<DayClaim[]> {
    const rows = await this.selectClaims()
      .where('d.request_id', '=', requestId)
      .orderBy('d.employee_id')
      .orderBy('d.work_date')
      .execute();
    return rows.map(toClaim);
  }

  /** Các ngày đang thay đơn đổi ca `requestId` (cột `base_request_id`). */
  async listByBase(requestId: string): Promise<DayClaim[]> {
    const rows = await this.selectClaims()
      .where('d.base_request_id', '=', requestId)
      .orderBy('d.employee_id')
      .orderBy('d.work_date')
      .execute();
    return rows.map(toClaim);
  }

  /** Ghi các dòng; ngày đã có dòng thì thay bằng dòng mới. */
  async upsert(rows: readonly DayStatusRow[]): Promise<void> {
    if (rows.length === 0) return;
    await this.qb
      .insertInto('day_status')
      .values(
        rows.map(r => ({
          employee_id: r.employeeId,
          work_date: r.date,
          status: r.status,
          request_id: r.requestId,
          base_request_id: r.baseRequestId
        }))
      )
      .onConflict(oc =>
        oc.columns(['employee_id', 'work_date']).doUpdateSet(eb => ({
          status: eb.ref('excluded.status'),
          request_id: eb.ref('excluded.request_id'),
          base_request_id: eb.ref('excluded.base_request_id'),
          updated_at: sql<Date>`now()`
        }))
      )
      .execute();
  }

  /** Xoá dòng của nhân sự `employeeId` ở các ngày `dates`, chỉ dòng còn thuộc đơn `requestId`. */
  async remove(employeeId: string, dates: readonly string[], requestId: string): Promise<void> {
    if (dates.length === 0) return;
    await this.qb
      .deleteFrom('day_status')
      .where('employee_id', '=', employeeId)
      .where('work_date', 'in', dates)
      .where('request_id', '=', requestId)
      .execute();
  }

  /**
   * Truy vấn chung: dòng ngày + trạng thái đơn giữ ngày + trạng thái đơn gốc, chỉ đơn đang chờ hoặc đã duyệt.
   * DATE đọc qua to_char để pg không đổi thành Date theo múi giờ máy.
   */
  private selectClaims() {
    return this.qb
      .selectFrom('day_status as d')
      .innerJoin('system_requests as r', 'r.id', 'd.request_id')
      .leftJoin('system_requests as b', 'b.id', 'd.base_request_id')
      .select([
        'd.employee_id as employee_id',
        sql<string>`to_char(${sql.ref('d.work_date')}, 'YYYY-MM-DD')`.as('work_date'),
        'd.status as status',
        'd.request_id as request_id',
        'd.base_request_id as base_request_id',
        'r.status as request_status',
        'b.status as base_request_status'
      ])
      .where('r.status', 'in', ['PENDING', 'APPROVED']);
  }
}

function toClaim(r: {
  employee_id: string;
  work_date: string;
  status: string;
  request_id: string;
  base_request_id: string | null;
  request_status: string;
  base_request_status: string | null;
}): DayClaim {
  return {
    employeeId: r.employee_id,
    date: r.work_date,
    status: r.status as ClaimStatus,
    requestId: r.request_id,
    baseRequestId: r.base_request_id,
    requestStatus: r.request_status as ActiveStatus,
    baseRequestStatus: r.base_request_status as RequestStatus | null
  };
}

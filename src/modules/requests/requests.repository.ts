import { Injectable, Inject } from '@nestjs/common';
import { Kysely, sql } from 'kysely';
import { KYSELY_DB, type DB } from '../../database';
import {
  SystemRequest,
  SystemRequestRow,
  IsatRegistration,
  IsatConditionRow,
  IsatProfileSnapshot,
  RequestType,
  RequestStatus
} from './domain';

export interface RequestListFilter {
  employeeId?: string;
  type?: RequestType;
  status?: RequestStatus;
  limit?: number;
  offset?: number;
}

export interface IsatProfile {
  employeeId: string;
  isatEnabled: boolean;
  snapshot: IsatProfileSnapshot;
}

@Injectable()
export class RequestsRepository {
  constructor(@Inject(KYSELY_DB) private readonly qb: Kysely<DB>) {}

  async save(request: SystemRequest): Promise<void> {
    const row = request.toRow();
    const isat = request.isat;
    if (!isat) {
      await this.upsertRequest(this.qb, row);
      return;
    }
    // Đơn iSAT ghi ba bảng trong một giao dịch; lưu lần hai (duyệt đơn) chỉ cập nhật system_requests,
    // phần đăng ký và điều kiện đã chụp lúc nộp nên bỏ qua khi trùng khoá.
    await this.qb.transaction().execute(async trx => {
      await this.upsertRequest(trx, row);
      await trx
        .insertInto('isat_registrations')
        .values(isat.toRow(request.id))
        .onConflict(oc => oc.column('request_id').doNothing())
        .execute();
      await trx
        .insertInto('isat_registration_conditions')
        .values(isat.toConditionRows(request.id))
        .onConflict(oc => oc.columns(['request_id', 'code']).doNothing())
        .execute();
    });
  }

  private async upsertRequest(db: Kysely<DB>, row: SystemRequestRow): Promise<void> {
    await db
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
    const [request] = await this.attachIsat([row]);
    return request;
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
    return this.attachIsat(rows);
  }

  /** Hồ sơ nộp đơn iSAT: uuid, quyền lợi iSAT và bản chụp hồ sơ, theo danh mục hiệu lực tại `month` (YYYY-MM). */
  async findIsatProfile(employeeIdOrUsername: string, month: string): Promise<IsatProfile | null> {
    const staff = await this.qb
      .selectFrom('staff')
      .select(['uuid', 'name', 'type', 'level', 'shift_type', 'shift_start_time', 'shift_end_time'])
      .where(eb => eb.or([eb('uuid', '=', employeeIdOrUsername), eb('username', '=', employeeIdOrUsername)]))
      .executeTakeFirst();
    if (!staff || !staff.uuid) return null;

    const level = Number(staff.level);
    const levelRow = await this.qb
      .selectFrom('position_levels')
      .select('name')
      .where('type_code', '=', staff.type)
      .where('level_no', '=', level)
      .where('effective_month', '<=', month)
      .orderBy('effective_month', 'desc')
      .limit(1)
      .executeTakeFirst();

    const benefitRow = await this.qb
      .selectFrom('position_types')
      .innerJoin('position_type_benefits', 'position_type_benefits.type_id', 'position_types.id')
      .select('position_type_benefits.enabled')
      .where('position_types.code', '=', staff.type)
      .where('position_types.effective_month', '<=', month)
      .where('position_type_benefits.benefit', '=', 'isat')
      .orderBy('position_types.effective_month', 'desc')
      .limit(1)
      .executeTakeFirst();

    return {
      employeeId: staff.uuid,
      isatEnabled: Number(benefitRow?.enabled) === 1,
      snapshot: {
        fullName: staff.name,
        positionType: staff.type,
        positionLevel: level,
        levelName: levelRow?.name ?? null,
        shiftType: staff.shift_type,
        shiftStartTime: staff.shift_start_time,
        shiftEndTime: staff.shift_end_time
      }
    };
  }

  /** Gắn phần đăng ký iSAT cho các dòng ISAT bằng hai truy vấn gộp; trang không có đơn iSAT thì không truy vấn thêm. */
  private async attachIsat(rows: any[]): Promise<SystemRequest[]> {
    const ids: string[] = rows.filter(r => r.type === 'ISAT').map(r => r.id);
    if (ids.length === 0) {
      return rows.map(r => SystemRequest.fromRow(r));
    }

    const registrations = await this.qb
      .selectFrom('isat_registrations')
      .select([
        'request_id',
        // DATE đọc thẳng sẽ thành Date theo múi giờ máy và lệch ngày; ép về YYYY-MM-DD ngay trong SQL.
        sql<string>`to_char(${sql.ref('isat_registrations.saturday')}, 'YYYY-MM-DD')`.as('saturday'),
        'full_name',
        'team',
        'position_type',
        'position_level',
        'level_name',
        'shift_type',
        'shift_start_time',
        'shift_end_time'
      ])
      .where('request_id', 'in', ids)
      .execute();

    const conditionRows = await this.qb
      .selectFrom('isat_registration_conditions')
      .select(['request_id', 'sort_order', 'code', 'label', 'passed'])
      .where('request_id', 'in', ids)
      .orderBy('sort_order')
      .execute();

    const conditionsByRequest = new Map<string, IsatConditionRow[]>();
    for (const c of conditionRows) {
      const list = conditionsByRequest.get(c.request_id) ?? [];
      list.push(c);
      conditionsByRequest.set(c.request_id, list);
    }
    const registrationByRequest = new Map<string, IsatRegistration>();
    for (const r of registrations) {
      registrationByRequest.set(r.request_id, IsatRegistration.fromRows(r, conditionsByRequest.get(r.request_id) ?? []));
    }

    return rows.map(r => SystemRequest.fromRow(r, registrationByRequest.get(r.id) ?? null));
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

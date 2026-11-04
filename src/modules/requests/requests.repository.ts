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
  RequestStatus,
  MakeupSlot,
  ExplanationCase,
  EXPLANATION_CASES
} from './domain';

/** Cột DATE của system_requests: đọc qua to_char để pg không đổi thành Date theo múi giờ máy. */
type RequestDateColumn =
  'leave_start_date' | 'leave_end_date' | 'explanation_date' | 'ot_date' | 'change_start_date' | 'change_end_date';

const dateText = (column: RequestDateColumn) =>
  sql<string | null>`to_char(${sql.ref(column)}, 'YYYY-MM-DD')`.as(column);

const EXPLANATION_CASE_ORDER = new Map<ExplanationCase, number>(EXPLANATION_CASES.map((c, i) => [c.code, i]));

export interface RequestListFilter {
  employeeId?: string;
  /** Khớp bất kỳ id nào trong danh sách (uuid hoặc username); có phần tử thì thay cho `employeeId`. */
  employeeIds?: string[];
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
    const slotRows = request.toMakeupSlotRows();
    const caseRows = request.toExplanationCaseRows();
    if (!isat && slotRows.length === 0 && caseRows.length === 0) {
      await this.upsertRequest(this.qb, row);
      return;
    }
    // Đơn có bảng con ghi mọi bảng trong một giao dịch; lưu lần hai (duyệt đơn) chỉ cập nhật system_requests,
    // các dòng con đã ghi lúc nộp nên bỏ qua khi trùng khoá.
    await this.qb.transaction().execute(async trx => {
      await this.upsertRequest(trx, row);
      if (isat) {
        await this.insertIsat(trx, request.id, isat);
      }
      if (slotRows.length > 0) {
        await trx
          .insertInto('makeup_slots')
          .values(slotRows)
          .onConflict(oc => oc.columns(['request_id', 'work_date', 'start_time']).doNothing())
          .execute();
      }
      if (caseRows.length > 0) {
        await trx
          .insertInto('explanation_cases')
          .values(caseRows)
          .onConflict(oc => oc.columns(['request_id', 'case_code']).doNothing())
          .execute();
      }
    });
  }

  private async insertIsat(trx: Kysely<DB>, requestId: string, isat: IsatRegistration): Promise<void> {
    await trx
      .insertInto('isat_registrations')
      .values(isat.toRow(requestId))
      .onConflict(oc => oc.column('request_id').doNothing())
      .execute();
    const conditionRows = isat.toConditionRows(requestId);
    if (conditionRows.length === 0) return;
    await trx
      .insertInto('isat_registration_conditions')
      .values(conditionRows)
      .onConflict(oc => oc.columns(['request_id', 'code']).doNothing())
      .execute();
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
          explanation_date: eb.ref('excluded.explanation_date'),
          actual_check_in: eb.ref('excluded.actual_check_in'),
          actual_check_out: eb.ref('excluded.actual_check_out'),
          ot_date: eb.ref('excluded.ot_date'),
          ot_start_time: eb.ref('excluded.ot_start_time'),
          ot_end_time: eb.ref('excluded.ot_end_time'),
          ot_hours: eb.ref('excluded.ot_hours'),
          advance_amount: eb.ref('excluded.advance_amount'),
          advance_period: eb.ref('excluded.advance_period'),
          change_start_date: eb.ref('excluded.change_start_date'),
          change_end_date: eb.ref('excluded.change_end_date'),
          new_shift_type: eb.ref('excluded.new_shift_type'),
          new_start_time: eb.ref('excluded.new_start_time'),
          new_end_time: eb.ref('excluded.new_end_time'),
          updated_at: eb.ref('excluded.updated_at')
        }))
      )
      .execute();
  }

  /** Chọn rõ từng cột của system_requests; cột DATE đọc thành chuỗi YYYY-MM-DD, giữ nguyên tên cột. */
  private selectRequests() {
    return this.qb
      .selectFrom('system_requests')
      .select([
        'id',
        'employee_id',
        'title',
        'type',
        'reason',
        'status',
        'reviewed_by',
        'reviewed_at',
        'review_note',
        'leave_type',
        dateText('leave_start_date'),
        dateText('leave_end_date'),
        'leave_days_count',
        dateText('explanation_date'),
        'actual_check_in',
        'actual_check_out',
        dateText('ot_date'),
        'ot_start_time',
        'ot_end_time',
        'ot_hours',
        'advance_amount',
        'advance_period',
        dateText('change_start_date'),
        dateText('change_end_date'),
        'new_shift_type',
        'new_start_time',
        'new_end_time',
        'created_at',
        'updated_at'
      ]);
  }

  async findById(id: string): Promise<SystemRequest | null> {
    const row = await this.selectRequests().where('id', '=', id).executeTakeFirst();
    if (!row) return null;
    const [request] = await this.attachChildren([row]);
    return request;
  }

  /** Các đơn đang chờ hoặc đã duyệt của một nhân sự, kèm bảng con. */
  async listActive(employeeId: string): Promise<SystemRequest[]> {
    const rows = await this.selectRequests()
      .where('employee_id', '=', employeeId)
      .where('status', 'in', ['PENDING', 'APPROVED'])
      .orderBy('created_at', 'desc')
      .execute();
    return this.attachChildren(rows);
  }

  async list(filter: RequestListFilter = {}): Promise<SystemRequest[]> {
    let query = this.selectRequests();

    if (filter.employeeIds?.length) {
      query = query.where('employee_id', 'in', filter.employeeIds);
    } else if (filter.employeeId) {
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
    return this.attachChildren(rows);
  }

  /** Đổi uuid hoặc username nhân sự thành uuid; không có nhân sự thì trả null. */
  async resolveStaffUuid(employeeIdOrUsername: string): Promise<string | null> {
    const row = await this.qb
      .selectFrom('staff')
      .select('uuid')
      .where(eb => eb.or([eb('uuid', '=', employeeIdOrUsername), eb('username', '=', employeeIdOrUsername)]))
      .executeTakeFirst();
    return row?.uuid ?? null;
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

    // Lấy phiên bản chức vụ mới nhất có hiệu lực rồi mới tra quyền lợi (như PayrollRepository.positionInEffect):
    // phiên bản đó không có dòng isat thì coi là tắt, không lùi về phiên bản cũ hơn.
    const benefitRow = await this.qb
      .selectFrom('position_types')
      .leftJoin('position_type_benefits', join =>
        join.onRef('position_type_benefits.type_id', '=', 'position_types.id').on('position_type_benefits.benefit', '=', 'isat')
      )
      .select('position_type_benefits.enabled')
      .where('position_types.code', '=', staff.type)
      .where('position_types.effective_month', '<=', month)
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

  /**
   * Gắn bảng con cho cả trang: mỗi bảng con đọc bằng một truy vấn `request_id in (…)`, và chỉ chạy
   * khi trang có đơn thuộc loại tương ứng.
   */
  private async attachChildren(rows: any[]): Promise<SystemRequest[]> {
    const idsOf = (type: RequestType): string[] => rows.filter(r => r.type === type).map(r => r.id);
    const registrationByRequest = await this.loadIsat(idsOf('ISAT'));
    const slotsByRequest = await this.loadMakeupSlots(idsOf('LEAVE_WITH_MAKEUP'));
    const casesByRequest = await this.loadExplanationCases(idsOf('EXPLANATION'));

    return rows.map(r =>
      SystemRequest.fromRow(r, registrationByRequest.get(r.id) ?? null, {
        makeupSlots: slotsByRequest.get(r.id),
        explanationCases: casesByRequest.get(r.id)
      })
    );
  }

  private async loadMakeupSlots(ids: string[]): Promise<Map<string, MakeupSlot[]>> {
    const slotsByRequest = new Map<string, MakeupSlot[]>();
    if (ids.length === 0) return slotsByRequest;

    const slotRows = await this.qb
      .selectFrom('makeup_slots')
      .select([
        'request_id',
        sql<string>`to_char(${sql.ref('work_date')}, 'YYYY-MM-DD')`.as('work_date'),
        'start_time',
        'end_time',
        'work_minutes'
      ])
      .where('request_id', 'in', ids)
      .orderBy('work_date')
      .orderBy('start_time')
      .execute();

    for (const s of slotRows) {
      const list = slotsByRequest.get(s.request_id) ?? [];
      list.push({ date: s.work_date, startTime: s.start_time, endTime: s.end_time, workMinutes: Number(s.work_minutes) });
      slotsByRequest.set(s.request_id, list);
    }
    return slotsByRequest;
  }

  private async loadExplanationCases(ids: string[]): Promise<Map<string, ExplanationCase[]>> {
    const casesByRequest = new Map<string, ExplanationCase[]>();
    if (ids.length === 0) return casesByRequest;

    const caseRows = await this.qb
      .selectFrom('explanation_cases')
      .select(['request_id', 'case_code'])
      .where('request_id', 'in', ids)
      .execute();

    for (const c of caseRows) {
      const list = casesByRequest.get(c.request_id) ?? [];
      list.push(c.case_code as ExplanationCase);
      casesByRequest.set(c.request_id, list);
    }
    for (const list of casesByRequest.values()) {
      list.sort((a, b) => (EXPLANATION_CASE_ORDER.get(a) ?? 0) - (EXPLANATION_CASE_ORDER.get(b) ?? 0));
    }
    return casesByRequest;
  }

  /** Phần đăng ký iSAT và điều kiện của các đơn ISAT, bằng hai truy vấn gộp. */
  private async loadIsat(ids: string[]): Promise<Map<string, IsatRegistration>> {
    const registrationByRequest = new Map<string, IsatRegistration>();
    if (ids.length === 0) return registrationByRequest;

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
    for (const r of registrations) {
      registrationByRequest.set(r.request_id, IsatRegistration.fromRows(r, conditionsByRequest.get(r.request_id) ?? []));
    }
    return registrationByRequest;
  }

  async count(filter: Omit<RequestListFilter, 'limit' | 'offset'> = {}): Promise<number> {
    let query = this.qb
      .selectFrom('system_requests')
      .select(sql<number>`COUNT(*)`.as('total'));

    if (filter.employeeIds?.length) {
      query = query.where('employee_id', 'in', filter.employeeIds);
    } else if (filter.employeeId) {
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

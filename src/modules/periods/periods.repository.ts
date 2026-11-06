import { Inject, Injectable } from '@nestjs/common';
import { Kysely, sql, type Selectable, type Updateable } from 'kysely';
import { KYSELY_DB, type DB, type DatabaseTransaction } from '../../database';
import { employedBetween, monthDays } from '../../database/employment';
import type { ApproveBlockers } from './domain';

export type PeriodRow = Selectable<DB['payroll_periods']>;

/** Mọi cột của kỳ lương trừ `month` (khoá) và `rev` (repository tự tăng). */
export type PeriodPatch = Omit<Updateable<DB['payroll_periods']>, 'month' | 'rev'>;

export interface CurrentRun {
  id: number;
  runNo: number;
  status: string;
}

const lockKey = (month: string): string => `period:${month}`;

@Injectable()
export class PeriodsRepository {
  constructor(@Inject(KYSELY_DB) private readonly db: Kysely<DB>) {}

  /** Dòng kỳ lương của tháng; `null` khi chưa có (tức là 'open'). Có `trx` thì đọc trong giao dịch đó. */
  async find(month: string, trx?: DatabaseTransaction): Promise<PeriodRow | null> {
    const row = await (trx ?? this.db)
      .selectFrom('payroll_periods')
      .selectAll()
      .where('month', '=', month)
      .executeTakeFirst();
    return row ?? null;
  }

  /** Mọi kỳ, tháng mới nhất trước. */
  async list(): Promise<PeriodRow[]> {
    return this.db.selectFrom('payroll_periods').selectAll().orderBy('month', 'desc').execute();
  }

  /** Khoá chia sẻ theo tháng, giữ tới hết giao dịch: nhiều người cùng giữ được, chỉ chặn khoá độc quyền. */
  async lockShared(trx: DatabaseTransaction, month: string): Promise<void> {
    await sql`SELECT pg_advisory_xact_lock_shared(hashtextextended(${lockKey(month)}, 0))`.execute(trx);
  }

  /** Khoá độc quyền theo tháng, giữ tới hết giao dịch: chờ mọi khoá chia sẻ nhả, và chặn người lấy khoá sau. */
  async lockExclusive(trx: DatabaseTransaction, month: string): Promise<void> {
    await sql`SELECT pg_advisory_xact_lock(hashtextextended(${lockKey(month)}, 0))`.execute(trx);
  }

  /**
   * Ghi kỳ lương của tháng. Chưa có dòng: chèn với rev = 1 (khi đó `patch.status` bắt buộc).
   * Có dòng: cập nhật `patch` và tăng rev. Người gọi nên đang giữ `lockExclusive` của tháng.
   */
  async save(trx: DatabaseTransaction, month: string, patch: PeriodPatch): Promise<PeriodRow> {
    const existing = await this.find(month, trx);
    if (!existing) {
      if (patch.status === undefined) {
        throw new Error(`Kỳ lương ${month} chưa có dòng, cần status để tạo`);
      }
      return trx
        .insertInto('payroll_periods')
        .values({ ...patch, status: patch.status, month, rev: 1 })
        .returningAll()
        .executeTakeFirstOrThrow();
    }
    return trx
      .updateTable('payroll_periods')
      .set({ ...patch, rev: sql<number>`rev + 1` })
      .where('month', '=', month)
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  /** Lần chạy lương mới nhất của tháng mà chưa bị lần sau thay (cùng quy tắc với nơi đọc phiếu); `null` khi chưa có. */
  async currentRun(trx: DatabaseTransaction | undefined, month: string): Promise<CurrentRun | null> {
    const run = await (trx ?? this.db)
      .selectFrom('payroll_runs')
      .select(['id', 'run_no', 'status'])
      .where('month', '=', month)
      .where('status', '<>', 'superseded')
      .orderBy('run_no', 'desc')
      .executeTakeFirst();
    return run ? { id: Number(run.id), runNo: Number(run.run_no), status: run.status } : null;
  }

  /**
   * Ba thứ còn vướng ở bước Phê duyệt kỳ: đơn chờ duyệt đụng tháng, phiếu của lần chạy hiện tại chưa duyệt, và người
   * cần phiếu (`locked_at IS NULL`, cùng tập với tính cả kỳ) mà chưa có phiếu. Phiếu nhận diện người bằng `username`.
   */
  async blockers(trx: DatabaseTransaction | undefined, month: string): Promise<ApproveBlockers> {
    const q = trx ?? this.db;
    const run = await this.currentRun(trx, month);
    const { from, to } = monthDays(month);

    // Đơn chờ duyệt chạm tới tháng, đếm ngay trong SQL (không đọc mọi đơn chờ). Cùng luật với `requestMonths`: khoảng
    // ngày (nghỉ, đổi ca) tính mọi tháng nó đi qua, kể cả khi hai đầu ghi ngược; các ngày lẻ (OT, giải trình, kỳ tạm
    // ứng, ngày làm bù, Thứ Bảy iSAT) tính tháng của chính nó.
    const range = (a: 'leave_start_date' | 'change_start_date', b: 'leave_end_date' | 'change_end_date') =>
      sql`(LEAST(${sql.ref(a)}, ${sql.ref(b)}) <= ${to} AND GREATEST(${sql.ref(a)}, ${sql.ref(b)}) >= ${from})`;
    const day = (col: 'ot_date' | 'explanation_date' | 'half_shift_date') => sql`(${sql.ref(col)} BETWEEN ${from} AND ${to})`;
    const touches = sql<boolean>`(
      ${range('leave_start_date', 'leave_end_date')}
      OR ${range('change_start_date', 'change_end_date')}
      OR ${day('ot_date')}
      OR ${day('explanation_date')}
      OR ${day('half_shift_date')}
      OR left(advance_period, 7) = ${month}
      OR EXISTS (SELECT 1 FROM makeup_slots m WHERE m.request_id = system_requests.id AND m.work_date BETWEEN ${from} AND ${to})
      OR EXISTS (SELECT 1 FROM isat_registrations i WHERE i.request_id = system_requests.id AND i.saturday BETWEEN ${from} AND ${to})
    )`;
    const pendingRow = await q
      .selectFrom('system_requests')
      .select(eb => eb.fn.countAll().as('n'))
      .where('status', '=', 'PENDING')
      .where(touches)
      .executeTakeFirst();
    const pendingRequests = Number(pendingRow?.n ?? 0);

    let unapprovedSlips = 0;
    const have = new Set<string>();
    if (run) {
      const slips = await q.selectFrom('payslips').select(['username', 'status']).where('run_id', '=', run.id).execute();
      for (const slip of slips) {
        have.add(slip.username);
        if (slip.status !== 'approved') unapprovedSlips += 1;
      }
    }
    const staff = await q
      .selectFrom('staff')
      .select(['username', 'name'])
      .where('locked_at', 'is', null)
      .where(eb =>
        eb.or([
          eb('payroll_subject', '=', 1),
          eb.and([eb('payroll_subject', 'is', null), eb('role', '<>', 'admin')])
        ])
      )
      // R2: chỉ người có làm ít nhất một ngày trong tháng (cùng tập với tính cả kỳ, `listEligibleEmployees(month)`).
      .where(employedBetween(from, to))
      .orderBy('username')
      .execute();
    const missingSlips = staff.filter(s => !have.has(s.username)).map(s => ({ username: s.username, name: s.name }));

    return { pendingRequests, unapprovedSlips, missingSlips };
  }

  /** `draft → final`. Lần chạy không ở `draft` thì báo lỗi (người gọi giữ khoá nên không xảy ra). */
  async finalizeRun(trx: DatabaseTransaction, runId: number): Promise<void> {
    const result = await trx
      .updateTable('payroll_runs')
      .set({ status: 'final' })
      .where('id', '=', runId)
      .where('status', '=', 'draft')
      .executeTakeFirst();
    if (Number(result.numUpdatedRows) !== 1) throw new Error(`Lần chạy ${runId} không ở trạng thái nháp, không chốt được`);
  }

  /**
   * Huỷ phê duyệt: lần chạy `final` của tháng sang `superseded`, rồi chèn lần chạy `draft` mới (`run_no` lớn nhất + 1)
   * giữ nguyên mọi cột của lần cũ trừ người tạo và giờ tạo, và chép mọi phiếu (giữ `status`, `decided_*`, `note`, `rev`,
   * số sửa, cờ) sang lần mới. Mọi câu lệnh chạy trên `trx`. Trả id lần chạy mới.
   */
  async reopenRun(trx: DatabaseTransaction, month: string, actor: string, now: string): Promise<number> {
    const old = await trx
      .selectFrom('payroll_runs')
      .selectAll()
      .where('month', '=', month)
      .where('status', '=', 'final')
      .executeTakeFirstOrThrow();
    const latest = await trx
      .selectFrom('payroll_runs')
      .select(eb => eb.fn.max('run_no').as('max_run_no'))
      .where('month', '=', month)
      .executeTakeFirst();

    await trx.updateTable('payroll_runs').set({ status: 'superseded' }).where('id', '=', old.id).execute();
    const created = await trx
      .insertInto('payroll_runs')
      .values({
        month,
        run_no: Number(latest?.max_run_no ?? old.run_no) + 1,
        status: 'draft',
        engine_version: old.engine_version,
        params_hash: old.params_hash,
        params_rev: old.params_rev,
        params_json: old.params_json,
        switches_json: old.switches_json,
        inputs_digest: old.inputs_digest,
        slips_total: old.slips_total,
        slips_error: old.slips_error,
        created_by: actor,
        created_at: now,
        finished_at: now,
      })
      .returning('id')
      .executeTakeFirstOrThrow();
    const newId = Number(created.id);

    await sql`
      INSERT INTO payslips (run_id, username, status, rev, error_code, error_detail, gross, insurance, tax, advance, net,
                            staff_terms_json, snapshot_gz, override_json, flags_json, decided_by, decided_at, note)
      SELECT ${newId}, username, status, rev, error_code, error_detail, gross, insurance, tax, advance, net,
             staff_terms_json, snapshot_gz, override_json, flags_json, decided_by, decided_at, note
      FROM payslips WHERE run_id = ${Number(old.id)} ORDER BY id`.execute(trx);
    return newId;
  }
}

// Đọc và ghi bảng departments. Không đụng hồ sơ nhân viên ngoài việc đếm người và gỡ phòng của người đã nghỉ việc.
import { Inject, Injectable } from '@nestjs/common';
import { Kysely } from 'kysely';
import { KYSELY_DB, type DB } from '../../database';

export interface DepartmentRow {
  id: number;
  name: string;
  sort: number;
}

export interface DepartmentWithCount extends DepartmentRow {
  staffCount: number;
}

@Injectable()
export class DepartmentsRepository {
  constructor(@Inject(KYSELY_DB) private readonly qb: Kysely<DB>) {}

  /** Bản chạy mọi truy vấn trên `trx` (giao dịch đang mở của người gọi) thay vì pool. */
  withTransaction(trx: Kysely<DB>): DepartmentsRepository {
    return new DepartmentsRepository(trx);
  }

  /** staffCount chỉ đếm người chưa nghỉ việc. */
  async listWithCounts(): Promise<DepartmentWithCount[]> {
    const rows = await this.qb
      .selectFrom('departments as d')
      .leftJoin('staff as s', join =>
        join
          .onRef('s.department_id', '=', 'd.id')
          .on(eb => eb.or([eb('s.contract_status', 'is', null), eb('s.contract_status', '<>', 'nghiviec')]))
      )
      .select(eb => ['d.id', 'd.name', 'd.sort', eb.fn.count<number>('s.username').as('staffCount')])
      .groupBy(['d.id', 'd.name', 'd.sort'])
      .orderBy('d.sort')
      .orderBy('d.id')
      .execute();
    return rows.map(r => ({ id: r.id, name: r.name, sort: r.sort, staffCount: Number(r.staffCount) }));
  }

  /** `forUpdate` khoá dòng cho tới hết giao dịch (sửa, xoá). */
  async find(id: number, opts: { forUpdate?: boolean } = {}): Promise<DepartmentRow | null> {
    let q = this.qb.selectFrom('departments').select(['id', 'name', 'sort']).where('id', '=', id);
    if (opts.forUpdate) q = q.forUpdate();
    return (await q.executeTakeFirst()) ?? null;
  }

  async nextSort(): Promise<number> {
    const row = await this.qb
      .selectFrom('departments')
      .select(eb => eb.fn.max<number>('sort').as('top'))
      .executeTakeFirstOrThrow();
    return Number(row.top ?? 0) + 1;
  }

  async insert(name: string, sort: number, actor: string, at: string): Promise<DepartmentRow> {
    return await this.qb
      .insertInto('departments')
      .values({ name, sort, updated_by: actor, updated_at: at })
      .returning(['id', 'name', 'sort'])
      .executeTakeFirstOrThrow();
  }

  async update(id: number, set: { name?: string; sort?: number }, actor: string, at: string): Promise<void> {
    await this.qb.updateTable('departments').set({ ...set, updated_by: actor, updated_at: at }).where('id', '=', id).execute();
  }

  /** Số người chưa nghỉ việc đang ở phòng này. */
  async countActiveStaff(id: number): Promise<number> {
    const row = await this.qb
      .selectFrom('staff')
      .select(eb => eb.fn.countAll<number>().as('n'))
      .where('department_id', '=', id)
      .where(eb => eb.or([eb('contract_status', 'is', null), eb('contract_status', '<>', 'nghiviec')]))
      .executeTakeFirstOrThrow();
    return Number(row.n);
  }

  /** Người đã nghỉ việc không còn thuộc phòng nào, để xoá được phòng. */
  async clearResigned(id: number): Promise<void> {
    await this.qb.updateTable('staff').set({ department_id: null }).where('department_id', '=', id).execute();
  }

  async delete(id: number): Promise<void> {
    await this.qb.deleteFrom('departments').where('id', '=', id).execute();
  }
}

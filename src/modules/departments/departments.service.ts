// Thêm, sửa, xoá phòng ban (màn Cài đặt). Mỗi thao tác ghi dòng nhật ký trong cùng giao dịch: ghi lỗi thì thao tác bị huỷ.
import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { TransactionCoordinator } from '../../database/transaction';
import { AuditLog } from '../audit/audit-log';
import {
  DepartmentInputError,
  DepartmentNameTakenError,
  DepartmentNotEmptyError,
  DepartmentNotFoundError
} from './departments.errors';
import { DepartmentsRepository, type DepartmentWithCount } from './departments.repository';

const NAME_MAX = 100;
type Tx = Pick<TransactionCoordinator, 'run'>;

function parseName(value: unknown): string {
  if (typeof value !== 'string' || value.trim() === '') throw new DepartmentInputError('Tên phòng ban không được để trống');
  const name = value.trim();
  if (name.length > NAME_MAX) throw new DepartmentInputError(`Tên phòng ban dài quá ${NAME_MAX} ký tự`);
  return name;
}

function parseSort(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    throw new DepartmentInputError('Thứ tự phòng ban phải là số nguyên không âm');
  }
  return value;
}

/** Lỗi trùng khoá duy nhất của PostgreSQL → tên đã có. */
const isNameTaken = (err: unknown): boolean => (err as { code?: string } | null)?.code === '23505';

@Injectable()
export class DepartmentsService {
  constructor(
    @Inject(DepartmentsRepository) private readonly repo: DepartmentsRepository,
    @Inject(TransactionCoordinator) private readonly tx: Tx,
    @Inject(AuditLog) private readonly audit: Pick<AuditLog, 'append'>
  ) {}

  async list(): Promise<DepartmentWithCount[]> {
    return await this.repo.listWithCounts();
  }

  async create(body: any, actor: string, now: Date = new Date()): Promise<DepartmentWithCount> {
    const name = parseName(body?.name);
    const requestedSort = body?.sort === undefined ? undefined : parseSort(body.sort);
    const saved = await this.guardName(() =>
      this.tx.run(async trx => {
        const repo = this.repo.withTransaction(trx);
        const sort = requestedSort ?? (await repo.nextSort());
        const row = await repo.insert(name, sort, actor, now.toISOString());
        await this.audit.append(trx, {
          actor,
          action: 'department.create',
          entityKind: 'department',
          entityId: row.id,
          before: null,
          after: { name: row.name, sort: row.sort },
          requestId: randomUUID()
        });
        return row;
      })
    );
    return { ...saved, staffCount: 0 };
  }

  async update(id: number, body: any, actor: string, now: Date = new Date()): Promise<DepartmentWithCount> {
    const name = body?.name === undefined ? undefined : parseName(body.name);
    const sort = body?.sort === undefined ? undefined : parseSort(body.sort);
    if (name === undefined && sort === undefined) throw new DepartmentInputError('Không có gì để sửa (name hoặc sort)');

    await this.guardName(() =>
      this.tx.run(async trx => {
        const repo = this.repo.withTransaction(trx);
        const current = await repo.find(id, { forUpdate: true });
        if (!current) throw new DepartmentNotFoundError();
        const before: Record<string, unknown> = {};
        const after: Record<string, unknown> = {};
        if (name !== undefined && name !== current.name) {
          before.name = current.name;
          after.name = name;
        }
        if (sort !== undefined && sort !== current.sort) {
          before.sort = current.sort;
          after.sort = sort;
        }
        if (Object.keys(after).length === 0) return;
        await repo.update(id, { name: after.name as string | undefined, sort: after.sort as number | undefined }, actor, now.toISOString());
        await this.audit.append(trx, {
          actor,
          action: 'department.update',
          entityKind: 'department',
          entityId: id,
          before,
          after,
          requestId: randomUUID()
        });
      })
    );
    const updated = (await this.repo.listWithCounts()).find(d => d.id === id);
    if (!updated) throw new DepartmentNotFoundError();
    return updated;
  }

  /** Còn người chưa nghỉ việc → DepartmentNotEmptyError. Người đã nghỉ việc được gỡ khỏi phòng để xoá được. */
  async remove(id: number, actor: string): Promise<void> {
    await this.tx.run(async trx => {
      const repo = this.repo.withTransaction(trx);
      const current = await repo.find(id, { forUpdate: true });
      if (!current) throw new DepartmentNotFoundError();
      if ((await repo.countActiveStaff(id)) > 0) throw new DepartmentNotEmptyError();
      await repo.clearResigned(id);
      await repo.delete(id);
      await this.audit.append(trx, {
        actor,
        action: 'department.delete',
        entityKind: 'department',
        entityId: id,
        before: { name: current.name, sort: current.sort },
        after: null,
        requestId: randomUUID()
      });
    });
  }

  private async guardName<T>(run: () => Promise<T>): Promise<T> {
    try {
      return await run();
    } catch (err) {
      if (isNameTaken(err)) throw new DepartmentNameTakenError();
      throw err;
    }
  }
}

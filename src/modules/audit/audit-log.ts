// API ghi nhật ký cho các module khác: nối một dòng vào chuỗi băm trong transaction của người gọi.
import { Inject, Injectable } from '@nestjs/common';
import { TransactionCoordinator, type DatabaseTransaction } from '../../database/transaction';
import { AuditRepository } from './audit.repository';
import { hashOf, type AuditChainRow } from './domain/audit-chain';
import { toAuditFields, type AuditEntry } from './domain/audit-entry';

export const AUDIT_LOCK_KEY = 'audit_log';

@Injectable()
export class AuditLog {
  now: () => Date = () => new Date();

  constructor(
    @Inject(AuditRepository) private readonly repo: AuditRepository,
    @Inject(TransactionCoordinator) private readonly tx: Pick<TransactionCoordinator, 'acquireAdvisoryLock'>
  ) {}

  /**
   * Thứ tự: kiểm tra dữ liệu, khoá advisory (giữ tới hết transaction của người gọi),
   * đọc dòng cuối, dựng dòng mới, băm, ghi. Lỗi hoặc rollback của người gọi cuốn theo dòng nhật ký.
   */
  async append(trx: DatabaseTransaction, entry: AuditEntry): Promise<{ id: number; hash: string }> {
    const fields = toAuditFields(entry);
    await this.tx.acquireAdvisoryLock(trx, AUDIT_LOCK_KEY);
    const last = await this.repo.last(trx);
    const chainRow: AuditChainRow = {
      id: (last?.id ?? 0) + 1,
      prev_hash: last?.hash ?? '',
      at: this.now().toISOString(),
      ...fields
    };
    const hash = hashOf(chainRow);
    await this.repo.insert(trx, { ...chainRow, hash });
    return { id: chainRow.id, hash };
  }
}

// Dùng chung cho test real-PG của các module có ghi nhật ký: AuditLog thật, đọc lại dòng đã ghi và kiểm chuỗi.
import type { Kysely } from 'kysely';
import type { DB } from '../../../src/database/schema';
import { TransactionCoordinator, type DatabaseTransaction } from '../../../src/database/transaction';
import { AuditLog } from '../../../src/modules/audit/audit-log';
import { AuditRepository } from '../../../src/modules/audit/audit.repository';
import { AuditService } from '../../../src/modules/audit/audit.service';
import type { AuditEntry } from '../../../src/modules/audit/domain/audit-entry';

export interface WrittenAuditRow {
  actor: string;
  action: string;
  entityKind: string;
  entityId: string;
  subject: string | null;
  month: string | null;
  before: unknown;
  after: unknown;
  reason: string | null;
  sensitivity: string;
  requestId: string | null;
}

export function auditKit(db: Kysely<DB>) {
  const tx = new TransactionCoordinator(db);
  const log = new AuditLog(new AuditRepository(), tx);
  return {
    tx,
    log,
    /** Ghi dòng nhật ký thật rồi ném lỗi: dữ liệu chính phải bị huỷ cùng dòng nhật ký nếu cả hai chung transaction. */
    failingLog: {
      async append(trx: DatabaseTransaction, entry: AuditEntry): Promise<never> {
        await log.append(trx, entry);
        throw new Error('audit boom');
      }
    } as unknown as AuditLog,
    rows: () => auditRows(db),
    verify: () => new AuditService(db, new AuditRepository()).verify()
  };
}

export async function auditRows(db: Kysely<DB>): Promise<WrittenAuditRow[]> {
  const rows = await db.selectFrom('audit_log').selectAll().orderBy('id').execute();
  return rows.map(r => ({
    actor: r.actor,
    action: r.action,
    entityKind: r.entity_kind,
    entityId: r.entity_id,
    subject: r.subject,
    month: r.month,
    before: r.before_json === null ? null : JSON.parse(r.before_json),
    after: r.after_json === null ? null : JSON.parse(r.after_json),
    reason: r.reason,
    sensitivity: r.sensitivity,
    requestId: r.request_id
  }));
}

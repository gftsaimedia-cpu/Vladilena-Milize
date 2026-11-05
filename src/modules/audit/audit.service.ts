// Đọc nhật ký kiểm toán: danh sách có lọc (tổng thật, giá trị cho dropdown) và kiểm chuỗi băm từng trang.
import { Inject, Injectable } from '@nestjs/common';
import type { Kysely } from 'kysely';
import { KYSELY_DB, type DB } from '../../database';
import { AuditRepository, type AuditListRow } from './audit.repository';
import { CHAIN_START, checkPage, finish, type VerifyResult } from './domain/audit-chain';
import { parseAuditQuery } from './domain/audit-query';

export interface AuditItemDTO {
  id: number;
  at: string;
  actor: string;
  actorName: string | null;
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

export interface AuditListDTO {
  items: AuditItemDTO[];
  total: number;
  limit: number;
  offset: number;
  people: Array<{ username: string; name: string | null }>;
  actions: string[];
}

const VERIFY_PAGE = 1000;

// JSON đã lưu thành giá trị; không parse được thì trả nguyên văn.
function parseStored(text: string | null): unknown {
  if (text === null) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function toItem(row: AuditListRow): AuditItemDTO {
  return {
    id: row.id,
    at: row.at,
    actor: row.actor,
    actorName: row.actor_name,
    action: row.action,
    entityKind: row.entity_kind,
    entityId: row.entity_id,
    subject: row.subject,
    month: row.month,
    before: parseStored(row.before_json),
    after: parseStored(row.after_json),
    reason: row.reason,
    sensitivity: row.sensitivity,
    requestId: row.request_id
  };
}

@Injectable()
export class AuditService {
  constructor(
    @Inject(KYSELY_DB) private readonly db: Kysely<DB>,
    @Inject(AuditRepository) private readonly repo: AuditRepository
  ) {}

  async list(raw: Record<string, unknown>): Promise<AuditListDTO> {
    const q = parseAuditQuery(raw);
    const [rows, total, people, actions] = await Promise.all([
      this.repo.list(this.db, q),
      this.repo.count(this.db, q),
      this.repo.people(this.db),
      this.repo.actions(this.db)
    ]);
    return { items: rows.map(toItem), total, limit: q.limit, offset: q.offset, people, actions };
  }

  async verify(pageSize = VERIFY_PAGE): Promise<VerifyResult> {
    let cursor = CHAIN_START;
    for (;;) {
      const rows = await this.repo.pageAfter(this.db, cursor.lastId ?? 0, pageSize);
      if (rows.length === 0) return finish(cursor);
      const step = checkPage(cursor, rows);
      if (!step.ok) return step.result;
      cursor = step.cursor;
    }
  }
}

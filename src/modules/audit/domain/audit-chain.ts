import { createHash } from 'node:crypto';

// Dòng nhật ký chưa có hash.
export interface AuditChainRow {
  id: number;
  prev_hash: string;
  at: string;
  actor: string;
  actor_uuid: string | null;
  actor_roles: string | null;
  action: string;
  entity_kind: string;
  entity_id: string;
  subject: string | null;
  subject_uuid: string | null;
  month: string | null;
  before_json: string | null;
  after_json: string | null;
  reason: string | null;
  sensitivity: string;
  request_id: string | null;
}

export interface StoredAuditRow extends AuditChainRow {
  hash: string;
}

export type VerifyReason = 'PREV_HASH' | 'ID_GAP' | 'HASH';

export interface VerifyResult {
  ok: boolean;
  checked: number;
  firstBadId: number | null;
  reason: VerifyReason | null;
}

// Trạng thái kiểm giữa các trang.
export interface ChainCursor {
  lastId: number | null;
  lastHash: string;
  checked: number;
}

export const CHAIN_START: ChainCursor = { lastId: null, lastHash: '', checked: 0 };

export type ChainStep = { ok: true; cursor: ChainCursor } | { ok: false; result: VerifyResult };

// Chuỗi chuẩn hoá: mọi cột trừ hash, đúng thứ tự spec; JSON giữ nguyên văn bản đã lưu.
export function canonicalOf(row: AuditChainRow): string {
  return JSON.stringify([
    row.id,
    row.prev_hash,
    row.at,
    row.actor,
    row.actor_uuid,
    row.actor_roles,
    row.action,
    row.entity_kind,
    row.entity_id,
    row.subject,
    row.subject_uuid,
    row.month,
    row.before_json,
    row.after_json,
    row.reason,
    row.sensitivity,
    row.request_id
  ]);
}

export function hashOf(row: AuditChainRow): string {
  return `sha256:${createHash('sha256').update(canonicalOf(row)).digest('hex')}`;
}

// Kiểm một trang theo thứ tự PREV_HASH, ID_GAP, HASH; dừng ở dòng sai đầu tiên.
export function checkPage(cursor: ChainCursor, rows: StoredAuditRow[]): ChainStep {
  let { lastId, lastHash, checked } = cursor;
  for (const row of rows) {
    const reason = badReason(row, lastId, lastHash);
    if (reason) return { ok: false, result: { ok: false, checked, firstBadId: row.id, reason } };
    checked += 1;
    lastId = row.id;
    lastHash = row.hash;
  }
  return { ok: true, cursor: { lastId, lastHash, checked } };
}

export function finish(cursor: ChainCursor): VerifyResult {
  return { ok: true, checked: cursor.checked, firstBadId: null, reason: null };
}

function badReason(row: StoredAuditRow, lastId: number | null, lastHash: string): VerifyReason | null {
  if (row.prev_hash !== lastHash) return 'PREV_HASH';
  if (lastId !== null && row.id !== lastId + 1) return 'ID_GAP';
  if (row.hash !== hashOf(row)) return 'HASH';
  return null;
}

import type { AuditChainRow } from './audit-chain';

export type AuditSensitivity = 'normal' | 'pay' | 'pii';

export interface AuditEntry {
  actor: string;
  action: string;
  entityKind: string;
  entityId: string | number;
  actorUuid?: string | null;
  actorRoles?: string[] | null;
  subject?: string | null;
  subjectUuid?: string | null;
  month?: string | null;
  before?: unknown;
  after?: unknown;
  reason?: string | null;
  sensitivity?: AuditSensitivity;
  requestId?: string | null;
}

// Các cột do người gọi điền; id, prev_hash, at do máy chủ gán lúc nối chuỗi.
export type AuditFields = Omit<AuditChainRow, 'id' | 'prev_hash' | 'at'>;

export class AuditEntryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AuditEntryError';
  }
}

const TEXT_MAX = 200;
const REASON_MAX = 1000;
const JSON_MAX = 65536;
const SENSITIVITIES: readonly string[] = ['normal', 'pay', 'pii'];
const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;
// Lưới an toàn: băm mật khẩu, token phiên, toạ độ không được vào nhật ký.
const SECRET = /scrypt\$|pass(word)?_?hash|session_?(token|secret)/i;
const COORDINATES = /"(lat|lng)"\s*:/i;
// Ngoại lệ duy nhất (người dùng chốt 2026-11-05): đổi vùng chấm công ghi tâm cũ/mới. Toạ độ chấm công của nhân viên vẫn bị chặn.
const mayCarryCoordinates = (f: Pick<AuditFields, 'action' | 'entity_kind' | 'entity_id'>) =>
  f.action === 'setting.set' && f.entity_kind === 'setting' && f.entity_id === 'attendance-zone';

export function toAuditFields(entry: AuditEntry): AuditFields {
  const fail = (why: string): never => {
    throw new AuditEntryError(`Nhật ký ${String(entry?.action)}: ${why}`);
  };
  // PG đổi ký tự thay thế lẻ thành U+FFFD và từ chối NUL; băm đúng chuỗi PG sẽ lưu.
  const clean = (label: string, text: string): string => {
    const wellFormed = text.toWellFormed();
    if (wellFormed.includes('\u0000')) return fail(`${label} chứa ký tự NUL`);
    return wellFormed;
  };
  const required = (label: string, value: unknown): string => {
    const raw = typeof value === 'number' ? String(value) : value;
    if (typeof raw !== 'string' || raw === '') return fail(`${label} không được để trống`);
    const text = clean(label, raw);
    if (text.length > TEXT_MAX) return fail(`${label} dài quá ${TEXT_MAX} ký tự`);
    return text;
  };
  const optional = (label: string, value: unknown): string | null => {
    if (value === undefined || value === null || value === '') return null;
    return required(label, value);
  };

  const actor = required('actor', entry?.actor);
  const action = required('action', entry?.action);
  const entityKind = required('entityKind', entry.entityKind);
  const entityId = required('entityId', entry.entityId);

  const month = optional('month', entry.month);
  if (month !== null && !MONTH.test(month)) fail('month phải dạng YYYY-MM');

  const sensitivity = entry.sensitivity ?? 'normal';
  if (!SENSITIVITIES.includes(sensitivity)) fail('sensitivity phải là normal, pay hoặc pii');

  let reason: string | null = null;
  if (entry.reason !== undefined && entry.reason !== null && entry.reason !== '') {
    if (typeof entry.reason !== 'string') return fail(`reason phải là chữ không quá ${REASON_MAX} ký tự`);
    reason = clean('reason', entry.reason);
    if (reason.length > REASON_MAX) fail(`reason phải là chữ không quá ${REASON_MAX} ký tự`);
  }

  const fields: AuditFields = {
    actor,
    actor_uuid: optional('actorUuid', entry.actorUuid),
    actor_roles: rolesText(entry.actorRoles, fail),
    action,
    entity_kind: entityKind,
    entity_id: entityId,
    subject: optional('subject', entry.subject),
    subject_uuid: optional('subjectUuid', entry.subjectUuid),
    month,
    before_json: jsonText('before', entry.before, fail),
    after_json: jsonText('after', entry.after, fail),
    reason,
    sensitivity,
    request_id: optional('requestId', entry.requestId)
  };

  // Quét chuỗi gốc đã lưu, không quét mảng đã stringify (dấu ngoặc kép sẽ bị thoát).
  const scanned = [fields.before_json, fields.after_json, fields.reason, fields.entity_id].join('\n');
  if (SECRET.test(scanned) || (COORDINATES.test(scanned) && !mayCarryCoordinates(fields))) {
    fail('nội dung chứa dữ liệu bí mật hoặc toạ độ, không được ghi');
  }
  return fields;
}

function rolesText(roles: unknown, fail: (why: string) => never): string | null {
  if (roles === undefined || roles === null) return null;
  if (!Array.isArray(roles) || roles.some((r) => typeof r !== 'string')) fail('actorRoles phải là mảng chữ');
  return JSON.stringify([...(roles as string[])].sort());
}

function jsonText(label: string, value: unknown, fail: (why: string) => never): string | null {
  if (value === undefined || value === null) return null;
  const text = JSON.stringify(value);
  if (text === undefined) return null;
  if (text.length > JSON_MAX) fail(`${label} dài quá ${JSON_MAX} ký tự`);
  return text;
}

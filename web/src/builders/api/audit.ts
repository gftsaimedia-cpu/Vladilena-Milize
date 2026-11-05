// Nhật ký từ GET /api/v2/system/audit và /audit/verify sang dạng buildAuditPage đọc.
// FE khai báo lại hình dạng phản hồi của BE, không import từ src/.
import { ACTION_LABELS, personLabel } from '@/builders/admin-config/audit-labels';

export type AuditItemDTO = {
  id: number;
  at: string;
  actor: string;
  actorName: string | null;
  action: string;
  entityKind: string | null;
  entityId: string | null;
  subject: string | null;
  month: string | null;
  before: unknown;
  after: unknown;
  reason: string | null;
  sensitivity: string;
  requestId: string | null;
};

export type AuditListDTO = {
  items: AuditItemDTO[];
  total: number;
  limit: number;
  offset: number;
  people: { username: string; name: string | null }[];
  actions: string[];
};

export type AuditVerifyDTO = { ok: boolean; checked: number; firstBadId: number | null; reason: string | null };

export type AuditOption = { value: string; label: string };

export function auditFromResponse(res: AuditListDTO): {
  rows: AuditItemDTO[];
  total: number;
  people: AuditOption[];
  actions: AuditOption[];
} {
  return {
    rows: res.items,
    total: res.total,
    people: res.people.map(p => ({ value: p.username, label: personLabel(p.username, p.name) })),
    actions: res.actions
      .map(code => ({ value: code, label: ACTION_LABELS[code] ?? code }))
      .sort((a, b) => a.label.localeCompare(b.label, 'vi'))
  };
}

// null khi chuỗi băm đúng; ngược lại là câu báo cho người dùng.
export function verifyMessage(res: AuditVerifyDTO): string | null {
  if (res.ok) return null;
  const id = res.firstBadId;
  if (res.reason === 'HASH') return `Dòng ${id} đã bị sửa nội dung`;
  if (res.reason === 'PREV_HASH') return `Dòng ${id} không nối với dòng trước: có dòng bị chèn hoặc bị xoá`;
  if (res.reason === 'ID_GAP') return `Thiếu dòng ngay trước dòng ${id}`;
  return `Dòng ${id} không khớp`;
}

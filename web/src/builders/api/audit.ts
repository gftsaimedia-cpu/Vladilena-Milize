// Nhật ký từ GET /api/v2/system/audit?limit=&offset= (dòng thô của bảng audit_log) sang dạng buildAuditPage đọc.
// BE phân trang bằng offset và không trả tổng số dòng: tổng là số đã biết, cộng 1 khi trang vừa đọc còn đầy.
export type AuditRowDTO = {
  id: number;
  at: string;
  actor: string;
  action: string;
  entity_id: string | null;
  before_json: string | null;
  after_json: string | null;
  reason: string | null;
};

const parse = (text: string | null) => {
  if (text === null || text === undefined) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
};

export function auditResponseFromRows(items: AuditRowDTO[], { page, size }: { page: number; size: number }) {
  const rows = items.map(r => ({
    id: r.id,
    at: r.at,
    actor: r.actor,
    action: r.action,
    entityId: r.entity_id,
    before: parse(r.before_json),
    after: parse(r.after_json),
    reason: r.reason
  }));
  const hasMore = items.length === size;
  return { rows, hasMore, total: (page - 1) * size + items.length + (hasMore ? 1 : 0) };
}

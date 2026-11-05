// Dựng một trang nhật ký từ phản hồi GET /audit: gom theo ngày giờ Việt Nam, mỗi dòng liệt kê trường đổi từ cũ sang mới.
import { actionLabel, personLabel } from '@/builders/admin-config/audit-labels';
import type { AuditItemDTO, auditFromResponse } from '@/builders/api/audit';

const VN_OFFSET_MS = 7 * 3600000;
const vnLocal = (iso?) => new Date(Date.parse(iso) + VN_OFFSET_MS).toISOString().slice(0, 16);

const show = (v?) =>
  v === null || v === undefined || v === '' ? 'trống' : typeof v === 'object' ? JSON.stringify(v) : String(v);

// Trải object lồng nhau thành các cặp đường dẫn → giá trị lá (mảng giữ nguyên như một giá trị)
function leaves(value?, path?, out?) {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    for (const k of Object.keys(value)) leaves(value[k], path ? `${path}.${k}` : k, out);
  } else out.set(path, value);
  return out;
}

const MAX_LINES = 8;

export function changesOf(row?) {
  const before = leaves(row.before, '', new Map());
  const after = leaves(row.after, '', new Map());
  const lines: any[] = [];
  for (const path of new Set<any>([...before.keys(), ...after.keys()])) {
    const a = before.get(path);
    const b = after.get(path);
    if (JSON.stringify(a) === JSON.stringify(b)) continue;
    lines.push({ text: `${path || 'Giá trị'}: ${show(a)} → ${show(b)}` });
  }
  if (lines.length > MAX_LINES) {
    const rest = lines.length - MAX_LINES;
    return [...lines.slice(0, MAX_LINES), { text: `và ${rest} trường khác` }];
  }
  return lines;
}

// Dòng đầu mang mã đối tượng bị đổi (khoá tham số, ngày…) để biết giá trị thuộc về đâu
const withEntity = (lines?, row?) =>
  row.entityId && lines.length ? [{ ...lines[0], code: String(row.entityId) }, ...lines.slice(1)] : lines;

export type AuditLine = {
  id: string;
  at: string;
  time: string;
  who: string;
  whoName: string;
  action: string;
  changes: { text: string; code?: string }[];
  reason: string;
};
export type AuditGroup = AuditLine & { count: number; rows: AuditLine[] };

const lineOf = (row: AuditItemDTO): AuditLine => {
  const at = vnLocal(row.at);
  return {
    id: String(row.id),
    at,
    time: at.slice(11, 16),
    who: row.actor,
    whoName: personLabel(row.actor, row.actorName),
    action: actionLabel(row.action, row.after),
    changes: withEntity(changesOf(row), row),
    reason: row.reason || '—'
  };
};

// Dòng liền nhau cùng người, cùng việc, cùng requestId (không rỗng) trong một ngày là một thao tác: gộp thành × N.
// Mục gộp mang giờ và thay đổi của dòng mới nhất (dòng đầu); rows giữ từng dòng theo thứ tự mới → cũ.
export function buildAuditPage(data: ReturnType<typeof auditFromResponse>, { page, size }: { page: number; size: number }) {
  const days: { day: string; rows: AuditGroup[] }[] = [];
  let prev: AuditItemDTO | null = null;
  for (const row of data.rows) {
    const line = lineOf(row);
    const day = line.at.slice(0, 10);
    if (!days.length || days[days.length - 1].day !== day) {
      days.push({ day, rows: [] });
      prev = null;
    }
    const groups = days[days.length - 1].rows;
    const last = groups[groups.length - 1];
    if (prev && last && row.requestId && prev.requestId === row.requestId && prev.actor === row.actor && prev.action === row.action) {
      last.rows.push(line);
      last.count += 1;
    } else {
      groups.push({ ...line, count: 1, rows: [line] });
    }
    prev = row;
  }
  const before = (page - 1) * size;
  const total = data.total;
  return {
    total,
    page,
    pages: Math.max(1, Math.ceil(total / size)),
    rangeLabel: !total
      ? 'Không có dòng nào'
      : page === 1
        ? `${data.rows.length} dòng đầu trên ${total}`
        : `Dòng ${before + 1}–${before + data.rows.length} trên ${total}`,
    days,
    people: data.people,
    actions: data.actions
  };
}

// Dựng một trang nhật ký từ phản hồi GET /audit: gom theo ngày giờ Việt Nam, mỗi dòng liệt kê trường đổi từ cũ sang mới.
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

export function buildAuditPage(res, { page, size, pages, seen }: any) {
  for (const row of res.rows) {
    if (row.actor) seen.actors.set(row.actor, row.actor);
    if (row.action) seen.actions.add(row.action);
  }
  const days: any[] = [];
  for (const row of res.rows) {
    const at = vnLocal(row.at);
    const day = at.slice(0, 10);
    if (!days.length || days[days.length - 1].day !== day) days.push({ day, rows: [] });
    days[days.length - 1].rows.push({
      id: String(row.id),
      at,
      time: at.slice(11, 16),
      who: row.actor,
      whoName: row.actor,
      action: row.action,
      changes: withEntity(changesOf(row), row),
      reason: row.reason || '—',
      count: 1
    });
  }
  const before = (page - 1) * size;
  const total = res.total;
  return {
    total,
    page,
    pages: Math.max(1, pages),
    rangeLabel: !total
      ? 'Không có dòng nào'
      : page === 1
        ? `${res.rows.length} dòng đầu trên ${total}`
        : `Dòng ${before + 1}–${before + res.rows.length} trên ${total}`,
    days,
    people: [...seen.actors.keys()].map(value => ({ value, label: seen.actors.get(value) })),
    actions: [...seen.actions]
  };
}

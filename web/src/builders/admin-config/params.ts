// Đọc phản hồi GET /settings/params thành bảng khoá → giá trị, và dựng danh sách thay đổi gửi PUT /settings/params.
// Tháng áp dụng (effectiveMonth) và số phiên bản (expectedRev) lấy từ chính phản hồi đã đọc.

export const TYPE_NAME = { tts: 'Thực tập sinh', ctv: 'Chuyên trách viên', nv: 'Nhân viên' };
export const TYPE_ORDER = ['tts', 'ctv', 'nv'];

/** Gom mọi giá trị đơn và mọi ô của bảng thành Map khoá → { value, status, entry }. */
export function indexParams(res?) {
  const byKey = new Map<any, any>();
  const entries: any[] = [];
  for (const group of res.groups || []) {
    for (const entry of group.entries || []) {
      entries.push(entry);
      for (const inst of entry.instances || []) {
        byKey.set(inst.key, { value: inst.value, status: inst.status, entry, instance: inst });
      }
      if (Array.isArray(entry.value)) {
        for (const row of entry.value) {
          if (!row || typeof row !== 'object' || !row.keys) continue;
          for (const [col, key] of Object.entries(row.keys)) byKey.set(key, { value: row[col], entry, row });
        }
      }
    }
  }
  return { month: res.month, rev: res.paramsRev, byKey, entries, groupIndex: res.groupIndex || [] };
}

export const valueOf = (idx?, key?) => (idx.byKey.has(key) ? idx.byKey.get(key).value : undefined);

// Tỉ lệ lưu 0.15 ↔ số phần trăm hiển thị 15 (làm tròn 6 số lẻ như máy chủ).
export const toPct = (ratio?) => (ratio == null ? ratio : Math.round(ratio * 1e6) / 1e4);
export const fromPct = (pct?) => (pct == null || pct === '' ? pct : Math.round(Number(pct) * 1e4) / 1e6);

/** Tên loại nhân sự trong nhãn "… (Chuyên trách viên)" hoặc từ khoá type.<loại>.… */
export function typeOfKey(key?) {
  const m = /^type\.([a-z]+)\./.exec(key);
  return m ? m[1] : null;
}

/** Bỏ phần "(Loại nhân sự)" ở cuối nhãn của từng thể hiện. */
export const baseLabel = (label?) =>
  String(label || '').replace(/\s*\((?:Thực tập sinh|Chuyên trách viên|Nhân viên)\)\s*$/, '');

/** Danh sách { key, value } cho các khoá có giá trị khác bản đã đọc. */
export function diffEdits(idx?, wanted?) {
  const edits: any[] = [];
  for (const [key, value] of wanted) {
    const base = valueOf(idx, key);
    if (JSON.stringify(base) !== JSON.stringify(value)) edits.push({ key, value });
  }
  return edits;
}

/** Sau khi lưu xong: ghi giá trị mới vào bản đã đọc để lần so sánh sau không báo đổi lại. */
export function applySaved(idx?, edits?, paramsRev?) {
  for (const { key, value } of edits) {
    const hit = idx.byKey.get(key);
    if (!hit) continue;
    hit.value = value;
    if (hit.instance) {
      hit.instance.value = value;
      hit.instance.status = 'custom';
    }
    if (hit.row) {
      const col = Object.keys(hit.row.keys).find(c => hit.row.keys[c] === key);
      if (col) hit.row[col] = value;
    }
  }
  if (Number.isInteger(paramsRev)) idx.rev = paramsRev;
}

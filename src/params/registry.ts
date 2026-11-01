'use strict';
// Registry tham số: MỘT bảng siêu dữ liệu cho mọi con số của hệ thống.
// Dữ liệu ở registry.data.json (nguồn duy nhất); giá trị mặc định KHÔNG nằm ở đây mà ở src/engine/payroll-params.ts → DEFAULTS
// (sinh từ mã). Mỗi mục: nhãn, nhóm, loại (chọn, số, bảng, cố định, bỏ), editableBy, phương án có `available`, đơn vị, khoảng,
// sàn hoặc trần của luật kèm tầng căn cứ, và thành phần giao diện (ui.component) để màn Cài đặt dựng hoàn toàn từ registry.
const data = require('./registry.data.json');
const Params = require('../engine/payroll-params');

const CLASSES = Object.freeze(['choice', 'number', 'table', 'formula', 'fixed', 'removed']);
const EDITABLE_BY = Object.freeze(['admin', 'accounting', 'ops', 'locked']);
// Tầng căn cứ của giá trị: sàn cứng, trần cứng, đúng luật, bản phát hành, chính sách, cấu trúc
const LEGAL_TIERS = Object.freeze(['floor', 'ceiling', 'exact', 'release', 'policy', 'structure']);
// Quyền sửa theo editableBy: ops và locked không ai sửa trên màn
const WRITE_CAP = Object.freeze({ admin: 'config.payroll', accounting: 'config.legal' });

const KEY_RE = /^[a-z][a-zA-Z0-9]*(\.([a-zA-Z0-9_]+))*$/;
const FAMILY_RE = /^[A-Za-z0-9_]+$/;

// Mẫu khoá `a.<x>.b` → RegExp; <x> khớp đúng một đoạn
function compilePattern(pattern?) {
  const source = pattern
    .split('.')
    .map(seg => (/^<[a-zA-Z]+>$/.test(seg) ? '([A-Za-z0-9_]+)' : seg.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
    .join('\\.');
  const names = [...pattern.matchAll(/<([a-zA-Z]+)>/g)].map(m => m[1]);
  return {
    regex: new RegExp(`^${source}$`),
    names,
    literals: pattern.split('.').filter(s => !/^<.*>$/.test(s)).length
  };
}

const entries = data.entries.map(entry =>
  Object.freeze({ ...entry, patterns: (entry.keys || []).map(compilePattern) })
);
const byId = new Map<any, any>(entries.map(entry => [entry.id, entry]));
if (byId.size !== entries.length) throw new Error('registry.data.json có hai mục cùng id');

// Tra mục theo khoá cụ thể; mẫu có nhiều chữ cố định hơn thắng (level.nv.2.base thuộc level.<type>.<level>, không thuộc mẫu rộng hơn)
const cache = new Map<any, any>();
function entryFor(key?) {
  if (cache.has(key)) return cache.get(key);
  let best: any = null;
  for (const entry of entries)
    for (const p of entry.patterns) {
      const m = p.regex.exec(key);
      if (m && (!best || p.literals > best.literals))
        best = { entry, literals: p.literals, params: Object.fromEntries(p.names.map((n, i) => [n, m[i + 1]])) };
    }
  const found = best ? { entry: best.entry, params: best.params } : null;
  cache.set(key, found);
  return found;
}
// Các khoá cụ thể của một mục, theo tập khoá đã biết (DEFAULTS)
const keysOf = (entry?, known = Object.keys(Params.DEFAULTS)) => known.filter(key => entryFor(key)?.entry === entry);

// Nhãn chữ của giá trị tham số mẫu khoá (ví dụ loại nhân sự) lấy từ rowKeys của bảng hoặc danh sách loại
const typeLabel = (value?) => (data.types.find(t => t.value === value) || {}).label || value;

export = {
  VERSION: data.version,
  GROUPS: Object.freeze(data.groups),
  TYPES: Object.freeze(data.types),
  CLASSES,
  EDITABLE_BY,
  LEGAL_TIERS,
  WRITE_CAP,
  KEY_RE,
  FAMILY_RE,
  UI_COMPONENTS: Params.UI_COMPONENTS,
  entries: Object.freeze(entries),
  byId: (id?) => byId.get(id) || null,
  entryFor,
  keysOf,
  typeLabel,
  compilePattern
};

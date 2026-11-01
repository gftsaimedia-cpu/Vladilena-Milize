'use strict';
const { AsyncList } = require('../shared/async-list');
// Đọc tham số theo tháng (chỉ ĐỌC; ghi ở src/params/save.ts). Nối store.params (src/platform/db.ts, bảng param_versions) với DEFAULTS và registry.
//   resolve(month)  → bộ tham số hiệu lực của tháng (phẳng, đóng băng) + các lớp có kiểu
//   view(month)     → dữ liệu cho màn Cài đặt (GET /api/settings/params), dựng hoàn toàn từ registry
//   firstRun(month) → các mục còn chờ Admin xác nhận (GET /api/settings/first-run)
// `params_mode = defaults-only` (mặc định) bỏ qua MỌI dòng phiên bản và dùng DEFAULTS (công tắc lùi nhanh nhất).
const crypto = require('node:crypto');
const store = require('../platform/db');
const Params = require('../engine/payroll-params');
const registry = require('./registry');
const configRev = require('./config-rev');
const Attributes = require('./attributes');
const Positions = require('./positions');
const BlockDefs = require('./block-defs');
const { validateValue, rulesOf, rowRulesOf, crossChecksOf, labelOf } = require('./validate');
const { catalogParams } = require('../domain/catalog-params');

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
const HISTORY_PER_ENTRY = 5;
const HISTORY_FETCH = 200;

/* ---------- bộ tham số hiệu lực ---------- */
// Danh mục chức vụ, bậc, ca trong DB (src/domain/catalog-params.ts). DB chưa có bảng danh mục thì không có dòng nào.
async function catalogRows() {
  try {
    return await catalogParams.rows();
  } catch (error) {
    if (/no such table/.test(String(error && error.message))) return [];
    throw error;
  }
}
const catalogRev = async () => await catalogParams.rev();
// options.drafts: các dòng nháp { key, value, effectiveMonth } chồng lên (xem trước, chưa ghi); options.active: tính như thể đã bật chế độ active
// (xem trước lần lưu đầu tiên, lúc còn defaults-only). Không đổi gì trong DB.
const reportedSkips = new Set<any>();
async function resolveUncached(month?, options: any = {}) {
  if (!MONTH_RE.test(String(month)))
    throw Object.assign(new Error('Tháng phải có dạng YYYY-MM'), { code: 'BAD_MONTH', httpStatus: 400 });
  const mode = await store.params.getMode();
  const rows: any[] = [],
    skipped: any[] = [];
  if (mode === 'active' || options.active) {
    const effective = await store.params.resolvedRows(month);
    // Nền kiểm từng dòng: mặc định + MỌI dòng hiệu lực (và nháp), để khoá thuộc tính và khoá chức vụ mới được kiểm theo định nghĩa cùng tháng
    const overlay = { ...Params.DEFAULTS };
    for (const row of [...effective, ...(options.drafts || [])]) overlay[row.key] = row.value;
    for (const row of effective) {
      // Dòng của khoá lạ, hoặc giá trị sai cấu trúc (ví dụ sửa tay trong DB), bị bỏ qua và báo lại; không bao giờ làm hỏng bảng lương
      // Khoá không sửa được trên màn (locked, ops, fixed) chỉ nhận dòng do `system` (bản phát hành) ghi; dòng của người dùng cho khoá đó bị bỏ qua
      const hit = Positions.classify(row.key) || BlockDefs.classify(row.key) ? null : registry.entryFor(row.key); // khoá của chức vụ mới đã được kiểm lúc ghi
      if (
        hit &&
        row.createdBy !== 'system' &&
        (!registry.WRITE_CAP[hit.entry.editableBy] || ['fixed', 'removed'].includes(hit.entry.class))
      ) {
        skipped.push({
          id: row.id,
          key: row.key,
          code: 'PARAM_LOCKED',
          message: `${hit.entry.label} không sửa được trên màn hình`
        });
        continue;
      }
      // Một dòng hỏng không bao giờ được làm mọi route đọc tham số trả 500: lỗi bất ngờ khi kiểm cũng thành "bị bỏ qua"
      let checked;
      try {
        checked = validateValue(row.key, row.value, { structureOnly: true, params: overlay });
      } catch (error) {
        checked = { ok: false, code: 'PARAM_ROW_INVALID', message: String(error && error.message).slice(0, 200) };
      }
      if (checked.ok) rows.push(row);
      else skipped.push({ id: row.id, key: row.key, code: checked.code, message: checked.message });
    }
  }
  // Dòng bị loại không được im lặng: ghi nhật ký chạy MỘT lần cho mỗi dòng (chỉ khoá và mã lỗi, không giá trị); GET /api/settings/params trả `skipped`
  for (const s of skipped)
    if (!reportedSkips.has(s.id)) {
      reportedSkips.add(s.id);
      console.error(`[params] dòng phiên bản ${s.id} (${s.key}) bị bỏ qua, mặc định đang chạy thay: ${s.code}`);
    }
  const top = rows.reduce((max, r) => Math.max(max, r.id), 0);
  (options.drafts || []).forEach((draft, index) => rows.push({ id: top + index + 1, ...draft })); // nháp luôn thắng dòng cùng tháng
  // Danh mục chức vụ, bậc, ca trong DB (src/domain/container.ts) chồng lên ở cả hai chế độ: theo từng khoá, dòng có tháng áp dụng muộn hơn
  // thắng (sửa ở màn Cài đặt cũ hay ở danh mục đều có hiệu lực); cùng tháng thì danh mục thắng vì id lớn. Dòng danh mục không phải dòng
  // param_versions nên không tính vào rev / applied.
  const catalog = await catalogRows();
  const params = Params.resolveParamSet(catalog.length ? [...rows, ...catalog] : rows, month);
  return {
    month,
    mode,
    params,
    classes: Params.buildParamClasses(params),
    rev: top,
    hash: crypto.createHash('sha256').update(Params.canonical(params)).digest('hex'),
    applied: rows,
    skipped
  };
}

// Dựng bộ tham số (clone, phân lớp, băm sha256) tốn ~vài ms mỗi lần và /api/team, /api/staff gọi theo từng người: nhớ kết quả giữa các request.
// Khoá = (kết nối DB, chế độ, id dòng tham số mới nhất): param_versions chỉ thêm dòng nên id đổi ⇔ dữ liệu đổi; đổi chế độ cũng đổi khoá.
// Xem trước (drafts/active) không bao giờ vào bộ nhớ đệm. Kết quả đã đóng băng phần params; các trường khác chỉ được đọc.
const RESOLVE_CACHE_MAX = 64;
let cacheDb: any = null;
let cacheStamp = '';
const resolvedCache = new Map<any, any>();
async function resolve(month?, options: any = {}) {
  if (options.drafts || options.active) return await resolveUncached(month, options);
  const stamp = `${await store.params.getMode()}:${await store.params.lastId()}:${await catalogRev()}`;
  if (cacheDb !== store.db || cacheStamp !== stamp) {
    resolvedCache.clear();
    cacheDb = store.db;
    cacheStamp = stamp;
  }
  const key = String(month);
  const hit = resolvedCache.get(key);
  if (hit) return hit;
  const result = await resolveUncached(month, options);
  if (resolvedCache.size >= RESOLVE_CACHE_MAX) resolvedCache.clear();
  resolvedCache.set(key, result);
  return result;
}

/* ---------- giá trị thật của các khoá nằm ở settings (backing) ---------- */
async function backedValues() {
  const geofence = await store.getSetting('geofence', null);
  return {
    'settings:geofence': (key?) => {
      if (key === 'geofence.enabled') return !!geofence;
      const field = key.split('.')[1];
      return geofence && Object.hasOwn(geofence, field) ? geofence[field] : undefined;
    },
    'settings:holidays': async () => await store.getSetting('holidays', [])
  };
}

/* ---------- lắp bảng từ các khoá phẳng ---------- */
function templateRegex(entry?, columns?) {
  const template = entry.ui.table.keyTemplate;
  const names: any[] = [];
  const source = template
    .split('.')
    .map(seg => {
      const m = /^<([a-zA-Z]+)>$/.exec(seg);
      if (!m) return seg.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      names.push(m[1]);
      return m[1] === 'column' ? `(${columns.join('|')})` : '([A-Za-z0-9_]+)';
    })
    .join('\\.');
  return { regex: new RegExp(`^${source}$`), names };
}
const rowKeyOrder = (rowKey?, value?) => {
  if (rowKey && rowKey.values) return rowKey.values.findIndex(v => v.value === value);
  return Number(value);
};
function assembleTable(entry?, keys?, get?) {
  const table = entry.ui.table;
  const columns = table.columns.map(c => c.key);
  const { regex, names } = templateRegex(entry, columns);
  const rows = new Map<any, any>();
  for (const key of keys) {
    const m = regex.exec(key);
    if (!m) continue;
    const ident: Record<string, any> = {};
    let column = columns[0];
    names.forEach((name, i) => {
      if (name === 'column') column = m[i + 1];
      else ident[name] = rowIsNumeric(table, name) ? Number(m[i + 1]) : m[i + 1];
    });
    const id = JSON.stringify(ident);
    if (!rows.has(id)) rows.set(id, { ...ident, keys: {} });
    const row = rows.get(id);
    row[column] = get(key);
    row.keys[column] = key;
  }
  const list = [...rows.values()];
  const cmp = (a?, b?) => {
    for (const rk of table.rowKeys || []) {
      const d = rowKeyOrder(rk, a[rk.key]) - rowKeyOrder(rk, b[rk.key]);
      if (d) return d;
    }
    return 0;
  };
  return list.sort(cmp);
}
const rowIsNumeric = (table?, name?) => !!(table.rowKeys || []).find(rk => rk.key === name && rk.dynamic);
// Danh sách nguyên khối (một khoá chứa mảng) thành các hàng cho giao diện
function listRows(entry?, value?) {
  if (!Array.isArray(value)) return [];
  const id = entry.id;
  if (entry.valueType === 'intList') return value.map((v, i) => ({ index: i + 1, value: v }));
  if (entry.valueType === 'brackets') return value.map(([upTo, rate]: any, i) => ({ bracket: i + 1, upTo, rate }));
  if (entry.valueType === 'tiers') return value.map((t, i) => ({ tier: i + 1, ...t }));
  if (entry.valueType === 'dateList') return value.map(date => ({ date }));
  return value.map((v, i) => ({ index: i + 1, value: v, entry: id }));
}

/* ---------- dòng lịch sử của một tham số ---------- */
// MỘT dạng dòng cho history[] của mục và cho từng phần tử instances[] (giao diện đọc cùng tên trường ở cả hai nơi).
//   createdAt, createdBy  thời điểm ISO và tài khoản ghi dòng này (bản phát hành ghi bởi `system`); null khi khoá còn dùng mặc định
//   value                 giá trị của dòng
//   effectiveMonth        tháng bắt đầu áp dụng (YYYY-MM)
//   reason                lý do bắt buộc khi Admin đổi; null cho dòng của bản phát hành
// history[] có thêm id, key, basis (căn cứ). instances[] có thêm changedBy, changedAt, version cho màn cũ.
const VERSION_ROW_FIELDS = Object.freeze(['createdAt', 'createdBy', 'value', 'effectiveMonth', 'reason']);
const historyRow = (row?) => ({
  id: row.id,
  key: row.key,
  value: row.value,
  effectiveMonth: row.effectiveMonth,
  reason: row.reason,
  basis: row.basis,
  createdBy: row.createdBy,
  createdAt: row.createdAt
});

/* ---------- dữ liệu cho màn Cài đặt ---------- */
const STATUS = Object.freeze({ app: 'app', unset: 'unset', custom: 'custom' });
// Khoá của chức vụ thêm sau (type.<mã>.*, level.<mã>.<bậc>.*, kể cả lịch) có trong bộ tham số của tháng nhưng không có trong DEFAULTS: màn Cài đặt
// liệt kê chúng như ba chức vụ mặc định (cùng mẫu registry) để sửa được ô của chức vụ mới. Khoá không khớp mục registry nào bị loại.
function dynamicPositionKeys(set?) {
  return Object.keys(set)
    .filter(key => {
      if (Object.hasOwn(Params.DEFAULTS, key)) return false;
      const hit = Positions.classify(key);
      return !!hit && ['type', 'level', 'schedule'].includes(hit.kind) && !!registry.entryFor(key);
    })
    .sort();
}
// Giá trị mặc định hiển thị của khoá chức vụ động: của khoá mẫu (chức vụ mặc định cùng đuôi)
function defaultOfKey(key?) {
  if (Object.hasOwn(Params.DEFAULTS, key)) return Params.DEFAULTS[key];
  const moved = Positions.translate(key, { structureOnly: true });
  return moved && moved.templateKey ? Params.DEFAULTS[moved.templateKey] : undefined;
}
async function view(month?, { group }: any = {}) {
  const resolved = await resolve(month);
  const set = resolved.params;
  const knownKeys = [...Object.keys(Params.DEFAULTS), ...dynamicPositionKeys(set)];
  const backed = await backedValues();
  const appliedByKey = new Map<any, any>(resolved.applied.map(r => [r.key, r]));
  const historyByEntry = new Map<any, any>();
  for (const row of await store.params.history({ limit: HISTORY_FETCH })) {
    const hit = registry.entryFor(row.key);
    if (!hit) continue;
    const list = historyByEntry.get(hit.entry.id) || [];
    if (list.length < HISTORY_PER_ENTRY) list.push(historyRow(row));
    historyByEntry.set(hit.entry.id, list);
  }
  const currentOf = async (entry?, key?) => {
    if (entry.backing && backed[entry.backing]) {
      const v = await backed[entry.backing](key);
      if (v !== undefined) return v;
      return set[key];
    }
    return set[key];
  };
  const out: any[] = [];
  for (const entry of registry.entries) {
    if (group !== undefined && entry.group !== group) continue;
    const keys = registry.keysOf(entry, knownKeys);
    const base = {
      id: entry.id,
      group: entry.group,
      order: entry.order,
      label: entry.label,
      class: entry.class,
      editableBy: entry.editableBy,
      writeCapability: registry.WRITE_CAP[entry.editableBy] || null,
      adminOnly: !!entry.adminOnly,
      defaultNote: entry.defaultNote || null,
      basis: entry.basis || null,
      legal: entry.legal ? { tier: entry.legal.tier, basis: entry.legal.basis } : null,
      proposal: entry.proposal === undefined ? null : entry.proposal,
      firstRun: entry.firstRun,
      backing: entry.backing || null,
      // wired: bộ máy đọc khoá và không còn bản sao hằng số (null = mục không sửa được). false → Lưu bị 400 PARAM_NOT_WIRED; unwiredKeys: bảng hỗn hợp
      wired: entry.wired === undefined ? null : entry.wired,
      unwiredKeys: entry.unwiredKeys || null,
      backingSection: entry.backingSection || null, // mục Cài đặt sửa được thật khoá này (id như src/engine/admin/view-cai-dat.js)
      backingSectionLabel: entry.backingSectionLabel || null,
      lockReason: entry.lockReason || null,
      deprecated: !!entry.deprecated,
      keys: entry.keys,
      valueType: entry.valueType || null,
      ui: entry.ui
    };
    if (entry.class === 'removed' || !entry.valueBearing) {
      out.push({ ...base, readOnly: true, instances: [] });
      continue;
    }
    // trạng thái từng khoá: custom (Admin đã đặt), unset (còn chờ xác nhận), app (đang dùng mặc định của mã)
    const instances = await AsyncList.map(keys, async key => {
      const hit = registry.entryFor(key);
      const value = await currentOf(entry, key),
        def = defaultOfKey(key);
      const row = appliedByKey.get(key);
      const differs = JSON.stringify(value) !== JSON.stringify(def);
      let status: string = STATUS.app;
      if (row || (entry.backing && differs)) status = STATUS.custom;
      else if (entry.firstRun) status = STATUS.unset;
      return {
        key,
        params: hit ? hit.params : {},
        label: labelOf(entry, key),
        value,
        default: def,
        status,
        effectiveMonth: row ? row.effectiveMonth : null,
        version: row ? row.id : 0,
        reason: row ? row.reason : null,
        createdBy: row ? row.createdBy : null,
        createdAt: row ? row.createdAt : null,
        changedBy: row ? row.createdBy : null,
        changedAt: row ? row.createdAt : null
      };
    });
    const entryStatus = instances.some(i => i.status === 'custom')
      ? STATUS.custom
      : instances.some(i => i.status === 'unset')
        ? STATUS.unset
        : STATUS.app;
    const item: Record<string, any> = {
      ...base,
      readOnly: entry.class === 'fixed' || !registry.WRITE_CAP[entry.editableBy],
      status: entryStatus,
      instances,
      history: historyByEntry.get(entry.id) || []
    };
    if (entry.ui && entry.ui.table && entry.valueType === 'table') delete item.instances; // bảng: giao diện đọc `value` (hàng) và `rules.columns`
    const table = entry.ui && entry.ui.table;
    if (table && entry.valueType === 'table') {
      const currents = new Map<any, any>(await AsyncList.map(keys, async key => [key, await currentOf(entry, key)]));
      const get = (key?) => currents.get(key);
      item.value = assembleTable(entry, keys, get);
      item.default = assembleTable(entry, keys, key => Params.DEFAULTS[key]);
      const sample = table.keyTemplate;
      item.rules = {
        columns: Object.fromEntries(
          table.columns.map(c => [c.key, rulesOf(entry, sample.replace('<column>', c.key), set)])
        )
      };
      if (entry.crossChecks) item.rules.crossChecks = crossChecksOf(entry, set);
    } else if (entry.ui && entry.ui.display && entry.valueType === 'table') {
      const currents = new Map<any, any>(await AsyncList.map(keys, async key => [key, await currentOf(entry, key)]));
      item.value = assembleTable({ ...entry, ui: { ...entry.ui, table: entry.ui.display } }, keys, key =>
        currents.get(key)
      );
    } else if (instances.length === 1 && keys.length === 1) {
      item.value = instances[0].value;
      item.default = instances[0].default;
      if (['intList', 'brackets', 'tiers', 'dateList'].includes(entry.valueType))
        item.rows = listRows(entry, item.value);
      if (entry.valueBearing && entry.class !== 'fixed') {
        item.rules = rulesOf(entry, keys[0], set);
        const rowRules = rowRulesOf(entry);
        if (rowRules) {
          // bảng bậc nguyên khối (attendance.tiers): luật từng cột và luật giữa các hàng
          item.rules.columns = Object.fromEntries(
            entry.ui.table.columns.map(c => [c.key, rulesOf(entry, keys[0], set, c.key)])
          );
          item.rules.rows = rowRules;
        }
        if (entry.crossChecks) item.rules.crossChecks = crossChecksOf(entry, set);
      }
    } else if (instances.length) {
      // họ khoá theo loại nhân sự (hoặc nhiều khoá cùng khuôn): giao diện vẽ một ô cho mỗi instance
      const sampleKey = entry.keys[0];
      if (entry.class !== 'fixed') {
        item.rules = rulesOf(entry, sampleKey.replace(/<[a-zA-Z]+>/g, 'x'), set); // dạng chung (nhãn có "(x)"): giữ cho giao diện cũ
        // thông báo, sàn, trần theo từng khoá cụ thể, nhãn đã có tên loại nhân sự hoặc bậc
        for (const inst of instances) inst.rules = rulesOf(entry, inst.key, set);
      }
    }
    if (entry.id === Attributes.LEVEL_TABLE_ID) Attributes.extendLevelTable(item, set); // cột thuộc tính tuỳ chỉnh của Level
    out.push(item);
  }
  const groups = registry.GROUPS.filter(g => group === undefined || g.id === group).map(g => ({
    id: g.id,
    label: g.label,
    advanced: !!g.advanced,
    entries: out.filter(e => e.group === g.id).sort((a: any, b: any) => a.order - b.order)
  }));
  // Mục lục nhóm: LUÔN đủ mọi nhóm (kể cả khi lọc theo group), count = số mục registry của nhóm, để giao diện tải từng nhóm
  const groupIndex = registry.GROUPS.map(g => ({
    id: g.id,
    label: g.label,
    advanced: !!g.advanced,
    count: registry.entries.filter(e => e.group === g.id).length
  }));
  return {
    month,
    mode: resolved.mode,
    paramsRev: resolved.rev,
    configRev: await configRev.read(),
    paramsHash: resolved.hash,
    skipped: resolved.skipped,
    uiComponents: Params.UI_COMPONENTS,
    notEnabledComponents: Params.UI_COMPONENTS_NOT_ENABLED,
    groupIndex,
    groups
  };
}

/* ---------- cài đặt ban đầu ---------- */
// Nhãn tiếng Việt của giá trị đang dùng (`currentLabel`), để màn không phải hiện mã (holidayOnly, step, A…). `current` giữ nguyên cho bên cũ.
const FR_UNIT_TEXT = {
  vnd: '₫',
  ratio: '%',
  percentPoints: '%',
  minute: 'phút',
  hour: 'giờ',
  day: 'ngày',
  month: 'tháng',
  times: 'lần',
  meter: 'm',
  degree: '°'
};
// Mục có cách nói riêng: theo id → hàm(giá trị), hoặc bảng giá trị → chữ
const FR_LABEL_FN = { 'period.payDay': (v?) => `Ngày ${v} tháng sau` };
const FR_LABEL_VALUE = {
  'employeeCode.pattern': { '{type}{unit}{seq:2}': 'Ký hiệu loại + mã đơn vị + số thứ tự 2 chữ số' }
};
const frNumber = (n?) => new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 6 }).format(n);
function frValueLabel(e?, value?) {
  if (value === null || value === undefined) return 'Chưa đặt';
  const fn = FR_LABEL_FN[e.id];
  if (fn) return fn(value);
  const fixed = FR_LABEL_VALUE[e.id] && FR_LABEL_VALUE[e.id][value];
  if (fixed) return fixed;
  const opt = e.rules && e.rules.options && e.rules.options.find(o => o.value === value);
  if (opt) return opt.label;
  if (typeof value === 'boolean') return value ? 'Có' : 'Không';
  const unit = e.ui && e.ui.unit;
  if (typeof value === 'number') {
    const shown = unit === 'ratio' ? Math.round(value * 1e4) / 1e2 : value;
    return `${frNumber(shown)}${FR_UNIT_TEXT[unit] ? ' ' + FR_UNIT_TEXT[unit] : ''}`;
  }
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value))
    return `${value.slice(8)}/${value.slice(5, 7)}/${value.slice(0, 4)}`;
  if (typeof value === 'string' && /^\d{4}-\d{2}$/.test(value)) return `${value.slice(5)}/${value.slice(0, 4)}`;
  return String(value);
}
function frCurrentLabel(e?) {
  if (e.valueType === 'table' && Array.isArray(e.value)) return `${e.value.length} loại, đang dùng mặc định của app`;
  if (e.value === undefined) {
    const parts = e.instances || [];
    if (parts.every(i => i.value === null || i.value === undefined)) return 'Chưa đặt';
    return parts.map(i => `${i.label}: ${frValueLabel(e, i.value)}`).join('; ');
  }
  return frValueLabel(e, e.value);
}

async function firstRun(month?) {
  const data = await view(month);
  const items: any[] = [];
  for (const g of data.groups)
    for (const e of g.entries)
      if (e.firstRun && e.status === STATUS.unset)
        items.push({
          id: e.id,
          group: e.group,
          groupLabel: g.label,
          label: e.label,
          keys: e.keys,
          recommended: e.firstRun.recommended,
          why: e.firstRun.why,
          current: e.value === undefined ? e.instances.map(i => ({ key: i.key, value: i.value })) : e.value,
          currentLabel: frCurrentLabel(e),
          status: e.status,
          ui: { component: e.ui.component, group: e.group, order: e.order }
        });
  return { month, mode: data.mode, total: items.length, items };
}

export = { resolve, view, firstRun, STATUS, VERSION_ROW_FIELDS };

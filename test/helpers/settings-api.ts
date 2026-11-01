'use strict';
// Đồ dùng chung cho test đường ghi cài đặt:
//   POST /api/settings/params/preview, PUT /api/settings/params, GET /api/settings/version, GET /api/settings/params (paramsRev, lịch sử).
// Test chạy như `todo` cho tới khi có GET /settings/version và config_rev (cờ READY);
// RED=1 để thấy từng test đỏ vì lý do gì. Khoá dùng để thử được TÌM trong registry lúc chạy (cờ wired, editableBy, kiểm giá trị bằng validateValue):
// không viết cứng khoá mà registry có thể đổi, và khoá không có thì test ghi rõ "todo: registry chưa có khoá ..." thay vì đỏ vô cớ.
const P = require('./period-api');
const { pendingUnless, mentions } = require('./red');
const registry = require('../../src/params/registry');
const { validateValue } = require('../../src/params/validate');
const { DEFAULTS } = require('../../src/engine/payroll-params');

const { F, store } = P;

// Đường Lưu tham số có đủ khi có số phiên bản chung (src/params/config-rev.ts)
const READY = pendingUnless(
  'R1: chưa có GET /api/settings/version và src/params/config-rev.ts (đường Lưu tham số chưa vào)',
  mentions('src/params/config-rev.ts', /config_rev/)
);
// Như READY nhưng thêm điều kiện khoá tìm được: todo ghi lý do cụ thể
const readyWith = (found?, why?) => (READY.todo ? READY : found ? {} : { todo: `registry chưa có ${why}` });

const entryOf = (key?) => {
  const hit = registry.entryFor(key);
  return hit ? hit.entry : null;
};
const isScalarNumber = (key?) => typeof DEFAULTS[key] === 'number';

/* ---------- tìm khoá thử trong registry ---------- */
// Khoá thử đổi tiền, đã nối (wired === true), Admin sửa được và giá trị mới qua kiểm: [khoá, giá trị mới, người dùng bị ảnh hưởng]
function wiredMoneyKey() {
  const candidates = [
    ['level.nv.1.base', 7000000, 'qa_nv1'],
    ['type.nv.travel', 0.2, 'qa_nv1'],
    ['type.nv.attendance', 0.3, 'qa_nv1']
  ];
  for (const [key, value, user] of candidates) {
    const entry = entryOf(key);
    if (
      entry &&
      entry.wired !== false &&
      entry.editableBy === 'admin' &&
      validateValue(key, value, { params: DEFAULTS }).ok
    )
      return { key, value, user, was: DEFAULTS[key] };
  }
  return null;
}
// Các khoá số Admin sửa được, đã nối (cờ wired chưa có thì coi như nối): { key, value (= values[0]), values: nhiều giá trị hợp lệ khác nhau và khác mặc định, was }.
// Lỗi nối chặn trước lỗi giá trị nên test kiểm đầu vào/quyền phải dùng khoá đã nối; không viết cứng số vì khoá khác nhau có miền khác nhau (tiền, tỷ lệ).
function adminKeys() {
  const out: any[] = [];
  for (const key of [
    'level.nv.1.base',
    'level.nv.2.base',
    'level.nv.3.base',
    'type.nv.travel',
    'type.nv.attendance',
    'type.ctv.travel'
  ]) {
    const entry = entryOf(key);
    const was = DEFAULTS[key];
    if (!entry || entry.editableBy !== 'admin' || entry.backing || entry.wired === false || typeof was !== 'number')
      continue;
    const integer = Number.isInteger(was);
    const values: any[] = [];
    for (const factor of [1.1, 1.15, 1.2, 1.25, 1.3, 1.35, 1.4, 0.9, 0.8]) {
      const raw = was * factor;
      const value = integer ? Math.round(raw / 1000) * 1000 || Math.round(raw) : Math.round(raw * 100) / 100;
      if (value !== was && !values.includes(value) && validateValue(key, value, { params: DEFAULTS }).ok)
        values.push(value);
      if (values.length === 6) break;
    }
    if (values.length >= 3) out.push({ key, value: values[0], values, was });
  }
  return out;
}
const adminKey = () => adminKeys()[0] || null;
// Giá trị hợp lệ của khoá KHÁC giá trị đang hiệu lực ở tháng (dòng param_versions chỉ-thêm-dòng nên test trước có thể đã đặt giá trị): n giá trị khác nhau
async function differing(k?, month?, n = 1) {
  const view = (await paramsView(month)).data;
  const current = valueOfKey(view, k.key) ?? k.was;
  const out = k.values.filter(v => v !== current);
  if (out.length < n) throw new Error(`không đủ giá trị khác ${current} cho ${k.key}`);
  return out.slice(0, n);
}
// Đổi giá trị số một chút cho tới khi qua kiểm; trả null nếu không tìm được
function validChange(key?) {
  const base = DEFAULTS[key];
  if (typeof base !== 'number') return null;
  for (const value of [base + 1, base * 2, base / 2, base + 0.05, Math.round(base) + 2]) {
    const checked = validateValue(key, value, { params: DEFAULTS });
    if (checked.ok && checked.warnings.length === 0 && value !== base) return value;
  }
  return null;
}
function keyBy(editableBy?, extra: any = () => true) {
  for (const key of Object.keys(DEFAULTS)) {
    const entry = entryOf(key);
    if (!entry || entry.editableBy !== editableBy || entry.backing || entry.deprecated) continue;
    if (!isScalarNumber(key) || !extra(entry, key)) continue;
    return { key, value: validChange(key) ?? DEFAULTS[key] + 1 };
  }
  return null;
}
const accountingKey = () => keyBy('accounting');
const opsKey = () => keyBy('ops');
const lockedKey = () => keyBy('locked');
// Khoá `wired: false` mà Admin sửa được và qua kiểm giá trị (để PARAM_NOT_WIRED là lỗi duy nhất)
function notWiredKey() {
  for (const key of Object.keys(DEFAULTS)) {
    const entry = entryOf(key);
    if (!entry || entry.wired !== false || entry.editableBy !== 'admin' || entry.backing) continue;
    const value = validChange(key);
    if (value !== null) return { key, value };
  }
  return null;
}
// Giá trị phạm sàn cứng, sàn mềm (cần acknowledge), phương án chưa dùng được: dò bằng validateValue trên mọi khoá Admin/Kế toán sửa được
const PROBES = [0, 0.01, 0.1, 0.5, 1, 10, 100, 1000, 100000, 1000000, 100000000];
function probe(codeOf?, skip = 0) {
  let seen = 0;
  for (const key of Object.keys(DEFAULTS)) {
    const entry = entryOf(key);
    if (
      !entry ||
      !['admin', 'accounting'].includes(entry.editableBy) ||
      entry.backing ||
      entry.deprecated ||
      entry.wired === false
    )
      continue;
    for (const value of PROBES) {
      if (typeof DEFAULTS[key] !== 'number') continue;
      const r = validateValue(key, value, { params: DEFAULTS });
      const code = codeOf(r);
      if (code && seen++ >= skip) return { key, value, editableBy: entry.editableBy, code };
    }
  }
  return null;
}
// Khoá có backing settings:* (công tắc ngày, GPS, ngày lễ): không lưu ở PUT /settings/params
function backedKey() {
  for (const key of Object.keys(DEFAULTS)) {
    const entry = entryOf(key);
    if (!entry || !entry.backing || entry.editableBy !== 'admin') continue;
    const value = typeof DEFAULTS[key] === 'number' ? DEFAULTS[key] + 1 : DEFAULTS[key] === null ? '2026-12-01' : null;
    if (value !== null) return { key, value };
  }
  return null;
}
const hardFloorKey = () =>
  probe(r => (r.ok && r.warnings.some(w => w.code === 'PARAM_BELOW_LEGAL_FLOOR') ? 'PARAM_BELOW_LEGAL_FLOOR' : null));
const softFloorKey = (skip = 0) =>
  probe(
    r => (r.ok && r.warnings.some(w => w.code === 'PARAM_FLOOR_ACK_REQUIRED') ? 'PARAM_FLOOR_ACK_REQUIRED' : null),
    skip
  );
function unavailableOptionKey() {
  for (const entry of registry.entries) {
    if (!entry.options || entry.editableBy !== 'admin' || entry.backing || entry.wired === false) continue;
    const key = registry.keysOf(entry).find(k => Object.hasOwn(DEFAULTS, k));
    const option = entry.options.find(o => o.available === false);
    if (key && option && validateValue(key, option.value, { params: DEFAULTS }).code === 'PARAM_OPTION_UNAVAILABLE')
      return { key, value: option.value };
  }
  return null;
}

/* ---------- gọi API ---------- */
const preview = async (body?, who = 'admin') => await F.call('POST', '/settings/params/preview', { who, body });
const save = async (body?, who = 'admin') => await F.call('PUT', '/settings/params', { who, body });
const version = async (who = 'admin') => await F.call('GET', '/settings/version', { who });
const paramsView = async (month?, who = 'admin') => await F.call('GET', `/settings/params?month=${month}`, { who });
const paramsRevOf = async (month?) => (await paramsView(month)).data.paramsRev;
const REASON = 'Điều chỉnh theo quyết định tháng này';
// Gửi một lần Lưu với expectedRev lấy đúng từ GET của tháng hiệu lực
async function saveChanges(changes?, options: any = {}) {
  const { month, who = 'admin', extra = {}, expectedRev } = options;
  const reason = Object.hasOwn(options, 'reason') ? options.reason : REASON; // reason: undefined nghĩa là KHÔNG gửi lý do
  const rev = expectedRev === undefined ? await paramsRevOf(month) : expectedRev;
  const body = { changes, effectiveMonth: month, reason, expectedRev: rev, ...extra };
  if (rev === null) delete body.expectedRev;
  return await save(body, who);
}

/* ---------- đọc trạng thái ---------- */
// Chế độ bắt đầu ở defaults-only (công tắc lùi nhanh); lần ghi đầu tiên bật active. Mỗi test tự đặt lại để không phụ thuộc test trước.
const setMode = async (mode?) => await store.setSetting('params_mode', mode);
const rowCount = async () => (await store.db.prepare('SELECT COUNT(*) AS n FROM param_versions').get()).n;
const paramRows = async () => await store.db.prepare('SELECT * FROM param_versions ORDER BY id').all();
const configRev = async () => {
  const row = await store.db.prepare("SELECT value_json FROM settings WHERE key = 'config_rev'").get();
  return row ? JSON.parse(row.value_json) : 0;
};
const auditRows = async (actionLike = '%') =>
  (await store.db.prepare('SELECT * FROM audit_log WHERE action LIKE ? ORDER BY id').all(actionLike)).map(r => ({
    ...r,
    before: r.before_json && JSON.parse(r.before_json),
    after: r.after_json && JSON.parse(r.after_json)
  }));
// Tìm trong phản hồi GET /settings/params: ô bảng của khoá (hàng có keys[cột] === key) và dòng lịch sử của khoá
function findCell(node?, key?, seen = new Set()) {
  if (!node || typeof node !== 'object' || seen.has(node)) return undefined;
  seen.add(node);
  // ô đơn: { key, value, default, status, effectiveMonth, version, reason ... }
  if (node.key === key && 'value' in node && 'default' in node) return { row: node, column: null, value: node.value };
  if (node.keys && typeof node.keys === 'object' && !Array.isArray(node.keys)) {
    for (const [column, k] of Object.entries<any>(node.keys))
      if (k === key) return { row: node, column, value: node[column] };
  }
  for (const v of Array.isArray(node) ? node : Object.values<any>(node)) {
    const hit = findCell(v, key, seen);
    if (hit) return hit;
  }
  return undefined;
}
function findHistory(node?, key?, seen = new Set(), out: any[] = []) {
  if (!node || typeof node !== 'object' || seen.has(node)) return out;
  seen.add(node);
  if (node.key === key && 'effectiveMonth' in node && 'value' in node) out.push(node);
  for (const v of Array.isArray(node) ? node : Object.values<any>(node)) findHistory(v, key, seen, out);
  return out;
}
// Giá trị khoá trong phản hồi GET: ô bảng, hoặc phần tử đơn
const valueOfKey = (data?, key?) => {
  const cell = findCell(data.groups, key);
  if (cell) return cell.value;
  return undefined;
};

module.exports = {
  ...P,
  READY,
  pendingUnless,
  mentions,
  readyWith,
  DEFAULTS,
  registry,
  entryOf,
  wiredMoneyKey,
  adminKey,
  adminKeys,
  differing,
  accountingKey,
  opsKey,
  lockedKey,
  notWiredKey,
  hardFloorKey,
  backedKey,
  softFloorKey,
  unavailableOptionKey,
  validChange,
  preview,
  save,
  version,
  paramsView,
  paramsRevOf,
  saveChanges,
  REASON,
  setMode,
  rowCount,
  paramRows,
  configRev,
  auditRows,
  findCell,
  findHistory,
  valueOfKey
};

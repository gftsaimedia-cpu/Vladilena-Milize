'use strict';
// params:check — kiểm registry, DEFAULTS và khoá đã phát hành. Thoát 1 nếu có lỗi (dùng trong CI).
//   1. DEFAULTS khớp mã đang chạy (extract-defaults --check)
//   2. mỗi mục registry hợp lệ: loại, editableBy, nhóm, nhãn, thành phần giao diện đúng loại, lược đồ bảng và bảng bậc đúng khuôn
//   3. mọi khoá của DEFAULTS thuộc đúng một mục; mọi mục mang giá trị có mặc định, mặc định qua chính bộ kiểm của nó
//   4. giá trị dẫn xuất và bản chép trong mã khớp nhau (trần đóng BH, miễn thuế giờ đêm ngày lễ, ca cố định, lịch loại nhân sự, luật AI)
//   5. khoá đã phát hành (src/params/keys.lock.json) không mất, khoá mới đã vào tệp
//   --counts  in số mục theo loại, theo editableBy và theo nhóm
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { readAsJs } = require('../dev/ts-source');
const { extract, sources, ROOT } = require('./extract-defaults');
// Registry/code validation is static; do not configure or load a database for this command.

const Params = require(path.join(ROOT, 'src/engine/payroll-params'));
const registry = require(path.join(ROOT, 'src/params/registry.ts'));
const { validateValue } = require(path.join(ROOT, 'src/params/validate.ts'));

const errors: any[] = [];
const fail = (message?) => errors.push(message);
const KEY_RE = /^[a-z][a-zA-Z0-9]*(\.([a-z][a-zA-Z0-9]*|[0-9]+))*$/;
const MAX_SEGMENTS = 6;
const MAX_KEY_LENGTH = 64;
const FAMILY_SEGMENT_RE = /^[a-z][a-z0-9_]*$/; // họ request.type.<code>: mã loại yêu cầu có gạch dưới
const COMPONENTS_BY_CLASS = {
  fixed: ['fixed'],
  removed: ['fixed'],
  choice: ['choice', 'toggle'],
  number: ['money', 'percent', 'quantity'],
  table: ['table', 'tierTable', 'formula', 'conditions'],
  formula: ['formula']
};
// Thành phần của khung lương để Cài đặt gom mục: 1 đến 8 là tám thành phần, còn lại là trang riêng
const COMPONENT_IDS = ['1', '2', '3', '4', '5', '6', '7', '8', 'process', 'position', 'template'];
const TABLE_KINDS = ['matrix', 'list', 'tiers'];
const CELL_COMPONENTS = [
  ...Params.UI_COMPONENTS.filter(c => !['table', 'tierTable', 'formula', 'conditions', 'fixed'].includes(c))
];

function validKey(key?) {
  if (key.length > MAX_KEY_LENGTH || key.split('.').length > MAX_SEGMENTS) return false;
  const segments = key.split('.');
  // placeholder <x> hợp lệ; họ request.type.<code> cho phép gạch dưới ở đoạn mã
  return segments.every((seg, i) => {
    if (/^<[a-zA-Z]+>$/.test(seg)) return true;
    if (segments[0] === 'request' && segments[1] === 'type' && i === 2) return FAMILY_SEGMENT_RE.test(seg);
    return /^[a-z][a-zA-Z0-9]*$/.test(seg) || /^[0-9]+$/.test(seg);
  });
}

function checkTable(entry?, table?, where?) {
  if (!table || typeof table !== 'object') return fail(`${where}: thiếu lược đồ bảng`);
  if (!TABLE_KINDS.includes(table.kind)) fail(`${where}: kind bảng lạ "${table.kind}"`);
  if (typeof table.keyTemplate !== 'string' || !table.keyTemplate) fail(`${where}: thiếu keyTemplate`);
  if (!Array.isArray(table.columns) || (!table.columns.length && !entry.ui.planned))
    fail(`${where}: bảng không có cột`);
  const columnKeys = new Set<any>();
  for (const col of table.columns || []) {
    if (!col.key || !col.label) fail(`${where}: cột thiếu key hoặc label`);
    if (columnKeys.has(col.key)) fail(`${where}: cột trùng "${col.key}"`);
    columnKeys.add(col.key);
    if (!CELL_COMPONENTS.includes(col.component))
      fail(`${where}: cột ${col.key} có thành phần không hợp lệ "${col.component}"`);
    if (col.unit && !Params.UNITS.includes(col.unit)) fail(`${where}: cột ${col.key} đơn vị lạ "${col.unit}"`);
    if (col.min !== undefined && col.max !== undefined && col.min > col.max) fail(`${where}: cột ${col.key} min > max`);
    if (col.component === 'choice' && (!Array.isArray(col.options) || !col.options.length))
      fail(`${where}: cột ${col.key} chọn mà không có phương án`);
    for (const o of col.options || [])
      if (!o || typeof o !== 'object' || o.value === undefined || !o.label || typeof o.available !== 'boolean')
        fail(`${where}: cột ${col.key} có phương án không đủ {value, label, available}`);
  }
  const placeholders = [...(table.keyTemplate || '').matchAll(/<([a-zA-Z]+)>/g)]
    .map(m => m[1])
    .filter(n => n !== 'column');
  const rowKeys = (table.rowKeys || []).map(r => r.key);
  for (const name of placeholders)
    if (!rowKeys.includes(name)) fail(`${where}: keyTemplate dùng <${name}> mà rowKeys không khai báo`);
  for (const rk of table.rowKeys || []) {
    if (!rk.key || !rk.label) fail(`${where}: rowKey thiếu key hoặc label`);
    if (!rk.dynamic && !(Array.isArray(rk.values) && rk.values.length))
      fail(`${where}: rowKey ${rk.key} cần values hoặc dynamic`);
  }
  if (table.kind === 'matrix' && !(table.keyTemplate || '').includes('<column>') && table.columns.length !== 1)
    fail(`${where}: bảng matrix nhiều cột cần <column> trong keyTemplate`);
  if (table.kind === 'tiers' && !(table.columns || []).some(c => c.key)) fail(`${where}: bảng bậc cần cột`);
}

function checkRegistry() {
  const ids = new Set<any>();
  const groupIds = new Set<any>(registry.GROUPS.map(g => g.id));
  for (const g of registry.GROUPS)
    if (Object.hasOwn(g, 'advanced') && typeof g.advanced !== 'boolean')
      fail(`registry nhóm ${g.id}: cờ advanced phải là true hoặc false`);
  for (const entry of registry.entries) {
    const where = `registry ${entry.id}`;
    if (ids.has(entry.id)) fail(`${where}: id trùng`);
    ids.add(entry.id);
    if (!registry.CLASSES.includes(entry.class)) fail(`${where}: loại lạ "${entry.class}"`);
    if (!registry.EDITABLE_BY.includes(entry.editableBy)) fail(`${where}: editableBy lạ "${entry.editableBy}"`);
    if (!groupIds.has(entry.group)) fail(`${where}: nhóm lạ ${entry.group}`);
    if (!entry.label || !String(entry.label).trim()) fail(`${where}: thiếu nhãn`);
    if (!COMPONENT_IDS.includes(entry.component))
      fail(`${where}: thiếu thành phần của khung (component: ${COMPONENT_IDS.join(', ')})`);
    if (!/^[a-zA-Z][a-zA-Z0-9<>._-]*$/.test(entry.id)) fail(`${where}: id không hợp lệ`);
    for (const key of entry.keys || [])
      if (!validKey(key)) fail(`${where}: khoá "${key}" sai quy tắc đặt khoá (doc mục 24.1)`);
    if (entry.class === 'fixed' || entry.class === 'removed') {
      if (entry.editableBy !== 'locked') fail(`${where}: mục ${entry.class} phải là locked`);
      if (entry.class === 'fixed' && !entry.lockReason && !entry.basis) fail(`${where}: mục cố định cần lý do khoá`);
    }
    // Công thức gõ chữ bị khoá: loại formula được locked nếu có lý do khoá
    if (entry.editableBy === 'locked' && entry.class === 'formula' && !entry.lockReason)
      fail(`${where}: công thức khoá cần lý do khoá`);
    else if (entry.editableBy === 'locked' && !['fixed', 'removed', 'formula'].includes(entry.class))
      fail(`${where}: locked mà không là loại cố định`);
    if (entry.valueType && !Params.VALUE_TYPES.includes(entry.valueType))
      fail(`${where}: valueType lạ "${entry.valueType}"`);
    if (entry.unit && !Params.UNITS.includes(entry.unit)) fail(`${where}: đơn vị lạ "${entry.unit}"`);
    if (entry.legal && !registry.LEGAL_TIERS.includes(entry.legal.tier))
      fail(`${where}: tầng căn cứ lạ "${entry.legal.tier}"`);
    // thành phần giao diện
    const ui = entry.ui;
    if (!ui || !Params.UI_COMPONENTS.includes(ui.component)) {
      fail(`${where}: thiếu thành phần giao diện hợp lệ (ui.component)`);
      continue;
    }
    if (!COMPONENTS_BY_CLASS[entry.class].includes(ui.component))
      fail(`${where}: loại ${entry.class} không dùng thành phần ${ui.component}`);
    if (ui.component === 'money' && entry.unit !== 'vnd') fail(`${where}: money cần unit vnd`);
    if (ui.component === 'percent' && !['ratio', 'percentPoints'].includes(entry.unit))
      fail(`${where}: percent cần unit ratio hoặc percentPoints`);
    if (ui.component === 'quantity' && ['vnd', 'ratio', 'percentPoints'].includes(entry.unit))
      fail(`${where}: quantity không dùng unit ${entry.unit}`);
    if (ui.component === 'table' && !ui.display && !ui.alias) checkTable(entry, ui.table, where);
    if (ui.component === 'tierTable') {
      checkTable(entry, ui.table, where);
      if (ui.table && ui.table.kind !== 'tiers') fail(`${where}: tierTable cần kind tiers`);
    }
    if (ui.component === 'fixed' && ui.display) checkTable(entry, ui.display, where + ' (display)');
    if (ui.component === 'quantity' && entry.valueBearing && !entry.unit) fail(`${where}: quantity cần đơn vị`);
    if (entry.class === 'number') {
      if (entry.min !== undefined && entry.max !== undefined && entry.min > entry.max) fail(`${where}: min > max`);
      if (!entry.valueType) fail(`${where}: thiếu valueType`);
    }
    if (entry.backing && (!entry.backingSection || !entry.backingSectionLabel))
      fail(`${where}: mục có backing ${entry.backing} cần backingSection và backingSectionLabel`);
    if (!entry.backing && entry.backingSection) fail(`${where}: backingSection mà không có backing`);
    for (const c of entry.crossChecks || []) {
      if (c.kind !== 'sum') fail(`${where}: kiểm chéo lạ "${c.kind}"`);
      if (!c.message || !Array.isArray(c.keys) || !c.keys.length) fail(`${where}: kiểm chéo thiếu message hoặc keys`);
      for (const k of c.keys || [])
        if (!(k in Params.DEFAULTS) || registry.entryFor(k)?.entry !== entry)
          fail(`${where}: kiểm chéo dùng khoá ${k} không thuộc mục`);
      if (!(c.equalsKey in Params.DEFAULTS))
        fail(`${where}: kiểm chéo equalsKey ${c.equalsKey} không có trong DEFAULTS`);
    }
    if (entry.class === 'choice') {
      const options = entry.options || [];
      if (!options.length) fail(`${where}: mục chọn không có phương án`);
      if (new Set<any>(options.map(o => o.value)).size !== options.length) fail(`${where}: phương án trùng giá trị`);
      if (options.filter(o => o.isDefault).length !== 1) fail(`${where}: cần đúng một phương án mặc định`);
      if (!options.some(o => o.isDefault && o.available)) fail(`${where}: phương án mặc định phải available`);
      for (const o of options) if (!o.label) fail(`${where}: phương án ${o.value} thiếu nhãn`);
      for (const o of options)
        if (typeof o.available !== 'boolean') fail(`${where}: phương án ${o.value} thiếu available true hoặc false`);
      for (const o of options)
        if (!o.available && !o.phase && !o.note)
          fail(`${where}: phương án ${o.value} chưa dùng được mà không ghi phase hoặc note`);
      if (ui.component === 'toggle' && options.length !== 2) fail(`${where}: toggle cần đúng hai phương án`);
    }
  }
}

// Chữ Admin nhìn thấy (nhãn, help, căn cứ, lý do khoá, ghi chú sàn trần, ghi chú phương án, mặc định của app, đề xuất) phải là lời của người làm C&B:
// không tên tệp, tên hàm, tên tài liệu, mã câu hỏi, tên giai đoạn, "[chưa có]". Ghi chú cho lập trình viên nằm ở devNote, phase, cost (API không gửi).
const DEV_TEXT =
  /\.js\b|\.md\b|\.html\b|→|\[chưa có\]|THAO-LUAN|LUAT-DU-AN|\bADR\b|V1-[AB]\b|\bQ-|\bn\/a\b|\b[A-Z]{2,}_[A-Z_]{3,}\b|\b[DQK]\d+\b|\bTL#\d+/;
function checkPlainText() {
  const bad = (id?, field?, value?) => {
    if (typeof value === 'string' && DEV_TEXT.test(value))
      fail(
        `registry ${id}: ${field} còn chữ của lập trình viên (${DEV_TEXT.exec(value)![0]}): sửa trong scripts/params/plain-text.json`
      );
  };
  for (const e of registry.entries) {
    bad(e.id, 'label', e.label);
    bad(e.id, 'help', e.help);
    bad(e.id, 'basis', e.basis);
    bad(e.id, 'lockReason', e.lockReason);
    bad(e.id, 'defaultNote', e.defaultNote);
    if (e.ui) bad(e.id, 'ui.help', e.ui.help);
    if (e.ui && e.ui.table) bad(e.id, 'rowRules', e.ui.table.rowRules);
    if (e.legal) {
      bad(e.id, 'legal.basis', e.legal.basis);
      for (const side of ['floor', 'ceiling'])
        if (e.legal[side]) bad(e.id, 'legal.' + side + '.note', e.legal[side].note);
    }
    for (const o of e.options || []) bad(e.id, 'phương án ' + o.value, o.note);
    if (e.firstRun) {
      bad(e.id, 'firstRun.recommended', e.firstRun.recommended);
      bad(e.id, 'firstRun.why', e.firstRun.why);
    }
    if (e.help === undefined || e.basis === undefined || !String(e.basis).trim() || !String(e.help).trim())
      fail(`registry ${e.id}: thiếu help hoặc basis`);
  }
}

function checkDefaults() {
  const keys = Object.keys(Params.DEFAULTS);
  for (const key of keys) {
    const hit = registry.entryFor(key);
    if (!hit) {
      fail(`DEFAULTS ${key}: không có mục registry nào khớp`);
      continue;
    }
    const entry = hit.entry;
    const value = Params.DEFAULTS[key];
    // giá trị mặc định qua chính bộ kiểm cấu trúc của nó (null chỉ khi mục cho phép trống)
    if (entry.class === 'fixed' || entry.class === 'removed') continue;
    const checked = validateValue(key, value, { structureOnly: true, params: Params.DEFAULTS });
    if (!checked.ok && !(value === null && entry.nullable))
      fail(`DEFAULTS ${key} = ${JSON.stringify(value)} không qua bộ kiểm của mục ${entry.id}: ${checked.message}`);
    // Mục dạng họ khoá (ai.rule.<id>.enabled) có mặc định RIÊNG từng khoá trong DEFAULTS (luật 'Khai sau hạn' tắt mặc định): không so với phương án mặc định chung
    if (entry.class === 'choice' && !entry.perType && !entry.id.includes('<id>')) {
      const def = entry.options.find(o => o.isDefault);
      if (def && def.value !== value)
        fail(
          `DEFAULTS ${key} = ${JSON.stringify(value)} khác phương án mặc định ${JSON.stringify(def.value)} của registry`
        );
    }
  }
  for (const entry of registry.entries)
    if (entry.valueBearing && entry.class !== 'removed' && entry.keys.length && !registry.keysOf(entry).length)
      fail(`registry ${entry.id}: mục mang giá trị mà DEFAULTS không có khoá nào (${entry.keys.join(', ')})`);
  // sàn, trần luật tham chiếu khoá có thật
  for (const entry of registry.entries)
    for (const side of ['floor', 'ceiling']) {
      const l = entry.legal && entry.legal[side];
      if (!l) continue;
      const ref = l.key === 'law.regionMinWage' ? 'law.regionMinWage.1' : l.key;
      if (!(ref in Params.DEFAULTS)) fail(`registry ${entry.id}: ${side}.key ${l.key} không có trong DEFAULTS`);
      if (l.minus && !(l.minus in Params.DEFAULTS))
        fail(`registry ${entry.id}: ${side}.minus ${l.minus} không có trong DEFAULTS`);
    }
  // maxKey của mục số
  for (const entry of registry.entries)
    if (entry.maxKey && !(entry.maxKey in Params.DEFAULTS))
      fail(`registry ${entry.id}: maxKey ${entry.maxKey} không có trong DEFAULTS`);
}

// Đối chiếu với khối công thức cũ đã đóng băng (test/fixtures/legacy-payroll-block.js):
// DEFAULTS phải còn bằng số của khối đó (TYPES, TAX_RULES, ca cố định). KHÔNG đọc src/engine/index.html.
function legacyBlock() {
  const context = vm.createContext({});
  for (const lib of ['payroll-calendar', 'kpi-score'])
    vm.runInContext(readAsJs(path.join(ROOT, `src/engine/${lib}.ts`)), context, {
      filename: lib + '.ts'
    });
  const block = fs.readFileSync(path.join(ROOT, 'test/fixtures/legacy-payroll-block.js'), 'utf8');
  vm.runInContext(
    `${block}
this.__out = { TYPES, TAX_RULES, PRESETS };`,
    context,
    { timeout: 2000 }
  );
  return JSON.parse(
    JSON.stringify(context.__out, (k, v) => (v === Infinity ? '__Infinity__' : v)),
    (k, v) => (v === '__Infinity__' ? Infinity : v)
  );
}
function checkAgainstCode() {
  const { ApprovalItems, Punch } = sources();
  const out = legacyBlock();
  const set = Params.DEFAULTS;
  const classes = Params.buildParamClasses(set);
  const tax = out.TAX_RULES;
  const same = (a?, b?, what?) =>
    Params.canonical(a) !== Params.canonical(b) && fail(`${what}: ${JSON.stringify(a)} khác mã ${JSON.stringify(b)}`); // so theo nội dung, không theo thứ tự khoá
  same(
    classes.derived.insuranceCap,
    tax.insuranceCap,
    'trần đóng BH dẫn xuất (law.luongCoSo, law.regionMinWage × capMultiple)'
  );
  same(classes.derived.holidayNightAdd, tax.holidayNightAdd, 'miễn thuế giờ đêm ngày lễ dẫn xuất');
  // SHIFT dựng từ khoá shift.preset.<mã>, thứ tự mã không có nghĩa: so theo mã đã sắp xếp
  const byCode = (o?) =>
    Object.fromEntries(Object.entries<any>(o).sort(([x]: any, [y]: any) => (x < y ? -1 : x > y ? 1 : 0)));
  same(
    byCode(Object.fromEntries(Object.entries<any>(out.PRESETS).map(([c, p]: any) => [c, [p.in, p.out]]))),
    byCode(Punch.SHIFT),
    'ca cố định: khối cũ đóng băng PRESETS so với src/engine/punch.ts SHIFT'
  );
  const ApprovalView = require(path.join(ROOT, 'src/engine/approval-view'));
  for (const t of Object.keys(out.TYPES))
    same(
      set[`type.${t}.dows`],
      ApprovalView.SCHEDULE[t],
      `lịch làm việc ${t}: khối cũ đóng băng TYPES so với ApprovalView.SCHEDULE`
    );
  const table = registry.byId('request.type.<code>').ui.table.rowKeys[0].values.map(v => v.value);
  same([...table].sort(), ApprovalItemsSorted(ApprovalItems), 'loại yêu cầu của registry so với ApprovalView.ITEMS');
  same(
    set['time.workHoursPerDay'] * set['unit.minutesPerHour'],
    require(path.join(ROOT, 'src/engine/actual-hours')).RULE.SHIFT_WORK_MIN,
    'SHIFT_WORK_MIN = giờ mỗi công × phút mỗi giờ'
  );
}
const ApprovalItemsSorted = (items?) => [...items].sort();

// Bộ máy dùng chung: từ vựng bắt buộc có đủ trong ba bảng dữ liệu, mọi biến có đường dẫn `from`, mã không có hằng số ngoài 0 và 1
function checkEngine() {
  const Engine = require(path.join(ROOT, 'src/engine/payroll-engine'));
  const { scan } = require('./scan-magic-numbers');
  for (const key of Engine.VOCABULARY_KEYS)
    if (![Engine.VARIABLES, Engine.FORMULAS, Engine.BUILTINS].some(table => Object.hasOwn(table, key)))
      fail(`payroll-engine: khoá từ vựng ${key} không có trong VARIABLES, FORMULAS hay BUILTINS`);
  for (const [name, table] of Object.entries<any>({
    VARIABLES: Engine.VARIABLES,
    FORMULAS: Engine.FORMULAS,
    BUILTINS: Engine.BUILTINS
  }))
    for (const [key, entry] of Object.entries<any>(table)) {
      if (entry.key !== key) fail(`payroll-engine ${name}.${key}: trường key khác khoá`);
      if (!entry.label || !entry.unit || !entry.domain)
        fail(`payroll-engine ${name}.${key}: thiếu nhãn, đơn vị hoặc miền`);
      if (name !== 'BUILTINS' && !entry.from) fail(`payroll-engine ${name}.${key}: thiếu đường dẫn from`);
      if (name === 'BUILTINS' && typeof entry.fn !== 'function') fail(`payroll-engine BUILTINS.${key}: thiếu fn`);
    }
  const found = scan(fs.readFileSync(path.join(ROOT, 'src/engine/payroll-engine.ts'), 'utf8'));
  for (const hit of found)
    fail(`src/engine/payroll-engine.ts dòng ${hit.line}: hằng số ${hit.value} ngoài 0 và 1 (${hit.text})`);
}

// Cờ wired của registry phải bằng kết quả kiểm tĩnh ở scripts/params/wired.ts (bộ máy đọc khoá và không còn bản sao hằng số). Lệch là lỗi:
// hoặc một mô-đun vừa chuyển sang đọc params (chạy `node scripts/params/wired.ts --write` để mở khoá cho Lưu), hoặc vừa có bản sao hằng số mới.
function checkWired() {
  const { derive } = require('./wired');
  const derived = derive();
  for (const entry of registry.entries) {
    const want = derived.get(entry.id);
    if (!want) continue;
    const have = entry.wired === undefined ? null : entry.wired;
    if (have !== want.wired)
      fail(
        `registry ${entry.id}: wired = ${have} nhưng kiểm tĩnh ra ${want.wired} (${want.reason}); chạy node scripts/params/wired.ts --write`
      );
    else if (JSON.stringify(entry.unwiredKeys || null) !== JSON.stringify(want.unwiredKeys || null))
      fail(`registry ${entry.id}: unwiredKeys lệch kiểm tĩnh; chạy node scripts/params/wired.ts --write`);
  }
}

// Bản chép chuyển tiếp FALLBACK của sáu mô-đun luật dùng chung và của mã máy chủ (src/platform/auth.ts…) phải bằng DEFAULTS từng khoá (scripts/params/check-fallbacks.ts)
function checkFallbacks() {
  const { problems, libProblems } = require('./check-fallbacks');
  for (const line of [...problems(), ...libProblems().problems]) fail(line);
}

function checkLock() {
  const lockPath = path.join(ROOT, 'src/params/keys.lock.json');
  if (!fs.existsSync(lockPath)) return fail('thiếu src/params/keys.lock.json: chạy npm run params:lock');
  const lock = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
  const current = new Set<any>(lockedNames());
  for (const name of Object.keys(lock.keys))
    if (!current.has(name)) {
      const deprecated = registry.entries.some(e => e.deprecated && ((e.keys || []).includes(name) || e.id === name));
      if (!deprecated)
        fail(`khoá đã phát hành "${name}" bị đổi tên hoặc mất khỏi registry (muốn bỏ thì đặt deprecated: true)`);
    }
  for (const name of current)
    if (!(name in lock.keys)) fail(`khoá mới "${name}" chưa vào keys.lock.json: chạy npm run params:lock`);
}
// Tên được khoá: mẫu khoá của mục (họ khoá khoá theo mẫu); mục không có khoá (mục cố định) khoá theo id
function lockedNames() {
  const names = new Set<any>([
    ...require(path.join(ROOT, 'src/params/positions.ts')).LOCKED_NAMES,
    ...require(path.join(ROOT, 'src/params/block-defs.ts')).LOCKED_NAMES
  ]); // họ khoá động của chức vụ (không có mục registry riêng)
  for (const entry of registry.entries) {
    if (entry.keys && entry.keys.length) for (const key of entry.keys) names.add(key);
    else names.add(entry.id);
  }
  return [...names].sort();
}

function counts() {
  const by = (list?, f?) => list.reduce((m, e) => ((m[f(e)] = (m[f(e)] || 0) + 1), m), {} as Record<string, any>);
  const rows = registry.entries.filter(e => e.section >= 4 && e.section <= 16);
  console.log('Mục registry:', registry.entries.length, '· hàng bảng 4 đến 16 của danh mục:', rows.length);
  console.log('Theo loại (hàng 4 đến 16):', JSON.stringify(by(rows, e => e.class)));
  console.log(
    'Theo editableBy (hàng 4 đến 16, không tính "bỏ"):',
    JSON.stringify(
      by(
        rows.filter(e => e.class !== 'removed'),
        e => e.editableBy
      )
    )
  );
  console.log('Theo loại (toàn registry):', JSON.stringify(by(registry.entries, e => e.class)));
  console.log(
    'Theo editableBy (toàn registry, không tính "bỏ"):',
    JSON.stringify(
      by(
        registry.entries.filter(e => e.class !== 'removed'),
        e => e.editableBy
      )
    )
  );
  console.log('Khoá trong DEFAULTS:', Object.keys(Params.DEFAULTS).length);
  console.log('Theo thành phần giao diện:', JSON.stringify(by(registry.entries, e => e.ui.component)));
}

function main(argv?) {
  if (argv.includes('--counts')) return counts();
  try {
    const text = (v?) =>
      JSON.stringify(
        Object.fromEntries(
          Object.keys(v)
            .sort()
            .map(k => [k, v[k]])
        ),
        (k, x) => (x === Infinity ? null : x)
      );
    if (text(extract().values) !== text(Params.DEFAULTS))
      fail('src/engine/payroll-params.ts → DEFAULTS không khớp mã hiện tại: chạy npm run params:extract');
  } catch (error) {
    fail(error.message);
  }
  checkRegistry();
  checkPlainText();
  checkDefaults();
  try {
    checkAgainstCode();
  } catch (error) {
    fail(error.message);
  }
  try {
    checkEngine();
  } catch (error) {
    fail(error.message);
  }
  checkWired();
  checkFallbacks();
  checkLock();
  if (errors.length) {
    console.error(`params:check: ${errors.length} lỗi\n` + errors.map(e => ' - ' + e).join('\n'));
    process.exit(1);
  }
  console.log(
    `params:check đạt: ${registry.entries.length} mục registry, ${Object.keys(Params.DEFAULTS).length} khoá mặc định, ${lockedNames().length} tên khoá đã khoá`
  );
}

module.exports = { lockedNames };
if (require.main === module) main(process.argv.slice(2));

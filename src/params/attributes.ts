'use strict';
// Thuộc tính mở rộng của lớp: Admin thêm một "cột" vào mọi hàng của bảng bậc lương (Level) mà không sửa mã.
//   - Định nghĩa  `class.level.attr.<mã>` = { label, component: money|percent|quantity|toggle|text, unit, min?, max?, default?, deprecated? }
//   - Giá trị     `level.<loại>.<bậc>.attr.<mã>` (một dòng param_versions mỗi ô, có tháng áp dụng, lý do, nhật ký, xem trước như mọi tham số)
//   - Cùng MỘT đường ghi PUT /api/settings/params: định nghĩa và giá trị của nó đi chung một lô (định nghĩa kiểm trước, giá trị kiểm theo định nghĩa của lô).
// Thuộc tính tiền của bậc được `insurance.baseAttr` (phương án insuranceAttr của nền bảo hiểm) trỏ tới; ngoài ra một thuộc tính KHÔNG đổi tiền.
// Không có công thức người gõ, nên thuộc tính không có biến công thức. Khoá của họ này không có trong DEFAULTS (chưa định nghĩa thì không có
// gì), nên không có thuộc tính nào thì bộ tham số, băm và tiền không đổi.
// Chốt chặn: mã đúng khuôn và không trùng cột có sẵn; số thuộc tính mỗi lớp có trần (system.attr.maxPerClass); không đổi kiểu hay đơn vị sau khi tạo
// (409 ATTR_TYPE_LOCKED); không xoá, chỉ ngưng dùng (deprecated); hạ khoảng min/max chỉ khi mọi giá trị hiện có còn hợp lệ.
const Params = require('../engine/payroll-params');
const Formula = require('../engine/formula');
const registry = require('./registry');

const DEF_RE = /^class\.level\.attr\.(.+)$/;
const ROW_RE = /^level\.([a-z0-9]+)\.([0-9]+)\.attr\.(.+)$/;
const DEF_FIELDS = Object.freeze(['label', 'component', 'unit', 'min', 'max', 'default', 'deprecated']);
const LEVEL_TABLE_ID = 'level.<type>.<level>';
const TEXT_MAX_CHARS = Formula.LIMITS.maxTextChars; // chữ của một ô hoặc mặc định kiểu text (không dùng trong phép tính)
const UNIT_NAME = { hour: 'giờ', day: 'ngày', minute: 'phút', times: 'lần', month: 'tháng', count: '' };
const STATUS_OF = { ATTR_TYPE_LOCKED: 409 };

const fail = (code?, message?, key?) => ({
  ok: false,
  code,
  message,
  key,
  ...(STATUS_OF[code] ? { httpStatus: STATUS_OF[code] } : {})
});
const isNum = (v?) => typeof v === 'number' && Number.isFinite(v);

/* ---------- nhận diện khoá ---------- */
// { kind: 'def', code } | { kind: 'row', type, level, code } | null. code có thể sai khuôn: validate báo ATTR_BAD_CODE.
function classify(key?) {
  if (typeof key !== 'string') return null;
  let m = DEF_RE.exec(key);
  if (m) return { kind: 'def', code: m[1] };
  m = ROW_RE.exec(key);
  if (m) return { kind: 'row', type: m[1], level: Number(m[2]), code: m[3] };
  return null;
}

/* ---------- hiển thị số trong thông báo ---------- */
const group = (n?) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
function show(def?, value?) {
  if (def.component === 'money') return `${group(value)} ₫`;
  if (def.component === 'percent')
    return `${String(Math.round(value * Params.DEFAULTS['unit.percent'] * 100) / 100).replace('.', ',')} %`;
  const unit = UNIT_NAME[def.unit] || '';
  return unit ? `${value} ${unit}` : String(value);
}
const labelOf = (def?) => def.label || def.code;

/* ---------- kiểm định nghĩa ---------- */
// ctx: { params, structureOnly }. Trả { ok:true, value } (giá trị chuẩn hoá) hoặc { ok:false, code, message, key }
function validateDef(code?, value?, ctx: any = {}) {
  const key = Params.ATTR_DEF_PREFIX + code;
  if (!Params.ATTR_CODE_RE.test(code))
    return fail(
      'ATTR_BAD_CODE',
      'Mã thuộc tính chỉ gồm chữ không dấu và số, bắt đầu bằng chữ thường, viết liền, tối đa 32 ký tự (ví dụ luongDongBh)',
      key
    );
  if (value === null)
    return fail('ATTR_NO_DELETE', 'Thuộc tính không xoá được; hãy ngưng dùng (deprecated: true)', key);
  if (!value || typeof value !== 'object' || Array.isArray(value))
    return fail('PARAM_INVALID_VALUE', 'Định nghĩa thuộc tính cần dạng { label, component, unit, … }', key);
  for (const field of Object.keys(value))
    if (!DEF_FIELDS.includes(field))
      return fail('PARAM_INVALID_VALUE', `Định nghĩa thuộc tính có trường lạ "${field.slice(0, 40)}"`, key);
  const label = typeof value.label === 'string' ? value.label.trim() : '';
  if (!label || label.length > Formula.LIMITS.maxNameChars)
    return fail('PARAM_INVALID_VALUE', `Tên thuộc tính phải từ 1 đến ${Formula.LIMITS.maxNameChars} ký tự`, key);
  const component = value.component;
  if (!Params.ATTR_COMPONENTS.includes(component))
    return fail('PARAM_INVALID_VALUE', `Kiểu giá trị phải là một trong: ${Params.ATTR_COMPONENTS.join(', ')}`, key);
  const wantUnit = component === 'money' ? 'vnd' : component === 'percent' ? 'ratio' : null;
  let unit = value.unit === undefined ? null : value.unit;
  if (component === 'quantity') {
    if (unit === null) unit = 'count';
    if (!Params.ATTR_QUANTITY_UNITS.includes(unit))
      return fail(
        'PARAM_INVALID_VALUE',
        `Đơn vị của kiểu số phải là một trong: ${Params.ATTR_QUANTITY_UNITS.join(', ')}`,
        key
      );
  } else if (unit !== wantUnit) {
    return fail(
      'PARAM_INVALID_VALUE',
      `Kiểu ${component} dùng đơn vị ${wantUnit === null ? 'không có' : wantUnit}`,
      key
    );
  }
  const def: Record<string, any> = { label, component, unit };
  const numeric = ['money', 'percent', 'quantity'].includes(component);
  for (const field of ['min', 'max', 'default']) {
    const v = value[field];
    if (v === undefined || v === null) continue;
    if (component === 'toggle' && field === 'default') {
      if (typeof v !== 'boolean')
        return fail('PARAM_INVALID_VALUE', 'Mặc định của kiểu Có/Không phải là true hoặc false', key);
      def.default = v;
    } else if (component === 'text' && field === 'default') {
      if (typeof v !== 'string' || v.length > TEXT_MAX_CHARS)
        return fail('PARAM_INVALID_VALUE', `Mặc định của kiểu chữ tối đa ${TEXT_MAX_CHARS} ký tự`, key);
      def.default = v;
    } else if (!numeric || !isNum(v) || (component === 'money' && !Number.isSafeInteger(v))) {
      return fail(
        'PARAM_INVALID_VALUE',
        `${field === 'default' ? 'Mặc định' : field === 'min' ? 'Nhỏ nhất' : 'Lớn nhất'} không hợp lệ cho kiểu ${component}`,
        key
      );
    } else def[field] = v;
  }
  // khoảng: tiền không âm, phần trăm (tỷ lệ) từ 0 đến 1 nếu không nêu khác
  const lo = def.min !== undefined ? def.min : component === 'quantity' ? -Infinity : 0;
  const hi = def.max !== undefined ? def.max : component === 'percent' ? 1 : Infinity;
  if (numeric) {
    if (lo > hi) return fail('PARAM_INVALID_VALUE', 'Nhỏ nhất không được lớn hơn lớn nhất', key);
    if (component === 'percent' && (def.min < 0 || def.max > 1))
      return fail('PARAM_INVALID_VALUE', 'Phần trăm lưu dạng tỷ lệ từ 0 đến 1 (0 % đến 100 %)', key);
    if (component === 'money' && def.min < 0) return fail('PARAM_INVALID_VALUE', 'Tiền không âm', key);
    if (def.default !== undefined && (def.default < lo || def.default > hi))
      return fail('PARAM_INVALID_VALUE', 'Mặc định nằm ngoài khoảng nhỏ nhất đến lớn nhất', key);
  }
  if (value.deprecated !== undefined && typeof value.deprecated !== 'boolean')
    return fail('PARAM_INVALID_VALUE', 'deprecated phải là true hoặc false', key);
  if (value.deprecated) def.deprecated = true;
  if (ctx.structureOnly) return { ok: true, value: def };

  /* chốt chặn: so với định nghĩa hiện có, cột có sẵn, công thức đang dùng */
  const columns = ((registry.byId(LEVEL_TABLE_ID) || {}).ui || {}).table;
  const builtin = ((columns && columns.columns) || []).map(c => c.key);
  if (builtin.includes(code) || ['attr', 'def', 'class'].includes(code))
    return fail('ATTR_CODE_RESERVED', `Mã "${code}" trùng một cột có sẵn của bảng bậc lương; chọn mã khác`, key);
  const params = ctx.params || {};
  const existing = params[key];
  if (existing && typeof existing === 'object') {
    if (existing.component !== def.component || (existing.unit ?? null) !== def.unit)
      return fail(
        'ATTR_TYPE_LOCKED',
        'Không đổi kiểu hoặc đơn vị của thuộc tính đã tạo; hãy ngưng dùng và tạo thuộc tính mới (mã mới)',
        key
      );
    const narrowed =
      (def.min !== undefined && def.min !== existing.min) || (def.max !== undefined && def.max !== existing.max);
    if (narrowed)
      for (const [k, v] of Object.entries<any>(params))
        if (isNum(v) && k.endsWith(`.attr.${code}`) && ROW_RE.test(k) && (v < lo || v > hi))
          return fail(
            'PARAM_INVALID_VALUE',
            `Giá trị hiện có ở ${k} nằm ngoài khoảng mới; sửa giá trị trước khi hạ khoảng`,
            key
          );
  }
  return { ok: true, value: def };
}

/* ---------- kiểm giá trị một ô ---------- */
// ctx: { params, defs: Map<mã, định nghĩa của lô> (định nghĩa thêm trong cùng lô), structureOnly }
function validateRow(parts?, value?, ctx: any = {}) {
  const key = `level.${parts.type}.${parts.level}.attr.${parts.code}`;
  if (!Params.ATTR_CODE_RE.test(parts.code)) return fail('ATTR_BAD_CODE', 'Mã thuộc tính sai khuôn', key);
  if (ctx.structureOnly)
    return ['number', 'boolean', 'string'].includes(typeof value) && (typeof value !== 'number' || isNum(value))
      ? { ok: true, value }
      : fail('PARAM_INVALID_VALUE', 'Giá trị thuộc tính phải là số, Có/Không hoặc chữ', key);
  if (!Object.hasOwn(Params.DEFAULTS, `level.${parts.type}.${parts.level}.base`))
    return fail('PARAM_UNKNOWN_KEY', `Không có bậc ${parts.level} của loại ${parts.type}`, key);
  const def =
    (ctx.defs && ctx.defs.get(parts.code)) || Params.attributeDefs(ctx.params).find(d => d.code === parts.code);
  if (!def) return fail('ATTR_UNKNOWN', `Chưa có thuộc tính "${parts.code}"; thêm định nghĩa trong cùng lô lưu`, key);
  const who = `${labelOf(def)} (${registry.typeLabel(parts.type)}, bậc ${parts.level})`;
  const bad = (text?) => fail('PARAM_INVALID_VALUE', `${who} ${text}`, key);
  switch (def.component) {
    case 'money':
      if (!Number.isSafeInteger(value)) return bad('phải là số nguyên đồng');
      break;
    case 'percent':
    case 'quantity':
      if (!isNum(value)) return bad('phải là số');
      break;
    case 'toggle':
      if (typeof value !== 'boolean') return bad('phải là Có hoặc Không');
      return { ok: true, value };
    default:
      if (typeof value !== 'string' || value.length > TEXT_MAX_CHARS)
        return bad(`phải là chữ, tối đa ${TEXT_MAX_CHARS} ký tự`);
      return { ok: true, value };
  }
  const lo = def.min !== undefined ? def.min : def.component === 'money' || def.component === 'percent' ? 0 : -Infinity;
  const hi = def.max !== undefined ? def.max : def.component === 'percent' ? 1 : Infinity;
  if (value < lo) return bad(`không được nhỏ hơn ${show(def, lo)}`);
  if (value > hi) return bad(`không được lớn hơn ${show(def, hi)}`);
  return { ok: true, value };
}

// Điểm vào cho validateValue: trả null nếu khoá không thuộc họ thuộc tính
function validate(key?, value?, ctx: any = {}) {
  const parts = classify(key);
  if (!parts) return null;
  const result = parts.kind === 'def' ? validateDef(parts.code, value, ctx) : validateRow(parts, value, ctx);
  return result.ok ? { ...result, warnings: [] } : result;
}

/* ---------- cột của bảng bậc lương ---------- */
const stepOf = (def?) => (def.component === 'percent' ? 0.01 : def.component === 'money' ? 1 : undefined);
function columnsFor(params?) {
  return Params.attributeDefs(params).map(def => ({
    key: `attr.${def.code}`,
    label: def.label,
    component: def.component,
    unit: def.unit,
    ...(def.min !== undefined ? { min: def.min } : {}),
    ...(def.max !== undefined ? { max: def.max } : {}),
    ...(stepOf(def) ? { step: stepOf(def) } : {}),
    attribute: {
      code: def.code,
      class: 'level',
      deprecated: !!def.deprecated,
      ...(def.default !== undefined ? { default: def.default } : {})
    }
  }));
}
// Quy tắc của một ô (cùng dạng rules.columns[...] của src/params/validate.ts → rulesOf) để giao diện kiểm trước
function cellRules(def?) {
  const type = { money: 'vnd', percent: 'number', quantity: 'number', toggle: 'bool', text: 'text' }[def.component];
  const lo = def.min !== undefined ? def.min : def.component === 'money' || def.component === 'percent' ? 0 : undefined;
  const hi = def.max !== undefined ? def.max : def.component === 'percent' ? 1 : undefined;
  const label = labelOf(def);
  const messages: Record<string, any> = {
    type:
      type === 'vnd'
        ? `${label} phải là số nguyên đồng`
        : type === 'number'
          ? `${label} phải là số`
          : type === 'bool'
            ? `${label} phải là Có hoặc Không`
            : `${label} phải là chữ`,
    required: `${label} không được để trống`
  };
  if (lo !== undefined) messages.min = `${label} không được nhỏ hơn ${show(def, lo)}`;
  if (hi !== undefined) messages.max = `${label} không được lớn hơn ${show(def, hi)}`;
  return {
    key: `level.<type>.<level>.attr.${def.code}`,
    type,
    unit: def.unit,
    nullable: false,
    ...(lo !== undefined ? { min: lo } : {}),
    ...(hi !== undefined ? { max: hi } : {}),
    ...(stepOf(def) ? { step: stepOf(def) } : {}),
    messages,
    editable: true
  };
}

// Thêm cột thuộc tính vào mục bảng bậc lương của view (item.ui, item.value, item.default, item.rules); không đổi registry (đối tượng đóng băng)
function extendLevelTable(item?, set?) {
  const defs = Params.attributeDefs(set);
  item.attributes = defs.map(d => ({
    code: d.code,
    label: d.label,
    component: d.component,
    unit: d.unit,
    deprecated: !!d.deprecated
  }));
  if (!defs.length) return item;
  const columns = columnsFor(set);
  item.ui = { ...item.ui, table: { ...item.ui.table, columns: [...item.ui.table.columns, ...columns] } };
  const fill = (rows?, valueOf?) =>
    rows.map(row => {
      const next = { ...row, keys: { ...row.keys } };
      for (const def of defs) {
        next[`attr.${def.code}`] = valueOf(def, row);
        next.keys[`attr.${def.code}`] = `level.${row.type}.${row.level}.attr.${def.code}`;
      }
      return next;
    });
  item.value = fill(item.value, (def, row) => Params.attributeValue(set, def, row.type, row.level));
  item.default = fill(item.default, def => Params.attributeValue({}, def, '', 0));
  item.rules = { ...item.rules, columns: { ...((item.rules || {}).columns || {}) } };
  for (const def of defs) item.rules.columns[`attr.${def.code}`] = cellRules(def);
  return item;
}

export = {
  classify,
  validate,
  validateDef,
  validateRow,
  columnsFor,
  extendLevelTable,
  LEVEL_TABLE_ID
};

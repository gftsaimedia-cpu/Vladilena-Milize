'use strict';
// Bộ kiểm tra tham số: MỘT nơi sinh thông báo lỗi tiếng Việt (máy chủ là nguồn quyết định; giao diện hiện nguyên văn và có thể kiểm trước
// bằng `rules` mà GET /api/settings/params trả về, dựng từ chính các hàm ở đây). save.js dùng khi ghi,
// store.resolve dùng validateValue để bỏ qua dòng phiên bản hỏng, và test dùng cùng hàm.
// Ba tầng: (1) cấu trúc: kiểu, khoảng, tập phương án có `available`; (2) liên trường: crossChecks();
// (3) sàn và trần luật: `floor`/`ceiling` của mục, mức `hard` chặn, mức `warn` trả cảnh báo cần xác nhận.
const registry = require('./registry');
const Attributes = require('./attributes');
const Positions = require('./positions');
const BlockDefs = require('./block-defs');
const Formula = require('../engine/formula');
const PayrollGraph = require('../engine/payroll-graph');
const ApprovalView = require('../engine/approval-view');
const { DEFAULTS } = require('../engine/payroll-params');
const { warnIf } = require('../platform/warnings');

const LAW_NOTE =
  'Giá trị vẫn được lưu và bộ máy tính theo giá trị này; mức thấp hơn (hoặc cao hơn) quy định có thể trái luật, cần pháp chế hoặc kế toán xác nhận.';

// request.type.<loại>.pendingRule | rejectedRule: phương án theo từng loại lấy từ ApprovalView.ALLOWED_ACTIONS
const APPROVAL_RULE_KEY = /^request.type.([a-z_]+).(pendingRule|rejectedRule)$/;
const APPROVAL_ABSENT_KEY = /^request.type.([a-z_]+).countsAbsent$/;
const APPROVAL_ACTION_LABEL = { drop: 'Bỏ cả ngày', unpaid: 'Tính là nghỉ không lương', strip: 'Bỏ đoạn làm thêm' };

const UNIT_NAME = {
  vnd: '₫',
  ratio: '%',
  percentPoints: '%',
  minute: 'phút',
  hour: 'giờ',
  day: 'ngày',
  month: 'tháng',
  yearMonth: '',
  date: '',
  times: 'lần',
  meter: 'mét',
  degree: '°',
  bytes: 'byte',
  second: 'giây',
  millisecond: 'ms',
  count: ''
};
const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
const DATE_RE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const isRealDate = (text?) => {
  if (typeof text !== 'string' || !DATE_RE.test(text)) return false;
  const d = new Date(text + 'T00:00:00Z');
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === text;
};
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const isNum = (v?) => typeof v === 'number' && Number.isFinite(v);

/* ---------- hiển thị số theo tiếng Việt ---------- */
// Số không kèm đơn vị: 1234567 → "1.234.567"; tỷ lệ 0,075 → "7,5" (hiển thị %)
function num(unit?, value?) {
  const n = unit === 'ratio' ? Math.round(value * 1e4) / 1e2 : value;
  const [int, frac] = String(n).split('.');
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return frac ? `${grouped},${frac}` : grouped;
}
function fmt(unit?, value?) {
  if (value === null || value === undefined) return 'trống';
  if (typeof value === 'boolean') return value ? 'Có' : 'Không';
  if (!isNum(value)) return String(value);
  const name = UNIT_NAME[unit];
  return name ? `${num(unit, value)} ${name}` : num(unit, value);
}

/* ---------- tên đầy đủ của một khoá cụ thể ---------- */
function labelOf(entry?, key?, column?) {
  const hit = registry.entryFor(key);
  const params = hit && hit.entry === entry ? hit.params : {};
  const who = [params.type && registry.typeLabel(params.type), params.level && `bậc ${params.level}`]
    .filter(Boolean)
    .join(', ');
  const base = column && column.label ? column.label : entry.label;
  return who ? `${base} (${who})` : base;
}
// Căn cứ ngắn để đưa vào thông báo: tên văn bản và điều khoản đầu tiên tìm thấy ("BLLĐ Điều 98 khoản 1"), không thì đoạn đầu của căn cứ
const LAW_RE = /(BLLĐ|Nghị định|NĐ|Luật|Thông tư|Điều)\s[^;:,)]*/;
const citation = (basis?) => {
  const text = String(basis || '').replace(/`/g, '');
  const m = LAW_RE.exec(text);
  return (m ? m[0] : text.split(/[;:]/)[0]).trim();
};

/* ---------- quy tắc của một mục (giao diện kiểm trước bằng cái này) ---------- */
// Kiểu giá trị của một ô bảng theo thành phần của cột
const cellType = (column?) => {
  if (!column) return null;
  if (column.component === 'toggle') return 'bool';
  if (column.component === 'text') return 'text';
  if (column.component === 'time') return 'time';
  if (column.component === 'choice') return 'enum';
  if (column.component === 'money') return 'vnd';
  if (column.unit === 'hour' || column.unit === 'ratio' || column.unit === 'degree') return 'number';
  return 'int';
};
const columnOf = (entry?, key?) => {
  const table = entry.ui && entry.ui.table;
  if (!table || !table.columns || !table.columns.length) return null;
  const parts = key.split('.');
  return (
    table.columns.find(c => c.key === parts[parts.length - 1]) || (table.columns.length === 1 ? table.columns[0] : null)
  );
};
const paramOf = (params?, key?) => (params && Object.hasOwn(params, key) ? params[key] : undefined);

function boundText(unit?, min?, max?) {
  const tail = UNIT_NAME[unit] ? ` ${UNIT_NAME[unit]}` : '';
  if (min !== undefined && max !== undefined) return `từ ${num(unit, min)} đến ${num(unit, max)}${tail}`;
  if (min !== undefined) return `từ ${num(unit, min)}${tail} trở lên`;
  if (max !== undefined) return `không quá ${num(unit, max)}${tail}`;
  return '';
}

// Phương án của một mục hoặc một cột chọn: {value, label, available}; available luôn tường minh, phương án chưa dùng được kèm phase và note
function optionsOf(list?) {
  if (!list) return null;
  return list.map(o => {
    const available = o.available === true;
    return available
      ? { value: o.value, label: o.label, available }
      : { value: o.value, label: o.label, available, phase: o.phase || null, note: o.note || null };
  });
}
// rulesOf(entry, key, params, columnKey?): columnKey chọn một cột của bảng danh sách nguyên khối (bậc chuyên cần); bảng theo khoá phẳng suy cột từ khoá
function rulesOf(entry?, key?, params?, columnKey?) {
  const tableColumns = (entry.ui && entry.ui.table && entry.ui.table.columns) || [];
  const column = columnKey
    ? tableColumns.find(c => c.key === columnKey) || null
    : entry.valueType === 'table'
      ? columnOf(entry, key)
      : null;
  const spec = column ? { ...entry, ...column, ui: entry.ui } : entry;
  const unit = spec.unit || (entry.ui && entry.ui.unit) || null;
  const label = labelOf(entry, key, column);
  let min = spec.min,
    max = spec.max;
  if (entry.maxKey && paramOf(params, entry.maxKey) !== undefined) max = paramOf(params, entry.maxKey);
  const rules: Record<string, any> = {
    key,
    type: cellType(column) || entry.valueType,
    unit,
    nullable: !!(column ? column.nullable : entry.nullable)
  };
  if (min !== undefined) rules.min = min;
  if (max !== undefined) rules.max = max;
  if (spec.step !== undefined) rules.step = spec.step;
  const options = optionsOf((column && column.options) || entry.options);
  if (options) rules.options = options;
  // sàn, trần luật: giá trị lấy từ khoá law.floor.* / law.ceiling.* của bộ tham số hiện hành
  const legal = entry.legal;
  const legalFor = (side?) => {
    const l = legal && legal[side];
    if (!l || (l.column && column && l.column !== column.key) || (l.column && !column)) return null;
    let value =
      l.key === 'law.regionMinWage'
        ? paramOf(params, `law.regionMinWage.${paramOf(params, 'law.region')}`)
        : paramOf(params, l.key);
    if (value === undefined || value === null) return null;
    if (l.minus) value -= paramOf(params, l.minus);
    if (l.scale === 'percent') value = Math.round(value * paramOf(params, 'unit.percent'));
    return { value, severity: l.severity, tier: legal.tier, basis: legal.basis, note: l.note || null, each: !!l.each };
  };
  const floor = legalFor('floor'),
    ceiling = legalFor('ceiling');
  if (floor) rules.floor = floor;
  if (ceiling) rules.ceiling = ceiling;
  for (const side of ['warnBelow', 'warnAbove']) {
    const w = legal && legal[side];
    if (w) rules[side] = { value: w.key ? paramOf(params, w.key) : w.value };
  }
  // thông báo dựng sẵn: dùng đúng chữ này ở máy chủ và ở giao diện
  const messages: Record<string, any> = {};
  const range = boundText(unit, min, max);
  if (rules.type === 'int' || rules.type === 'vnd')
    messages.type = `${label} phải là số nguyên${range ? ' ' + range : ''}`;
  else if (rules.type === 'number') messages.type = `${label} phải là số${range ? ' ' + range : ''}`;
  else if (rules.type === 'bool') messages.type = `${label} phải là Có hoặc Không`;
  else if (rules.type === 'month') messages.type = `${label} phải là tháng dạng YYYY-MM`;
  else if (rules.type === 'date') messages.type = `${label} phải là ngày dạng YYYY-MM-DD`;
  else if (rules.type === 'text') messages.type = `${label} phải là chữ`;
  else if (rules.type === 'time') messages.type = `${label} phải là giờ dạng HH:MM (00:00 đến 23:59)`;
  else if (rules.type === 'enum') messages.type = `${label} phải là một phương án trong danh sách`;
  else messages.type = `${label} có giá trị không hợp lệ`;
  if (min !== undefined) messages.min = `${label} không được nhỏ hơn ${fmt(unit, min)}`;
  if (max !== undefined) messages.max = `${label} không được lớn hơn ${fmt(unit, max)}`;
  if (rules.nullable) messages.required = null;
  else messages.required = `${label} không được để trống`;
  if (rules.options) {
    messages.option = `${label}: phương án không có trong danh sách`;
    messages.optionUnavailable = `${label}: phương án chưa dùng được`;
  }
  if (floor)
    messages.floor = `${label} không được thấp hơn ${fmt(floor.each ? 'percentPoints' : unit, floor.value)} (căn cứ: ${citation(floor.basis)})`;
  if (ceiling)
    messages.ceiling = `${label} không được cao hơn ${fmt(unit, ceiling.value)} (căn cứ: ${citation(ceiling.basis)})`;
  rules.messages = messages;
  rules.editable =
    registry.WRITE_CAP[entry.editableBy] !== undefined && entry.class !== 'fixed' && entry.class !== 'removed';
  return rules;
}

/* ---------- công thức tháng: { text, tree } (khoá formula.<tên>) ---------- */
// Khoá formula.* là locked: Admin không lưu được (save.js trả PARAM_LOCKED trước khi vào đây). Hàm này còn để scripts/params/check.ts kiểm
// CẤU TRÚC của 7 công thức mặc định (validateValue với structureOnly) và để store.resolve kiểm dòng do `system` ghi.
// Dùng đúng mô-đun src/engine/formula.ts: deserialize từ chối cây hỏng, validate kiểm từ vựng, đơn vị, vòng lặp và thành phần bắt buộc theo luật.
// Lỗi trả nguyên mã của mô-đun, mọi lỗi nằm ở `errors`. Giá trị lưu là { text, tree } với tree đã serialize lại (dạng chuẩn).
function checkFormula(key?, value?, ctx: any = {}) {
  const bad = (code?, message?, errors?) => ({ ok: false, code, message, key, errors: errors || [{ code, message }] });
  if (value === null) return { ok: true, value: null }; // null = quay về công thức có sẵn trong mã
  if (
    !value ||
    typeof value !== 'object' ||
    typeof value.text !== 'string' ||
    !value.tree ||
    typeof value.tree !== 'object'
  )
    return bad('PARAM_INVALID_VALUE', 'Công thức cần dạng { text, tree }: chữ Admin gõ và cây đã serialize');
  const text = value.text.trim();
  if (!text || text.length > Formula.LIMITS.maxTextChars)
    return bad('PARAM_INVALID_VALUE', `Chữ công thức phải từ 1 đến ${Formula.LIMITS.maxTextChars} ký tự`);
  let tree;
  try {
    tree = Formula.deserialize(value.tree);
  } catch (e) {
    return bad(e.code || 'FORMULA_BAD_TREE', e.message);
  }
  // Kiểm đúng như bộ máy sẽ nạp cây này (PayrollGraph.validateTree): đồ thị = cây mặc định đè bằng cây của bộ tham số này, và GIÁ TRỊ THAM SỐ của bộ
  // tham số (cạnh bảng bậc là tham số so theo giá trị). Không có đồ thị đầy đủ, "lương KPI = tổng thu nhập × 10 %" qua kiểm rồi làm mọi ước tính 500.
  const name = key.slice(key.indexOf('.') + 1);
  const params = { ...(ctx.params || {}) };
  const saved: Record<string, any> = {};
  for (const [k, v] of Object.entries<any>(params))
    if (k.startsWith('formula.') && v && typeof v === 'object' && v.tree) saved[k.slice('formula.'.length)] = v.tree;
  const result = PayrollGraph.validateTree(name, tree, params, saved);
  if (!result.ok)
    return bad(
      result.errors[0].code,
      result.errors[0].message,
      result.errors.map(e => ({ code: e.code, message: e.message, path: e.path, ...(e.key ? { key: e.key } : {}) }))
    );
  return { ok: true, value: { text, tree: Formula.serialize(tree) } };
}

/* ---------- kiểm một giá trị ---------- */
const fail = (rules?, code?, message?) => ({ ok: false, code, message, key: rules.key });
function checkScalar(rules?, value?) {
  const { type } = rules;
  if (value === null)
    return rules.nullable ? { ok: true, value: null } : fail(rules, 'PARAM_INVALID_VALUE', rules.messages.required);
  if (type === 'bool')
    return typeof value === 'boolean' ? { ok: true, value } : fail(rules, 'PARAM_INVALID_VALUE', rules.messages.type);
  if (type === 'enum')
    return typeof value === 'string' ? { ok: true, value } : fail(rules, 'PARAM_INVALID_VALUE', rules.messages.type);
  if (type === 'month')
    return MONTH_RE.test(value) ? { ok: true, value } : fail(rules, 'PARAM_INVALID_VALUE', rules.messages.type);
  if (type === 'date')
    return isRealDate(value) ? { ok: true, value } : fail(rules, 'PARAM_INVALID_VALUE', rules.messages.type);
  if (type === 'time')
    return typeof value === 'string' && TIME_RE.test(value)
      ? { ok: true, value }
      : fail(rules, 'PARAM_INVALID_VALUE', rules.messages.type);
  if (type === 'text')
    return typeof value === 'string' && value.trim().length >= 1 && value.trim().length <= 80
      ? { ok: true, value: value.trim() }
      : fail(rules, 'PARAM_INVALID_VALUE', rules.messages.type);
  if (type === 'int' || type === 'vnd' || type === 'number') {
    if (!isNum(value) || ((type === 'int' || type === 'vnd') && !Number.isSafeInteger(value)))
      return fail(rules, 'PARAM_INVALID_VALUE', rules.messages.type);
    if (rules.min !== undefined && value < rules.min) return fail(rules, 'PARAM_INVALID_VALUE', rules.messages.min);
    if (rules.max !== undefined && value > rules.max) return fail(rules, 'PARAM_INVALID_VALUE', rules.messages.max);
    return { ok: true, value };
  }
  return fail(rules, 'PARAM_INVALID_VALUE', rules.messages.type);
}
// Luật giữa các hàng của bảng bậc (rules.rows): máy chủ kiểm bằng checkStructured, giao diện hiện đúng câu này
const TIERS_ROW_MESSAGE = 'mỗi bậc cần số ngày nghỉ tăng dần và tỷ lệ giữ lại từ 0 đến 100 %';
function rowRulesOf(entry?) {
  const table = entry.ui && entry.ui.table;
  if (entry.valueType !== 'tiers' || !table) return null;
  return {
    orderBy: table.columns[0].key,
    order: 'increasing',
    message: `${entry.label}: ${TIERS_ROW_MESSAGE}`
  };
}
// Kiểm danh sách/bảng nguyên khối (intList, dateList, brackets, tiers)
function checkStructured(entry?, rules?, value?) {
  const bad = (message?) => fail(rules, 'PARAM_INVALID_VALUE', message);
  if (!Array.isArray(value)) return bad(`${entry.label} phải là một danh sách`);
  if (rules.type === 'intList') {
    // bảng phụ cấp ca đêm: ít nhất một mức và không trùng (người không chọn mức lấy phần tử đầu)
    if (entry.id === 'type.nv.nightOptions' && (!value.length || new Set<any>(value).size !== value.length))
      return bad(`${entry.label}: cần ít nhất một mức và các mức không trùng nhau`);
    const col = entry.ui && entry.ui.table && entry.ui.table.columns[0];
    if (!col)
      return value.every(Number.isInteger) ? { ok: true, value } : bad(`${entry.label}: mỗi phần tử phải là số nguyên`);
    if (!value.every(v => Number.isInteger(v) && v >= col.min && v <= col.max))
      return bad(`${entry.label}: mỗi mức phải là số nguyên từ ${col.min} đến ${col.max}`);
    return { ok: true, value };
  }
  if (rules.type === 'dateList')
    return value.every(isRealDate) ? { ok: true, value } : bad(`${entry.label}: có ngày không hợp lệ`);
  if (rules.type === 'brackets') {
    let last = 0;
    for (let i = 0; i < value.length; i++) {
      const [cap, rate] = Array.isArray(value[i]) ? value[i] : [];
      const lastRow = i === value.length - 1;
      if (!isNum(rate) || rate < 0 || rate > 1)
        return bad(`${entry.label}: thuế suất bậc ${i + 1} phải từ 0 đến 100 %`);
      if (lastRow ? cap !== null : !isNum(cap) || cap <= last)
        return bad(`${entry.label}: trần các bậc phải tăng dần và bậc cuối không có trần`);
      last = cap;
    }
    return value.length ? { ok: true, value } : bad(`${entry.label} cần ít nhất một bậc`);
  }
  if (rules.type === 'tiers') {
    let last = 0;
    for (const row of value) {
      if (
        !row ||
        !Number.isInteger(row.fromDays) ||
        row.fromDays <= last ||
        !isNum(row.keepRatio) ||
        row.keepRatio < 0 ||
        row.keepRatio > 1
      )
        return bad(`${entry.label}: ${TIERS_ROW_MESSAGE}`);
      last = row.fromDays;
    }
    return { ok: true, value };
  }
  return bad(`${entry.label} có giá trị không hợp lệ`);
}

// validateValue(key, value, { params, structureOnly }) → { ok:true, value, warnings:[...] } | { ok:false, code, message, key }
// structureOnly: chỉ kiểm cấu trúc (kiểu, khoảng, có trong danh sách phương án); bỏ qua khoá sửa được hay không, phương án `available`, sàn và trần.
// store.resolve dùng chế độ này để loại dòng hỏng mà vẫn nhận dòng do `system` ghi (bản phát hành) cho khoá chỉ đọc.
function validateValue(key?, value?, ctx: any = {}) {
  // thuộc tính mở rộng của lớp (class.level.attr.<mã>, level.<loại>.<bậc>.attr.<mã>): khoá động, không có mục registry riêng
  const attr = Attributes.validate(key, value, ctx);
  if (attr) return attr;
  // chức vụ là dữ liệu: position.def.<mã> kiểm riêng; khoá type.<mã>.* và level.<mã>.* của chức vụ mới kiểm theo luật của khoá mẫu cùng đuôi
  const block = BlockDefs.classify(key);
  if (block) return BlockDefs.validate(block, key, value, ctx);
  const position = Positions.classify(key);
  if (position && position.kind === 'def') return Positions.validateDef(position.code, value, ctx);
  const moved = Positions.translate(key, ctx);
  if (moved) {
    if (moved.error) return moved.error;
    if (moved.schedule) return Positions.validateScheduleList(key, value, ctx);
    if (moved.override && value === null) return { ok: true, value: null, warnings: [] }; // null = kế thừa khoá toàn cục
    const inner = validateValue(moved.templateKey, value, moved.creationOnly ? { ...ctx, structureOnly: true } : ctx);
    if (inner.ok) return inner;
    // Thông báo dựng theo khoá mẫu (chức vụ mặc định cùng đuôi): đổi tên chức vụ mẫu thành tên chức vụ đang sửa để người dùng thấy đúng chỗ cần sửa
    const template = /^(?:type|level)\.([A-Za-z0-9_]+)\./.exec(moved.templateKey);
    const own = Positions.defOf(ctx.params || {}, moved.hit.code).label;
    const swap = (text?) =>
      template && typeof text === 'string' ? text.replace(`(${registry.typeLabel(template[1])}`, `(${own}`) : text;
    return { ...inner, key, message: swap(inner.message) };
  }
  const hit = registry.entryFor(key);
  if (!hit)
    return { ok: false, code: 'PARAM_UNKNOWN_KEY', message: `Không có tham số "${String(key).slice(0, 60)}"`, key };
  const entry = hit.entry;
  const rules = rulesOf(entry, key, ctx.params);
  if (!ctx.structureOnly && (['fixed', 'removed'].includes(entry.class) || !registry.WRITE_CAP[entry.editableBy]))
    return { ok: false, code: 'PARAM_LOCKED', message: `${labelOf(entry, key)} không sửa được trên màn hình`, key };
  let result;
  if (rules.type === 'formula') {
    result = checkFormula(key, value, ctx);
    return result.ok ? { ...result, warnings: [] } : result;
  }
  if (['intList', 'dateList', 'brackets', 'tiers'].includes(rules.type)) result = checkStructured(entry, rules, value);
  else if (rules.type === 'table' && Array.isArray(value))
    result = { ok: true, value }; // danh mục dạng danh sách: chưa có lược đồ ô
  else result = checkScalar(rules, value);
  if (!result.ok) return result;
  if (rules.options && result.value !== null) {
    const option = rules.options.find(o => o.value === result.value);
    if (!option) return fail(rules, 'PARAM_INVALID_VALUE', rules.messages.option);
    if (!option.available && !ctx.structureOnly)
      return fail(
        rules,
        'PARAM_OPTION_UNAVAILABLE',
        `${labelOf(entry, key)}: phương án "${option.label}" chưa dùng được`
      );
  }
  // Cách xử lý khoản chưa duyệt chỉ nhận phương án hợp lý của TỪNG loại (ApprovalView.ALLOWED_ACTIONS): "Bỏ cả ngày" cho OT sẽ mất luôn ngày đi làm
  // "Tính là ngày nghỉ khi xét chuyên cần" chỉ bỏ được ở loại có thể thành nghỉ không lương (nghỉ phép năm, iSAT, nghỉ được duyệt); loại khác luôn "có"
  const absent = !ctx.structureOnly && result.value === false ? APPROVAL_ABSENT_KEY.exec(key) : null;
  if (absent && !(ApprovalView.ALLOWED_ACTIONS[absent[1]] || []).includes('unpaid'))
    return fail(
      rules,
      'PARAM_OPTION_UNAVAILABLE',
      `${labelOf(entry, key)}: loại này không bao giờ thành ngày nghỉ không lương nên không có lựa chọn này`
    );
  const rule = !ctx.structureOnly && result.value !== null ? APPROVAL_RULE_KEY.exec(key) : null;
  if (rule) {
    const allowed = ApprovalView.ALLOWED_ACTIONS[rule[1]];
    if (!allowed || !allowed.includes(result.value))
      return fail(
        rules,
        'PARAM_OPTION_UNAVAILABLE',
        `${labelOf(entry, key)}: loại này chỉ có thể chọn ${(allowed || []).map(a => '"' + APPROVAL_ACTION_LABEL[a] + '"').join(' hoặc ') || 'không phương án nào'}`
      );
  }
  const values = rules.type === 'intList' ? result.value : [result.value];
  const warnings: any[] = [];
  if (ctx.structureOnly) return { ok: true, value: result.value, warnings };
  for (const v of values) {
    if (!isNum(v)) continue;
    // Sàn và trần luật chỉ cảnh báo; giá trị vẫn được lưu và bộ máy tính theo đúng giá trị đó
    const law = (message?) => {
      warnIf('PARAM_BELOW_LEGAL_FLOOR', true, { message, consequence: LAW_NOTE, details: { key }, severity: 'danger' });
      warnings.push({ code: 'PARAM_BELOW_LEGAL_FLOOR', message: `${message}. ${LAW_NOTE}`, key });
    };
    if (rules.floor && v < rules.floor.value)
      if (rules.floor.severity === 'hard') law(rules.messages.floor);
      else warnings.push({ code: 'PARAM_FLOOR_ACK_REQUIRED', message: rules.messages.floor, key });
    if (rules.ceiling && v > rules.ceiling.value) law(rules.messages.ceiling);
    if (rules.warnBelow && rules.warnBelow.value !== undefined && v < rules.warnBelow.value)
      warnings.push({
        code: 'PARAM_FLOOR_ACK_REQUIRED',
        message: `${labelOf(entry, key)} thấp hơn ${fmt(rules.unit, rules.warnBelow.value)}`,
        key
      });
    if (rules.warnAbove && rules.warnAbove.value !== undefined && v > rules.warnAbove.value)
      warnings.push({
        code: 'PARAM_FLOOR_ACK_REQUIRED',
        message: `${labelOf(entry, key)} cao hơn ${fmt(rules.unit, rules.warnAbove.value)}`,
        key
      });
  }
  return { ok: true, value: result.value, warnings };
}

/* ---------- giờ ca cố định ---------- */
// Loại ca suy từ giờ, cùng quy tắc với src/engine/payroll-engine.ts → shiftFor: có phút nào trong khung đêm là Night; vào sớm hơn mốc Flex hoặc ra từ mốc đêm là Flex
const minutesOf = (text?) => {
  const [h, m] = text.split(':').map(Number);
  return h * 60 + m;
};
function shiftKindOf(tin?, tout?, set?) {
  const nightFrom = set['time.nightStartHour'] * 60,
    nightTo = set['time.nightEndHour'] * 60,
    flexBefore = set['time.flexStartBeforeHour'] * 60;
  const a = minutesOf(tin);
  const b = minutesOf(tout);
  const end = b <= a ? b + 1440 : b;
  for (let t = a; t < end; t += 1) {
    const x = t % 1440;
    if (x >= nightFrom || x < nightTo) return 'night';
  }
  return a < flexBefore || b >= nightFrom ? 'flex' : 'normal';
}
const spanMinutes = (tin?, tout?) => {
  const diff = minutesOf(tout) - minutesOf(tin);
  return diff <= 0 ? diff + 1440 : diff;
};
const KIND_NAME = { normal: 'Normal', flex: 'Flex', night: 'Night' };
// Mỗi ca cố định: giờ HH:MM, dài đúng (giờ làm mỗi công + giờ nghỉ), giữ loại ca của giờ mặc định, không trùng cặp giờ với ca khác
function shiftErrors(set?) {
  const errors: any[] = [];
  const codes = Object.keys(set)
    .map(key => /^shift\.preset\.([a-z0-9]+)\.in$/.exec(key))
    .filter(Boolean)
    .map(m => m![1]);
  const bad = (code?, message?) =>
    errors.push({ code: 'PARAM_CROSS_CHECK_FAILED', key: `shift.preset.${code}.in`, message });
  const seen = new Map<any, any>();
  const wantMinutes = (set['time.workHoursPerDay'] + set['time.breakHours']) * 60;
  for (const code of codes) {
    const tin = set[`shift.preset.${code}.in`],
      tout = set[`shift.preset.${code}.out`];
    if (typeof tin !== 'string' || typeof tout !== 'string' || !TIME_RE.test(tin) || !TIME_RE.test(tout)) continue; // kiểm kiểu đã báo
    if (tin === tout) {
      bad(code, `Ca ${code}: giờ vào và giờ ra không được trùng nhau`);
      continue;
    }
    const hours = Math.round((spanMinutes(tin, tout) / 60) * 100) / 100;
    if (spanMinutes(tin, tout) !== wantMinutes)
      bad(
        code,
        `Ca ${code}: từ ${tin} đến ${tout} dài ${hours} giờ; mỗi ca phải dài đúng ${wantMinutes / 60} giờ (${set['time.workHoursPerDay']} giờ làm cộng ${set['time.breakHours']} giờ nghỉ)`
      );
    if (Object.hasOwn(DEFAULTS, `shift.preset.${code}.in`)) {
      const was = shiftKindOf(DEFAULTS[`shift.preset.${code}.in`], DEFAULTS[`shift.preset.${code}.out`], set),
        now = shiftKindOf(tin, tout, set);
      if (was !== now)
        bad(
          code,
          `Ca ${code}: giờ mới làm đổi loại ca từ ${KIND_NAME[was]} sang ${KIND_NAME[now]}, kéo theo phụ cấp ca; hãy giữ giờ trong khung của loại ${KIND_NAME[was]}`
        );
    }
    const pair = `${tin}-${tout}`;
    if (seen.has(pair)) bad(code, `Ca ${code} trùng cả giờ vào lẫn giờ ra với ca ${seen.get(pair)}`);
    else seen.set(pair, code);
  }
  return errors;
}

/* ---------- phụ cấp đi lại và chuyên cần của chức vụ ---------- */
// Cây công thức đi lại và chuyên cần (src/engine/payroll-graph.ts) đọc type.<mã>.travel, type.<mã>.attendance và type.<mã>.maxAbsent của chức vụ, không có
// giá trị mặc định: thiếu một khoá là FORMULA_MISSING_INPUT và MỌI phiếu lương của chức vụ đó thành lỗi. Chức vụ sao từ tts hoặc ctv không có maxAbsent
// (chỉ nv có), nên chức vụ có phụ cấp đi lại hoặc chuyên cần khác 0 mà thiếu một khoá thì chặn lúc lưu (cùng điều kiện T.travel || T.attendance của bộ máy).
const ALLOWANCE_TAILS = Object.freeze(['travel', 'attendance', 'maxAbsent']);
function allowanceErrors(set?) {
  const errors: any[] = [];
  for (const code of Positions.codesOf(set)) {
    if (!set[`type.${code}.travel`] && !set[`type.${code}.attendance`]) continue;
    const missing = ALLOWANCE_TAILS.filter(tail => !isNum(set[`type.${code}.${tail}`]));
    if (missing.length)
      errors.push({
        code: 'PARAM_CROSS_CHECK_FAILED',
        key: `type.${code}.${missing[0]}`,
        message: `Chức vụ ${Positions.defOf(set, code).label}: đã có phụ cấp đi lại hoặc chuyên cần thì phải có đủ tỷ lệ đi lại, tỷ lệ chuyên cần và số ngày nghỉ tối đa để giữ chuyên cần; còn thiếu ${missing.map(tail => `type.${code}.${tail}`).join(', ')}, nếu lưu thì phiếu lương của chức vụ này sẽ lỗi`
      });
  }
  return errors;
}

/* ---------- kiểm liên trường (tầng 2): trên bộ tham số SAU khi áp thay đổi ---------- */
function crossChecks(set?) {
  const errors: any[] = [];
  // kiểm tổng khai trong registry (entry.crossChecks): cùng một khai báo cho máy chủ và cho rules.crossChecks của giao diện
  for (const entry of registry.entries)
    for (const check of entry.crossChecks || [])
      if (check.kind === 'sum' && check.keys.every(k => isNum(set[k]))) {
        const total = check.keys.reduce((sum, k) => sum + set[k], 0);
        if (total !== set[check.equalsKey])
          errors.push({ code: 'PARAM_CROSS_CHECK_FAILED', key: entry.id, message: check.message });
      }
  if (set['attendance.graceMin'] >= set['attendance.stepMin'])
    errors.push({
      code: 'PARAM_CROSS_CHECK_FAILED',
      key: 'attendance.graceMin',
      message: 'Mức miễn đi trễ, về sớm phải nhỏ hơn bậc trừ'
    });
  errors.push(...shiftErrors(set));
  errors.push(...allowanceErrors(set));
  const brackets = set['tax.brackets'];
  if (Array.isArray(brackets)) {
    const r: any = checkStructured(
      { label: 'Biểu thuế lũy tiến' },
      { type: 'brackets', key: 'tax.brackets' },
      brackets
    );
    if (!r.ok) errors.push({ code: 'PARAM_CROSS_CHECK_FAILED', key: 'tax.brackets', message: r.message });
  }
  return errors;
}

// Kiểm chéo của một mục cho giao diện: giá trị đích lấy từ bộ tham số (không viết cứng số ở giao diện)
function crossChecksOf(entry?, params?) {
  return (entry.crossChecks || []).map(check => ({
    kind: check.kind,
    keys: check.keys,
    equalsKey: check.equalsKey,
    equals: paramOf(params, check.equalsKey),
    message: check.message
  }));
}

export = {
  validateValue,
  rulesOf,
  rowRulesOf,
  crossChecksOf,
  crossChecks,
  labelOf,
  fmt,
  UNIT_NAME,
  isRealDate
};

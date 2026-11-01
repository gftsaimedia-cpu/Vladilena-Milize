'use strict';
// Chức vụ là DỮ LIỆU: ba chức vụ mặc định tts, ctv, nv không có dòng định nghĩa (tổng hợp từ mặc định),
// chức vụ mới có `position.def.<mã>` cùng các khoá `type.<mã>.*`, `level.<mã>.<bậc>.*` đi vào ĐÚNG các họ khoá hiện có (không đổi tên khoá, không đổi lược đồ).
// Cùng một đường ghi PUT /api/settings/params (tháng áp dụng, lý do, nhật ký, hoàn tác); thêm chức vụ bằng sao chép đi qua save() như một lô.
//   classify(key)               { kind:'def', code } | { kind:'type', code, suffix } | { kind:'level', code, level, suffix } | null (mã mặc định thuộc registry)
//   translate(key, ctx)         khoá của chức vụ mới → khoá mẫu của chức vụ mặc định để kiểm theo luật của registry; hoặc lỗi
//   validateDef(code, value, ctx)
//   list(set) / entitlements(set)  dữ liệu cho GET /api/positions và GET /api/entitlements
//   benefitsOf(set, code)       cờ quyền lợi của một chức vụ (GET /api/me)
//   copyChanges(...)            lô khoá của một chức vụ mới sao từ chức vụ có sẵn
// Thuần: không I/O, không đồng hồ.
const Params = require('../engine/payroll-params');
const registry = require('./registry');
const { BLOCKS } = require('./blocks');
const PayBlocksCalc = require('../engine/pay-blocks-calc');
const config = require('../platform/config');

const DEF_RE = /^position\.def\.([^.]+)$/;
const TYPE_RE = /^type\.([^.]+)\.(.+)$/;
// Lịch làm việc của chức vụ: danh sách thứ trong tuần, sửa được có tháng áp dụng (kể cả ba chức vụ mặc định); kiểm chéo ở scheduleErrors
const SCHEDULE_SUFFIXES = Object.freeze(['dows']);
// Đuôi khoá chỉ chức vụ NV có sẵn trong DEFAULTS; TTS, CTV đặt thêm được (không có thì không có giá trị, tiền không đổi)
const NV_ONLY_SUFFIXES = Object.freeze(['nightOptions', 'maxAbsent']);
const BLOCK_ROW_RE = /^type\.[^.]+\.block\./;
const LEVEL_RE = /^level\.([^.]+)\.([0-9]+)\.(.+)$/;
// Giới hạn độ dài lấy từ src/platform/config.ts (giới hạn kỹ thuật có tên): mã chức vụ 2 đến 16 ký tự, tên, tên viết tắt
const CODE_MIN = config.POSITION_CODE_MIN;
const CODE_MAX = config.POSITION_CODE_MAX;
const LABEL_MAX = config.POSITION_LABEL_MAX;
const SHORT_MAX = config.POSITION_SHORT_MAX;
// Nhãn và tên viết tắt không chứa dấu ngoặc nhọn của thẻ HTML: lớp phòng thủ thêm ở máy chủ (giao diện vẫn thoát ký tự khi hiện)
const HAS_MARKUP = /[<>]/;
const sizeOf = (text?) => [...text].length; // đếm ký tự thật, emoji là một ký tự
const CODE_RE = new RegExp(`^[a-z][a-z0-9]{${CODE_MIN - 1},${CODE_MAX - 1}}$`);
// Cờ quyền lợi gửi cho giao diện (type.<mã>.benefit.<cờ>); thiếu khoá là false
const BENEFIT_FLAGS = Object.freeze([
  'ot',
  'makeup',
  'kpi',
  'paidHoliday',
  'paidLeave',
  'isat',
  'absenceDeclarable',
  'approvedLeave',
  'leaveAccount',
  'makeupHours',
  'makeupDay', // không còn dùng
  'idorm',
  'breakPay'
]);
// Quyền lợi theo từng bậc (thứ tự: bậc → chức vụ → toàn cục): level.<mã>.<bậc>.<đuôi>, null = kế thừa chức vụ. Đuôi là một trong bốn trường dưới
// hoặc benefit.<cờ>; cả ba chức vụ mặc định và chức vụ thêm đều nhận (khác khoá level.<mã>.<bậc>.name|base|kpi, là bảng bậc lương)
const LEVEL_FIELDS = Object.freeze(['travel', 'attendance', 'flexBonus', 'nightOptions']);
const isLevelOverride = (suffix?) =>
  LEVEL_FIELDS.includes(suffix) ||
  (suffix.startsWith('benefit.') && BENEFIT_FLAGS.includes(suffix.slice('benefit.'.length)));
// Tên khoá động của họ này (khoá `params:lock`, không có mục registry riêng như thuộc tính của lớp)
const LOCKED_NAMES = Object.freeze(['position.def.<code>']);
const DEF_FIELDS = Object.freeze(['label', 'short', 'copiedFrom', 'deprecated']);

const fail = (code?, message?, key?) => ({ ok: false, code, message, key });
const isObj = (v?) => !!v && typeof v === 'object' && !Array.isArray(v);

// Mã mặc định: có khoá `type.<mã>.workdays` trong DEFAULTS
const builtinCodes = Object.keys(Params.DEFAULTS)
  .map(key => /^type\.([a-z0-9]+)\.workdays$/.exec(key))
  .filter(Boolean)
  .map(m => m![1]);
const isBuiltin = (code?) => builtinCodes.includes(code);

/* ---------- nhận diện khoá ---------- */
function classify(key?) {
  if (typeof key !== 'string') return null;
  let m = DEF_RE.exec(key);
  if (m) return { kind: 'def', code: m[1] };
  if (BLOCK_ROW_RE.test(key)) return null; // giá trị khối theo chức vụ: src/params/block-defs.ts
  m = TYPE_RE.exec(key);
  // ghi đè theo chức vụ của tham số toàn cục (type.<mã>.ot.rate, advanceRate, overLimitHours): cả chức vụ mặc định, null = kế thừa
  if (m && Object.hasOwn(Params.OVERRIDES, m[2])) return { kind: 'override', code: m[1], suffix: m[2] };
  if (m && SCHEDULE_SUFFIXES.includes(m[2])) return { kind: 'schedule', code: m[1], suffix: m[2] };
  // bảng phụ cấp đêm và số ngày nghỉ tối đa giữ chuyên cần cũng cấu hình được cho TTS và CTV (chỉ NV có sẵn trong DEFAULTS): khoá type.<tts|ctv>.nightOptions và .maxAbsent
  // đi đường khoá của chức vụ, kiểm theo luật của type.nv.nightOptions và type.nv.maxAbsent
  if (m && (!isBuiltin(m[1]) || (NV_ONLY_SUFFIXES.includes(m[2]) && !Object.hasOwn(Params.DEFAULTS, key))))
    return { kind: 'type', code: m[1], suffix: m[2] };
  m = LEVEL_RE.exec(key);
  if (m && isLevelOverride(m[3])) return { kind: 'levelOverride', code: m[1], level: Number(m[2]), suffix: m[3] };
  // bậc của chức vụ mặc định nằm trong DEFAULTS (registry); bậc THÊM sau (level.nv.5.*) không có trong DEFAULTS nên đi đường này như bậc của chức vụ thêm
  if (m && (!isBuiltin(m[1]) || !Object.hasOwn(Params.DEFAULTS, key)) && !m[3].startsWith('attr.'))
    return { kind: 'level', code: m[1], level: Number(m[2]), suffix: m[3] };
  return null;
}

/* ---------- mã từ nhãn ---------- */
// chữ thường không dấu, chỉ chữ và số, bắt đầu bằng chữ; trả null khi không đủ độ dài tối thiểu
function codeFromLabel(label?) {
  const base = String(label || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/gi, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .replace(/^[0-9]+/, '')
    .slice(0, CODE_MAX);
  return base.length >= CODE_MIN ? base : null;
}
const isReservedCode = (code?) => code in Object.prototype; // constructor, toString… không bao giờ là mã chức vụ

/* ---------- đọc từ bộ tham số phẳng ---------- */
// Chức vụ mặc định đứng trước theo thứ tự danh mục của registry, chức vụ thêm sau theo mã
const rankOf = (code?) => (isBuiltin(code) ? registry.TYPES.findIndex(t => t.value === code) : registry.TYPES.length);
const codesOf = (set?) =>
  Object.keys(set)
    .map(key => /^type\.([a-z0-9]+)\.workdays$/.exec(key))
    .filter(Boolean)
    .map(m => m![1])
    .sort((a: any, b: any) => rankOf(a) - rankOf(b) || (a < b ? -1 : 1));
const read = (set?, code?, tail?) =>
  Object.hasOwn(set, `type.${code}.${tail}`) ? set[`type.${code}.${tail}`] : undefined;
function defOf(set?, code?) {
  const own = set[`position.def.${code}`];
  if (isObj(own)) return own;
  return { label: registry.typeLabel(code), short: code.toUpperCase(), copiedFrom: null, deprecated: false };
}
function levelsOf(set?, code?) {
  const out: any[] = [];
  for (let n = 1; Object.hasOwn(set, `level.${code}.${n}.base`); n += 1)
    out.push({
      level: n,
      name: set[`level.${code}.${n}.name`] ?? null,
      base: set[`level.${code}.${n}.base`],
      kpi: set[`level.${code}.${n}.kpi`] ?? 0
    });
  return out;
}
// level (tuỳ chọn): ghi đè theo bậc level.<mã>.<bậc>.benefit.<cờ> (khác null) thắng cờ của chức vụ
function benefitsOf(set?, code?, level?) {
  const out: Record<string, any> = {};
  for (const flag of BENEFIT_FLAGS) {
    const own = level === undefined ? undefined : set[`level.${code}.${level}.benefit.${flag}`];
    out[flag] = typeof own === 'boolean' ? own : read(set, code, `benefit.${flag}`) === true;
  }
  return out;
}
function list(set?) {
  return codesOf(set).map(code => {
    const def = defOf(set, code);
    return {
      code,
      label: def.label,
      short: def.short || code.toUpperCase(),
      builtin: isBuiltin(code),
      deprecated: !!def.deprecated,
      copiedFrom: def.copiedFrom || null,
      workdays: read(set, code, 'workdays'),
      dows: read(set, code, 'dows') ?? [],
      levels: levelsOf(set, code),
      benefits: benefitsOf(set, code),
      startDateRequired: read(set, code, 'startDateRequired') === true,
      defaultContract: read(set, code, 'defaultContract') ?? null,
      travel: read(set, code, 'travel') ?? 0,
      attendance: read(set, code, 'attendance') ?? 0,
      flexBonus: read(set, code, 'flexBonus') ?? null,
      kpiPass: read(set, code, 'kpiPass') ?? null,
      maxAbsent: read(set, code, 'maxAbsent') ?? null,
      nightOptions: read(set, code, 'nightOptions') ?? null,
      probationPayPct: read(set, code, 'probationPayPct') ?? null
    };
  });
}

/* ---------- bảng quyền lợi ---------- */
function cellOf(set?, code?, block?) {
  const own = (tail?) => read(set, code, tail);
  let on = true;
  if (block.on.kind === 'flag') on = own(block.on.tail) === true;
  else if (block.on.kind === 'positive') on = Number(own(block.on.tail)) > 0;
  else if (block.on.kind === 'contract') on = own('defaultContract') === 'long';
  let value: any = null,
    source: any = null,
    valueKey: any = null;
  const v = block.value;
  if (v.tail && own(v.tail) !== undefined) {
    value = own(v.tail);
    source = 'position';
    valueKey = `type.${code}.${v.tail}`;
  } else if (v.global && Object.hasOwn(set, v.global)) {
    value = set[v.global];
    source = 'global';
    valueKey = v.global;
  }
  const fields: Record<string, any> = {};
  for (const tail of block.fields) fields[tail] = own(tail) === undefined ? null : own(tail);
  return { position: code, block: block.id, on, value, source, valueKey, fields };
}
// Khối do C&B thêm (block.def.<mã>): hàng của bảng quyền lợi, thành phần ③. Ô: bật theo type.<chức vụ>.block.<mã>.on, giá trị là số tiền hoặc tỷ lệ của chức vụ
const blockRowOf = ({ code, def }: any) => ({
  id: code,
  code,
  component: String(def.component || '3'),
  label: def.label,
  added: true,
  alwaysOn: false,
  readOnly: false,
  method: def.method,
  scalesWithDays: def.scalesWithDays === true,
  loss: def.loss ?? null,
  tax: def.tax ?? 'none',
  taxCap: def.taxCap ?? null,
  insuranceBase: def.insuranceBase === true,
  flagsConfirmedBy: def.flagsConfirmedBy ?? null,
  flagsConfirmedAt: def.flagsConfirmedAt ?? null,
  value: {
    unit: def.method === 'pctBase' ? 'ratio' : 'vnd',
    label: def.method === 'pctBase' ? 'Tỷ lệ lương cơ bản' : 'Số tiền'
  },
  fields: []
});
function blockCellOf(set, position, { code, def }: any) {
  const prefix = `type.${position}.block.${code}.`;
  const levels = Object.keys(set)
    .filter(key => key.startsWith(`${prefix}byLevel.`))
    .sort();
  const field = def.method === 'pctBase' ? 'pct' : 'amount';
  const valueKey = def.method === 'byLevel' ? null : `${prefix}${field}`;
  return {
    position,
    block: code,
    on: set[`${prefix}on`] === true,
    onKey: `${prefix}on`,
    value: valueKey && Object.hasOwn(set, valueKey) ? set[valueKey] : null,
    source: valueKey && Object.hasOwn(set, valueKey) ? 'position' : null,
    valueKey,
    fields: Object.fromEntries(levels.map(key => [key.slice(prefix.length), set[key]]))
  };
}
// Quyền lợi theo từng bậc: mỗi bậc một hàng, mỗi ô { value (hiệu lực), source: 'level' | 'position', key (khoá ghi được; null = kế thừa) }
function levelCellsOf(set?, positions?) {
  const fields = [...LEVEL_FIELDS, ...BENEFIT_FLAGS.map(flag => `benefit.${flag}`)];
  return positions.flatMap(p =>
    p.levels.map(l => ({
      position: p.code,
      level: l.level,
      name: l.name,
      cells: Object.fromEntries(
        fields.map(tail => {
          const key = `level.${p.code}.${l.level}.${tail}`;
          const own = Object.hasOwn(set, key) ? set[key] : null;
          const inherited = read(set, p.code, tail);
          const value = own !== null ? own : tail.startsWith('benefit.') ? inherited === true : (inherited ?? null);
          return [tail, { value, source: own !== null ? 'level' : 'position', key }];
        })
      )
    }))
  );
}
function entitlements(set?) {
  const positions = list(set);
  const base = {
    positions,
    blocks: BLOCKS.map(b => ({
      id: b.id,
      component: b.component,
      label: b.label,
      alwaysOn: b.on.kind === 'always',
      readOnly: b.on.kind === 'contract',
      value: { unit: b.value.unit, label: b.value.label },
      fields: b.fields
    })),
    cells: positions.flatMap(p => BLOCKS.map(b => cellOf(set, p.code, b))),
    levelCells: levelCellsOf(set, positions)
  };
  const added = PayBlocksCalc.defsOf(set);
  base.blocks.push(...added.map(blockRowOf));
  base.cells.push(...positions.flatMap(p => added.map(def => blockCellOf(set, p.code, def))));
  return base;
}

/* ---------- thêm bậc ---------- */
// Lô khoá của MỘT bậc mới của chức vụ `code` trong bộ tham số `set`: bậc kế tiếp (số bậc hiện có + 1; bậc không bao giờ xoá nên số bậc chỉ tăng), tên, lương cơ bản
// và KPI tối đa (chỉ khi nhập). Ném lỗi { code, message, httpStatus } (cùng dạng với lỗi của save.js) khi đầu vào sai; luật giá trị (sàn lương, khoảng) do save() kiểm như mọi khoá level.<mã>.<bậc>.*.
// later: các bậc của chức vụ đã có dòng hiệu lực MUỘN hơn tháng áp dụng [{ level, effectiveMonth }]; thêm bậc ở tháng sớm hơn sẽ trùng số bậc nên bị từ chối.
const levelFail = (httpStatus?, code?, message?) => Object.assign(new Error(message), { httpStatus, code });
function buildLevel(set?, code?, body?, later: any[] = []) {
  if (!codesOf(set).includes(code))
    throw levelFail(404, 'POSITION_UNKNOWN', 'Không có chức vụ này trong tháng áp dụng');
  if (defOf(set, code).deprecated)
    throw levelFail(409, 'POSITION_DEPRECATED', 'Chức vụ đã ngưng dùng, không thêm bậc được');
  const levels = levelsOf(set, code);
  const clash = later.find(l => l.level > levels.length);
  if (clash)
    throw levelFail(
      409,
      'LEVEL_LATER_EXISTS',
      `Chức vụ này đã có bậc ${clash.level} hiệu lực từ tháng ${clash.effectiveMonth}; chọn tháng áp dụng từ tháng đó trở đi để không trùng số bậc`
    );
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  if (!name || sizeOf(name) > LABEL_MAX)
    throw levelFail(400, 'PARAM_INVALID_VALUE', `Tên bậc phải từ 1 đến ${LABEL_MAX} ký tự`);
  if (HAS_MARKUP.test(name)) throw levelFail(400, 'PARAM_INVALID_VALUE', 'Tên bậc không được chứa ký tự < hoặc >');
  const taken = levels.find(l => String(l.name ?? '').toLowerCase() === name.toLowerCase());
  if (taken)
    throw levelFail(
      409,
      'LEVEL_NAME_CLASH',
      `Chức vụ này đã có bậc tên "${name}" (bậc ${taken.level}); hãy đặt tên khác`
    );
  if (typeof body.base !== 'number' || !Number.isFinite(body.base) || body.base <= 0)
    throw levelFail(400, 'PARAM_INVALID_VALUE', 'Lương cơ bản của bậc phải là số lớn hơn 0');
  if (
    body.kpi !== undefined &&
    body.kpi !== null &&
    (typeof body.kpi !== 'number' || !Number.isFinite(body.kpi) || body.kpi < 0)
  )
    throw levelFail(400, 'PARAM_INVALID_VALUE', 'KPI tối đa của bậc phải là số từ 0 trở lên');
  // chức vụ có cờ KPI thì bậc mới phải có KPI tối đa lớn hơn 0 (không để bậc có KPI mà trần bằng 0 âm thầm)
  if (read(set, code, 'benefit.kpi') === true && !(typeof body.kpi === 'number' && body.kpi > 0))
    throw levelFail(400, 'PARAM_INVALID_VALUE', 'Chức vụ này có KPI: cần nhập KPI tối đa của bậc là số lớn hơn 0');
  const level = levels.length + 1;
  const changes = [
    { key: `level.${code}.${level}.name`, value: name },
    { key: `level.${code}.${level}.base`, value: body.base }
  ];
  if (typeof body.kpi === 'number') changes.push({ key: `level.${code}.${level}.kpi`, value: body.kpi });
  return { level, name, changes };
}

/* ---------- kiểm khoá ---------- */
function validateDef(code?, value?, ctx: any = {}) {
  const key = `position.def.${code}`;
  if (!CODE_RE.test(code) || isReservedCode(code))
    return fail(
      'PARAM_INVALID_VALUE',
      `Mã chức vụ chỉ gồm chữ không dấu và số, bắt đầu bằng chữ, từ ${CODE_MIN} đến ${CODE_MAX} ký tự`,
      key
    );
  if (isBuiltin(code))
    return fail('POSITION_CODE_CLASH', `Mã ${code} là của chức vụ mặc định, không đặt lại được`, key);
  if (value === null)
    return fail('PARAM_INVALID_VALUE', 'Chức vụ không xoá được; hãy ngưng dùng (deprecated: true)', key);
  if (!isObj(value))
    return fail('PARAM_INVALID_VALUE', 'Định nghĩa chức vụ cần dạng { label, short, copiedFrom }', key);
  for (const field of Object.keys(value))
    if (!DEF_FIELDS.includes(field))
      return fail(
        'PARAM_INVALID_VALUE',
        `Định nghĩa chức vụ có trường lạ "${field.slice(0, config.ERROR_ECHO_FIELD_MAX)}"`,
        key
      );
  const label = typeof value.label === 'string' ? value.label.trim() : '';
  if (!label || sizeOf(label) > LABEL_MAX)
    return fail('PARAM_INVALID_VALUE', `Tên chức vụ phải từ 1 đến ${LABEL_MAX} ký tự`, key);
  if (HAS_MARKUP.test(label)) return fail('PARAM_INVALID_VALUE', 'Tên chức vụ không được chứa ký tự < hoặc >', key);
  const out: Record<string, any> = { label };
  if (value.short !== undefined && value.short !== null) {
    const short = typeof value.short === 'string' ? value.short.trim() : '';
    if (!short || sizeOf(short) > SHORT_MAX)
      return fail('PARAM_INVALID_VALUE', `Tên viết tắt phải từ 1 đến ${SHORT_MAX} ký tự`, key);
    if (HAS_MARKUP.test(short)) return fail('PARAM_INVALID_VALUE', 'Tên viết tắt không được chứa ký tự < hoặc >', key);
    out.short = short;
  }
  if (value.copiedFrom !== undefined && value.copiedFrom !== null) {
    if (typeof value.copiedFrom !== 'string' || !CODE_RE.test(value.copiedFrom))
      return fail('PARAM_INVALID_VALUE', 'Chức vụ nguồn không hợp lệ', key);
    out.copiedFrom = value.copiedFrom;
  }
  if (value.deprecated !== undefined) {
    if (typeof value.deprecated !== 'boolean')
      return fail('PARAM_INVALID_VALUE', 'Ngưng dùng phải là Có hoặc Không', key);
    if (value.deprecated) out.deprecated = true;
  }
  return { ok: true, value: out, warnings: [] };
}
// Khoá chức vụ mới → khoá mẫu của chức vụ mặc định (cùng đuôi) để kiểm theo luật registry. ctx.params: bộ tham số hiện hành; ctx.positions: Set mã
// được định nghĩa trong cùng lô; structureOnly: không đòi định nghĩa chức vụ (store.resolve đọc lại dòng đã ghi)
function translate(key?, ctx: any = {}) {
  const hit: any = classify(key);
  if (!hit || hit.kind === 'def') return null;
  if (!CODE_RE.test(hit.code) || isReservedCode(hit.code))
    return {
      error: fail('PARAM_UNKNOWN_KEY', `Không có tham số "${String(key).slice(0, config.ERROR_ECHO_KEY_MAX)}"`, key)
    };
  const defined =
    ctx.structureOnly ||
    isBuiltin(hit.code) ||
    (ctx.positions && ctx.positions.has(hit.code)) ||
    (ctx.params && isObj(ctx.params[`position.def.${hit.code}`]));
  if (!defined)
    return {
      error: fail(
        'POSITION_UNKNOWN',
        `Chức vụ "${hit.code}" chưa được tạo; hãy thêm chức vụ trước rồi mới đặt giá trị`,
        key
      )
    };
  if (hit.kind === 'override') return { templateKey: Params.OVERRIDES[hit.suffix], hit, override: true };
  if (hit.kind === 'schedule') return { hit, schedule: true };
  if (hit.kind === 'levelOverride') {
    // khoá mẫu: cùng đuôi của chức vụ mặc định (nightOptions chỉ NV có); bậc phải có sẵn (hoặc được thêm trong cùng lô)
    const templateKey = builtinCodes.map(b => `type.${b}.${hit.suffix}`).find(k => Object.hasOwn(Params.DEFAULTS, k));
    const baseKey = `level.${hit.code}.${hit.level}.base`;
    const known =
      ctx.structureOnly || Object.hasOwn(ctx.params || {}, baseKey) || Object.hasOwn(ctx.draft || {}, baseKey);
    if (!templateKey || !known)
      return {
        error: fail(
          'POSITION_UNKNOWN_LEVEL',
          `Chức vụ "${hit.code}" chưa có bậc ${hit.level}; hãy thêm bậc trước rồi mới đặt quyền lợi theo bậc`,
          key
        )
      };
    return { templateKey, hit, override: true };
  }
  // Bậc không nhảy cóc: level.<mã>.<n>.* (n > 1) cần bậc n − 1 đã có (hoặc được thêm trong cùng lô); bộ đếm bậc đọc liên tiếp từ 1
  if (hit.kind === 'level' && hit.level > 1 && !ctx.structureOnly) {
    const previous = `level.${hit.code}.${hit.level - 1}.base`;
    if (!Object.hasOwn(ctx.params || {}, previous) && !Object.hasOwn(ctx.draft || {}, previous))
      return {
        error: fail(
          'POSITION_UNKNOWN_LEVEL',
          `Chức vụ "${hit.code}" chưa có bậc ${hit.level - 1}; hãy thêm bậc theo thứ tự (chức năng Thêm bậc của chức vụ)`,
          key
        )
      };
  }
  const templateKey =
    hit.kind === 'type'
      ? builtinCodes.map(b => `type.${b}.${hit.suffix}`).find(k => Object.hasOwn(Params.DEFAULTS, k))
      : builtinCodes.map(b => `level.${b}.1.${hit.suffix}`).find(k => Object.hasOwn(Params.DEFAULTS, k));
  if (!templateKey)
    return {
      error: fail('PARAM_UNKNOWN_KEY', `Không có tham số "${String(key).slice(0, config.ERROR_ECHO_KEY_MAX)}"`, key)
    };
  // Khoá khoá cố định của chức vụ mặc định (lịch làm việc) chỉ đặt được LÚC TẠO chức vụ (cùng lô với position.def.<mã>)
  const entry = registry.entryFor(templateKey)?.entry;
  const lockedKey = !!entry && (entry.class === 'fixed' || !registry.WRITE_CAP[entry.editableBy]);
  // null = bỏ bảng phụ cấp đêm của chức vụ (tính theo mức chung shift.night.bonus); chỉ nightOptions của chức vụ không phải NV nhận null
  if (hit.kind === 'type' && hit.suffix === 'nightOptions' && !Object.hasOwn(Params.DEFAULTS, key))
    return { templateKey, hit, override: true };
  return { templateKey, hit, creationOnly: lockedKey && !!ctx.positions && ctx.positions.has(hit.code) };
}

/* ---------- lịch làm việc của chức vụ ---------- */
// Danh sách thứ trong tuần: số nguyên từ 1 (Thứ Hai) đến unit.daysPerWeek − 1 (Chủ nhật không phải ngày làm), không trùng; trả bản đã sắp tăng dần
function validateScheduleList(key?, value?, ctx: any = {}) {
  const week =
    ctx.params && Object.hasOwn(ctx.params, 'unit.daysPerWeek')
      ? ctx.params['unit.daysPerWeek']
      : Params.DEFAULTS['unit.daysPerWeek'];
  if (
    !Array.isArray(value) ||
    value.some(d => !Number.isInteger(d) || d < 1 || d >= week) ||
    new Set<any>(value).size !== value.length
  )
    return fail(
      'PARAM_INVALID_VALUE',
      `Lịch làm việc phải là danh sách thứ từ 1 (Thứ Hai) đến ${week - 1}, không trùng nhau`,
      key
    );
  return { ok: true, value: [...value].sort((a: any, b: any) => a - b), warnings: [] };
}
// Kiểm chéo khoá trên bộ tham số SAU khi áp: lịch của chức vụ không rỗng
function scheduleErrors(set?) {
  const out: any[] = [];
  for (const code of codesOf(set)) {
    const dows = read(set, code, 'dows') || [];
    const key = `type.${code}.dows`;
    if (!dows.length)
      out.push({
        code: 'SCHEDULE_EMPTY',
        key,
        message: `Lịch của chức vụ ${code} cần ít nhất một ngày làm việc trong tuần`
      });
  }
  return out;
}

/* ---------- sao chép ---------- */
// Lô thay đổi của một chức vụ mới sao từ `source` trong bộ tham số `set`: định nghĩa trước, rồi mọi khoá type.<nguồn>.*, level.<nguồn>.*
// Khoá chỉ có ở danh mục chức vụ trong DB (src/domain/position/position-catalog.ts → paramRows), không có trong registry: không sao chép
const CATALOG_ONLY_SUFFIX = /\.nightPct$/;
function copyChanges(set?, source?, code?, def?) {
  const changes = [{ key: `position.def.${code}`, value: def }];
  const typePrefix = `type.${source}.`;
  const levelPrefix = `level.${source}.`;
  for (const key of Object.keys(set).sort()) {
    if (CATALOG_ONLY_SUFFIX.test(key)) continue;
    if (key.startsWith(typePrefix))
      changes.push({ key: `type.${code}.${key.slice(typePrefix.length)}`, value: Params.clone(set[key]) });
    else if (key.startsWith(levelPrefix))
      changes.push({ key: `level.${code}.${key.slice(levelPrefix.length)}`, value: Params.clone(set[key]) });
  }
  return changes;
}

// Chức vụ mặc định của tài khoản không nêu chức vụ (và của tài khoản Admin giữ chỗ): chức vụ đầu tiên trong danh mục chức vụ mặc định của registry
const defaultCode = registry.TYPES[0].value;

export = {
  defaultCode,
  CODE_RE,
  CODE_MIN,
  CODE_MAX,
  BENEFIT_FLAGS,
  LOCKED_NAMES,
  builtinCodes,
  isBuiltin,
  isReservedCode,
  classify,
  codeFromLabel,
  codesOf,
  defOf,
  list,
  entitlements,
  benefitsOf,
  validateDef,
  validateScheduleList,
  scheduleErrors,
  translate,
  buildLevel,
  copyChanges
};

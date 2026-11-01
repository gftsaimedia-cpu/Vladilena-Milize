'use strict';
// Khối phụ cấp do C&B thêm: khoá `block.def.<mã>` và `type.<chức vụ>.block.<mã>.<trường>` đi vào các họ khoá
// của bộ tham số như chức vụ (cùng một đường ghi PUT /api/settings/params; tháng áp dụng, lý do, nhật ký, hoàn tác). Phép tính ở src/engine/pay-blocks-calc.ts.
//   classify(key)                  { kind:'def', code } | { kind:'row', position, block, field } | null
//   validate(hit, key, value, ctx) kiểm cấu trúc (ctx.params, ctx.blocks: mã khối cùng lô, ctx.positions: mã chức vụ cùng lô, ctx.structureOnly)
//   buildCreate(set, body)         lô thay đổi của POST /api/blocks (chỉ dựng và kiểm, chưa ghi)
// Cờ thuế và bảo hiểm do C&B ĐỀ NGHỊ; chỉ có hiệu lực khi flagsConfirmedBy do Kế toán xác nhận qua PUT /api/blocks/:mã/confirm (máy chủ tự đặt, không tin client).
const Positions = require('./positions');
const config = require('../platform/config');
const PayBlocksCalc = require('../engine/pay-blocks-calc');

const DEF_RE = /^block\.def\.([^.]+)$/;
const ROW_RE = /^type\.([^.]+)\.block\.([^.]+)\.(on|amount|pct|byLevel\.[0-9]+)$/;
const LABEL_MAX = config.BLOCK_LABEL_MAX;
const HAS_MARKUP = /[<>]/; // nhãn không chứa dấu ngoặc nhọn của thẻ HTML (lớp phòng thủ thêm ở máy chủ)
const DEF_FIELDS = Object.freeze([
  'label',
  'component',
  'mode',
  'method',
  'scalesWithDays',
  'loss',
  'tax',
  'taxCap',
  'insuranceBase',
  'deprecated',
  'flagsConfirmedBy',
  'flagsConfirmedAt'
]);
const LOSS_KINDS = Object.freeze(['absentDays', 'overLimitHours']);
const METHOD_ALIAS = Object.freeze({ tiers: 'byLevel' }); // giao diện gọi "theo bậc" là tiers
const LABELS = Object.freeze({ on: 'bật', amount: 'số tiền', pct: 'tỷ lệ' });

const fail = (code?, message?, key?) => ({ ok: false, code, message, key });
const isObj = (v?) => !!v && typeof v === 'object' && !Array.isArray(v);
const isMoney = (v?) => Number.isSafeInteger(v) && v >= 0;

function classify(key?) {
  if (typeof key !== 'string') return null;
  let m = DEF_RE.exec(key);
  if (m) return { kind: 'def', code: m[1] };
  m = ROW_RE.exec(key);
  if (m) return { kind: 'row', position: m[1], block: m[2], field: m[3] };
  return null;
}

/* ---------- định nghĩa khối ---------- */
function validateDef(code?, value?, ctx: any = {}) {
  const key = `block.def.${code}`;
  if (!Positions.CODE_RE.test(code) || Positions.isReservedCode(code))
    return fail(
      'PARAM_INVALID_VALUE',
      `Mã khối chỉ gồm chữ không dấu và số, bắt đầu bằng chữ, từ ${Positions.CODE_MIN} đến ${Positions.CODE_MAX} ký tự`,
      key
    );
  if (value === null) return fail('PARAM_INVALID_VALUE', 'Khối không xoá được; hãy ngưng dùng (deprecated: true)', key);
  if (!isObj(value)) return fail('PARAM_INVALID_VALUE', 'Định nghĩa khối cần dạng { label, method, … }', key);
  for (const field of Object.keys(value))
    if (!DEF_FIELDS.includes(field))
      return fail(
        'PARAM_INVALID_VALUE',
        `Định nghĩa khối có trường lạ "${field.slice(0, config.ERROR_ECHO_FIELD_MAX)}"`,
        key
      );
  const label = typeof value.label === 'string' ? value.label.trim() : '';
  if (!label || [...label].length > LABEL_MAX)
    return fail('PARAM_INVALID_VALUE', `Tên khối phải từ 1 đến ${LABEL_MAX} ký tự`, key);
  if (HAS_MARKUP.test(label)) return fail('PARAM_INVALID_VALUE', 'Tên khối không được chứa ký tự < hoặc >', key);
  const method = METHOD_ALIAS[value.method] || value.method;
  if (!PayBlocksCalc.METHODS.includes(method))
    return fail('PARAM_INVALID_VALUE', `Cách tính phải là một trong: ${PayBlocksCalc.METHODS.join(', ')}`, key);
  const component = value.component === undefined ? '3' : String(value.component);
  if (component !== '3') return fail('PARAM_INVALID_VALUE', 'Khối thêm hiện chỉ thuộc phụ cấp (thành phần 3)', key);
  if (value.mode !== undefined && value.mode !== 'form')
    return fail('PARAM_INVALID_VALUE', 'Khối thêm hiện chỉ dùng biểu mẫu (mode: form)', key);
  if (value.scalesWithDays !== undefined && typeof value.scalesWithDays !== 'boolean')
    return fail('PARAM_INVALID_VALUE', 'Tỷ lệ theo ngày đi làm phải là Có hoặc Không', key);
  if (value.insuranceBase !== undefined && typeof value.insuranceBase !== 'boolean')
    return fail('PARAM_INVALID_VALUE', 'Tính vào nền bảo hiểm phải là Có hoặc Không', key);
  const tax = value.tax === undefined || value.tax === null ? 'none' : value.tax;
  if (!PayBlocksCalc.TAX_MODES.includes(tax))
    return fail('PARAM_INVALID_VALUE', `Cờ thuế phải là một trong: ${PayBlocksCalc.TAX_MODES.join(', ')}`, key);
  if (tax === 'cap' && !isMoney(value.taxCap))
    return fail('PARAM_INVALID_VALUE', 'Miễn thuế đến hạn mức cần hạn mức là số tiền nguyên không âm', key);
  let loss: any = null;
  if (value.loss !== undefined && value.loss !== null) {
    if (!isObj(value.loss) || !LOSS_KINDS.includes(value.loss.kind))
      return fail('PARAM_INVALID_VALUE', `Điều kiện mất khối phải là một trong: ${LOSS_KINDS.join(', ')}`, key);
    if (value.loss.kind === 'absentDays') {
      if (!Number.isSafeInteger(value.loss.days) || value.loss.days < 1)
        return fail('PARAM_INVALID_VALUE', 'Mất khối khi nghỉ cần số ngày nghỉ là số nguyên từ 1', key);
      loss = { kind: 'absentDays', days: value.loss.days };
    } else loss = { kind: 'overLimitHours' };
  }
  const out: Record<string, any> = {
    label,
    component,
    mode: 'form',
    method,
    scalesWithDays: value.scalesWithDays === true,
    loss,
    tax
  };
  if (tax === 'cap') out.taxCap = value.taxCap;
  out.insuranceBase = value.insuranceBase === true;
  if (value.deprecated !== undefined) {
    if (typeof value.deprecated !== 'boolean')
      return fail('PARAM_INVALID_VALUE', 'Ngưng dùng phải là Có hoặc Không', key);
    if (value.deprecated) out.deprecated = true;
  }
  for (const field of ['flagsConfirmedBy', 'flagsConfirmedAt']) {
    if (value[field] === undefined || value[field] === null) continue;
    if (typeof value[field] !== 'string' || !value[field].trim() || value[field].length > config.BLOCK_CONFIRM_MARK_MAX)
      return fail('PARAM_INVALID_VALUE', 'Dấu xác nhận của Kế toán không hợp lệ', key);
    out[field] = value[field];
  }
  return { ok: true, value: out, warnings: [] };
}

/* ---------- giá trị theo chức vụ ---------- */
function validateRow(hit?, key?, value?, ctx: any = {}) {
  if (!ctx.structureOnly) {
    const positionKnown =
      (ctx.positions && ctx.positions.has(hit.position)) ||
      (ctx.params && Object.hasOwn(ctx.params, `type.${hit.position}.workdays`));
    if (!positionKnown)
      return fail(
        'POSITION_UNKNOWN',
        `Chức vụ "${hit.position.slice(0, config.ERROR_ECHO_CODE_MAX)}" không có trong bảng chức vụ`,
        key
      );
    const blockKnown =
      (ctx.blocks && ctx.blocks.has(hit.block)) || (ctx.params && isObj(ctx.params[`block.def.${hit.block}`]));
    if (!blockKnown)
      return fail('PARAM_UNKNOWN_KEY', `Khối "${hit.block.slice(0, config.ERROR_ECHO_CODE_MAX)}" chưa được tạo`, key);
  }
  if (hit.field === 'on') {
    if (typeof value !== 'boolean') return fail('PARAM_INVALID_VALUE', 'Bật hoặc tắt khối phải là Có hoặc Không', key);
    return { ok: true, value, warnings: [] };
  }
  if (hit.field === 'pct') {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1)
      return fail('PARAM_INVALID_VALUE', 'Tỷ lệ phải là số từ 0 đến 1 (0,075 là 7,5 %)', key);
    return { ok: true, value, warnings: [] };
  }
  // amount và byLevel.<bậc>: số tiền đồng nguyên không âm
  if (!isMoney(value)) return fail('PARAM_INVALID_VALUE', 'Số tiền phải là số nguyên đồng không âm', key);
  return { ok: true, value, warnings: [] };
}
function validate(hit?, key?, value?, ctx: any = {}) {
  return hit.kind === 'def' ? validateDef(hit.code, value, ctx) : validateRow(hit, key, value, ctx);
}

/* ---------- POST /api/blocks ---------- */
const levelsOf = (set?, position?) => {
  const out: any[] = [];
  for (let n = 1; Object.hasOwn(set, `level.${position}.${n}.base`); n += 1) out.push(n);
  return out;
};
// Chuẩn hoá values { <chức vụ>: {on, amount|pct|byLevel} } hoặc positions [{ position, on, amount?, pct?, byLevel? }]
function valuesOf(body?) {
  if (isObj(body.values)) return body.values;
  if (Array.isArray(body.positions)) {
    const out: Record<string, any> = {};
    for (const p of body.positions) {
      if (!isObj(p) || typeof p.position !== 'string') return null;
      const { position, ...rest } = p;
      out[position] = rest;
    }
    return out;
  }
  return null;
}
// Trả { code, def, changes } hoặc ném lỗi dạng { code, message, status } để save.js đổi thành 400/409
function buildCreate(set?, body?) {
  const bad = (code?, message?, status = 400) => Object.assign(new Error(message), { code, httpStatus: status });
  const def = {
    label: body.label,
    component: body.component,
    mode: body.mode,
    method: body.method,
    scalesWithDays: body.scalesWithDays,
    loss: body.loss,
    tax: body.tax,
    taxCap: body.taxCap,
    insuranceBase: body.insuranceBase
  };
  for (const field of Object.keys(def)) if (def[field] === undefined) delete def[field];
  const code = Positions.codeFromLabel(typeof body.label === 'string' ? body.label : '');
  if (!code || Positions.isReservedCode(code))
    throw bad('PARAM_INVALID_VALUE', 'Tên khoản cần có ít nhất hai chữ cái hoặc số, bắt đầu bằng chữ');
  const checkedDef: any = validateDef(code, def);
  if (!checkedDef.ok) throw bad(checkedDef.code, checkedDef.message);
  if (Object.hasOwn(set, `block.def.${code}`))
    throw bad('BLOCK_CODE_CLASH', `Đã có khoản trùng mã "${code}"; hãy đặt tên khác`, 409);
  const values = valuesOf(body);
  if (!values || !Object.keys(values).length)
    throw bad('PARAM_INVALID_VALUE', 'Chọn ít nhất một chức vụ cho khoản này (values hoặc positions)');
  const changes = [{ key: `block.def.${code}`, value: checkedDef.value }];
  const method = checkedDef.value.method;
  for (const [position, spec] of Object.entries<any>(values)) {
    if (!Object.hasOwn(set, `type.${position}.workdays`))
      throw bad(
        'POSITION_UNKNOWN',
        `Chức vụ "${position.slice(0, config.ERROR_ECHO_CODE_MAX)}" không có trong bảng chức vụ`
      );
    if (!isObj(spec) || typeof spec.on !== 'boolean')
      throw bad('PARAM_INVALID_VALUE', `Chức vụ ${position}: cần on là Có hoặc Không`);
    const prefix = `type.${position}.block.${code}.`;
    changes.push({ key: `${prefix}on`, value: spec.on });
    if (method === 'fixed' && spec.amount !== undefined) changes.push({ key: `${prefix}amount`, value: spec.amount });
    if (method === 'pctBase' && spec.pct !== undefined) changes.push({ key: `${prefix}pct`, value: spec.pct });
    if (method === 'byLevel' && spec.byLevel !== undefined) {
      if (!isObj(spec.byLevel))
        throw bad('PARAM_INVALID_VALUE', `Chức vụ ${position}: byLevel cần dạng { <bậc>: số tiền }`);
      for (const [level, amount] of Object.entries<any>(spec.byLevel))
        changes.push({ key: `${prefix}byLevel.${level}`, value: amount });
    }
    if (!spec.on) continue;
    // chức vụ được bật phải có đủ giá trị: một số tiền, một tỷ lệ, hoặc số tiền của MỌI bậc
    if (method === 'fixed' && spec.amount === undefined)
      throw bad('PARAM_INVALID_VALUE', `Chức vụ ${position}: thiếu ${LABELS.amount}`);
    if (method === 'pctBase' && spec.pct === undefined)
      throw bad('PARAM_INVALID_VALUE', `Chức vụ ${position}: thiếu ${LABELS.pct}`);
    if (method === 'byLevel') {
      const missing = levelsOf(set, position).filter(n => !(isObj(spec.byLevel) && spec.byLevel[n] !== undefined));
      if (missing.length)
        throw bad('PARAM_INVALID_VALUE', `Chức vụ ${position}: thiếu số tiền của bậc ${missing.join(', ')}`);
    }
  }
  return { code, def: checkedDef.value, changes };
}

export = {
  classify,
  validate,
  validateDef,
  buildCreate,
  LOCKED_NAMES: Object.freeze(['block.def.<code>', 'type.<type>.block.<block>.<field>'])
};

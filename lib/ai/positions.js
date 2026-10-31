'use strict';
// Đọc cờ quyền lợi của chức vụ và định nghĩa khối phụ cấp từ bộ tham số phẳng của tháng.
// Thuần: không I/O, không đồng hồ. Chỉ ĐỌC; lib/ai/ không bao giờ ghi tham số.
//
//   benefitOf(params, type, flag, level?)  cờ quyền lợi: `level.<mã>.<bậc>.benefit.<cờ>` (nếu có bậc) rồi `type.<mã>.benefit.<cờ>` của chức vụ; vắng khoá (chức vụ lạ, cờ chưa có) là false,
//                                  khoá có mà không phải true/false là lỗi kiểu (khớp isRuleEnabled của thresholds.js)
//   positionFlagOf(params, type, tên)  cờ `type.<mã>.<tên>` bất kỳ (ví dụ startDateRequired); vắng khoá trong params thì lấy PayrollParams.DEFAULTS
//   blockDefsOf(params)            mọi khối do C&B thêm: [{ code, def }], từ khoá `block.def.<mã>` có giá trị là đối tượng
//
// Hình dạng định nghĩa khối mà lib/ai/ đọc: def.tax ('none' | 'full' | 'cap'), def.insuranceBase (true/false),
// def.deprecated, và dấu xác nhận của Kế toán: def.flagsConfirmedBy (chữ không rỗng) hoặc def.flagsConfirmed === true.

const PayrollParams = require('../../public/payroll-params.js');

const BENEFIT_PREFIX = 'benefit';
const BLOCK_DEF_RE = /^block\.def\.([^.]+)$/;
// Giá trị def.tax có nghĩa là C&B đề nghị miễn thuế (khớp tax_mode của khoản điền thêm)
const TAX_EXEMPT_MODES = Object.freeze(['full', 'cap']);

// Cờ đúng/sai theo chức vụ: khoá `type.<mã>.<tên>`. Vắng khoá trong params (bản chụp kỳ cũ chưa có khoá mới) thì lấy mặc định của
// PayrollParams.DEFAULTS; vẫn vắng (chức vụ lạ) là false.
function positionFlagOf(params, type, name) {
  const key = `type.${type}.${name}`;
  const value = params[key] === undefined ? PayrollParams.DEFAULTS[key] : params[key];
  if (value === undefined) return false;
  if (typeof value !== 'boolean') throw new TypeError(`Tham số ${key} phải là true hoặc false`);
  return value;
}

// Cờ quyền lợi, cùng chuỗi với lib/request-rules.js → benefitOf: `level.<mã>.<bậc>.benefit.<cờ>` (khi có `level` và khoá khác null) rồi
// `type.<mã>.benefit.<cờ>`, rồi false. Giữ bản riêng để lib/ai/ không phải nạp request-rules (kéo theo lib/db).
function benefitOf(params, type, flag, level) {
  if (level !== undefined && level !== null) {
    const key = `level.${type}.${level}.${BENEFIT_PREFIX}.${flag}`;
    const own = params[key];
    if (typeof own === 'boolean') return own;
    if (own !== undefined && own !== null) throw new TypeError(`Tham số ${key} phải là true hoặc false`);
  }
  return positionFlagOf(params, type, `${BENEFIT_PREFIX}.${flag}`);
}

function blockDefsOf(params) {
  const out = [];
  for (const [key, def] of Object.entries(params)) {
    const match = BLOCK_DEF_RE.exec(key);
    if (!match || !def || typeof def !== 'object' || Array.isArray(def)) continue;
    out.push({ code: match[1], def });
  }
  return out.sort((a, b) => a.code.localeCompare(b.code));
}

// Khối đang đề nghị cờ thuế hoặc bảo hiểm? Trả { taxMode, insuranceBase } đã chuẩn hoá, hoặc null khi không đề nghị gì
function requestedFlags(def) {
  const taxMode = TAX_EXEMPT_MODES.includes(def.tax) ? def.tax : null;
  const insuranceBase = def.insuranceBase === true;
  return taxMode || insuranceBase ? { taxMode, insuranceBase } : null;
}

const flagsConfirmed = def =>
  def.flagsConfirmed === true || (typeof def.flagsConfirmedBy === 'string' && def.flagsConfirmedBy.trim() !== '');

module.exports = { benefitOf, positionFlagOf, blockDefsOf, requestedFlags, flagsConfirmed, TAX_EXEMPT_MODES };

'use strict';
// Đồ dùng chung cho test của src/engine/formula.ts (bộ phân tích công thức gõ bằng tiếng Việt).
// Mỗi test mở đầu bằng loadFormula(); chưa có src/engine/formula.ts thì test đỏ với "module missing".
// Mọi giả định về hình dạng dữ liệu nằm ở ĐÂY (ctx của evaluate, cách đọc mã lỗi, serialize trả chuỗi hay đối tượng),
// để khi hình dạng đổi thì chỉ sửa một chỗ.
const assert = require('node:assert/strict');
const { pending, need } = require('./red');

// Cờ todo khi chưa có mô-đun; RED=1 ép chạy như test thường.
const READY = () => pending('V1: src/engine/formula.ts chưa có (bộ phân tích công thức)', 'src/engine/formula.ts');
const loadFormula = () => need('src/engine/formula.ts');

// ---------- từ vựng ----------
const word = (key?, label?, unit?, domain?, extra: any = {}) => ({
  key,
  label,
  synonyms: [],
  kind: 'variable',
  unit,
  domain,
  ...extra
});

// Từ vựng chuẩn: người bịa, số bịa. 'lương cơ bản' chỉ có MỘT nghĩa ở đây (không mơ hồ).
const STD_VOCAB = [
  word('luongCoBan', 'lương cơ bản', 'VND', 'month', { synonyms: ['LCB', 'lương CB'] }),
  word('tienNgayCong', 'tiền ngày công', 'VND', 'month'),
  word('phuCapCa', 'phụ cấp ca', 'VND', 'month', { kind: 'builtin' }),
  word('gioNghiDem', 'giờ nghỉ đêm', 'VND', 'month', { kind: 'builtin' }),
  word('lamBu', 'làm bù', 'VND', 'month', { kind: 'builtin' }),
  word('tienOt', 'tiền OT', 'VND', 'month', { kind: 'builtin', synonyms: ['OT'] }),
  word('tienLamLe', 'làm lễ', 'VND', 'month', { kind: 'builtin' }),
  word('diLai', 'đi lại', 'VND', 'month'),
  word('chuyenCan', 'chuyên cần', 'VND', 'month'),
  word('luongKpi', 'lương KPI', 'VND', 'month', { synonyms: ['KPI'] }),
  word('ngayDiLam', 'ngày đi làm', 'day', 'month'),
  word('ngayCongChuan', 'ngày công chuẩn', 'day', 'month'),
  word('gioVuotNguong', 'giờ vượt ngưỡng', 'hour', 'month'),
  word('gioOtNgay', 'giờ OT trong ngày', 'hour', 'day'),
  word('tienCaNgay', 'tiền ca trong ngày', 'VND', 'day'),
  word('tyLeDiLai', 'tỷ lệ đi lại', 'percent', 'month', { kind: 'parameter' }),
  word('tyLeChuyenCan', 'tỷ lệ chuyên cần', 'percent', 'month', { kind: 'parameter' }),
  word('nguongGioKpi', 'ngưỡng giờ KPI', 'hour', 'month', { kind: 'parameter' }),
  // vị từ của văn phạm khai là hàm có sẵn, đầu ra đếm/cờ
  word('giuChuyenCan', 'giữ được chuyên cần', 'count', 'month', { kind: 'builtin' }),
  word('idorm', 'ở iDorm', 'count', 'month', { kind: 'builtin' }),
  word('thueTncn', 'thuế TNCN', 'VND', 'month', { kind: 'builtin' }),
  // công thức có tên (vế trái được)
  word('tongThuNhap', 'tổng thu nhập', 'VND', 'month', { kind: 'formula' }),
  word('khoanA', 'khoản A', 'VND', 'month', { kind: 'formula' }),
  word('khoanB', 'khoản B', 'VND', 'month', { kind: 'formula' }),
  word('phuCapDiLai', 'phụ cấp đi lại', 'VND', 'month', { kind: 'formula' }),
  word('phuCapChuyenCan', 'phụ cấp chuyên cần', 'VND', 'month', { kind: 'formula' }),
  word('heSoNgayKpi', 'hệ số ngày KPI', 'ratio', 'month', { kind: 'formula' })
];

// Hai nghĩa cho "lương cơ bản": lương cơ bản của level và tiền lương theo ngày công.
const AMBIGUOUS_VOCAB = [
  word('luongCoBan', 'lương cơ bản của level', 'VND', 'month', { synonyms: ['lương cơ bản', 'LCB'] }),
  word('tienNgayCong', 'tiền lương theo ngày công', 'VND', 'month', { synonyms: ['lương cơ bản'] }),
  word('diLai', 'đi lại', 'VND', 'month'),
  word('chuyenCan', 'chuyên cần', 'VND', 'month'),
  word('luongKpi', 'lương KPI', 'VND', 'month'),
  word('tongThuNhap', 'tổng thu nhập', 'VND', 'month', { kind: 'formula' })
];

// ---------- đọc kết quả ----------
// serialize có thể trả chuỗi JSON hoặc đối tượng: chuẩn hoá về chuỗi để so sánh bằng nhau.
const ser = (Formula?, tree?) => {
  const s = Formula.serialize(tree);
  return typeof s === 'string' ? s : JSON.stringify(s);
};
const serObject = (Formula?, tree?) => {
  const s = Formula.serialize(tree);
  return typeof s === 'string' ? JSON.parse(s) : s;
};

// Mã lỗi từ errors (mỗi phần tử có code) và questions (nếu có code)
const codesOf = (res?) => [
  ...((res && res.errors) || []).map(e => e.code),
  ...((res && res.questions) || []).map(q => q.code).filter(Boolean)
];

const parseOk = (Formula?, text?, vocabulary = STD_VOCAB, extra: any = {}) => {
  const res = Formula.parse(text, { vocabulary, ...extra });
  assert.ok(res && res.ok === true, `phải phân tích được: ${JSON.stringify(text)} nhưng nhận ${JSON.stringify(res)}`);
  assert.ok(res.tree, 'ok:true phải có tree');
  return res;
};

// Phân tích, rồi (nếu ok) kiểm; trả danh sách lỗi gộp. Dùng khi lỗi có thể ra ở bước phân tích hoặc bước kiểm.
const checkAll = (Formula?, text?, vocabulary = STD_VOCAB, extra: any = {}) => {
  const res = Formula.parse(text, { vocabulary, ...extra });
  if (!res.ok) return { stage: 'parse', ok: false, errors: res.errors || [], res };
  const v = Formula.validate(res.tree, { vocabulary, ...extra });
  return { stage: 'validate', ok: v.ok === true, errors: v.errors || [], res, validation: v };
};

const codesIn = (list?) => list.map(e => e.code);

// Bao quanh: lỗi phải có mã, vị trí nguyên trong chữ
const assertPositioned = (errors?, text?) => {
  assert.ok(errors.length >= 1, 'phải có ít nhất một lỗi');
  for (const e of errors) {
    assert.equal(typeof e.code, 'string', `lỗi thiếu mã: ${JSON.stringify(e)}`);
    assert.match(e.code, /^(PARSE|FORMULA)_[A-Z_]+$/, `mã lỗi sai dạng: ${e.code}`);
    assert.equal(typeof e.message, 'string', 'lỗi thiếu message tiếng Việt');
    assert.ok(e.message.length > 0);
    assert.ok(
      e.at && Number.isInteger(e.at.start) && Number.isInteger(e.at.end),
      `lỗi thiếu vị trí: ${JSON.stringify(e)}`
    );
    assert.ok(
      e.at.start >= 0 && e.at.end >= e.at.start && e.at.end <= text.length,
      `vị trí ngoài chữ: ${JSON.stringify(e.at)}`
    );
  }
};

// Tìm một số (so với dung sai nhỏ) ở bất kỳ đâu trong kết quả phân tích (nút lit, tham số tự sinh, danh sách hằng...).
const containsNumber = (value?, wanted?, seen = new Set()) => {
  if (typeof value === 'number') return Math.abs(value - wanted) < 1e-12;
  if (!value || typeof value !== 'object' || seen.has(value)) return false;
  seen.add(value);
  return Object.values<any>(value).some(x => containsNumber(x, wanted, seen));
};

// ---------- ctx của evaluate ----------
// Giả định về dạng ctx:
//   ctx.variables[key] = số; ctx.parameters[key] = số; ctx.builtins[key] = (args, params) => số|bool; ctx.formulas[key] = cây.
// Nhận thêm tên gọi khác (vars/values/params/functions) để chịu được nhiều cách đặt tên của bộ tính.
const makeCtx = ({ variables = {}, parameters = {}, builtins = {}, formulas = {} }: any = {}) => ({
  variables,
  vars: variables,
  values: variables,
  parameters,
  params: parameters,
  builtins,
  functions: builtins,
  formulas
});

// Chạy chữ gõ vào: phân tích rồi tính. Trả số (hoặc ném nếu bộ tính ném).
const evalText = (Formula?, text?, ctxParts: any = {}, vocabulary = STD_VOCAB) => {
  const { tree } = parseOk(Formula, text, vocabulary);
  return Formula.evaluate(tree, makeCtx(ctxParts));
};

// Lỗi lúc tính: bộ tính ném (có .code) hoặc trả đối tượng có code. Trả mã, hoặc null nếu tính ra số bình thường.
const evalErrorCode = (Formula?, tree?, ctx?) => {
  let out;
  try {
    out = Formula.evaluate(tree, ctx);
  } catch (error) {
    return error.code || 'THROWN_WITHOUT_CODE';
  }
  if (typeof out === 'number') return null;
  if (out && typeof out === 'object' && out.code) return out.code;
  return `UNEXPECTED_RESULT:${JSON.stringify(out)}`;
};

module.exports = {
  READY,
  loadFormula,
  word,
  STD_VOCAB,
  AMBIGUOUS_VOCAB,
  ser,
  serObject,
  codesOf,
  codesIn,
  parseOk,
  checkAll,
  assertPositioned,
  containsNumber,
  makeCtx,
  evalText,
  evalErrorCode
};

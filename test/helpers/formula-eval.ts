'use strict';
// Đọc và tính chuỗi công thức của phiếu Admin (src/domain/payroll/slip-formulas.ts → formulasOf) cho các test công thức.
// Mỗi số trong công thức đi kèm tên hoặc đơn vị ("23 ngày công", "28.846,15 đ/giờ"): bộ đọc bỏ hết chữ, giữ số, phép tính và ngoặc,
// rồi tính bằng × ÷ + − (số kiểu vi-VN: 6.000.000; 1,5; 25%; phân số 56/9).
const assert = require('node:assert/strict');

const NUMBER = /^(?:\d{1,3}(?:\.\d{3})+|\d+)(?:,\d+)?/;
// khoảng trắng không ngắt dòng (U+00A0, nối số với tên) đọc như khoảng trắng thường;
// bỏ đơn vị đ/giờ, đ/ngày, đ/người rồi mọi chữ cái (tên số); khoảng trắng gộp lại
const stripNames = (text?) =>
  String(text)
    .replace(/\u00a0/g, ' ')
    .replace(/đ\/\p{L}+/gu, '')
    .replace(/\p{L}+/gu, '')
    .replace(/\s+/g, ' ')
    .trim();

function evaluate(text?) {
  const src = stripNames(text).replace(/\s+/g, '');
  let i = 0;
  const peek = () => src[i];
  function factor() {
    if (peek() === '−') {
      i += 1;
      return -factor();
    }
    if (peek() === '(') {
      i += 1;
      const v = expr();
      assert.equal(peek(), ')', `thiếu ")" trong "${text}"`);
      i += 1;
      return v;
    }
    const m = NUMBER.exec(src.slice(i));
    assert.ok(m, `không đọc được số tại "${src.slice(i)}" trong "${text}"`);
    i += m[0].length;
    const v = Number(m[0].replace(/\./g, '').replace(',', '.'));
    if (peek() === '%') {
      i += 1;
      return v / 100;
    }
    return v;
  }
  function term() {
    let v = factor();
    while (['×', '÷', '/'].includes(peek())) {
      const op = src[i++];
      const r = factor();
      v = op === '×' ? v * r : v / r;
    }
    return v;
  }
  function expr() {
    let v = term();
    while (['+', '−'].includes(peek())) {
      const op = src[i++];
      const r = term();
      v = op === '+' ? v + r : v - r;
    }
    return v;
  }
  const v = expr();
  assert.equal(i, src.length, `thừa ký tự sau "${src.slice(0, i)}" trong "${text}"`);
  return v;
}
// Sai số cho phép: 1 đồng mỗi bước làm tròn (mỗi số hạng cộng trừ là một bước) cộng 1
const toleranceOf = (text?) => 1 + (text.match(/ [+−] /g) || []).length;
// công thức dạng phép tính: sau khi bỏ tên chỉ còn số, phép tính, ngoặc (chữ ghi số quyết định có = < > ≤ ≥ thì không)
const isArithmetic = (text?) => /^[\d.,%\s×÷+−/()]+$/.test(stripNames(text));
const near = (text?, expected?, label?) => {
  const got = evaluate(text);
  assert.ok(Math.abs(got - expected) <= toleranceOf(text), `${label}: "${text}" = ${got}, số trên dòng ${expected}`);
};

// chuỗi công thức với khoảng trắng không ngắt dòng đổi về khoảng trắng thường; plainAll làm vậy cho mọi giá trị của đối tượng formulas
const plain = (text?) => String(text).replace(/\u00a0/g, ' ');
const plainAll = (formulas?) =>
  Object.fromEntries(Object.entries<any>(formulas).map(([key, text]: any) => [key, plain(text)]));

module.exports = { evaluate, near, isArithmetic, stripNames, toleranceOf, plain, plainAll };

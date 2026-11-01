'use strict';
// So sánh kép: chạy khối công thức cũ đã đóng băng và một bộ máy ứng viên trên CÙNG các ca sinh từ một hạt giống,
// đỏ nếu có bất kỳ khác biệt nào (so từng trường, không so gần đúng), và in hạt giống để chạy lại đúng ca đó.
//
//   payrollEngineDifferential(engineFn, { cases: 5000, seed, reference })
//     reference(input) -> như engineFn: bộ máy tham chiếu thay cho khối cũ (ví dụ cùng bộ máy với tham số mặc định); có reference thì so m nguyên vẹn, không bỏ trường nào
//     engineFn(input) -> { m, payDays?, pendingItems? }   (cùng hợp đồng với createLegacyEngine().computeMonth)
//     input        xem test/helpers/payroll-cases.ts
// So sánh: m (cả rows và m.net), và payDays, pendingItems khi ứng viên trả về. engineFn ném lỗi thì ca đó phải ném cùng thông báo ở khối cũ.
// Trường m.paidDays của bộ máy (khối cũ không có) và m.net.noPayDays (bộ máy đếm theo ngày có lương, khối cũ đếm khác) bị bỏ trước khi so;
// engineFn phải chạy với tax.insurance.skipDays rất lớn (xem test/helpers/legacy-params.ts) thì số bảo hiểm của bộ máy bằng khối cũ.
// Cũng đỏ khi một bộ máy sửa đầu vào (đầu vào là bản sao riêng cho từng bộ máy).
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { createLegacyEngine } = require('./legacy-payroll');
const { generateCases } = require('./payroll-cases');
const { withoutPaidDays, withoutNoPayDays } = require('./legacy-params');

// Đưa giá trị về đối tượng thường của realm hiện tại, khoá sắp xếp; số đặc biệt (NaN, vô cực, -0) và undefined được giữ phân biệt.
// Cần vì kết quả của vm khác prototype với đối tượng ngoài vm nên assert.deepStrictEqual sẽ báo lệch oan.
function toPlain(value?) {
  if (value === undefined) return { $: 'undefined' };
  if (typeof value === 'number')
    return Number.isFinite(value) && !Object.is(value, -0) ? value : { $: Object.is(value, -0) ? '-0' : String(value) };
  if (typeof value === 'bigint') return { $: 'bigint', v: String(value) };
  if (value === null || typeof value !== 'object') return value;
  if (value instanceof Set) return { $: 'Set', items: [...value].map(toPlain) };
  if (value instanceof Map) return { $: 'Map', items: [...value].map(([k, v]: any) => [toPlain(k), toPlain(v)]) };
  if (Array.isArray(value)) return value.map(toPlain);
  const out: Record<string, any> = {};
  for (const key of Object.keys(value).sort()) out[key] = toPlain(value[key]);
  return out;
}
const digest = (value?) =>
  crypto
    .createHash('sha256')
    .update(JSON.stringify(toPlain(value)))
    .digest('hex');

// Đường dẫn của khác biệt đầu tiên giữa hai giá trị đã qua toPlain, hoặc null nếu bằng nhau
function firstDiff(a?, b?, path = '') {
  if (a === b) return null;
  const objA = a && typeof a === 'object',
    objB = b && typeof b === 'object';
  if (!objA || !objB || Array.isArray(a) !== Array.isArray(b))
    return { path: path || '(gốc)', legacy: a, candidate: b };
  const keys = Array.isArray(a)
    ? [...Array(Math.max(a.length, b.length)).keys()]
    : [...new Set<any>([...Object.keys(a), ...Object.keys(b)])].sort();
  for (const key of keys) {
    const diff = firstDiff(a[key], b[key], path + (Array.isArray(a) ? `[${key}]` : path ? '.' + key : key));
    if (diff) return diff;
  }
  return null;
}
const show = (value?) => {
  const text = JSON.stringify(value);
  return text === undefined ? 'undefined' : text.length > 120 ? text.slice(0, 117) + '...' : text;
};

function run(fn?, input?) {
  const copy = JSON.parse(JSON.stringify(input));
  const before = digest(copy);
  try {
    const result = fn(copy);
    return { result, mutated: digest(copy) !== before };
  } catch (error) {
    return { error: String((error && error.message) || error), mutated: false };
  }
}

function payrollEngineDifferential(engineFn?, options: any = {}) {
  const { cases = 5000, seed, label = 'ứng viên', reference } = options;
  assert.ok(Number.isInteger(seed), 'payrollEngineDifferential cần seed là số nguyên (để in ra và chạy lại được)');
  assert.equal(typeof engineFn, 'function', 'payrollEngineDifferential cần engineFn(input)');
  assert.ok(reference === undefined || typeof reference === 'function', 'reference phải là hàm reference(input)');
  const legacy = reference ? { computeMonth: reference } : createLegacyEngine();
  const list = generateCases(seed, cases);
  const mismatches: any[] = [];
  let legacyErrors = 0;
  for (const c of list) {
    const expected = run(legacy.computeMonth, c.input);
    const actual = run(engineFn, c.input);
    if (expected.error !== undefined) legacyErrors++;
    let problem: any = null;
    if (expected.mutated) problem = { path: '(đầu vào bị khối cũ sửa)', legacy: true, candidate: false };
    else if (actual.mutated) problem = { path: `(đầu vào bị ${label} sửa)`, legacy: false, candidate: true };
    else if (expected.error !== undefined || actual.error !== undefined) {
      if (expected.error !== actual.error)
        problem = { path: '(lỗi)', legacy: expected.error ?? 'không lỗi', candidate: actual.error ?? 'không lỗi' };
    } else if (!actual.result || typeof actual.result !== 'object' || actual.result.m === undefined)
      problem = { path: 'm', legacy: 'có', candidate: 'engineFn không trả về { m }' };
    else {
      for (const key of ['m', 'payDays', 'pendingItems']) {
        if (key !== 'm' && actual.result[key] === undefined) continue;
        // so với khối cũ thì bỏ hai trường khối cũ không có; so với bộ máy tham chiếu thì giữ nguyên cả hai bên
        const candidate =
          key === 'm' && !reference ? withoutNoPayDays(withoutPaidDays(actual.result.m)) : actual.result[key];
        const legacySide = key === 'm' && !reference ? withoutNoPayDays(expected.result.m) : expected.result[key];
        problem = firstDiff(toPlain(legacySide), toPlain(candidate), key);
        if (problem) break;
      }
    }
    if (problem) mismatches.push({ id: c.id, index: list.indexOf(c), tags: c.tags, ...problem });
  }
  if (mismatches.length) {
    const first = mismatches[0];
    const lines = mismatches
      .slice(0, 5)
      .map(
        x => `  - ${x.id} [${x.tags.join(',')}] ${x.path}: khối cũ ${show(x.legacy)} khác ${label} ${show(x.candidate)}`
      );
    const message = [
      `payrollEngineDifferential: ${mismatches.length}/${list.length} ca lệch, hạt giống seed=${seed} (chạy lại: PAYROLL_DIFF_SEED=${seed}).`,
      `Ca lệch đầu tiên: ${first.id} (chỉ số ${first.index}).`,
      ...lines
    ].join('\n');
    console.error(message);
    throw new assert.AssertionError({ message, actual: mismatches.length, expected: 0, operator: 'differential' });
  }
  return { seed, cases: list.length, legacyErrors };
}

module.exports = { payrollEngineDifferential, toPlain, digest, firstDiff };

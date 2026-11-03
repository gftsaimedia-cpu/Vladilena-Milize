'use strict';
// Đồ dùng cho test API chức vụ và khối phụ cấp: dựng một tháng người bịa, thêm chức vụ bằng sao chép,
// đọc tham số hiệu lực của tháng. Dùng chung test/helpers/settings-api.ts (chạy dưới PostgreSQL runner).
// Chỗ tên trường chưa cố định, test đọc
// theo cách hợp lý nhất và chấp nhận vài tên: hàm `pick` và `findKey` dưới đây.
const assert = require('node:assert/strict');
const S = require('./settings-api');
const { Engine } = require('./pay-oracle');
const paramStore = require('../../src/params/store');

const { F, store } = S;

// Giá trị của trường đầu tiên có mặt trong số các tên cho trước (đọc nông)
const pick = (object?, names?) => {
  for (const name of names) if (object && object[name] !== undefined) return object[name];
  return undefined;
};
// Tìm sâu giá trị của một khoá (đầu tiên) trong cây JSON
function findKey(node?, key?, seen = new Set()) {
  if (!node || typeof node !== 'object' || seen.has(node)) return undefined;
  seen.add(node);
  if (Object.hasOwn(node, key)) return node[key];
  for (const value of Array.isArray(node) ? node : Object.values<any>(node)) {
    const hit = findKey(value, key, seen);
    if (hit !== undefined) return hit;
  }
  return undefined;
}
// Mọi số trong một cây JSON (để kiểm "có con số này trong phản hồi" mà không cần biết hình dạng)
function numbersIn(node?, out: any[] = [], seen = new Set()) {
  if (typeof node === 'number') out.push(node);
  else if (node && typeof node === 'object' && !seen.has(node)) {
    seen.add(node);
    for (const value of Array.isArray(node) ? node : Object.values<any>(node)) numbersIn(value, out, seen);
  }
  return out;
}
const hasNumber = (node?, expected?, tolerance = 0.5) => numbersIn(node).some(n => Math.abs(n - expected) <= tolerance);

// Mã chức vụ trong phản hồi của POST /api/positions
const codeOf = (res?) => pick(res.data, ['code']) ?? pick(res.data.position || {}, ['code']);

// Sao chép chức vụ qua API; trả phản hồi
const copyPosition = async (month, { label, copyFrom, reason = 'Thêm chức vụ để thử sao chép', who = 'admin' }: any) =>
  await F.call('POST', '/positions', { who, body: { label, copyFrom, effectiveMonth: month, reason } });
const mustCopy = async (month?, spec?) => {
  const res = await copyPosition(month, spec);
  assert.ok([200, 201].includes(res.status), `POST /api/positions: ${res.status} ${JSON.stringify(res.data)}`);
  const code = codeOf(res);
  assert.match(String(code), /^[a-z0-9]{2,16}$/, 'mã chức vụ sinh từ nhãn: chữ thường và số, 2 đến 16 ký tự');
  return code;
};
// Bộ tham số hiệu lực của tháng (phẳng) đúng như máy chủ dùng để tính lương
const paramsOf = async (month?) => (await paramStore.resolve(month)).params;
// Tháng riêng đã dựng người bịa (period-flow) và đồng hồ giả ở sau tháng đó.
// Dãy tháng GIẢM DẦN (2028-12 về 2026-10): param_versions chỉ-thêm-dòng và một dòng có hiệu lực từ tháng T mang sang MỌI tháng sau T, nên khối, chức vụ hay cờ
// do một test thêm không được rò sang test chạy sau nó: test sau lấy tháng NHỎ HƠN tháng hiệu lực của test trước.
function descendingPool() {
  const months: any[] = [];
  for (let y = 2028; y >= 2026; y--)
    for (let m = 12; m >= 1; m--) if (y > 2026 || m >= 10) months.push(`${y}-${String(m).padStart(2, '0')}`);
  let next = 0;
  return () => {
    if (next >= months.length) throw new Error('Hết tháng riêng cho test');
    return months[next++];
  };
}
async function setupMonth() {
  const month = await setupMonth.pool();
  await S.seed(month);
  return month;
}
setupMonth.pool = descendingPool();

module.exports = {
  ...S,
  Engine,
  pick,
  findKey,
  numbersIn,
  hasNumber,
  codeOf,
  copyPosition,
  mustCopy,
  paramsOf,
  setupMonth
};

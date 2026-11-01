'use strict';
// Đồ dùng cho các test "ca kiểm bằng tiền" của cấu hình thành phần lương.
//   runGolden(id, over)  chạy bộ máy dùng chung (DEFAULTS cộng `over`) trên đầu vào của một ca vàng hoặc ca có tên; không chạm DB
//   oracle               tái tính ĐỘC LẬP phần đuôi luật (thuế lũy tiến, khấu trừ 10 %, bảo hiểm, thực lĩnh) bằng hằng số viết tay ở đây,
//                        KHÔNG đọc bộ máy, để số tiền được kiểm bằng hai đường tính khác nhau
// Hằng số dưới đây sao từ src/engine/payroll-params.ts chỉ để làm chuẩn so sánh; bộ máy không đọc chúng.
const Engine = require('../../src/engine/payroll-engine');
const { DEFAULTS } = require('../../src/engine/payroll-params');
const { readGolden } = require('./golden');
const { LEGACY_OVERRIDE, legacyParams } = require('./legacy-params');
const { KNOWN_CASES, attendDeclaredDays } = require('./payroll-cases');
const { declaredPunches } = require('./declared-punches');

const golden = readGolden();
const caseOf = (id?) => {
  const hit = golden.cases.find(c => c.id === id) || KNOWN_CASES.find(c => c.id === id);
  if (!hit) throw new Error(`không có ca ${id}`);
  return hit;
};
const clone = (value?) => JSON.parse(JSON.stringify(value));
// Mặc định ở đây đặt tax.insurance.skipDays rất lớn như khối cũ không đếm ngày có lương (xem test/helpers/legacy-params.ts); `over` đè được.
// `over`: khoá tham số ghi đè (chỉ trong bộ nhớ). `edit(input)` sửa bản sao đầu vào (ví dụ đổi type, thêm ngày) trước khi tính.
async function runGolden(id?, over: any = {}, edit: any = null) {
  const hit = caseOf(id);
  const input = clone(hit.input);
  if (edit) await edit(input);
  // ca có tên đi làm đúng như các ngày đã khai, kể cả khi `edit` đổi ngày
  if (edit && hit.tags.includes('known')) attendDeclaredDays(input);
  else if (!input.sessions || !input.sessions.length) input.sessions = declaredPunches(input.staff, input.days);
  return Engine.create({ ...DEFAULTS, ...LEGACY_OVERRIDE, ...over }).computeMonth(input);
}
// So số có phần lẻ: so tới hai chữ số thập phân
const closeTo = (actual?, expected?, tolerance = 0.005) => Math.abs(actual - expected) <= tolerance;

/* ---------- tái tính độc lập phần đuôi ---------- */
const BRACKETS = [
  [10000000, 0.05],
  [30000000, 0.1],
  [60000000, 0.2],
  [100000000, 0.3],
  [Infinity, 0.35]
];
const progressive = (x?) => {
  let tax = 0,
    from = 0;
  for (const [to, rate] of BRACKETS) {
    if (x > from) tax += (Math.min(x, to) - from) * rate;
    from = to;
  }
  return tax;
};
const roundDong = Math.round;
const INSURANCE_EMPLOYEE = 0.08 + 0.015 + 0.01; // 10,5 %
const INSURANCE_EMPLOYER = 0.175 + 0.03 + 0.01; // 21,5 %
const CASUAL_RATE = 0.1;
const CASUAL_THRESHOLD = 5000000;
const PERSONAL_DEDUCTION = 15500000;

// Thực lĩnh và các khoản của một người sau khi thêm khoản vào bộ máy. `m` là kết quả của bộ máy KHÔNG có khoản thêm; chỉ dùng các
// số đầu vào của nó (tổng thu nhập, tạm ứng, bảo hiểm, thu nhập chịu thuế, giảm trừ gia cảnh), phần còn lại tính lại ở đây.
// Thuế hợp đồng dài: thu nhập tính thuế = chịu thuế − bảo hiểm − giảm trừ gia cảnh (15,5 triệu + 6,2 triệu × người phụ thuộc,
// m.net.deduction), phần dương áp biểu lũy tiến; chỉ phát sinh khi chịu thuế − bảo hiểm lớn hơn giảm trừ bản thân (so sánh gt).
//   addTaxable   khoản cộng chịu thuế (đồng)        addExempt  khoản cộng được miễn thuế (không vào thu nhập chịu thuế)
//   addInsBase   khoản cộng vào nền bảo hiểm        deductAfterTax  khoản trừ sau thuế
function netAfter(m?, { addTaxable = 0, addExempt = 0, addInsBase = 0, deductAfterTax = 0 }: any = {}) {
  const add = addTaxable + addExempt;
  const total = m.total + add;
  const insurance = m.net.insurance + addInsBase * INSURANCE_EMPLOYEE;
  let tax;
  if (m.net.contract === 'short') {
    tax = total >= CASUAL_THRESHOLD ? roundDong(total * CASUAL_RATE) : 0;
  } else {
    const income = m.net.taxable + addTaxable - insurance;
    const assessable = Math.max(0, income - m.net.deduction);
    tax = income > PERSONAL_DEDUCTION ? roundDong(progressive(assessable)) : 0;
  }
  const employer = m.net.employer + addInsBase * INSURANCE_EMPLOYER;
  const net = roundDong(total - m.net.advance) - insurance - tax - deductAfterTax;
  return { total, insurance, tax, employer, net, advance: m.net.advance };
}

module.exports = {
  Engine,
  DEFAULTS,
  LEGACY_DEFAULTS: legacyParams(),
  golden,
  caseOf,
  clone,
  runGolden,
  closeTo,
  oracle: { progressive, netAfter, roundDong, INSURANCE_EMPLOYEE, INSURANCE_EMPLOYER }
};

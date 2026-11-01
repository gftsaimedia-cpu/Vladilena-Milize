'use strict';
// Đồ dùng cho các test so bộ máy với khối công thức cũ đã đóng băng (test/fixtures/legacy-payroll-block.js).
// Khối cũ đếm ngày không lương của quy tắc 14 ngày theo nghỉ không lương, nghỉ được duyệt, vắng và ngày trước ngày bắt đầu; bộ máy đếm theo
// ngày công chuẩn trừ ngày có lương (m.paidDays), nên khi so với khối cũ phải đặt tax.insurance.skipDays rất lớn để cả hai bên cùng đóng bảo hiểm
// trong mọi tháng, và bỏ trường m.paidDays (khối cũ không có trường này); m.net.noPayDays của hai bên đếm khác nhau nên so từng trường phải bỏ cả trường này (withoutNoPayDays).
// Khối cũ cũng không tính ngày "Nghỉ được duyệt" vào ngày nghỉ xét chuyên cần và giờ vượt ngưỡng; bộ máy thì tính
// (khoá request.type.approved.countsAbsent), nên khi so với khối cũ phải tắt cờ đó cho hai bên cùng cách hiểu.
const { DEFAULTS } = require('../../src/engine/payroll-params');

const LEGACY_OVERRIDE = Object.freeze({
  'tax.insurance.skipDays': 999,
  'request.type.approved.countsAbsent': false,
  // Khối cũ đoán loại ca theo giờ có mặt và lấy hợp đồng từ hồ sơ, không theo thâm niên
  'shift.allowance.basis': 'present',
  'tax.contract.basis': 'declared'
});
// Bộ tham số mặc định như khối cũ hiểu (cộng `over` nếu có)
const legacyParams = (over: any = {}) => ({ ...DEFAULTS, ...LEGACY_OVERRIDE, ...over });
// Bản sao m không có m.paidDays (khối cũ không có trường này); không sửa đối tượng gốc
function withoutPaidDays(m?) {
  if (!m || typeof m !== 'object' || !('paidDays' in m)) return m;
  const { paidDays, ...rest } = m;
  return rest;
}
// Bản sao m không có m.net.noPayDays; không sửa đối tượng gốc
function withoutNoPayDays(m?) {
  if (!m || typeof m !== 'object' || !m.net || !('noPayDays' in m.net)) return m;
  const { noPayDays, ...net } = m.net;
  return { ...m, net };
}

module.exports = { LEGACY_OVERRIDE, legacyParams, withoutPaidDays, withoutNoPayDays };

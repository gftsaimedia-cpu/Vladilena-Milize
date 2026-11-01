'use strict';
// Bộ tham số mặc định với ba khoá của bản chụp cũ chưa có: phụ cấp ca đoán theo giờ có mặt (không có danh mục ca trong bộ nhớ),
// hợp đồng tính thuế và bảo hiểm lấy từ hồ sơ. Các test kiểm công thức theo giờ vào – ra dùng bộ này để số tiền không phụ thuộc danh mục ca;
// bản chụp lần chạy cũ thiếu ba khoá đó cũng được bộ máy tính đúng như vậy.
const { DEFAULTS } = require('../../src/engine/payroll-params');

const OLD_BASIS = Object.freeze({
  'shift.allowance.basis': 'present',
  'tax.contract.basis': 'declared'
});

module.exports = { DEFAULTS: { ...DEFAULTS, ...OLD_BASIS }, OLD_BASIS };

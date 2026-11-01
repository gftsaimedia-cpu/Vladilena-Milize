'use strict';
// Bộ máy tính lương cho review.js: trả PayrollEngine.create(params) của src/engine/payroll-engine.js.
// Không dùng vm, không đọc file nào: chỉ require hai mô-đun dùng chung của public/ (thuần, UMD).
// params là bộ tham số phẳng: PayrollParams.DEFAULTS (mặc định) hoặc `store.resolve(tháng).params` do máy chủ truyền vào.
// Kết quả có calcMonth, calcDay, calcNet, payslip, computeMonth(input) và params; review.js dùng computeMonth và calcMonth.
const PayrollEngine = require('../engine/payroll-engine.js');
const PayrollParams = require('../engine/payroll-params.js');

function loadPayroll(params = PayrollParams.DEFAULTS) {
  return PayrollEngine.create(params);
}

export = { loadPayroll };

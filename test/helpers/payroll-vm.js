'use strict';
// Bộ nạp DUY NHẤT cho khối công thức lương CŨ trong vm.
// Khối công thức chỉ còn bản ĐÓNG BĂNG
// test/fixtures/legacy-payroll-block.js. Bộ máy đang chạy là public/payroll-engine.js,
// được so với bản đóng băng này bởi payroll-engine-differential.test.js và payroll-golden.test.js.
//
//   const { api } = loadPayroll({ exports: ['calcDay', 'calcMonth'] });
//   const { api } = loadPayroll({ libs: ['payroll-calendar', 'kpi-score'], exports: [...] });
//
// Tuỳ chọn:
//   libs     tên file trong public/ chạy trong vm TRƯỚC khối công thức (mặc định ['payroll-calendar'], giống các test cũ)
//   globals  thuộc tính thêm cho ngữ cảnh vm
//   prelude  mã chạy ngay trước khối công thức
//   exports  tên các hàm / hằng gom vào `context[exportAs]` (mặc định exportAs = 'payroll')
//   append   mã thô chạy sau cùng (thay hoặc thêm cho exports)
//   timeout  mili giây, truyền cho vm.runInContext; bỏ trống = không giới hạn
// Trả { context, api, run(code) }: api = context[exportAs]; run chạy mã thêm trong cùng ngữ cảnh.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const PUBLIC_DIR = path.join(__dirname, '../../public');
const FIXTURE = path.join(__dirname, '../fixtures/legacy-payroll-block.js');

function loadPayroll(options = {}) {
  const {
    libs = ['payroll-calendar'],
    globals = {},
    prelude = '',
    exports: names = [],
    exportAs = 'payroll',
    append = '',
    timeout
  } = options;
  for (const removed of ['source', 'scope', 'slices'])
    if (options[removed] !== undefined)
      throw new Error(
        `loadPayroll: tuỳ chọn "${removed}" đã bỏ cùng giao diện cũ (public/index.html); chỉ còn khối đóng băng ${path.basename(FIXTURE)}`
      );
  const block = fs.readFileSync(FIXTURE, 'utf8');
  const run = (code, context) => vm.runInContext(code, context, timeout === undefined ? undefined : { timeout });
  const context = vm.createContext({ ...globals });
  for (const lib of libs)
    vm.runInContext(fs.readFileSync(path.join(PUBLIC_DIR, lib + '.js'), 'utf8'), context, { filename: lib + '.js' });
  const exporter = names.length ? `this.${exportAs} = { ${names.join(', ')} };` : '';
  run([prelude, block, exporter, append].filter(Boolean).join('\n'), context);
  return { context, api: context[exportAs], run: code => vm.runInContext(code, context) };
}

module.exports = { loadPayroll, PUBLIC_DIR };

'use strict';
// Test đỏ viết trước: cho tới khi mô-đun chủ của chúng có mặt, chúng chạy như `todo`
// (vẫn chạy, in lỗi, nhưng KHÔNG làm npm test đỏ). Khi file chủ xuất hiện,
// cờ todo tự biến mất và chúng thành test bắt buộc: đỏ nghĩa là mô-đun mới làm chưa xong hoặc làm sai.
//   RED=1 npm test      ép chạy như test thường để thấy từng test đỏ vì lý do gì
//   const opts = pending('src/domain/period/periods.ts chưa có', 'src/domain/period/periods.ts');  test('...', opts, fn)
//   pendingUnless('...', mentions('src/server.ts', /assertPeriodOpen/)) khi cờ là một điều kiện thay vì một file
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

const ROOT = path.join(__dirname, '../..');
const exists = (rel?) => fs.existsSync(path.join(ROOT, rel));

function pending(why, ...requiredFiles) {
  if (process.env.RED === '1') return {};
  return requiredFiles.every(exists) ? {} : { todo: why };
}

// Như pending nhưng theo điều kiện tuỳ ý (ví dụ server.js đã nhắc tới một route hay hàm mới chưa)
function pendingUnless(why?, ready?) {
  if (process.env.RED === '1') return {};
  return ready ? {} : { todo: why };
}
// server.js hoặc một file bất kỳ của dự án có khớp mẫu không
const mentions = (rel?, pattern?) => exists(rel) && pattern.test(fs.readFileSync(path.join(ROOT, rel), 'utf8'));

// Nạp mô-đun của dự án; chưa có thì đỏ bằng thông báo rõ ràng thay vì MODULE_NOT_FOUND
function need(rel?) {
  assert.ok(exists(rel), `module missing: ${rel} chưa được tạo (xem docs/superpowers/plans/2026-10-15-backend-v4.md)`);
  return require(path.join(ROOT, rel));
}

module.exports = { pending, pendingUnless, mentions, need, exists, ROOT };

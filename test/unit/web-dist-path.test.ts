'use strict';
// Đường dẫn mặc định của giao diện đã build phải trỏ tới <gốc dự án>/web/dist, bất kể file http.ts nằm sâu mấy cấp
// (từng lệch một cấp khi gộp lib/ vào src/platform/, làm "/" trả 503 trong image Docker).
// Đọc biểu thức trong mã nguồn thay vì nạp http.ts, vì nạp nó mở cơ sở dữ liệu.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('WEB_DIST mặc định là <gốc dự án>/web/dist', () => {
  const file = path.join(__dirname, '../../src/platform/http.ts');
  const m = /const WEB_DIST = path\.resolve\(process\.env\.WEB_DIST \|\| path\.join\(__dirname, ([^)]*)\)\)/.exec(
    fs.readFileSync(file, 'utf8')
  );
  assert.ok(m, 'không thấy khai báo WEB_DIST');
  const segments = m[1].split(',').map(s => s.trim().replace(/^'|'$/g, ''));
  assert.equal(path.resolve(path.dirname(file), ...segments), path.resolve(__dirname, '../../web/dist'));
});

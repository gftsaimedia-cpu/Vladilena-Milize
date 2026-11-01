'use strict';
// Script chạy trong tiến trình con (node -e) dùng store: src/platform/db.ts nâng cấp dữ liệu bất đồng bộ lúc nạp và mọi lệnh store trả Promise,
// nên bọc script thành hàm async, chờ store.ready ngay sau dòng require và báo lỗi bằng mã thoát 1.
function wrapScript(script?) {
  const waited = script.replace(/const store = require\(([^;]*)\);/, 'const store = require($1); await store.ready;');
  return `(async () => {${waited}\n})().catch(error => { console.error(error); process.exit(1); });`;
}

module.exports = { wrapScript };

'use strict';
// params:lock — ghi tên khoá (mẫu khoá của từng mục registry, hoặc id của mục không có khoá) vào lib/params/keys.lock.json.
// Chỉ THÊM: tên đã có trong tệp không bao giờ bị xoá ở đây (muốn bỏ khoá thì đặt deprecated: true ở registry; tệp vẫn giữ).
// Diff của tệp chỉ có dòng thêm. Tệp khoá không có chỗ trong public/ (ai cũng tải được thư mục đó).
const fs = require('node:fs');
const path = require('node:path');
process.env.DB_PATH = process.env.DB_PATH || ':memory:';
const { lockedNames } = require('./check');
const registry = require('../../lib/params/registry.ts');

const FILE = path.join(__dirname, '..', '..', 'lib/params/keys.lock.json');
const released = new Date().toISOString().slice(0, 10);
const domainOf = name => name.split('.')[0];

const old = fs.existsSync(FILE) ? JSON.parse(fs.readFileSync(FILE, 'utf8')) : { version: 1, keys: {} };
const keys = { ...old.keys };
const added = [];
for (const name of lockedNames()) {
  if (keys[name]) continue;
  keys[name] = { domain: domainOf(name), released };
  added.push(name);
}
const sorted = Object.fromEntries(
  Object.keys(keys)
    .sort()
    .map(k => [k, keys[k]])
);
fs.writeFileSync(
  FILE,
  JSON.stringify(
    {
      version: 1,
      note: 'Khoá đã phát hành: không đổi tên, không xoá (npm run params:check). Họ khoá khoá theo mẫu.',
      keys: sorted
    },
    null,
    2
  ) + '\n'
);
console.log(
  `keys.lock.json: ${Object.keys(sorted).length} tên khoá (${added.length} mới thêm); registry ${registry.entries.length} mục`
);

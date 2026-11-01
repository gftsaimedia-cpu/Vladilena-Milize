'use strict';
// Vá src/params/registry.data.json bằng chữ trong scripts/params/plain-text.json (xem plain-text.js). Chạy lại được, kết quả như nhau.
//   node scripts/params/apply-plain-text.ts
const fs = require('node:fs');
const path = require('node:path');
const { applyPlainText } = require('./plain-text');

const FILE = path.join(__dirname, '..', '..', 'src', 'params', 'registry.data.json');
const data = JSON.parse(fs.readFileSync(FILE, 'utf8'));
applyPlainText(data.entries);
fs.writeFileSync(FILE, JSON.stringify(data, null, 2) + '\n');
console.log(
  `Đã vá ${data.entries.length} mục của registry.data.json; chạy npx prettier --write src/params/registry.data.json`
);

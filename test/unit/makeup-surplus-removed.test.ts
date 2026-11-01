'use strict';
// Cài đặt makeup.surplus (cách trả phần giờ bù trước chưa dùng) không còn: bộ máy luôn trả đủ giờ làm bù theo giờ, nên khoá không còn trong
// bộ tham số mặc định, dữ liệu registry, bảng khoá phát hành, tệp mô tả tham số và giao diện cài đặt.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Engine = require('../../src/engine/payroll-engine');
const { DEFAULTS } = require('../../src/engine/payroll-params');

const ROOT = path.join(__dirname, '../..');
const read = (file?) => fs.readFileSync(path.join(ROOT, file), 'utf8');

test('makeup.surplus không còn trong DEFAULTS, registry.data.json, keys.lock.json và các tệp mô tả tham số', async () => {
  assert.ok(!Object.hasOwn(DEFAULTS, 'makeup.surplus'));
  for (const file of [
    'src/params/registry.data.json',
    'src/params/keys.lock.json',
    'scripts/params/hand-defaults.json',
    'scripts/params/plain-text.json'
  ])
    assert.ok(!(await read(file)).includes('makeup.surplus'), file);
});

test('không còn mã đọc hay hiển thị cài đặt makeup.surplus trong máy chủ và giao diện', async () => {
  for (const dir of ['src']) {
    const walk = (folder?) =>
      fs.readdirSync(path.join(ROOT, folder), { withFileTypes: true }).flatMap(entry => {
        const rel = path.posix.join(folder, entry.name);
        return entry.isDirectory() ? walk(rel) : /\.(js|html|json)$/.test(entry.name) ? [rel] : [];
      });
    for (const file of walk(dir)) assert.ok(!(await read(file)).includes('makeup.surplus'), file);
  }
});

test('giờ làm bù khi không còn giờ thiếu vẫn trả đủ giờ đã khai (2 giờ × lương giờ) dù truyền khoá makeup.surplus cũ', () => {
  const day = { kind: 'work', in: '08:00', out: '17:00', extraKind: 'makeup', extraOut: '19:00' };
  const nv = { type: 'nv', level: 1, nightPct: 40 };
  const pay = (params?) =>
    Engine.create(params).calcDay(nv, day, false, 0, { date: '2026-10-05', holidays: [] }).makeupPay;
  const hourly = 6000000 / 26 / 8;
  assert.ok(Math.abs(pay(DEFAULTS) - 2 * hourly) < 1e-6);
  assert.equal(pay({ ...DEFAULTS, 'makeup.surplus': 'payX1' }), pay(DEFAULTS));
});

'use strict';
// Chống "xanh giả": test bị đặt thành `todo` không làm npm test đỏ.
// Kiểm tĩnh nằm trong npm test; kiểm động (đếm `# todo` của cả bộ) là test/tools/check-todo.js.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { staticSources, mentionFlags, load, ROOT } = require('../tools/check-todo');
const { serverSource } = require('../helpers/server-source');

const baseline = load();

test('todo: số chỗ nguồn gây todo trong test/ không tăng so với baseline (theo từng file, và không có file mới)', () => {
  const now = staticSources();
  const grown = Object.entries(now)
    .filter(([rel, n]) => n > (baseline.sources[rel] || 0))
    .map(([rel, n]) => `${rel}: ${baseline.sources[rel] || 0} -> ${n}`);
  assert.deepEqual(
    grown,
    [],
    'Có test mới bị đặt thành todo (pending()/pendingUnless()/{ todo }) làm test âm thầm không đỏ. Cách tốt nhất: viết test bắt buộc. Nếu todo là CÓ CHỦ ĐÍCH (test viết đỏ trước, chờ tính năng), chạy: node test/tools/check-todo.js --write-sources --allow-growth, rồi ghi lý do vào thông điệp commit.'
  );
});

test('todo: baseline có số liệu hợp lệ', () => {
  assert.ok(Number.isInteger(baseline.todo) && baseline.todo >= 0);
  assert.ok(baseline.tests > 1000);
  assert.ok(Object.keys(baseline.sources).length > 5);
});

// Cờ trỏ vào mã đã có (server.js) mà hết khớp là cờ hỏng: test âm thầm thành todo. Cờ trỏ vào tính năng CHƯA làm (viết đỏ trước, vd. lib/authz.js
// chưa có route history) là todo có chủ đích và đã được số chỗ nguồn ở trên đếm, nên không đòi khớp.
test('todo: mọi cờ mentions("src/server.ts", /mẫu/) còn khớp server.js (mẫu hết khớp = test âm thầm thành todo)', () => {
  const flags = mentionFlags();
  const text = fs.readFileSync(path.join(ROOT, 'src/server.ts'), 'utf8');
  const dead = flags
    .filter(flag => flag.file === 'src/server.ts' && !new RegExp(flag.source, flag.flags).test(text))
    .map(flag => `${flag.test}: mentions('src/server.ts', /${flag.source}/) không khớp`);
  assert.deepEqual(dead, [], 'cờ này đang tắt phủ của test; sau khi chia server.js hãy bỏ cờ (test thành bắt buộc)');
});

test('todo: cờ mentions("src/server.ts", …) vẫn khớp trong tổng mã máy chủ (serverSource) nên bỏ cờ đi không mất phủ', () => {
  const source = serverSource();
  const missing = mentionFlags()
    .filter(flag => flag.file === 'src/server.ts')
    .filter(flag => !new RegExp(flag.source, flag.flags).test(source))
    .map(flag => `${flag.test}: /${flag.source}/`);
  assert.deepEqual(missing, []);
});

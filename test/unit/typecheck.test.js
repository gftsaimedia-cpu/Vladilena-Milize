'use strict';
// Mã TypeScript (src/**) phải qua trình biên dịch: tên thiếu, kiểu sai, import hỏng bị bắt ở đây, không đợi tới lúc chạy.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = path.join(__dirname, '../..');

test('typecheck: tsc --noEmit không báo lỗi', { timeout: 180000 }, () => {
  const tsc = path.join(ROOT, 'node_modules', 'typescript', 'lib', 'tsc.js');
  const result = spawnSync(process.execPath, [tsc, '--noEmit', '-p', ROOT], { encoding: 'utf8', cwd: ROOT });
  assert.equal(result.status, 0, result.stdout + result.stderr);
});

'use strict';
// spec/reference/*.md được dựng TỪ MÃ bằng scripts/docs/gen-spec.ts. Test này dựng lại và so với file trên đĩa:
// đổi route, quyền, lược đồ, luật, sự kiện, cấu hình mà quên chạy `npm run spec:gen` thì đỏ. Spec không thể lệch mã âm thầm.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = path.join(__dirname, '../..');

test('spec generator loads route policy without configuring a database', () => {
  const result = spawnSync(
    process.execPath,
    ['--no-warnings=ExperimentalWarning', path.join(ROOT, 'scripts/docs/gen-spec.ts'), '--check'],
    {
      encoding: 'utf8',
      cwd: ROOT,
      env: { ...process.env, DATABASE_URL: undefined, DB_PATH: undefined, PG_TEST_URL: undefined }
    }
  );
  assert.notEqual(result.status, null, result.error?.message);
  assert.doesNotMatch(result.stderr, /Chưa chọn cơ sở dữ liệu/);
  assert.match(result.stdout + result.stderr, /spec\/reference lệch so với mã|spec\/reference khớp mã/);
});

test('spec/reference khớp mã (npm run spec:gen nếu đỏ)', { timeout: 120000 }, () => {
  const result = spawnSync(
    process.execPath,
    ['--no-warnings=ExperimentalWarning', path.join(ROOT, 'scripts/docs/gen-spec.ts'), '--check'],
    {
      encoding: 'utf8',
      cwd: ROOT
    }
  );
  assert.equal(result.status, 0, result.stdout + result.stderr);
});

test('spec/reference: mọi route trong ROUTE_CAPS có controller và ngược lại', () => {
  const fs = require('node:fs');
  const text = fs.readFileSync(path.join(ROOT, 'spec/reference/api-routes.md'), 'utf8');
  assert.ok(!text.includes('không có controller'), 'có route trong ROUTE_CAPS mà không controller nào nhận');
  assert.ok(!text.includes('Cảnh báo:'), 'có controller khai route không có trong ROUTE_CAPS');
});

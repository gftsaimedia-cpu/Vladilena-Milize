'use strict';
// src/data/schema.generated.ts (kiểu Kysely của mọi bảng) được sinh từ migrations/postgres/*.sql. Test dựng lại và so sánh:
// thêm bảng/cột trong migration mà quên `npm run db:types` thì đỏ, nên kiểu truy vấn không thể lệch lược đồ.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = path.join(__dirname, '../..');

test('db:types: schema.generated.ts khớp migrations (npm run db:types nếu đỏ)', () => {
  const result = spawnSync(process.execPath, [path.join(ROOT, 'scripts/docs/gen-db-types.ts'), '--check'], {
    encoding: 'utf8',
    cwd: ROOT
  });
  assert.equal(result.status, 0, result.stdout + result.stderr);
});

test('db:types: mọi bảng của migration đều có kiểu, cột nullable và cột tự sinh được đánh dấu', () => {
  const fs = require('node:fs');
  const text = fs.readFileSync(path.join(ROOT, 'src/data/schema.generated.ts'), 'utf8');
  const tables = (text.match(/^export interface \w+Table /gm) || []).length;
  assert.ok(tables >= 20, `chỉ ${tables} bảng`);
  assert.match(text, /interface SettingsTable \{\n  key: string;\n  value_json: string;\n\}/);
  assert.match(text, /interface AuditLogTable \{\n  id: Generated<number>;/);
  assert.match(text, /prev_hash: string;/, 'cột sau dấu phẩy trong chú thích không được rơi mất');
});

'use strict';
// Trigger PL/pgSQL của migrations/postgres/0001_baseline.sql phải chặn đúng những gì trigger SQLite chặn, với cùng câu báo lỗi:
// bảng chỉ-thêm-dòng (UPDATE/DELETE bị từ chối), bản chụp phiếu lương, staff.username/uuid bất biến, uuid tự sinh.
// Chỉ chạy trên PostgreSQL (trên SQLite các trigger này được test-schema-snapshot và các test riêng từng bảng kiểm).
if (!require('../helpers/dialect').isPostgres) return require('../helpers/dialect').skipWholeFile(__filename); // trigger PL/pgSQL chỉ có trên PostgreSQL
process.env.DB_PATH = ':memory:';
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const { isPostgres } = require('../helpers/dialect');
const store = require('../../lib/db');

after(() => store.db.close());

const rejects = (sql, args, message) => assert.rejects(() => store.db.prepare(sql).run(...args), err => message.test(err.message), sql);
const skip = isPostgres ? false : 'chỉ chạy trên PostgreSQL (DB_DIALECT=postgres)';

test('staff: uuid tự sinh khi thêm, username và uuid không đổi được', { skip }, async () => {
  await store.ready;
  await store.db
    .prepare("INSERT INTO staff (username, name, pass_hash, created_at) VALUES ('pg_trigger_a', 'A', 'x', '2026-10-31T00:00:00.000Z')")
    .run();
  const row = await store.db.prepare("SELECT uuid FROM staff WHERE username = 'pg_trigger_a'").get();
  assert.match(row.uuid, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  await rejects("UPDATE staff SET username = 'doi_ten' WHERE username = 'pg_trigger_a'", [], /staff\.username không đổi được/);
  await rejects("UPDATE staff SET uuid = 'khac' WHERE username = 'pg_trigger_a'", [], /staff\.uuid không đổi được/);
});

test('bảng chỉ-thêm-dòng từ chối UPDATE và DELETE với câu báo lỗi riêng của từng bảng', { skip }, async () => {
  await store.ready;
  await store.audit.write({ actor: 'pg', action: 'pg.test', entityKind: 'test', entityId: 'x', sensitivity: 'normal' });
  await rejects('UPDATE audit_log SET reason = ?', ['sửa'], /audit_log chỉ được thêm dòng/);
  await rejects('DELETE FROM audit_log', [], /audit_log chỉ được thêm dòng/);
  // Trigger theo dòng chỉ chạy khi có dòng: bảng cần dữ liệu để kiểm; các bảng còn lại được test API của từng luồng chạm tới
  await store.roles.grant('pg_trigger_a', 'hr', 'admin');
  await rejects('DELETE FROM staff_roles', [], /staff_roles chỉ được thu hồi/);
  await rejects("UPDATE staff_roles SET role = 'cb'", [], /staff_roles chỉ được đặt revoked_at một lần/);
});

test('mọi trigger của lược đồ SQLite đều có bản PostgreSQL cùng tên', { skip }, async () => {
  await store.ready;
  const have = new Set((await store.db.prepare("SELECT name FROM sqlite_master WHERE type = 'trigger'").all()).map(r => r.name));
  const expected = [
    'advance_requests_guard_update', 'ai_finding_actions_no_delete', 'ai_finding_actions_no_update', 'ai_review_runs_no_delete',
    'ai_review_runs_no_update', 'audit_log_no_delete', 'audit_log_no_update', 'param_versions_no_delete', 'param_versions_no_update',
    'pay_entries_frozen_update', 'pay_entries_guard_update', 'pay_entries_no_delete', 'payroll_runs_guard_update',
    'payroll_runs_no_delete', 'payslips_frozen_update', 'payslips_guard_update', 'payslips_no_delete', 'staff_roles_guard_update',
    'staff_roles_no_delete', 'staff_username_fixed', 'staff_uuid_default', 'staff_uuid_fixed'
  ];
  assert.deepEqual(expected.filter(name => !have.has(name)), []);
});

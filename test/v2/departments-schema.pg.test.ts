// Lược đồ phòng ban: bảng departments, cột staff.department_id và khoảng tạm nghỉ, hai phòng ban mẫu.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { withTempDb } from './helpers/pg-temp-db';

test('departments is seeded with Phòng ban 1 and Phòng ban 2', async t => {
  await withTempDb(t, 'dept_schema', async db => {
    const rows = await db.selectFrom('departments').select(['name', 'sort']).orderBy('sort').execute();
    assert.deepEqual(rows, [
      { name: 'Phòng ban 1', sort: 1 },
      { name: 'Phòng ban 2', sort: 2 }
    ]);
  });
});

test('department names are unique', async t => {
  await withTempDb(t, 'dept_unique', async (db, client) => {
    await assert.rejects(
      client.query("INSERT INTO departments (name, sort, updated_by, updated_at) VALUES ('Phòng ban 1', 9, 'admin', now()::text)"),
      /unique|duplicate/i
    );
    void db;
  });
});

test('staff keeps a department and an on-leave range, both optional', async t => {
  await withTempDb(t, 'dept_staff', async (_db, client) => {
    await client.query(
      "INSERT INTO staff (username, name, pass_hash, created_at, uuid) VALUES ('a.b', 'A B', 'x', '2026-11-01', 'u-1')"
    );
    const none = await client.query("SELECT department_id, on_leave_from, on_leave_to FROM staff WHERE username = 'a.b'");
    assert.deepEqual(none.rows[0], { department_id: null, on_leave_from: null, on_leave_to: null });

    await client.query(
      "UPDATE staff SET department_id = (SELECT id FROM departments WHERE name = 'Phòng ban 1'), on_leave_from = '2026-11-02' WHERE username = 'a.b'"
    );
    const set = await client.query("SELECT department_id IS NOT NULL AS has, on_leave_to FROM staff WHERE username = 'a.b'");
    assert.deepEqual(set.rows[0], { has: true, on_leave_to: null });
  });
});

test('a department that still has staff cannot be deleted at the database level', async t => {
  await withTempDb(t, 'dept_fk', async (_db, client) => {
    await client.query(
      "INSERT INTO staff (username, name, pass_hash, created_at, uuid, department_id) VALUES ('a.b', 'A B', 'x', '2026-11-01', 'u-1', (SELECT id FROM departments WHERE name = 'Phòng ban 2'))"
    );
    await assert.rejects(client.query("DELETE FROM departments WHERE name = 'Phòng ban 2'"), /foreign key|violates/i);
  });
});

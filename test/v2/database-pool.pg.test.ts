import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Client } from 'pg';
import { createPgPool } from '../../src/database/kysely';

// Cần PostgreSQL thật (PG_TEST_URL). Không tạo DB: chỉ cắt một kết nối của chính pool trong test.
const CONTROL_URL = process.env.PG_TEST_URL;

test('an idle connection cut by the server does not crash the process', async t => {
  if (!CONTROL_URL) {
    t.skip('PG_TEST_URL chưa đặt');
    return;
  }
  const pool = createPgPool(CONTROL_URL);
  const control = new Client({ connectionString: CONTROL_URL });
  await control.connect();
  try {
    // Kết nối vừa chạy xong câu lệnh nằm rảnh trong pool; máy chủ cắt nó (như khi DB khởi động lại).
    const { rows } = await pool.query('SELECT pg_backend_pid() AS pid');
    await control.query('SELECT pg_terminate_backend($1)', [rows[0].pid]);
    await new Promise(resolve => setTimeout(resolve, 300));

    // Pool bỏ kết nối hỏng và mở kết nối mới cho câu sau.
    const again = await pool.query('SELECT 1 AS one');
    assert.equal(again.rows[0].one, 1);
  } finally {
    await control.end();
    await pool.end();
  }
});

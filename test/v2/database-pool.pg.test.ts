import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Client, type PoolClient } from 'pg';
import { createPgPool } from '../../src/database/kysely';

// Cần PostgreSQL thật (PG_TEST_URL). Không tạo hay sửa dữ liệu: chỉ mở, giữ, trả hoặc cắt kết nối của chính pool trong test.
const CONTROL_URL = process.env.PG_TEST_URL;

/** Mốc báo treo: pool chờ lâu hơn thế này coi như chờ mãi. */
const HANG_MS = 15_000;

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

test('an exhausted pool refuses a new client instead of waiting forever', async t => {
  if (!CONTROL_URL) {
    t.skip('PG_TEST_URL chưa đặt');
    return;
  }

  const pool = createPgPool(CONTROL_URL);
  const held: PoolClient[] = [];
  let timer: NodeJS.Timeout | undefined;
  try {
    const max = pool.options.max ?? 10;
    for (let i = 0; i < max; i++) held.push(await pool.connect());

    const startedAt = Date.now();
    const outcome = await Promise.race([
      // Kết nối đến muộn (sau khi các kết nối giữ được trả) trả lại ngay để pool.end() không chờ nó.
      pool.connect().then(
        client => {
          client.release();
          return 'được cấp kết nối';
        },
        (err: Error) => err.message
      ),
      new Promise<string>(resolve => {
        timer = setTimeout(() => resolve(`vẫn chờ sau ${HANG_MS / 1000} giây`), HANG_MS);
      })
    ]);

    assert.match(outcome, /timeout exceeded when trying to connect/);
    assert.ok(Date.now() - startedAt < HANG_MS);
  } finally {
    clearTimeout(timer);
    for (const client of held) client.release();
    await pool.end();
  }
});

import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { PoolClient } from 'pg';
import { createPgPool } from '../../src/database/kysely';

// Cần PostgreSQL thật (PG_TEST_URL). Chỉ mở kết nối rồi trả lại, không tạo hay sửa dữ liệu.
const CONTROL_URL = process.env.PG_TEST_URL;

/** Mốc báo treo: pool chờ lâu hơn thế này coi như chờ mãi. */
const HANG_MS = 15_000;

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

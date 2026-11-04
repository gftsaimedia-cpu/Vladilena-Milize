import assert from 'node:assert/strict';
import { createPgPool, createKysely } from '../../src/database/kysely';
import { TransactionCoordinator } from '../../src/database/transaction';
import { sql } from 'kysely';

async function testDatabaseTransaction() {
  const url = process.env.DATABASE_URL || 'postgres://luong:luong_dev_password@localhost:5432/luong_local';
  const pool = createPgPool(url);
  const db = createKysely(pool);
  const coordinator = new TransactionCoordinator(db);

  try {
    // 1. Verify basic query execution
    const res = await sql<{ num: number }>`SELECT 1 as num`.execute(db);
    assert.equal(res.rows[0].num, 1, 'Basic select must return 1');

    // 2. Verify run inside transaction
    const txResult = await coordinator.run(async (trx) => {
      const q = await sql<{ answer: number }>`SELECT 42 as answer`.execute(trx);
      return q.rows[0].answer;
    });
    assert.equal(txResult, 42, 'Transaction run must return 42');

    // 3. Verify advisory lock inside transaction
    await coordinator.withLock('test_lock_key', async (trx) => {
      const lockRes = await sql<{ pid: number }>`SELECT pg_backend_pid() as pid`.execute(trx);
      assert.ok(lockRes.rows[0].pid, 'Advisory lock acquired within transaction');
    });

    console.log('✅ testDatabaseTransaction PASSED');
  } catch (err: any) {
    if (err?.code === 'ECONNREFUSED') {
      console.log('⚠️ PostgreSQL database không mở cổng trực tiếp ra host localhost:5432 (chỉ chạy trong mạng Docker). Bỏ qua test tích hợp trên host.');
      return;
    }
    throw err;
  } finally {
    await pool.end();
  }
}

testDatabaseTransaction().catch((err) => {
  console.error('❌ testDatabaseTransaction FAILED:', err);
  process.exit(1);
});

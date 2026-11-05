import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test, type TestContext } from 'node:test';
import type { Kysely } from 'kysely';
import { Client } from 'pg';
import { createKysely, createPgPool } from '../../src/database/kysely';
import type { DB } from '../../src/database/schema';
import { SystemService } from '../../src/modules/system/system.service';

// Cần PostgreSQL thật. PG_TEST_URL là kết nối điều khiển (được CREATE/DROP DATABASE): mỗi test tạo DB tạm riêng,
// nạp schema.sql rồi xoá DB ở cuối, không đụng DB nào khác.
const CONTROL_URL = process.env.PG_TEST_URL;
const SCHEMA = join(__dirname, '..', '..', 'migrations', 'postgres', 'schema.sql');

async function withTempDb(t: TestContext, run: (db: Kysely<DB>, client: Client) => Promise<void>): Promise<void> {
  if (!CONTROL_URL) {
    t.skip('PG_TEST_URL chưa đặt');
    return;
  }
  const dbName = `system_periods_${process.pid}_${Date.now()}`;
  const tempUrl = new URL(CONTROL_URL);
  tempUrl.pathname = `/${dbName}`;
  const control = new Client({ connectionString: CONTROL_URL });
  const client = new Client({ connectionString: tempUrl.toString() });
  const db = createKysely(createPgPool(tempUrl.toString()));
  let controlConnected = false;
  let clientConnected = false;
  try {
    await control.connect();
    controlConnected = true;
    await control.query(`CREATE DATABASE ${dbName}`);
    await client.connect();
    clientConnected = true;
    await client.query(readFileSync(SCHEMA, 'utf8'));
    await run(db, client);
  } finally {
    await db.destroy();
    if (clientConnected) await client.end();
    if (controlConnected) {
      await control.query(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`);
      await control.end();
    }
  }
}

// Chốt công (POST /api/v2/system/periods/:month/lock) ghi kỳ lương ở trạng thái mà CHECK của payroll_periods nhận.
test('lockPeriod stores an attendance-locked period that the schema accepts', async t => {
  await withTempDb(t, async (db, client) => {
    const service = new SystemService(db);
    const period = async () =>
      (await client.query('SELECT status, attendance_locked_by, attendance_locked_at FROM payroll_periods WHERE month = $1', ['2026-11']))
        .rows[0];

    await service.lockPeriod('2026-11', 'admin');
    const first = await period();
    assert.equal(first.status, 'attendance_locked');
    assert.equal(first.attendance_locked_by, 'admin');
    assert.ok(first.attendance_locked_at);

    // Chốt lại tháng đã có dòng kỳ đi qua nhánh ON CONFLICT: cùng trạng thái, người chốt mới.
    await service.lockPeriod('2026-11', 'ketoan');
    const again = await period();
    assert.equal(again.status, 'attendance_locked');
    assert.equal(again.attendance_locked_by, 'ketoan');

    const listed = await service.listPeriods();
    assert.deepEqual(
      listed.map(p => [p.month, p.status]),
      [['2026-11', 'attendance_locked']]
    );
  });
});

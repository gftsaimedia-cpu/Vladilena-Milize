import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { TestContext } from 'node:test';
import type { Kysely } from 'kysely';
import { Client } from 'pg';
import { createKysely, createPgPool } from '../../../src/database/kysely';
import type { DB } from '../../../src/database/schema';

// Cần PostgreSQL thật. PG_TEST_URL là kết nối điều khiển (được CREATE/DROP DATABASE): mỗi test tạo DB tạm riêng,
// nạp schema.sql rồi xoá DB ở cuối, không đụng DB nào khác.
const CONTROL_URL = process.env.PG_TEST_URL;
const SCHEMA = join(__dirname, '..', '..', '..', 'migrations', 'postgres', 'schema.sql');

export async function withTempDb(
  t: TestContext,
  prefix: string,
  run: (db: Kysely<DB>, client: Client) => Promise<void>
): Promise<void> {
  if (!CONTROL_URL) {
    t.skip('PG_TEST_URL chưa đặt');
    return;
  }
  const dbName = `${prefix}_${process.pid}_${Date.now()}`;
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

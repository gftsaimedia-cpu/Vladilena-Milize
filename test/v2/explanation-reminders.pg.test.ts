import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { Client } from 'pg';
import type { Kysely } from 'kysely';
import { createKysely, createPgPool } from '../../src/database/kysely';
import type { DB } from '../../src/database/schema';
import { ExplanationRemindersRepository } from '../../src/modules/requests/explanation-reminders.repository';

// Cần PostgreSQL thật. PG_TEST_URL là kết nối điều khiển (vai trò được CREATE/DROP DATABASE): test tự tạo một DB tạm,
// chạy lược đồ trong đó rồi xoá ở cuối. Không đụng DB nào khác.
const CONTROL_URL = process.env.PG_TEST_URL;
const MIGRATIONS_DIR = join(__dirname, '..', '..', 'migrations', 'postgres');
const MIGRATIONS = readdirSync(MIGRATIONS_DIR)
  .filter(f => f.endsWith('.sql'))
  .sort()
  .map(f => join(MIGRATIONS_DIR, f));

const NV = 'er-uuid-1';
const NV2 = 'er-uuid-2';
const ADMIN = 'er-uuid-3';
const ADMIN2 = 'er-uuid-4';

test('ExplanationRemindersRepository trên PostgreSQL', async t => {
  if (!CONTROL_URL) {
    t.skip('PG_TEST_URL chưa đặt');
    return;
  }

  const dbName = `expl_remind_repo_${process.pid}_${Date.now()}`;
  const tempUrl = new URL(CONTROL_URL);
  tempUrl.pathname = `/${dbName}`;

  const control = new Client({ connectionString: CONTROL_URL });
  const client = new Client({ connectionString: tempUrl.toString() });
  let db: Kysely<DB> | null = null;
  let controlConnected = false;
  let clientConnected = false;

  try {
    await control.connect();
    controlConnected = true;
    await control.query(`CREATE DATABASE ${dbName}`);
    await client.connect();
    clientConnected = true;
    for (const file of MIGRATIONS) {
      await client.query(readFileSync(file, 'utf8'));
    }
    await client.query(
      `INSERT INTO staff (username, name, type, level, pass_hash, created_at, uuid)
       VALUES ('er-user', 'Nhân viên 1', 'nv', 1, 'x', $1, $2),
              ('er-user-2', 'Nhân viên 2', 'nv', 1, 'x', $1, $3),
              ('er-admin', 'Quản trị 1', 'admin', 1, 'x', $1, $4),
              ('er-admin-2', 'Quản trị 2', 'admin', 1, 'x', $1, $5)`,
      [new Date().toISOString(), NV, NV2, ADMIN, ADMIN2]
    );

    db = createKysely(createPgPool(tempUrl.toString()));
    const repo = new ExplanationRemindersRepository(db);
    const reset = () => client.query(`DELETE FROM explanation_reminders`);

    await t.test('upsert keeps one row per day', async () => {
      await reset();
      const t1 = new Date('2026-11-02T01:00:00.000Z');
      const t2 = new Date('2026-11-03T08:30:00.000Z');
      await repo.upsert({ employeeId: NV, date: '2026-10-27', remindedBy: ADMIN, remindedAt: t1 });
      await repo.upsert({ employeeId: NV, date: '2026-10-27', remindedBy: ADMIN2, remindedAt: t2 });
      const rows = await repo.listBetween('2026-10-01', '2026-10-31', NV);
      assert.equal(rows.length, 1);
      assert.equal(rows[0].employeeId, NV);
      assert.equal(rows[0].date, '2026-10-27');
      assert.equal(rows[0].remindedBy, ADMIN2);
      assert.equal(rows[0].remindedAt, t2.toISOString());
    });

    await t.test('list filters by range and person', async () => {
      await reset();
      const at = new Date('2026-11-02T01:00:00.000Z');
      await repo.upsert({ employeeId: NV, date: '2026-10-26', remindedBy: ADMIN, remindedAt: at });
      await repo.upsert({ employeeId: NV, date: '2026-11-01', remindedBy: ADMIN, remindedAt: at });
      await repo.upsert({ employeeId: NV2, date: '2026-10-27', remindedBy: ADMIN, remindedAt: at });

      const all = await repo.listBetween('2026-10-01', '2026-10-31');
      assert.deepEqual(
        all.map(r => [r.employeeId, r.date]),
        [
          [NV2, '2026-10-27'],
          [NV, '2026-10-26']
        ]
      );

      const mine = await repo.listBetween('2026-10-01', '2026-10-31', NV);
      assert.equal(mine.length, 1);
      assert.equal(mine[0].date, '2026-10-26');
    });

    await t.test('withTransaction writes roll back with the transaction', async () => {
      await reset();
      await assert.rejects(
        db!.transaction().execute(async trx => {
          await repo
            .withTransaction(trx)
            .upsert({ employeeId: NV, date: '2026-10-26', remindedBy: ADMIN, remindedAt: new Date() });
          throw new Error('rollback (test)');
        }),
        /rollback \(test\)/
      );
      assert.deepEqual(await repo.listBetween('2026-10-01', '2026-10-31'), []);
    });
  } finally {
    if (db) await db.destroy();
    if (clientConnected) await client.end();
    if (controlConnected) {
      await control.query(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`);
      await control.end();
    }
  }
});

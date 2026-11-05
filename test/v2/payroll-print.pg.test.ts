import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { Client } from 'pg';
import type { Kysely } from 'kysely';
import { createKysely, createPgPool } from '../../src/database/kysely';
import type { DB } from '../../src/database/schema';
import { PayrollRepository } from '../../src/modules/payroll/payroll.repository';
import { PayrollService } from '../../src/modules/payroll/payroll.service';

// Cần PostgreSQL thật. PG_TEST_URL là kết nối điều khiển (vai trò được CREATE/DROP DATABASE): test tự tạo một DB tạm,
// chạy lược đồ trong đó rồi xoá ở cuối. Không đụng DB nào khác.
const CONTROL_URL = process.env.PG_TEST_URL;
const MIGRATIONS_DIR = join(__dirname, '..', '..', 'migrations', 'postgres');
const MIGRATIONS = readdirSync(MIGRATIONS_DIR)
  .filter(f => f.endsWith('.sql'))
  .sort()
  .map(f => join(MIGRATIONS_DIR, f));

const MONTH = '2026-10';
const UUID = 'pp-uuid-1';
const USERNAME = 'pp-user';

test('Phiếu lương A4 trên PostgreSQL', async t => {
  if (!CONTROL_URL) {
    t.skip('PG_TEST_URL chưa đặt');
    return;
  }

  const dbName = `payroll_print_${process.pid}_${Date.now()}`;
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

    // ===== Seed =====
    // Một nhân sự nv bậc 1, hợp đồng dài hạn, một ngày công NORMAL. Các task sau thêm seed vào đây.
    const now = new Date().toISOString();
    await client.query(
      `INSERT INTO staff (username, name, type, level, pass_hash, created_at, contract, uuid)
       VALUES ($1, 'Nhân viên in phiếu', 'nv', 1, 'x', $2, 'long', $3)`,
      [USERNAME, now, UUID]
    );
    await client.query(
      `INSERT INTO timesheet_entries (id, employee_id, work_date, shift_type, shift_start_time, shift_end_time,
         shift_allowance_pct, work_hours, status, day_status, created_at, updated_at)
       VALUES (gen_random_uuid(), $1, '2026-10-01', 'NORMAL', '08:00', '17:00', 0, 8, 'PRESENT', 'VALID', now(), now())`,
      [UUID]
    );

    db = createKysely(createPgPool(tempUrl.toString()));
    const repo = new PayrollRepository(db);
    const service = new PayrollService(repo);

    const slip = await service.generateMonthlyPayslip(UUID, MONTH);
    await repo.savePayrollRunAndSlips(MONTH, 'tester', [slip]);

    // ===== Assert =====
    // Các task sau thêm assert vào đây.
    await t.test('Từ chối lưu trạng thái rejected cùng lý do, người và lúc quyết định', async () => {
      const rejected = await repo.decidePayslip(MONTH, USERNAME, 'rejected', 'admin', 'Thiếu điểm KPI Quản lý');
      assert.equal(rejected?.status, 'rejected');
      assert.equal(rejected?.note, 'Thiếu điểm KPI Quản lý');
      assert.equal(rejected?.decidedBy, 'admin');
      assert.equal(typeof rejected?.decidedAt, 'string');
      assert.equal((await repo.getPayslip(MONTH, UUID))?.status, 'rejected');
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

import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { Client } from 'pg';
import type { Kysely } from 'kysely';
import { createKysely, createPgPool } from '../../src/database/kysely';
import type { DB } from '../../src/database/schema';
import { DayStatusRepository } from '../../src/modules/requests/day-status.repository';

// Cần PostgreSQL thật. PG_TEST_URL là kết nối điều khiển (vai trò được CREATE/DROP DATABASE): test tự tạo một DB tạm,
// chạy lược đồ trong đó rồi xoá ở cuối. Không đụng DB nào khác.
const CONTROL_URL = process.env.PG_TEST_URL;
const MIGRATIONS_DIR = join(__dirname, '..', '..', 'migrations', 'postgres');
const MIGRATIONS = readdirSync(MIGRATIONS_DIR)
  .filter(f => f.endsWith('.sql'))
  .sort()
  .map(f => join(MIGRATIONS_DIR, f));

const NV = 'ds-uuid-1';
const NV2 = 'ds-uuid-2';

// Mã đơn cố định để các test dưới đây đọc được trạng thái bằng mắt.
const REQ = {
  leavePending: '00000000-0000-4000-8000-000000000001',
  leaveApproved: '00000000-0000-4000-8000-000000000002',
  leaveRejected: '00000000-0000-4000-8000-000000000003',
  shiftApproved: '00000000-0000-4000-8000-000000000004',
  isatPending: '00000000-0000-4000-8000-000000000005',
  otherStaff: '00000000-0000-4000-8000-000000000006'
};

test('DayStatusRepository trên PostgreSQL', async t => {
  if (!CONTROL_URL) {
    t.skip('PG_TEST_URL chưa đặt');
    return;
  }

  const dbName = `day_status_repo_${process.pid}_${Date.now()}`;
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
       VALUES ('ds-user', 'Nhân viên 1', 'nv', 1, 'x', $1, $2),
              ('ds-user-2', 'Nhân viên 2', 'nv', 1, 'x', $1, $3)`,
      [new Date().toISOString(), NV, NV2]
    );
    const insertRequest = (id: string, employeeId: string, type: string, status: string) =>
      client.query(
        `INSERT INTO system_requests (id, employee_id, title, type, reason, status, created_at, updated_at)
         VALUES ($1, $2, 'Đơn thử', $3, 'Thử', $4, now(), now())`,
        [id, employeeId, type, status]
      );
    await insertRequest(REQ.leavePending, NV, 'LEAVE', 'PENDING');
    await insertRequest(REQ.leaveApproved, NV, 'LEAVE', 'APPROVED');
    await insertRequest(REQ.leaveRejected, NV, 'LEAVE', 'REJECTED');
    await insertRequest(REQ.shiftApproved, NV, 'SHIFT_CHANGE', 'APPROVED');
    await insertRequest(REQ.isatPending, NV, 'ISAT', 'PENDING');
    await insertRequest(REQ.otherStaff, NV2, 'LEAVE', 'PENDING');

    db = createKysely(createPgPool(tempUrl.toString()));
    const repo = new DayStatusRepository(db);

    const resetDays = () => client.query(`DELETE FROM day_status`);
    const setStatus = (id: string, status: string) =>
      client.query(`UPDATE system_requests SET status = $2 WHERE id = $1`, [id, status]);

    await t.test('primary key refuses a second row for the same staff and day', async () => {
      await resetDays();
      await assert.rejects(
        client.query(
          `INSERT INTO day_status (employee_id, work_date, status, request_id)
           VALUES ($1, '2026-11-14', 'LEAVE', $2), ($1, '2026-11-14', 'ISAT', $3)`,
          [NV, REQ.leavePending, REQ.isatPending]
        ),
        /day_status_pkey|duplicate key/
      );

      await repo.upsert([{ employeeId: NV, date: '2026-11-14', status: 'LEAVE', requestId: REQ.leavePending, baseRequestId: null }]);
      await repo.upsert([{ employeeId: NV, date: '2026-11-14', status: 'ISAT', requestId: REQ.isatPending, baseRequestId: null }]);
      const rows = await repo.listBetween(NV, '2026-11-14', '2026-11-14');
      assert.equal(rows.length, 1);
      assert.equal(rows[0].requestId, REQ.isatPending);
      assert.equal(rows[0].status, 'ISAT');
    });

    await t.test('check refuses a base request on a SHIFT_CHANGE row', async () => {
      await resetDays();
      await assert.rejects(
        client.query(
          `INSERT INTO day_status (employee_id, work_date, status, request_id, base_request_id)
           VALUES ($1, '2026-11-14', 'SHIFT_CHANGE', $2, $3)`,
          [NV, REQ.shiftApproved, REQ.leavePending]
        ),
        /day_status_check|check constraint/
      );
    });

    await t.test('listBetween joins the request status and hides finished requests', async () => {
      await resetDays();
      await repo.upsert([
        { employeeId: NV, date: '2026-11-10', status: 'LEAVE', requestId: REQ.leavePending, baseRequestId: null },
        { employeeId: NV, date: '2026-11-11', status: 'LEAVE', requestId: REQ.leaveApproved, baseRequestId: REQ.shiftApproved },
        { employeeId: NV, date: '2026-11-12', status: 'LEAVE', requestId: REQ.leaveRejected, baseRequestId: null },
        { employeeId: NV, date: '2026-11-14', status: 'ISAT', requestId: REQ.isatPending, baseRequestId: null }
      ]);
      assert.deepEqual(await repo.listBetween(NV, '2026-11-01', '2026-11-30'), [
        {
          employeeId: NV,
          date: '2026-11-10',
          status: 'LEAVE',
          requestId: REQ.leavePending,
          baseRequestId: null,
          requestStatus: 'PENDING',
          baseRequestStatus: null
        },
        {
          employeeId: NV,
          date: '2026-11-11',
          status: 'LEAVE',
          requestId: REQ.leaveApproved,
          baseRequestId: REQ.shiftApproved,
          requestStatus: 'APPROVED',
          baseRequestStatus: 'APPROVED'
        },
        {
          employeeId: NV,
          date: '2026-11-14',
          status: 'ISAT',
          requestId: REQ.isatPending,
          baseRequestId: null,
          requestStatus: 'PENDING',
          baseRequestStatus: null
        }
      ]);

      // Đơn chờ đổi sang REJECTED thì dòng biến mất khỏi kết quả.
      await setStatus(REQ.leavePending, 'REJECTED');
      try {
        const after = await repo.listBetween(NV, '2026-11-01', '2026-11-30');
        assert.deepEqual(after.map(r => r.date), ['2026-11-11', '2026-11-14']);
        // Khoảng ngày lọc đúng hai đầu, gồm cả hai đầu.
        assert.deepEqual((await repo.listBetween(NV, '2026-11-11', '2026-11-11')).map(r => r.date), ['2026-11-11']);
      } finally {
        await setStatus(REQ.leavePending, 'PENDING');
      }
    });

    await t.test('listByRequest and listByBase find rows by their request', async () => {
      await resetDays();
      await repo.upsert([
        { employeeId: NV, date: '2026-11-10', status: 'LEAVE', requestId: REQ.leavePending, baseRequestId: null },
        { employeeId: NV, date: '2026-11-11', status: 'LEAVE', requestId: REQ.leavePending, baseRequestId: REQ.shiftApproved },
        { employeeId: NV, date: '2026-11-12', status: 'LEAVE', requestId: REQ.leaveApproved, baseRequestId: REQ.shiftApproved },
        { employeeId: NV, date: '2026-11-14', status: 'ISAT', requestId: REQ.isatPending, baseRequestId: null }
      ]);
      assert.deepEqual((await repo.listByRequest(REQ.leavePending)).map(r => r.date), ['2026-11-10', '2026-11-11']);
      assert.deepEqual((await repo.listByBase(REQ.shiftApproved)).map(r => r.date), ['2026-11-11', '2026-11-12']);
      assert.deepEqual(await repo.listByRequest(REQ.leaveRejected), []);
      assert.deepEqual(await repo.listByBase(REQ.leavePending), []);
    });

    await t.test('remove deletes only the given days of that staff', async () => {
      await resetDays();
      await repo.upsert([
        { employeeId: NV, date: '2026-11-10', status: 'LEAVE', requestId: REQ.leavePending, baseRequestId: null },
        { employeeId: NV, date: '2026-11-11', status: 'LEAVE', requestId: REQ.leavePending, baseRequestId: null },
        { employeeId: NV2, date: '2026-11-10', status: 'LEAVE', requestId: REQ.otherStaff, baseRequestId: null }
      ]);
      await repo.remove(NV, ['2026-11-10']);
      assert.deepEqual((await repo.listBetween(NV, '2026-11-01', '2026-11-30')).map(r => r.date), ['2026-11-11']);
      assert.deepEqual((await repo.listBetween(NV2, '2026-11-01', '2026-11-30')).map(r => r.date), ['2026-11-10']);
      await repo.remove(NV, []);
      assert.equal((await repo.listBetween(NV, '2026-11-01', '2026-11-30')).length, 1);
    });

    await t.test('withTransaction writes roll back with the transaction', async () => {
      await resetDays();
      await assert.rejects(
        db!.transaction().execute(async trx => {
          await repo
            .withTransaction(trx)
            .upsert([{ employeeId: NV, date: '2026-11-10', status: 'LEAVE', requestId: REQ.leavePending, baseRequestId: null }]);
          throw new Error('rollback (test)');
        }),
        /rollback \(test\)/
      );
      assert.deepEqual(await repo.listBetween(NV, '2026-11-01', '2026-11-30'), []);
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

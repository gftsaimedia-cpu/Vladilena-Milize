import 'reflect-metadata';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { NestFactory } from '@nestjs/core';
import { Client } from 'pg';
import { AppModule } from '../../src/app.module';
import { PG_POOL } from '../../src/database/kysely';
import { ExplanationsService } from '../../src/modules/requests/explanations.service';
import { RequestsService } from '../../src/modules/requests/requests.service';

// Cần PostgreSQL thật. PG_TEST_URL là kết nối điều khiển (vai trò được CREATE/DROP DATABASE): test tự tạo một DB tạm,
// chạy lược đồ trong đó rồi xoá ở cuối. Dựng cả AppModule trên DB tạm đó để dùng đúng các repository và service thật.
// Giờ cố định: 05/11/2026 10:00 giờ Việt Nam (Thứ Năm).
const CONTROL_URL = process.env.PG_TEST_URL;
const MIGRATIONS_DIR = join(__dirname, '..', '..', 'migrations', 'postgres');
const MIGRATIONS = readdirSync(MIGRATIONS_DIR)
  .filter(f => f.endsWith('.sql'))
  .sort()
  .map(f => join(MIGRATIONS_DIR, f));

const NOW = new Date('2026-11-05T03:00:00.000Z');
const LATER = new Date('2026-11-05T08:30:00.000Z');
const NV = '11111111-1111-4111-8111-111111111111';
const ADMIN = '22222222-2222-4222-8222-222222222222';

test('Ngày cần giải trình trên PostgreSQL (spec 5.2)', async t => {
  if (!CONTROL_URL) {
    t.skip('PG_TEST_URL chưa đặt');
    return;
  }

  const dbName = `expl_due_${process.pid}_${Date.now()}`;
  const tempUrl = new URL(CONTROL_URL);
  tempUrl.pathname = `/${dbName}`;

  const control = new Client({ connectionString: CONTROL_URL });
  const client = new Client({ connectionString: tempUrl.toString() });
  let controlConnected = false;
  let clientConnected = false;
  let app: Awaited<ReturnType<typeof NestFactory.createApplicationContext>> | null = null;
  const previousUrl = process.env.DATABASE_URL;
  const realConsoleError = console.error;

  try {
    await control.connect();
    controlConnected = true;
    await control.query(`CREATE DATABASE ${dbName}`);
    await client.connect();
    clientConnected = true;
    for (const file of MIGRATIONS) {
      await client.query(readFileSync(file, 'utf8'));
    }
    // nv1 (loại nv) vào làm 01/10; admin mặc định (loại ql) không có cấu hình loại nhân sự để tính lịch.
    await client.query(
      `INSERT INTO staff (username, name, role, type, level, pass_hash, created_at, uuid, start_date, leave_balance, leave_balance_on)
       VALUES ('nv1', 'Nguyễn Văn A', 'staff', 'nv', 1, 'x', 'x', $1, '2026-10-01', 12, '2026-01-01'),
              ('admin', 'Admin', 'admin', 'ql', 0, 'x', 'x', $2, NULL, NULL, NULL)`,
      [NV, ADMIN]
    );
    // Giờ chấm lưu TIMESTAMPTZ (UTC); ca 08:00–17:00 giờ Việt Nam.
    // Nộp và huỷ đơn giải trình ghi lại dòng ngày từ `punch_events`, nên mỗi lần chấm có cả lần chấm gốc lẫn dòng ngày.
    const punch = async (date: string, inUtc: string | null, outUtc: string | null) => {
      await client.query(
        `INSERT INTO timesheet_entries (id, employee_id, work_date, shift_type, shift_start_time, shift_end_time, shift_allowance_pct, actual_check_in, actual_check_out, status, created_at, updated_at)
         VALUES (gen_random_uuid(), $1, $2, 'NORMAL', '08:00', '17:00', 0, $3, $4, 'PRESENT', now(), now())`,
        [NV, date, inUtc, outUtc]
      );
      for (const [at, type] of [
        [inUtc, 'IN'],
        [outUtc, 'OUT']
      ]) {
        if (!at) continue;
        await client.query(
          `INSERT INTO punch_events (id, employee_id, punched_at, work_date, type, latitude, longitude,
             accuracy_meters, distance_meters, is_within_office, created_at)
           VALUES (gen_random_uuid(), $1, $2, $3, $4, 0, 0, 1, 1, true, now())`,
          [NV, at, date, type]
        );
      }
    };
    await punch('2026-10-27', '2026-10-27T01:00:00Z', null); // kỳ tháng 10 đã phê duyệt: thiếu giờ ra nhưng không được tính
    await punch('2026-11-02', '2026-11-02T01:00:00Z', null); // 08:00 vào, thiếu giờ ra
    await punch('2026-11-03', '2026-11-03T01:40:00Z', '2026-11-03T10:05:00Z'); // 08:40 vào: muộn
    await punch('2026-11-04', '2026-11-04T01:00:00Z', '2026-11-04T10:00:00Z'); // đủ giờ, đúng giờ
    // Giải trình nộp được tới khi kỳ được phê duyệt (người dùng chốt 05/11): chỉ kỳ 'approved' / 'paid' bỏ ngày của tháng.
    await client.query(`INSERT INTO payroll_periods (month, status) VALUES ('2026-10', 'approved')`);

    process.env.DATABASE_URL = tempUrl.toString();
    app = await NestFactory.createApplicationContext(AppModule, { logger: false });
    const requests = app.get(RequestsService);
    const explanations = app.get(ExplanationsService);
    requests.now = () => NOW;
    explanations.now = () => NOW;

    const LATE_DAY = { date: '2026-11-03', cases: ['LATE_CHECK_IN'], needs: { checkIn: false, checkOut: false }, checkIn: '08:40', checkOut: '17:05' };
    const MISSING_OUT_DAY = { date: '2026-11-02', cases: ['MISSING_CHECK_OUT'], needs: { checkIn: false, checkOut: true }, checkIn: '08:00', checkOut: null };

    await t.test('dueDays finds LATE_CHECK_IN and MISSING_CHECK_OUT from TIMESTAMPTZ punches, newest first', async () => {
      assert.deepEqual(await explanations.dueDays('nv1'), [
        { ...LATE_DAY, remindedAt: null },
        { ...MISSING_OUT_DAY, remindedAt: null }
      ]);
      // Cùng kết quả khi tra theo uuid.
      assert.deepEqual((await explanations.dueDays(NV)).map(d => d.date), ['2026-11-03', '2026-11-02']);
    });

    await t.test('a day of an approved or paid month is excluded; locked or calculated months still have due days', async () => {
      const dates = async () => (await explanations.dueDays('nv1')).map(d => d.date);
      assert.equal((await dates()).includes('2026-10-27'), false);
      try {
        for (const status of ['open', 'attendance_locked', 'calculated']) {
          await client.query(`UPDATE payroll_periods SET status = $1 WHERE month = '2026-10'`, [status]);
          const oct27 = (await explanations.dueDays('nv1')).find(d => d.date === '2026-10-27');
          assert.deepEqual(oct27?.cases, ['MISSING_CHECK_OUT'], status);
        }
        await client.query(`UPDATE payroll_periods SET status = 'paid' WHERE month = '2026-10'`);
        assert.equal((await dates()).includes('2026-10-27'), false);
      } finally {
        await client.query(`UPDATE payroll_periods SET status = 'approved' WHERE month = '2026-10'`);
      }
      assert.equal((await dates()).includes('2026-10-27'), false);
    });

    await t.test('listDue skips the default admin without failing, and says so', async () => {
      const logged: unknown[][] = [];
      console.error = (...args: unknown[]) => {
        logged.push(args);
      };
      let items;
      try {
        items = await explanations.listDue();
      } finally {
        console.error = realConsoleError;
      }
      assert.deepEqual(
        items.map(i => [i.employeeId, i.name, i.date]),
        [
          [NV, 'Nguyễn Văn A', '2026-11-03'],
          [NV, 'Nguyễn Văn A', '2026-11-02']
        ]
      );
      const skipped = logged.find(args => String(args[0]).includes(ADMIN));
      assert.ok(skipped, 'phải log người bị bỏ qua');
      assert.match(String(skipped[0]), /^listDue: bỏ qua /);
      assert.match(String(skipped[1]), /Thiếu cấu hình loại nhân sự ql/);
    });

    await t.test('remind upserts one row per day; a day of an approved month is refused with PERIOD_LOCKED', async () => {
      assert.deepEqual(await explanations.remind('nv1', '2026-11-02', 'admin'), { remindedAt: NOW.toISOString() });
      explanations.now = () => LATER;
      try {
        assert.deepEqual(await explanations.remind('nv1', '2026-11-02', 'admin'), { remindedAt: LATER.toISOString() });
      } finally {
        explanations.now = () => NOW;
      }
      assert.deepEqual(await explanations.reminders('nv1'), [{ date: '2026-11-02', remindedAt: LATER.toISOString() }]);
      const rows = await client.query(`SELECT employee_id, reminded_by FROM explanation_reminders WHERE work_date = '2026-11-02'`);
      assert.deepEqual(rows.rows, [{ employee_id: NV, reminded_by: ADMIN }]);

      await assert.rejects(explanations.remind('nv1', '2026-10-27', 'admin'), (e: any) => {
        assert.equal(e.status, 409);
        assert.equal(e.message, 'Kỳ lương tháng 10/2026 đã phê duyệt');
        assert.deepEqual(e.details, { code: 'PERIOD_LOCKED', month: '2026-10', status: 'approved' });
        return true;
      });
      const closed = await client.query(`SELECT 1 FROM explanation_reminders WHERE work_date = '2026-10-27'`);
      assert.equal(closed.rowCount, 0);
      // Ngày đủ giờ thì không có gì để nhắc.
      await assert.rejects(explanations.remind('nv1', '2026-11-04', 'admin'), { message: 'Ngày 04/11 không có gì cần giải trình' });
    });

    await t.test('the reminder disappears once an explanation is filed and comes back after cancel', async () => {
      const filed = await requests.createExplanationRequest(
        { employeeId: 'nv1', workDate: '2026-11-02', reason: 'Quên chấm ra', actualCheckOut: '17:30' },
        { filedBy: 'self' }
      );
      assert.equal(filed.title, 'Giải trình 02/11');
      assert.deepEqual(filed.explanationCases, ['MISSING_CHECK_OUT']);
      assert.equal(filed.actualCheckIn, null);
      assert.equal(filed.actualCheckOut, '17:30');
      assert.deepEqual(await explanations.reminders('nv1'), []);
      assert.deepEqual((await explanations.dueDays('nv1')).map(d => d.date), ['2026-11-03']);
      assert.equal((await explanations.dayView('nv1', '2026-11-02')).due, null);

      await requests.cancelRequest(filed.id, 'nv1');
      assert.deepEqual(await explanations.reminders('nv1'), [{ date: '2026-11-02', remindedAt: LATER.toISOString() }]);
      assert.deepEqual(await explanations.dueDays('nv1'), [
        { ...LATE_DAY, remindedAt: null },
        { ...MISSING_OUT_DAY, remindedAt: LATER.toISOString() }
      ]);
    });

    await t.test('requestContext returns the expected explanation days', async () => {
      const context = await requests.requestContext('nv1');
      assert.deepEqual(context.explanationDays, [
        { ...LATE_DAY, remindedAt: null },
        { ...MISSING_OUT_DAY, remindedAt: LATER.toISOString() }
      ]);
      assert.deepEqual(
        context.kinds.find(k => k.kind === 'explanation'),
        { kind: 'explanation', enabled: true }
      );
    });
  } finally {
    console.error = realConsoleError;
    if (app) {
      const pool = app.get(PG_POOL, { strict: false });
      await app.close();
      if (pool && !pool.ended) await pool.end();
    }
    if (previousUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previousUrl;
    if (clientConnected) await client.end();
    if (controlConnected) {
      await control.query(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`);
      await control.end();
    }
  }
});

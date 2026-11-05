import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SHIFT_CATALOG } from '../../src/common/shift-catalog';
import { withTempDb } from './helpers/pg-temp-db';

const SEEDED_TABLES = [
  'overtime_rules',
  'attendance_rules',
  'kpi_weights',
  'insurance_rates',
  'tax_rules',
  'pay_calendar'
];

test('settings tables are seeded with the 2000-01 defaults', async t => {
  await withTempDb(t, 'settings_schema_seed', async (_db, client) => {
    // src/database/kysely.ts (nạp qua helper) đã đặt bộ đọc int8 → number cho mọi kết nối pg.
    const row = async (table: string) => {
      const { rows } = await client.query(`SELECT * FROM ${table}`);
      assert.equal(rows.length, 1, `${table} phải có đúng một dòng gieo sẵn`);
      const { updated_by, updated_at, ...rest } = rows[0];
      assert.equal(updated_by, 'system');
      assert.equal(new Date(updated_at).toISOString(), '2026-11-05T00:00:00.000Z');
      return rest;
    };
    const count = async (table: string) => Number((await client.query(`SELECT count(*) AS n FROM ${table}`)).rows[0].n);

    assert.deepEqual(await row('overtime_rules'), { effective_month: '2000-01', weekday_rate: 1.5, weekend_rate: 2, holiday_rate: 3 });
    assert.deepEqual(await row('attendance_rules'), { effective_month: '2000-01', late_grace_minutes: 15, diligence_lost_from_days: 3 });
    assert.deepEqual(await row('kpi_weights'), {
      effective_month: '2000-01',
      wework: 40,
      user_score: 24,
      peer: 18,
      manager: 12,
      self_score: 6
    });
    assert.deepEqual(await row('insurance_rates'), { effective_month: '2000-01', bhxh_pct: 8, bhyt_pct: 1.5, bhtn_pct: 1 });
    assert.deepEqual(await row('tax_rules'), {
      effective_month: '2000-01',
      personal_deduction: 15500000,
      dependant_deduction: 6200000,
      short_contract_pct: 10,
      short_contract_threshold: 5000000
    });
    assert.deepEqual(await row('pay_calendar'), { effective_month: '2000-01', pay_day: 10 });

    const brackets = (await client.query(`SELECT upper_bound, rate_pct FROM tax_brackets WHERE effective_month = '2000-01' ORDER BY sort`)).rows;
    assert.deepEqual(
      brackets.map(b => [b.upper_bound, b.rate_pct]),
      [
        [10000000, 5],
        [30000000, 10],
        [60000000, 20],
        [100000000, 30],
        [null, 35]
      ]
    );

    assert.equal(await count('attendance_zone'), 0);
    assert.equal(await count('staff_work_weeks'), 0);
    assert.equal(await count('settings_changes'), 0);
    assert.equal((await client.query(`SELECT 1 FROM settings WHERE key = 'insurance_rates'`)).rowCount, 0);
    assert.equal((await client.query(`SELECT to_regclass('param_versions') AS r`)).rows[0].r, null);
    for (const table of SEEDED_TABLES) assert.ok(await count(table) >= 1);
  });
});

test('settings CHECK constraints reject out-of-range rows', async t => {
  await withTempDb(t, 'settings_schema_check', async (_db, client) => {
    // Chỉ nhận lỗi ràng buộc (mã nhóm 23: CHECK, FK, UNIQUE); lỗi cú pháp hay thiếu cột không được tính là "bị từ chối".
    const rejects = async (label: string, sql: string) => {
      await assert.rejects(client.query(sql), (err: any) => String(err.code).startsWith('23'), label);
    };
    await rejects('weekday_rate 1.49', `INSERT INTO overtime_rules VALUES ('2026-11', 1.49, 2, 3, 'a', now())`);
    await rejects('weekend_rate 1.99', `INSERT INTO overtime_rules VALUES ('2026-11', 1.5, 1.99, 3, 'a', now())`);
    await rejects('holiday_rate 5.01', `INSERT INTO overtime_rules VALUES ('2026-11', 1.5, 2, 5.01, 'a', now())`);
    await rejects('effective_month 2026-13', `INSERT INTO overtime_rules VALUES ('2026-13', 1.5, 2, 3, 'a', now())`);
    await rejects('effective_month 2026-00', `INSERT INTO pay_calendar VALUES ('2026-00', 10, 'a', now())`);
    await rejects('late_grace 61', `INSERT INTO attendance_rules VALUES ('2026-11', 61, 3, 'a', now())`);
    await rejects('diligence 0', `INSERT INTO attendance_rules VALUES ('2026-11', 15, 0, 'a', now())`);
    await rejects('kpi sum 99', `INSERT INTO kpi_weights VALUES ('2026-11', 40, 24, 18, 12, 5, 'a', now())`);
    await rejects('kpi negative', `INSERT INTO kpi_weights VALUES ('2026-11', 101, -1, 0, 0, 0, 'a', now())`);
    await rejects('bhxh 101', `INSERT INTO insurance_rates VALUES ('2026-11', 101, 1.5, 1, 'a', now())`);
    await rejects('tax deduction too big', `INSERT INTO tax_rules VALUES ('2026-11', 1000000001, 6200000, 10, 5000000, 'a', now())`);
    await rejects('pay_day 29', `INSERT INTO pay_calendar VALUES ('2026-11', 29, 'a', now())`);
    await rejects('pay_day 0', `INSERT INTO pay_calendar VALUES ('2026-11', 0, 'a', now())`);
    await rejects('radius 19', `INSERT INTO attendance_zone VALUES (1, 10.7, 106.7, 19, 'a', now())`);
    await rejects('radius 5001', `INSERT INTO attendance_zone VALUES (1, 10.7, 106.7, 5001, 'a', now())`);
    await rejects('zone id 2', `INSERT INTO attendance_zone VALUES (2, 10.7, 106.7, 100, 'a', now())`);
    await rejects('lat 91', `INSERT INTO attendance_zone VALUES (1, 91, 106.7, 100, 'a', now())`);
    await rejects('lng 181', `INSERT INTO attendance_zone VALUES (1, 10.7, 181, 100, 'a', now())`);
    await rejects(
      'work week for unknown staff',
      `INSERT INTO staff_work_weeks VALUES ('no-such-uuid', '2026-11', '[1,2,3]', 'a', now())`
    );
    await rejects('bracket sort 0', `INSERT INTO tax_brackets VALUES ('2000-01', 0, 1000, 5)`);
    await rejects('bracket sort 11', `INSERT INTO tax_brackets VALUES ('2000-01', 11, 1000, 5)`);
    await rejects('bracket upper_bound 0', `INSERT INTO tax_brackets VALUES ('2000-01', 6, 0, 5)`);
    await rejects('bracket rate 101', `INSERT INTO tax_brackets VALUES ('2000-01', 6, 1000, 101)`);
    await rejects('bracket without tax_rules', `INSERT INTO tax_brackets VALUES ('2026-11', 1, 1000, 5)`);
    await rejects('duplicate bracket sort', `INSERT INTO tax_brackets VALUES ('2000-01', 1, 1000, 5)`);
    await rejects('reason too long', `INSERT INTO settings_changes (setting, field, new_json, reason, changed_by, changed_at)
      VALUES ('overtime', 'weekdayRate', '1.6', '${'x'.repeat(301)}', 'a', now())`);
    await rejects('reason empty', `INSERT INTO settings_changes (setting, field, new_json, reason, changed_by, changed_at)
      VALUES ('overtime', 'weekdayRate', '1.6', '', 'a', now())`);

    // Dòng hợp lệ ở biên vẫn được nhận, để biết các CHECK không chặn nhầm.
    await client.query(`INSERT INTO overtime_rules VALUES ('2026-11', 1.5, 2, 5, 'a', now())`);
    await client.query(`INSERT INTO kpi_weights VALUES ('2026-11', 100, 0, 0, 0, 0, 'a', now())`);
    await client.query(`INSERT INTO pay_calendar VALUES ('2026-11', 28, 'a', now())`);
    await client.query(`INSERT INTO attendance_zone VALUES (1, 10.7, 106.7, 20, 'a', now())`);
  });
});

test('settings_changes accepts inserts only', async t => {
  await withTempDb(t, 'settings_schema_log', async (_db, client) => {
    const { rows } = await client.query(
      `INSERT INTO settings_changes (setting, field, effective_month, old_json, new_json, reason, changed_by, changed_at)
       VALUES ('overtime', 'weekdayRate', '2026-11', '1.5', '1.6', 'Tăng ca', 'admin', now()) RETURNING id`
    );
    assert.equal(typeof rows[0].id, 'number');
    await assert.rejects(client.query(`UPDATE settings_changes SET reason = 'x'`), /settings_changes chỉ được thêm dòng/);
    await assert.rejects(client.query(`DELETE FROM settings_changes`), /settings_changes chỉ được thêm dòng/);
    assert.equal((await client.query('SELECT count(*) AS n FROM settings_changes')).rows[0].n, 1);
  });
});

test('shift catalog matches the work_shifts rows', async t => {
  await withTempDb(t, 'settings_schema_shifts', async (_db, client) => {
    const { rows } = await client.query('SELECT code, kind FROM work_shifts ORDER BY sort');
    assert.deepEqual(
      rows.map(r => r.code),
      SHIFT_CATALOG.map(s => s.code)
    );
    assert.deepEqual(
      rows.map(r => r.kind),
      SHIFT_CATALOG.map(s => s.kind)
    );
  });
});

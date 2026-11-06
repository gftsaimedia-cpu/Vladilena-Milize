import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SystemService } from '../../src/modules/system/system.service';
import { withTempDb } from './helpers/pg-temp-db';

// Mảng attendance của DB demo (docs/demo-db/attendance.md). Hai luật này không thử được trên DB demo dùng chung:
// chốt tháng đang chạy sẽ khoá công của mọi người. Ở đây chạy trên DB tạm (cần PG_TEST_URL).
// Luật: chỉ chốt công sau khi hết tháng; tháng phải là YYYY-MM. Đang là lỗi nên đánh dấu todo (không làm đỏ npm test).

const vnMonth = () => new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 7);

test(
  'lockPeriod refuses the month that is still running',
  { todo: 'BUG-attendance-16: system.service lockPeriod chốt được cả tháng đang chạy' },
  async t => {
    await withTempDb(t, 'demo_att_period', async (db, client) => {
      await assert.rejects(new SystemService(db).lockPeriod(vnMonth(), 'admin'));
      const { rows } = await client.query('SELECT month FROM payroll_periods');
      assert.deepEqual(rows, []);
    });
  }
);

test(
  'lockPeriod refuses a month that is not YYYY-MM',
  { todo: 'BUG-attendance-16: system.service lockPeriod nhận cả tháng "abc" và ghi một kỳ lương rác' },
  async t => {
    await withTempDb(t, 'demo_att_period', async (db, client) => {
      await assert.rejects(new SystemService(db).lockPeriod('abc', 'admin'));
      const { rows } = await client.query('SELECT month FROM payroll_periods');
      assert.deepEqual(rows, []);
    });
  }
);

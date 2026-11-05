import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SystemController } from '../../src/modules/system/system.controller';

// POST /api/v2/system/periods/:month/lock trả đúng trạng thái kỳ đã lưu (payroll_periods.status), không phải nhãn riêng.
test('the lock route reports the stored attendance_locked status', async () => {
  const calls: unknown[][] = [];
  const service = { lockPeriod: async (...args: unknown[]) => void calls.push(args) } as any;
  const controller = new SystemController(service);

  const res = await controller.lockPeriod('2026-11', { username: 'admin' } as any);

  assert.deepEqual(calls, [['2026-11', 'admin']]);
  assert.deepEqual(res, { ok: true, month: '2026-11', status: 'attendance_locked' });
});

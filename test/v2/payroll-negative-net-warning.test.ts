import assert from 'node:assert/strict';
import { test } from 'node:test';
import { negativeNetWarning } from '../../src/modules/payroll/domain/payroll-warning';

// Thực lĩnh âm không bị đổi số, chỉ có cảnh báo để Admin thấy (spec chưa nói gì, nên không tự chặn tiền).
test('negativeNetWarning names the field and the amount', () => {
  const w = negativeNetWarning(-630000);
  assert.equal(w.code, 'NEGATIVE_NET');
  assert.deepEqual(w.fields, ['netIncome']);
  assert.match(w.message, /Thực lĩnh âm/);
  assert.match(w.message, /630/);
});

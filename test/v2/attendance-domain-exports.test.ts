import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import * as domain from '../../src/modules/attendance/domain';

// Đơn từ dựng "ngày đã tới mốc xét" giống bộ dựng dòng ngày; hằng số dùng chung thay vì chép lại.
describe('attendance domain exports', () => {
  it('EVALUATE_AFTER_MS is exported from the domain barrel: 30 minutes after the last expected bound', () => {
    assert.equal((domain as Record<string, unknown>).EVALUATE_AFTER_MS, 30 * 60 * 1000);
  });
});

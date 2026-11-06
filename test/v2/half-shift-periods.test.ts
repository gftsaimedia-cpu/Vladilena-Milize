import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { requestMonths } from '../../src/modules/periods/domain/request-months.js';
import { GROUP_OF_TYPE, WHAT_OF_TYPE } from '../../src/modules/overview/domain/cells.js';

describe('half-shift periods and overview', () => {
  it('requestMonths({ halfShiftDate: "2026-12-01" }) returns ["2026-12"]', () => {
    assert.deepEqual(requestMonths({ halfShiftDate: '2026-12-01' }), ['2026-12']);
  });

  it('overview cell group and label for HALF_SHIFT_LEAVE', () => {
    assert.equal(GROUP_OF_TYPE.HALF_SHIFT_LEAVE, 'leave');
    assert.equal(WHAT_OF_TYPE.HALF_SHIFT_LEAVE, 'Nghỉ giữa ca');
  });
});

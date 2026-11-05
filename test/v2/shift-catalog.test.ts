import assert from 'node:assert/strict';
import { it } from 'node:test';
import * as commonChain from '../../src/common/version-chain';
import { DEFAULT_SHIFT, SHIFT_CATALOG, shiftByCode } from '../../src/common/shift-catalog';
import * as positionsChain from '../../src/modules/positions/domain/version-chain';

it('lists the six fixed frames in order', () => {
  assert.deepEqual(
    SHIFT_CATALOG.map(s => s.code),
    ['Normal1', 'Normal2', 'Flex1', 'Flex2', 'Night1', 'Night2']
  );
  assert.deepEqual(
    SHIFT_CATALOG.map(s => `${s.startTime}-${s.endTime}`),
    ['08:00-17:00', '10:00-19:00', '06:00-15:00', '13:00-22:00', '22:00-07:00', '21:00-06:00']
  );
  assert.deepEqual(shiftByCode('Night1'), { code: 'Night1', kind: 'night', shiftType: 'NIGHT', startTime: '22:00', endTime: '07:00' });
  assert.equal(shiftByCode('X'), null);
  assert.equal(DEFAULT_SHIFT.code, 'Normal1');
});

it('positions re-exports the shared version chain', () => {
  assert.equal(positionsChain.planChange, commonChain.planChange);
  assert.equal(positionsChain.versionAt, commonChain.versionAt);
});

// POST /requests/review-many: chỉ APPROVE, danh sách mã hợp lệ, người duyệt lấy từ phiên.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { RequestsController } from '../../src/modules/requests/requests.controller';

const ADMIN = { username: 'admin', name: 'Admin', role: 'admin', type: 'admin', level: 1 } as any;

function setup() {
  const calls: unknown[][] = [];
  const service = {
    approveMany: async (...args: unknown[]) => {
      calls.push(args);
      return { done: [], failed: [], recalculated: [] };
    }
  };
  return { ctrl: new RequestsController(service as any), calls };
}

describe('POST /requests/review-many', () => {
  it('approves the ids in the order sent, as the signed-in admin', async () => {
    const { ctrl, calls } = setup();
    const out = await ctrl.reviewMany({ ids: ['b', 'a'], action: 'APPROVE', reviewerId: 'mallory' }, ADMIN);
    assert.deepEqual(out, { done: [], failed: [], recalculated: [] });
    assert.deepEqual(calls, [[['b', 'a'], 'admin']]);
  });

  it('refuses REJECT with 400 BULK_REJECT_NOT_ALLOWED and any other action with 400', async () => {
    const { ctrl, calls } = setup();
    await assert.rejects(ctrl.reviewMany({ ids: ['a'], action: 'REJECT' }, ADMIN), (e: any) => e.status === 400 && e.details?.code === 'BULK_REJECT_NOT_ALLOWED');
    await assert.rejects(ctrl.reviewMany({ ids: ['a'], action: 'MAYBE' }, ADMIN), (e: any) => e.status === 400 && e.details?.code === 'BAD_REQUEST');
    await assert.rejects(ctrl.reviewMany({ ids: ['a'] }, ADMIN), (e: any) => e.status === 400);
    assert.deepEqual(calls, []);
  });

  it('refuses a bad list with 400 INVALID_IDS before touching anything', async () => {
    const { ctrl, calls } = setup();
    for (const ids of [undefined, [], ['a', 'a'], [1], 'a', Array.from({ length: 201 }, (_, i) => `r${i}`)]) {
      await assert.rejects(ctrl.reviewMany({ ids, action: 'APPROVE' }, ADMIN), (e: any) => e.status === 400 && e.details?.code === 'INVALID_IDS');
    }
    assert.deepEqual(calls, []);
  });
});

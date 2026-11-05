// Route duyệt và huỷ đơn của Admin: người thao tác lấy từ phiên; lỗi ghi nhật ký là lỗi lập trình nên ra 500
// (spec audit-log mục 4), không bị đổi thành 400.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { AuditEntryError } from '../../src/modules/audit';
import { RequestsController } from '../../src/modules/requests/requests.controller';

const ADMIN: any = { username: 'admin', name: 'Admin', role: 'admin', type: 'ql', level: 0 };

describe('Nhật ký ở route duyệt và huỷ đơn', () => {
  it('Admin cancel passes the session user to the service as the actor', async () => {
    const calls: unknown[][] = [];
    const svc: any = { cancelRequest: async (...args: unknown[]) => (calls.push(args), { id: 'r1' }) };
    await new RequestsController(svc).cancelRequest('r1', { employeeId: 'binh', reason: 'Nhập nhầm' }, ADMIN);
    assert.deepEqual(calls, [['r1', 'binh', 'Nhập nhầm', 'admin']]);
  });

  it('an audit entry error from review or cancel is rethrown unchanged', async () => {
    const boom = new AuditEntryError('Nhật ký request.decide: actor không được để trống');
    // Route duyệt gọi reviewAndRecalculate (duyệt rồi tự tính lại phiếu, spec kỳ lương D6).
    const svc: any = {
      reviewAndRecalculate: async () => {
        throw boom;
      },
      cancelRequest: async () => {
        throw boom;
      }
    };
    const ctrl = new RequestsController(svc);
    await assert.rejects(ctrl.reviewRequest('r1', { action: 'APPROVE' }, ADMIN), err => err === boom);
    await assert.rejects(ctrl.cancelRequest('r1', { employeeId: 'binh' }, ADMIN), err => err === boom);
  });
});

// Route Admin thêm giờ chấm công: người thao tác lấy từ phiên; lỗi ghi nhật ký là lỗi lập trình nên ra 500
// (spec audit-log mục 4), không bị đổi thành 400 BAD_PUNCH_INPUT.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { AuditEntryError } from '../../src/modules/audit';
import { AttendanceController } from '../../src/modules/attendance/attendance.controller';

const ADMIN: any = { username: 'admin', name: 'Admin', role: 'admin', type: 'ql', level: 0 };

describe('Nhật ký ở route Admin chấm công hộ', () => {
  it('passes the session user to the service as the actor', async () => {
    const calls: unknown[][] = [];
    const svc: any = { recordPunch: async (...args: unknown[]) => (calls.push(args), { ok: true }) };
    const body: any = { employeeId: 'u-nv', type: 'IN' };
    await new AttendanceController(svc).recordPunch(body, ADMIN);
    assert.deepEqual(calls, [[body, { actor: 'admin' }]]);
  });

  it('an audit entry error is rethrown unchanged', async () => {
    const boom = new AuditEntryError('Nhật ký punch.correct: actor không được để trống');
    const svc: any = {
      recordPunch: async () => {
        throw boom;
      }
    };
    await assert.rejects(
      new AttendanceController(svc).recordPunch({ employeeId: 'u-nv', type: 'IN' } as any, ADMIN),
      err => err === boom
    );
  });
});

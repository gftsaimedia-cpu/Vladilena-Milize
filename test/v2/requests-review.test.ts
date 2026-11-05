import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';
import { NV_UUID, leaveRequest, makeService, staffContext } from './helpers/requests-fakes';

/** Người duyệt có tên đăng nhập khác uuid, như mọi tài khoản trên DB thật. */
const REVIEWER_UUID = '0a7c4e2e-9999-4a6b-9c1d-000000000009';

describe('Duyệt đơn: người duyệt', () => {
  let ctx: ReturnType<typeof makeService>;
  beforeEach(() => {
    ctx = makeService();
    ctx.repo.putStaff('quantri', staffContext({ employeeId: REVIEWER_UUID }));
  });

  // reviewed_by REFERENCES staff(uuid): ghi tên đăng nhập là vi phạm khoá ngoại trên PostgreSQL.
  it('approving by username records the reviewer uuid', async () => {
    const req = leaveRequest('2026-11-12', '2026-11-12');
    await ctx.repo.save(req);
    const reviewed = await ctx.service.reviewRequest(req.id, 'quantri', 'APPROVE');
    assert.deepEqual([reviewed.status, reviewed.reviewedBy], ['APPROVED', REVIEWER_UUID]);
  });

  it('rejecting by username records the reviewer uuid', async () => {
    const req = leaveRequest('2026-11-12', '2026-11-12');
    await ctx.repo.save(req);
    const reviewed = await ctx.service.reviewRequest(req.id, 'quantri', 'REJECT', 'Không đủ người');
    assert.deepEqual([reviewed.status, reviewed.reviewedBy], ['REJECTED', REVIEWER_UUID]);
  });

  it('an unknown reviewer is refused before anything is written', async () => {
    const req = leaveRequest('2026-11-12', '2026-11-12');
    await ctx.repo.save(req);
    await assert.rejects(ctx.service.reviewRequest(req.id, 'khong-co', 'APPROVE'), /Không tìm thấy người duyệt: khong-co/);
    assert.equal(ctx.repo.requests.get(req.id)?.status, 'PENDING');
    assert.equal(ctx.att.schedules.has(`${NV_UUID}:2026-11-12`), false);
  });
});

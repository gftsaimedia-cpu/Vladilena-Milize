import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';
import { LOCK_TRX, NV_UUID, explanationRequest, leaveRequest, makeService, seed, staffContext } from './helpers/requests-fakes';

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
    await seed(ctx, req);
    const reviewed = await ctx.service.reviewRequest(req.id, 'quantri', 'APPROVE');
    assert.deepEqual([reviewed.status, reviewed.reviewedBy], ['APPROVED', REVIEWER_UUID]);
  });

  it('rejecting by username records the reviewer uuid', async () => {
    const req = leaveRequest('2026-11-12', '2026-11-12');
    await seed(ctx, req);
    const reviewed = await ctx.service.reviewRequest(req.id, 'quantri', 'REJECT', 'Không đủ người');
    assert.deepEqual([reviewed.status, reviewed.reviewedBy], ['REJECTED', REVIEWER_UUID]);
  });

  it('an unknown reviewer is refused before anything is written', async () => {
    const req = leaveRequest('2026-11-12', '2026-11-12');
    await seed(ctx, req);
    await assert.rejects(ctx.service.reviewRequest(req.id, 'khong-co', 'APPROVE'), /Không tìm thấy người duyệt: khong-co/);
    assert.equal(ctx.repo.requests.get(req.id)?.status, 'PENDING');
    assert.equal(ctx.att.schedules.has(`${NV_UUID}:2026-11-12`), false);
  });
});

// Trong khoá, mọi lệnh đọc/ghi phải chạy trên giao dịch của khoá: duyệt thành một khối (lưu lỗi thì lịch cũng huỷ),
// và mỗi thao tác chỉ giữ một kết nối của pool. Hồ sơ người nộp tra trước khi vào khoá thì chạy trên pool (undefined).
describe('Duyệt và nộp đơn chạy trên giao dịch của khoá', () => {
  let ctx: ReturnType<typeof makeService>;
  const clearCalls = () => {
    ctx.repo.calls.length = 0;
    ctx.att.calls.length = 0;
    ctx.holidays.calls.length = 0;
    ctx.days.calls.length = 0;
  };
  beforeEach(() => {
    ctx = makeService();
  });

  it('approving a leave reads and writes everything on the lock transaction', async () => {
    const req = leaveRequest('2026-11-12', '2026-11-12');
    await seed(ctx, req);
    clearCalls();

    await ctx.service.reviewRequest(req.id, 'admin', 'APPROVE');

    // Khoá đơn trước, rồi khoá nhân viên trên cùng giao dịch (§4).
    assert.deepEqual(ctx.lock.keys, [`request_${req.id}`, `requests_${NV_UUID}`]);
    // Kiểm lại (hồ sơ, lịch, đơn đang có, ngày lễ, day_status), xem ngày đơn giữ có thành ngày lễ không, rồi ghi lịch
    // theo các ngày đơn giữ.
    assert.deepEqual(ctx.repo.calls, [
      ['findById', LOCK_TRX],
      ['resolveStaffUuid', LOCK_TRX],
      ['findStaffContext', LOCK_TRX],
      ['listScheduleDays', LOCK_TRX],
      ['listActive', LOCK_TRX],
      ['save', LOCK_TRX]
    ]);
    assert.deepEqual(ctx.att.calls, [
      ['ensureDefaultSchedule', LOCK_TRX],
      ['saveSchedule', LOCK_TRX]
    ]);
    assert.deepEqual(ctx.holidays.calls, [
      ['listBetween', LOCK_TRX],
      ['listBetween', LOCK_TRX]
    ]);
    assert.deepEqual(ctx.days.calls, [
      ['listBetween', LOCK_TRX],
      ['listByRequest', LOCK_TRX],
      ['listByRequest', LOCK_TRX]
    ]);
  });

  it('rejecting a leave releases its days on the lock transaction', async () => {
    const req = leaveRequest('2026-11-12', '2026-11-12');
    await seed(ctx, req);
    clearCalls();

    await ctx.service.reviewRequest(req.id, 'admin', 'REJECT');

    assert.deepEqual(ctx.lock.keys, [`request_${req.id}`, `requests_${NV_UUID}`]);
    assert.deepEqual(ctx.repo.calls, [
      ['findById', LOCK_TRX],
      ['resolveStaffUuid', LOCK_TRX],
      ['save', LOCK_TRX]
    ]);
    assert.ok(ctx.days.calls.some(([name]) => name === 'remove'));
    for (const [name, trx] of ctx.days.calls) assert.equal(trx, LOCK_TRX, name);
    assert.deepEqual(ctx.att.calls, []);
    assert.equal(ctx.days.rows.size, 0);
  });

  it('approving an explanation marks the day on the lock transaction', async () => {
    const req = explanationRequest('2026-11-03');
    await ctx.repo.save(req);
    clearCalls();

    await ctx.service.reviewRequest(req.id, 'admin', 'APPROVE');

    assert.deepEqual(ctx.lock.keys, [`request_${req.id}`, `requests_${NV_UUID}`]);
    assert.deepEqual(ctx.att.calls, [['updateDayStatus', LOCK_TRX]]);
    assert.deepEqual(ctx.days.calls, [['listBetween', LOCK_TRX]]);
    assert.deepEqual(ctx.repo.calls.at(-1), ['save', LOCK_TRX]);
  });

  it('creating a leave looks up the staff first, then reads and saves on the lock transaction', async () => {
    await ctx.service.createLeaveRequest({
      employeeId: 'nv01', title: 'Nghỉ', reason: 'Việc nhà', leaveType: 'ANNUAL', startDate: '2026-11-12', endDate: '2026-11-12'
    });

    assert.deepEqual(ctx.repo.calls, [
      ['findStaffContext', undefined],
      ['listScheduleDays', LOCK_TRX],
      ['listActive', LOCK_TRX],
      ['save', LOCK_TRX]
    ]);
    assert.deepEqual(ctx.holidays.calls, [['listBetween', LOCK_TRX]]);
    assert.deepEqual(ctx.days.calls, [
      ['listBetween', LOCK_TRX],
      ['upsert', LOCK_TRX]
    ]);
  });

  it('an explanation checks the day and saves on the lock transaction', async () => {
    await ctx.service.createExplanationRequest({
      employeeId: 'nv01', title: 'Giải trình', reason: 'Quên quẹt thẻ', workDate: '2026-11-03', cases: ['MISSING_CHECK_IN']
    });

    assert.deepEqual(ctx.repo.calls, [
      ['findStaffContext', undefined],
      ['listScheduleDays', LOCK_TRX],
      ['listActive', LOCK_TRX],
      ['list', LOCK_TRX],
      ['save', LOCK_TRX]
    ]);
  });
});

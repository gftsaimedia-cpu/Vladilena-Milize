import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';
import { RequestsController } from '../../src/modules/requests/requests.controller';
import { EXPLANATION_CASES, SystemRequest } from '../../src/modules/requests/domain';
import { NV_UUID, explanationRequest, makeService, staffContext } from './helpers/requests-fakes';

describe('Đơn giải trình (§6.5)', () => {
  let ctx: ReturnType<typeof makeService>;
  beforeEach(() => {
    ctx = makeService();
  });

  const expl = (over: Record<string, unknown> = {}) =>
    ctx.service.createExplanationRequest({
      employeeId: 'nv01',
      title: 'Giải trình',
      reason: 'Kẹt xe',
      workDate: '2026-11-04',
      cases: ['LATE_CHECK_IN'],
      ...over
    } as any);

  it('cases are required, known and unique', async () => {
    await assert.rejects(expl({ cases: [] }), /Cần chọn ít nhất 1 trường hợp giải trình/);
    await assert.rejects(expl({ cases: 'LATE_CHECK_IN' }), /Cần chọn ít nhất 1 trường hợp giải trình/);
    await assert.rejects(expl({ cases: undefined }), /Cần chọn ít nhất 1 trường hợp giải trình/);
    await assert.rejects(expl({ cases: ['X'] }), /Trường hợp giải trình không hợp lệ: X/);
    await assert.rejects(expl({ cases: ['LATE_CHECK_IN', 'LATE_CHECK_IN'] }), /bị lặp: LATE_CHECK_IN/);
    assert.equal(ctx.repo.requests.size, 0);
  });

  it('stores cases in catalogue order and both actual times', async () => {
    const dto = await expl({ cases: ['EARLY_CHECK_OUT', 'LATE_CHECK_IN'], actualCheckIn: '08:20', actualCheckOut: '16:40' });
    assert.deepEqual(
      [dto.explanationCases, dto.actualCheckIn, dto.actualCheckOut, dto.explanationDate],
      [['LATE_CHECK_IN', 'EARLY_CHECK_OUT'], '08:20', '16:40', '2026-11-04']
    );
    assert.deepEqual(ctx.repo.requests.get(dto.id)!.explanationCases, ['LATE_CHECK_IN', 'EARLY_CHECK_OUT']);
  });

  it('missing actual times are stored as null', async () => {
    const dto = await expl({ cases: ['MISSING_CHECK_IN'], actualCheckIn: '', actualCheckOut: null });
    assert.deepEqual([dto.actualCheckIn, dto.actualCheckOut], [null, null]);
  });

  it('the work date is checked first', async () => {
    await assert.rejects(expl({ workDate: '2026-02-30', cases: [] }), /workDate must be a valid YYYY-MM-DD date string, got: 2026-02-30/);
    await assert.rejects(expl({ workDate: undefined }), /workDate must be a valid YYYY-MM-DD date string, got: undefined/);
    assert.deepEqual(ctx.repo.staffMonths, []);
  });

  it('no explanation for a future day', async () => {
    ctx.service.now = () => new Date('2026-11-04T10:00:00Z');
    await assert.rejects(expl({ workDate: '2026-11-05' }), /Không giải trình cho ngày trong tương lai/);
    // 23:30 giờ Việt Nam ngày 04/11 vẫn là hôm nay
    ctx.service.now = () => new Date('2026-11-04T16:30:00Z');
    assert.equal((await expl({ workDate: '2026-11-04' })).explanationDate, '2026-11-04');
    ctx.service.now = () => new Date('2026-11-04T17:30:00Z');
    assert.equal((await expl({ workDate: '2026-11-05' })).explanationDate, '2026-11-05');
  });

  it('one explanation per day; rejected blocks, cancelled does not', async () => {
    await ctx.repo.save(explanationRequest('2026-11-03', ['LATE_CHECK_IN'], 'CANCELLED'));
    assert.equal((await expl({ workDate: '2026-11-03' })).status, 'PENDING');
    await assert.rejects(expl({ workDate: '2026-11-03' }), /Ngày 03\/11 đã có đơn giải trình/);

    await ctx.repo.save(explanationRequest('2026-11-02', ['LATE_CHECK_IN'], 'REJECTED'));
    await assert.rejects(expl({ workDate: '2026-11-02' }), /Ngày 02\/11 đã có đơn giải trình/);
    await ctx.repo.save(explanationRequest('2026-11-04', ['LATE_CHECK_IN'], 'APPROVED'));
    await assert.rejects(expl(), /Ngày 04\/11 đã có đơn giải trình/);
  });

  it('username is stored as uuid, under the employee lock', async () => {
    const dto = await expl();
    assert.equal(dto.employeeId, NV_UUID);
    assert.deepEqual(ctx.lock.keys, [`requests_${NV_UUID}`]);
    assert.deepEqual(ctx.repo.staffMonths, ['2026-11']);
  });

  it('no position-type config is needed', async () => {
    ctx.repo.putStaff('nv01', staffContext({ regularDows: null }));
    assert.equal((await expl()).status, 'PENDING');
  });

  it('a bad actual time is refused', async () => {
    await assert.rejects(expl({ actualCheckOut: '25:00' }), /Giờ thực tế không hợp lệ: 25:00/);
    await assert.rejects(expl({ actualCheckIn: 820 }), /Giờ thực tế không hợp lệ: 820/);
  });

  it('approval marks the day VALID', async () => {
    const dto = await expl({ title: 'Giải trình quên quẹt thẻ vào', reason: 'Bảo vệ mở cửa muộn', cases: ['MISSING_CHECK_IN'], actualCheckIn: '08:05' });
    assert.deepEqual([dto.type, dto.status], ['EXPLANATION', 'PENDING']);
    const reviewed = await ctx.service.reviewRequest(dto.id, 'admin', 'APPROVE', 'Đã xác minh');
    assert.deepEqual([reviewed.status, reviewed.reviewedBy], ['APPROVED', 'admin']);
    assert.equal(ctx.att.dayStatuses.get(`${NV_UUID}:2026-11-04`), 'VALID');
  });

  it('the factory takes the cases and both times', () => {
    const dto = SystemRequest.createExplanationRequest({
      employeeId: NV_UUID, title: 't', reason: 'r', workDate: '2026-11-04',
      cases: ['MISSING_CHECK_OUT', 'LATE_CHECK_IN'], actualCheckIn: '08:20', actualCheckOut: null
    }).toJSON();
    assert.deepEqual(
      [dto.explanationDate, dto.explanationCases, dto.actualCheckIn, dto.actualCheckOut],
      ['2026-11-04', ['LATE_CHECK_IN', 'MISSING_CHECK_OUT'], '08:20', null]
    );
  });

  it('controller lists explanation cases', () =>
    assert.deepEqual(new RequestsController(ctx.service).listExplanationCases(), { cases: EXPLANATION_CASES }));

  it('the controller passes only the explanation fields', async () => {
    const seen: unknown[] = [];
    const fake = { createExplanationRequest: async (input: unknown) => (seen.push(input), { id: 'x' }) } as any;
    await new RequestsController(fake).createExplanation(
      { employeeId: 'nv01', title: 't', reason: 'r', workDate: '2026-11-04', cases: ['LATE_CHECK_IN'], actualCheckIn: '08:20',
        targetPunchType: 'IN', actualPunchTime: '08:20' },
      { username: 'admin' } as any
    );
    assert.deepEqual(seen, [
      { employeeId: 'nv01', title: 't', reason: 'r', workDate: '2026-11-04', cases: ['LATE_CHECK_IN'], actualCheckIn: '08:20', actualCheckOut: undefined }
    ]);
  });
});

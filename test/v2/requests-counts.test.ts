// Số đếm của tab Yêu cầu (thẻ trạng thái, cột loại đơn) và thời điểm huỷ trong DTO; service nối chúng vào listRequests.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { SystemRequest } from '../../src/modules/requests/domain';
import { requestCountsOf } from '../../src/modules/requests/domain/request-counts';
import { RequestsService } from '../../src/modules/requests/requests.service';
import type { RequestCountGroup, RequestListFilter } from '../../src/modules/requests/requests.repository';

const group = (status: string, type: string, total: number, oldest?: string): RequestCountGroup => ({
  status: status as any,
  type: type as any,
  total,
  oldest: oldest ? new Date(oldest) : null
});

describe('requestCountsOf', () => {
  it('zeroes every card and every tab type when there are no requests', () => {
    assert.deepEqual(requestCountsOf([]), {
      byStatus: { all: 0, PENDING: 0, APPROVED: 0, REJECTED: 0, CANCELLED: 0 },
      pendingByType: { LEAVE: 0, LEAVE_WITH_MAKEUP: 0, SHIFT_CHANGE: 0, OVERTIME: 0, ADVANCE: 0, EXPLANATION: 0 },
      oldestPendingDate: null
    });
  });

  it('sums by status, counts only pending per type and dates the oldest pending in Vietnam time', () => {
    const counts = requestCountsOf([
      group('PENDING', 'LEAVE', 4, '2026-10-14T18:00:00Z'), // 15/10 01:00 ICT
      group('PENDING', 'EXPLANATION', 3, '2026-10-20T01:00:00Z'),
      group('APPROVED', 'LEAVE', 2, '2026-09-01T01:00:00Z'),
      group('REJECTED', 'OVERTIME', 1, '2026-09-02T01:00:00Z'),
      group('CANCELLED', 'ADVANCE', 2, '2026-09-03T01:00:00Z')
    ]);
    assert.deepEqual(counts.byStatus, { all: 12, PENDING: 7, APPROVED: 2, REJECTED: 1, CANCELLED: 2 });
    assert.deepEqual(counts.pendingByType, { LEAVE: 4, LEAVE_WITH_MAKEUP: 0, SHIFT_CHANGE: 0, OVERTIME: 0, ADVANCE: 0, EXPLANATION: 3 });
    assert.equal(counts.oldestPendingDate, '2026-10-15', 'the oldest pending, not the oldest overall');
  });

  it('ignores a type that is not on the tab', () => {
    const counts = requestCountsOf([group('PENDING', 'ISAT', 5, '2026-01-01T00:00:00Z'), group('PENDING', 'LEAVE', 1, '2026-10-01T05:00:00Z')]);
    assert.equal(counts.byStatus.all, 1);
    assert.equal(counts.byStatus.PENDING, 1);
    assert.equal(counts.oldestPendingDate, '2026-10-01');
  });
});

describe('cancelledAt', () => {
  const leave = () =>
    SystemRequest.createLeaveRequest({
      employeeId: 'u-1',
      title: 'Nghỉ',
      reason: 'Việc nhà',
      leaveType: 'ANNUAL',
      startDate: '2026-11-10',
      endDate: '2026-11-10',
      daysCount: 1
    } as any);

  it('is null until the request is cancelled, then the time of the cancellation', () => {
    const req = leave();
    assert.equal(req.toJSON().cancelledAt, null);
    req.cancel('u-1', 'Nhập nhầm');
    const dto = req.toJSON();
    assert.equal(dto.status, 'CANCELLED');
    assert.equal(dto.cancelledAt, dto.updatedAt);
  });

  it('stays null for an approved or rejected request', () => {
    const approved = leave().approve('admin-uuid');
    assert.equal(approved.toJSON().cancelledAt, null);
    const rejected = leave().reject('admin-uuid', 'Không đủ ngày');
    assert.equal(rejected.toJSON().cancelledAt, null);
  });
});

describe('RequestsService.listRequests with the tab filters', () => {
  const seen: { list: RequestListFilter[]; count: unknown[]; groups: unknown[] } = { list: [], count: [], groups: [] };
  const repo = {
    list: async (f: RequestListFilter) => (seen.list.push(f), []),
    count: async (f: unknown) => (seen.count.push(f), 0),
    countGroups: async (f: unknown) => (seen.groups.push(f), [group('PENDING', 'LEAVE', 2, '2026-10-14T18:00:00Z')]),
    resolveStaffUuid: async (id: string) => (id === 'ha' ? 'u-ha' : null)
  };
  const service = new RequestsService(repo as any);
  const reset = () => ((seen.list = []), (seen.count = []), (seen.groups = []));

  it('inbox hides iSAT in the list and the total, always hides it in counts, and adds counts on request', async () => {
    reset();
    const out: any = await service.listRequests({ sort: 'inbox', staffIds: ['u-ha'], status: 'PENDING', type: 'LEAVE', withCounts: true });
    assert.deepEqual(seen.list[0].excludeTypes, ['ISAT']);
    assert.equal(seen.list[0].sort, 'inbox');
    assert.deepEqual(seen.list[0].staffIds, ['u-ha']);
    assert.deepEqual((seen.count[0] as any).excludeTypes, ['ISAT']);
    // Số đếm không theo status và type đang chọn.
    assert.deepEqual(seen.groups[0], { employeeIds: undefined, employeeId: undefined, staffIds: ['u-ha'], excludeTypes: ['ISAT'] });
    assert.equal(out.counts.byStatus.PENDING, 2);
    assert.equal(out.counts.oldestPendingDate, '2026-10-15');
  });

  it('without sort the list is unchanged and has no counts unless asked', async () => {
    reset();
    const out: any = await service.listRequests({ employeeId: 'ha' });
    assert.equal(seen.list[0].excludeTypes, undefined);
    assert.deepEqual(seen.list[0].employeeIds, ['ha', 'u-ha']);
    assert.equal('counts' in out, false);
    assert.equal(seen.groups.length, 0);
  });

  it('counts still hide iSAT when the list is not sorted as an inbox', async () => {
    reset();
    await service.listRequests({ withCounts: true });
    assert.deepEqual((seen.groups[0] as any).excludeTypes, ['ISAT']);
  });
});

import assert from 'node:assert/strict';
import { test, describe, it } from 'node:test';
import { randomUUID } from 'node:crypto';
import { RequestsService } from '../../src/modules/requests/requests.service';
import { RequestsRepository } from '../../src/modules/requests/requests.repository';
import { SystemRequest } from '../../src/modules/requests/domain';
import { FakeAttendanceRepository } from './helpers/requests-fakes';

class FakeRequestsRepository extends RequestsRepository {
  requests: Map<string, SystemRequest> = new Map();

  constructor() {
    super({} as any);
  }

  override async save(request: SystemRequest): Promise<void> {
    this.requests.set(request.id, request);
  }

  override async findById(id: string): Promise<SystemRequest | null> {
    return this.requests.get(id) || null;
  }

  override async list(filter: any = {}): Promise<SystemRequest[]> {
    let result = Array.from(this.requests.values());
    if (filter.employeeId) result = result.filter((r) => r.employeeId === filter.employeeId);
    if (filter.type) result = result.filter((r) => r.type === filter.type);
    if (filter.status) result = result.filter((r) => r.status === filter.status);
    return result;
  }

  override async count(filter: any = {}): Promise<number> {
    const items = await this.list(filter);
    return items.length;
  }
}

describe('Requests V2 - Đơn từ & Giải trình', () => {
  const reqRepo = new FakeRequestsRepository();
  const attRepo = new FakeAttendanceRepository();
  const service = new RequestsService(reqRepo, attRepo);
  const empId = randomUUID();

  it('1. Nộp đơn giải trình (EXPLANATION) & Duyệt giải trình cập nhật trạng thái ngày công sang VALID', async () => {
    const req = await service.createExplanationRequest({
      employeeId: empId,
      title: 'Giải trình quên quẹt thẻ vào',
      reason: 'Bảo vệ mở cửa muộn',
      workDate: '2026-11-04',
      actualCheckIn: '08:05',
    });

    assert.equal(req.type, 'EXPLANATION');
    assert.equal(req.status, 'PENDING');

    const reviewed = await service.reviewRequest(req.id, 'admin', 'APPROVE', 'Đã xác minh');
    assert.equal(reviewed.status, 'APPROVED');
    assert.equal(reviewed.reviewedBy, 'admin');
    assert.equal(attRepo.dayStatuses.get(`${empId}:2026-11-04`), 'VALID');
  });
});

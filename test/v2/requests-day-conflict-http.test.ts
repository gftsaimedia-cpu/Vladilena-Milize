import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';
import 'reflect-metadata';
import type { ArgumentsHost } from '@nestjs/common';
import { ApiExceptionFilter } from '../../src/common';
import { RequestsController } from '../../src/modules/requests/requests.controller';
import { MeController } from '../../src/modules/me/me.controller';
import { isatRequest, makeService, otRequest, seed } from './helpers/requests-fakes';

const C2 = 'Thứ Bảy 14/11 đã có iSAT được duyệt, không tính vào đơn.';
const C3 = 'Thứ Bảy 14/11 đang có đơn iSAT chờ duyệt. Huỷ đơn iSAT hoặc chọn ngày khác.';
const C1 = 'Thứ Bảy 14/11 đã có iSAT được duyệt, không chọn được ngày này.';

const ADMIN: any = { uuid: 'u-admin', username: 'admin', role: 'admin' };
const NAM_REQ: any = { user: { uuid: 'u-nam', username: 'nv01' } };

describe('API: warnings và lỗi DAY_CONFLICT của đơn từ', () => {
  let ctx: ReturnType<typeof makeService>;
  let admin: RequestsController;
  let me: MeController;

  beforeEach(() => {
    ctx = makeService();
    admin = new RequestsController(ctx.service);
    me = new MeController({} as any, ctx.service, {} as any, {} as any);
  });

  const leaveBody = (startDate: string, endDate = startDate) => ({
    title: 'Nghỉ',
    reason: 'Việc nhà',
    leaveType: 'ANNUAL',
    startDate,
    endDate
  });

  it('POST leave over approved ISAT returns warnings next to request', async () => {
    await seed(ctx, isatRequest('2026-11-14', 'APPROVED'));

    const body = (await admin.createLeave({ ...leaveBody('2026-11-12', '2026-11-16'), employeeId: 'nv01' }, ADMIN)) as any;

    assert.equal(body.created, true);
    assert.deepEqual(body.warnings, [C2]);
    assert.equal(body.request.type, 'LEAVE');
    assert.equal(body.request.leaveDaysCount, 3);
    assert.equal('warnings' in body.request, false);
  });

  it('POST leave over pending ISAT throws 400 DAY_CONFLICT with details', async () => {
    const isat = await seed(ctx, isatRequest('2026-11-14', 'PENDING'));

    await assert.rejects(admin.createLeave({ ...leaveBody('2026-11-14'), employeeId: 'nv01' }, ADMIN), (err: any) => {
      assert.equal(err.status, 400);
      assert.equal(err.message, C3);
      // Dạng trên dây: bộ lọc lỗi trải details ra phẳng, không có khoá message hay details.
      const sent: { status?: number; body?: unknown } = {};
      const res = {
        status(code: number) {
          sent.status = code;
          return this;
        },
        json(body: unknown) {
          sent.body = body;
        }
      };
      new ApiExceptionFilter().catch(err, { switchToHttp: () => ({ getResponse: () => res }) } as unknown as ArgumentsHost);
      assert.equal(sent.status, 400);
      assert.deepEqual(sent.body, {
        error: C3,
        code: 'DAY_CONFLICT',
        date: '2026-11-14',
        requestId: isat.id,
        requestType: 'ISAT',
        requestStatus: 'PENDING'
      });
      assert.deepEqual(err.details, {
        code: 'DAY_CONFLICT',
        date: '2026-11-14',
        requestId: isat.id,
        requestType: 'ISAT',
        requestStatus: 'PENDING'
      });
      return true;
    });
  });

  it('other create errors keep BAD_REQUEST', async () => {
    await assert.rejects(admin.createLeave({ ...leaveBody('2026-11-15'), employeeId: 'nv01' }, ADMIN), (err: any) => {
      assert.equal(err.status, 400);
      assert.equal(err.details.code, 'BAD_REQUEST');
      return true;
    });
  });

  it('review blocked by recheck throws 409 DAY_CONFLICT', async () => {
    const isat = await seed(ctx, isatRequest('2026-11-14', 'APPROVED'));
    const overtime = otRequest('2026-11-14', '08:00', '12:00', 'PENDING');
    await ctx.repo.save(overtime);

    await assert.rejects(admin.reviewRequest(overtime.id, { action: 'APPROVE' }, ADMIN), (err: any) => {
      assert.equal(err.status, 409);
      assert.equal(err.message, `${C1} Chỉ có thể từ chối đơn này.`);
      assert.deepEqual(err.details, {
        code: 'DAY_CONFLICT',
        date: '2026-11-14',
        requestId: isat.id,
        requestType: 'ISAT',
        requestStatus: 'APPROVED'
      });
      return true;
    });
    assert.equal(ctx.repo.requests.get(overtime.id)?.status, 'PENDING');

    const rejected = (await admin.reviewRequest(overtime.id, { action: 'REJECT', note: 'Không đủ người' }, ADMIN)) as any;
    assert.equal(rejected.request.status, 'REJECTED');
  });

  it('me/requests/leave returns the same body and error', async () => {
    const isat = await seed(ctx, isatRequest('2026-11-14', 'APPROVED'));

    await assert.rejects(me.createRequest(NAM_REQ, 'leave', leaveBody('2026-11-14')), (err: any) => {
      assert.equal(err.status, 400);
      assert.deepEqual(err.details, {
        code: 'DAY_CONFLICT',
        date: '2026-11-14',
        requestId: isat.id,
        requestType: 'ISAT',
        requestStatus: 'APPROVED'
      });
      return true;
    });

    const body = (await me.createRequest(NAM_REQ, 'leave', leaveBody('2026-11-12', '2026-11-16'))) as any;
    assert.equal(body.created, true);
    assert.deepEqual(body.warnings, [C2]);
    assert.equal('warnings' in body.request, false);
  });

  it('POST advance returns warnings []', async () => {
    const body = (await admin.createAdvance({ employeeId: 'nv01', title: 'Tạm ứng', reason: 'Việc nhà', amount: 1000000 }, ADMIN)) as any;
    assert.equal(body.created, true);
    assert.deepEqual(body.warnings, []);
    assert.equal('warnings' in body.request, false);
  });
});

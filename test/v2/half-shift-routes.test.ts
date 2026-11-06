import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';
import 'reflect-metadata';
import { RequestsController } from '../../src/modules/requests/requests.controller.js';
import { MeController } from '../../src/modules/me/me.controller.js';
import { makeService } from './helpers/requests-fakes.js';
import { HttpError } from '../../src/common/index.js';

const ADMIN: any = { uuid: 'u-admin', username: 'admin', role: 'admin' };
const NV_REQ: any = { user: { uuid: 'u-nv', username: 'nv01' } };

describe('Half-shift routes (RequestsController & MeController)', () => {
  let ctx: ReturnType<typeof makeService>;
  let admin: RequestsController;
  let me: MeController;

  beforeEach(() => {
    ctx = makeService();
    admin = new RequestsController(ctx.service);
    me = new MeController({} as any, ctx.service, {} as any, {} as any, {} as any, {} as any, {} as any);
  });

  it('Admin POST /api/v2/requests/half-shift-leave trả 201 createdBody', async () => {
    const res = (await (admin as any).createHalfShiftLeave(
      {
        employeeId: 'nv01',
        date: '2026-11-12',
        half: 'FIRST',
        reason: 'Việc gia đình'
      },
      ADMIN
    )) as any;

    assert.equal(res.created, true);
    assert.equal(res.request.type, 'HALF_SHIFT_LEAVE');
    assert.equal(res.request.halfShiftDate, '2026-11-12');
    assert.equal(res.request.owedMinutes, 240);
    assert.deepEqual(res.warnings, []);
  });

  it('Admin POST xung đột ngày ném HttpError DAY_CONFLICT 400', async () => {
    await (admin as any).createHalfShiftLeave(
      {
        employeeId: 'nv01',
        date: '2026-11-12',
        half: 'FIRST',
        reason: 'Lần 1'
      },
      ADMIN
    );

    await assert.rejects(
      (admin as any).createHalfShiftLeave(
        {
          employeeId: 'nv01',
          date: '2026-11-12',
          half: 'SECOND',
          reason: 'Lần 2 trùng ngày'
        },
        ADMIN
      ),
      (err: any) => err instanceof HttpError && err.status === 400 && err.details?.code === 'DAY_CONFLICT'
    );
  });

  it('me POST half-shift-leave dùng filedBy: self (ngoài khoảng ngày bị từ chối)', async () => {
    // Ngày 2026-11-03 là trước hôm nay (2026-11-04), self filing bị từ chối
    await assert.rejects(
      me.createRequest(NV_REQ, 'half-shift-leave', {
        date: '2026-11-03',
        half: 'FIRST',
        reason: 'Việc nhà'
      }),
      (err: any) => err instanceof HttpError && err.status === 400 && /Chỉ chọn ngày từ/i.test(err.message)
    );

    // Ngày hợp lệ (2026-11-12) tự nộp thành công
    const res = (await me.createRequest(NV_REQ, 'half-shift-leave', {
      date: '2026-11-12',
      half: 'FIRST',
      reason: 'Việc nhà'
    })) as any;
    assert.equal(res.created, true);
    assert.equal(res.request.type, 'HALF_SHIFT_LEAVE');
    assert.equal(res.request.halfShiftDate, '2026-11-12');
  });

  it('me preview half-shift-leave trả 200 ok:false cho lỗi nghiệp vụ', async () => {
    // Ngày Chủ nhật 2026-11-15 -> ok: false
    const preview = (await me.previewRequest(NV_REQ, 'half-shift-leave', {
      date: '2026-11-15',
      half: 'FIRST',
      reason: 'Việc nhà'
    })) as any;

    assert.equal(preview.ok, false);
    assert.equal(preview.message, 'Ngày 15/11 không phải ngày làm việc');

    // Ngày hợp lệ 2026-11-12 -> ok: true
    const okPreview = (await me.previewRequest(NV_REQ, 'half-shift-leave', {
      date: '2026-11-12',
      half: 'FIRST',
      reason: 'Việc nhà'
    })) as any;

    assert.equal(okPreview.ok, true);
    assert.equal(okPreview.summary.owedMinutes, 240);
  });

  it('isat preview vẫn trả 404', async () => {
    await assert.rejects(
      me.previewRequest(NV_REQ, 'isat', {
        saturday: '2026-11-14',
        team: 'Support',
        conditions: ['C1']
      }),
      (err: any) => err instanceof HttpError && err.status === 404 && err.details?.code === 'REQUEST_KIND_NOT_FOUND'
    );
  });
});

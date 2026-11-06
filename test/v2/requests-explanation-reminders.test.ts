import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';
import { BadRequestError } from '../../src/common';
import { RequestsController } from '../../src/modules/requests/requests.controller';
import {
  ADMIN_UUID,
  NV_UUID,
  explanationRequest,
  makeService,
  seed,
  staffContext,
  timesheet
} from './helpers/requests-fakes';

const NV02_UUID = '0a7c4e2e-4444-4a6b-9c1d-000000000004';
const ADMIN = { username: 'admin', name: 'Admin', role: 'admin', type: 'admin', level: 1 };

// Hôm nay 04/11/2026. nv01 vào làm 02/11: 02/11 thiếu giờ ra, 03/11 vào muộn. nv02 vào làm 03/11: 03/11 vào muộn.
describe('Lời nhắc giải trình và route Admin (spec 3.4–3.5)', () => {
  let ctx: ReturnType<typeof makeService>;
  beforeEach(() => {
    ctx = makeService();
    ctx.repo.putStaff('nv01', staffContext({ startDate: '2026-11-02' }));
    ctx.att.timesheets.push(timesheet('2026-11-03', '08:40', '17:05'), timesheet('2026-11-02', '08:00', null));
  });

  const setNow = (iso: string) => {
    ctx.service.now = () => new Date(iso);
  };

  it('remind then remind again overwrites', async () => {
    setNow('2026-11-04T02:40:00Z');
    assert.deepEqual(await ctx.explanations.remind('nv01', '2026-11-02', 'admin'), {
      remindedAt: '2026-11-04T02:40:00.000Z'
    });
    assert.deepEqual(await ctx.explanations.reminders('nv01'), [
      { date: '2026-11-02', remindedAt: '2026-11-04T02:40:00.000Z' }
    ]);

    setNow('2026-11-04T03:10:00Z');
    await ctx.explanations.remind('nv01', '2026-11-02', 'admin');
    assert.deepEqual(await ctx.explanations.reminders('nv01'), [
      { date: '2026-11-02', remindedAt: '2026-11-04T03:10:00.000Z' }
    ]);
    assert.equal(ctx.reminders.rows.size, 1);
    // reminded_by là uuid của Admin, không phải tên đăng nhập; người được nhắc cũng là uuid.
    assert.deepEqual([...ctx.reminders.rows.values()].map(r => [r.employeeId, r.remindedBy]), [[NV_UUID, ADMIN_UUID]]);
  });

  it('reminders are newest first and only for days with a reminder', async () => {
    await ctx.explanations.remind('nv01', '2026-11-02', 'admin');
    await ctx.explanations.remind(NV_UUID, '2026-11-03', 'admin');
    assert.deepEqual(
      (await ctx.explanations.reminders('nv01')).map(r => r.date),
      ['2026-11-03', '2026-11-02']
    );
  });

  it('cannot remind an explained day', async () => {
    await seed(ctx, explanationRequest('2026-11-02', ['MISSING_CHECK_OUT'], 'PENDING'));
    await assert.rejects(ctx.explanations.remind('nv01', '2026-11-02', 'admin'), /^Error: Ngày 02\/11 đã có đơn giải trình$/);
    assert.equal(ctx.reminders.rows.size, 0);
  });

  it('cannot remind when the admin account is unknown', async () => {
    await assert.rejects(ctx.explanations.remind('nv01', '2026-11-02', 'ghost'), /Không tìm thấy tài khoản Admin/);
    assert.equal(ctx.reminders.rows.size, 0);
  });

  it('cancelled explanation brings the reminder back', async () => {
    await ctx.explanations.remind('nv01', '2026-11-02', 'admin');
    const req = await seed(ctx, explanationRequest('2026-11-02', ['MISSING_CHECK_OUT'], 'PENDING'));
    assert.deepEqual(await ctx.explanations.reminders('nv01'), []);

    await ctx.service.cancelRequest(req.id, 'nv01');
    assert.deepEqual((await ctx.explanations.reminders('nv01')).map(r => r.date), ['2026-11-02']);
  });

  describe('listDue', () => {
    beforeEach(() => {
      ctx.repo.putStaff('nv02', staffContext({ employeeId: NV02_UUID, startDate: '2026-11-03' }));
      ctx.att.timesheets.push(timesheet('2026-11-03', '08:40', '17:05', NV02_UUID));
      ctx.repo.filingStaff = [
        { uuid: NV02_UUID, username: 'nv02', name: 'Trần Thị B' },
        { uuid: NV_UUID, username: 'nv01', name: 'Nguyễn Văn A' }
      ];
    });

    it('names every person, newest day first then by name', async () => {
      const items = await ctx.explanations.listDue();
      assert.deepEqual(
        items.map(i => [i.name, i.date]),
        [
          ['Nguyễn Văn A', '2026-11-03'],
          ['Trần Thị B', '2026-11-03'],
          ['Nguyễn Văn A', '2026-11-02']
        ]
      );
      assert.deepEqual(
        items.map(i => i.employeeId),
        [NV_UUID, NV02_UUID, NV_UUID]
      );
      assert.deepEqual(items[2], {
        employeeId: NV_UUID,
        name: 'Nguyễn Văn A',
        date: '2026-11-02',
        cases: ['MISSING_CHECK_OUT'],
        needs: { checkIn: false, checkOut: true },
        remindedAt: null,
        checkIn: '08:00',
        checkOut: null
      });
    });

    it('shows the reminder of each day', async () => {
      setNow('2026-11-04T02:40:00Z');
      await ctx.explanations.remind('nv02', '2026-11-03', 'admin');
      const items = await ctx.explanations.listDue();
      assert.deepEqual(
        items.map(i => i.remindedAt),
        [null, '2026-11-04T02:40:00.000Z', null]
      );
    });

    it('skips a person whose days cannot be read (T8a)', async () => {
      ctx.repo.filingStaff = [
        { uuid: '0a7c4e2e-9999-4a6b-9c1d-000000000009', username: 'khong-ho-so', name: 'Không hồ sơ' },
        ...(ctx.repo.filingStaff ?? [])
      ];
      const items = await ctx.explanations.listDue();
      assert.deepEqual(
        items.map(i => [i.name, i.date]),
        [
          ['Nguyễn Văn A', '2026-11-03'],
          ['Trần Thị B', '2026-11-03'],
          ['Nguyễn Văn A', '2026-11-02']
        ]
      );
    });
  });

  describe('admin routes', () => {
    it('remind route needs employeeId', async () => {
      const ctl = new RequestsController(ctx.service, ctx.explanations);
      await assert.rejects(
        ctl.remindExplanation({ date: '2026-11-02' }, ADMIN),
        (e: any) => e instanceof BadRequestError && e.message === 'Thiếu employeeId của nhân viên' && e.status === 400
      );
    });

    it('remind route reports business errors as 400', async () => {
      const ctl = new RequestsController(ctx.service, ctx.explanations);
      await assert.rejects(
        ctl.remindExplanation({ employeeId: 'nv01', date: '2026-11-05' }, ADMIN),
        (e: any) => e instanceof BadRequestError && e.message === 'Không giải trình cho ngày trong tương lai'
      );
      await assert.rejects(
        ctl.remindExplanation({ employeeId: 'nv01', date: 'xyz' }, ADMIN),
        (e: any) => e instanceof BadRequestError
      );
    });

    it('remind route: a locked or calculated month can be reminded, an approved month is a 409 PERIOD_LOCKED', async () => {
      setNow('2026-11-04T02:40:00Z');
      const ctl = new RequestsController(ctx.service, ctx.explanations);
      ctx.periods.statuses.set('2026-11', 'attendance_locked');
      assert.equal((await ctl.remindExplanation({ employeeId: 'nv01', date: '2026-11-02' }, ADMIN)).reminded, true);
      ctx.periods.statuses.set('2026-11', 'approved');
      await assert.rejects(ctl.remindExplanation({ employeeId: 'nv01', date: '2026-11-03' }, ADMIN), (e: any) => {
        assert.equal(e.status, 409);
        assert.equal(e.message, 'Kỳ lương tháng 11/2026 đã phê duyệt');
        assert.deepEqual(e.details, { code: 'PERIOD_LOCKED', month: '2026-11', status: 'approved' });
        return true;
      });
      assert.deepEqual([...ctx.reminders.rows.values()].map(r => r.date), ['2026-11-02']);
    });

    it('remind route reminds as the signed-in admin', async () => {
      setNow('2026-11-04T02:40:00Z');
      const ctl = new RequestsController(ctx.service, ctx.explanations);
      assert.deepEqual(await ctl.remindExplanation({ employeeId: 'nv01', date: '2026-11-02' }, ADMIN), {
        reminded: true,
        remindedAt: '2026-11-04T02:40:00.000Z'
      });
      assert.equal([...ctx.reminders.rows.values()][0].remindedBy, ADMIN_UUID);
    });

    it('explanations-due route lists the due items', async () => {
      ctx.repo.filingStaff = [{ uuid: NV_UUID, username: 'nv01', name: 'Nguyễn Văn A' }];
      const ctl = new RequestsController(ctx.service, ctx.explanations, { find: async () => [] } as any);
      const { items } = await ctl.listExplanationsDue();
      assert.deepEqual(
        items.map(i => [i.name, i.date]),
        [
          ['Nguyễn Văn A', '2026-11-03'],
          ['Nguyễn Văn A', '2026-11-02']
        ]
      );
    });
  });
});

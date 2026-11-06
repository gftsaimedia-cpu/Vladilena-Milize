import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';
import { RequestsController } from '../../src/modules/requests/requests.controller';
import { RequestsService } from '../../src/modules/requests/requests.service';
import type { RequestListFilter } from '../../src/modules/requests/requests.repository';
import { EXPLANATION_CASES, SystemRequest } from '../../src/modules/requests/domain';
import {
  ADMIN_UUID,
  FakeRequestsRepository,
  LOCK_TRX,
  NV_UUID,
  explanationRequest,
  makeService,
  staffContext,
  timesheet
} from './helpers/requests-fakes';

// Cùng dữ liệu gieo như requests-explanations-due: hôm nay 04/11; nv01 vào làm 02/11, ca 08–17.
// 02/11: vào 08:00, không có giờ ra → thiếu giờ ra. 03/11: vào 08:40, ra 17:05 → vào muộn.
describe('Đơn giải trình (§6.5, spec 3.3)', () => {
  let ctx: ReturnType<typeof makeService>;
  beforeEach(() => {
    ctx = makeService();
    ctx.repo.putStaff('nv01', staffContext({ startDate: '2026-11-02' }));
    ctx.att.timesheets.push(timesheet('2026-11-03', '08:40', '17:05'), timesheet('2026-11-02', '08:00', null));
  });

  const expl = (over: Record<string, unknown> = {}) =>
    ctx.service.createExplanationRequest({
      employeeId: 'nv01',
      title: 'Giải trình',
      reason: 'Kẹt xe',
      workDate: '2026-11-03',
      cases: ['LATE_CHECK_IN'],
      ...over
    } as any);

  it('cases come from punches', async () => {
    const dto = await expl({ workDate: '2026-11-02', cases: ['LATE_CHECK_IN'], actualCheckOut: '17:30' });
    assert.deepEqual(dto.explanationCases, ['MISSING_CHECK_OUT']);
    assert.equal(dto.title, 'Giải trình 02/11');
    assert.deepEqual([dto.actualCheckIn, dto.actualCheckOut], [null, '17:30']);
  });

  it('client cases are ignored, whatever they hold', async () => {
    for (const cases of [[], 'LATE_CHECK_IN', undefined, ['X'], ['LATE_CHECK_IN', 'LATE_CHECK_IN'], ['MISSING_CHECK_IN']]) {
      assert.deepEqual(
        await ctx.service.previewRequest('explanation', { employeeId: 'nv01', reason: 'Kẹt xe', workDate: '2026-11-03', cases }),
        {
          ok: true,
          title: 'Giải trình 03/11',
          summary: { cases: ['LATE_CHECK_IN'], needs: { checkIn: false, checkOut: false } },
          warnings: []
        },
        JSON.stringify(cases)
      );
    }
    assert.equal(ctx.repo.requests.size, 0);
  });

  it('missing out requires the time', async () => {
    await assert.rejects(expl({ workDate: '2026-11-02' }), { message: 'Nhập giờ ra thực tế' });
    await assert.rejects(expl({ workDate: '2026-11-02', actualCheckOut: '' }), { message: 'Nhập giờ ra thực tế' });
    assert.equal(ctx.repo.requests.size, 0);
  });

  it('missing in requires the time; a day without punches needs both', async () => {
    // Hôm nay có giờ ra mà chưa có giờ vào: thiếu giờ vào là chắc chắn.
    ctx.att.timesheets = [timesheet('2026-11-04', null, '17:10')];
    await assert.rejects(expl({ workDate: '2026-11-04' }), { message: 'Nhập giờ vào thực tế' });

    // 03/11 giờ không còn dòng chấm công: thiếu cả giờ vào lẫn giờ ra.
    await assert.rejects(expl({ actualCheckOut: '17:00' }), { message: 'Nhập giờ vào thực tế' });
    await assert.rejects(expl({ actualCheckIn: '08:00' }), { message: 'Nhập giờ ra thực tế' });
    const dto = await expl({ actualCheckIn: '08:20', actualCheckOut: '16:40' });
    assert.deepEqual(
      [dto.explanationCases, dto.actualCheckIn, dto.actualCheckOut, dto.explanationDate],
      [['MISSING_CHECK_IN', 'MISSING_CHECK_OUT'], '08:20', '16:40', '2026-11-03']
    );
  });

  it('unneeded times are dropped', async () => {
    const dto = await expl({ actualCheckIn: '08:00', actualCheckOut: '17:00' });
    assert.deepEqual([dto.actualCheckIn, dto.actualCheckOut], [null, null]);
    assert.deepEqual(ctx.repo.requests.get(dto.id)!.actualCheckIn, null);
  });

  it('out must be after in, except on a night shift (R-P5)', async () => {
    ctx.att.timesheets = [];
    await assert.rejects(expl({ actualCheckIn: '17:00', actualCheckOut: '08:00' }), { message: 'Giờ ra phải sau giờ vào' });
    await assert.rejects(expl({ actualCheckIn: '08:00', actualCheckOut: '08:00' }), { message: 'Giờ ra phải sau giờ vào' });

    // Ca đêm 22:00–06:00: giờ ra rơi vào sáng hôm sau.
    ctx.repo.schedules.push({ date: '2026-11-03', startTime: '22:00', endTime: '06:00', onLeave: false });
    const dto = await expl({ actualCheckIn: '22:00', actualCheckOut: '06:00' });
    assert.deepEqual([dto.actualCheckIn, dto.actualCheckOut], ['22:00', '06:00']);
  });

  // D7 (người dùng chốt 06/11): giải trình nhận mọi giờ khai, kiểm tra là việc của Admin. Giờ khai không bị so với lần chấm
  // thật còn lại của ngày.
  it('a declared time is not checked against the real punch left on the day (D7)', async () => {
    // 02/11: vào thật 08:00, thiếu giờ ra; khai giờ ra 07:00 (trước giờ vào thật) vẫn nhận.
    const out = await expl({ workDate: '2026-11-02', actualCheckOut: '07:00' });
    assert.deepEqual([out.explanationDate, out.actualCheckIn, out.actualCheckOut], ['2026-11-02', null, '07:00']);
    // 04/11: ra thật 16:40, thiếu giờ vào; khai giờ vào 18:00 (sau giờ ra thật) vẫn nhận.
    ctx.att.timesheets.push(timesheet('2026-11-04', null, '16:40'));
    const inn = await expl({ workDate: '2026-11-04', actualCheckIn: '18:00' });
    assert.deepEqual([inn.explanationDate, inn.actualCheckIn, inn.actualCheckOut], ['2026-11-04', '18:00', null]);
  });

  // Người dùng chốt 05/11: giải trình nộp được tới khi kỳ được phê duyệt ("Nộp tới Phê duyệt kỳ").
  it('an explanation is accepted while the month is locked or calculated, by staff and by Admin', async () => {
    ctx.periods.statuses.set('2026-11', 'attendance_locked');
    const byAdmin = await expl();
    assert.equal(byAdmin.explanationDate, '2026-11-03');
    ctx.periods.statuses.set('2026-11', 'calculated');
    const bySelf = await expl({ workDate: '2026-11-02', actualCheckOut: '17:30' });
    assert.equal(bySelf.explanationDate, '2026-11-02');
    assert.equal(ctx.repo.requests.size, 2);
    // Cổng kỳ giữ khoá chia sẻ của tháng trên giao dịch của khoá nhân viên.
    assert.deepEqual(ctx.periods.sharedLocks.slice(-1), [[LOCK_TRX, '2026-11']]);
  });

  it('an explanation is refused with 409 PERIOD_LOCKED once the period is approved or paid', async () => {
    for (const [status, message] of [
      ['approved', 'Kỳ lương tháng 11/2026 đã phê duyệt'],
      ['paid', 'Kỳ lương tháng 11/2026 đã trả lương']
    ]) {
      ctx.periods.statuses.set('2026-11', status);
      await assert.rejects(expl(), (e: any) => {
        assert.equal(e.status, 409, status);
        assert.equal(e.message, message);
        assert.deepEqual(e.details, { code: 'PERIOD_LOCKED', month: '2026-11', status });
        return true;
      });
      assert.deepEqual(
        await ctx.service.previewRequest('explanation', { employeeId: 'nv01', reason: 'Kẹt xe', workDate: '2026-11-03' }),
        { ok: false, message, code: 'PERIOD_LOCKED', month: '2026-11', status }
      );
    }
    assert.equal(ctx.repo.requests.size, 0);
  });

  it('a day with nothing to explain, or not a workday, is refused', async () => {
    await assert.rejects(expl({ workDate: '2026-11-04' }), { message: 'Ngày 04/11 không có gì cần giải trình' });
    // Người đã vào làm từ trước: Chủ nhật 01/11 là ngày không làm.
    ctx.repo.putStaff('nv01', staffContext({ startDate: '2026-10-01' }));
    await assert.rejects(expl({ workDate: '2026-11-01' }), { message: 'Ngày 01/11 không phải ngày làm' });
  });

  // D6 (người dùng chốt 06/11): ngày ngoài khoảng vào làm..nghỉ việc bị chặn trước mọi kiểm tra khác của ngày.
  it('a day before the start date is refused as not employed, workday or not', async () => {
    for (const [date, text] of [['2026-11-01', '01/11/2026'], ['2026-10-31', '31/10/2026']]) {
      await assert.rejects(expl({ workDate: date }), (e: any) => {
        assert.equal(e.message, `Ngày ${text} nằm ngoài thời gian làm việc (vào làm từ 02/11/2026)`);
        assert.equal(e.status, 409);
        assert.deepEqual(e.details, { code: 'NOT_EMPLOYED', date });
        return true;
      });
    }
    assert.equal(ctx.repo.requests.size, 0);
  });

  it('stores cases in catalogue order', async () => {
    // Hôm nay: ra 16:40, chưa có giờ vào → máy thấy "thiếu giờ vào" rồi "ra sớm"; đơn lưu theo thứ tự danh mục.
    ctx.att.timesheets.push(timesheet('2026-11-04', null, '16:40'));
    const dto = await expl({ workDate: '2026-11-04', actualCheckIn: '08:20' });
    assert.deepEqual(
      [dto.explanationCases, dto.actualCheckIn, dto.actualCheckOut],
      [['EARLY_CHECK_OUT', 'MISSING_CHECK_IN'], '08:20', null]
    );
    assert.deepEqual(ctx.repo.requests.get(dto.id)!.explanationCases, ['EARLY_CHECK_OUT', 'MISSING_CHECK_IN']);
  });

  it('missing actual times are stored as null', async () => {
    const dto = await expl({ actualCheckIn: '', actualCheckOut: null });
    assert.deepEqual([dto.actualCheckIn, dto.actualCheckOut], [null, null]);
  });

  it('the work date is checked first', async () => {
    await assert.rejects(expl({ workDate: '2026-02-30', cases: [] }), /workDate must be a valid YYYY-MM-DD date string, got: 2026-02-30/);
    await assert.rejects(expl({ workDate: undefined }), /workDate must be a valid YYYY-MM-DD date string, got: undefined/);
    assert.deepEqual(ctx.repo.staffMonths, []);
  });

  it('no explanation for a future day', async () => {
    ctx.att.timesheets.push(timesheet('2026-11-04', '08:40', null), timesheet('2026-11-05', '08:40', null));
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
    await assert.rejects(expl({ workDate: '2026-11-04' }), /Ngày 04\/11 đã có đơn giải trình/);
  });

  it('a duplicate filed meanwhile is still caught under the lock', async () => {
    // Đơn trùng xuất hiện sau lúc xét ngày, trước lúc lưu: chỉ lần đọc trong khoá thấy được.
    let raced = false;
    const list = FakeRequestsRepository.prototype.list;
    ctx.repo.list = async function (this: FakeRequestsRepository, filter?: RequestListFilter) {
      if (this.trx === LOCK_TRX && !raced) {
        raced = true;
        await ctx.repo.save(explanationRequest('2026-11-03'));
      }
      return list.call(this, filter);
    };
    await assert.rejects(expl(), { message: 'Ngày 03/11 đã có đơn giải trình' });
    assert.equal(raced, true);
    assert.equal(ctx.repo.requests.size, 1);
  });

  it('username is stored as uuid, under the employee lock', async () => {
    const dto = await expl();
    assert.equal(dto.employeeId, NV_UUID);
    assert.deepEqual(ctx.lock.keys, [`requests_${NV_UUID}`]);
    assert.deepEqual(ctx.repo.staffMonths, ['2026-11']);
  });

  it('a position-type config is needed to find the day', async () => {
    ctx.repo.putStaff('nv01', staffContext({ regularDows: null }));
    await assert.rejects(expl(), { message: 'Thiếu cấu hình loại nhân sự nv' });
  });

  it('without the explanations service, filing is refused', async () => {
    const bare = new RequestsService(ctx.repo, ctx.att, undefined, ctx.holidays, ctx.days, ctx.gate);
    bare.now = ctx.service.now;
    await assert.rejects(
      bare.createExplanationRequest({ employeeId: 'nv01', reason: 'Kẹt xe', workDate: '2026-11-03', cases: [] }),
      { message: 'Chưa cấu hình giải trình' }
    );
  });

  it('a bad actual time is refused when the time is needed', async () => {
    await assert.rejects(expl({ workDate: '2026-11-02', actualCheckOut: '25:00' }), /Giờ thực tế không hợp lệ: 25:00/);
    ctx.att.timesheets = [];
    await assert.rejects(expl({ actualCheckIn: 820, actualCheckOut: '17:00' }), /Giờ thực tế không hợp lệ: 820/);
  });

  it('approval rewrites the day row instead of marking the day VALID', async () => {
    const dto = await expl({ title: 'Giải trình quên quẹt thẻ vào', reason: 'Bảo vệ mở cửa muộn', cases: ['MISSING_CHECK_IN'], actualCheckIn: '08:05' });
    assert.deepEqual([dto.type, dto.status], ['EXPLANATION', 'PENDING']);
    const reviewed = await ctx.service.reviewRequest(dto.id, 'admin', 'APPROVE', 'Đã xác minh');
    assert.deepEqual([reviewed.status, reviewed.reviewedBy], ['APPROVED', ADMIN_UUID]);
    // Một lần lúc nộp, một lần lúc duyệt; không còn đánh dấu ngày VALID.
    assert.deepEqual(ctx.attendanceDays.calls.map(c => [c.employeeId, c.dates]), [
      [NV_UUID, ['2026-11-03']],
      [NV_UUID, ['2026-11-03']]
    ]);
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

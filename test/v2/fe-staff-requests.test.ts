import assert from 'node:assert/strict';
import { planMakeupMock } from '../../web/src/mock/makeup-plan';
import { describe, it } from 'node:test';
import { FILING_RULES, filingDayStates, otLeftMinutes } from '../../src/modules/requests/domain/filing-choices';
import {
  advanceLines,
  caseDetail,
  caseText,
  contextFromApi,
  staffRequestsClient,
  dateLabel,
  endDates,
  endHours,
  fitEnd,
  frameLabel,
  leaveBalance,
  leaveDates,
  leaveSummary,
  makeupCountLine,
  makeupNeedLine,
  otHoursLine,
  otMonthLine,
  shiftChangeDates,
  shiftChangeSummary,
  slotDates,
  startDates,
  startHours,
  type RequestContext
} from '../../web/src/builders/api/staff-requests';
import { FIXTURE_REST, annualLeaveLeftOf, fixtureDays, fixtureMonths, type FixtureOver } from './helpers/staff-requests-fixture';

// request-context đúng như server trả (cờ ngày, otHours, choices do src/modules/requests/domain/filing-choices tính), rồi qua
// contextFromApi như FE thật. Các test dưới vì vậy kiểm luật lựa chọn của server qua đúng các hàm tra cứu form dùng.
type Over = FixtureOver & { explanationDays?: RequestContext['explanationDays'] };

function context(over: Over = {}): RequestContext {
  const months = fixtureMonths(over);
  const annualLeaveLeft = annualLeaveLeftOf(over);
  const base = fixtureDays(over).map(d => ({ ...d, shift: d.shift && { start: d.shift.start, end: d.shift.end } }));
  const { days, choices } = filingDayStates({ days: base, months, annualLeaveLeft });
  return contextFromApi({
    ...FIXTURE_REST,
    months,
    annualLeaveLeft,
    days: days as any,
    explanationDays: over.explanationDays ?? [],
    choices,
    rules: FILING_RULES
  });
}
const dayAt = (ctx: RequestContext, date: string) => ctx.days.find(d => d.date === date)!;

describe('Tạo yêu cầu: ngày chọn được', () => {
  it('leave starts skip Sundays and days held by a leave', () => {
    const starts = startDates(context(), 'leave');
    assert.deepEqual(starts.slice(0, 7), ['2026-11-10', '2026-11-12', '2026-11-13', '2026-11-14', '2026-11-16', '2026-11-17', '2026-11-19']);
    for (const d of ['2026-11-11', '2026-11-15', '2026-11-18', '2026-11-22']) assert.ok(!starts.includes(d), d);
  });

  // Thứ Bảy 14/11 đã có iSAT được duyệt, Thứ Bảy 21/11 có iSAT chờ duyệt.
  const isat = () =>
    context({ claims: { '2026-11-14': { status: 'ISAT', pending: false }, '2026-11-21': { status: 'ISAT', pending: true } } });

  it('an iSAT Saturday is never offered as a leave start', () => {
    for (const kind of ['leave', 'leave-with-makeup'] as const) {
      const starts = startDates(isat(), kind);
      assert.ok(starts.includes('2026-11-13'), kind);
      assert.ok(!starts.includes('2026-11-14') && !starts.includes('2026-11-21'), kind);
    }
  });

  it('leave ends skip an approved iSAT and stop before a pending one', () => {
    assert.deepEqual(endDates(isat(), 'leave', '2026-11-13'), ['2026-11-13', '2026-11-16', '2026-11-17']);
    assert.deepEqual(endDates(isat(), 'leave', '2026-11-19'), ['2026-11-19', '2026-11-20']);
  });

  it('leave days drop an approved iSAT Saturday', () => {
    assert.deepEqual(leaveDates(isat(), '2026-11-13', '2026-11-16'), ['2026-11-13', '2026-11-16']);
    assert.equal(leaveSummary(isat(), '2026-11-13', '2026-11-16'), '2 ngày làm việc: 13 và 16/11');
  });

  it('shift-change ends start where the range first holds a changeable workday', () => {
    // [29..29] chỉ có Chủ nhật: chưa có ngày đổi ca nào, nên "Đến ngày" bắt đầu từ 30/11.
    assert.deepEqual(endDates(context(), 'shift-change', '2026-11-29'), [
      '2026-11-30', '2026-12-01', '2026-12-02', '2026-12-03', '2026-12-04', '2026-12-05', '2026-12-06'
    ]);
    assert.deepEqual(endDates(context(), 'shift-change', ''), []);
  });

  it('a shift-change start needs a changeable workday before the next blocking day', () => {
    const starts = startDates(context(), 'shift-change');
    assert.ok(!starts.includes('2026-12-06'), 'Sunday at the end of the window');
    assert.ok(starts.includes('2026-11-29'), 'a Sunday followed by workdays');
    assert.ok(starts.includes('2026-11-11'), 'a kept leave day followed by workdays');
  });

  it('shift-change ends stop before a day held by another shift change, which is no start', () => {
    for (const pending of [true, false]) {
      const ctx = context({ claims: { '2026-11-23': { status: 'SHIFT_CHANGE', pending } } });
      const starts = startDates(ctx, 'shift-change');
      assert.ok(!starts.includes('2026-11-23'), `held day, pending ${pending}`);
      assert.ok(!starts.includes('2026-11-22'), `Sunday right before it, pending ${pending}`);
      // Ngày nghỉ 18/11 là "Từ ngày" được; [18..18] chưa có ngày đổi ca nên "Đến ngày" bắt đầu từ 19/11.
      assert.deepEqual(
        endDates(ctx, 'shift-change', '2026-11-18'),
        ['2026-11-19', '2026-11-20', '2026-11-21', '2026-11-22'],
        `pending ${pending}`
      );
    }
  });

  it('shift-change ends stop before a pending-iSAT Saturday and keep an approved one inside', () => {
    const starts = startDates(isat(), 'shift-change');
    assert.ok(!starts.includes('2026-11-21'), 'pending iSAT');
    assert.ok(starts.includes('2026-11-14'), 'approved iSAT followed by workdays');
    assert.deepEqual(endDates(isat(), 'shift-change', '2026-11-16'), [
      '2026-11-16', '2026-11-17', '2026-11-18', '2026-11-19', '2026-11-20'
    ]);
    // [14..15] chỉ có iSAT được duyệt và Chủ nhật: "Đến ngày" bắt đầu từ 16/11.
    assert.deepEqual(endDates(isat(), 'shift-change', '2026-11-14'), [
      '2026-11-16', '2026-11-17', '2026-11-18', '2026-11-19', '2026-11-20'
    ]);
  });

  it('explanation dates come from explanationDays, in their order', () => {
    const need = { checkIn: false, checkOut: true };
    const ctx = context({
      explanationDays: [
        { date: '2026-10-24', cases: ['MISSING_CHECK_OUT'], needs: need, remindedAt: null, checkIn: '07:52', checkOut: null },
        { date: '2026-10-09', cases: ['LATE_CHECK_IN'], needs: { checkIn: false, checkOut: false }, remindedAt: null, checkIn: '08:25', checkOut: '17:03' }
      ]
    });
    assert.deepEqual(startDates(ctx, 'explanation'), ['2026-10-24', '2026-10-09']);
    assert.deepEqual(startDates(context(), 'explanation'), []);
  });

  it('a closed month never offers a date', () => {
    const starts = startDates(context({ months: [{}, { closed: true }] }), 'leave');
    assert.ok(starts.length > 0);
    assert.ok(starts.every(d => d.startsWith('2026-11')));
  });

  it('leave ends stop before the next day held by a leave', () => {
    assert.deepEqual(endDates(context(), 'leave', '2026-11-13'), ['2026-11-13', '2026-11-14', '2026-11-16', '2026-11-17']);
  });

  it('leave-with-makeup ends stay in the month and drop a last day with no later hours', () => {
    const ctx = context();
    assert.deepEqual(endDates(ctx, 'leave-with-makeup', '2026-11-26'), ['2026-11-26', '2026-11-27', '2026-11-28']);
    assert.ok(!startDates(ctx, 'leave-with-makeup').includes('2026-11-30'));
  });

  it('leave-with-makeup offers no date in a month that has overtime', () => {
    const starts = startDates(context({ months: [{ hasOvertime: true }] }), 'leave-with-makeup');
    assert.ok(starts.length > 0);
    assert.ok(starts.every(d => d.startsWith('2026-12')));
  });

  it('a changed start resets the end to a valid one, never before the start nor across a held day', () => {
    const ctx = context();
    assert.equal(fitEnd(ctx, 'leave', '2026-11-13', '2026-11-16'), '2026-11-16');
    assert.equal(fitEnd(ctx, 'leave', '2026-11-19', '2026-11-17'), '2026-11-19');
    assert.equal(fitEnd(ctx, 'leave', '2026-11-13', '2026-11-20'), '2026-11-13');
    assert.equal(fitEnd(ctx, 'leave', '', '2026-11-20'), '');
  });

  it('overtime drops a month with leave-with-makeup and a month at the 40-hour cap', () => {
    const makeup = startDates(context({ months: [{ hasMakeupLeave: true }] }), 'overtime');
    assert.ok(makeup.length > 0);
    assert.ok(makeup.every(d => d.startsWith('2026-12')));
    const full = startDates(context({ months: [{}, { otMinutes: 2400 }] }), 'overtime');
    assert.ok(full.length > 0);
    assert.ok(full.every(d => d.startsWith('2026-11')));
    assert.ok(!full.includes('2026-11-11'), 'a held day has no hours');
  });

  it('makeup slot days come after the last leave day, in the same month, with hours', () => {
    assert.deepEqual(slotDates(context(), '2026-11-26'), ['2026-11-27', '2026-11-28', '2026-11-29', '2026-11-30']);
  });
});

describe('Tạo yêu cầu: giờ chọn được', () => {
  it('OT hours of a day come from the server, cut to the minutes left in the month', () => {
    // Tháng 11 đã đăng ký 39 giờ: còn 60 phút.
    const ctx = context({ months: [{ otMinutes: 2340 }] });
    assert.equal(otLeftMinutes(ctx.months[0] as any), 60);
    const day = dayAt(ctx, '2026-11-13');
    assert.deepEqual(endHours(day.otHours, 18), [{ end: 19, minutes: 60 }]);
    assert.deepEqual(startHours(day.otHours), [6, 18, 19, 20, 21]);
    // Giờ bù của ngày không bị cắt theo OT.
    assert.equal(endHours(day.hours, 18).length, 4);
  });

  // Logic bù nay nằm ở BE (planMakeup); bản giả của FE là cùng thuật toán và được so với BE ở test/v2/makeup-plan.test.ts.
  const plan = (s: string, e: string, slots: Array<{ date: string; startTime: string; endTime: string }>, ctx = context()) =>
    planMakeupMock(ctx, s, e, slots);
  const row = (date = '', startTime = '', endTime = '') => ({ date, startTime, endTime });
  const bare = (p: ReturnType<typeof plan>) => p.slots.map(({ date, startTime, endTime }) => ({ date, startTime, endTime }));

  it('makeup counter: two leave days need 960 minutes', () => {
    const p = plan('2026-11-13', '2026-11-14', [row('2026-11-22', '08:00', '12:00'), row()]);
    assert.deepEqual([p.plannedMinutes, p.requiredMinutes], [240, 960]);
  });

  // Luật đã chốt (spec 4.4): dòng khung bù không đưa giờ mà dòng khác cùng ngày đã chiếm, và không đưa quá số giờ còn thiếu.
  it('a slot row drops starts inside another row of the same day, and ends that would overlap it', () => {
    // Nghỉ 13–14/11 cần 16 giờ; dòng 1 xếp Chủ nhật 22/11 10–12.
    const starts = plan('2026-11-13', '2026-11-14', [row('2026-11-22', '10:00', '12:00'), row('2026-11-22')]).slots[1].startOptions;
    assert.ok(starts.includes('09:00') && starts.includes('12:00'));
    assert.ok(!starts.includes('10:00') && !starts.includes('11:00'));
    const ends = plan('2026-11-13', '2026-11-14', [row('2026-11-22', '10:00', '12:00'), row('2026-11-22', '08:00')]).slots[1].endOptions;
    assert.deepEqual(ends, ['09:00', '10:00']);
  });

  it('rows on a shift day share what is left of its 12 hours', () => {
    // Trần 12 giờ trừ 8 giờ ca còn 4 giờ: sau 18–20 vẫn còn 06–07 và 20–22 (spec 2.1, như BE).
    const at = (endTime: string) => plan('2026-11-13', '2026-11-14', [row('2026-11-16', '18:00', endTime), row('2026-11-16')]).slots[1].startOptions;
    assert.deepEqual(at('20:00'), ['06:00', '20:00', '21:00']);
    assert.deepEqual(at('22:00'), []);
  });

  it('a slot row offers no more than the minutes still needed after the other rows', () => {
    // Nghỉ 13/11: cần 8 giờ; dòng 1 đã xếp 22/11 08–12 (4 giờ).
    const first = row('2026-11-22', '08:00', '12:00');
    const same = plan('2026-11-13', '2026-11-13', [first, row('2026-11-22', '12:00')]).slots[1];
    for (const h of ['08:00', '09:00', '10:00', '11:00']) assert.ok(!plan('2026-11-13', '2026-11-13', [first, row('2026-11-22')]).slots[1].startOptions.includes(h), h);
    assert.deepEqual(same.endOptions, ['13:00', '14:00', '15:00', '16:00']);
    // Dòng ở ngày khác không giữ giờ của ngày này, nhưng vẫn trừ vào số giờ còn thiếu.
    const other = plan('2026-11-13', '2026-11-13', [first, row('2026-11-29', '08:00')]).slots[1];
    assert.deepEqual(other.endOptions, ['09:00', '10:00', '11:00', '12:00']);
    // Chưa chọn ngày bù hay ngày nghỉ: chưa có giờ.
    assert.deepEqual(plan('2026-11-13', '2026-11-13', [row()]).slots[0].startOptions, []);
    assert.deepEqual(plan('', '', [row('2026-11-22')]).slots[0].startOptions, []);
  });

  it('plan drops values that are no longer valid, later rows first', () => {
    // Nghỉ 13–14/11: cần 16 giờ bù.
    const fitted = plan('2026-11-13', '2026-11-14', [
      row('2026-11-22', '08:00', '16:00'),
      row('2026-11-29', '08:00', '20:00'), // 12 giờ, chỉ còn thiếu 8: bỏ giờ kết thúc
      row('2026-11-12', '18:00', '19:00'), // trước ngày nghỉ cuối: bỏ cả dòng
      row('2026-11-22', '18:00', '23:00') // giờ kết thúc không có trong hours
    ]);
    assert.deepEqual(bare(fitted), [
      row('2026-11-22', '08:00', '16:00'),
      row('2026-11-29', '08:00', ''),
      row(),
      row('2026-11-22', '18:00', '')
    ]);
    // Nghỉ 13/11: 8 giờ đã đủ ở dòng đầu, dòng sau không còn giờ bắt đầu nào.
    assert.deepEqual(bare(plan('2026-11-13', '2026-11-13', [row('2026-11-22', '08:00', '16:00'), row('2026-11-29', '08:00', '12:00')]))[1], row('2026-11-29'));
    const ok = [row('2026-11-22', '08:00', '12:00')];
    assert.deepEqual(bare(plan('2026-11-13', '2026-11-13', ok)), ok);
  });
});

describe('Tạo yêu cầu: chữ của Nghỉ có làm bù, Làm thêm giờ, Đổi ca', () => {
  it('frame label', () => {
    assert.equal(frameLabel('FLEX', '06:00', '15:00'), 'Flex 06–15');
    assert.equal(frameLabel('NIGHT', '22:00', '07:00'), 'Night 22–07');
    assert.equal(frameLabel('NORMAL', '10:00', '19:00'), 'Normal 10–19');
  });

  it('shift change days skip Sundays and held days; the summary names the frame', () => {
    assert.deepEqual(shiftChangeDates(context(), '2026-11-10', '2026-11-16'), [
      '2026-11-10', '2026-11-12', '2026-11-13', '2026-11-14', '2026-11-16'
    ]);
    assert.equal(
      shiftChangeSummary(context(), '2026-11-10', '2026-11-14', 'Flex 06–15'),
      '4 ngày đổi sang Flex 06–15: 10, 12, 13 và 14/11'
    );
    assert.equal(shiftChangeSummary(context(), '2026-11-15', '2026-11-15', 'Flex 06–15'), '');
  });

  it('OT lines: registered hours of the month, and the hours of this request', () => {
    assert.equal(otMonthLine(context(), '2026-11'), 'Đã đăng ký tháng 11: 9 / 40 giờ');
    assert.equal(otMonthLine(context(), '2027-01'), '');
    const day = dayAt(context(), '2026-11-13');
    assert.equal(otHoursLine(day, 18, 20), '2 giờ làm thêm, sau ca 08–17');
    assert.equal(otHoursLine(day, 6, 7), '1 giờ làm thêm, trước ca 08–17');
    assert.equal(otHoursLine(dayAt(context(), '2026-11-15'), 8, 12), '4 giờ làm thêm');
    // Số phút lấy từ otHours (BE đã trừ giờ nghỉ), không tự cộng giờ đồng hồ.
    const rest = { ...dayAt(context(), '2026-11-15'), otHours: [{ start: 6, ends: [{ end: 11, minutes: 270 }] }] };
    assert.equal(otHoursLine(rest, 6, 11), '4,5 giờ làm thêm');
  });

  it('makeup lines: hours to make up, and the counter', () => {
    assert.equal(makeupNeedLine(960, '2026-11-14'), 'Cần bù 16 giờ, sau ngày nghỉ cuối và trong tháng 11');
    assert.equal(makeupNeedLine(0, ''), '');
    assert.equal(makeupCountLine(240, 960), 'Đã xếp 4 / 16 giờ');
    assert.equal(makeupCountLine(0, 480), 'Đã xếp 0 / 8 giờ');
  });
});

describe('Tạo yêu cầu: chữ', () => {
  it('leave summary counts working days only', () => {
    assert.equal(leaveSummary(context(), '2026-11-13', '2026-11-16'), '3 ngày làm việc: 13, 14 và 16/11');
    assert.equal(leaveSummary(context(), '2026-11-13', '2026-11-13'), '1 ngày làm việc: 13/11');
    assert.equal(leaveSummary(context(), '2026-11-30', '2026-12-02'), '3 ngày làm việc: 30/11, 01 và 02/12');
  });

  it('annual leave balance line counts working days; empty for other types or without a balance', () => {
    assert.equal(leaveBalance(context(), 'ANNUAL', '2026-11-13', '2026-11-16'), 'Phép năm còn 11 ngày, sau đơn này còn 8');
    const isatSat = context({ claims: { '2026-11-14': { status: 'ISAT', pending: false } } });
    assert.equal(leaveBalance(isatSat, 'ANNUAL', '2026-11-13', '2026-11-16'), 'Phép năm còn 11 ngày, sau đơn này còn 9');
    assert.equal(leaveBalance(context(), 'UNPAID', '2026-11-13', '2026-11-16'), '');
    assert.equal(leaveBalance(context({ annualLeaveLeft: null }), 'ANNUAL', '2026-11-13', '2026-11-16'), '');
    assert.equal(leaveBalance(context(), 'ANNUAL', '2026-11-13', ''), '');
    // Xin quá số còn lại: không ghi số âm; xem trước từ chối và nói vì sao.
    assert.equal(leaveBalance(context({ annualLeaveLeft: 2 }), 'ANNUAL', '2026-11-13', '2026-11-16'), 'Phép năm còn 2 ngày');
  });

  it('case text', () => {
    assert.equal(caseText(['MISSING_CHECK_IN', 'MISSING_CHECK_OUT']), 'Quên chấm công');
    assert.equal(caseText(['MISSING_CHECK_OUT']), 'Thiếu giờ ra');
    assert.equal(caseDetail({ checkIn: '07:52', checkOut: null }), 'Giờ vào 07:52, không có giờ ra');
    assert.equal(caseDetail({ checkIn: null, checkOut: '17:30' }), 'Giờ ra 17:30, không có giờ vào');
    assert.equal(caseDetail({ checkIn: '08:25', checkOut: '17:03' }), 'Giờ vào 08:25, giờ ra 17:03');
    assert.equal(caseDetail({ checkIn: null, checkOut: null }), 'Không có giờ vào, không có giờ ra');
    assert.equal(caseText(['LATE_CHECK_IN', 'MISSING_CHECK_OUT']), 'Vào muộn · Thiếu giờ ra');
  });

  it('date label', () => {
    assert.equal(dateLabel('2026-11-13'), 'T6 13/11');
    assert.equal(dateLabel('2026-11-15'), 'CN 15/11');
  });

  it('advance lines', () => {
    const info = { month: '2026-10', amount: 2215385, workDays: 12, from: '2026-10-01', to: '2026-10-15', windowEnd: '2026-10-17', ordersThisMonth: 1, ratePct: 80 };
    assert.deepEqual(advanceLines(info), ['Số tiền được ứng: 2.215.385 ₫', '80% lương ngày công 01–15/10 · 12 ngày']);
  });
});

// ---------- Nối máy chủ thật (Task 11) ----------
describe('request-context của máy chủ thật', () => {
  const frames = [
    { shiftType: 'NORMAL', start: '08:00', end: '17:00' },
    { shiftType: 'FLEX', start: '06:00', end: '15:00' },
    { shiftType: 'NIGHT', start: '22:00', end: '07:00' }
  ];
  const serverContext = (shift: { start: string; end: string } | null) => {
    const ctx = context() as any;
    ctx.shiftFrames = frames;
    ctx.days = ctx.days.slice(0, 3).map((d: any) => ({ ...d, shift }));
    return ctx as RequestContext;
  };

  it('fills the day shift type from the frame with the same hours', () => {
    const adapted = contextFromApi(serverContext({ start: '06:00', end: '15:00' }));
    assert.deepEqual(adapted.days[0].shift, { type: 'FLEX', start: '06:00', end: '15:00' });
    assert.equal(frameLabel(adapted.days[0].shift!.type, adapted.days[0].shift!.start, adapted.days[0].shift!.end), 'Flex 06–15');
  });

  it('keeps the hours with an empty type when no frame matches, so the label shows plain hours', () => {
    const adapted = contextFromApi(serverContext({ start: '10:00', end: '19:00' }));
    assert.deepEqual(adapted.days[0].shift, { type: '', start: '10:00', end: '19:00' });
    assert.equal(frameLabel('', '10:00', '19:00'), '10–19');
  });

  it('leaves days without a shift, and everything else, as the server sent it', () => {
    const raw = serverContext(null);
    const adapted = contextFromApi(raw);
    assert.equal(adapted.days[0].shift, null);
    assert.deepEqual({ ...adapted, days: [] }, { ...raw, days: [] });
    assert.equal(raw.days[0].shift, null, 'does not change the input');
  });
});

describe('gọi máy chủ thật của luồng yêu cầu', () => {
  type Call = [method: string, path: string, body?: unknown];
  const fake = (reply: Record<string, unknown> = {}) => {
    const calls: Call[] = [];
    const rec = (method: string) => async (path: string, body?: unknown) => {
      calls.push([method, path, body]);
      return reply;
    };
    return { calls, api: { get: rec('GET'), post: rec('POST'), patch: rec('PATCH') } };
  };

  it('reads the context from GET /me/request-context and adapts the day shifts', async () => {
    const raw = context() as any;
    raw.shiftFrames = [{ shiftType: 'NORMAL', start: '08:00', end: '17:00' }];
    raw.days = raw.days.slice(0, 1).map((d: any) => ({ ...d, shift: { start: '08:00', end: '17:00' } }));
    const { calls, api } = fake(raw);
    const ctx = await staffRequestsClient(api).getRequestContext();
    assert.deepEqual(calls, [['GET', '/me/request-context', undefined]]);
    assert.equal(ctx.days[0].shift?.type, 'NORMAL');
  });

  it('previews through POST /me/requests/:kind/preview and returns the body as it is', async () => {
    const reply = { ok: true, title: 'Đơn nghỉ', summary: { dates: [], daysCount: 0, annualLeaveLeftAfter: null }, warnings: [] };
    const { calls, api } = fake(reply);
    const draft = { leaveType: 'ANNUAL', startDate: '2026-11-13', endDate: '2026-11-13', reason: 'Việc nhà' };
    assert.deepEqual(await staffRequestsClient(api).previewRequest('leave', draft), reply);
    assert.deepEqual(calls, [['POST', '/me/requests/leave/preview', draft]]);
    const refused = fake({ ok: false, message: 'Ngày này đã có đơn', code: 'DAY_CONFLICT' });
    assert.deepEqual(await staffRequestsClient(refused.api).previewRequest('leave-with-makeup', draft as any), {
      ok: false,
      message: 'Ngày này đã có đơn',
      code: 'DAY_CONFLICT'
    });
    assert.equal(refused.calls[0][1], '/me/requests/leave-with-makeup/preview');
  });

  it('creates through POST /me/requests/:kind and takes the id from body.request.id', async () => {
    const { calls, api } = fake({ created: true, request: { id: 'req-123', status: 'PENDING' }, warnings: [] });
    const draft = { workDate: '2026-10-27', actualCheckOut: '17:30', reason: 'Quên' };
    assert.deepEqual(await staffRequestsClient(api).createRequest('explanation', draft), { id: 'req-123' });
    assert.deepEqual(calls, [['POST', '/me/requests/explanation', draft]]);
  });

  it('lets a refusal of the server reach the caller untouched', async () => {
    const boom = new Error('Ngày này đã có đơn nghỉ');
    const api = { get: async () => ({}), post: async () => Promise.reject(boom), patch: async () => ({}) };
    await assert.rejects(staffRequestsClient(api).createRequest('leave', {} as any), boom);
  });

  it('cancels through PATCH /me/requests/:id/cancel with an empty body and returns nothing', async () => {
    const { calls, api } = fake({ updated: true, request: {} });
    assert.equal(await staffRequestsClient(api).cancelRequest('a/b c'), undefined);
    assert.deepEqual(calls, [['PATCH', '/me/requests/a%2Fb%20c/cancel', {}]]);
  });
});

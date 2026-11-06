import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
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
  fitSlots,
  frameLabel,
  leaveBalance,
  leaveDates,
  leaveSummary,
  makeupCounter,
  makeupCountLine,
  makeupNeedLine,
  otHoursLine,
  otMonthLine,
  shiftChangeDates,
  shiftChangeSummary,
  slotDates,
  startDates,
  startHours,
  type ContextDay,
  type RequestContext
} from '../../web/src/builders/api/staff-requests';
import { filingChoices, leaveCounted, overtimeHours, shiftChangeable } from '../../src/modules/requests/domain';

// Ngữ cảnh dựng tay (không dùng mock): ca HC 08–17, làm thứ Hai – thứ Bảy, 10/11 → 06/12/2026.
// 11/11 và 18/11 đang bị đơn nghỉ giữ. 15, 22, 29/11 và 06/12 là Chủ nhật.
// Giờ trống ngày có ca (spec 2.1): bắt đầu 06 tới 07, và bắt đầu 18, 19, 20, 21, mỗi giờ kết thúc tới 22.
const SHIFT_HOURS = [
  { start: 6, ends: [{ end: 7, minutes: 60 }] },
  ...[18, 19, 20, 21].map(start => ({
    start,
    ends: Array.from({ length: 22 - start }, (_, j) => ({ end: start + j + 1, minutes: (j + 1) * 60 }))
  }))
];
const SUNDAY_HOURS = Array.from({ length: 16 }, (_, i) => 6 + i).map(start => ({
  start,
  ends: Array.from({ length: Math.min(22, start + 12) - start }, (_, j) => ({ end: start + j + 1, minutes: (j + 1) * 60 }))
}));
const isoAdd = (iso: string, n: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);

function dayOf(date: string): Omit<ContextDay, 'leaveCounted' | 'shiftChangeable' | 'otHours'> {
  const sunday = new Date(`${date}T00:00:00Z`).getUTCDay() === 0;
  return {
    date,
    workday: !sunday,
    shift: sunday ? null : { type: 'NORMAL', start: '08:00', end: '17:00' },
    holiday: null,
    claim: null,
    hours: sunday ? SUNDAY_HOURS : SHIFT_HOURS
  };
}

type Over = {
  months?: Partial<RequestContext['months'][number]>[];
  claims?: Record<string, ContextDay['claim']>;
  explanationDays?: RequestContext['explanationDays'];
  left?: number | null;
};

function context(over: Over = {}): RequestContext {
  const days: any[] = Array.from({ length: 27 }, (_, i) => dayOf(isoAdd('2026-11-10', i)));
  for (const d of days)
    if (d.date === '2026-11-11' || d.date === '2026-11-18') Object.assign(d, { claim: { status: 'LEAVE', pending: true }, hours: [] });
  for (const d of days) if (over.claims && d.date in over.claims) d.claim = over.claims[d.date];
  const base = [
    { month: '2026-11', closed: false, otMinutes: 540, otCapMinutes: 2400, hasOvertime: false, hasMakeupLeave: false },
    { month: '2026-12', closed: false, otMinutes: 0, otCapMinutes: 2400, hasOvertime: false, hasMakeupLeave: false }
  ];
  const months = base
    .map((m, i) => ({ ...m, ...(over.months?.[i] ?? {}) }))
    .map(m => ({ ...m, otLeftMinutes: Math.max(0, m.otCapMinutes - m.otMinutes) }));
  // Phần BE tính (choices, cờ ngày, otHours): dựng bằng đúng hàm của BE rồi đưa cho builder của FE tra cứu.
  const left = over.left === undefined ? 11 : over.left;
  const choices = filingChoices({ days, months, annualLeaveLeft: left });
  const monthOf = (date: string) => months.find(m => m.month === date.slice(0, 7));
  return {
    today: '2026-11-10',
    window: { from: '2026-11-10', to: '2026-12-06' },
    kinds: [],
    months,
    leaveTypes: [{ code: 'ANNUAL', label: 'Phép năm' }],
    annualLeaveLeft: left,
    shiftFrames: [],
    days: days.map(d => ({
      ...d,
      leaveCounted: leaveCounted(d),
      shiftChangeable: shiftChangeable(d),
      otHours: overtimeHours(d, monthOf(d.date))
    })),
    explanationDays: over.explanationDays ?? [],
    advance: null,
    choices,
    rules: { makeupMinutesPerLeaveDay: 480, dayCapMinutes: 720, monthOtCapMinutes: 2400 }
  } as RequestContext;
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
  it('start and end hours are looked up in the hours table of the day, as BE sent them', () => {
    const day = dayAt(context(), '2026-11-13');
    assert.deepEqual(startHours(day.hours), [6, 18, 19, 20, 21]);
    assert.deepEqual(endHours(day.hours, 18), [
      { end: 19, minutes: 60 }, { end: 20, minutes: 120 }, { end: 21, minutes: 180 }, { end: 22, minutes: 240 }
    ]);
    assert.deepEqual(endHours(day.hours, 12), []);
  });

  it('OT hours come from otHours: BE drops windows longer than the minutes left in the month', () => {
    const day = dayAt(context({ months: [{ otMinutes: 2340 }] }), '2026-11-13'); // còn 60 phút
    assert.deepEqual(startHours(day.otHours), [6, 18, 19, 20, 21]);
    assert.deepEqual(endHours(day.otHours, 18), [{ end: 19, minutes: 60 }]);
    assert.deepEqual(dayAt(context({ months: [{ otMinutes: 2400 }] }), '2026-11-13').otHours, []);
    assert.deepEqual(dayAt(context({ months: [{ hasMakeupLeave: true }] }), '2026-11-13').otHours, []);
  });

  it('OT minutes left are a field of the month', () => {
    assert.equal(context().months[0].otLeftMinutes, 1860);
    assert.equal(context({ months: [{ otMinutes: 2400 }] }).months[0].otLeftMinutes, 0);
  });

  it('makeup counter: BE asks 960 minutes for two leave days, planned sums the BE minutes of each slot', () => {
    const slots = [
      { date: '2026-11-22', startTime: '08:00', endTime: '12:00' },
      { date: '', startTime: '', endTime: '' }
    ];
    assert.deepEqual(makeupCounter(context(), '2026-11-13', '2026-11-14', slots), { planned: 240, required: 960 });
    assert.deepEqual(makeupCounter(context(), '2026-11-13', '', slots), { planned: 240, required: 0 });
  });

  it('fitSlots drops what is not in the BE tables, and does not apply any budget rule itself', () => {
    const fitted = fitSlots(context(), '2026-11-14', [
      { date: '2026-11-22', startTime: '08:00', endTime: '16:00' },
      { date: '2026-11-29', startTime: '08:00', endTime: '20:00' }, // 12 giờ nằm trong bảng giờ: giữ, BE sẽ kiểm khi xem trước
      { date: '2026-11-12', startTime: '18:00', endTime: '19:00' }, // trước ngày nghỉ cuối: bỏ cả dòng
      { date: '2026-11-22', startTime: '18:00', endTime: '23:00' } // giờ kết thúc không có trong hours
    ]);
    assert.deepEqual(fitted, [
      { date: '2026-11-22', startTime: '08:00', endTime: '16:00' },
      { date: '2026-11-29', startTime: '08:00', endTime: '20:00' },
      { date: '', startTime: '', endTime: '' },
      { date: '2026-11-22', startTime: '18:00', endTime: '' }
    ]);
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
    // Số phút lấy từ hours (BE đã trừ giờ nghỉ), không tự cộng giờ đồng hồ.
    const rest = { ...dayAt(context(), '2026-11-15'), otHours: [{ start: 6, ends: [{ end: 11, minutes: 270 }] }] };
    assert.equal(otHoursLine(rest, 6, 11), '4,5 giờ làm thêm');
  });

  it('makeup lines: hours to make up, and the counter', () => {
    assert.equal(makeupNeedLine(context(), '2026-11-13', '2026-11-14'), 'Cần bù 16 giờ, sau ngày nghỉ cuối và trong tháng 11');
    assert.equal(makeupNeedLine(context(), '2026-11-13', ''), '');
    const slots = [{ date: '2026-11-22', startTime: '08:00', endTime: '12:00' }];
    assert.equal(makeupCountLine(context(), '2026-11-13', '2026-11-14', slots), 'Đã xếp 4 / 16 giờ');
    assert.equal(makeupCountLine(context(), '2026-11-13', '2026-11-13', []), 'Đã xếp 0 / 8 giờ');
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
    assert.equal(leaveBalance(context({ left: null }), 'ANNUAL', '2026-11-13', '2026-11-16'), '');
    assert.equal(leaveBalance(context(), 'ANNUAL', '2026-11-13', ''), '');
    // Xin quá số còn lại: không ghi số âm; xem trước từ chối và nói vì sao.
    assert.equal(leaveBalance(context({ left: 2 }), 'ANNUAL', '2026-11-13', '2026-11-16'), 'Phép năm còn 2 ngày');
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
    assert.deepEqual(advanceLines({ month: '2026-10', amount: 2215385, workDays: 12, from: '2026-10-01', to: '2026-10-15', windowEnd: '2026-10-17', ordersThisMonth: 1, ratePct: 80 }), [
      'Số tiền được ứng: 2.215.385 ₫',
      '80% lương ngày công 01–15/10 · 12 ngày'
    ]);
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

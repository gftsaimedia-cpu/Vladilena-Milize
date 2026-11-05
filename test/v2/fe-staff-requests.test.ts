import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  advanceLines,
  caseText,
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
  otLeftMinutes,
  otMonthLine,
  shiftChangeDates,
  shiftChangeSummary,
  slotDates,
  slotHourOptions,
  startDates,
  startHours,
  type ContextDay,
  type RequestContext
} from '../../web/src/builders/api/staff-requests';

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

function dayOf(date: string): ContextDay {
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
};

function context(over: Over = {}): RequestContext {
  const days = Array.from({ length: 27 }, (_, i) => dayOf(isoAdd('2026-11-10', i)));
  for (const d of days)
    if (d.date === '2026-11-11' || d.date === '2026-11-18') Object.assign(d, { claim: { status: 'LEAVE', pending: true }, hours: [] });
  for (const d of days) if (over.claims && d.date in over.claims) d.claim = over.claims[d.date];
  const base = [
    { month: '2026-11', closed: false, otMinutes: 540, otCapMinutes: 2400, hasOvertime: false, hasMakeupLeave: false },
    { month: '2026-12', closed: false, otMinutes: 0, otCapMinutes: 2400, hasOvertime: false, hasMakeupLeave: false }
  ];
  return {
    today: '2026-11-10',
    window: { from: '2026-11-10', to: '2026-12-06' },
    kinds: [],
    months: base.map((m, i) => ({ ...m, ...(over.months?.[i] ?? {}) })),
    leaveTypes: [{ code: 'ANNUAL', label: 'Phép năm' }],
    annualLeaveLeft: 11,
    shiftFrames: [],
    days,
    explanationDays: over.explanationDays ?? [],
    advance: null
  };
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
        { date: '2026-10-24', cases: ['MISSING_CHECK_OUT'], needs: need, remindedAt: null },
        { date: '2026-10-09', cases: ['LATE_CHECK_IN'], needs: { checkIn: false, checkOut: false }, remindedAt: null }
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
  it('endHours with a 60-minute cap keeps only ends of 60 minutes or less', () => {
    assert.deepEqual(endHours(dayAt(context(), '2026-11-13'), 18, { capMinutes: 60 }), [{ end: 19, minutes: 60 }]);
  });

  it('startHours drops starts inside a taken window, endHours drops ends that would overlap it', () => {
    const sunday = dayAt(context(), '2026-11-22');
    const starts = startHours(sunday, { taken: [{ start: 10, end: 12 }] });
    assert.ok(starts.includes(9) && starts.includes(12));
    assert.ok(!starts.includes(10) && !starts.includes(11));
    assert.deepEqual(endHours(sunday, 8, { taken: [{ start: 10, end: 12 }] }).map(e => e.end), [9, 10]);
  });

  it('slots already taken on a shift day use up its hours', () => {
    const day = dayAt(context(), '2026-11-13');
    // Trần 12 giờ trừ 8 giờ ca còn 4 giờ: sau 18–20 vẫn còn 06–07 và 20–22 (spec 2.1, như BE).
    assert.deepEqual(startHours(day, { taken: [{ start: 18, end: 20 }] }), [6, 20, 21]);
    assert.deepEqual(startHours(day, { taken: [{ start: 18, end: 22 }] }), []);
  });

  it('OT minutes left in a month', () => {
    assert.equal(otLeftMinutes(context(), '2026-11'), 1860);
    assert.equal(otLeftMinutes(context({ months: [{ otMinutes: 2400 }] }), '2026-11'), 0);
    assert.equal(otLeftMinutes(context(), '2027-01'), 0);
  });

  it('makeup counter: two leave days need 960 minutes', () => {
    const slots = [
      { date: '2026-11-22', startTime: '08:00', endTime: '12:00' },
      { date: '', startTime: '', endTime: '' }
    ];
    assert.deepEqual(makeupCounter(context(), '2026-11-13', '2026-11-14', slots), { planned: 240, required: 960 });
  });

  it('slot hour options: other rows on the same day keep their hours, and no more than still needed is offered', () => {
    const ctx = context();
    const slots = [
      { date: '2026-11-22', startTime: '08:00', endTime: '12:00' },
      { date: '2026-11-22', startTime: '', endTime: '' }
    ];
    const opts = slotHourOptions(ctx, '2026-11-13', '2026-11-13', slots, 1);
    assert.deepEqual(opts, { taken: [{ start: 8, end: 12 }], capMinutes: 240 });
    const sunday = dayAt(ctx, '2026-11-22');
    for (const h of [8, 9, 10, 11]) assert.ok(!startHours(sunday, opts).includes(h), String(h));
    assert.deepEqual(endHours(sunday, 12, opts).map(e => e.end), [13, 14, 15, 16]);
    // Dòng ở ngày khác không giữ giờ của ngày này, nhưng vẫn trừ vào số giờ còn thiếu.
    const other = slotHourOptions(ctx, '2026-11-13', '2026-11-13', [slots[0], { date: '2026-11-29', startTime: '', endTime: '' }], 1);
    assert.deepEqual(other, { taken: [], capMinutes: 240 });
  });

  it('fitSlots drops values that are no longer valid, later rows first', () => {
    // Nghỉ 13–14/11: cần 16 giờ bù.
    const fitted = fitSlots(context(), '2026-11-13', '2026-11-14', [
      { date: '2026-11-22', startTime: '08:00', endTime: '16:00' },
      { date: '2026-11-29', startTime: '08:00', endTime: '20:00' }, // 12 giờ, chỉ còn thiếu 8: bỏ giờ kết thúc
      { date: '2026-11-12', startTime: '18:00', endTime: '19:00' }, // trước ngày nghỉ cuối: bỏ cả dòng
      { date: '2026-11-22', startTime: '18:00', endTime: '23:00' } // giờ kết thúc không có trong hours
    ]);
    assert.deepEqual(fitted, [
      { date: '2026-11-22', startTime: '08:00', endTime: '16:00' },
      { date: '2026-11-29', startTime: '08:00', endTime: '' },
      { date: '', startTime: '', endTime: '' },
      { date: '2026-11-22', startTime: '18:00', endTime: '' }
    ]);
    // Nghỉ 13/11: 8 giờ đã đủ ở dòng đầu, dòng sau không còn giờ bắt đầu nào.
    assert.deepEqual(
      fitSlots(context(), '2026-11-13', '2026-11-13', [
        { date: '2026-11-22', startTime: '08:00', endTime: '16:00' },
        { date: '2026-11-29', startTime: '08:00', endTime: '12:00' }
      ])[1],
      { date: '2026-11-29', startTime: '', endTime: '' }
    );
    const ok = [{ date: '2026-11-22', startTime: '08:00', endTime: '12:00' }];
    assert.deepEqual(fitSlots(context(), '2026-11-13', '2026-11-13', ok), ok);
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
    const rest = { ...dayAt(context(), '2026-11-15'), hours: [{ start: 6, ends: [{ end: 11, minutes: 270 }] }] };
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
    assert.equal(leaveBalance({ ...context(), annualLeaveLeft: null }, 'ANNUAL', '2026-11-13', '2026-11-16'), '');
    assert.equal(leaveBalance(context(), 'ANNUAL', '2026-11-13', ''), '');
    // Xin quá số còn lại: không ghi số âm; xem trước từ chối và nói vì sao.
    assert.equal(leaveBalance({ ...context(), annualLeaveLeft: 2 }, 'ANNUAL', '2026-11-13', '2026-11-16'), 'Phép năm còn 2 ngày');
  });

  it('case text', () => {
    assert.equal(caseText(['MISSING_CHECK_IN', 'MISSING_CHECK_OUT']), 'Quên chấm công');
    assert.equal(caseText(['MISSING_CHECK_OUT']), 'Thiếu giờ ra');
    assert.equal(caseText(['LATE_CHECK_IN', 'MISSING_CHECK_OUT']), 'Vào muộn · Thiếu giờ ra');
  });

  it('date label', () => {
    assert.equal(dateLabel('2026-11-13'), 'T6 13/11');
    assert.equal(dateLabel('2026-11-15'), 'CN 15/11');
  });

  it('advance lines', () => {
    assert.deepEqual(advanceLines({ month: '2026-10', amount: 2215385, workDays: 12, from: '2026-10-01', to: '2026-10-15' }), [
      'Số tiền được ứng: 2.215.385 ₫',
      '80% lương ngày công 01–15/10 · 12 ngày'
    ]);
  });
});

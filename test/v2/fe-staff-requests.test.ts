import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  advanceLines,
  caseText,
  dateLabel,
  endDates,
  endHours,
  fitEnd,
  leaveBalance,
  leaveDates,
  leaveSummary,
  makeupCounter,
  otLeftMinutes,
  slotDates,
  startDates,
  startHours,
  type ContextDay,
  type RequestContext
} from '../../web/src/builders/api/staff-requests';

// Ngữ cảnh dựng tay (không dùng mock): ca HC 08–17, làm thứ Hai – thứ Bảy, 10/11 → 06/12/2026.
// 11/11 và 18/11 đang bị đơn nghỉ giữ. 15, 22, 29/11 và 06/12 là Chủ nhật.
const SHIFT_HOURS = [
  { start: 6, ends: [{ end: 7, minutes: 60 }] },
  { start: 18, ends: [19, 20, 21, 22].map(end => ({ end, minutes: (end - 18) * 60 })) }
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

  it('shift-change ends are every day from the start', () => {
    assert.deepEqual(endDates(context(), 'shift-change', '2026-11-29'), [
      '2026-11-29', '2026-11-30', '2026-12-01', '2026-12-02', '2026-12-03', '2026-12-04', '2026-12-05', '2026-12-06'
    ]);
    assert.deepEqual(endDates(context(), 'shift-change', ''), []);
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
    assert.deepEqual(startHours(day, { taken: [{ start: 18, end: 20 }] }), [6]);
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

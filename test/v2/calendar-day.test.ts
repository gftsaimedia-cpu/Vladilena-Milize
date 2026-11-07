import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildDay, type Benefits, type DaySources, type ScheduleFacts, type ShiftFacts } from '../../src/modules/attendance/domain/attendance-day';
import { Day, DayPolicy, Month, type DayContext, type DayInput, type DayKind } from '../../src/modules/calendar';

const NORMAL: ShiftFacts = { type: 'NORMAL', start: '08:00', end: '17:00', allowancePct: 0 };
const NIGHT: ShiftFacts = { type: 'NIGHT', start: '22:00', end: '06:00', allowancePct: 30 };
const ALL_BENEFITS: Benefits = { paidLeave: true, paidHoliday: true, isat: true };
const NO_BENEFITS: Benefits = { paidLeave: false, paidHoliday: false, isat: false };
const T2_T7 = [1, 2, 3, 4, 5, 6];
const T2_T6 = [1, 2, 3, 4, 5];
const NOW = new Date('2026-11-05T12:00:00+07:00'); // Thứ Năm 05/11/2026 trưa

const ctx = (over: Partial<DayContext> = {}): DayContext => ({
  employment: { startDate: '2026-01-05', resignedOn: null },
  benefits: ALL_BENEFITS,
  workWeek: T2_T7,
  defaultShift: NORMAL,
  ...over
});
const input = (date: string, over: Partial<DayInput> = {}): DayInput => ({
  date,
  schedule: null,
  otWindows: [],
  makeupWindows: [],
  halfShift: null,
  isHoliday: false,
  ...over
});
const schedule = (over: Partial<ScheduleFacts>): ScheduleFacts => ({
  scheduleType: 'REGULAR',
  status: 'PLANNED',
  shiftType: 'NORMAL',
  start: '08:00',
  end: '17:00',
  sourceRequestId: 'r1',
  requestType: null,
  leaveType: null,
  ...over
});

describe('Day: phân loại khớp buildDay trên ma trận đầu vào', () => {
  // Mọi tổ hợp: ngày × hồ sơ × lễ × lịch × tuần làm × quyền lợi × khung OT/bù × nửa ca × lần chấm công.
  const dates = ['2026-11-03', '2026-11-07', '2026-11-08', '2026-12-31']; // T3, T7, CN, T5 ở tháng khác
  const employments = [
    { startDate: '2026-01-05', resignedOn: null },
    { startDate: '2026-11-05', resignedOn: null },
    { startDate: '2026-01-05', resignedOn: '2026-11-02' }
  ];
  const schedules: Array<ScheduleFacts | null> = [
    null,
    schedule({ scheduleType: 'REGULAR', status: 'PLANNED' }),
    schedule({ scheduleType: 'SHIFT_CHANGE', status: 'PLANNED', shiftType: 'NIGHT', start: '22:00', end: '06:00' }),
    schedule({ scheduleType: 'SHIFT_CHANGE', status: 'CANCELLED', shiftType: 'NIGHT', start: '22:00', end: '06:00' }),
    schedule({ status: 'ON_LEAVE', requestType: 'LEAVE', leaveType: 'ANNUAL' }),
    schedule({ status: 'ON_LEAVE', requestType: 'LEAVE', leaveType: 'UNPAID' }),
    schedule({ status: 'ON_LEAVE', requestType: 'LEAVE_WITH_MAKEUP', leaveType: 'ANNUAL' }),
    schedule({ scheduleType: 'ISAT', status: 'ON_LEAVE', requestType: 'ISAT' })
  ];
  const windows = [[], [{ start: '18:00', end: '20:00' }]];
  const halves = [null, { half: 'FIRST' as const, start: '08:00', end: '12:00', requestId: 'h1' }];
  const punches = [[], [{ type: 'IN' as const, at: new Date('2026-11-03T08:00:00+07:00') }]];

  const KIND_OF_STATUS: Record<string, DayKind> = {
    OUTSIDE: 'OUTSIDE',
    HOLIDAY: 'HOLIDAY',
    ISAT: 'ISAT',
    LEAVE_PAID: 'LEAVE_PAID',
    LEAVE_UNPAID: 'LEAVE_UNPAID',
    LEAVE_MAKEUP: 'LEAVE_MAKEUP',
    REST: 'REST',
    EXTRA: 'EXTRA',
    PENDING: 'WORK',
    PRESENT: 'WORK',
    ABSENT: 'WORK'
  };

  it('kind, ca và nửa ca giống buildDay ở mọi tổ hợp', () => {
    let count = 0;
    for (const date of dates)
      for (const employment of employments)
        for (const isHoliday of [false, true])
          for (const sched of schedules)
            for (const week of [T2_T7, T2_T6])
              for (const benefits of [ALL_BENEFITS, NO_BENEFITS])
                for (const win of windows)
                  for (const half of halves)
                    for (const punch of punches) {
                      const facts = { date, schedule: sched, otWindows: win, makeupWindows: [], halfShift: half, isHoliday };
                      const context = ctx({ employment, workWeek: week, benefits });
                      const old = buildDay('u1', { ...facts, punches: punch, explanation: null, now: NOW, employment, benefits, workWeek: week, graceMinutes: 15, defaultShift: NORMAL } as DaySources);
                      const day = Day.resolve(facts, context, NOW);
                      const label = JSON.stringify({ date, employment, isHoliday, sched: sched?.scheduleType + '/' + sched?.status + '/' + sched?.requestType, week: week.length, paid: benefits.paidLeave, win: win.length, half: !!half, punches: punch.length });
                      assert.equal(day.kind, KIND_OF_STATUS[old.status], `${label}: ${old.status} → ${day.kind}`);
                      if (day.kind === 'WORK') {
                        assert.deepEqual(day.shift, old.shift, `${label}: ca`);
                        assert.equal(day.half, old.halfShift, `${label}: nửa ca`);
                      } else {
                        assert.equal(day.shift, null, `${label}: ngày không phải ngày làm không có ca`);
                      }
                      count++;
                    }
    assert.ok(count > 3000, `đã so ${count} tổ hợp`);
  });
});

describe('Day: giai đoạn', () => {
  const work = (date: string, defaultShift = NORMAL) => Day.resolve(input(date), ctx({ defaultShift }), NOW);

  it('ngày làm theo khoảng ca: trước giờ vào sắp diễn ra, trong ca đang diễn ra, hết ca đã diễn ra', () => {
    const day = work('2026-11-05');
    assert.equal(day.at(new Date('2026-11-05T07:59:00+07:00')).phase, 'UPCOMING');
    assert.equal(day.at(new Date('2026-11-05T08:00:00+07:00')).phase, 'IN_PROGRESS');
    assert.equal(day.at(new Date('2026-11-05T16:59:00+07:00')).phase, 'IN_PROGRESS');
    assert.equal(day.at(new Date('2026-11-05T17:00:00+07:00')).phase, 'DONE');
    const d = day.at(new Date('2026-11-05T17:00:00+07:00'));
    assert.deepEqual([d.hasStarted, d.isOver], [true, true]);
  });

  it('ca đêm: đang diễn ra qua nửa đêm, hết lúc 06:00 ngày kế', () => {
    const day = work('2026-11-05', NIGHT);
    assert.equal(day.at(new Date('2026-11-05T21:00:00+07:00')).phase, 'UPCOMING');
    assert.equal(day.at(new Date('2026-11-06T02:00:00+07:00')).phase, 'IN_PROGRESS');
    assert.equal(day.at(new Date('2026-11-06T06:00:00+07:00')).phase, 'DONE');
  });

  it('ngày không có giờ làm (nghỉ, lễ, ngoài) theo ngày: tương lai, hôm nay, quá khứ', () => {
    const rest = Day.resolve(input('2026-11-08'), ctx(), NOW); // Chủ nhật
    assert.equal(rest.kind, 'REST');
    assert.equal(rest.phase, 'UPCOMING');
    assert.equal(rest.at(new Date('2026-11-08T00:30:00+07:00')).phase, 'IN_PROGRESS');
    assert.equal(rest.at(new Date('2026-11-09T00:00:00+07:00')).phase, 'DONE');
    const leave = Day.resolve(input('2026-11-02', { schedule: schedule({ status: 'ON_LEAVE', requestType: 'LEAVE', leaveType: 'ANNUAL' }) }), ctx(), NOW);
    assert.deepEqual([leave.kind, leave.phase], ['LEAVE_PAID', 'DONE']);
  });

  it('at() không đổi kind, ca hay claim', () => {
    const day = work('2026-11-05');
    const later = day.at(new Date('2026-11-09T00:00:00+07:00'));
    assert.deepEqual([later.kind, later.shift, later.claims], [day.kind, day.shift, day.claims]);
  });
});

describe('Day: cờ', () => {
  const kinds: Array<[Partial<DayInput>, Partial<DayContext>, DayKind, Record<string, boolean>]> = [
    [{}, {}, 'WORK', { isWork: true, hasWorkTime: true, isOff: false, isLeave: false }],
    [{ isHoliday: true }, {}, 'HOLIDAY', { isWork: false, isOff: true, isHoliday: true, hasWorkTime: false }],
    [{ schedule: schedule({ status: 'ON_LEAVE', requestType: 'LEAVE', leaveType: 'UNPAID' }) }, {}, 'LEAVE_UNPAID', { isOff: true, isLeave: true }],
    [{ schedule: schedule({ scheduleType: 'ISAT', status: 'ON_LEAVE', requestType: 'ISAT' }) }, {}, 'ISAT', { isOff: true, isLeave: true }],
    [{}, { employment: { startDate: '2026-12-01', resignedOn: null } }, 'OUTSIDE', { isOutside: true, isOff: false, hasWorkTime: false }]
  ];
  for (const [over, context, kind, flags] of kinds) {
    it(`${kind}: cờ suy ra từ kind`, () => {
      const day = Day.resolve(input('2026-11-03', over), ctx(context), NOW);
      assert.equal(day.kind, kind);
      for (const [name, expected] of Object.entries(flags)) assert.equal((day as any)[name], expected, name);
    });
  }

  it('ngày ngoài tuần có khung OT là EXTRA, có giờ làm và có khoảng giờ', () => {
    const day = Day.resolve(input('2026-11-08', { otWindows: [{ start: '09:00', end: '12:00' }] }), ctx(), NOW);
    assert.equal(day.kind, 'EXTRA');
    assert.equal(day.hasWorkTime, true);
    assert.ok(day.span);
    assert.deepEqual(day.windows, [{ kind: 'OT', start: '09:00', end: '12:00' }]);
  });
});

describe('Day: claim và đơn chờ duyệt', () => {
  it('lịch đã duyệt thành claim APPROVED; khung OT/bù và nửa ca cũng vậy', () => {
    const day = Day.resolve(
      input('2026-11-03', {
        schedule: schedule({ scheduleType: 'SHIFT_CHANGE', shiftType: 'NIGHT', start: '22:00', end: '06:00' }),
        otWindows: [{ start: '18:00', end: '20:00' }],
        halfShift: { half: 'FIRST', start: '08:00', end: '12:00', requestId: 'h1' }
      }),
      ctx(),
      NOW
    );
    assert.deepEqual(day.claims.map(c => [c.kind, c.status]).sort(), [
      ['HALF_SHIFT', 'APPROVED'],
      ['OT_WINDOW', 'APPROVED'],
      ['SHIFT_CHANGE', 'APPROVED']
    ]);
    assert.equal(day.claimOf('HALF_SHIFT')?.requestId, 'h1');
    assert.equal(day.pending.length, 0);
  });

  it('đơn nghỉ chờ duyệt: ngày vẫn là WORK, claim nằm ở pending; duyệt xong thì thành ngày nghỉ', () => {
    const pending = [{ requestId: 'r9', date: '2026-11-03', kind: 'LEAVE' as const, status: 'PENDING' as const, detail: { kind: 'LEAVE' as const, leaveType: null } }];
    const waiting = Day.resolve(input('2026-11-03'), ctx(), NOW, pending);
    assert.deepEqual([waiting.kind, waiting.pending.map(c => c.requestId)], ['WORK', ['r9']]);
    const approved = Day.resolve(input('2026-11-03', { schedule: schedule({ status: 'ON_LEAVE', requestType: 'LEAVE', leaveType: 'ANNUAL', sourceRequestId: 'r9' }) }), ctx(), NOW);
    assert.deepEqual([approved.kind, approved.pending.length, approved.claimOf('LEAVE')?.requestId], ['LEAVE_PAID', 0, 'r9']);
  });
});

describe('Month', () => {
  const month = (over: Partial<DayContext> = {}) => Month.of({ month: '2026-11', context: ctx(over), days: [input('2026-11-02', { isHoliday: true })] }, NOW);

  it('đủ 30 ngày của tháng 11, mỗi ngày một Day đúng ngày', () => {
    const m = month();
    assert.equal(m.days.length, 30);
    assert.deepEqual([m.days[0].date, m.days[29].date], ['2026-11-01', '2026-11-30']);
    assert.equal(m.day('2026-11-02').kind, 'HOLIDAY');
    assert.equal(m.day('2026-11-01').kind, 'REST'); // Chủ nhật
    assert.equal(m.day('2026-11-03').kind, 'WORK');
  });

  it('day() ngoài tháng là lỗi lập trình; between() lấy đúng khoảng', () => {
    const m = month();
    assert.throws(() => m.day('2026-12-01'), /không thuộc tháng/);
    assert.deepEqual(m.between('2026-11-03', '2026-11-05').map(d => d.date), ['2026-11-03', '2026-11-04', '2026-11-05']);
  });

  it('at(now) đổi giai đoạn của mọi ngày, kind giữ nguyên', () => {
    const m = month();
    const end = m.at(new Date('2026-12-01T00:00:00+07:00'));
    assert.ok(end.days.every(d => d.isOver));
    assert.deepEqual(end.days.map(d => d.kind), m.days.map(d => d.kind));
    const start = m.at(new Date('2026-10-31T00:00:00+07:00'));
    assert.ok(start.days.every(d => d.phase === 'UPCOMING'));
  });

  it('tuần làm khác nhau cho ra kind khác nhau (T7 là ngày làm với T2–T7, nghỉ với T2–T6)', () => {
    assert.equal(month({ workWeek: T2_T7 }).day('2026-11-07').kind, 'WORK');
    assert.equal(month({ workWeek: T2_T6 }).day('2026-11-07').kind, 'REST');
  });
});

describe('DayPolicy', () => {
  const policy = new DayPolicy();
  const dayOf = (over: Partial<DayInput>, context: Partial<DayContext> = {}) => Day.resolve(input('2026-11-03', over), ctx(context), NOW);

  it('vào ca được trên ngày làm và ngày ngoài tuần có khung; không trên ngày nghỉ, lễ, ngoài', () => {
    assert.deepEqual(policy.can('PUNCH_IN', dayOf({})), { allowed: true, reason: null });
    assert.equal(policy.can('PUNCH_IN', Day.resolve(input('2026-11-08', { otWindows: [{ start: '09:00', end: '12:00' }] }), ctx(), NOW)).allowed, true);
    for (const day of [
      Day.resolve(input('2026-11-08'), ctx(), NOW),
      dayOf({ isHoliday: true }),
      dayOf({ schedule: schedule({ status: 'ON_LEAVE', requestType: 'LEAVE', leaveType: 'ANNUAL' }) }),
      dayOf({}, { employment: { startDate: '2026-12-01', resignedOn: null } })
    ]) {
      assert.deepEqual(policy.can('PUNCH_IN', day), { allowed: false, reason: 'Hôm nay không phải ngày làm của bạn' }, day.kind);
    }
  });

  it('ra ca không bị chặn theo ngày (ca đêm ra sáng hôm sau ở ngày nghỉ)', () => {
    assert.equal(policy.can('PUNCH_OUT', Day.resolve(input('2026-11-08'), ctx(), NOW)).allowed, true);
  });
});

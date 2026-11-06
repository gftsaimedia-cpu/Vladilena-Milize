import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { filingDayStates } from '../../src/modules/requests/domain/filing-choices';
import {
  buildChoices,
  endHours,
  leaveCountedOf,
  makeupCounter,
  otHoursOf,
  otLeftMinutes,
  shiftChangeableOf,
  startHours,
  type EngineCtx
} from '../../web/src/mock/staff-requests-engine';
import { FIXTURE_REST, annualLeaveLeftOf, fixtureDays, fixtureMonths, type FixtureOver } from './helpers/staff-requests-fixture';

// Máy luật của mock (web/src/mock/staff-requests-engine.ts) dựng phần request-context mà server tính, và kiểm đơn khi xem
// trước / tạo trên dữ liệu giả. Nó phải giữ đúng luật lựa chọn của server (src/modules/requests/domain/filing-choices.ts).
function engineContext(over: FixtureOver = {}): EngineCtx {
  return { ...FIXTURE_REST, months: fixtureMonths(over), annualLeaveLeft: annualLeaveLeftOf(over), days: fixtureDays(over) } as EngineCtx;
}
const dayAt = (ctx: EngineCtx, date: string) => ctx.days.find(d => d.date === date)!;

const VARIANTS: Record<string, FixtureOver> = {
  'no other request': {},
  'an approved and a pending iSAT Saturday': {
    claims: { '2026-11-14': { status: 'ISAT', pending: false }, '2026-11-21': { status: 'ISAT', pending: true } }
  },
  'a pending shift change': { claims: { '2026-11-23': { status: 'SHIFT_CHANGE', pending: true } } },
  'an approved shift change': { claims: { '2026-11-23': { status: 'SHIFT_CHANGE', pending: false } } },
  'December closed': { months: [{}, { closed: true }] },
  'November has overtime': { months: [{ hasOvertime: true }] },
  'November has makeup leave, December at the OT cap': { months: [{ hasMakeupLeave: true }, { otMinutes: 2400 }] },
  'one OT hour left in November': { months: [{ otMinutes: 2340 }] },
  'no annual leave account': { annualLeaveLeft: null }
};

describe('Máy luật của mock giữ đúng luật lựa chọn của server', () => {
  for (const [name, over] of Object.entries(VARIANTS)) {
    it(`choices, day flags and OT hours match the server: ${name}`, () => {
      const ctx = engineContext(over);
      const server = filingDayStates({
        days: ctx.days.map(d => ({ ...d, shift: d.shift && { start: d.shift.start, end: d.shift.end } })),
        months: ctx.months as any,
        annualLeaveLeft: ctx.annualLeaveLeft
      });
      assert.deepEqual(buildChoices(ctx), server.choices);
      assert.deepEqual(
        ctx.days.map(d => [d.date, leaveCountedOf(d), shiftChangeableOf(d), otHoursOf(ctx, d)]),
        server.days.map(d => [d.date, d.leaveCounted, d.shiftChangeable, d.otHours])
      );
    });
  }
});

describe('Máy luật của mock: giờ chọn được khi kiểm đơn', () => {
  it('endHours with a 60-minute cap keeps only ends of 60 minutes or less', () => {
    assert.deepEqual(endHours(dayAt(engineContext(), '2026-11-13'), 18, { capMinutes: 60 }), [{ end: 19, minutes: 60 }]);
  });

  it('startHours drops starts inside a taken window, endHours drops ends that would overlap it', () => {
    const sunday = dayAt(engineContext(), '2026-11-22');
    const starts = startHours(sunday, { taken: [{ start: 10, end: 12 }] });
    assert.ok(starts.includes(9) && starts.includes(12));
    assert.ok(!starts.includes(10) && !starts.includes(11));
    assert.deepEqual(endHours(sunday, 8, { taken: [{ start: 10, end: 12 }] }).map(e => e.end), [9, 10]);
  });

  it('slots already taken on a shift day use up its hours', () => {
    const day = dayAt(engineContext(), '2026-11-13');
    // Trần 12 giờ trừ 8 giờ ca còn 4 giờ: sau 18–20 vẫn còn 06–07 và 20–22 (spec 2.1, như BE).
    assert.deepEqual(startHours(day, { taken: [{ start: 18, end: 20 }] }), [6, 20, 21]);
    assert.deepEqual(startHours(day, { taken: [{ start: 18, end: 22 }] }), []);
  });

  it('OT minutes left in a month', () => {
    assert.equal(otLeftMinutes(engineContext(), '2026-11'), 1860);
    assert.equal(otLeftMinutes(engineContext({ months: [{ otMinutes: 2400 }] }), '2026-11'), 0);
    assert.equal(otLeftMinutes(engineContext(), '2027-01'), 0);
  });

  it('makeup counter: two leave days need 960 minutes', () => {
    const slots = [
      { date: '2026-11-22', startTime: '08:00', endTime: '12:00' },
      { date: '', startTime: '', endTime: '' }
    ];
    assert.deepEqual(makeupCounter(engineContext(), '2026-11-13', '2026-11-14', slots), { planned: 240, required: 960 });
  });
});

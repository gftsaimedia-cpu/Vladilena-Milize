// Ngữ cảnh form đơn dựng tay (không dùng mock), dùng chung cho test builder FE và test máy luật của mock.
// Ca HC 08–17, làm thứ Hai – thứ Bảy, 10/11 → 06/12/2026. 11/11 và 18/11 đang bị đơn nghỉ giữ. 15, 22, 29/11 và 06/12 là
// Chủ nhật. Giờ trống ngày có ca (spec 2.1): bắt đầu 06 tới 07, và bắt đầu 18, 19, 20, 21, mỗi giờ kết thúc tới 22.
import type { ClaimStatus, HourSlot } from '../../../web/src/mock/staff-requests-types';

export const SHIFT_HOURS: HourSlot[] = [
  { start: 6, ends: [{ end: 7, minutes: 60 }] },
  ...[18, 19, 20, 21].map(start => ({
    start,
    ends: Array.from({ length: 22 - start }, (_, j) => ({ end: start + j + 1, minutes: (j + 1) * 60 }))
  }))
];
export const SUNDAY_HOURS: HourSlot[] = Array.from({ length: 16 }, (_, i) => 6 + i).map(start => ({
  start,
  ends: Array.from({ length: Math.min(22, start + 12) - start }, (_, j) => ({ end: start + j + 1, minutes: (j + 1) * 60 }))
}));

const isoAdd = (iso: string, n: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);

export type FixtureClaim = { status: ClaimStatus; pending: boolean } | null;
export type FixtureDay = {
  date: string;
  workday: boolean;
  shift: { type: string; start: string; end: string } | null;
  holiday: string | null;
  claim: FixtureClaim;
  hours: HourSlot[];
};
export type FixtureMonth = {
  month: string;
  closed: boolean;
  otMinutes: number;
  otCapMinutes: 2400;
  otLeftMinutes: number;
  hasOvertime: boolean;
  hasMakeupLeave: boolean;
};
export type FixtureOver = {
  months?: Partial<Omit<FixtureMonth, 'otLeftMinutes'>>[];
  claims?: Record<string, FixtureClaim>;
  annualLeaveLeft?: number | null;
};

/** 27 ngày từ 10/11; ngày bị đơn nghỉ giữ không còn giờ trống. */
export function fixtureDays(over: FixtureOver = {}): FixtureDay[] {
  const days = Array.from({ length: 27 }, (_, i): FixtureDay => {
    const date = isoAdd('2026-11-10', i);
    const sunday = new Date(`${date}T00:00:00Z`).getUTCDay() === 0;
    return {
      date,
      workday: !sunday,
      shift: sunday ? null : { type: 'NORMAL', start: '08:00', end: '17:00' },
      holiday: null,
      claim: null,
      hours: sunday ? SUNDAY_HOURS : SHIFT_HOURS
    };
  });
  for (const d of days) {
    if (d.date === '2026-11-11' || d.date === '2026-11-18') Object.assign(d, { claim: { status: 'LEAVE', pending: true }, hours: [] });
    if (over.claims && d.date in over.claims) d.claim = over.claims[d.date];
  }
  return days;
}

/** Tháng 11 đã đăng ký 9 giờ OT, tháng 12 chưa có; `otLeftMinutes` tính như server. */
export function fixtureMonths(over: FixtureOver = {}): FixtureMonth[] {
  const base = [
    { month: '2026-11', closed: false, otMinutes: 540, otCapMinutes: 2400 as const, hasOvertime: false, hasMakeupLeave: false },
    { month: '2026-12', closed: false, otMinutes: 0, otCapMinutes: 2400 as const, hasOvertime: false, hasMakeupLeave: false }
  ];
  return base.map((m, i) => {
    const merged = { ...m, ...(over.months?.[i] ?? {}) };
    return { ...merged, otLeftMinutes: Math.max(0, merged.otCapMinutes - merged.otMinutes) };
  });
}

/** Phần còn lại của request-context, giống nhau ở mọi test. */
export const FIXTURE_REST = {
  today: '2026-11-10',
  window: { from: '2026-11-10', to: '2026-12-06' },
  kinds: [],
  leaveTypes: [{ code: 'ANNUAL', label: 'Phép năm' }],
  shiftFrames: [{ shiftType: 'NORMAL', start: '08:00', end: '17:00' }],
  explanationDays: [],
  advance: null
};

export const annualLeaveLeftOf = (over: FixtureOver): number | null =>
  over.annualLeaveLeft === undefined ? 11 : over.annualLeaveLeft;

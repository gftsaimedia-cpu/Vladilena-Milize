import { vnInstant } from './presence';

/**
 * Overtime as settled on 04/11: the pay is the real presence inside the approved OT window x the hourly rate x a
 * multiplier. The hours are counted in whole minutes and are not rounded; the money is rounded once per day line and
 * multiplier, from the summed hours of that group.
 */

/** Multiplier of the hourly rate: a weekday, Saturday or Sunday, a company holiday (a holiday wins over the weekend). */
export const OT_MULTIPLIERS = { weekday: 1.5, weekend: 2, holiday: 3 } as const;
export type OtMultiplier = 1.5 | 2 | 3;

/** An approved OT request: the window [start, end) on `date` ('YYYY-MM-DD', 'HH:MM', Vietnam time). */
export interface OtWindow {
  date: string;
  start: string;
  end: string;
}

/** The real presence of one attendance line (its work date, and the instants of check-in and check-out). */
export interface PresenceSpan {
  workDate: string;
  start: Date;
  end: Date;
}

/** The OT hours of one window that belong to one attendance line (`lineDate`), paid at one multiplier. */
export interface OtShare {
  lineDate: string;
  otDate: string;
  hours: number;
  multiplier: OtMultiplier;
}

const MINUTE_MS = 60_000;

export function otMultiplierOf(date: string, holidays: ReadonlySet<string>): OtMultiplier {
  if (holidays.has(date)) return OT_MULTIPLIERS.holiday;
  const weekday = new Date(`${date}T00:00:00Z`).getUTCDay(); // 0 = Sunday, 6 = Saturday
  return weekday === 0 || weekday === 6 ? OT_MULTIPLIERS.weekend : OT_MULTIPLIERS.weekday;
}

/**
 * The OT hours of each window that the spans cover. A window with a malformed time or an end that is not after its
 * start is ignored. The hours go to the line of the window's own date when a span has that work date, otherwise to the
 * line of the first span that overlaps (a night shift reaching into the window's date). A window with no whole minute
 * of presence gives no share.
 */
export function measureOvertime(
  windows: OtWindow[],
  spans: PresenceSpan[],
  holidays: ReadonlySet<string>
): OtShare[] {
  const shares: OtShare[] = [];
  for (const window of windows) {
    const from = vnInstant(window.date, window.start).getTime();
    const to = vnInstant(window.date, window.end).getTime();
    if (!(from < to)) continue; // also false for an Invalid Date (NaN)

    let overlapMs = 0;
    let firstOverlap: PresenceSpan | null = null;
    for (const span of spans) {
      const overlap = Math.min(to, span.end.getTime()) - Math.max(from, span.start.getTime());
      if (overlap > 0) {
        overlapMs += overlap;
        firstOverlap ??= span;
      }
    }

    const minutes = Math.floor(overlapMs / MINUTE_MS);
    if (minutes <= 0 || !firstOverlap) continue;
    shares.push({
      lineDate: spans.some(span => span.workDate === window.date) ? window.date : firstOverlap.workDate,
      otDate: window.date,
      hours: minutes / 60,
      multiplier: otMultiplierOf(window.date, holidays)
    });
  }
  return shares;
}

export function otPayOf(hours: number, hourRate: number, multiplier: OtMultiplier): number {
  return Math.round(hours * hourRate * multiplier);
}

/** The OT pay of one day line: its shares are grouped by multiplier, and each group is rounded once. */
export function otLinePayOf(shares: OtShare[], hourRate: number): number {
  const hoursByMultiplier = new Map<OtMultiplier, number>();
  for (const share of shares) {
    hoursByMultiplier.set(share.multiplier, (hoursByMultiplier.get(share.multiplier) ?? 0) + share.hours);
  }
  let pay = 0;
  for (const [multiplier, hours] of hoursByMultiplier) pay += otPayOf(hours, hourRate, multiplier);
  return pay;
}

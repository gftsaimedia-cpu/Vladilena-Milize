import { vnInstant } from './presence';

/**
 * Overtime as settled on 04/11: the pay is the real presence inside the approved OT window x the hourly rate x a
 * multiplier. The hours are counted in whole minutes and are not rounded. Per-line and per-kind money here is display
 * only; the payslip's OT items are each one formula on the exact summed hours, rounded once (D1, `moneyOf`).
 */

/** The kind of an OT day: a company holiday (wins over the weekend), Saturday or Sunday, or any other day. */
export type OtKind = 'weekday' | 'weekend' | 'holiday';

/** Multiplier of the hourly rate for each kind of day; the month's rates come from the settings store. */
export type OtRates = Record<OtKind, number>;
export type OtMultiplier = number;

/** The default rates. */
export const OT_MULTIPLIERS = { weekday: 1.5, weekend: 2, holiday: 3 } as const;

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

/** The OT hours of one window that belong to one attendance line (`lineDate`), paid at the rate of its kind of day. */
export interface OtShare {
  lineDate: string;
  otDate: string;
  hours: number;
  kind: OtKind;
  multiplier: OtMultiplier; // rates[kind]
}

const MINUTE_MS = 60_000;

export function otKindOf(date: string, holidays: ReadonlySet<string>): OtKind {
  if (holidays.has(date)) return 'holiday';
  const weekday = new Date(`${date}T00:00:00Z`).getUTCDay(); // 0 = Sunday, 6 = Saturday
  return weekday === 0 || weekday === 6 ? 'weekend' : 'weekday';
}

export function otMultiplierOf(date: string, holidays: ReadonlySet<string>, rates: OtRates = OT_MULTIPLIERS): OtMultiplier {
  return rates[otKindOf(date, holidays)];
}

/**
 * The OT hours of each window that the spans cover. A window with a malformed time or an end that is not after its
 * start is ignored. The hours go to the line of the window's own date when a span has that work date, otherwise to the
 * line of the first span that overlaps (a night shift reaching into the window's date). A window with no whole minute
 * of presence gives no share. The kind of day is the window's date; its multiplier is the rate of that kind.
 */
export function measureOvertime(
  windows: OtWindow[],
  spans: PresenceSpan[],
  holidays: ReadonlySet<string>,
  rates: OtRates = OT_MULTIPLIERS
): OtShare[] {
  const shares: OtShare[] = [];
  for (const window of windows) {
    const from = vnInstant(window.date, window.start).getTime();
    const to = vnInstant(window.date, window.end).getTime();
    if (!(from < to)) continue; // also false for an Invalid Date (NaN)

    // Clip every span to the window, then merge the clipped intervals so a minute covered by two spans counts once.
    const clipped: Array<[number, number]> = [];
    let firstOverlap: PresenceSpan | null = null;
    for (const span of spans) {
      const start = Math.max(from, span.start.getTime());
      const end = Math.min(to, span.end.getTime());
      if (end > start) {
        clipped.push([start, end]);
        firstOverlap ??= span;
      }
    }
    clipped.sort((a, b) => a[0] - b[0]);
    let overlapMs = 0;
    let mergedEnd = -Infinity;
    for (const [start, end] of clipped) {
      overlapMs += Math.max(0, end - Math.max(start, mergedEnd)); // 0 when this interval lies inside the merged one
      mergedEnd = Math.max(mergedEnd, end);
    }

    const minutes = Math.floor(overlapMs / MINUTE_MS);
    if (minutes <= 0 || !firstOverlap) continue;
    const kind = otKindOf(window.date, holidays);
    shares.push({
      lineDate: spans.some(span => span.workDate === window.date) ? window.date : firstOverlap.workDate,
      otDate: window.date,
      hours: minutes / 60,
      kind,
      multiplier: rates[kind]
    });
  }
  return shares;
}

export function otPayOf(hours: number, hourRate: number, multiplier: OtMultiplier): number {
  return Math.round(hours * hourRate * multiplier);
}

/**
 * The payslip bucket of each kind of day. The keys keep their historical names (x1.5, x2, x3 are the default rates):
 * x15 is always the weekday bucket, x20 the weekend one and x30 the holiday one, whatever the rates are.
 */
export const OT_BUCKET_OF: Record<OtKind, 'x15' | 'x20' | 'x30'> = { weekday: 'x15', weekend: 'x20', holiday: 'x30' };

/**
 * The OT pay of one day line by kind of day: the shares are grouped by kind (never by multiplier, so two kinds set to
 * the same rate stay apart), each group rounded once at the multiplier of its kind. The shares of one payslip come
 * from one measureOvertime call, so all shares of a kind carry the same multiplier.
 */
export function otLinePayByRate(shares: OtShare[], hourRate: number): { x15: number; x20: number; x30: number } {
  const groups = new Map<OtKind, { hours: number; multiplier: OtMultiplier }>();
  for (const share of shares) {
    // Kind lạ không có túi trên phiếu lương: ném lỗi thay vì để tiền OT biến mất trong im lặng.
    if (!Object.hasOwn(OT_BUCKET_OF, share.kind)) throw new Error(`Dòng OT không rõ loại ngày: ${share.kind}`);
    const hours = (groups.get(share.kind)?.hours ?? 0) + share.hours;
    groups.set(share.kind, { hours, multiplier: share.multiplier });
  }
  const pay = { x15: 0, x20: 0, x30: 0 };
  for (const [kind, { hours, multiplier }] of groups) pay[OT_BUCKET_OF[kind]] = otPayOf(hours, hourRate, multiplier);
  return pay;
}

/** The OT pay of one day line: the sum of its pay by kind of day. */
export function otLinePayOf(shares: OtShare[], hourRate: number): number {
  const byRate = otLinePayByRate(shares, hourRate);
  return byRate.x15 + byRate.x20 + byRate.x30;
}

/** The Vietnam calendar weekday of a 'YYYY-MM-DD' date, as the payslip prints it: 'Thứ 2' ... 'Thứ 7', 'Chủ nhật'. */
export function weekdayTextOf(date: string): string {
  const weekday = new Date(`${date}T00:00:00Z`).getUTCDay(); // 0 = Sunday
  return weekday === 0 ? 'Chủ nhật' : `Thứ ${weekday + 1}`;
}

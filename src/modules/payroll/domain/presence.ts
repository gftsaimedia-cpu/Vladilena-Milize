/**
 * Real check-in and check-out of one day, in Vietnam time (fixed UTC+7, no daylight saving).
 * `start` and `end` are real instants so overtime can be measured from them; the texts are for the payslip.
 */
export interface Presence {
  checkIn: string | null; // 'HH:MM'
  checkOut: string | null; // 'HH:MM'
  start: Date | null;
  end: Date | null;
}

const VN_OFFSET_MS = 7 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** 'HH:MM' on the Vietnam clock of an instant. */
export function vnClock(at: string | Date): string {
  const vn = new Date(new Date(at).getTime() + VN_OFFSET_MS);
  return `${String(vn.getUTCHours()).padStart(2, '0')}:${String(vn.getUTCMinutes()).padStart(2, '0')}`;
}

/** The instant of a Vietnam clock time ('HH:MM') on a calendar date ('YYYY-MM-DD'). */
export function vnInstant(date: string, hhmm: string): Date {
  return new Date(`${date}T${hhmm}:00+07:00`);
}

function punchInstant(punch: string | Date | null | undefined): Date | null {
  if (!punch) return null;
  const at = new Date(punch);
  return Number.isNaN(at.getTime()) ? null : at;
}

/**
 * A punch wins; a side without one takes the time of an approved explanation of that day.
 * An explained check-out at or before the check-in belongs to the next day (night shift).
 */
export function presenceOf(
  workDate: string,
  punchIn: string | Date | null | undefined,
  punchOut: string | Date | null | undefined,
  explained?: { checkIn?: string | null; checkOut?: string | null }
): Presence {
  const start = punchInstant(punchIn) ?? (explained?.checkIn ? vnInstant(workDate, explained.checkIn) : null);
  let end = punchInstant(punchOut);
  if (!end && explained?.checkOut) {
    end = vnInstant(workDate, explained.checkOut);
    if (start && end.getTime() <= start.getTime()) end = new Date(end.getTime() + DAY_MS);
  }
  return {
    checkIn: start ? vnClock(start) : null,
    checkOut: end ? vnClock(end) : null,
    start,
    end
  };
}

/** The in/out text of a day line, '—' for a missing side. */
export function inOutText(p: Presence): string {
  return `${p.checkIn ?? '—'}–${p.checkOut ?? '—'}`;
}

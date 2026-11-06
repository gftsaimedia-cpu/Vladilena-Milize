import { Demo, must } from './harness';
import { PEOPLE, Person } from './people';

/** Một ngày công khác thường. `in`/`out` là giờ VN ('HH:mm'); null = không chấm lượt đó; skip = không chấm gì (nghỉ, vắng). */
export interface Day {
  skip?: boolean;
  in?: string | null;
  out?: string | null;
}
export type Exceptions = Record<string, Day>; // khoá `${username}|${YYYY-MM-DD}`

export const ymd = (d: Date): string => d.toISOString().slice(0, 10);
export const addDays = (date: string, n: number): string => ymd(new Date(new Date(`${date}T00:00:00Z`).getTime() + n * 86400000));
export function* dates(from: string, to: string): Generator<string> {
  for (let d = from; d <= to; d = addDays(d, 1)) yield d;
}
const dow = (date: string): number => new Date(`${date}T00:00:00Z`).getUTCDay();

export interface Window {
  from: string;
  to: string;
}

/**
 * Chấm công hộ (admin) cho mọi người trong [from, to]: mọi ngày thuộc tuần làm của người đó, ngày lễ không chấm,
 * vào đúng giờ ca, ra đúng giờ ca, trừ ngoại lệ. Ca đêm ra vào hôm sau. `until` cắt người đã nghỉ (ngày cuối còn đi làm).
 */
export async function punchPeriod(
  demo: Demo,
  win: Window,
  holidays: Set<string>,
  exc: Exceptions,
  weeks: Map<string, number[]>,
  limits: Record<string, { until?: string; from?: string }> = {}
): Promise<number> {
  let n = 0;
  for (const p of PEOPLE) {
    const lim = limits[p.username] ?? {};
    const start = [win.from, p.from, lim.from].filter(Boolean).sort().pop()!;
    const end = [win.to, lim.until].filter(Boolean).sort()[0]!;
    for (const date of dates(start, end)) {
      if (!weeks.get(p.username)!.includes(dow(date)) || holidays.has(date)) continue;
      n += await punchDay(demo, p, date, exc[`${p.username}|${date}`]);
    }
  }
  return n;
}

export async function punchDay(demo: Demo, p: Person, date: string, d: Day = {}): Promise<number> {
  if (d.skip) return 0;
  const inAt = d.in === undefined ? p.start : d.in;
  const outAt = d.out === undefined ? p.end : d.out;
  const overnight = p.shiftType === 'NIGHT';
  let n = 0;
  if (inAt) {
    must(await demo.admin.post('/api/v2/attendance/punches', { employeeId: demo.uuids.get(p.username), type: 'IN', punchedAt: `${date}T${inAt}:00+07:00` }), `${p.username} vào ${date}`);
    n++;
  }
  if (outAt) {
    const outDate = overnight && outAt < '12:00' ? addDays(date, 1) : date;
    must(await demo.admin.post('/api/v2/attendance/punches', { employeeId: demo.uuids.get(p.username), type: 'OUT', punchedAt: `${outDate}T${outAt}:00+07:00` }), `${p.username} ra ${date}`);
    n++;
  }
  return n;
}

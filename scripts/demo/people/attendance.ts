// Người của mảng 'attendance' (spec docs/superpowers/specs/2026-11-05-demo-db-e2e-design.md mục 6).
// Chỉ phiên attendance sửa file này. Username bắt đầu bằng 'cc-'. Phần nền tự tạo tài khoản và hợp đồng
// qua POST /api/v2/employees trước khi chạy seed của mảng (scripts/demo/areas/attendance.ts).
//
// File còn có kế hoạch ngày công (attendancePlan): ngày nào, ai, chấm mấy giờ, thuộc tình huống nào. Seed đọc kế hoạch để
// gọi POST /attendance/punches; test đọc cùng kế hoạch để tính kỳ vọng. Mọi ngày tính từ hôm nay (giờ Việt Nam), không viết cứng.
// Module thuần: test Playwright cũng import được.
import { addMonths, dateIn, daysInMonth, demoMonths, weekday, type DemoMonths } from '../dates';
import type { DemoPerson } from './types';

export type Punch = { type: 'IN' | 'OUT'; at: string; nextDay?: boolean };

const P = (type: 'IN' | 'OUT', at: string, nextDay = false): Punch => ({ type, at, ...(nextDay ? { nextDay } : {}) });
const day = (ym: string, n: number) => dateIn(ym, n);
const addDays = (iso: string, n: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);

/** Ngày thứ n (1 = đầu tiên) có thứ `dow` (0 = Chủ nhật … 6 = thứ Bảy) trong tháng `ym`. */
export function nthWeekday(ym: string, dow: number, n: number): string {
  let seen = 0;
  for (let d = 1; d <= daysInMonth(ym); d++) {
    if (weekday(day(ym, d)) === dow && ++seen === n) return day(ym, d);
  }
  throw new Error(`Tháng ${ym} không có ${n} ngày thứ ${dow}`);
}

const nv = (shift?: Record<string, unknown>) => ({ status: 'nv', position: { type: 'nv', level: 1 }, ...(shift ? { shift } : {}) });
const start2 = { monthOffset: -2, day: 1 };

export const ATTENDANCE: DemoPerson[] = [
  {
    username: 'cc-dung-gio',
    familyName: 'Phạm Văn',
    givenName: 'Đức',
    area: 'attendance',
    start: start2,
    contract: nv(),
    note: 'Ca Normal 08–17, vào 07:55 ra 17:05 mọi ngày làm từ đầu tháng trước tới hôm qua (trừ ngày lễ). Hôm nay chưa chấm.'
  },
  {
    username: 'cc-tre',
    familyName: 'Lê Thị',
    givenName: 'Trâm',
    area: 'attendance',
    start: start2,
    contract: nv(),
    note: 'Ca Normal 08–17: vào trễ 15/16/40 phút và 4 tiếng, về sớm 1/30 phút, vừa trễ vừa sớm, vào sớm 20 phút, ra muộn 20/45 phút.'
  },
  {
    username: 'cc-thieu',
    familyName: 'Ngô Văn',
    givenName: 'Thịnh',
    area: 'attendance',
    start: start2,
    contract: nv(),
    note: 'Ca Normal 08–17: thiếu giờ ra, thiếu giờ vào, ra giữa ca rồi vào lại, vắng một thứ Bảy, vắng một ngày thường.'
  },
  {
    username: 'cc-flex',
    familyName: 'Vũ Thị',
    givenName: 'Phương',
    area: 'attendance',
    start: start2,
    contract: nv({ type: 'FLEX', startTime: '13:00', endTime: '22:00' }),
    note: 'Ca Flex 13–22: đúng giờ, vào trễ 40 phút, về sớm 30 phút.'
  },
  {
    username: 'cc-dem',
    familyName: 'Đặng Văn',
    givenName: 'Đông',
    area: 'attendance',
    start: start2,
    contract: nv({ type: 'NIGHT', startTime: '22:00', endTime: '07:00', allowancePct: 30 }),
    note: 'Ca Night 22–07 qua nửa đêm: vào 21:55 ra 07:00 sáng hôm sau, vào trễ 40 phút, về sớm 30 phút, thiếu giờ ra.'
  },
  {
    username: 'cc-tts',
    familyName: 'Bùi Thị',
    givenName: 'Thảo',
    area: 'attendance',
    start: start2,
    contract: { status: 'tts', position: { type: 'tts', level: 1 } },
    note: 'Thực tập sinh, tuần thứ Hai – thứ Sáu: đi đủ các ngày đó tháng trước, thứ Bảy không chấm.'
  },
  {
    username: 'cc-chu-nhat',
    familyName: 'Hồ Văn',
    givenName: 'Nhật',
    area: 'attendance',
    start: start2,
    contract: nv(),
    note: 'Ca Normal: đi đủ tháng trước, thêm một Chủ nhật có giờ vào 08:00 ra 12:00 (Admin chấm hộ).'
  },
  {
    username: 'cc-giua-thang',
    familyName: 'Lý Thị',
    givenName: 'Giang',
    area: 'attendance',
    // Thứ Hai thứ ba của tháng trước (tính lúc nạp file, cùng ngày với seed và test).
    start: { monthOffset: -1, day: Number(nthWeekday(demoMonths().m1, 1, 3).slice(8, 10)) },
    contract: nv(),
    note: 'Vào làm thứ Hai thứ ba của tháng trước, đi đủ từ hôm đó tới hôm qua.'
  },
  {
    username: 'cc-nghi-viec',
    familyName: 'Trịnh Văn',
    givenName: 'Nghĩa',
    area: 'attendance',
    start: start2,
    contract: nv(),
    note: 'Đi đủ từ đầu tháng trước tới thứ Sáu thứ ba của tháng đó, rồi nghỉ việc từ ngày đó (trạng thái nghiviec).'
  },
  {
    username: 'cc-chot',
    familyName: 'Mai Văn',
    givenName: 'Khánh',
    area: 'attendance',
    start: { monthOffset: -3, day: 1 },
    contract: nv(),
    note: 'Đi đủ tháng m3 (ba tháng trước). Test chốt công tháng m3 rồi thử chấm, tính lại, thêm ngày lễ trong tháng đã chốt.'
  },
  {
    username: 'cc-hom-nay',
    familyName: 'Tạ Thị',
    givenName: 'Hạnh',
    area: 'attendance',
    start: start2,
    contract: nv(),
    note: 'Chưa có giờ chấm nào. Test check-in, check-out hôm nay trên điện thoại.'
  },
  {
    username: 'cc-may-tinh',
    familyName: 'Đinh Văn',
    givenName: 'Minh',
    area: 'attendance',
    start: start2,
    contract: nv(),
    note: 'Chưa có giờ chấm nào. Test check-in, check-out hôm nay trên máy tính (≥ 1136px).'
  }
];

// ---------------------------------------------------------------- kế hoạch ngày công

/** Tình huống của một ngày; test tra kỳ vọng theo khoá này. */
export type DayCase =
  | 'on-time'
  | 'late-15'
  | 'late-16'
  | 'late-40'
  | 'late-4h'
  | 'early-out-1'
  | 'early-out-30'
  | 'late-early'
  | 'early-in-20'
  | 'late-out-20'
  | 'late-out-45'
  | 'missing-out'
  | 'missing-in'
  | 'out-and-back'
  | 'absent'
  | 'sunday-worked';

export interface PlannedDay {
  username: string;
  date: string;
  case: DayCase;
  /** Rỗng với ngày vắng (không chấm). */
  punches: Punch[];
}

/** Thứ Hai đến thứ Bảy (hoặc thứ Hai – thứ Sáu khi `fiveDay`) của tháng `ym`, trong [from, to], bỏ các ngày trong `skip`. */
function workdays(ym: string, o: { fiveDay?: boolean; from?: string; to?: string; skip?: string[] } = {}): string[] {
  const out: string[] = [];
  for (let d = 1; d <= daysInMonth(ym); d++) {
    const iso = day(ym, d);
    const w = weekday(iso);
    if (w === 0 || (o.fiveDay && w === 6)) continue;
    if ((o.from && iso < o.from) || (o.to && iso > o.to) || o.skip?.includes(iso)) continue;
    out.push(iso);
  }
  return out;
}

const ON_TIME: Record<'NORMAL' | 'FLEX' | 'NIGHT', Punch[]> = {
  NORMAL: [P('IN', '07:55'), P('OUT', '17:05')],
  FLEX: [P('IN', '12:58'), P('OUT', '22:00')],
  NIGHT: [P('IN', '21:55'), P('OUT', '07:00', true)]
};

export interface AttendancePlan {
  months: DemoMonths;
  /** Ba tháng trước: tháng của cc-chot, test chốt công tháng này. */
  m3: string;
  /** Hôm qua (giờ Việt Nam). */
  yesterday: string;
  /** Ngày lễ công ty seed sẵn: thứ Tư thứ hai của tháng trước. Không ai chấm công ngày này. */
  holiday: { date: string; name: string };
  /** Ngày vào làm của cc-giua-thang: thứ Hai thứ ba của tháng trước. */
  joinDate: string;
  /** Ngày nghỉ việc của cc-nghi-viec: thứ Sáu thứ ba của tháng trước (chính ngày đó vẫn là ngày làm). */
  resignDate: string;
  /** Thứ Ba tuần trước: cc-tre vào trễ 40 phút (ô trong lưới tuần của Admin). */
  lastWeekTuesday: string;
  days: PlannedDay[];
}

/** Kế hoạch ngày công của mảng chấm công cho bộ tháng `months` (hôm nay theo giờ Việt Nam). */
export function attendancePlan(months: DemoMonths): AttendancePlan {
  const { m0, m1, today } = months;
  const m3 = addMonths(m0, -3);
  const yesterday = addDays(today, -1);
  const holiday = { date: nthWeekday(m1, 3, 2), name: 'Ngày lễ thử (demo chấm công)' };
  const joinDate = nthWeekday(m1, 1, 3);
  const resignDate = nthWeekday(m1, 5, 3);
  const mondayThisWeek = addDays(today, -((weekday(today) + 6) % 7));
  const lastWeekTuesday = addDays(mondayThisWeek, -6);
  const skip = [holiday.date];
  const days: PlannedDay[] = [];
  const add = (username: string, date: string, c: DayCase, punches: Punch[]) => days.push({ username, date, case: c, punches });
  const untilYesterday = (from: string) => [...workdays(m1, { from, skip }), ...workdays(m0, { to: yesterday, skip })];

  // Đúng giờ: từ đầu tháng trước tới hôm qua.
  for (const d of untilYesterday(`${m1}-01`)) add('cc-dung-gio', d, 'on-time', ON_TIME.NORMAL);

  // Trễ, sớm: các ngày đặc biệt là ngày làm thứ 2–11 của tháng trước, còn lại đúng giờ (cả tháng này tới hôm qua).
  const tre: Array<[DayCase, Punch[]]> = [
    ['late-15', [P('IN', '08:15'), P('OUT', '17:00')]],
    ['late-16', [P('IN', '08:16'), P('OUT', '17:00')]],
    ['late-40', [P('IN', '08:40'), P('OUT', '17:00')]],
    ['late-4h', [P('IN', '12:00'), P('OUT', '17:00')]],
    ['early-out-1', [P('IN', '08:00'), P('OUT', '16:59')]],
    ['early-out-30', [P('IN', '08:00'), P('OUT', '16:30')]],
    ['late-early', [P('IN', '08:20'), P('OUT', '16:40')]],
    ['early-in-20', [P('IN', '07:40'), P('OUT', '17:00')]],
    ['late-out-20', [P('IN', '08:00'), P('OUT', '17:20')]],
    ['late-out-45', [P('IN', '08:00'), P('OUT', '17:45')]]
  ];
  const treDays = untilYesterday(`${m1}-01`);
  treDays.forEach((d, i) => {
    const special = i >= 1 && i <= tre.length ? tre[i - 1] : null;
    if (special) add('cc-tre', d, special[0], special[1]);
    else if (d === lastWeekTuesday) add('cc-tre', d, 'late-40', tre[2][1]);
    else add('cc-tre', d, 'on-time', ON_TIME.NORMAL);
  });

  // Thiếu giờ, ra vào giữa ca, vắng: tháng trước.
  const thieu = workdays(m1, { skip });
  const firstSaturdayAfter = thieu.find((d, i) => i > 3 && weekday(d) === 6)!;
  const absentWeekday = thieu.find((d, i) => i > 3 && weekday(d) !== 6 && d !== firstSaturdayAfter)!;
  thieu.forEach((d, i) => {
    if (i === 1) add('cc-thieu', d, 'missing-out', [P('IN', '08:00')]);
    else if (i === 2) add('cc-thieu', d, 'missing-in', [P('OUT', '17:00')]);
    else if (i === 3) add('cc-thieu', d, 'out-and-back', [P('IN', '08:00'), P('OUT', '10:00'), P('IN', '10:30'), P('OUT', '17:00')]);
    else if (d === firstSaturdayAfter || d === absentWeekday) add('cc-thieu', d, 'absent', []);
    else add('cc-thieu', d, 'on-time', ON_TIME.NORMAL);
  });

  // Flex 13–22 và Night 22–07: tháng trước.
  workdays(m1, { skip }).forEach((d, i) => {
    if (i === 1) add('cc-flex', d, 'late-40', [P('IN', '13:40'), P('OUT', '22:00')]);
    else if (i === 2) add('cc-flex', d, 'early-out-30', [P('IN', '13:00'), P('OUT', '21:30')]);
    else add('cc-flex', d, 'on-time', ON_TIME.FLEX);
  });
  workdays(m1, { skip }).forEach((d, i) => {
    if (i === 1) add('cc-dem', d, 'late-40', [P('IN', '22:40'), P('OUT', '07:00', true)]);
    else if (i === 2) add('cc-dem', d, 'early-out-30', [P('IN', '21:55'), P('OUT', '06:30', true)]);
    else if (i === 3) add('cc-dem', d, 'missing-out', [P('IN', '22:00')]);
    else add('cc-dem', d, 'on-time', ON_TIME.NIGHT);
  });

  // Thực tập sinh: thứ Hai – thứ Sáu tháng trước.
  for (const d of workdays(m1, { fiveDay: true, skip })) add('cc-tts', d, 'on-time', ON_TIME.NORMAL);

  // Chủ nhật có giờ chấm.
  for (const d of workdays(m1, { skip })) add('cc-chu-nhat', d, 'on-time', ON_TIME.NORMAL);
  add('cc-chu-nhat', nthWeekday(m1, 0, 2), 'sunday-worked', [P('IN', '08:00'), P('OUT', '12:00')]);

  // Vào làm giữa tháng, nghỉ việc giữa tháng.
  for (const d of untilYesterday(joinDate)) add('cc-giua-thang', d, 'on-time', ON_TIME.NORMAL);
  for (const d of workdays(m1, { to: resignDate, skip })) add('cc-nghi-viec', d, 'on-time', ON_TIME.NORMAL);

  // Tháng sẽ chốt công (m3).
  for (const d of workdays(m3)) add('cc-chot', d, 'on-time', ON_TIME.NORMAL);

  days.sort((a, b) => a.username.localeCompare(b.username) || a.date.localeCompare(b.date));
  return { months, m3, yesterday, holiday, joinDate, resignDate, lastWeekTuesday, days };
}

/** Thời điểm ISO giờ Việt Nam của một lần chấm thuộc ngày công `date`. */
export const punchedAt = (date: string, p: Punch): string => `${p.nextDay ? addDays(date, 1) : date}T${p.at}:00+07:00`;

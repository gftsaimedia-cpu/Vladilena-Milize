// Người của mảng 'payroll' (spec docs/superpowers/specs/2026-11-05-demo-db-e2e-design.md mục 6).
// Chỉ phiên payroll sửa file này. Username bắt đầu bằng 'lg-'. Phần nền tự tạo tài khoản và hợp đồng
// qua POST /api/v2/employees trước khi chạy seed của mảng (scripts/demo/areas/payroll.ts).
//
// Mỗi người một tình huống lương; bảng tình huống ở docs/demo-db/payroll.md. Chấm công, đơn, KPI, tính lương
// và duyệt phiếu do scripts/demo/areas/payroll.ts làm theo `payrollPlan()` dưới đây (test cũng đọc kế hoạch này).
// m2 = tháng trước nữa, m1 = tháng trước (tháng chính của mảng), m0 = tháng này (tới hôm qua).
// Module thuần: không đọc file, không gọi mạng.
import type { DemoPerson } from './types';

const normal = { type: 'NORMAL', startTime: '08:00', endTime: '17:00' };

export const PAYROLL: DemoPerson[] = [
  {
    username: 'lg-an',
    familyName: 'Lương Văn',
    givenName: 'An',
    area: 'payroll',
    start: { monthOffset: -2, day: 1 },
    contract: { status: 'nv', term: 'long', position: { type: 'nv', level: 1 }, shift: normal },
    note: 'nv bậc 1, HĐ từ 3 tháng (đóng BH). Đi đủ m2, m1, m0. Đủ 5 điểm KPI m1. Phiếu m1 và m2 đã duyệt (chính thức).'
  },
  {
    username: 'lg-binh',
    familyName: 'Lương Thị',
    givenName: 'Bình',
    area: 'payroll',
    start: { monthOffset: -2, day: 1 },
    contract: { status: 'nv', term: 'short', hasInsurance: false, position: { type: 'nv', level: 2 }, shift: normal },
    note: 'nv bậc 2, HĐ dưới 3 tháng, không đóng BH (thuế 10%). m1: 2 ngày vào trễ 40 phút, 1 ngày vắng, 1 ngày thiếu giờ ra. Phiếu m1 để thử Từ chối.'
  },
  {
    username: 'lg-chi',
    familyName: 'Lương Minh',
    givenName: 'Chi',
    area: 'payroll',
    start: { monthOffset: -2, day: 1 },
    contract: {
      status: 'nv',
      term: 'long',
      position: { type: 'nv', level: 3 },
      shift: normal,
      leave: { totalDays: 12, usedDays: 0 }
    },
    extra: { dependants: 1 },
    note: 'nv bậc 3, 1 người phụ thuộc. m1: 2 ngày Phép năm đã duyệt, 1 ngày nghỉ không lương đã duyệt, OT ngày thường 18–20 đã duyệt, tạm ứng m1 đã duyệt.'
  },
  {
    username: 'lg-dung',
    familyName: 'Lương Quốc',
    givenName: 'Dũng',
    area: 'payroll',
    start: { monthOffset: -2, day: 1 },
    contract: { status: 'nv', term: 'long', isDormResident: true, position: { type: 'nv', level: 4 }, shift: normal },
    note: 'nv bậc 4, ở iDorm (đi lại 0). Đi đủ m1, KPI 100 cả 5 phần với mức đề xuất bằng kpi_max: có thuế lũy tiến. Phiếu m1 đã duyệt.'
  },
  {
    username: 'lg-em',
    familyName: 'Lương Thu',
    givenName: 'Em',
    area: 'payroll',
    start: { monthOffset: -2, day: 1 },
    contract: { status: 'ctv', term: 'long', position: { type: 'ctv', level: 2 }, shift: normal },
    note: 'ctv bậc 2. Đi đủ m1. KPI m1 thiếu 3 điểm (Đồng nghiệp, Quản lý, Tự đánh giá): có chấm cam. Test nhập điểm trong ngăn kéo.'
  },
  {
    username: 'lg-giang',
    familyName: 'Lương Hà',
    givenName: 'Giang',
    area: 'payroll',
    start: { monthOffset: -2, day: 1 },
    contract: { status: 'ctv', term: 'long', position: { type: 'ctv', level: 4 }, shift: normal },
    note: 'ctv bậc 4. Đi đủ m1, OT thứ Bảy 18–20 đã duyệt. Đủ điểm KPI nhưng chưa nhập mức đề xuất (KPI 0, có cờ).'
  },
  {
    username: 'lg-hoa',
    familyName: 'Lương Mai',
    givenName: 'Hoa',
    area: 'payroll',
    start: { monthOffset: -2, day: 1 },
    contract: { status: 'tts', position: { type: 'tts', level: 1 }, shift: normal },
    note: 'tts bậc 1 (không BH, không KPI). Đi đủ thứ Hai – thứ Sáu m1. Test tính lại một người hai lần.'
  },
  {
    username: 'lg-khanh',
    familyName: 'Lương Gia',
    givenName: 'Khánh',
    area: 'payroll',
    start: { monthOffset: -2, day: 1 },
    contract: { status: 'tts', term: 'short', hasInsurance: true, position: { type: 'tts', level: 6 }, shift: normal },
    note: 'tts bậc 6, HĐ dưới 3 tháng nhưng có cờ BH. Đi đủ thứ Hai – thứ Sáu m1. Phiếu m1 đã duyệt (chính thức).'
  },
  {
    username: 'lg-lan',
    familyName: 'Lương Ngọc',
    givenName: 'Lan',
    area: 'payroll',
    start: { monthOffset: -1, day: 15 },
    contract: { status: 'nv', term: 'long', position: { type: 'nv', level: 1 }, shift: normal },
    note: 'nv bậc 1 vào làm ngày 15 của m1. Đi đủ từ ngày vào làm tới hôm qua. Không xem được m2 ở app nhân viên.'
  },
  {
    username: 'lg-minh',
    familyName: 'Lương Đức',
    givenName: 'Minh',
    area: 'payroll',
    start: { monthOffset: -2, day: 1 },
    contract: { status: 'nv', term: 'long', position: { type: 'nv', level: 2 }, shift: normal },
    note: 'nv bậc 2 nghỉ việc ngày 16 của m1 (seed ghi qua PUT /employees). Đi đủ m2 và m1 tới ngày 16.'
  },
  {
    username: 'lg-nam',
    familyName: 'Lương Hải',
    givenName: 'Nam',
    area: 'payroll',
    start: { monthOffset: -2, day: 1 },
    contract: {
      status: 'nv',
      term: 'long',
      position: { type: 'nv', level: 1 },
      shift: { type: 'FLEX', startTime: '06:00', endTime: '15:00' }
    },
    note: 'nv bậc 1 ca Flex 06–15. Đi đủ m1. Test Duyệt phiếu trong ngăn kéo.'
  }
];

// ---------- Kế hoạch tình huống (thuần: seed và test cùng dùng) ----------

export type PunchDay = { date: string; in: string | null; out: string | null };
export type LeavePlan = { leaveType: 'ANNUAL' | 'UNPAID'; from: string; to: string };
export type OvertimePlan = { date: string; start: string; end: string };
export type ExplanationPlan = { date: string; cases: string[]; actualCheckOut?: string };
export type KpiPlan = Partial<Record<'wework' | 'user' | 'peer' | 'manager' | 'self', number>> & { proposedAmount?: number };

export interface PersonPlan {
  /** Ngày được chấm công (giờ Việt Nam), mọi tháng, theo thứ tự ngày. Ngày không có ở đây thì không chấm. */
  days: PunchDay[];
  leaves: LeavePlan[];
  overtime: OvertimePlan[];
  explanations: ExplanationPlan[];
  /** Tạm ứng đã duyệt của tháng `month`. Số tiền do server tính (80% lương các ngày công 01–15), seed không gửi. */
  advance?: { month: string };
  /** Điểm và mức đề xuất KPI theo tháng. */
  kpi: Record<string, KpiPlan>;
  /** Các tháng có phiếu được Admin duyệt trong seed. */
  approve: string[];
  /** Ngày nghỉ việc (seed ghi qua PUT /employees sau khi chấm công). */
  resignOn?: string;
  /** Ngày đặc biệt để test tìm lại (ví dụ lateUnexplained). */
  marks: Record<string, string>;
}

export interface PlanMonths {
  today: string;
  m0: string;
  m1: string;
  m2: string;
}

const pad = (n: number) => String(n).padStart(2, '0');
const lastDay = (ym: string) => new Date(Date.UTC(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)), 0)).getUTCDate();
const dow = (date: string) => new Date(`${date}T00:00:00Z`).getUTCDay();
export const addDays = (date: string, n: number) =>
  new Date(Date.parse(`${date}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
const monthDates = (ym: string) => Array.from({ length: lastDay(ym) }, (_, i) => `${ym}-${pad(i + 1)}`);

/** Ngày làm việc theo tuần của loại: tts thứ Hai – thứ Sáu, nv/ctv thứ Hai – thứ Bảy; bỏ ngày lễ của công ty. */
export function isWorkDay(type: string, date: string, holidays: ReadonlySet<string>): boolean {
  const d = dow(date);
  if (d === 0 || holidays.has(date)) return false;
  return !(type === 'tts' && d === 6);
}

/** Ngày đầu tiên trong tháng có thứ `weekday` (0 = CN), từ ngày `fromDay`, là ngày làm việc. */
export function firstOn(ym: string, weekday: number, fromDay: number, type: string, holidays: ReadonlySet<string>): string {
  for (const date of monthDates(ym).slice(fromDay - 1)) if (dow(date) === weekday && isWorkDay(type, date, holidays)) return date;
  throw new Error(`Tháng ${ym} không có thứ ${weekday} từ ngày ${fromDay}`);
}

/** Ngày vào làm theo `start` của người đó. */
export function startDateOf(p: DemoPerson, m: PlanMonths): string {
  const [y, mo] = m.m0.split('-').map(Number);
  const ym = new Date(Date.UTC(y, mo - 1 + p.start.monthOffset, 1)).toISOString().slice(0, 7);
  return `${ym}-${pad(p.start.day)}`;
}

/** Kế hoạch của mọi người `lg-`: ngày lấy từ các tháng của DB demo và lịch lễ đang có, không viết cứng. */
export function payrollPlan(m: PlanMonths, holidays: ReadonlySet<string> = new Set()): Record<string, PersonPlan> {
  const yesterday = addDays(m.today, -1);
  const out: Record<string, PersonPlan> = {};
  for (const p of PAYROLL) {
    const type = p.contract.position.type;
    const start = startDateOf(p, m);
    const plan: PersonPlan = { days: [], leaves: [], overtime: [], explanations: [], kpi: {}, approve: [], marks: {} };
    const skip = new Set<string>();
    const special = new Map<string, PunchDay>();
    const on = (weekday: number, fromDay: number) => firstOn(m.m1, weekday, fromDay, type, holidays);
    const shift = (p.contract as { shift: { startTime: string; endTime: string } }).shift;

    if (p.username === 'lg-an') {
      plan.kpi[m.m1] = { wework: 80, user: 90, peer: 70, manager: 100, self: 60, proposedAmount: 6_000_000 };
      plan.kpi[m.m2] = { wework: 100, user: 100, peer: 100, manager: 100, self: 100, proposedAmount: 6_000_000 };
      plan.approve = [m.m2, m.m1];
    }
    if (p.username === 'lg-binh') {
      const lateExplained = on(1, 8);
      const lateUnexplained = on(3, 8);
      const absent = on(5, 8);
      const missingOut = on(1, 15);
      plan.marks = { lateExplained, lateUnexplained, absent, missingOut };
      special.set(lateExplained, { date: lateExplained, in: '08:40', out: '17:00' });
      special.set(lateUnexplained, { date: lateUnexplained, in: '08:40', out: '17:00' });
      special.set(missingOut, { date: missingOut, in: '08:00', out: null });
      skip.add(absent);
      plan.explanations = [
        { date: lateExplained, cases: ['LATE_CHECK_IN'] },
        { date: missingOut, cases: ['MISSING_CHECK_OUT'], actualCheckOut: '17:00' }
      ];
      plan.kpi[m.m1] = { wework: 70, user: 70, peer: 70, manager: 70, self: 70, proposedAmount: 5_000_000 };
    }
    if (p.username === 'lg-chi') {
      const annual = on(1, 8);
      const unpaid = on(4, 8);
      const ot = on(2, 15);
      plan.marks = { annualFrom: annual, annualTo: addDays(annual, 1), unpaid, ot };
      plan.leaves = [
        { leaveType: 'ANNUAL', from: annual, to: addDays(annual, 1) },
        { leaveType: 'UNPAID', from: unpaid, to: unpaid }
      ];
      for (const d of [annual, addDays(annual, 1), unpaid]) skip.add(d);
      plan.overtime = [{ date: ot, start: '18:00', end: '20:00' }];
      special.set(ot, { date: ot, in: '08:00', out: '20:00' });
      plan.kpi[m.m1] = { wework: 90, user: 80, peer: 85, manager: 75, self: 95, proposedAmount: 7_000_000 };
    }
    if (p.username === 'lg-dung') {
      plan.kpi[m.m1] = { wework: 100, user: 100, peer: 100, manager: 100, self: 100, proposedAmount: 7_500_000 };
      plan.approve = [m.m1];
    }
    if (p.username === 'lg-em') plan.kpi[m.m1] = { wework: 80, user: 70, proposedAmount: 3_000_000 };
    if (p.username === 'lg-giang') {
      const ot = on(6, 8);
      plan.marks = { ot };
      plan.overtime = [{ date: ot, start: '18:00', end: '20:00' }];
      special.set(ot, { date: ot, in: '08:00', out: '20:00' });
      plan.kpi[m.m1] = { wework: 90, user: 90, peer: 90, manager: 90, self: 90 };
    }
    if (p.username === 'lg-khanh') plan.approve = [m.m1];
    if (p.username === 'lg-lan') {
      plan.kpi[m.m1] = { wework: 100, user: 100, peer: 100, manager: 100, self: 100, proposedAmount: 3_000_000 };
    }
    if (p.username === 'lg-minh') plan.resignOn = `${m.m1}-16`;
    if (p.username === 'lg-nam') {
      plan.kpi[m.m1] = { wework: 80, user: 80, peer: 80, manager: 80, self: 80, proposedAmount: 6_000_000 };
    }

    const end = plan.resignOn && plan.resignOn < yesterday ? plan.resignOn : yesterday;
    for (const ym of [m.m2, m.m1, m.m0]) {
      for (const date of monthDates(ym)) {
        if (date < start || date > end || skip.has(date) || !isWorkDay(type, date, holidays)) continue;
        plan.days.push(special.get(date) ?? { date, in: shift.startTime, out: shift.endTime });
      }
    }

    if (p.username === 'lg-chi') plan.advance = { month: m.m1 };
    out[p.username] = plan;
  }
  return out;
}

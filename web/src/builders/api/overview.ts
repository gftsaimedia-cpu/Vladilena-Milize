// Màn Tổng quan ghép từ các API có sẵn: bảng lương tháng (GET /payroll/:month), nhân sự (/employees), bảng công 7 ngày
// gần nhất (/attendance/timesheets), đơn đang chờ (chuông) và trạng thái kỳ (thanh kỳ lương). Không cần API riêng.
// BE chưa có số tháng trước và ngày trả lương: các ô so sánh bỏ trống, ngày trả là "—".
import type { InboxItem } from '../../mock/inbox';
import type { OverviewView } from '../../mock/overview';
import type { PayrollScreen } from '../../mock/payroll';
import { billions, vnd } from '../../utils/format';
import type { EmployeeDTO } from './staff';

export type OverviewTimesheet = { employeeId: string; workDate: string; actualCheckIn: string | null; status: string };

export type OverviewInput = {
  month: string;
  today: string;
  now: string;
  payroll: PayrollScreen;
  employees: EmployeeDTO[];
  timesheets: OverviewTimesheet[];
  approvals: InboxItem[];
  periodState: string;
};

const NONE = '—';
const DOW_SHORT = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
const pad = (n: number) => String(n).padStart(2, '0');
const addDays = (iso: string, n: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
const dowOf = (iso: string) => new Date(`${iso}T00:00:00Z`).getUTCDay();
const ddmm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

/** Sáu ngày làm việc gần nhất tới hôm nay (bỏ Chủ nhật), cũ trước. */
export function recentWorkdays(today: string, count = 6): string[] {
  const out: string[] = [];
  for (let d = today; out.length < count; d = addDays(d, -1)) if (dowOf(d) !== 0) out.unshift(d);
  return out;
}

export function overviewFrom(input: OverviewInput): OverviewView {
  const { month, today, payroll, approvals } = input;
  const year = Number(month.slice(0, 4));
  const m = Number(month.slice(5, 7));
  const last = new Date(Date.UTC(year, m, 0)).getUTCDate();
  const monthEnd = `${month}-${pad(last)}`;
  const daysLeft = today.startsWith(month) ? Math.round((Date.parse(monthEnd) - Date.parse(today)) / 86400000) : 0;

  const active = input.employees.filter(e => e.contract.status !== 'nghiviec');
  const ids = new Set(active.flatMap(e => [e.profile.uuid, e.account.username]));
  const presentOn = (date: string) =>
    new Set(input.timesheets.filter(t => t.workDate === date && t.actualCheckIn && ids.has(t.employeeId)).map(t => t.employeeId)).size;
  const rate = (n: number) => (active.length ? Math.round((n / active.length) * 100) : 0);
  const presentToday = presentOn(today);

  const board = payroll.empty ? null : payroll;
  const totals = board?.totals ?? { gross: 0, net: 0, deductions: 0, netShare: 0 };
  const counts = board?.counts ?? { all: 0, done: 0, pending: 0, draft: 0, rejected: 0 };

  return {
    month,
    headline: { blocking: approvals.length, closeOn: `${last}/${pad(m)}`, daysLeft },
    kpis: [
      {
        key: 'payroll',
        label: `Quỹ lương tháng ${m}`,
        value: billions(totals.gross),
        unit: 'tỷ ₫',
        note: board ? `${counts.all} phiếu lương` : 'chưa tính lương',
        hero: true
      },
      { key: 'staff', label: 'Nhân sự đang làm', value: String(active.length), note: 'theo hồ sơ nhân sự' },
      {
        key: 'present',
        label: 'Có mặt hôm nay',
        value: String(presentToday),
        of: String(active.length),
        note: `${active.length - presentToday} người chưa chấm công vào`
      },
      { key: 'requests', label: 'Yêu cầu chờ duyệt', value: String(approvals.length), note: 'đang chờ bạn' }
    ],
    attendance: {
      todayRate: rate(presentToday),
      present: presentToday,
      total: active.length,
      days: recentWorkdays(today).map(d => ({
        dow: d === today ? 'Hôm nay' : DOW_SHORT[dowOf(d)],
        date: ddmm(d),
        rate: rate(presentOn(d)),
        today: d === today
      }))
    },
    period: {
      title: `Kỳ lương tháng ${m}`,
      statusLabel: input.periodState || NONE,
      range: `01/${pad(m)} – ${last}/${pad(m)}/${year}`,
      payday: NONE,
      net: `${billions(totals.net)} tỷ ₫`,
      deductions: `${billions(totals.deductions)} tỷ ₫`,
      netShare: totals.netShare,
      slips: { done: counts.done, pending: counts.pending, draft: counts.draft, rejected: counts.rejected, total: counts.all }
    },
    approvals,
    payroll: {
      title: `Bảng lương tháng ${m}`,
      updatedAt: input.now,
      total: counts.all,
      rows: (board?.lines ?? []).slice(0, 6).map(l => ({
        id: l.id,
        name: l.name,
        initials: l.initials,
        title: l.title,
        dept: l.dept,
        days: `${l.days} / ${l.standard}`,
        base: vnd(l.base),
        allowance: vnd(l.allowance),
        net: vnd(l.net),
        status: l.status
      }))
    }
  };
}

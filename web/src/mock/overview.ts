// Dữ liệu Tổng quan giả, đúng dạng màn cần. Cùng bộ số cho mọi tháng; chỉ các nhãn có tên tháng đổi theo `month`.
// Danh sách "Việc cần duyệt" lấy từ mock/inbox (các việc `decide`, dùng chung với chuông).
import { billions, vnd } from '@/utils/format';
import { MOCK_MONTH } from './clock';
import { pendingInbox, type InboxItem } from './inbox';
import { payrollView, type PayrollStatus } from './payroll';

export type { PayrollStatus } from './payroll';

export type PayrollRow = {
  id: string;
  name: string;
  initials: string;
  title: string;
  dept: string;
  days: string;
  base: string;
  allowance: string;
  net: string;
  status: PayrollStatus;
};

export type OverviewKpi = {
  key: 'payroll' | 'staff' | 'present' | 'requests';
  label: string;
  value: string;
  of?: string;
  unit?: string;
  delta?: { dir: 'up' | 'down'; text: string; good: boolean };
  note: string;
  hero?: boolean;
};

export type OverviewView = {
  month: string;
  headline: { blocking: number; closeOn: string; daysLeft: number };
  kpis: OverviewKpi[];
  attendance: {
    todayRate: number;
    present: number;
    total: number;
    days: { dow: string; date: string; rate: number; today: boolean }[];
  };
  period: {
    title: string;
    statusLabel: string;
    range: string;
    payday: string;
    net: string;
    deductions: string;
    netShare: number;
    slips: { done: number; pending: number; draft: number; rejected: number; total: number };
  };
  approvals: InboxItem[];
  payroll: { title: string; updatedAt: string; total: number; rows: PayrollRow[] };
};

const pad = (n: number) => String(n).padStart(2, '0');

export function overviewView(month: string): OverviewView {
  const year = Number(month.slice(0, 4));
  const m = Number(month.slice(5, 7));
  const mm = pad(m);
  const last = new Date(Date.UTC(year, m, 0)).getUTCDate();
  const nextYear = m === 12 ? year + 1 : year;
  const approvals = pendingInbox().filter(item => item.action === 'decide');
  const board = payrollView(MOCK_MONTH);
  if (board.empty) throw new Error('Bảng lương giả của tháng hiện tại phải có dữ liệu.');
  const { counts, totals } = board;

  return {
    month,
    headline: { blocking: 4, closeOn: `${last}/${mm}`, daysLeft: 3 },
    kpis: [
      {
        key: 'payroll',
        label: `Quỹ lương tháng ${m}`,
        value: billions(totals.gross),
        unit: 'tỷ ₫',
        delta: { dir: 'up', text: '3,2%', good: true },
        note: 'so với tháng trước',
        hero: true
      },
      {
        key: 'staff',
        label: 'Nhân sự đang làm',
        value: '128',
        delta: { dir: 'up', text: '4 người', good: true },
        note: 'so với tháng trước'
      },
      { key: 'present', label: 'Có mặt hôm nay', value: '113', of: '128', note: '15 người chưa chấm công vào' },
      {
        key: 'requests',
        label: 'Yêu cầu chờ duyệt',
        value: String(approvals.length),
        delta: { dir: 'down', text: '3', good: true },
        note: 'so với tháng trước'
      }
    ],
    attendance: {
      todayRate: 88,
      present: 113,
      total: 128,
      days: [
        { dow: 'T5', date: '22/10', rate: 94, today: false },
        { dow: 'T6', date: '23/10', rate: 91, today: false },
        { dow: 'T7', date: '24/10', rate: 78, today: false },
        { dow: 'T2', date: '26/10', rate: 96, today: false },
        { dow: 'T3', date: '27/10', rate: 93, today: false },
        { dow: 'Hôm nay', date: '28/10', rate: 88, today: true }
      ]
    },
    period: {
      title: `Kỳ lương tháng ${m}`,
      statusLabel: 'Chờ duyệt',
      range: `01/${mm} – ${last}/${mm}/${year}`,
      payday: `05/${pad(m === 12 ? 1 : m + 1)}/${nextYear}`,
      net: `${billions(totals.net)} tỷ ₫`,
      deductions: `${billions(totals.deductions)} tỷ ₫`,
      netShare: totals.netShare,
      slips: {
        done: counts.done,
        pending: counts.pending,
        draft: counts.draft,
        rejected: counts.rejected,
        total: counts.all
      }
    },
    approvals,
    payroll: {
      title: `Bảng lương tháng ${m}`,
      updatedAt: '09:40',
      total: counts.all,
      rows: board.lines.slice(0, 6).map(l => ({
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

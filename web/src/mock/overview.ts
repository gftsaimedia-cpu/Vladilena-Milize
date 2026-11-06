// Dữ liệu Tổng quan giả: CÙNG dạng với GET /api/v2/overview (OverviewDTO, khoá đúng web/tests/fixtures/api/overview.json),
// chỉ là số giả. Cùng bộ số cho mọi tháng; ngày kỳ và nhãn đổi theo `month`. Máy chủ giả tính hết, builders/api/overview.ts chỉ ánh xạ.
// Danh sách "Việc cần duyệt" lấy từ mock/inbox (dùng chung với chuông); mock trả đủ danh sách, máy chủ thật chỉ trả 8 việc đầu.
import { INBOX_GROUPS } from '@/constants/labels';
import { MOCK_MONTH, MOCK_TODAY } from './clock';
import { pendingInbox, type InboxItem } from './inbox';
import type { PersonStatus } from '../components/staff-scope/staffScope';
import { payrollView, type PayrollStatus } from './payroll';

export type { PayrollStatus } from './payroll';

// dept, ps: cho cặp bộ lọc nhân sự của thẻ (06/11). Máy chủ thật chưa trả hai trường này (bộ lọc phòng ban khoá, ai cũng coi là
// đang làm chính thức); dữ liệu giả gắn ở services/admin-main.ts.
export type PayrollRow = {
  id: string;
  name: string;
  initials: string;
  title: string | null;
  days: string;
  base: string;
  allowance: string;
  net: string;
  status: PayrollStatus;
  dept?: string;
  ps?: PersonStatus;
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

export type ApprovalGroup = { key: string; label: string; count: number };

/** Dạng màn cần (builders/api/overview.ts ánh xạ từ OverviewDTO). */
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
  approvals: { total: number; groups: ApprovalGroup[]; items: InboxItem[] };
  payroll: { title: string; updatedAt: string; total: number; rows: PayrollRow[] };
};

/** Phản hồi GET /api/v2/overview (BE tính hết). */
export type OverviewDTO = {
  today: string;
  month: string;
  kpis: {
    headcount: number;
    presentToday: number;
    notCheckedIn: number;
    pendingRequests: number;
    payrollNet: number;
    payrollGross: number;
  };
  headline: { blocking: number; closeOn: string; daysLeft: number };
  attendance: {
    today: Record<'work' | 'late' | 'leave' | 'absent' | 'todo' | 'off' | 'future' | 'outside' | 'extra', number>;
    notCheckedIn: number;
    present: number;
    total: number;
    todayRate: number;
    days: { date: string; dow: string; dm: string; today: boolean; present: number; total: number; rate: number }[];
  };
  payroll: {
    status: string;
    lines: { username: string; name: string; net: number; status: PayrollStatus }[];
    rows: {
      username: string;
      name: string;
      initials: string;
      title: string | null;
      actualDays: number;
      standardDays: number;
      base: number;
      allowance: number;
      net: number;
      status: PayrollStatus;
    }[];
    total: number;
    updatedAt: string;
    gross: number;
    insurance: number;
    tax: number;
    advance: number;
    deductions: number;
    net: number;
    netShare: number;
    counts: { all: number; done: number; pending: number; draft: number; rejected: number };
    previous: { gross: number; net: number; grossDeltaPct: number } | null;
  };
  period: {
    month: string;
    state: string;
    label: string;
    from: string;
    to: string;
    closeOn: string;
    payday: string;
    daysLeft: number;
  };
  approvals: {
    total: number;
    decide: number;
    remind: number;
    groups: ApprovalGroup[];
    items: {
      id: string;
      kind: string;
      group: InboxItem['group'];
      groupLabel: string;
      action: 'decide' | 'remind';
      username: string;
      name: string;
      initials: string;
      title: string | null;
      what: string;
      when: string;
      days: string[];
      age: string;
    }[];
  };
};

const pad = (n: number) => String(n).padStart(2, '0');
const KIND: Record<InboxItem['group'], string> = { att: 'explanation-due', leave: 'leave', ot: 'overtime', exp: 'explanation', adv: 'advance' };

// Năm ngày làm việc trước hôm nay (bỏ Chủ nhật) cộng hôm nay.
const DAYS: [string, string, number][] = [
  ['2026-10-22', 'T5', 94],
  ['2026-10-23', 'T6', 91],
  ['2026-10-24', 'T7', 78],
  ['2026-10-26', 'T2', 96],
  ['2026-10-27', 'T3', 93],
  [MOCK_TODAY, 'Hôm nay', 88]
];

export function overviewDto(month: string): OverviewDTO {
  const year = Number(month.slice(0, 4));
  const m = Number(month.slice(5, 7));
  const last = new Date(Date.UTC(year, m, 0)).getUTCDate();
  const nextYear = m === 12 ? year + 1 : year;
  const items = pendingInbox();
  const decide = items.filter(i => i.action === 'decide').length;
  const board = payrollView(MOCK_MONTH);
  if (board.empty) throw new Error('Bảng lương giả của tháng hiện tại phải có dữ liệu.');
  const { counts, totals } = board;

  return {
    today: MOCK_TODAY,
    month,
    kpis: {
      headcount: 128,
      presentToday: 113,
      notCheckedIn: 15,
      pendingRequests: decide,
      payrollNet: totals.net,
      payrollGross: totals.gross
    },
    headline: { blocking: items.length, closeOn: `${month}-${last}`, daysLeft: 3 },
    attendance: {
      today: { work: 105, late: 8, leave: 0, absent: 0, todo: 0, off: 0, future: 0, outside: 0, extra: 0 },
      notCheckedIn: 15,
      present: 113,
      total: 128,
      todayRate: 88,
      days: DAYS.map(([date, dow, rate]) => ({
        date,
        dow,
        dm: `${date.slice(8, 10)}/${date.slice(5, 7)}`,
        today: date === MOCK_TODAY,
        present: Math.round((128 * rate) / 100),
        total: 128,
        rate
      }))
    },
    payroll: {
      status: 'calculated',
      lines: [...board.lines]
        .sort((a, b) => b.net - a.net)
        .slice(0, 5)
        .map(l => ({ username: l.id, name: l.name, net: l.net, status: l.status })),
      rows: board.lines.slice(0, 6).map(l => ({
        username: l.id,
        name: l.name,
        initials: l.initials,
        title: l.title,
        actualDays: l.days,
        standardDays: l.standard,
        base: l.base,
        allowance: l.allowance,
        net: l.net,
        status: l.status
      })),
      total: counts.all,
      updatedAt: '09:40',
      gross: totals.gross,
      insurance: totals.insurance,
      tax: totals.tax,
      advance: totals.advance,
      deductions: totals.deductions,
      net: totals.net,
      netShare: totals.netShare,
      counts,
      previous: { gross: Math.round(totals.gross / 1.032), net: Math.round(totals.net / 1.032), grossDeltaPct: 3.2 }
    },
    period: {
      month,
      state: 'calculated',
      label: 'Chờ duyệt',
      from: `${month}-01`,
      to: `${month}-${last}`,
      closeOn: `${month}-${last}`,
      payday: `${nextYear}-${pad(m === 12 ? 1 : m + 1)}-05`,
      daysLeft: 3
    },
    approvals: {
      total: items.length,
      decide,
      remind: items.length - decide,
      groups: INBOX_GROUPS.map(g => ({ key: g.key, label: g.label, count: items.filter(i => i.group === g.key).length })).filter(
        g => g.count
      ),
      items: items.map(i => ({
        id: i.id,
        kind: KIND[i.group],
        group: i.group,
        groupLabel: i.groupLabel,
        action: i.action,
        username: i.personId,
        name: i.name,
        initials: i.initials,
        title: i.role,
        what: i.what,
        when: i.when,
        days: i.days,
        age: i.age
      }))
    }
  };
}

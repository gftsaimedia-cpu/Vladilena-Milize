// Dữ liệu Tổng quan giả, đúng dạng màn cần. Cùng bộ số cho mọi tháng; chỉ các nhãn có tên tháng đổi theo `month`.
// Danh sách "Việc cần duyệt" lấy từ mock/inbox (các việc `decide`, dùng chung với chuông).
import { initials } from '@/utils/format';
import { pendingInbox, type InboxItem } from './inbox';

export type PayrollStatus = 'draft' | 'pending' | 'done' | 'rejected';

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

// [họ tên, chức danh, phòng ban, ngày công, lương cơ bản, phụ cấp, thực nhận, trạng thái]
const ROWS: [string, string, string, string, string, string, string, PayrollStatus][] = [
  ['Nguyễn Thu Hà', 'Kế toán tổng hợp', 'Tài chính', '22 / 22', '16.000.000', '1.800.000', '15.932.000', 'done'],
  ['Trần Minh Quân', 'Kỹ sư phần mềm', 'Kỹ thuật', '22 / 22', '24.000.000', '2.500.000', '22.785.000', 'done'],
  ['Lê Hoàng Nam', 'Nhân viên kinh doanh', 'Kinh doanh', '20 / 22', '12.000.000', '3.200.000', '12.757.000', 'pending'],
  ['Phạm Ngọc Anh', 'Chuyên viên nhân sự', 'Nhân sự', '22 / 22', '14.000.000', '1.500.000', '13.878.000', 'pending'],
  ['Võ Đức Thịnh', 'Trưởng nhóm QA', 'Kỹ thuật', '21 / 22', '20.000.000', '2.000.000', '18.441.000', 'draft'],
  ['Đỗ Mai Linh', 'Thiết kế đồ hoạ', 'Marketing', '19 / 22', '13.000.000', '1.200.000', '11.059.000', 'rejected']
];

export function overviewView(month: string): OverviewView {
  const year = Number(month.slice(0, 4));
  const m = Number(month.slice(5, 7));
  const mm = pad(m);
  const last = new Date(Date.UTC(year, m, 0)).getUTCDate();
  const nextYear = m === 12 ? year + 1 : year;
  const approvals = pendingInbox().filter(item => item.action === 'decide');

  return {
    month,
    headline: { blocking: 4, closeOn: `${last}/${mm}`, daysLeft: 3 },
    kpis: [
      {
        key: 'payroll',
        label: `Quỹ lương tháng ${m}`,
        value: '2,48',
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
      net: '2,11 tỷ ₫',
      deductions: '0,37 tỷ ₫',
      netShare: 85,
      slips: { done: 86, pending: 29, draft: 12, rejected: 1, total: 128 }
    },
    approvals,
    payroll: {
      title: `Bảng lương tháng ${m}`,
      updatedAt: '09:40',
      total: 128,
      rows: ROWS.map(([name, title, dept, days, base, allowance, net, status], i) => ({
        id: `pr-${pad(i + 1)}`,
        name,
        initials: initials(name),
        title,
        dept,
        days,
        base,
        allowance,
        net,
        status
      }))
    }
  };
}

// Màn Tổng quan: GET /api/v2/overview?month=&days= (BE tính hết). Builder này CHỈ ÁNH XẠ DTO sang dữ liệu view
// (đổi ngày ISO sang dd/mm, số sang chữ tiền theo đơn vị tỷ / triệu / đồng, ghép nhãn); không đếm, không cộng, không tính tỉ lệ.
// Việc cần duyệt: danh sách và số đếm từ `approvals`; head / sub / facts của cửa sổ duyệt là chi tiết lấy từ GET /requests
// (service truyền vào `details`, khớp theo id); không có thì head = loại việc, sub = ngày.
import type { InboxItem } from '../../mock/inbox';
import type { OverviewDTO, OverviewView } from '../../mock/overview';
import { dm, dmy, money, moneyText, monthNo, vnd } from '../../utils/format';

const pct = (n: number) => `${Math.abs(n).toFixed(1).replace('.', ',')}%`;

function approvalOf(a: OverviewDTO['approvals']['items'][number], detail?: InboxItem): InboxItem {
  const own: InboxItem = {
    id: a.id,
    group: a.group,
    groupLabel: a.groupLabel,
    action: a.action,
    personId: a.username,
    name: a.name,
    initials: a.initials,
    role: a.title || '—',
    what: a.what,
    when: a.when,
    age: a.age,
    head: a.what,
    sub: '',
    facts: [],
    days: a.days
  };
  return detail ? { ...detail, ...own, head: detail.head, sub: detail.sub, facts: detail.facts } : own;
}

export function overviewFrom(dto: OverviewDTO, details: Map<string, InboxItem> = new Map()): OverviewView {
  const { kpis, payroll, period, attendance, approvals } = dto;
  const m = monthNo(dto.month);
  const prev = payroll.previous;

  return {
    month: dto.month,
    headline: { blocking: dto.headline.blocking, closeOn: dm(dto.headline.closeOn), daysLeft: dto.headline.daysLeft },
    kpis: [
      {
        key: 'payroll',
        label: `Quỹ lương tháng ${m}`,
        ...money(kpis.payrollGross),
        ...(prev
          ? { delta: { dir: prev.grossDeltaPct < 0 ? ('down' as const) : ('up' as const), text: pct(prev.grossDeltaPct), good: true } }
          : {}),
        note: prev ? 'so với tháng trước' : payroll.total ? `${payroll.counts.all} phiếu lương` : 'chưa tính lương',
        hero: true
      },
      { key: 'staff', label: 'Nhân sự đang làm', value: String(kpis.headcount), note: 'theo hồ sơ nhân sự' },
      {
        key: 'present',
        label: 'Có mặt hôm nay',
        value: String(kpis.presentToday),
        of: String(kpis.headcount),
        note: `${kpis.notCheckedIn} người chưa chấm công vào`
      },
      { key: 'requests', label: 'Yêu cầu chờ duyệt', value: String(kpis.pendingRequests), note: 'đang chờ bạn' }
    ],
    attendance: {
      todayRate: attendance.todayRate,
      present: attendance.present,
      total: attendance.total,
      days: attendance.days.map(d => ({ dow: d.dow, date: d.dm, rate: d.rate, today: d.today }))
    },
    period: {
      title: `Kỳ lương tháng ${m}`,
      statusLabel: period.label,
      range: `${dm(period.from)} – ${dmy(period.to)}`,
      payday: dmy(period.payday),
      net: moneyText(payroll.net),
      deductions: moneyText(payroll.deductions),
      netShare: payroll.netShare,
      slips: {
        done: payroll.counts.done,
        pending: payroll.counts.pending,
        draft: payroll.counts.draft,
        rejected: payroll.counts.rejected,
        total: payroll.counts.all
      }
    },
    approvals: {
      total: approvals.total,
      groups: approvals.groups,
      items: approvals.items.map(a => approvalOf(a, details.get(a.id)))
    },
    payroll: {
      title: `Bảng lương tháng ${m}`,
      updatedAt: payroll.updatedAt,
      total: payroll.total,
      rows: payroll.rows.map(r => ({
        id: r.username,
        name: r.name,
        initials: r.initials,
        title: r.title,
        days: `${r.actualDays} / ${r.standardDays}`,
        base: vnd(r.base),
        allowance: vnd(r.allowance),
        net: vnd(r.net),
        status: r.status
      }))
    }
  };
}

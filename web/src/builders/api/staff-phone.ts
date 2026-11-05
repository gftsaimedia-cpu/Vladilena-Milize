// App nhân viên (/nv/*) từ nhóm "của tôi" GET /api/v2/me/*: dựng đúng các kiểu màn của mock/staff-phone.
// Tiền, ngày, giờ do BE trả; ở đây chỉ định dạng và gắn nhãn. Import tương đối để chạy được bằng node:test.
import type {
  AttendanceView,
  CalendarCell,
  CellKind,
  DayDetail,
  DayKind,
  HomeView,
  IncomeView,
  ProfileView,
  RequestDetail,
  RequestRowData,
  RequestStatus,
  RequestsView
} from '../../mock/staff-phone';
import { dmy, initials, vnd } from '../../utils/format';
import type { RequestDTO } from './inbox';

export type MeDay = { date: string; kind: CellKind; in: string | null; out: string | null; lateMinutes: number };
export type MeMonth = { month: string; totals: { workDays: number; standardDays: number; lateCount: number; paidLeaveDays: number }; days: MeDay[] };
export type MeToday = {
  date: string;
  shift: { type: string; start: string; end: string } | null;
  punches: { in: string | null; out: string | null };
  workedMinutes: number;
  week: MeDay[];
  alert: { date: string; kind: string } | null;
};
export type MeProfile = {
  name: string;
  username: string;
  dependants: number;
  contract: { status: string; term: string | null; effectiveFrom: string | null };
  position: { type: string; level: number; jobTitle: string | null };
  shift: { type: string; startTime: string; endTime: string };
  leave: { totalDays: number; usedDays: number; remainingDays: number };
};
export type MeIncome = { month: string; state: 'official' | 'estimate' | 'unavailable'; payslip: any | null; reason?: string };
export type MeStep = { label: string; at: string | null; state: RequestStatus };
export type MeRequest = RequestDTO & { reviewedAt?: string | null };

const NONE = '—';
const DOW_LONG = ['Chủ nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];
const DOW_SHORT = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
const LEAVE_LABEL: Record<string, string> = {
  ANNUAL: 'Phép năm',
  PERSONAL_PAID: 'Việc riêng có lương',
  PERSONAL_UNPAID: 'Việc riêng không lương',
  SOCIAL_INSURANCE: 'Chế độ BHXH',
  WELFARE: 'Phúc lợi nội bộ',
  UNPAID: 'Không lương'
};
const CONTRACT_LABEL: Record<string, string> = { nv: 'Chính thức', thuviec: 'Thử việc', tts: 'Thực tập', ctv: 'Cộng tác viên', nghiviec: 'Đã nghỉ việc' };
const KIND_TEXT: Record<CellKind, string> = {
  work: 'đi làm',
  late: 'đi muộn',
  leave: 'nghỉ có lương',
  absent: 'vắng',
  todo: 'cần xử lý',
  future: 'chưa tới',
  off: 'không có ca'
};
const DAY_STATUS: Record<DayKind, string> = { work: 'Đi làm', late: 'Đi muộn', leave: 'Nghỉ có lương', absent: 'Vắng', todo: 'Cần xử lý' };

const dowOf = (iso: string) => new Date(`${iso}T00:00:00Z`).getUTCDay();
const ddmm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
const lower = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);
const toMin = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
const monthLabelOf = (ym: string) => `Tháng ${Number(ym.slice(5, 7))}/${ym.slice(0, 4)}`;
// Thời điểm ISO → 'dd/mm HH:mm' giờ Việt Nam.
const vnStamp = (iso: string | null) => {
  if (!iso) return null;
  const t = new Date(Date.parse(iso) + 7 * 3600000).toISOString();
  return `${t.slice(8, 10)}/${t.slice(5, 7)} ${t.slice(11, 16)}`;
};
const quote = (s: string | null | undefined) => `“${String(s || '').trim()}”`;
const shiftText = (type: string, start: string, end: string) => `${type === 'NORMAL' ? 'HC' : type} ${start}–${end}`;

export const workedText = (min: number) => `${Math.floor(min / 60)}g ${min % 60}p`;

function cellOf(d: MeDay, today: string, padDay: boolean): CalendarCell {
  const isToday = d.date === today;
  const live = isToday && !!d.in && !d.out;
  const text = live ? 'đang làm' : KIND_TEXT[d.kind];
  const dow = dowOf(d.date);
  return {
    date: d.date,
    day: padDay ? d.date.slice(8, 10) : String(Number(d.date.slice(8, 10))),
    dow: DOW_SHORT[dow],
    kind: d.kind,
    today: isToday,
    label: isToday ? `Hôm nay, ${lower(DOW_LONG[dow])} ${ddmm(d.date)}: ${text}` : `${DOW_LONG[dow]} ${ddmm(d.date)}: ${text}`,
    open: d.kind !== 'off' && d.kind !== 'future'
  };
}

// ---------- Đơn từ ----------
const STATUS: Record<string, [RequestStatus, string]> = {
  PENDING: ['pend', 'Chờ duyệt'],
  APPROVED: ['done', 'Đã duyệt'],
  REJECTED: ['rej', 'Từ chối'],
  CANCELLED: ['rej', 'Đã huỷ']
};

function kindOf(r: MeRequest): { icon: RequestRowData['icon']; kindLabel: string; title: string; date: string } {
  switch (r.type) {
    case 'LEAVE':
    case 'LEAVE_WITH_MAKEUP': {
      const label = LEAVE_LABEL[r.leaveType || ''] || 'Nghỉ';
      const date = r.leaveStartDate || r.createdAt.slice(0, 10);
      return { icon: 'leave', kindLabel: 'Đơn nghỉ', title: `${label} ${ddmm(date)}`, date };
    }
    case 'ISAT': {
      const date = r.isat?.saturday || r.createdAt.slice(0, 10);
      return { icon: 'leave', kindLabel: 'Nghỉ Thứ Bảy (iSAT)', title: `iSAT ${ddmm(date)}`, date };
    }
    case 'ADVANCE': {
      const date = r.advancePeriod ? `${r.advancePeriod}-01` : r.createdAt.slice(0, 10);
      return { icon: 'coin', kindLabel: 'Tạm ứng lương', title: `Tạm ứng ${vnd(r.advanceAmount ?? 0)} ₫`, date };
    }
    case 'OVERTIME': {
      const date = r.otDate || r.createdAt.slice(0, 10);
      return { icon: 'clock', kindLabel: 'Làm thêm', title: `Làm thêm ${ddmm(date)}`, date };
    }
    case 'SHIFT_CHANGE': {
      const date = r.changeStartDate || r.createdAt.slice(0, 10);
      return { icon: 'clock', kindLabel: 'Đổi ca', title: `Đổi ca ${ddmm(date)}`, date };
    }
    default: {
      const date = r.explanationDate || r.createdAt.slice(0, 10);
      return { icon: 'clock', kindLabel: 'Giải trình', title: `Giải trình ${ddmm(date)}`, date };
    }
  }
}

export function requestRowOf(r: MeRequest): RequestRowData {
  const k = kindOf(r);
  const [status, statusText] = STATUS[r.status] ?? STATUS.PENDING;
  return { id: r.id, icon: k.icon, title: k.title, status, statusText, month: k.date.slice(0, 7) };
}

function factsOf(r: MeRequest): [string, string][] {
  switch (r.type) {
    case 'LEAVE':
    case 'LEAVE_WITH_MAKEUP':
      return [
        ['Ngày nghỉ', r.leaveStartDate === r.leaveEndDate || !r.leaveEndDate ? dmy(r.leaveStartDate || '') : `${dmy(r.leaveStartDate || '')} – ${dmy(r.leaveEndDate)}`],
        ['Số ngày', String(r.leaveDaysCount ?? '')],
        ['Hình thức', LEAVE_LABEL[r.leaveType || ''] || NONE],
        ['Lý do', quote(r.reason)]
      ];
    case 'ADVANCE':
      return [
        ['Số tiền', `${vnd(r.advanceAmount ?? 0)} ₫`],
        ['Trừ vào lương', r.advancePeriod ? monthLabelOf(r.advancePeriod) : NONE]
      ];
    case 'OVERTIME':
      return [['Ngày', dmy(r.otDate || '')], ['Khung giờ', `${r.otStartTime || '?'}–${r.otEndTime || '?'}`], ['Lý do', quote(r.reason)]];
    case 'EXPLANATION':
      return [
        ['Ngày', dmy(r.explanationDate || '')],
        ...(r.actualCheckIn ? [['Giờ vào khai', r.actualCheckIn] as [string, string]] : []),
        ...(r.actualCheckOut ? [['Giờ ra khai', r.actualCheckOut] as [string, string]] : []),
        ['Lý do', quote(r.reason)]
      ];
    default:
      return [['Lý do', quote(r.reason)]];
  }
}

export function requestDetailOf(r: MeRequest, steps: MeStep[]): RequestDetail {
  return {
    ...requestRowOf(r),
    kindLabel: kindOf(r).kindLabel,
    facts: factsOf(r),
    steps: steps.map(s => ({ label: s.label, at: vnStamp(s.at), state: s.state }))
  };
}

export function requestsViewOf(items: MeRequest[]): RequestsView {
  const rows = items.map(requestRowOf);
  const count = (s: RequestStatus) => rows.filter(r => r.status === s).length;
  const groups: RequestsView['groups'] = [];
  for (const row of [...rows].sort((a, b) => b.month.localeCompare(a.month))) {
    let group = groups.find(g => g.month === row.month);
    if (!group) groups.push((group = { month: row.month, label: `Tháng ${Number(row.month.slice(5, 7))}`, rows: [] }));
    group.rows.push(row);
  }
  return { counts: { all: rows.length, pend: count('pend'), done: count('done'), rej: count('rej') }, groups };
}

// ---------- Chấm công ----------
export function attendanceViewOf(m: MeMonth, shiftLine: string, today: string): AttendanceView {
  const first = `${m.month}-01`;
  const blanks: null[] = Array.from({ length: (dowOf(first) + 6) % 7 }, () => null);
  const recent = m.days
    .filter(d => d.in)
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 5)
    .map(d => ({
      date: d.date,
      kind: d.kind,
      day: `${DOW_LONG[dowOf(d.date)]} ${ddmm(d.date)}`,
      times: `${d.in} – ${d.out ?? (d.date === today ? '…' : '?')}`,
      statusText: d.date === today && !d.out ? 'Đang làm' : DAY_STATUS[d.kind as DayKind] ?? NONE
    }));
  return {
    label: monthLabelOf(m.month),
    state: 'Kỳ công đang mở',
    shiftLine: `Ca ${shiftLine} · thứ Hai – thứ Bảy`,
    tiles: [
      { value: String(m.totals.workDays), of: String(m.totals.standardDays), label: 'Ngày công' },
      { value: String(m.totals.lateCount), of: null, label: 'Lần đi muộn' },
      { value: String(m.totals.paidLeaveDays), of: null, label: 'Ngày nghỉ có lương' }
    ],
    cells: [...blanks, ...m.days.map(d => cellOf(d, today, false))],
    recent
  };
}

/** Hộp chi tiết một ngày; null khi ngày không có ca hoặc chưa tới. */
export function dayDetailOf(d: MeDay & { shift: { start: string; end: string } | null }, fallback: { start: string; end: string }, today: string, now: string): DayDetail | null {
  if (d.kind === 'off' || d.kind === 'future') return null;
  const shift = d.shift ?? fallback;
  const kind = d.kind as DayKind;
  return {
    date: d.date,
    title: `${DOW_LONG[dowOf(d.date)]} ${dmy(d.date)}`,
    shiftLine: `Ca ${shift.start}–${shift.end}`,
    kind,
    today: d.date === today,
    statusText: d.date === today && d.in && !d.out ? 'Đang làm' : DAY_STATUS[kind],
    shiftStart: shift.start,
    shiftEnd: shift.end,
    now,
    in: d.in,
    out: d.out,
    lateMin: d.lateMinutes,
    leave: kind === 'leave' ? { type: 'Nghỉ có lương', span: 'Cả ngày' } : null,
    claim: null
  };
}

// ---------- Hôm nay ----------
function greetingOf(now: string): string {
  const h = Number(now.slice(0, 2));
  if (h < 11) return 'Chào buổi sáng';
  if (h < 14) return 'Chào buổi trưa';
  if (h < 18) return 'Chào buổi chiều';
  return 'Chào buổi tối';
}

export function homeViewOf(t: MeToday, profile: MeProfile, income: MeIncome | null, requests: MeRequest[], now: string): HomeView {
  const start = t.shift?.start ?? profile.shift.startTime;
  const end = t.shift?.end ?? profile.shift.endTime;
  const checkIn = t.punches.in ?? '';
  const workedMin = checkIn ? Math.max(0, toMin(t.punches.out ?? now) - toMin(checkIn)) : 0;
  const days = t.week;
  return {
    greeting: greetingOf(now),
    name: profile.name,
    initials: initials(profile.name),
    weekday: DOW_LONG[dowOf(t.date)],
    date: dmy(t.date),
    shiftLabel: `Ca ${profile.shift.type === 'NORMAL' ? 'HC' : profile.shift.type} · ${start}–${end}`,
    shiftStart: start,
    shiftEnd: end,
    now,
    checkIn,
    checkOut: t.punches.out,
    workedMin,
    shiftMin: toMin(end) - toMin(start),
    worked: workedText(workedMin),
    location: checkIn ? 'Đã chấm công' : 'Chưa chấm công hôm nay',
    week: { range: `${ddmm(days[0].date)} – ${ddmm(days[6].date)}`, cells: days.map(d => cellOf(d, t.date, true)) },
    alert: t.alert ? { date: t.alert.date, text: `${ddmm(t.alert.date)} thiếu giờ vào/ra · cần giải trình` } : null,
    income: {
      label: `Thu nhập tháng ${Number(t.date.slice(5, 7))} · ${income?.state === 'official' ? 'chính thức' : 'tạm tính'}`,
      net: income?.payslip ? vnd(income.payslip.netIncome) : NONE
    },
    requests: [...requests]
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, 2)
      .map(requestRowOf)
  };
}

// ---------- Thu nhập ----------
const KPI_PARTS: [string, string][] = [
  ['wework', 'Wework'],
  ['user', 'Người dùng'],
  ['peer', 'Đồng nghiệp'],
  ['manager', 'Quản lý'],
  ['self', 'Tự đánh giá']
];

export function incomeViewOf(inc: MeIncome): IncomeView {
  const p = inc.payslip;
  const base = { title: 'Thu nhập', note: 'Phiếu chính thức có khi Admin duyệt', label: monthLabelOf(inc.month) };
  if (!p) {
    return {
      ...base,
      state: 'Chưa có',
      net: NONE,
      review: inc.reason || 'Chưa tính được thu nhập tháng này',
      gross: NONE,
      deduction: NONE,
      kpi: { title: `KPI tháng ${Number(inc.month.slice(5, 7))}`, parts: '5 phần', percent: NONE, ratio: 0, pay: NONE, proposed: NONE, scores: [] },
      lines: [],
      total: NONE
    };
  }
  const pct = Number(p.kpiTotalScorePct) || 0;
  const leavePay = (p.paidLeavePay || 0) + (p.isatPay || 0) + (p.holidayPay || 0);
  const line = (icon: IncomeView['lines'][number]['icon'], label: string, n: number, negative = false) => ({
    icon,
    label,
    value: n ? `${negative ? '−' : ''}${vnd(n)}` : '0',
    zero: !n
  });
  return {
    ...base,
    state: inc.state === 'official' ? 'Chính thức' : 'Tạm tính',
    net: vnd(p.netIncome),
    review: inc.state === 'official' ? 'Admin đã duyệt phiếu' : 'Số tạm tính, có thể đổi tới khi Admin duyệt',
    gross: vnd(p.grossIncome),
    deduction: vnd((p.insuranceDeduction || 0) + (p.personalIncomeTax || 0) + (p.advanceDeduction || 0)),
    kpi: {
      title: `KPI tháng ${Number(inc.month.slice(5, 7))}`,
      parts: '5 phần',
      percent: `${pct.toFixed(2).replace('.', ',')}%`,
      ratio: Math.round(pct * 100) / 10000,
      pay: vnd(p.kpiActualPay),
      proposed: vnd(p.kpiProposedAmount ?? p.kpiMaxSalary),
      scores: KPI_PARTS.map(([k, label]) => ({ value: p.kpiScores?.[k] == null ? NONE : String(p.kpiScores[k]), label }))
    },
    lines: [
      line('cal', 'Lương ngày công', p.baseSalaryActual),
      line('leave', 'Nghỉ phép, iSAT', leavePay),
      line('gift', 'Phụ cấp', p.totalAllowanceActual),
      line('target', 'Lương KPI', p.kpiActualPay),
      line('shield', 'Bảo hiểm bắt buộc', p.insuranceDeduction, true),
      line('coin', 'Thuế TNCN', p.personalIncomeTax, true)
    ],
    total: `${vnd(p.netIncome)} ₫`
  };
}

// ---------- Hồ sơ ----------
export function profileViewOf(p: MeProfile): ProfileView {
  const TYPE: Record<string, string> = { tts: 'TTS', ctv: 'CTV', nv: 'NV' };
  return {
    name: p.name,
    initials: initials(p.name),
    email: NONE,
    contract: CONTRACT_LABEL[p.contract.status] || NONE,
    facts: [
      ['Tên đăng nhập', p.username],
      ['Chức danh', p.position.jobTitle || NONE],
      ['Loại · bậc', `${TYPE[p.position.type] ?? p.position.type.toUpperCase()} · Bậc ${p.position.level}`],
      ['Ca làm', shiftText(p.shift.type, p.shift.startTime, p.shift.endTime)],
      ['Ngày vào làm', p.contract.effectiveFrom ? dmy(p.contract.effectiveFrom) : NONE],
      ['Phép năm còn lại', `${p.leave.remainingDays} ngày`]
    ],
    note: 'Thông tin do Admin quản lý. Thấy sai thì báo Admin để sửa.'
  };
}

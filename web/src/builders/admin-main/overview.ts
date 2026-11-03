// Dựng Tổng quan và bảng chuông của vỏ Admin từ phản hồi của máy chủ (hàm thuần: không đọc đồng hồ máy, không gọi mạng).
export const BELL_ROWS = 10;
export const APPROVAL_ROWS = 5;
const UPCOMING_HOLIDAYS = 2;

const pad = (n?) => String(n).padStart(2, '0');
const monthNo = (ym?) => Number(String(ym).slice(5, 7));
const lastDayOf = (ym?) => new Date(Date.UTC(Number(ym.slice(0, 4)), monthNo(ym), 0)).getUTCDate();
/** Ngày hôm nay (giờ Việt Nam) theo đồng hồ máy chủ trong GET /me. */
const todayOf = (serverNow?) => {
  const ms = Date.parse(serverNow);
  return new Date((Number.isFinite(ms) ? ms : Date.now()) + 7 * 3600000).toISOString().slice(0, 10);
};

const FORGOT_TEXT = { 'forgot-in': 'quên Check-in', 'forgot-out': 'quên Check-out' };

/** Bảng chuông: yêu cầu chờ duyệt mọi tháng, giải trình chờ xử lý (explanations: số, mọi tháng) và ngày quên Check-in/out của tháng. alerts: GET /alerts. */
export function buildBell({ month, alerts, explanations = 0 }: any) {
  const missing = [...((alerts && alerts.missingPunches) || [])].sort(
    (a: any, b: any) => a.date.localeCompare(b.date) || String(a.name).localeCompare(String(b.name))
  );
  const requests = (alerts && alerts.pendingApprovals) || 0;
  return {
    month,
    total: requests + explanations + missing.length,
    requests,
    explanations,
    forgotten: {
      count: missing.length,
      items: missing.slice(0, BELL_ROWS).map(m => ({
        date: m.date,
        text: `${m.name || m.username} · ${FORGOT_TEXT[m.kind] || m.kind}`
      }))
    }
  };
}

const TYPE_ORDER = ['tts', 'ctv', 'nv'];
/** Nhân sự đang làm việc: thuộc bảng lương và chưa khoá; ghi chú đếm theo loại. */
function staffFigures(staff?) {
  const active = (staff || []).filter(s => s.payrollSubject && !s.locked);
  const parts = TYPE_ORDER.map(t => [t.toUpperCase(), active.filter(s => s.type === t).length]).filter(
    ([, n]: any) => n
  );
  const unset = active.filter(s => !TYPE_ORDER.includes(s.type)).length;
  return {
    total: active.length,
    note: [...parts.map(([label, n]: any) => `${label} ${n}`), unset ? `${unset} chưa xếp loại` : '']
      .filter(Boolean)
      .join(' · '),
    noStart: active.filter(s => !s.startDate && s.type !== 'tts').length,
    noShift: active.filter(s => !s.shiftCode).length
  };
}

/** Mốc sắp tới: hết tháng công, ngày trả lương dự kiến và vài ngày lễ gần nhất kể từ hôm nay. */
function upcoming({ month, today, paydayExpected, holidays }: any) {
  const items = [{ date: `${month}-${pad(lastDayOf(month))}`, title: `Hết tháng công ${monthNo(month)}`, sub: '' }];
  if (paydayExpected) items.push({ date: paydayExpected, title: `Trả lương tháng ${monthNo(month)}`, sub: '' });
  for (const date of [...(holidays || [])]
    .filter(d => d >= today)
    .sort()
    .slice(0, UPCOMING_HOLIDAYS))
    items.push({ date, title: 'Ngày lễ', sub: '' });
  return items.filter(i => i.date >= today).sort((a: any, b: any) => a.date.localeCompare(b.date));
}

/**
 * Tổng quan. requests: yêu cầu chờ duyệt mọi tháng (đã dựng dòng); alerts: GET /alerts; staff: GET /staff;
 * explanations: số giải trình chờ Admin quyết của tháng; today: GET /today; period: GET /periods/:month; paydayExpected: ngày trả lương dự kiến của kỳ trong GET /periods; estimates: GET /periods/:month/estimates; holidays: GET /holidays.
 * Số tiền là số của máy chủ (totals của kỳ, hoặc của ước tính khi chưa có lần tính).
 */
export function buildOverview({
  month,
  serverNow,
  requests,
  explanations = 0,
  alerts,
  staff,
  today,
  period,
  paydayExpected,
  estimates,
  holidays
}: any) {
  const no = monthNo(month);
  const people = staffFigures(staff);
  const inMonth = requests.filter(r => r.month === month);
  const forgot = alerts && alerts.missingPunches ? alerts.missingPunches.length : 0;
  const absent = alerts && alerts.absentNoExplanation ? alerts.absentNoExplanation.length : 0;
  const open = today && today.rows ? today.rows.filter(r => r.open).length : 0;
  const rows = [
    {
      key: 'requests',
      blocking: true,
      count: inMonth.length,
      title: 'Yêu cầu chờ xử lý',
      sub: requests.length > inMonth.length ? `Còn ${requests.length - inMonth.length} yêu cầu của các tháng khác` : '',
      action: { label: 'Xử lý yêu cầu', to: '/admin/yeu-cau' }
    },
    {
      key: 'explanations',
      blocking: false,
      count: explanations,
      title: 'Giải trình chờ xử lý',
      sub: 'Ngày có giải trình chưa quyết thì chưa tính công',
      action: { label: 'Xử lý giải trình', to: '/admin/yeu-cau?nhom=giai-trinh' }
    },
    {
      key: 'forgot',
      blocking: true,
      count: forgot,
      title: 'Ngày quên Check-in/out chờ xử lý',
      sub: 'Sửa giờ, hoặc tick Bỏ qua khi chốt công',
      action: { label: 'Sửa giờ', to: '/admin/cham-cong?filter=pending' }
    },
    {
      key: 'absent',
      blocking: false,
      count: absent,
      title: 'Ngày vắng chưa có giải trình',
      sub: 'Mỗi ngày vắng được gắn cả cờ quên Check-in và quên Check-out',
      action: { label: 'Xem chấm công', to: '/admin/cham-cong' }
    },
    {
      key: 'start',
      blocking: true,
      count: people.noStart,
      title: 'Nhân sự thiếu ngày bắt đầu làm',
      sub: 'Chưa xác định được ngày công chuẩn',
      action: { label: 'Mở hồ sơ', to: '/admin/nhan-su?loc=thieu-ngay' }
    },
    {
      key: 'open',
      blocking: false,
      count: open,
      title: 'Lượt Check-in còn đang mở',
      sub: 'Tự đóng khi nhân sự Check-out, bạn không cần làm gì',
      action: { label: 'Xem hôm nay', to: '/admin/cham-cong/hom-nay' }
    },
    {
      key: 'noshift',
      blocking: false,
      count: people.noShift,
      title: 'Nhân sự chưa có ca cố định',
      sub: 'Không chặn chốt công, nhưng chưa tính được giờ làm',
      action: { label: 'Gán ca', to: '/admin/nhan-su?loc=chua-co-ca' }
    }
  ];

  const totals = (period && period.totals) || (estimates && estimates.totals) || null;
  const kept = (period && period.attendanceKept) || (estimates && estimates.attendanceKept) || null;
  const provisional = !period || !['approved', 'paid'].includes(period.status);
  const kpis: any[] = [];
  if (totals) {
    kpis.push({
      key: 'fund',
      label: `Quỹ lương tháng ${no}`,
      money: totals.gross,
      est: provisional,
      note: [`${totals.people} phiếu`, totals.error ? `${totals.error} phiếu chưa tính được` : '']
        .filter(Boolean)
        .join(' · ')
    });
    kpis.push({
      key: 'net',
      label: `Thực nhận tháng ${no}`,
      money: totals.net,
      est: provisional,
      note: 'Sau tạm ứng',
      noteMoney: totals.advance
    });
  }
  kpis.push({ key: 'staff', label: 'Nhân sự đang làm việc', value: people.total, note: people.note });
  if (kept)
    kpis.push({
      key: 'attend',
      label: 'Còn giữ phụ cấp chuyên cần',
      value: kept.kept,
      of: kept.of,
      note: `Trên ${kept.of} nhân viên (NV)`
    });

  const pStatus = (period && period.status) || 'open';
  const statusMap: Record<string, [string, string]> = {
    open: ['Đang chấm công', 'p-pend'],
    attendance_locked: ['Đã chốt công', 'p-pend'],
    calculated: ['Chờ duyệt', 'p-pend'],
    reviewed: ['Chờ duyệt', 'p-pend'],
    approved: ['Đã duyệt', 'p-done'],
    paid: ['Đã trả lương', 'p-done']
  };
  const [statusLabel, statusCls] = statusMap[pStatus] || ['Đang mở', 'p-draft'];
  const periodCard = {
    status: pStatus,
    statusLabel,
    statusCls,
    people: (totals && totals.people) || people.total || 0,
    approved: (totals && totals.approved) || 0,
    pending: (totals && totals.pending) || 0,
    draft: (totals && totals.draft) || 0,
    error: (totals && totals.error) || 0,
    paydayExpected: paydayExpected || null
  };

  return {
    month,
    blocking: rows.filter(r => r.blocking && r.count > 0).length,
    blockers: {
      cap: `Tháng công 01/${pad(no)} – ${lastDayOf(month)}/${pad(no)}`,
      note: `Tháng ${no} hết ngày ${lastDayOf(month)}/${pad(no)}`,
      rows
    },
    approvals: { total: requests.length, month: inMonth.length, items: inMonth.slice(0, APPROVAL_ROWS) },
    kpis,
    upcoming: upcoming({ month, today: todayOf(serverNow), paydayExpected, holidays }),
    periodCard
  };
}

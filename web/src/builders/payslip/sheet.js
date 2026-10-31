// Đổi phiếu một người của máy chủ (đã qua buildDrawer) sang bản in A4: đầu phiếu, chấm công từng ngày, bảng tổng hợp.
// Các dòng tiền là dòng của ngăn kéo (cộng đúng Tổng thu nhập); cột "Theo quy chế" để trống vì máy chủ không trả.
const two = n => String(n).padStart(2, '0');
const lastDay = month => new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).getUTCDate();

// Loại ngày của máy chủ → loại ngày của bản in; ngày không có lương và không phải ngày nghỉ khai thì bỏ khỏi bảng
const DAY_KIND = {
  work: 'work',
  makeup: 'work',
  leave: 'leave',
  isat: 'isat',
  holiday: 'holiday',
  unpaid: 'unpaid',
  noshow: 'unpaid'
};

function dayOf(r) {
  const kind = DAY_KIND[r.kind];
  if (!kind) return r.pay > 0 ? dayOf({ ...r, kind: 'work' }) : null;
  const work = kind === 'work';
  return {
    date: r.date,
    kind,
    shift: work ? r.shift || 'normal' : '',
    in: work ? r.punchIn || r.in || '' : '',
    out: work ? r.punchOut || r.out || '' : '',
    hours: r.hours || 0,
    daily: r.daily ? Math.round(r.daily) : 0,
    bonus: r.bonus ? Math.round(r.bonus) : 0,
    breakPay: r.breakPay ? Math.round(r.breakPay) : 0,
    otH: r.otH || 0,
    otPay: r.otPay ? Math.round(r.otPay) : 0,
    otUntil: '',
    cut: r.cut ? Math.round(r.cut) : 0,
    total: r.pay || 0
  };
}

/** drawer: kết quả buildDrawer; data: GET /periods/:month/(payslips|estimates)/:username. */
export function buildSheet(drawer, data) {
  const slip = data.payslip;
  const month = drawer.month;
  const rows = (slip.snapshot && slip.snapshot.rows) || [];
  const days = rows.map(dayOf).filter(Boolean);
  const c = slip.cells || {};
  const snap = slip.snapshot || {};
  const official = drawer.kind === 'official';
  const estimate = drawer.kind === 'estimate';
  const net = snap.net || {};
  const totals = [
    { label: 'Tổng thu nhập', value: slip.gross, k: true },
    { label: 'Các khoản miễn thuế', value: slip.exempt || 0, k: false },
    { label: 'Thu nhập chịu thuế', value: slip.taxable || 0, k: false },
    { label: 'Bảo hiểm bắt buộc (BHXH, BHYT, BHTN)', value: slip.insurance || 0, k: false },
    { label: 'Thu nhập sau bảo hiểm', value: slip.afterInsurance || 0, k: true },
    { label: 'Thuế TNCN', value: slip.tax || 0, k: false },
    { label: 'Tạm ứng', value: slip.advance || 0, k: false }
  ];
  if (net.entriesDeduct) totals.push({ label: 'Khoản trừ thêm', value: net.entriesDeduct, k: false });
  return {
    month,
    username: drawer.username,
    name: drawer.name,
    role: drawer.role,
    status: official ? 'Chính thức' : estimate ? 'Chưa tính lương' : 'Bản nháp',
    kind: drawer.kind,
    badge: official
      ? { cls: 'p-done', label: 'Phiếu lương chính thức' }
      : estimate
        ? { cls: 'p-pend', label: 'Chưa tính lương' }
        : { cls: 'p-draft', label: 'Bản nháp · chưa phải lương chính thức' },
    note: official ? '' : estimate ? '' : 'bản nháp, chưa phải lương chính thức',
    from: `${month}-01`,
    to: `${month}-${two(lastDay(month))}`,
    stdDays: slip.workdaysStd,
    days,
    stats: {
      count: c.workDays || 0,
      flex: days.filter(d => d.shift === 'flex').length,
      night: days.filter(d => d.shift === 'night').length,
      leave: c.leaveDays || 0,
      isat: c.isatDays || 0,
      unpaid: c.unpaidDays || 0,
      otHours: snap.otHours || 0,
      short: snap.short || 0
    },
    sections: drawer.groups
      .filter(g => g.title !== 'Khấu trừ')
      .map(g => ({
        title: g.title,
        rows: g.lines.map(l => ({ label: l.label, std: null, act: l.v, b: false }))
      })),
    totals,
    net: slip.net,
    leaveLeft: '—'
  };
}

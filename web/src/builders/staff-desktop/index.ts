// Đổi phản hồi của máy chủ (GET /me, /punch, /sheet, /me/estimate) về dạng dữ liệu mà màn nhân viên máy tính đọc.
// Chỉ chọn dòng, đặt nhãn và định dạng giờ; số tiền, số phút, trạng thái công đều là số máy chủ gửi.
import { addMonths, dayLong, dm, dowShort, initials } from '@/utils/format';

const VN_MS = 7 * 3600000; // giờ Việt Nam = UTC+7
const pad = (n?) => String(n).padStart(2, '0');
const isNum = (v?) => typeof v === 'number' && Number.isFinite(v);
const vnDate = (iso?) => new Date(Date.parse(iso) + VN_MS).toISOString().slice(0, 10);
export const vnHm = (iso?) => new Date(Date.parse(iso) + VN_MS).toISOString().slice(11, 16);
const spanText = (min?) => `${Math.floor(min / 60)} giờ ${min % 60} phút`;
const dowOf = (date?) => new Date(`${date}T00:00:00Z`).getUTCDay();
const daysIn = (month?) => new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).getUTCDate();

// Sáu nhãn chấm công theo mã trạng thái của máy chủ
export const STATUS_LABEL = {
  'checked-in': 'Đã Check-in',
  'checked-out': 'Đã Check-out',
  pending: 'Chờ xử lý',
  approved: 'Được phê duyệt',
  rejected: 'Bị từ chối',
  admin: 'Đã chấm công (Admin)'
};
const STATUS_PILL = {
  'checked-in': 'p-gold',
  'checked-out': 'p-done',
  pending: 'p-pend',
  approved: 'p-done',
  rejected: 'p-err',
  admin: 'p-ai'
};
const MISSING = new Set<any>(['forgot-in', 'forgot-out', 'review', 'off-shift']);

export const serverTodayOf = (meRes?) => vnDate(meRes.serverNow);

/** Ngày công của một lượt: ngày bắt đầu ca (ca đêm qua nửa đêm vẫn thuộc ngày trước). */
const workDateOf = (s?) => (s.entry && s.entry.plannedShift && s.entry.plannedShift.date) || s.date || '';

function sessionsByDate(sheet?) {
  const map = new Map<any, any>();
  for (const s of Array.isArray(sheet && sheet.attendanceSessions) ? sheet.attendanceSessions : []) {
    const date = workDateOf(s);
    if (!date) continue;
    if (!map.has(date)) map.set(date, []);
    map.get(date).push(s);
  }
  for (const list of map.values())
    list.sort((a: any, b: any) =>
      String((a.entry || {}).presIn || '').localeCompare(String((b.entry || {}).presIn || ''))
    );
  return map;
}

const shiftName = (shiftConfig?, code?) => {
  const s = shiftConfig && shiftConfig.shifts && shiftConfig.shifts[code];
  return s ? `${s.name} · ${s.start}–${s.end}` : code || 'Chưa gán ca';
};

export function buildMe(meRes?) {
  const u = meRes.user || {};
  return {
    initials: initials(u.name),
    name: u.name || u.username,
    short: u.givenName || u.name || u.username,
    roleLine: meRes.positionLabel || '',
    username: u.username
  };
}

export function buildProfile(meRes?, shiftConfig?) {
  const u = meRes.user || {};
  const sch = meRes.schedule || null;
  return {
    fullName: u.name || u.username,
    username: u.username,
    roleLine: meRes.positionLabel || '',
    shiftName: u.shiftCode ? shiftName(shiftConfig, u.shiftCode) : 'Chưa gán ca',
    schedule: (sch && sch.label) || '',
    startDate: u.startDate || '',
    leaveLeft: isNum(u.leaveBalance) ? u.leaveBalance : null,
    account: u.locked ? 'Đã khoá' : 'Đang dùng'
  };
}

/** Khối "hôm nay": lời chào, ca, nút Check-in/out, tuần này, các ngày gần đây. */
export function buildHome({ meRes, punch, sheet }: any) {
  const u = meRes.user || {};
  const nowIso = punch.serverNow || meRes.serverNow;
  const today = vnDate(nowIso);
  const hour = Number(vnHm(nowIso).slice(0, 2));
  const part = hour < 11 ? 'sáng' : hour < 14 ? 'trưa' : hour < 18 ? 'chiều' : 'tối';
  const open = punch.openSession || null;
  const entry = (open && open.entry) || {};
  const planned = entry.plannedShift || null;
  const name = shiftName(punch.shiftConfig, planned ? planned.code : u.shiftCode);
  const nowHm = vnHm(nowIso);

  const shift: Record<string, any> = { name };
  if (open) {
    const sinceMin = entry.presIn
      ? Math.max(0, Math.round((Date.parse(nowIso) - Date.parse(entry.presIn)) / 60000))
      : 0;
    const startMs = planned ? Date.parse(planned.startIso) : NaN;
    const diff =
      Number.isFinite(startMs) && entry.presIn ? Math.round(startMs / 60000 - Date.parse(entry.presIn) / 60000) : 0;
    const first: any[] = [{ t: `Vào ${entry.presIn ? vnHm(entry.presIn) : ''} ` }];
    if (diff > 0) first.push({ t: `· sớm ${diff} phút`, tone: 'dim' });
    else if (diff < 0) first.push({ t: `· muộn ${-diff} phút`, tone: 'dim' });
    shift.status = { text: 'Đang trong ca', tone: 'on' };
    shift.meta = [first, [{ t: `Đã làm ${spanText(sinceMin)}` }]];
    shift.cta = { kind: 'out', label: 'Check-out', hint: `· ${nowHm}` };
  } else {
    const done = lastDoneToday(sheet, today);
    shift.status = { text: done ? 'Đã xong ca' : 'Chưa vào ca', tone: 'idle' };
    shift.meta = done
      ? [[{ t: `Vào ${done.inHm} · Ra ${done.outHm}` }]]
      : punch.canCheckIn === false && punch.checkInBlock
        ? [[{ t: punch.checkInBlock, tone: 'mid' }]]
        : [[{ t: '' }]];
    shift.cta = {
      kind: 'in',
      label: 'Check-in',
      hint: `· ${nowHm}`,
      gold: punch.canCheckIn !== false,
      disabled: punch.canCheckIn === false
    };
  }

  return {
    greeting: `Chào buổi ${part}, ${u.givenName || u.name || u.username}`,
    dateLine: `${dayLong(today)}/${today.slice(0, 4)} · ${meRes.positionLabel || ''}`,
    shift,
    week: buildWeek({ today, meRes, sheet }),
    recent: buildRecent(sheet, today)
  };
}

function lastDoneToday(sheet?, today?) {
  const list = (sessionsByDate(sheet).get(today) || []).filter(s => s.entry && s.entry.presIn && s.entry.presOut);
  const s = list[list.length - 1];
  return s ? { inHm: vnHm(s.entry.presIn), outHm: vnHm(s.entry.presOut) } : null;
}

function buildWeek({ today, meRes, sheet }: any) {
  const monday = new Date(Date.parse(`${today}T00:00:00Z`) - ((dowOf(today) + 6) % 7) * 86400000);
  const holidays = new Set<any>(meRes.holidays || []);
  const scheduled = new Set<any>((sheet && sheet.scheduledDates) || []);
  const report = (sheet && sheet.actualReport && sheet.actualReport.report) || {};
  const inMonth = (d?) => d.slice(0, 7) === (sheet && sheet.month);
  const week: any[] = [];
  for (let i = 0; i < 7; i++) {
    const date = new Date(monday.getTime() + i * 86400000).toISOString().slice(0, 10);
    const state = report[date] && report[date].state;
    let cls = '';
    if (date === today) cls = 'cur';
    else if (holidays.has(date)) cls = 'hol';
    else if (state && MISSING.has(state)) cls = 'miss';
    else if (inMonth(date) && !scheduled.has(date) && dowOf(date) !== 0) cls = 'off';
    week.push({ d: Number(date.slice(8, 10)), label: holidays.has(date) ? 'Lễ' : dowShort(date), cls });
  }
  return week;
}

function buildRecent(sheet?, today?) {
  const rows: any[] = [];
  for (const [date, list] of sessionsByDate(sheet)) {
    if (date >= today) continue;
    const ok = list.filter(s => s.entry && s.entry.presIn && s.entry.presOut);
    if (!ok.length) continue;
    rows.push({
      date,
      label: dayLong(date),
      range: `${vnHm(ok[0].entry.presIn)} – ${vnHm(ok[ok.length - 1].entry.presOut)}`
    });
  }
  rows.sort((a: any, b: any) => b.date.localeCompare(a.date));
  return rows.slice(0, 3).map(({ label, range }: any) => ({ label, range }));
}

/** Chi tiết một ngày: mọi lượt vào/ra (kể cả OT, giờ bù) và trạng thái công. */
export function buildDayPanel({ date, sheet, today }: any) {
  const title = dayLong(date);
  const list = sessionsByDate(sheet).get(date) || [];
  const report = (sheet && sheet.actualReport && sheet.actualReport.report && sheet.actualReport.report[date]) || null;
  if (!list.length) {
    return {
      title,
      sub: (report && report.note) || (date > today ? 'Chưa tới ngày' : 'Chưa có lượt Check-in nào được ghi nhận'),
      pill: null,
      action: false
    };
  }
  const lines = list.map((s, i) => {
    const e = s.entry || {};
    const range = `${e.presIn ? vnHm(e.presIn) : '--:--'} → ${e.presOut ? vnHm(e.presOut) : 'đang làm'}`;
    const mins = e.presIn && e.presOut ? Math.round((Date.parse(e.presOut) - Date.parse(e.presIn)) / 60000) : null;
    return `Lượt ${i + 1} · ${range}${mins != null ? ` · ${spanText(mins)}` : ''} · ${STATUS_LABEL[s.status] || ''}`;
  });
  const last = list[list.length - 1];
  const first = list[0].entry || {};
  const lastE = last.entry || {};
  const explainSessions = list.flatMap(s => {
    const e = s.entry || {};
    const kind = e.presIn && !e.presOut && e.reason === 'forgot-out' && !e.requestedOut
      ? 'punch-out'
      : (e.forgotIn || (!e.presIn && e.presOut)) ? 'punch-in' : null;
    return s.state === 'closed' && kind && !(s.explanations || []).some((x: any) => x.kind === kind)
      ? [{ sessionId: s.id, kind, date, prompt: kind === 'punch-in' ? 'Giải trình quên Check-in' : 'Giải trình quên Check-out' }]
      : [];
  });
  const head = `${title} · ${first.presIn ? vnHm(first.presIn) : '--:--'} → ${lastE.presOut ? vnHm(lastE.presOut) : 'đang làm'}`;
  const extra: any[] = [];
  if (report && report.late) extra.push(`vào muộn ${report.late} phút`);
  if (report && report.note) extra.push(report.note);
  return {
    title: head,
    sub: [...lines, ...(extra.length ? [extra.join(' · ')] : [])].join('  |  '),
    pill: STATUS_LABEL[last.status] ? { text: STATUS_LABEL[last.status], cls: STATUS_PILL[last.status] } : null,
    action: false,
    explainSessions
  };
}

const LEGEND = [
  { swatch: 'ok', text: 'Đủ công' },
  { swatch: 'hol', text: 'Ngày lễ' },
  { swatch: 'today', text: 'Hôm nay' },
  { swatch: 'fut', text: 'Chưa tới / chưa có dữ liệu' },
  { text: 'Bấm vào một ngày để xem giờ vào, ra' }
];

/** Lịch tháng + số liệu chấm công. */
function buildAttendance({ month, sheet, meRes, today, official }: any) {
  const holidays = new Set<any>(meRes.holidays || []);
  const scheduled = new Set<any>(sheet.scheduledDates || []);
  const report = (sheet.actualReport && sheet.actualReport.report) || {};
  const approvals = sheet.approvals || {};
  const byDate = sessionsByDate(sheet);
  const lead = (dowOf(`${month}-01`) + 6) % 7;
  const days: any[] = [];
  let okDays = 0;
  let lateMin = 0;
  let missing = 0;
  for (let d = 1; d <= daysIn(month); d++) {
    const date = `${month}-${pad(d)}`;
    const r = report[date] || null;
    const state = r && r.state;
    const ap = approvals[date] && approvals[date].status !== 'approved' ? approvals[date] : null;
    const day = { d, date, kind: 'fut', tag: '', tagCls: '' };
    const sess = byDate.get(date) || [];
    const hasExtra = sess.some(s => s.entry && (s.entry.kind === 'ot' || s.entry.kind === 'makeup'));
    if (date === today) {
      day.kind = 'today';
      day.tag = 'Hôm nay';
    } else if (state === 'ok' || state === 'declared-wins') {
      day.kind = 'ok';
      okDays += 1;
      lateMin += (r && r.late) || 0;
    } else if (state && MISSING.has(state)) {
      day.kind = 'miss';
      day.tag = 'Thiếu';
      missing += 1;
    } else if (state === 'absent') {
      day.kind = 'miss';
      day.tag = 'Vắng';
      missing += 1;
    } else if (ap) {
      day.kind = ap.status === 'rejected' ? 'miss' : 'pend';
      day.tag = ap.status === 'rejected' ? 'Từ chối' : 'Chờ';
    } else if (sess.some(s => s.status === 'pending')) {
      day.kind = 'pend';
      day.tag = 'Chờ';
    } else if (holidays.has(date)) {
      day.kind = 'hol';
      day.tag = 'Lễ';
    } else if (dowOf(date) === 0) day.kind = 'sun';
    else if (!scheduled.has(date)) day.kind = 'off2';
    if (hasExtra && day.kind === 'ok') {
      const k = sess.find(s => s.entry && (s.entry.kind === 'ot' || s.entry.kind === 'makeup')).entry.kind;
      day.tag = k === 'ot' ? 'OT' : 'BÙ';
      day.tagCls = 'tag';
    }
    days.push(day);
  }
  const mm = month.slice(5, 7);
  return {
    title: `Chấm công tháng ${Number(mm)}`,
    cap: official
      ? { text: 'Chính thức', tone: 'done' }
      : { text: month === today.slice(0, 7) ? 'Tháng đang diễn ra' : 'Chưa chốt', tone: 'est' },
    stats: [
      { value: okDays, label: 'Ngày đủ công' },
      { value: lateMin, label: 'Phút đi trễ' },
      { value: missing, label: 'Thiếu chấm, vắng', bad: missing > 0 }
    ],
    lead,
    days,
    legend: LEGEND,
    defaultDate: null,
    defaultPanel: null
  };
}

const grp = (label?, lines?) => ({ label, lines, total: lines.reduce((s, l) => s + l.value, 0) });

/** Khoản điền thêm: mỗi khoản một dòng khi các khoản cộng đúng số tổng của máy chủ, lệch thì một dòng tổng. Giá trị dương, hướng của khoản quyết định dấu ở nơi gọi. */
function entryLines(direction?, total?, label?, entries?) {
  if (!isNum(total)) return [];
  const items = (Array.isArray(entries) ? entries : []).filter(e => e && e.direction === direction && isNum(e.amount));
  if (items.length && items.reduce((s, e) => s + e.amount, 0) === total)
    return items.map(e => ({ label: String(e.slipLine || e.label || label), value: e.amount }));
  return [{ label, value: total }];
}

/** Khối thu nhập từ GET /me/estimate?month= (số của máy chủ). null khi tháng chưa có số. */
function buildIncome({ month, est }: any) {
  const mm = Number(month.slice(5, 7));
  const base: Record<string, any> = { title: `Thu nhập tháng ${mm}`, lock: null, alert: null, links: [] };
  if (!est || est.estimate === null || !est.net) {
    return {
      ...base,
      netLabel: 'Thực nhận',
      net: null,
      estimated: true,
      note: '',
      rows: [],
      breakdown: { groups: [], netLabel: 'Thực nhận', net: null },
      links: []
    };
  }
  const official = !!est.official;
  const m = est.m || {};
  const net = est.net || {};
  const trace = est.trace || {};
  const income: any[] = [];
  const add = (label?, value?, small?) => {
    if (isNum(value)) income.push({ label, value, ...(small ? { small } : {}) });
  };
  add('Tiền ngày công', trace.tienNgayCong, isNum(m.count) ? [`${m.count} ngày công`] : undefined);
  add('Phụ cấp ca', trace.phuCapCa);
  add('Giờ nghỉ đêm', trace.gioNghiDem);
  add('Làm bù', trace.lamBu);
  add('Tiền OT', trace.tienOt);
  add('Làm ngày lễ', trace.tienLamLe);
  add('Quyết toán phép dư', trace.quyetToanPhepDu ?? m.settlePay);
  add('Phụ cấp đi lại', trace.phuCapDiLai ?? m.travel);
  add('Phụ cấp chuyên cần', trace.phuCapChuyenCan ?? m.attendance);
  for (const b of Array.isArray(m.blocks) ? m.blocks : []) add(String(b.label || 'Khoản thêm'), b.amount);
  entryLines('add', net.entriesAdd, 'Khoản cộng thêm', m.entries).forEach(l => add(l.label, l.value));
  const hasKpi = m.kpiAmt !== undefined && m.kpiAmt !== null;
  const kpiValue = trace.luongKpi ?? m.kpiPay;
  if (hasKpi && isNum(kpiValue)) income.push({ label: 'Lương KPI', value: kpiValue });

  const ded: any[] = [];
  const sub = (label?, value?, small?) => {
    if (isNum(value)) ded.push({ label, value: -Math.abs(value), ...(small ? { small } : {}) });
  };
  const split = [net.bhxh, net.bhyt, net.bhtn];
  if (
    split.some(isNum) &&
    (!isNum(net.insurance) || split.reduce((s, v) => s + (isNum(v) ? v : 0), 0) === net.insurance)
  ) {
    sub('Bảo hiểm xã hội', net.bhxh);
    sub('Bảo hiểm y tế', net.bhyt);
    sub('Bảo hiểm thất nghiệp', net.bhtn);
  } else sub('Bảo hiểm', net.insurance);
  sub('Thuế TNCN', net.tax);
  sub('Tạm ứng', net.advance);
  entryLines('deduct', net.entriesDeduct, 'Khoản trừ thêm', m.entries).forEach(l => sub(l.label, l.value));

  const grossTotal = isNum(net.gross)
    ? net.gross
    : income.length
      ? income.reduce((s, l) => s + l.value, 0)
      : null;
  // net.entriesDeduct chỉ được gửi khi có khoản; absence mang nghĩa không có khoản nào.
  const deductionEntries = net.entriesDeduct === undefined ? 0 : net.entriesDeduct;
  const deductionValues = [net.insurance, net.tax, net.advance, deductionEntries];
  const dedTotal = deductionValues.every(isNum)
    ? -deductionValues.reduce((total, value) => total + value, 0)
    : null;
  const st = est.allowanceStatus;
  const rows: any[] = [
    { label: 'Thu nhập', value: grossTotal },
    { label: 'Các khoản trừ', value: dedTotal, signed: true }
  ];
  if (st && st.hasAttendance) {
    const small: any[] = [];
    if (isNum(st.absentDays) && isNum(st.maxAbsent)) small.push(`Đã nghỉ ${st.absentDays}/${st.maxAbsent} ngày`);
    if (isNum(st.overLimitHours) && isNum(st.overLimitThreshold))
      small.push(`vượt ${st.overLimitHours}/${st.overLimitThreshold} giờ`);
    rows.push({
      label: 'Phụ cấp chuyên cần',
      small,
      text: st.kept === false ? 'Đã mất' : official ? 'Đã giữ' : 'Đang giữ',
      tone: 'mid'
    });
  }
  if (hasKpi && isNum(kpiValue)) rows.push({ label: 'Lương KPI', value: kpiValue });

  const netValue = isNum(net.net)
    ? net.net
    : grossTotal != null && dedTotal != null
      ? grossTotal + dedTotal
      : null;
  return {
    ...base,
    netLabel: 'Thực nhận',
    net: netValue,
    estimated: !official,
    note: official
      ? est.period && est.period.status === 'paid'
        ? 'Phiếu lương chính thức · đã trả lương'
        : 'Phiếu lương chính thức'
      : isNum(m.count)
        ? `Tính trên ${m.count} ngày công`
        : '',
    lock: official ? 'Không còn thay đổi' : null,
    rows,
    breakdown: {
      groups: [grp('Thu nhập', income), ...(ded.length ? [grp('Các khoản trừ', ded)] : [])].map(g =>
        g.label === 'Thu nhập' ? { ...g, total: grossTotal } : { ...g, total: dedTotal }
      ),
      netLabel: 'Thực nhận',
      net: netValue
    },
    links: official ? ['calc', 'a4'] : ['calc']
  };
}

/** KPI tự đánh giá của tháng đã có số: đọc từ phần ước tính của chính mình. null khi chưa có. */
function buildKpi({ month, est, today }: any) {
  const m = est && est.m;
  if (!m || m.kpiAmt === undefined || m.kpiAmt === null || month >= today.slice(0, 7)) return null;
  const rows: any[] = [];
  if (isNum(m.kpiSelfPct)) rows.push({ label: 'Tự đánh giá', text: `${m.kpiSelfPct}%` });
  if (isNum(m.kpiSelfAmt)) rows.push({ label: 'Lương KPI tối đa', value: m.kpiSelfAmt });
  const kpiPay = est.trace && isNum(est.trace.luongKpi) ? est.trace.luongKpi : m.kpiPay;
  if (isNum(kpiPay)) rows.push({ label: 'Lương KPI', value: kpiPay });
  return { title: `KPI tháng ${Number(month.slice(5, 7))}`, cap: est.official ? 'Đã chốt cùng phiếu lương' : '', rows };
}

/** Tháng đầu tiên xem được: tháng của ngày bắt đầu làm, không có thì 12 tháng trước tháng hiện tại. */
export function firstMonthOf(meRes?, current?) {
  const start = meRes.user && meRes.user.startDate;
  return /^\d{4}-\d{2}/.test(start || '') ? start.slice(0, 7) : addMonths(current, -12);
}

export function buildMonth({ month, current, meRes, sheet, est }: any) {
  const today = serverTodayOf(meRes);
  const first = firstMonthOf(meRes, current);
  const official = !!(est && est.official);
  return {
    month,
    prev: month > first ? addMonths(month, -1) : null,
    next: month < current ? addMonths(month, 1) : null,
    attendance: buildAttendance({ month, sheet, meRes, today, official }),
    income: buildIncome({ month, est }),
    kpi: buildKpi({ month, est, today })
  };
}

export { dm };
